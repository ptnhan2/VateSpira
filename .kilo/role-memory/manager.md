# Manager Memory

## User Preferences
<!-- Ghi khi User express preference -->

## Sprint Patterns
<!-- Ghi sau retro -->

## Release Rules
<!-- Ghi sau release -->

## Lessons Learned

### [2026-07-11] gh project field-list khong tra ve project ID
- **Pitfall:** `gh project field-list N --format json` tra ve `{ fields, totalCount }` — KHONG co top-level `id`. Dung `$fields.id` = null.
- **Impact:** `gh project item-edit --project-id null` → error "no changes to make" → Kanban items khong move duoc → workflow stuck.
- **Fix:** Project ID lay tu `gh project list --owner OWNER --format json` → moi project co `id` (VD `PVT_kwHODDVJA84BcuPW`) + `number` (VD `5`). Dung `id` do cho `--project-id`.
- **Snippet dung:**
  ```powershell
  $proj = gh project list --owner ptnhan2 --format json | ConvertFrom-Json
  $projectId = ($proj.projects | Where-Object { $_.number -eq 5 }).id
  $fields = gh project field-list 5 --owner ptnhan2 --format json | ConvertFrom-Json
  $statusField = $fields.fields | Where-Object { $_.name -eq 'Status' }
  $inProgress = ($statusField.options | Where-Object { $_.name -eq 'In Progress' }).id
  gh project item-edit --id <item-id> --field-id $statusField.id --project-id $projectId --single-select-option-id $inProgress
  ```
- **Ghi nho:** Project ID != Field-list output. Luon lay tu `gh project list`.

### [2026-07-14] Worker thuong bo sot process gates (local-review, visual proof)
- **Pitfall:** Worker #1 (Issue #1) bo sot `/local-review: PASS` (Gate R2.0) va `## VISUAL PROOF` section (Gate R2.3) trong PR body.
- **Impact:** Reviewer phai compensate bang independent verification. APPROVE vi technical pass all AC, nhung ton thoi gian.
- **Fix:** Nhac Worker tuan thu process gates trong prompt. Them vao template: PR body phai co /local-review: PASS + VISUAL PROOF.
- **Ghi nho:** Process gates thuong bi bo sot — Reviewer APPROVE voi note, khong circular reject.