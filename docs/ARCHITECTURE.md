> 📖 **Để HIỂU kiến trúc (dành cho tác giả/người không kỹ thuật):** mở [`docs/architecture.html`](architecture.html) — "Guided Tour" narrative, mỗi thuật ngữ giải thích, analogy văn chương, từ điển thuật ngữ.
> 🖼 **Wireframes:** low-fi [`docs/wireframes/wireframes-deck.html`](wireframes/wireframes-deck.html) (6 frame) · hi-fi [`docs/wireframes/writing-hifi.html`](wireframes/writing-hifi.html) (Writing view, Direction A).
> ⚠ **Bản MD này = formal spec cho worker.** Tour HTML = bản để hiểu.

---

## Corrections log (2026-07-07, sau feedback)

- **Providers (Section 1.4, ADR-005):** MVP ưu tiên **Gemini / DeepSeek / ZAI (Zhipu)** (user có key). Full = goal dài hạn. DeepSeek dùng `deepseek-chat` (V3, tool calling OK), KHÔNG dùng `deepseek-reasoner` (R1 không hỗ trợ tool). ZAI qua `openrouter:z-ai/glm-5.2` hoặc OpenAI-compatible.
- **LangStack (Section 2.2):** 3 thứ KHÔNG lồng nhau. Quan hệ đúng: deepagents →(chạy trên)→ LangGraph; LangSmith →(host/observe, ở ngoài)→ deepagents app. Diagram tách ra là đúng (khác vai trò), ghi rõ quan hệ.
- **Design (Section 8, ADR-007):** Direction **A · Raw Elegance** LOCKED (iA Writer lineage). Light: paper #fbfaf6 / ink #1a1a1a / vermilion #a93226. Dark: ink #1a1a1a / cream #e8e4dc / terracotta #c47a5a. Typography: Newsreader + Inter + JetBrains Mono. Chi tiết: [`docs/design-exploration.html`](design-exploration.html).
- **User Flows (Section 4):** Rewrite theo research NovelCrafter — vòng lặp 4 pha Planning↔Manuscript↔Codex↔Review. MVP slice: UF-1 setup, UF-2 codex (progressions+relations), UF-4 write (beats+HITL+rubric), UF-6 consistency, UF-8 extract-from-chat. Thêm: Scene Beats, Progressions, Appearance Heatmap. Chi tiết trong tour HTML Chương 5.
- **Wireframes (Section 8.3):** Bỏ ASCII → low-fi deck [`docs/wireframes/wireframes-deck.html`](wireframes/wireframes-deck.html) (6 frame) + hi-fi [`docs/wireframes/writing-hifi.html`](wireframes/writing-hifi.html) (Writing view, Direction A).

---
# VateSpira — Architecture

> Harness agent cho tác giả tiểu thuyết: từ ý tưởng → dàn ý → viết từng chương → kiểm tra, với eval-driven continuous improvement.
>
> **Status:** ✅ Approved (2026-07-07) — design direction A (Raw Elegance) locked, ready to scaffold
> **Foundation:** deepagents (Python) + Next.js 16 + Supabase + LangSmith

## 1. Context & Goals

### 1.1 Problem
Tác giả tiểu thuyết cần công cụ hỗ trợ toàn hành trình sáng tác (ý tưởng → dàn ý → chương → kiểm tra). Các tool hiện có (NovelCrafter, Sudowrite) chỉ giải quyết từng mảnh, không có **harness agent** thực sự — agent tự chủ thao tác trên project tiểu thuyết qua tools + codex-as-context, giống Claude Code thao tác trên codebase. VateSpira = "Claude Code cho tác giả".

