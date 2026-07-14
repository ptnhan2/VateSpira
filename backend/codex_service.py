"""Supabase CRUD wrapper cho novels table (codex structured data).

Wraps Python `supabase` client cho create/list/get operations trên
`novels` table. Dùng service role key (bypass RLS) + application-layer
user_id filtering để enforce multi-tenant isolation (ADR-008).

See: docs/ARCHITECTURE.md Section 3.1 (ERD — novels table),
     docs/ARCHITECTURE.md Section 7.2 (API Contracts)
"""

import os
from typing import Any

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


def create_novel(
    user_id: str,
    title: str,
    language: str = "vi",
    pov: str | None = None,
    tense: str | None = None,
    technique: str = "save-the-cat",
) -> dict[str, Any]:
    """Tạo novel mới trong Supabase `novels` table.

    Args:
        user_id: UUID của user (từ runtime.context, multi-tenant isolation).
        title: Tiêu đề novel.
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
        "language": language,
        "pov": pov,
        "tense": tense,
        "technique": technique,
    }
    result = client.table("novels").insert(payload).execute()
    return result.data[0]


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
