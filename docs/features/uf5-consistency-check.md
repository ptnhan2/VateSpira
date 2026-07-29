# UF-5: Consistency Check

> Issue #7 | Depends: #6 ✅, #2 ✅
> Status: 📋 Designed

## 1. Context & Goals

**Problem:** Sau khi viết nhiều chapters, tác giả cần kiểm tra tính nhất quán — phát hiện plot holes, character contradictions, timeline issues. Hiện không có tool nào làm điều này.

**Goals:**
- @tool check_consistency: aggregate novel data (chapters + codex + beats + scenes)
- Agent LLM phân tích dữ liệu, identifies inconsistencies
- Appearance heatmap: character × chapter grid (keyword matching)
- Report hiển thị trong Review tab

**Non-goals:**
- Automated fix (user acts on advice via existing UF-4 chat flow)
- Codex creation (UF-6 — extract characters/locations from chat)
- Real-time consistency checking (on-demand only)

## 2. Architecture

```
User chat "check consistency"
  │
  ▼
Agent calls @tool check_consistency
  │
  ▼
check_consistency aggregates:
  - novel metadata (genre, pov, tense)
  - beats (15 StC slots)
  - scenes (with outlines)
  - chapters (metadata from DB)
  - character list (from codex, if any)
  │
  ▼
Agent reads chapter prose (read_file)
  │
  ▼
LLM analyzes → returns report:
  - issues: [{type, severity, description, chapter, suggestion}]
  - character_appearances: [{name, chapters: [1,3,5]}]
  │
  ▼
FE Review tab displays:
  - Issues list (text)
  - Appearance heatmap (grid)
```

## 3. Data Model

No new tables. Uses existing:
- `chapters` (metadata) + StoreBackend prose
- `beats`, `scenes` (plot structure)
- `characters`, `locations`, `timeline_events`, `lore` (codex — may be empty)

## 4. User Flows

**UF-5:** User chat "kiểm tra tính nhất quán" → agent gọi check_consistency → đọc chapters → LLM phân tích → returns report (issues + suggestions + character appearances) → FE Review tab hiển thị.

## 5. ADRs

### ADR-010: LLM-powered consistency check
- **Context:** Cần detect plot holes, character contradictions, timeline issues
- **Decision:** LLM-powered (agent reads all data, LLM analyzes) — Option A
- **Consequences:** Flexible but slow (reads all chapters = many tokens). Results non-deterministic.

## 6. Spec (EARS AC)

```
AC-1: WHEN user requests consistency check, THE SYSTEM SHALL invoke @tool check_consistency which aggregates novel metadata, beats, scenes, chapters, and character list into a single JSON response.
AC-2: THE SYSTEM SHALL report plot holes including: character in chapter but not in codex, timeline contradictions, missing character introductions, geographic impossibilities.
AC-3: THE SYSTEM SHALL compute character appearances via keyword matching (character name from codex → chapter prose) and include in the report.
AC-4: THE SYSTEM SHALL include suggested fixes as text advice in the report (not automated editing).
AC-5: THE SYSTEM SHALL display the consistency report (issues list + appearance heatmap grid) in the Review tab.
```

## 7. API Contracts

### @tool check_consistency
```python
check_consistency(runtime: ToolRuntime) -> str
```
- Aggregates: novel metadata, beats, scenes, chapters (from DB), characters (from codex)
- Returns JSON: `{novel: {...}, beats: [...], scenes: [...], chapters: [...], characters: [...]}`
- Agent then reads chapter prose via read_file + LLM analyzes

## 8. UI Design (Review tab)

- **Issues list:** Cards with type badge (plot-hole/character/timeline), severity (high/medium/low), description, chapter reference, suggested fix (text)
- **Appearance heatmap:** Grid — rows = characters, columns = chapters. Cell filled (bg-sage) if character appears in chapter. Empty grid if no characters in codex.
- **Empty state:** "Chưa có dữ liệu. Viết chapters và thêm characters qua chat để kiểm tra tính nhất quán."

## 9. Non-Functional

- **Performance:** check_consistency aggregates data in 1 DB query batch. LLM analysis time depends on chapter count + length (~30-60s for 5 chapters).
- **Token usage:** Reading all chapters = significant tokens. Recommend limiting to novels with < 20 chapters for MVP.

## 10. Sub-tasks

| Sub-task | Module | Agent | Scope |
|----------|--------|-------|-------|
| UF-5a | backend/ | worker | @tool check_consistency + system prompt update |
| UF-5b | frontend/ | fe-dev | Review tab — report display + heatmap grid |

## Assumptions

- [ASSUMPTION] Codex may be empty (UF-6 not done). Consistency check works with whatever data exists.
- [ASSUMPTION] Character appearances use exact name matching (no pronouns/aliases). P2: NLP-based matching.
- [ASSUMPTION] check_consistency reads chapter metadata from DB. Agent reads actual prose via read_file.