### 1.2 Goals (in scope — MVP "Harness-Proving Foundation")
- **G1 — Harness core:** Agent (deepagents) chat-centric, thao tác manuscript + codex qua tools, human-in-the-loop (HITL) approval trước khi sửa manuscript.
- **G2 — Codex structured:** characters/locations/timeline/lore/relationships trong Postgres — dual consumer: agent (custom @tools) + UI (rich views: character portfolio auto-designed, timeline chart).
- **G3 — Manuscript = files:** markdown trong StoreBackend, agent dùng built-in file tools (read/edit/grep) — idiomatic harness.
- **G4 — Runtime eval:** 1-2 novel rubrics + RubricMiddleware → agent tự self-eval & sửa mỗi turn.
- **G5 — Offline eval:** minimal suite (3-5 scenarios) → measure harness quality, regression check.
- **G6 — Literary UI (Direction A · Raw Elegance):** minimal, typography-first, focus mode, light+dark — NOT default components.
- **G7 — BYOK + Hybrid monetization:** free tier hosted + Pro + BYOK unlimited.
- **G8 — Multilingual.**

### 1.3 Non-goals (out of scope — MVP)
- Full pipeline idea→outline→chapters→check automation (MVP = writing + codex + chat slice)
- Multi-tab parallel chat (subagents) — P2
- Skills library đầy đủ — MVP 1-2 starter skills, P2 expand
- Cross-session memory consolidation — P2
- Collaboration / multi-user realtime — P3
- Local-first offline — future
- Ollama/local models full — MVP OpenAI + Anthropic + OpenRouter

### 1.4 Target users
Tác giả tiểu thuyết (hobbyist → serious), multilingual, muốn AI collaborator không phải chatbot generic.

## 2. Architecture (C4)

### 2.1 L1 — System Context
```
[Author] ──► [VateSpira Web App] ──► [AI Providers (BYOK)]
                    │                    (OpenAI/Anthropic/OpenRouter)
                    ├─► [Supabase] (Postgres + Auth + Storage)
                    ├─► [LangSmith] (agent runtime + tracing + eval)
                    └─► [Vercel] (Next.js hosting)
```

### 2.2 L2 — Containers (3 layers)
```
┌──────────────── LỚP 3: EVAL & IMPROVEMENT (BUILD) ────────────────┐
│ • RubricMiddleware + novel rubrics (runtime self-eval)            │
│ • Offline eval suite (adapt deepagents-evals, 3-5 scenarios)      │
│ • LangSmith tracing → weak criteria → improve → re-eval loop      │
└───────────────────────────────────────────────────────────────────┘
┌──────────────── LỚP 2: NOVEL-HARNESS (BUILD ON TOP) ──────────────┐
│ • Custom @tools: codex CRUD, check_consistency, pacing, portfolio │
│ • Custom SKILL.md: trope-catalog, prose, scene-crafting           │
│ • Custom AGENTS.md: novel bible + author prefs (memory)           │
│ • Custom HarnessProfile "fiction-writer"                          │
│ • Manuscript=files (StoreBackend), Codex=structured (Postgres)    │
│ • HITL permissions (interrupt on /manuscript/** writes)           │
│ • Novel rubrics (chapter-rubric, consistency-rubric)              │
└───────────────────────────────────────────────────────────────────┘
┌──────────────── LỚP 1: FOUNDATION (deepagents — CONSUME) ─────────┐
│ • agent loop, context mgmt, summarization, subagents, HITL        │
│ • filesystem tools, StoreBackend, LangGraph runtime               │
│ • BYOK (@wrap_model_call), LangSmith tracing                      │
└───────────────────────────────────────────────────────────────────┘
```

### 2.3 Containers chi tiết
| Container | Tech | Vai trò |
|-----------|------|---------|
| Next.js FE | Next.js 16 (App Router) + React 19.2 + TipTap + Tailwind v4 | UI/SSR/routing, chat UI, codex views, editor |
| Python BE | FastAPI + deepagents + LangGraph | Agent harness + domain logic + codex service |
| Supabase | Postgres + Auth + Storage | DB (codex + StoreBackend + checkpoints), auth (JWT), assets |
| LangSmith | LangGraph Platform | Agent deploy + streaming + tracing + eval hosting |
| AI Providers | OpenAI/Anthropic/OpenRouter (BYOK) | LLM inference |

### 2.4 Luồng dữ liệu chính
```
Browser (Next.js) ──SSE──► LangSmith (agent runtime) ──► deepagents agent
                               │                            │ tools
                               │                            ├─► codex service ─► Supabase (codex tables)
                               │                            ├─► StoreBackend ─► Supabase (manuscript files)
                               │                            └─► RubricMiddleware (self-eval)
                               │ checkpointer
                               └─► Supabase (checkpoints + store)
```

