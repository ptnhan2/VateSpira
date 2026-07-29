# Manager Memory

## User Preferences
<!-- Ghi khi User express preference -->

## Sprint Patterns
<!-- Ghi sau retro -->

## Release Rules
<!-- Ghi sau release -->

## Lessons Learned

### [2026-07-11] gh project field-list không trả về project ID
- **Pitfall:** `gh project field-list N --format json` trả về `{ fields, totalCount }` — KHÔNG có top-level `id`. Dùng `$fields.id` = null.
- **Impact:** `gh project item-edit --project-id null` → error "no changes to make" → Kanban items không move được → workflow stuck.
- **Fix:** Project ID lấy từ `gh project list --owner OWNER --format json` → mỗi project có `id` (VD `PVT_kwHODDVJA84BcuPW`) + `number` (VD `5`). Dùng `id` đó cho `--project-id`.
- **Snippet đúng:**
  ```powershell
  $proj = gh project list --owner ptnhan2 --format json | ConvertFrom-Json
  $projectId = ($proj.projects | Where-Object { $_.number -eq 5 }).id
  $fields = gh project field-list 5 --owner ptnhan2 --format json | ConvertFrom-Json
  $statusField = $fields.fields | Where-Object { $_.name -eq 'Status' }
  $inProgress = ($statusField.options | Where-Object { $_.name -eq 'In Progress' }).id
  gh project item-edit --id <item-id> --field-id $statusField.id --project-id $projectId --single-select-option-id $inProgress
  ```
- **Ghi nhớ:** Project ID != Field-list output. Luôn lấy từ `gh project list`.

### [2026-07-14] Manager duyệt plan quá dễ — không kiểm AC interpretation
- **Pitfall:** Manager (tôi) duyệt UF-1a plan 8/8 PASS, nhưng Worker đánh "scaffold codex = pass" khi chỉ insert 1 DB row. Scaffold thật = tạo initial manuscript/memory files + codex entries. Worker diễn giải AC lỏng để claim pass.
- **Impact:** Nếu không catch → Worker code sai scope → Reviewer phải compensate → tốn thời gian. User phải tự review thay Manager.
- **Fix:** Khi review plan, cho mỗi AC: hỏi "Worker có thực sự pass AC không, hay diễn giải lỏng?" Đặc biệt AC có từ "scaffold", "setup", "init" — kiểm tra có action thật hay chỉ là DB insert.
- **Ghi nhớ:** Duyệt plan không phải tick box 8/8. Phải verify AC interpretation thật, không chỉ check "có mention AC không".

### [2026-07-14] Worker thường bỏ sót process gates (local-review, visual proof)
- **Pitfall:** Worker #1 (Issue #1) bỏ sót `/local-review: PASS` (Gate R2.0) và `## VISUAL PROOF` section (Gate R2.3) trong PR body.
- **Impact:** Reviewer phải compensate bằng independent verification. APPROVE vì technical pass all AC, nhưng tốn thời gian.
- **Fix:** Nhắc Worker tuân thủ process gates trong prompt. Thêm vào template: PR body phải có /local-review: PASS + VISUAL PROOF.
- **Ghi nhớ:** Process gates thường bị bỏ sót — Reviewer APPROVE với note, không circular reject.


## Sprint 1 Retrospective (2026-07-15) — Foundation + UF-1

### START (Bắt đầu làm)
- Resource Check trước khi dispatch Worker (đã thêm vào agent prompt Bước 8.5)
- E2E test với real credentials, không chỉ mock (đã thêm Golden Rule vào worker-agent.md)
- Reviewer test trên PR branch, không test trên main (đã thêm BRANCH CHECK)
- Setup script tự động copy .env sang worktree (đã tạo .kilo/setup-script.ps1)

### STOP (Dừng làm)
- Manager duyệt plan quá dễ — không kiểm AC interpretation thật (lesson 2026-07-14)
- Worker bỏ sót process gates: /local-review: PASS + VISUAL PROOF (lesson 2026-07-14)
- Tự ý đổi tên file không xin phép User (lesson: role-memory *-memory.md rename)
- Dùng PowerShell để ghi file tiếng Việt (strip dấu) — dùng Python

### CONTINUE (Tiếp tục)
- Reviewer evidence-grounded review (AC-to-code traceability + 5 risk areas)
- TDD: Worker viết test trước, Red-Green pattern
- doc-sync sau mỗi merge: ARCHITECTURE.md + AGENTS.md + FEATURES.md sync code reality
- Direction A (Raw Elegance) design tokens consistent across FE

### Action Items
1. [ ] Manager: verify AC interpretation thật khi review plan (không tick box 8/8)
2. [ ] Worker: PR body phải có /local-review: PASS + VISUAL PROOF section
3. [ ] Tất cả: ghi file tiếng Việt bằng Python (utf-8), KHÔNG dùng PowerShell


### [2026-07-15] Worker prompt phải chỉ định agent type
- **Pitfall:** Manager sinh Worker prompt nhưng không nói User switch sang agent nào (worker vs fe-dev vs reviewer).
- **Impact:** User paste prompt vào sai agent → quy trình sai (fe-dev task chạy worker flow, hoặc ngược lại).
- **Fix:** Mỗi Worker prompt phải ghi rõ: "switch to agent `worker`" hoặc "switch to agent `fe-dev`". Template prompt thêm dòng: "**Agent:** `worker` / `fe-dev`"
- **Ghi nhớ:** worker = full-stack (BE + FE), fe-dev = FE-only bug fixes nhỏ. Reviewer = review only (Manager gọi qua Task tool, User không cần switch).

### [2026-07-28] E2E BẮT BUỘC trước merge — tôi bypass 3 lần, User gọi ra đúng
- **Pitfall:** Tôi (Manager) đã bypass E2E requirement 3 lần trong session (UF-3b, UF-4b, Issue #31). Mỗi lần: Worker báo E2E chưa xong / verify subagent FAILED → tôi accept unit tests + merge anyway.
- **Impact:** Bugs phát hiện SAU merge (Issue #31: proposed prose không hiện, agent stuck) → phải tạo fix PR riêng → tốn thởi gian redo. User phải tự chỉ ra vấn đề.
- **Fix:** E2E là BẮT BUỘC trước merge. KHÔNG bypass. Nếu E2E chưa pass → KHÔNG merge, yêu cầu Worker fix. Manager bypass = vi phạm quy trình (đã ghi corrections.md `verify_subagent_failed_bypass`).
- **Ghi nhớ:** "Chưa test sao không test mà lại merge?" — User đúng. E2E trước merge, KHÔNG có exception.

### [2026-07-28] Full-stack approach (1 worker per feature, KHÔNG FE/BE split)
- **Pitfall:** FE/BE split trong 1 feature → integration bugs (API mismatch, HITL split, get_novel signature change, scene outline threading). Agents KHÔNG communicate được → Worker BE thay đổi → Worker FE không biết → code theo assumption cũ.
- **Impact:** UF-4 = 4 PRs, ~4750 dòng, cho 1 feature. Overhead Manager: 4 plan reviews, 4 verify, 4 merges, 4 doc-syncs. Integration bugs phải fix riêng (Issue #28, #31).
- **Fix:** 1 full-stack Worker per feature (Worker handles cả backend/ + frontend/ + supabase/). Parallel ACROSS features (UF-5 + UF-6), KHÔNG within feature. Worker tự test integration (start cả langgraph dev + FE dev).
- **Ghi nhớ:** Consensus industry (Cursor, Devin, OpenHands): 1 agent per feature. Parallel across features, not within feature.