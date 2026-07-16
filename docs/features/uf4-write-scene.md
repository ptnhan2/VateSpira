# UF-4: Write Scene (from beat, HITL, rubric)

> Issue #6 | Depends: #5 (scenes) ✅, #2 (BE foundation) ✅
> Status: 📋 Designed

## 1. Context & Goals

**Problem:** User đã có beat sheet (15 StC beats) + scene outline. Giờ cần agent viết prose (văn xuôi) cho scene/chapter dựa trên context (codex + beats + memory). Chất lượng cần tự đánh giá + tự sửa.

**Goals (in scope):**
- Agent đọc context (novel metadata + beats + scenes + memory) rồi viết manuscript
- HITL: agent pause trước khi write manuscript, user approve
- RubricMiddleware tự chấm (5 tiêu chí), auto-revise nếu needs_revision (max 3 vòng)

**Non-goals (out of scope):**
- Chat UI + HITL approval UI = UF-4b (FE sub-task, sequential after BE)
- Configurable rubric per novel = P2
- Character/location/lore @tools = UF-6 (extract from chat)
- Multi-tab parallel chat = P2

## 2. Architecture

UF-4 thêm 2 component vào existing architecture:

```
User chat "viết scene 1 beat 8"
  │
  ▼
FE (UF-4b) → /api/novels/[id]/write → LangGraph SDK
  │                                          │
  │                                          ▼
  │                              Agent (with rubric in state)
  │                                          │
  │                              ┌───────────┼───────────┐
  │                              ▼           ▼           ▼
  │                          read context  write_chapter  RubricMiddleware
  │                          (get_novel,   (@tool: file   (grader sub-agent
  │                           list_beats,   + DB metadata, evaluates against
  │                           list_scenes,  HITL interrupt) rubric, max 3 iter)
  │                           read_file)
  │                                          │
  │                              ┌───────────┘
  │                              ▼
  │                         needs_revision?
  │                         ├── yes → agent revises → re-grade (loop max 3)
  │                         └── no (satisfied/max) → return final
  │
  ▼
FE receives final manuscript + chapter metadata
```

## 3. Data Model

Sử dụng existing `chapters` table (migration 00001):

```
chapters (id, novel_id, number, title, status, word_count, created_at, updated_at)
```

**State transitions:** `draft → in_review → revised → final`

- `draft`: agent vừa viết xong (write_chapter insert với status='draft')
- `in_review`: RubricMiddleware đang đánh giá
- `revised`: agent đã revise sau needs_revision
- `final`: RubricMiddleware satisfied HOẶC user approve final

**Manuscript prose:** StoreBackend `/manuscript/chapters/{chapter_id}.md` (markdown)

## 4. User Flows

**UF-4 (MVP):** User chat "viết scene 1 beat 8" → agent đọc context (novel, beats, scenes, memory) → agent gọi `write_chapter` → HITL pause → user approve → agent writes manuscript → RubricMiddleware đánh giá → needs_revision → agent revise → re-grade → satisfied → return final chapter.

## 5. ADRs

### ADR-009: RubricMiddleware cho chapter self-evaluation
- **Context:** Cần tự đánh giá chất lượng chapter prose + auto-revise
- **Options:** (A) Custom eval loop | (B) deepagents RubricMiddleware (built-in) | (C) External eval service
- **Decision:** B — RubricMiddleware (built-in, mature, grader sub-agent, max_iterations control)
- **Consequences:** Rubric hardcoded cho MVP (P2: configurable). Grader dùng same model (DeepSeek). 3 iterations max = 6 LLM calls extra per chapter.

## 6. Spec (EARS AC)

