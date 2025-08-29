# Lessons

- Prefer stable JSON + sha256 for criteria hashing to keep Node/Python cache keys consistent across services.
- Keep routers thin; all domain logic in services, DB I/O in repos, and queue I/O wrapped in a jobs service.
- Use Prisma client from generated path (`src/generated/prisma`) via a small `db/prisma.ts` wrapper to avoid import drift.

Updated: 2025-08-29

