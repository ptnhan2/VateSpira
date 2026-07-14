"""VateSpira novel-writing harness agent.

Agent deepagents chat-centric cho tác giả tiểu thuyết.
- Manuscript = files (StoreBackend, built-in file tools)
- Codex = structured (Postgres, custom @tools)
- HITL approval trước khi sửa manuscript
- RubricMiddleware self-eval (runtime quality loop)
- BYOK per-request qua @wrap_model_call

See: docs/ARCHITECTURE.md
"""

from typing import Any

from deepagents import FilesystemPermission, create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.profiles.provider.provider_profiles import apply_provider_profile
from langchain.agents.middleware.types import AgentMiddleware
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

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
        byok_model = self._resolve_byok_model(request.runtime.context)
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
        byok_model = self._resolve_byok_model(request.runtime.context)
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

# TODO: add custom @tools (codex CRUD, check_consistency, etc.) as features are built
# TODO: add skills=["/skills/"], memory=["/memories/novel-bible.md"]
# TODO: add RubricMiddleware with chapter-rubric

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",  # default; overridden by BYOK @wrap_model_call
    system_prompt=WRITING_COLLABORATOR_PROMPT,
    tools=[],  # custom codex tools added as features are built
    middleware=[BYOKMiddleware()],
    backend=backend,
    permissions=permissions,
)
