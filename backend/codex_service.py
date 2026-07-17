"""Supabase CRUD wrapper cho novels table (codex structured data).

Wraps Python `supabase` client cho create/list/get operations trên
`novels` table. Dùng service role key (bypass RLS) + application-layer
user_id filtering để enforce multi-tenant isolation (ADR-008).

See: docs/ARCHITECTURE.md Section 3.1 (ERD — novels table),
     docs/ARCHITECTURE.md Section 7.2 (API Contracts)
"""

import functools
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from supabase import Client, create_client

_client: Client | None = None


def _get_client() -> Client:
    """Lấy (hoặc tạo) Supabase client singleton từ env vars.

    Client dùng service role key (bypass RLS); multi-tenant isolation
    được enforce tại application layer qua user_id filtering trong từng
    CRUD function.

    Returns:
        Supabase Client instance từ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

    Raises:
        RuntimeError: Nếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY chưa cấu hình.
    """
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY phải được cấu hình "
            "trong environment variables."
        )
    _client = create_client(url, key)
    return _client


def _retry_on_httpx_error(max_retries: int = 2, base_delay: float = 0.5):
    """Decorator retry khi httpx.ReadError (Windows socket issue trong agent runtime).

    Agent runtime gọi @tool qua run_in_executor (thread pool). Sync httpx.Client
    dùng từ thread khác có thể gặp WinError 10035 (WSAEWOULDBLOCK) — non-blocking
    socket conflict giữa async event loop và sync client. Retry 2 lần với delay
    tăng dần xử lý transient issue.

    Args:
        max_retries: Số lần retry (default 2).
        base_delay: Delay cơ bản (giây), nhân với (attempt+1) (default 0.5).

    Returns:
        Decorator function.
    """

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last_error: Exception | None = None
            for attempt in range(max_retries + 1):
                try:
                    return fn(*args, **kwargs)
                except httpx.ReadError as e:
                    last_error = e
                    if attempt < max_retries:
                        time.sleep(base_delay * (attempt + 1))
            assert last_error is not None
            raise last_error

        return wrapper

    return decorator


@_retry_on_httpx_error()
def create_novel(
    user_id: str,
    title: str,
    genre: str | None = None,
    language: str = "vi",
    pov: str | None = None,
    tense: str | None = None,
    technique: str = "save-the-cat",
) -> dict[str, Any]:
    """Tạo novel mới trong Supabase `novels` table.

    Args:
        user_id: UUID của user (từ runtime.context, multi-tenant isolation).
        title: Tiêu đề novel.
        genre: Thể loại, vd 'fantasy', 'sci-fi' (nullable).
        language: Mã ngôn ngữ (default 'vi').
        pov: Point of view, vd 'first', 'third-limited' (nullable).
        tense: Thì kể, vd 'past', 'present' (nullable).
        technique: Structure technique (default 'save-the-cat').

    Returns:
        Dict chứa novel record vừa tạo (id, user_id, title, ...).

    Raises:
        Exception: Nếu Supabase insert thất bại.
    """
    client = _get_client()
    payload = {
        "user_id": user_id,
        "title": title,
        "genre": genre,
        "language": language,
        "pov": pov,
        "tense": tense,
        "technique": technique,
    }
    result = client.table("novels").insert(payload).execute()
    return result.data[0]


