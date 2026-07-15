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

## UI Conventions
- **Vitest config (frontend):** `environment: 'jsdom'`, `globals: false` (import tường minh `{ describe, it, expect }` → khỏi sửa tsconfig thêm `vitest/globals`), `setupFiles: ['./src/test/setup.ts']` (nạp jest-dom matchers + `afterEach(cleanup)`), `plugins: [react()]` (`@vitejs/plugin-react` biên dịch JSX), `resolve.alias['@'] = fileURLToPath(new URL('./src', import.meta.url))` (match tsconfig `paths`). VD: `frontend/vitest.config.ts` (Issue #15).
- **Test script:** `"test": "vitest"` trong package.json → `pnpm test` = watch mode; `pnpm exec vitest run` = chạy 1 lần rồi exit (dùng cho CI/verify).

## Lessons Learned
- [2026-07-15] **vi.mock factory hoisting — 3 quy tắc:** factory bị hoist LÊN TRƯỚC mọi import + biến top-level. (1) Biến top-level thường → TDZ error khi factory chạy → **PHẢI** dùng `vi.hoisted`. (2) Import binding (vd `createElement` từ `react`) → **OK** vì factory chạy lazy khi module bị import, và `react` đứng trước `./page` trong source order nên đã init. (3) **JSX trong factory = lỗi** ("jsx is not defined" — auto jsx-runtime import cũng bị hoist sau factory) → dùng `createElement(...)` thay JSX. VD Issue #15 mock `next/link` + `next/navigation`.
- [2026-07-15] **Windows EPERM khi `pnpm add` ghi package.json:** pnpm rename temp→package.json bị lock (file watcher/IDE giữ file). node_modules + lockfile vẫn được pnpm ghi **trước** khi package.json fail. Fix: edit package.json thủ công match lockfile `importers` section, rồi `pnpm install --frozen-lockfile` confirm "Already up to date". VD Issue #15.
