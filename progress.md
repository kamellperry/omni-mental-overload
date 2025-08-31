# Progress

- Phase 0: API scaffolding complete (routers/services/repos/lib/db).
- Workers: crawl/qualify/dispatch/feedback stubs wired with typed payloads and job status transitions.
- Scheduler: repeatables registered with Redis lock and stable jobIds; per-campaign qualify on create.
- Next: Candidate maintenance (predicate compile + upsert/evict) and wiring to crawl/enrich.

Owner: You (orchestrator)
Updated: 2025-08-30
