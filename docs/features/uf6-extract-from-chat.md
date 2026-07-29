# UF-6: Extract from Chat (Codex Growth)

> Issue #8 | Depends: #3 ✅, #2 ✅
> Status: 📋 Designed

## 1. Context & Goals

**Problem:** Khi user chat với agent về novel (mô tả nhân vật, địa điểm), agent cần phát hiện entities và tạo codex entries. Codex tables (characters, locations) hiện trống — cần populate.

**Goals:**
- Agent detect characters/locations trong conversation → suggest "Thêm X?" → user confirm → create codex entry
- @tools: create/list/update character + location
- Codex tab: editable cards cho characters + locations

**Non-goals:**
- Lore/timeline/items/relationships = P2
- Auto-create (no confirm) — user wants control
- Rich portfolio (color themes, visual design) = P2

## 2. Architecture

```
User chat: "Elena là phù thủy lửa 25 tuổi, tính cách mạnh mẽ"
  │
  ▼
Agent reads message → detects "Elena" as new character
  │
  ▼
Agent suggests: "Phát hiện nhân vật: Elena (25, phù thủy lửa, mạnh mẽ). Thêm?"
  │
  ▼
User clicks [Thêm] → agent calls create_character(name, age, personality, ...)
  │
  ▼
Codex entry created → FE Codex tab shows character card
```

## 3. Data Model

Uses existing tables (migration 00001):
- `characters`: id, novel_id, name, age, personality, appearance, arc, pov, color_theme, portfolio_data, created_at, updated_at
- `locations`: id, novel_id, name, description, geography, created_at

No new migration needed.

## 4. User Flows

**UF-6:** User chat "Elena là phù thủy lửa 25 tuổi" → agent detect → suggest "Thêm Elena?" → user click [Thêm] → create_character → Codex tab shows Elena card. User edit card → auto-save blur → update_character.

## 5. ADRs

### ADR-011: Suggest + Confirm (not auto-create)
- **Context:** Agent detects entities in chat. Auto-create vs user confirm?
- **Decision:** Suggest + one-click confirm (Option B) — user controls codex content
- **Consequences:** Extra click per entity, but prevents wrong auto-creates

## 6. Spec (EARS AC)

```
AC-1: WHEN user chats about a character or location, THE SYSTEM SHALL detect the entity and suggest "Thêm X?" with one-click confirm button.
AC-2: WHEN user clicks "Thêm", THE SYSTEM SHALL invoke @tool create_character or create_location to insert into codex table.
AC-3: THE SYSTEM SHALL provide @tools: create_character, list_characters, update_character, create_location, list_locations, update_location.
AC-4: THE SYSTEM SHALL display characters and locations in the Codex tab as editable cards with auto-save on blur.
AC-5: THE SYSTEM SHALL enforce RLS on characters and locations tables (novels.user_id = auth.uid()).
```

## 7. API Contracts

### @tool create_character
```python
create_character(name: str, age: str, personality: str, appearance: str, arc: str, pov: str, runtime: ToolRuntime) -> str
```
- Inserts into characters table (novel_id from context, user_id from context)
- Returns JSON character record

### @tool list_characters
```python
list_characters(runtime: ToolRuntime) -> str
```
- Returns JSON list of characters for novel (ordered by created_at)

### @tool update_character
```python
update_character(character_id: str, name: str, age: str, personality: str, appearance: str, arc: str, pov: str, runtime: ToolRuntime) -> str
```
- Updates character record (verify ownership)

### @tool create_location
```python
create_location(name: str, description: str, geography: str, runtime: ToolRuntime) -> str
```

### @tool list_locations
```python
list_locations(runtime: ToolRuntime) -> str
```

### @tool update_location
```python
update_location(location_id: str, name: str, description: str, geography: str, runtime: ToolRuntime) -> str
```

## 8. UI Design (Codex tab)

- **Character section:** "Nhân vật" heading + cards. Each card: name (serif heading), age, personality, appearance, arc, POV (editable text fields, auto-save on blur), color_theme dot.
- **Location section:** "Địa điểm" heading + cards. Each card: name, description, geography (editable, auto-save on blur).
- **Suggest UI:** When agent detects entity in chat → special message with entity details + [Thêm] / [Bỏ qua] buttons. Click [Thêm] → agent creates.
- **Empty state:** "Chưa có nhân vật/địa điểm. Chat với agent để tạo."
- **Direction A:** minimal chrome, typography-first, cards border-l vermilion (characters) / sage (locations).

## 9. Non-Functional

- **Performance:** Detection happens during normal chat (no extra LLM calls). Suggest message includes parsed entity fields.
- **Token usage:** Minimal — detection is part of existing chat response.

## 10. Sub-tasks

| Sub-task | Module | Agent | Scope |
|----------|--------|-------|-------|
| UF-6 | backend/ + frontend/ | worker (full-stack) | @tools CRUD + system prompt detection + Codex tab + suggest/confirm UI |

## Assumptions

- [ASSUMPTION] Agent detects entities from chat context (LLM pattern matching). Suggest message includes parsed fields (name, age, personality, etc.).
- [ASSUMPTION] Characters table has RLS (migration 00001) — browser client needs auth session for FE E2E.
- [ASSUMPTION] Lore/timeline/items/relationships = P2 (not in this scope).
