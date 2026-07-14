"""VateSpira novel-writing harness agent.

Agent deepagents chat-centric cho tác giả tiểu thuyết.
- Manuscript = files (StoreBackend, built-in file tools)
- Codex = structured (Postgres, custom @tools)
- HITL approval trước khi sửa manuscript
- RubricMiddleware self-eval (runtime quality loop)
- BYOK per-request qua @wrap_model_call

See: docs/ARCHITECTURE.md
"""

import json
from typing import Any

from deepagents import FilesystemPermission, create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.profiles.provider.provider_profiles import apply_provider_profile
from langchain.agents.middleware.types import AgentMiddleware
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import tool
from langgraph.prebuilt import ToolRuntime

import codex_service

WRITING_COLLABORATOR_PROMPT = """\
You are VateSpira, a writing collaborator for novelists.

## Core Behavior
- Be concise, warm, literary. You help authors craft their novel.
- You have access to: codex (characters/locations/timeline/lore via custom tools), \
manuscript (chapters via file tools), memory (novel bible), and skills (writing techniques).
- BEFORE editing manuscript, you MUST get user approval (HITL).
- Use Save the Cat structure technique to guide plot-building (skill loaded on demand).

## When Writing
- Read codex context first (character voice, POV, tense, arc progression).
- Follow scene beats if provided.
- Match the author's voice — don't impose your own style.
- Show, don't tell. Cut clutter. Respect the author's words.
"""


class BYOKMiddleware(AgentMiddleware):
    """BYOK middleware — swap model per-request dựa trên runtime.context.

    Đọc `runtime.context.model` + `runtime.context.api_key`, resolve model mới
    qua `init_chat_model` (kèm provider profile kwargs cho OpenRouter attribution,
    OpenAI Responses API, v.v.), override request model. Nếu context không có
    `model`, fall through về default model (hosted free tier).

    Context schema (xem docs/ARCHITECTURE.md Section 7.1):
        {model: str, api_key?: str, novel_id?: str, user_id?: str}
    """

    def _resolve_byok_model(self, context: Any) -> BaseChatModel | None:
        """Resolve model BYOK từ runtime context.

        Args:
            context: Runtime context (dict-like hoặc None).

        Returns:
            BaseChatModel nếu context có `model`, ngược lại None (dùng default).
        """
        if context is None:
            return None
        model_spec = (
            context.get("model")
            if hasattr(context, "get")
            else getattr(context, "model", None)
        )
        if not model_spec:
            return None
        api_key = (
            context.get("api_key")
            if hasattr(context, "get")
            else getattr(context, "api_key", None)
        )
        kwargs = apply_provider_profile(model_spec)
        if api_key:
            kwargs["api_key"] = api_key
        return init_chat_model(model_spec, **kwargs)

    def wrap_model_call(self, request, handler):  # type: ignore[override]
        """Override model per-request từ runtime context (sync).

        Args:
            request: Model request (chứa runtime.context).
            handler: Callback thực thi model call.

        Returns:
            Model response từ model BYOK hoặc default.
        """
        rt = request.runtime
        ctx = rt.context if rt is not None else None
        byok_model = self._resolve_byok_model(ctx)
        if byok_model is not None:
            request = request.override(model=byok_model)
        return handler(request)

    async def awrap_model_call(self, request, handler):  # type: ignore[override]
        """Override model per-request từ runtime context (async).

        Args:
            request: Model request (chứa runtime.context).
            handler: Async callback thực thi model call.

        Returns:
            Model response từ model BYOK hoặc default.
        """
        rt = request.runtime
        ctx = rt.context if rt is not None else None
        byok_model = self._resolve_byok_model(ctx)
        if byok_model is not None:
            request = request.override(model=byok_model)
        return await handler(request)


# Hybrid storage: state (ephemeral, codex scratch) + store (persistent,
# manuscript/memories/skills). Routes theo path prefix.
backend = CompositeBackend(
    default=StateBackend(),
    routes={
        "/manuscript/": StoreBackend(),
        "/memories/": StoreBackend(),
        "/skills/": StoreBackend(),
    },
)

# HITL: agent phải xin user duyệt trước khi write/edit file trong /manuscript/**
permissions = [
    FilesystemPermission(
        operations=["write"],
        paths=["/manuscript/**"],
        mode="interrupt",
    ),
]