## 3. Data Model (ERD)

### 3.1 Codex (structured — Postgres tables, RLS per user+novel)
```
novels (id, user_id, title, language, created_at, ...)
characters (id, novel_id, name, age, personality, appearance, arc, pov,
            color_theme, portfolio_data JSONB, ...)
locations (id, novel_id, name, description, geography, ...)
timeline_events (id, novel_id, title, date_label, sort_key, description,
                 character_ids[], ...)
lore (id, novel_id, category, title, body, ...)
items (id, novel_id, name, description, significance, ...)
relationships (id, novel_id, from_character_id, to_character_id, type, description)
chapters (id, novel_id, number, title, status, word_count, ...)  -- metadata only; prose in StoreBackend
```
RLS: `user_id = auth.uid()` trên `novels`; codex tables join novel → inherit isolation.

### 3.2 Manuscript (files — StoreBackend, namespace per user+novel)
```
/manuscript/chapters/{chapter_id}.md   -- prose (TipTap JSON or markdown)
/manuscript/outline.md
/manuscript/notes/*.md
```
Lưu qua LangGraph store (Postgres-backed), namespace `(user_id, "novels", novel_id, "manuscript")`.

### 3.3 Memory (AGENTS.md files — StoreBackend)
```
/memories/novel-bible.md      -- tóm tắt thế giới, theme, tone
/memories/author-prefs.md     -- phong cách, preference học được
```

### 3.4 Skills (SKILL.md files — StoreBackend, global + project)
```
/skills/trope-catalog/SKILL.md
/skills/prose-techniques/SKILL.md
/skills/scene-crafting/SKILL.md
```

### 3.5 Agent state & eval (LangGraph + Supabase)
```
checkpoints (thread_id, state JSON)          -- LangGraph checkpointer (Postgres)
store (namespace, key, value)                -- StoreBackend persistence
rubric_evaluations (id, thread_id, rubric_id, result, criteria JSONB, created_at)
eval_runs (id, scenario_id, model, scores JSONB, created_at)  -- offline eval
```

### 3.6 State transitions
- Chapter: `draft → in_review → revised → final`
- Character portfolio: `empty → generated → user_edited`
- Rubric eval: `pending → needs_revision → satisfied | max_iterations | failed`

## 4. User Flows

### P1 (MVP)
- **UF-1:** User tạo novel project → system scaffold manuscript + codex + memory.
- **UF-2:** User chat "phát triển nhân vật chính Elena" → agent gọi `create_character` + discuss → auto-populate codex → UI character portfolio render.
- **UF-3:** User chat "viết chương 1 dựa codex" → agent `read_file` codex context + `write_file` manuscript → HITL approve → chapter saved → RubricMiddleware self-eval (chapter-rubric) → revise if needed.
- **UF-4:** User chat "check consistency chương 5 vs codex" → agent `check_consistency` tool → report plot holes → suggest edits → HITL approve.
- **UF-5:** User mở Character tab → xem portfolio (auto-designed, màu riêng Elena) + edit trực tiếp → agent thấy update ở turn sau.

### P2
- Multi-tab parallel chat (subagents), timeline chart view, skills library expand, cross-session memory.

### P3
- Collaboration, full pipeline automation, local-first.

## 5. ADRs

### ADR-001: deepagents (Python) làm harness foundation
- **Context:** Cần harness engine (loop/context/subagents/HITL) không build from 0.
- **Options:** deepagents.js (1.4k⭐, ít mature) | deepagents Python (25.8k⭐, mature, có eval suite + RubricMiddleware) | Vercel AI SDK (less harness) | build from 0.
- **Decision:** deepagents Python.
- **Consequences:** +1 service (Python BE) nhưng agent tools + domain co-located; thin boundary FE/BE.

### ADR-002: Hybrid data model (manuscript files + codex structured)
- **Context:** Codex cần render rich UI (portfolio, timeline) + agent query; manuscript là prose.
- **Decision:** Codex = Postgres tables (structured, dual consumer); Manuscript = markdown files in StoreBackend (idiomatic harness).
- **Consequences:** ~10 custom @tools cho codex; built-in file tools cho manuscript.

