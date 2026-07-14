# Reviewer Memory

## Review Patterns
- [2026-07-14] **Tailwind v4 design-system PRs:** verify tokens via `getComputedStyle` (computed styles trong browser), KHONG chi doc CSS source. `@theme inline` mapping co the dung trong CSS nhung khong sinh utility neu sai cu phap. Check: body backgroundColor, color, logo color, font-family. VD Issue #1: light bg rgb(251,250,246)=#fbfaf6, dark bg rgb(26,26,26)=#1a1a1a - match design doc section 8.2.
- [2026-07-14] **Theme toggle verification:** test 3 thu - (1) click toggle -> data-theme attr doi + tokens swap, (2) localStorage persist, (3) reload -> init script restore (FOUC prevention). Dung Playwright browser_evaluate de check computed styles sau moi buoc. VD Issue #1.
- [2026-07-14] **"Installed + basic via starter-kit" AC:** satisfied boi package.json + starter-kit bundled extensions (bold/italic/heading trong lockfile). KHONG block foundation PR vi thieu editor UI rendered - editor la scope UF-4. Nhuoc note nhu MINOR follow-up.
- [2026-07-14] **FOUC-free theme pattern (Tailwind v4 + Next.js Server Component):** blocking script trong head set data-theme tu localStorage truoc paint + suppressHydrationWarning tren html. @custom-variant dark thay vi prefers-color-scheme. Pattern dung, accept.

## Common Rejection Reasons
<!-- Ghi khi reject -->

## Lessons Learned
- [2026-07-14] **`gh pr checkout` fail khi branch da trong worktree:** error "already used by worktree at .kilo/worktrees/...". Fix: lam viec truc tiep trong worktree dir (git -C <worktree>, chay build/dev trong worktree/frontend). VD Issue #1.
- [2026-07-14] **Process gates (R2.0 self-review, R2.3 visual proof) thuong bi Worker bo sot:** PR body chi "Closes #N" ma thieu /local-review: PASS + VISUAL PROOF section. Neu technical work pass tat ca AC + behavior verified independently -> APPROVE voi note, KHONG circular reject. Nhung bao Manager nhac Worker tuan thu cho PR sau.
- [2026-07-14] **Kanban move post-merge:** dung `gh project item-edit` voi project-id tu `gh project list` (KHONG phai field-list), status field ID + Done option ID tu `gh project field-list`. Item ID tu `gh project item-list` filter theo content.number. VD Issue #1: Done=98236657.