```
AC-1: WHEN user asks agent to write a chapter, THE SYSTEM SHALL invoke @tool write_chapter which writes prose to /manuscript/chapters/{id}.md AND inserts chapters table row (title, status='draft', word_count auto-calc).
AC-2: BEFORE writing manuscript, THE SYSTEM SHALL pause (HITL interrupt) and require user approval via FilesystemPermission mode=interrupt on /manuscript/**.
AC-3: AFTER user approves write, THE SYSTEM SHALL trigger RubricMiddleware evaluation against chapter rubric (5 criteria).
AC-4: WHEN RubricMiddleware returns needs_revision, THE SYSTEM SHALL auto-revise manuscript and re-evaluate, up to max 3 iterations.
AC-5: THE SYSTEM SHALL evaluate chapters against 5 criteria: (1) Beat alignment, (2) Voice/POV/tense consistency, (3) Show-don't-tell, (4) Character consistency, (5) Pacing.
AC-6: WHEN RubricMiddleware returns satisfied OR max_iterations (3) reached, THE SYSTEM SHALL stop revising and return final manuscript with status='final' or 'revised'.
AC-7: THE SYSTEM SHALL provide @tool list_chapters for listing all chapters of a novel (FE renders chapter list).
```

## 7. API Contracts

### @tool write_chapter
```python
write_chapter(chapter_number: int, title: str, content: str, runtime: ToolRuntime) -> str
```
- Writes prose to `/manuscript/chapters/{novel_id}_{chapter_number}.md` (StoreBackend, HITL interrupt)
- Inserts/updates `chapters` table (novel_id, number, title, status='draft', word_count=len(content.split()))
- Returns JSON: `{"id": "...", "chapter_number": ..., "title": ..., "word_count": ..., "status": "draft"}`

### @tool list_chapters
```python
list_chapters(runtime: ToolRuntime) -> str
```
- Returns JSON list of chapters for novel (from chapters table, ordered by number)

### RubricMiddleware
```python
RubricMiddleware(
    model="deepseek:deepseek-chat",
    system_prompt=CHAPTER_RUBRIC_PROMPT,  # 5 criteria grader instructions
    max_iterations=3,
)
```
- Rubric string passed in invocation state: `{"messages": [...], "rubric": CHAPTER_RUBRIC_STRING}`
- Grader evaluates transcript (including written chapter) against rubric
- Returns: satisfied / needs_revision / failed / max_iterations_reached

## 8. UI Design (UF-4b — deferred)

Chat-centric layout (Direction A):
- Message list (user + agent messages, streaming)
- Input box (bottom, fixed)
- HITL approval: inline in chat — proposed content shown as special message, approve/reject buttons
- Chapter list: sidebar or tab showing written chapters (title, status, word_count)
- Chapter reader: click chapter → read prose (markdown rendered)

## 9. Non-Functional

- **Performance:** Each chapter write = 1 write LLM call + up to 6 eval LLM calls (3 iterations × 2). Total ~7 LLM calls per chapter. With DeepSeek: ~30-60s per chapter.
- **Cost:** ~7 × ~2K tokens = ~14K tokens per chapter. DeepSeek: ~$0.01/chapter.
- **Security:** HITL ensures user approves all manuscript writes. RubricMiddleware runs server-side (no client exposure).

## 10. Deployment

- No new env vars needed (uses existing LANGSMITH_API_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- RubricMiddleware registered in agent.py (same LangGraph deployment)
- FE route `/api/novels/[id]/write` uses existing @langchain/langgraph-sdk

## Sub-tasks

| Sub-task | Module | Agent | Scope | Dependency |
|----------|--------|-------|-------|------------|
| UF-4a | backend/ | worker | RubricMiddleware + @tool write_chapter + @tool list_chapters + chapter rubric constant + codex_service chapter CRUD | None (existing tables + agent.py) |
| UF-4b | frontend/ | fe-dev | Chat UI + HITL approval + chapter display + /api/novels/[id]/write route | UF-4a merged |

## Assumptions

- [ASSUMPTION] Chapter rubric hardcoded (not configurable per novel). P2: configurable.
- [ASSUMPTION] Agent reads context via existing @tools (get_novel, list_beats, list_scenes) + built-in read_file (/memories/novel-bible.md). No new read @tools needed for MVP.
- [ASSUMPTION] HITL interrupt works with write_file called inside @tool (deepagents handles this — FilesystemPermission applies to all write operations on /manuscript/**).
- [ASSUMPTION] FE chat UI uses @langchain/langgraph-sdk streaming with interrupt handling (extends existing /api/novels/create pattern).