### ADR-003: Next.js FE + Python FastAPI BE split (Option B)
- **Context:** Agent tools + domain logic cùng language tránh duplication.
- **Decision:** Next.js (UI/SSR) + Python FastAPI (mọi logic: domain + agent); Supabase (DB/Auth).
- **Consequences:** 2 service, 2 ngôn ngữ; agent tools gọi domain service trực tiếp (0 hop).

### ADR-004: LangSmith Deployment cho agent runtime
- **Context:** Cần deploy agent + streaming + tracing + eval hosting.
- **Decision:** LangSmith Deployment (`langgraph.json` + `langgraph deploy`), auto-provision store/checkpointer/auth/cron.
- **Consequences:** Managed, ít ops; frontend dùng `useStream` (SSE) custom chat UI.

### ADR-005: BYOK + Hybrid monetization
- **Context:** Tránh gánh token cost; cho power user unlimited; freemium entry.
- **Decision:** Free (hosted credit cap) + Pro sub (premium features) + BYOK (unlimited, 0 token cost). Premium features gate bởi sub bất kể AI source.
- **Consequences:** BYOK qua `@wrap_model_call` middleware đọc `runtime.context.model + api_key`.

### ADR-006: Eval-driven continuous improvement
- **Context:** Harness phải "tốt dần" — đo được → cải thiện có chứng cứ.
- **Decision:** 2 lớp eval: runtime (RubricMiddleware + novel rubrics) + offline (adapt deepagents-evals, novel scenarios). LangSmith tracing. Loop: eval → weak criteria → improve Lớp 2 → re-eval.
- **Consequences:** Eval là first-class trong MVP, không tách ra P2.

### ADR-007: Design Direction A · Raw Elegance (iA Writer lineage) — LOCKED
- **Context:** User muốn design RIÊNG, phù hợp tác giả. "Game-like" = CẢM HỨNG game có design riêng, KHÔNG clone. Research iA Writer / Bear / Ulysses (Apple Design Award writing apps) → minimal + typography-first + focus mode + light/dark.
- **Decision:** Direction **A · Raw Elegance** (iA Writer lineage). Light: paper #fbfaf6 / ink #1a1a1a / vermilion #a93226 / sage #5a7a5a. Dark: ink #1a1a1a / cream #e8e4dc / terracotta #c47a5a. Typography: Newsreader (serif body+display) + Inter (UI) + JetBrains Mono. Motion: cursor blink, fade focus (câu hiện tại highlight, rest fade 38%), không flashy. 100% custom components (no shadcn). Tailwind v4.
- **Alternatives considered:** B · Cozy Study (Bear lineage, Lora, walnut/honey) — casual, kém hợp thesis "nghiêm túc". C · Ink & Moon (ink-wash, Cormorant, slate/jade) — độc đáo nhưng risk. Xem [`docs/design-exploration.html`](design-exploration.html).
- **Consequences:** Minimalism cao (pattern proven); Newsreader free (Google Fonts); 1 accent = maintain đơn giản; dùng skill frontend-design khi build. Hi-fi mẫu: [`docs/wireframes/writing-hifi.html`](wireframes/writing-hifi.html).

### ADR-008: Supabase Postgres + RLS multi-tenant
- **Context:** Multi-tenant (user × novel) isolation.
- **Decision:** Supabase Postgres, RLS `user_id = auth.uid()`; StoreBackend namespace `(user_id, "novels", novel_id, ...)`.
- **Consequences:** Isolation built-in; auth Supabase JWT verify trong Python BE.

## 6. Spec (EARS AC)

### Harness core
- **AC-1 (ubiquitous):** The system SHALL expose agent interaction via chat UI with streaming SSE.
- **AC-2 (state-driven):** When the agent requests a manuscript edit, the system SHALL pause for user approval (HITL) before applying.
- **AC-3 (event-driven):** When user sends a chat message, the agent SHALL have access to codex (via custom tools), manuscript (via file tools), memory (AGENTS.md), and skills (SKILL.md).

