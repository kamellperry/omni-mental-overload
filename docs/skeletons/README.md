These Python skeletons are reference implementations to jump‑start work on the Account Manager pattern without changing any existing schemas or public APIs in this repo.

Important
- Standalone only: none of these files are imported by the current services.
- No DB migrations: in‑memory storage is used in the Account Manager example.
- Safe to review and delete: they exist under `docs/skeletons/` for design discussion.

Files
- `account_manager_service.py`: FastAPI service exposing private endpoints to save a session bundle, return host‑ready headers, refresh, and status. Uses in‑memory storage (no schema changes).
- `orchestrator_client.py`: Small httpx client for the orchestrator to call the Account Manager (`get_headers`, `refresh`).
- `redis_semaphore.py`: Minimal Redis semaphore helper (per‑account concurrency caps). Optional import — provides a no‑op fallback.
- `logging_redactor.py`: Logger filter that redacts secrets (Cookie, Authorization, X‑IG‑*).
- `metrics.py`: Prometheus metrics skeleton (no‑op fallback if library missing).

None of these files alter the current API or database schema; they are design‑time scaffolding.

