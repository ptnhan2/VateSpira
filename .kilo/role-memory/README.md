# .kilo/role-memory/ — Role Memory

> Memory files cho từng role. Auto-load theo role (Manager auto-load manager-memory.md, Worker auto-load worker-memory.md, etc.).
> ⚠️ Role isolation: KHÔNG đọc file của role khác.

| Role | File | Auto-load | Nội dung |
|------|------|-----------|----------|
| Manager | manager-memory.md | ✅ Manager | User preferences, sprint patterns, release rules, lessons |
| Worker | worker-memory.md | ✅ Worker | Codebase patterns, conventions, lessons, pitfalls |
| FE Dev | fe-dev-memory.md | ✅ FE Dev | Design preferences, component patterns, UI conventions |
| Reviewer | reviewer-memory.md | ✅ Reviewer | Review patterns, common rejection reasons, lessons |

## Rules
- Chỉ role sở hữu file được ghi vào file đó.
- Manager có thể ghi vào mọi file (nhưng hạn chế — respect role isolation).
- Ghi bằng /learn skill hoặc Gate WRITE-M (sau merge).
- KHÔNG ghi secrets/API keys.