### Codex
- **AC-4:** The system SHALL store codex entities (characters, locations, timeline, lore, items, relationships) in structured Postgres tables with RLS.
- **AC-5 (state-driven):** When agent creates/updates a codex entity, the UI SHALL reflect the change within 2 seconds.
- **AC-6:** The system SHALL render a character portfolio view with per-character color theme, auto-generated from structured data.
- **AC-7 (unwanted):** The system SHALL NOT store codex as unstructured markdown (must be queryable structured tables).

### Eval
- **AC-8 (event-driven):** When the agent completes a chapter-writing turn, RubricMiddleware SHALL evaluate against the chapter rubric and return satisfied/needs_revision/failed.
- **AC-9 (state-driven):** If rubric result is needs_revision and iterations < max_iterations, the system SHALL inject grader feedback and resume the agent.
- **AC-10:** The offline eval suite SHALL run >=3 scenarios and report category_scores (prose, consistency, pacing, POV).
- **AC-11 (state-driven):** When an offline eval shows a category_score drop > 5% vs prior harness version, the CI pipeline SHALL block prod deploy.

### Multilingual & BYOK
- **AC-12:** The system SHALL support UI i18n (>=2 languages) and skill content multilingual.
- **AC-13 (optional):** The system MAY allow user to connect own API key (BYOK) for unlimited usage.
- **AC-14:** The system SHALL gate premium features (multi-tab, advanced skills) by subscription regardless of AI source.

## 7. API Contracts

### 7.1 Agent stream (FE -> LangSmith -> agent)
- `POST /threads/{thread_id}/runs/stream` (SSE)
- Body: `{messages: [{role, content}], context: {model, api_key?, novel_id}}`
- Stream modes: `messages` (token stream), `values` (state), `updates`
- Auth: LangSmith API key (server-side) + Supabase JWT in context for RLS

### 7.2 Codex CRUD (FE -> Python BE)
- `GET /novels/{id}/characters` -> `[{id, name, age, ...}]`
- `POST /novels/{id}/characters` -> `{id}` (body: name, age, personality, ...)
- `PATCH /novels/{id}/characters/{cid}` -> `{id, ...updated}`
- `DELETE /novels/{id}/characters/{cid}` -> `204`
- `GET /novels/{id}/timeline` -> `[{id, title, date_label, sort_key, character_ids}]`
- Tương tự cho locations, lore, items, relationships
- Auth: `Authorization: Bearer <supabase_jwt>` (BE verify + RLS)

### 7.3 Manuscript files (FE -> Python BE -> StoreBackend)
- `GET /novels/{id}/manuscript/{path}` -> `{content, encoding, modified_at}`
- `PUT /novels/{id}/manuscript/{path}` -> `{path, modified_at}` (triggers agent context refresh)

### 7.4 Eval
- `GET /novels/{id}/evaluations?rubric=chapter` -> `[{id, result, criteria, created_at}]`
- `POST /eval/run` (admin) -> `{run_id, scenarios: [...]}` (trigger offline eval suite)
- `GET /eval/runs/{run_id}` -> `{scores, category_scores, experiment_url}`

### 7.5 Error codes
- `401` unauthorized (invalid/expired JWT)
- `403` forbidden (RLS denied — novel không thuộc user)
- `404` not found
- `409` conflict (concurrent edit — manuscript edit collision)
- `422` validation error (Pydantic)
- `429` rate limit (free tier credit cap)

## 8. UI Design

### 8.1 Component tree
```
App
+- Dashboard (novel list, stats, recent activity)
+- NovelWorkspace
|  +- Sidebar (chapters list, codex nav, status badges)
|  +- ChatPanel (message stream, auto-suggest chips, HITL approval cards)
|  +- EditorPanel (TipTap, manuscript, word count, status)
|  +- CodexPanel (tabs: Characters | Locations | Timeline | Lore | Items)
|     +- CharacterPortfolio (auto-designed, per-character color theme)
|     +- TimelineChart (vis-timeline)
|     +- RelationshipGraph (custom React + d3-force)
+- Settings (BYOK keys, language, theme, subscription)
```

