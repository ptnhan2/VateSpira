# 📖 VateSpira — AI Storytelling Engine

> An agent harness for novelists — like Claude Code, but for fiction.
> **Status: Work in Progress** — MVP slice functional (UF-1 → UF-4 done), UF-5/UF-6 in design.

[🇻🇳 Tiếng Việt bên dưới ↓](#-vatespira--nền-tảng-sáng-tạo-tiểu-thuyết-bằng-ai)

---

## The Problem

Novel-writing tools today (NovelCrafter, Sudowrite) solve fragments of the journey: an outline here, a snippet there. None of them offer a true **agent harness** — an autonomous agent that operates on the *entire* novel project through tools and structured context, the way Claude Code operates on a codebase.

VateSpira is that harness: **idea → plot skeleton → scene beats → chapter prose → consistency check**, with the author in control.

## How It Works

The author chats. The agent plans, writes, and maintains — but every manuscript write goes through **human-in-the-loop approval**, and every output is **self-evaluated against literary rubrics** before it reaches the author.

```
Browser (Next.js 16) ──SSE──► LangSmith (LangGraph Platform) ──► deepagents agent
                                    │                               │ tools
                                    │                               ├─► Codex service ──► Supabase (structured novel data)
                                    │                               ├─► StoreBackend ───► Supabase (manuscript = markdown files)
                                    │                               └─► RubricMiddleware (runtime self-eval)
                                    │ checkpoints
                                    └─► Supabase (checkpoints + store)
```

**Three-layer architecture:**

| Layer | Role |
|---|---|
| **Foundation** — deepagents | Agent loop, context management, summarization, subagents, filesystem tools, HITL interrupts |
| **Novel harness** — custom | Codex CRUD tools (`check_consistency`, `pacing`, portfolio…), `SKILL.md` (trope catalog, prose, scene craft), `AGENTS.md` as novel bible, HITL on `/manuscript/**` |
| **Eval & improvement** | Novel rubrics via `RubricMiddleware` (self-eval every turn) + offline eval suite + LangSmith tracing → weak-criteria → improve → re-eval loop |

## Key Design Decisions

- **Codex is structured, manuscript is files.** Characters, locations, timeline, lore, relationships live in Postgres tables (RLS per user + novel) — consumed by both the agent (custom `@tools`) and the UI (character portfolios, timeline charts). The manuscript itself is plain markdown — the agent reads/edits/greps it with idiomatic file tools.
- **Save the Cat as first-class data.** The 15 beat slots are real schema, not prompt conventions.
- **BYOK (Bring Your Own Key).** The author plugs in their own provider keys; the app never marks up inference.
- **Typography-first UI.** "Raw Elegance" design language (iA Writer lineage): Newsreader serif + Inter + JetBrains Mono, paper/ink palette, focus mode.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TipTap (ProseMirror), Tailwind CSS v4 |
| Backend | Python 3.13, FastAPI, deepagents 0.6, LangGraph |
| Database | Supabase — Postgres + Auth + Storage |
| Agent runtime | LangSmith / LangGraph Platform — deploy, SSE streaming, tracing, eval |
| AI providers | Gemini, DeepSeek, ZAI (via OpenRouter) — BYOK |
| Testing | Vitest (FE), pytest (BE), eslint, ruff |

## Feature Status

| Feature | Status |
|---|---|
| UF-1 · Create novel + choose technique | ✅ Done |
| UF-2 · Plot skeleton (Save the Cat 15 beats) | ✅ Done |
| UF-3 · Expand to scene beats | ✅ Done |
| UF-4 · Write scene (HITL + rubric scoring) | ✅ Done |
| UF-5 · Consistency check | 🔜 Designed |
| UF-6 · Extract entities from chat (codex growth) | 🔜 Designed |
| Offline eval suite expansion | 🔜 Planned |

## Getting Started

```bash
# Backend (uv)
cd backend && uv sync && langgraph dev

# Frontend (pnpm)
cd frontend && pnpm install && pnpm dev
```

Configure credentials in root `.env` (see `backend/.env.example` for the template).

## 🇻🇳 VateSpira — Nền tảng sáng tạo tiểu thuyết bằng AI

**VateSpira** là agent harness cho tác giả tiểu thuyết: từ ý tưởng → dàn ý → viết từng chương → kiểm tra nhất quán — với tác giả luôn giữ quyền kiểm soát.

- **Codex có cấu trúc** (nhân vật, bối cảnh, dòng thời gian, lore) lưu trong Postgres; **tập viết là file markdown** — agent đọc/sửa/grep như làm việc với codebase.
- **Human-in-the-loop**: mọi thao tác ghi vào tập viết phải qua phê duyệt.
- **Tự đánh giá**: mỗi lượt viết được chấm theo rubric văn chương ngay trong runtime (RubricMiddleware), kèm bộ eval offline để chống regression.
- **BYOK**: tác giả dùng API key của riêng mình (Gemini/DeepSeek/ZAI, mở rộng OpenAI/Anthropic/OpenRouter).
- **UI typography-first**: font Newsreader + Inter + JetBrains Mono, giao diện tối giản theo hướng "Raw Elegance".

Trạng thái: **đang phát triển** — UF-1 đến UF-4 hoàn tất; UF-5 (kiểm tra nhất quán) và UF-6 (trích xuất từ chat) đang trong giai đoạn thiết kế.

---

Proprietary — all rights reserved. © 2026
