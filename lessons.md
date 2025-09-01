# Lessons

- Prefer stable JSON + sha256 for criteria hashing to keep Node/Python cache keys consistent across services.
- Keep routers thin; all domain logic in services, DB I/O in repos, and queue I/O wrapped in a jobs service.
- Use Prisma client from generated path (`src/generated/prisma`) via a small `db/prisma.ts` wrapper to avoid import drift.
- BullMQ v4 removes QueueScheduler; repeatables are registered directly via `Queue.add` with `repeat` and a stable `jobId`.
- Use a short-leased Redis lock for scheduler boot to avoid duplicate registrations when scaling workers.
- If we later expand criteria fields, extend MinimalCriteria and the accessors in @apps/api/src/features/candidates/candidate.compiler.ts accordingly.

Updated: 2025-08-30