### 8.2 Design tokens — Direction A · Raw Elegance (LOCKED)
- **Palette Light:** paper #fbfaf6 · surface #fff · ink #1a1a1a · vermilion #a93226 (accent) · sage #5a7a5a · muted #888
- **Palette Dark:** ink #1a1a1a · surface #222 · cream #e8e4dc · terracotta #c47a5a (accent) · sage-lit #8aaa6a · muted #777
- **Typography:** Newsreader (serif, body+display, editorial) · Inter (UI) · JetBrains Mono (code)
- **Motion:** cursor blink, fade focus (câu hiện tại highlight, rest opacity 38%), không bouncy/flashy — iA Writer "blue cursor" lineage
- **Principles:** minimal chrome · typography-first · focus mode · whitespace rộng · 100% custom components (no shadcn) · light+dark bắt buộc
- **Per-character hue:** hash(name) → avatar/portfolio color
- **Reference:** [`docs/design-exploration.html`](design-exploration.html) (style tile) · [`docs/wireframes/writing-hifi.html`](wireframes/writing-hifi.html) (hi-fi mẫu)

### 8.3 Wireframes

- **Low-fi (6 frame, gray):** [docs/wireframes/wireframes-deck.html](wireframes/wireframes-deck.html) — Dashboard, Writing, Codex, Plot, Review, Settings. Validate structure, chat-centric.
- **Hi-fi (Writing view, Direction A):** [docs/wireframes/writing-hifi.html](wireframes/writing-hifi.html) — light/dark toggle, focus mode, syntax highlight, HITL card.
- **Note:** Wireframe = artifact RIÊNG cho UX (tác giả), không phải phần của architecture doc.


### 8.4 States
- **Loading:** skeleton + ink-spread spinner
- **Empty:** illustrated empty state (no novels / no characters / blank codex)
- **Error:** retry card with agent-suggested fix (uses eval feedback pattern)
- **HITL approval:** modal/card showing agent's proposed edit + diff + Approve/Reject/Edit

## 9. Non-Functional

### 9.1 Performance
- Chat first-token < 1.5s (P95)
- Codex UI update after agent edit < 2s (P95)
- Editor load (100k-word chapter) < 500ms
- Offline eval run (5 scenarios) < 10 min
- Character portfolio render < 300ms

### 9.2 Security
- RLS on all codex tables (`user_id = auth.uid()`)
- Supabase JWT verify trong Python BE (pyjwt / supabase-py)
- BYOK keys encrypted at rest (Supabase Vault), never logged, never sent to frontend after save
- HITL on all manuscript writes (`FilesystemPermission mode=interrupt`)
- RubricMiddleware grader treats transcript as untrusted (prompt-injection defense built-in)
- Rate limiting: free tier credit cap + per-user request limit

### 9.3 Scale
- MVP target: 100 concurrent users, 1k novels, 10k chapters
- LangSmith handles agent runtime horizontal scaling
- Supabase handles DB scaling (read replicas if needed)
- StoreBackend namespace isolation prevents cross-tenant leakage

### 9.4 Observability
- LangSmith tracing mọi agent runs (free tier sufficient for eval)
- Rubric evaluations logged -> `rubric_evaluations` table + LangSmith
- Offline eval results -> LangSmith experiments + `eval_runs` table
- Frontend errors -> Sentry
- Dashboard: harness version -> category_scores trend (improvement visibility)

## 10. Deployment

### 10.1 Environments
- **dev:** local (`next dev` + `langgraph dev` + `supabase start`)
- **staging:** Vercel preview + LangSmith staging + Supabase staging project
- **prod:** Vercel prod + LangSmith prod + Supabase prod

### 10.2 Agent deployment (LangSmith)
- `langgraph.json` at BE root:
  ```json
  {"dependencies": ["."], "graphs": {"novel-agent": "./agent.py:agent"}, "env": ".env"}
  ```
- `langgraph deploy` -> auto-provision store/checkpointer/auth/cron
- Custom auth handler verify Supabase JWT, set `runtime.context.user_id + novel_id`