# TODO: add skills=["/skills/"], memory=["/memories/novel-bible.md"]
# TODO: add RubricMiddleware with chapter-rubric


def _get_user_id(runtime: ToolRuntime) -> str:
    """Trích xuất user_id từ ToolRuntime context.

    Context schema (xem docs/ARCHITECTURE.md Section 7.1):
        {model: str, api_key?: str, novel_id?: str, user_id?: str}

    Args:
        runtime: ToolRuntime injected bởi framework, chứa context.

    Returns:
        user_id string từ context.

    Raises:
        ValueError: Nếu context hoặc user_id không có (security boundary).
    """
    ctx = runtime.context
    if ctx is None:
        raise ValueError(
            "Runtime context không có user_id — không thể thực hiện thao tác codex."
        )
    user_id = (
        ctx.get("user_id") if hasattr(ctx, "get") else getattr(ctx, "user_id", None)
    )
    if not user_id:
        raise ValueError(
            "Runtime context không có user_id — không thể thực hiện thao tác codex."
        )
    return str(user_id)


@tool
def create_novel(
    title: str,
    runtime: ToolRuntime,
    language: str = "vi",
    pov: str = "",
    tense: str = "",
    technique: str = "save-the-cat",
) -> str:
    """Tạo novel project mới với title, language, POV, tense, và technique.

    Dùng khi user muốn bắt đầu một novel mới. Novel được lưu vào Supabase
    novels table (codex root entity), đồng thời scaffold initial manuscript
    (/manuscript/outline.md) và memory (/memories/novel-bible.md) files.
    Scoped theo user_id từ runtime context (multi-tenant).

    Args:
        title: Tiêu đề novel (bắt buộc).
        language: Mã ngôn ngữ, vd 'vi', 'en' (default 'vi').
        pov: Point of view, vd 'first', 'third-limited' (default rỗng).
        tense: Thì kể, vd 'past', 'present' (default rỗng).
        technique: Structure technique (default 'save-the-cat').

    Returns:
        JSON string chứa novel record + scaffold status.
    """
    user_id = _get_user_id(runtime)
    result = codex_service.create_novel(
        user_id=user_id,
        title=title,
        language=language,
        pov=pov or None,
        tense=tense or None,
        technique=technique,
    )
    # Scaffold manuscript + memory files (best-effort)
    scaffold = []
    for path, content in [
        ("/manuscript/outline.md", f"# Outline — {title}\n\n"),
        (
            "/memories/novel-bible.md",
            f"# Novel Bible — {title}\n\n## Nhân vật\n\n## Thế giới\n\n## Cốt truyện\n",
        ),
    ]:
        res = backend.write(path, content)
        scaffold.append({"path": path, "ok": res.error is None})
    result["scaffold"] = scaffold
    return json.dumps(result, ensure_ascii=False, default=str)


@tool
def list_novels(runtime: ToolRuntime) -> str:
    """Liệt kê tất cả novels của user hiện tại.

    Trả về danh sách các novel project mà user đã tạo, sắp xếp theo mới nhất.

    Returns:
        JSON string chứa list các novel record (id, title, technique, ...).
    """
    user_id = _get_user_id(runtime)
    result = codex_service.list_novels(user_id=user_id)
    return json.dumps(result, ensure_ascii=False, default=str)


@tool
def get_novel(novel_id: str, runtime: ToolRuntime) -> str:
    """Lấy chi tiết một novel theo id.

    Args:
        novel_id: UUID của novel cần xem.

    Returns:
        JSON string chứa novel record, hoặc thông báo lỗi không tìm thấy.
    """
    user_id = _get_user_id(runtime)
    result = codex_service.get_novel(novel_id=novel_id, user_id=user_id)
    if result is None:
        return json.dumps(
            {"error": f"Novel {novel_id} không tìm thấy."},
            ensure_ascii=False,
        )
    return json.dumps(result, ensure_ascii=False, default=str)


agent = create_deep_agent(
    model="deepseek:deepseek-chat",  # MVP priority #1; overridden by BYOK @wrap_model_call
    system_prompt=WRITING_COLLABORATOR_PROMPT,
    tools=[create_novel, list_novels, get_novel],
    middleware=[BYOKMiddleware()],
    backend=backend,
    permissions=permissions,
)
