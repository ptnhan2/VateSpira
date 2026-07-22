# Worker Memory

## Codebase Patterns
<!-- Ghi khi phát hiện pattern -->

## Conventions
<!-- Ghi khi học convention -->

## Lessons Learned
<!-- Ghi sau mỗi task -->

### [2026-07-18] Issue #31 — HITL interrupt handling bugs
- **Bug 1 (handleSend):** `onInterrupt` set `proposedProse` nhưng quên `setView("editor")` → EditorPanel không render khi HITL từ chat input. Fix: thêm `setView("editor")`.
- **Bug 2 (handleApprove/handleReject):** resume callbacks thiếu `onInterrupt` → khi agent re-interrupt sau resume (write_file conflict HOẶC rubric revision → re-propose), event bị drop → isStreaming stuck true → UI freeze. Fix: thêm `onInterrupt` handler vào cả 2 resume callbacks.
- **Fix 3 (handleReject onComplete):** thiếu `setView("plot")` (handleApprove có) → editor kẹt sau reject+complete. Fix: thêm `setView("plot")`.
- **Fix 4 (agent prompt):** LLM extract UUID truncated từ user message → get_novel crash. novel_id đã có trong context. Fix: prompt "rely on context novel_id, ignore user-mentioned UUIDs".
- **E2E flow verified:** chat → HITL → editor hiện prose (Bug 1) → reject → rubric revision → re-interrupt → buttons reappear (Bug 2) → reject again → complete → view→plot (Fix 3).

## Pitfalls
<!-- Ghi khi gặp lỗi/traps -->

### [2026-07-18] Vitest 4 + jsdom KHÔNG apply Tailwind CSS classes
- **Pitfall:** `toBeVisible()` không phát hiện Tailwind `hidden` class (display:none) vì jsdom không chạy CSS stylesheet. Test asserting `getByTestId("plot-content")).toBeVisible()` PASS ngay cả khi div có class "hidden".
- **Fix:** Dùng element presence/absence thay vì visibility: `expect(screen.queryByText("✕ Đóng")).not.toBeInTheDocument()` — EditorPanel unmounted khi view=plot. VD Issue #31 Fix 3 test.
- **Ghi nhớ:** jsdom = no CSS. Assert presence/absence của conditional-rendered elements, không assert visibility dựa trên CSS classes.

### [2026-07-18] Next.js 16 Turbopack cold-start 404 cho nested dynamic API routes
- **Pitfall:** Route `frontend/src/app/api/novels/[id]/write/resume/route.ts` trả 404 trên first hit sau `pnpm dev` start. FE logs: `POST /api/novels/[id]/write/resume 404`. Route file hợp lệ (93 dòng, POST handler).
- **Fix:** Restart FE dev server (`background_process restart`) → route register → 200. KHÔNG fixable bằng code — Turbopack cold-start issue với nested dynamic API routes.
- **Impact:** E2E test resume flow fails trên cold start. Luôn restart FE dev server trước khi E2E test resume/approve flow.
- **Ghi nhớ:** Nếu API route 404 trên Turbopack dev nhưng file tồn tại + valid → restart dev server.

### [2026-07-18] handleSend tạo new thread per message — no conversation continuity
- **Pitfall:** `streamWrite` → route `client.threads.create()` mỗi lần → mỗi chat message là fresh agent (no memory of prior messages). Multi-turn chat không work — agent hỏi lại context.
- **Impact:** E2E multi-turn khó — agent mất context sau mỗi message. Phải gửi 1 message directive duy nhất để trigger write_file.
- **Ghi nhớ:** Pre-existing architecture issue (out of scope #31). Đề xuất Issue mới: reuse threadId cho multi-turn chat.
