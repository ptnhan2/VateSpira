# FE Dev Memory

## Design Preferences
- Design direction: A · Raw Elegance (iA Writer lineage) — LOCKED
- Light: paper #fbfaf6 / ink #1a1a1a / vermilion #a93226 / sage #5a7a5a
- Dark: ink #1a1a1a / cream #e8e4dc / terracotta #c47a5a / sage-lit #8aaa6a
- Typography: Newsreader (serif body+display) + Inter (UI) + JetBrains Mono (code)
- Motion: cursor blink, fade focus (iA Writer style), không bouncy/flashy
- Principles: minimal chrome, typography-first, focus mode, whitespace rộng, 100% custom (no shadcn)
- Hi-fi reference: docs/wireframes/writing-hifi.html
- Style tile: docs/design-exploration.html

## Component Patterns
- **Vitest mock cho `const` export:** `const` export (vd `isSupabaseConfigured` trong `@/lib/supabase`) không thể gán lại → dùng `vi.hoisted` tạo mutable holder + **getter** trong `vi.mock` factory để đổi giá trị per-test. Chain method (`from().select().order()`) cũng mock qua vi.fn trong vi.hoisted. VD: `frontend/src/app/page.test.tsx` (Issue #15).
- **SSE streaming client helper (fetch + ReadableStream):** FE streaming = route handler trả `Response(ReadableStream)` với `text/event-stream`, client helper (`lib/write.ts`) consumes via `fetch + res.body.getReader() + TextDecoder`, parse SSE events (`event: <type>\ndata: <json>\n\n`), dispatch callbacks. KHÔNG dùng EventSource (chỉ GET). SDK trên server, fetch+SSE trên client. VD: `frontend/src/lib/write.ts` + `frontend/src/app/api/novels/[id]/write/shared.ts` (Issue #6 PR #30).
- **LangGraph SDK HITL interrupt/resume:** Detect interrupt sau stream kết thúc via `client.threads.getState(threadId)` → check `state.next` non-empty + `state.tasks[].interrupts[].value` (HITLRequest với `action_requests[0].args.content` = proposed prose). Resume via `client.runs.stream(threadId, "novel-agent", { command: { resume: { decisions: [{ type: "approve" }] } }, input: null })`. VD: `write/shared.ts` (Issue #6 PR #30).

## UI Conventions
- **Vitest config (frontend):** `environment: 'jsdom'`, `globals: false` (import tường minh `{ describe, it, expect }` → khỏi sửa tsconfig thêm `vitest/globals`), `setupFiles: ['./src/test/setup.ts']` (nạp jest-dom matchers + `afterEach(cleanup)`), `plugins: [react()]` (`@vitejs/plugin-react` biên dịch JSX), `resolve.alias['@'] = fileURLToPath(new URL('./src', import.meta.url))` (match tsconfig `paths`). VD: `frontend/vitest.config.ts` (Issue #15).
- **Test script:** `"test": "vitest"` trong package.json → `pnpm test` = watch mode; `pnpm exec vitest run` = chạy 1 lần rồi exit (dùng cho CI/verify).

## Lessons Learned
- [2026-07-15] **vi.mock factory hoisting — 3 quy tắc:** factory bị hoist LÊN TRƯỚC mọi import + biến top-level. (1) Biến top-level thường → TDZ error khi factory chạy → **PHẢI** dùng `vi.hoisted`. (2) Import binding (vd `createElement` từ `react`) → **OK** vì factory chạy lazy khi module bị import, và `react` đứng trước `./page` trong source order nên đã init. (3) **JSX trong factory = lỗi** ("jsx is not defined" — auto jsx-runtime import cũng bị hoist sau factory) → dùng `createElement(...)` thay JSX. VD Issue #15 mock `next/link` + `next/navigation`.
- [2026-07-15] **Windows EPERM khi `pnpm add` ghi package.json:** pnpm rename temp→package.json bị lock (file watcher/IDE giữ file). node_modules + lockfile vẫn được pnpm ghi **trước** khi package.json fail. Fix: edit package.json thủ công match lockfile `importers` section, rồi `pnpm install --frozen-lockfile` confirm "Already up to date". VD Issue #15.
- [2026-07-17] **Vitest 4 Windows worker timeout:** `--pool=threads` mặc định maxWorkers gây "Timeout waiting for worker to respond" khi 8+ test files. Fix: `--pool=threads --maxWorkers=1` (force sequential, tránh resource contention). 50 tests / 8 files: 79s với maxWorkers=1 vs timeout với default. VD Issue #6.
- [2026-07-17] **jsdom không implement scrollIntoView:** Component dùng `ref.current?.scrollIntoView()` → TypeError trong test. Fix: mock trong beforeEach: `Element.prototype.scrollIntoView = vi.fn()`. VD Issue #6 page.test.tsx.
- [2026-07-17] **React 19 `react-hooks/set-state-in-effect` lint rule:** Gọi `setState` (qua useCallback wrapper) synchronously trong useEffect body → lint error. Fix: inline fetch logic trong useEffect với `.then(setState)` (setState trong callback, không synchronous). Giữ useCallback chỉ cho post-completion refresh. VD Issue #6 page.tsx.
- [2026-07-28] **Auth session setup cho FE E2E:** FE dùng Supabase browser client với RLS (`user_id = auth.uid()`). Không có auth session → mọi query trả 401 → E2E fail. Setup: (1) POST `<SUPABASE_URL>/auth/v1/token?grant_type=password` với `{email: <VATESPIRA_DEV_USER_EMAIL>, password: <VATESPIRA_DEV_USER_PASSWORD>}` (đọc từ root .env) → lấy access_token + refresh_token + user. (2) Set vào browser localStorage: key `sb-<project-ref>-auth-token` với session JSON. (3) Reload page → RLS passes. `<project-ref>` = phần đầu SUPABASE_URL (VD: mqxmsumfyxgygozdiwxy). VD Issue #31 E2E test.