@_retry_on_httpx_error()
def list_novels(user_id: str) -> list[dict[str, Any]]:
    """Liệt kê tất cả novels của một user, sắp xếp mới nhất trước.

    Args:
        user_id: UUID của user (lọc theo user_id cho RLS-equivalent isolation).

    Returns:
        List các dict novel record, sắp xếp theo created_at giảm dần.
    """
    client = _get_client()
    result = (
        client.table("novels")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@_retry_on_httpx_error()
def get_novel(novel_id: str, user_id: str) -> dict[str, Any] | None:
    """Lấy một novel theo id, chỉ nếu thuộc user.

    Args:
        novel_id: UUID của novel cần lấy.
        user_id: UUID của user (lọc để enforce ownership).

    Returns:
        Dict novel record nếu tìm thấy, None nếu không tồn tại hoặc không thuộc user.
    """
    client = _get_client()
    result = (
        client.table("novels")
        .select("*")
        .eq("id", novel_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


@_retry_on_httpx_error()
def init_beats(novel_id: str, beat_names: list[str]) -> list[dict[str, Any]]:
    """Khởi tạo 15 beat rows cho novel theo Save the Cat structure.

    Idempotent: nếu beats đã tồn tại cho novel_id (bất kỳ số lượng), trả về
    existing rows (không insert trùng). Mỗi row có beat_number (1-N),
    beat_name từ beat_names, content=None, status='empty'.

    Args:
        novel_id: UUID của novel cần khởi tạo beats.
        beat_names: List tên beat theo thứ tự (vd SAVE_THE_CAT_BEATS).

    Returns:
        List các dict beat record vừa tạo hoặc existing.
    """
    client = _get_client()
    existing = (
        client.table("beats")
        .select("*")
        .eq("novel_id", novel_id)
        .execute()
    )
    if existing.data:
        return existing.data
    rows = [
        {
            "novel_id": novel_id,
            "beat_number": i + 1,
            "beat_name": name,
            "content": None,
            "status": "empty",
        }
        for i, name in enumerate(beat_names)
    ]
    result = client.table("beats").insert(rows).execute()
    return result.data


@_retry_on_httpx_error()
def list_beats(novel_id: str, user_id: str) -> list[dict[str, Any]]:
    """Liệt kê 15 beats của novel, verify ownership qua join novels.

    Args:
        novel_id: UUID của novel cần list beats.
        user_id: UUID của user (lọc để enforce ownership).

    Returns:
        List các dict beat record sắp xếp theo beat_number, [] nếu không
        tìm thấy hoặc không thuộc user.
    """
    client = _get_client()
    result = (
        client.table("beats")
        .select("*, novels!inner(user_id)")
        .eq("novel_id", novel_id)
        .eq("novels.user_id", user_id)
        .order("beat_number")
        .execute()
    )
    return result.data


@_retry_on_httpx_error()
def update_beat(
    novel_id: str, beat_number: int, content: str, user_id: str
) -> dict[str, Any] | None:
    """Cập nhật content + status='filled' cho một beat.

    Verify ownership: novel phải thuộc user (qua get_novel). Nếu không
    thuộc user → return None (không update).

    Args:
        novel_id: UUID của novel chứa beat.
        beat_number: Số thứ tự beat (1-15).
        content: Nội dung beat mới.
        user_id: UUID của user (enforce ownership).

    Returns:
        Dict beat record đã update, hoặc None nếu novel không thuộc user
        hoặc beat không tồn tại.
    """
    if get_novel(novel_id, user_id) is None:
        return None
    client = _get_client()
    result = (
        client.table("beats")
        .update({"content": content, "status": "filled"})
        .eq("novel_id", novel_id)
        .eq("beat_number", beat_number)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


@_retry_on_httpx_error()
def list_scenes(novel_id: str, user_id: str) -> list[dict[str, Any]]:
    """Liệt kê tất cả scenes của novel, verify ownership qua join novels.

    Args:
        novel_id: UUID của novel cần list scenes.
        user_id: UUID của user (lọc để enforce ownership).

    Returns:
        List các dict scene record sắp xếp theo beat_id, scene_number,
        [] nếu không tìm thấy hoặc không thuộc user.
    """
    client = _get_client()
    result = (
        client.table("scenes")
        .select("*, novels!inner(user_id)")
        .eq("novel_id", novel_id)
        .eq("novels.user_id", user_id)
        .order("beat_id")
        .order("scene_number")
        .execute()
    )
    return result.data


@_retry_on_httpx_error()
def create_scene(
    novel_id: str,
    beat_id: str,
    title: str,
    summary: str | None,
    user_id: str,
    outline: str | None = None,
) -> dict[str, Any] | None:
    """Tạo scene mới trong beat, auto-calc scene_number.

    Verify ownership: novel phải thuộc user (qua get_novel). Auto-calc
    scene_number = số scene hiện có trong beat + 1. Insert row với
    status='empty'.

    Args:
        novel_id: UUID của novel chứa scene.
        beat_id: UUID của beat chứa scene.
        title: Tiêu đề scene (bắt buộc).
        summary: Tóm tắt 1-2 câu (nullable).
        user_id: UUID của user (enforce ownership).
        outline: Dàn ý chi tiết scene (nullable, UF-4b scope expansion).

    Returns:
        Dict scene record vừa tạo, hoặc None nếu novel không thuộc user.
    """
    if get_novel(novel_id, user_id) is None:
        return None
    client = _get_client()
    existing = (
        client.table("scenes")
        .select("id")
        .eq("novel_id", novel_id)
        .eq("beat_id", beat_id)
        .execute()
    )
    scene_number = len(existing.data) + 1
    payload = {
        "novel_id": novel_id,
        "beat_id": beat_id,
        "scene_number": scene_number,
        "title": title,
        "summary": summary,
        "outline": outline,
        "status": "empty",
    }
    result = client.table("scenes").insert(payload).execute()
    return result.data[0]


@_retry_on_httpx_error()
def update_scene(
    scene_id: str,
    title: str,
    summary: str | None,
    user_id: str,
    outline: str | None = None,
) -> dict[str, Any] | None:
    """Cập nhật title + summary + outline cho một scene.

    Verify ownership: scene phải thuộc user (qua join novels). Nếu không
    thuộc user → return None (không update).

    Args:
        scene_id: UUID của scene cần update.
        title: Tiêu đề scene mới.
        summary: Tóm tắt mới (nullable).
        user_id: UUID của user (enforce ownership).
        outline: Dàn ý chi tiết mới (nullable, UF-4b scope expansion).

    Returns:
        Dict scene record đã update, hoặc None nếu scene không tồn tại
        hoặc không thuộc user.
    """
    client = _get_client()
    check = (
        client.table("scenes")
        .select("*, novels!inner(user_id)")
        .eq("id", scene_id)
        .eq("novels.user_id", user_id)
        .execute()
    )
    if not check.data:
        return None
    result = (
        client.table("scenes")
        .update({"title": title, "summary": summary, "outline": outline})
        .eq("id", scene_id)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


@_retry_on_httpx_error()
def create_chapter(
    novel_id: str,
    chapter_number: int,
    title: str,
    content: str,
    user_id: str,
) -> dict[str, Any] | None:
    """Tạo hoặc cập nhật chapter metadata trong Supabase chapters table.

    Upsert theo (novel_id, chapter_number): nếu chapter đã tồn tại với
    số thứ tự này → update title + word_count + status='draft'; nếu chưa
    → insert row mới. Word_count tự động tính từ content (len của split).
    Verify ownership: novel phải thuộc user (qua get_novel).

    Args:
        novel_id: UUID của novel chứa chapter.
        chapter_number: Số thứ tự chapter (1, 2, 3, ...).
        title: Tiêu đề chapter.
        content: Nội dung prose (chỉ dùng để calc word_count, không lưu
            vào DB — prose lưu trong StoreBackend qua write_file).
        user_id: UUID của user (enforce ownership).

    Returns:
        Dict chapter record vừa tạo/update, hoặc None nếu novel không
        thuộc user.
    """
    if get_novel(novel_id, user_id) is None:
        return None
    client = _get_client()
    word_count = len(content.split()) if content else 0
    existing = (
        client.table("chapters")
        .select("id")
        .eq("novel_id", novel_id)
        .eq("number", chapter_number)
        .execute()
    )
    if existing.data:
        result = (
            client.table("chapters")
            .update(
                {
                    "title": title,
                    "word_count": word_count,
                    "status": "draft",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        result = client.table("chapters").insert(
            {
                "novel_id": novel_id,
                "number": chapter_number,
                "title": title,
                "status": "draft",
                "word_count": word_count,
            }
        ).execute()
    return result.data[0]


@_retry_on_httpx_error()
def list_chapters(novel_id: str, user_id: str) -> list[dict[str, Any]]:
    """Liệt kê tất cả chapters của novel, verify ownership qua join novels.

    Args:
        novel_id: UUID của novel cần list chapters.
        user_id: UUID của user (lọc để enforce ownership).

    Returns:
        List các dict chapter record sắp xếp theo number, [] nếu không
        tìm thấy hoặc không thuộc user.
    """
    client = _get_client()
    result = (
        client.table("chapters")
        .select("*, novels!inner(user_id)")
        .eq("novel_id", novel_id)
        .eq("novels.user_id", user_id)
        .order("number")
        .execute()
    )
    return result.data


@_retry_on_httpx_error()
def get_chapter(
    novel_id: str, chapter_number: int, user_id: str
) -> dict[str, Any] | None:
    """Lấy một chapter theo số thứ tự, verify ownership qua join novels.

    Args:
        novel_id: UUID của novel chứa chapter.
        chapter_number: Số thứ tự chapter cần lấy.
        user_id: UUID của user (lọc để enforce ownership).

    Returns:
        Dict chapter record nếu tìm thấy, None nếu không tồn tại hoặc
        không thuộc user.
    """
    client = _get_client()
    result = (
        client.table("chapters")
        .select("*, novels!inner(user_id)")
        .eq("novel_id", novel_id)
        .eq("number", chapter_number)
        .eq("novels.user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


RUBRIC_STATUS_TO_CHAPTER_STATUS = {
    "satisfied": "final",
    "needs_revision": "revised",
    "max_iterations_reached": "revised",
    "failed": "draft",
    "grader_error": "draft",
}
"""Mapping rubric result → chapter status cho UF-4b route.

RubricMiddleware chấm xong → route đọc _rubric_status → tra mapping →
gọi update_chapter_status. grader_error → 'draft' (không xác định chất
lượng, giữ nguyên draft).
"""


@_retry_on_httpx_error()
def update_chapter_status(
    chapter_id: str, status: str, user_id: str
) -> dict[str, Any] | None:
    """Cập nhật status cho một chapter, verify ownership qua join novels.

    Args:
        chapter_id: UUID của chapter cần update.
        status: Status mới ('draft', 'final', 'revised').
        user_id: UUID của user (enforce ownership).

    Returns:
        Dict chapter record đã update, hoặc None nếu chapter không tồn tại
        hoặc không thuộc user.
    """
    client = _get_client()
    check = (
        client.table("chapters")
        .select("*, novels!inner(user_id)")
        .eq("id", chapter_id)
        .eq("novels.user_id", user_id)
        .execute()
    )
    if not check.data:
        return None
    result = (
        client.table("chapters")
        .update(
            {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
        )
        .eq("id", chapter_id)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


@_retry_on_httpx_error()
def save_rubric_evaluation(
    novel_id: str,
    chapter_id: str,
    result: str,
    criteria_json: list[dict[str, Any]] | None,
    user_id: str,
) -> dict[str, Any] | None:
    """Lưu rubric evaluation vào rubric_evaluations table.

    chapter_id được lưu vào cột rubric_id (table không có cột chapter_id
    riêng — xem migration 00001). Verify ownership: novel phải thuộc user.

    Args:
        novel_id: UUID của novel chứa chapter được đánh giá.
        chapter_id: UUID của chapter được đánh giá (lưu vào rubric_id).
        result: Kết quả rubric ('satisfied', 'needs_revision', 'failed',
            'max_iterations_reached', 'grader_error').
        criteria_json: List các criterion verdict (từ RubricEvaluation.criteria).
        user_id: UUID của user (enforce ownership).

    Returns:
        Dict rubric_evaluation record vừa tạo, hoặc None nếu novel không
        thuộc user.
    """
    if get_novel(novel_id, user_id) is None:
        return None
    client = _get_client()
    payload = {
        "novel_id": novel_id,
        "rubric_id": chapter_id,
        "result": result,
        "criteria": criteria_json or [],
    }
    insert_result = client.table("rubric_evaluations").insert(payload).execute()
    return insert_result.data[0]