### 10.3 Frontend (Vercel)
- Next.js 16, auto-deploy from `main`
- Environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_LANGSMITH_API_URL`

### 10.4 CI/CD with eval gate
```
PR -> lint + typecheck + unit test + build
 |-> merge to main
      |-> deploy staging
           |-> run offline eval suite (3-5 scenarios, N=3 trials)
                |-> regression check: no category_score drop > 5% vs prior harness version
                     |-> PASS -> deploy prod + tag harness version
                     |-> FAIL -> block, notify, require manual override
```

### 10.5 Env vars
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `LANGSMITH_API_KEY`, `LANGSMITH_TRACING=true`, `LANGSMITH_PROJECT=vatespira`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (fallback for hosted free tier)
- `OPENROUTER_API_KEY` (optional, for BYOK routing)
- `DEEPAGENTS_EVALS_MODEL` (default model for offline eval)

---

## Appendix A: Techstack versions (verified 2026-07-07)
| Component | Version | Notes |
|-----------|---------|-------|
| Next.js | 16.3 | App Router, Turbopack stable, React 19.2 |
| React | 19.2 | View Transitions, useEffectEvent |
| Tailwind CSS | v4.3 | CSS-based config (no tailwind.config.js) |
| TipTap | latest | ProseMirror, MIT + Pro extensions (Collaboration/Comments/AI) |
| Python | 3.13 | deepagents compatible (3.14 available) |
| deepagents | 0.6.12 | harness engine |
| LangGraph + LangSmith | latest | runtime + deploy + eval |
| Supabase | latest | Postgres 15+, Auth, Storage, Realtime |
| Models | claude-sonnet-4-6, claude-opus-4-7, gpt-5.5, gemini-2.5-flash, openrouter:*, ollama:* | BYOK |

## Appendix B: deepagents extension points (BUILD ON TOP)
| Extension point | What we BUILD | deepagents provides |
|-----------------|---------------|---------------------|
| `tools=` | ~10 custom @tools (codex CRUD, check_consistency, pacing, portfolio) | additive tool mechanism |
| `backend=` | CompositeBackend routes (/manuscript/, /memories/, /skills/ — codex = structured Postgres (NOT file route, via @tools)) | StoreBackend, CompositeBackend, StateBackend |
| `skills=` | SKILL.md files (trope, prose, scene) | SkillsMiddleware + progressive disclosure |
| `memory=` | AGENTS.md (novel bible, author prefs) | MemoryMiddleware + trust/verify |
| `permissions=` | FilesystemPermission interrupt on /manuscript/** | HITL enforcement |
| `middleware=` | custom fiction middleware (later) | middleware framework |
| `subagents=` | researcher, consistency-checker (P2) | task tool + isolated context |
| `model=` | @wrap_model_call BYOK | model-agnostic |
| RubricMiddleware | novel rubrics (chapter, consistency) | self-eval loop mechanism |
| Eval suite | novel scenarios + categories | deepagents-evals CLI pattern |

## Appendix C: Improvement loop (the "harness tốt dần" thesis)
```
1. RUN     -> agent viết chương + RubricMiddleware self-eval -> satisfied/needs_revision
              -> lưu evaluation vào LangSmith + rubric_evaluations
2. MEASURE -> offline eval suite N trials -> category_scores {prose, consistency, pacing, POV}
              -> identify weakest criterion
3. IMPROVE -> cải thiện Lớp 2:
              - thêm/enrich skill (trope-catalog thêm checklist)
              - refine rubric (criteria rõ hơn)
              - thêm custom tool (check_codex_consistency)
              - tune HarnessProfile fiction-writer (prompt suffix)
4. RE-EVAL -> chạy lại eval suite -> so sánh category_scores vs prior version
              -> regression check -> commit + tag harness version
5. LOOP    -> repeat; mỗi version harness có scores quantifiable, comparable
```

---

**Next step:** User approve design doc -> `skill("project-init")` scaffold:
1. Next.js 16 app (App Router, Tailwind v4, TipTap)
2. Python FastAPI BE + deepagents agent wiring + langgraph.json
3. Supabase schema (codex tables + RLS + StoreBackend migrations)
4. Root AGENTS.md (techstack + conventions) + .kilo/role-memory/
5. GitHub Project + Issues from P1 feature plan (UF-1..UF-5)
6. Starter skills (1-2 SKILL.md) + starter rubrics (chapter-rubric)

