# AGENTS.md — VateSpira Constitution

> Root constitution. Auto-load mọi lúc cho mọi agent. Chỉ Manager (hoặc agent được xin phép) ghi.

## Techstack
- **Package Manager FE:** pnpm
- **Package Manager BE:** uv (Python)
- **Frontend:** Next.js 16 (App Router) + React 19.2 + TipTap ^3.27.3 (ProseMirror) + Tailwind v4.3.2 + @supabase/supabase-js ^2.110.3 + @langchain/langgraph-sdk
- **Backend:** Python 3.13 + FastAPI + deepagents 0.6.12 + LangGraph
- **Database:** Supabase Postgres (+ Auth + Storage)
- **Agent runtime:** LangSmith (LangGraph Platform) — deploy + stream + tracing + eval
- **AI providers:** BYOK — MVP: Gemini (langchain-google-genai), DeepSeek (langchain-deepseek, `deepseek-chat` not `deepseek-reasoner`), ZAI/Zhipu (langchain-openrouter, openrouter:z-ai/glm-5.2). Full: OpenAI, Anthropic, OpenRouter, Ollama.
- **Design direction:** A · Raw Elegance (iA Writer lineage) — LOCKED. Light: paper #fbfaf6 / ink #1a1a1a / vermilion #a93226. Dark: ink #1a1a1a / cream #e8e4dc / terracotta #c47a5a. Newsreader (serif) + Inter (UI) + JetBrains Mono.
- **Test FE:** vitest
- **Test BE:** pytest
- **Linter FE:** eslint
- **Linter BE:** ruff
- **Last verified:** 2026-07-16 bởi doc-sync (UF-2 merge)
- **Env files:**
  - LANGSMITH_API_URL (LangGraph dev server URL, dev: http://localhost:2024)
  - VATESPIRA_DEV_USER_ID / EMAIL / PASSWORD (dev user for E2E testing)
  - SUPABASE_DB_PASSWORD (Supabase Postgres direct connection, for migrations via psycopg2)
  - `.env` (root) = source of truth, ALL credentials (gitignored, NOT committed)
  - `backend/.env` + `frontend/.env.local` = auto-copy từ root `.env` bởi `.kilo/setup-script.ps1` khi tạo worktree
  - `backend/.env.example` = template placeholder (committed)
  - **Tất cả task (BE + FE) → check root `.env` có real credentials không**

## Commands
- **Dev FE:** `cd frontend && pnpm dev`
- **Dev BE:** `cd backend && langgraph dev` (hoặc `uv run uvicorn agent:app --reload`)
- **Lint FE:** `cd frontend && pnpm lint`
- **Lint BE:** `cd backend && uv run ruff check`
- **Test FE:** `cd frontend && pnpm test`
- **Test BE:** `cd backend && uv run pytest`
- **Build FE:** `cd frontend && pnpm build`
- **Eval:** `cd backend && uv run deepagents-evals run --model <model>` (offline eval suite)
- **GitHub Project:** #5 (https://github.com/users/ptnhan2/projects/5)

## Architectural Decisions
- [2026-07-07] Harness: deepagents (Python) — mature 25.8k⭐, eval + RubricMiddleware, inspired by Claude Code. (ADR-001)
- [2026-07-07] Data: hybrid — codex structured (Postgres, dual consumer agent+UI), manuscript files (StoreBackend). (ADR-002)
- [2026-07-07] Split: Next.js FE + Python FastAPI BE — agent tools + domain co-located. (ADR-003)
- [2026-07-07] Deploy: LangSmith Deployment — managed runtime + stream + tracing + eval. (ADR-004)
- [2026-07-07] Monetization: BYOK + Hybrid — free hosted cap + Pro sub + BYOK unlimited. (ADR-005)
- [2026-07-07] Eval: first-class MVP — runtime RubricMiddleware + offline eval suite. (ADR-006)
- [2026-07-07] Design: Direction A · Raw Elegance (iA Writer lineage) — LOCKED. (ADR-007)
- [2026-07-07] Multi-tenant: Supabase RLS `user_id = auth.uid()` + StoreBackend namespace. (ADR-008)
- [2026-07-07] User flow: 1 chat-centric (technique = skill + output + view, orthogonal to flow)
- [2026-07-07] MVP technique: Save the Cat (slot-filling archetype, 1 UI board + 1 skill). P2: Snowflake/12 Acts.

## Conventions (Cross-cutting)
- Commit: Conventional Commits (feat/fix/refactor/chore/docs/test)
- Branch: `<type>/<issue_id>-<short-desc>` (VD: `feat/72-centralize-llm`)
- PR: < 200 dòng, link Issue via "Closes #N"
- Docstring: tiếng Việt mô tả + English params/returns
- 1 task = 1 file = 1 commit (Fence Editing)
- **Monorepo:** `frontend/` (Next.js) + `backend/` (Python) + `supabase/` (migrations) + `docs/` (design docs + wireframes)
- **Fence Editing:** Worker chỉ sửa trong EDIT ZONE được Manager chỉ định. Test files NOT locked.
- **Root is Lava:** KHÔNG tạo file ở root (trừ AGENTS.md, .kilo/, docs/, config files)
- **HITL:** Agent xin user duyệt trước khi sửa manuscript (`FilesystemPermission mode=interrupt` trên `/manuscript/**`)
- **BYOK:** Per-request qua `@wrap_model_call` middleware đọc `runtime.context.model + api_key`
- **Eval gate:** CI block prod nếu category_score drop > 5% vs prior harness version

## Active Patterns
<!-- Trống — ghi bởi /learn -->

## Out of Scope (current sprint)
- Multi-tab parallel chat (subagents) — P2
- Timeline chart view — P2
- Skills library đầy đủ — P2 (MVP: 1-2 starter skills)
- Cross-session memory consolidation — P2
- Collaboration — P3
- Local-first offline — future
- Techniques beyond Save the Cat — P2 (Snowflake, 12 Acts, 7-Point, Hero's Journey)