"""VateSpira novel-writing harness agent.

Agent deepagents chat-centric cho tác giả tiểu thuyết.
- Manuscript = files (StoreBackend, built-in file tools)
- Codex = structured (Postgres, custom @tools)
- HITL approval trước khi sửa manuscript
- RubricMiddleware self-eval (runtime quality loop)
- BYOK per-request qua @wrap_model_call

See: docs/ARCHITECTURE.md
"""

from deepagents import create_deep_agent

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

# TODO: add custom @tools (codex CRUD, check_consistency, etc.) as features are built
# TODO: add CompositeBackend with routes (/manuscript/, /codex/, /memories/, /skills/)
# TODO: add skills=["/skills/"], memory=["/memories/novel-bible.md"]
# TODO: add permissions=[FilesystemPermission(operations=["write"], paths=["/manuscript/**"], mode="interrupt")]
# TODO: add RubricMiddleware with chapter-rubric
# TODO: add @wrap_model_call BYOK middleware

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",  # default; overridden by BYOK @wrap_model_call
    system_prompt=WRITING_COLLABORATOR_PROMPT,
    tools=[],  # custom codex tools added as features are built
)