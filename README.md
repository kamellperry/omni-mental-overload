# Omni MVP Monorepo

Stacks:

- Node API: Bun + Express + Prisma + BullMQ
- Python Crawler: uv + FastAPI + curl_cffi
- Infra: Postgres, Redis, optional Ollama, Docker Compose

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres redis ollama

cd apps/api
bun install
bunx prisma generate
bunx prisma migrate dev --name init
# Optional: set up the Auth DB (separate schema and DB URL)
bunx prisma migrate dev --schema prisma/auth/schema.prisma --name init_auth_session
# Note: set AUTH_DATABASE_URL before running these, e.g.
# export AUTH_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/omni_auth
bunx prisma generate --schema prisma/auth/schema.prisma
bun run dev & bun run queue:worker

cd ../crawler
uv sync
uv run fastapi dev app/main.py
```

Or run everything via Docker:

```bash
docker compose up --build
```

## Auth via Account Manager (PyDoll)

We are centralizing social auth/session in a dedicated Account Manager (PyDoll‑backed) while keeping the crawler stateless. The orchestrator fetches host‑ready headers (cookies + UA + platform tokens) once per crawl and injects them into `crawl_config.headers`. On rare expiry, the orchestrator asks the Account Manager to refresh and retries once. No public API or schema changes are required.

- Plan: see `docs/account-manager-auth-plan.md` (goals, endpoints, flows, rollout).
- Provider contract: see `docs/pydoll-bundle-contract.md` (expected response shape, required headers, proxy format).
- Orchestrator integration (apps/api):
  - Add a small client to call the Account Manager (GET headers, POST refresh).
  - In the crawl worker, fetch headers → POST crawler `/crawl/jobs`; on `auth_expired`, refresh+retry.
- Crawler (apps/crawler):
  - Continues to use `crawl_config.headers` and host‑aware header builder; no login flows or secrets in logs.

This design keeps secrets in the Account Manager, minimizes round‑trips, and sets a clean path to support more platforms later.

## Git Workflow

### Branches

Branches will adhere to the following format

```sh
1. feature/backend/add-user-auth

2. feature/frontend/redesign-dashboard

3. fix/backend/scraper-timeout

4. chore/update-docker-deps

5. feature/fullstack/integrate-messaging-module # (For changes spanning both)
```

Scope: Aim for branches to represent a single logical unit of work (a feature, bug fix, refactor).

Importantly, a single feature branch can (and often should) contain changes in both backend/ and frontend/ if the feature requires it (e.g., new API endpoint + UI to use it).

This is a key benefit of the monorepo – atomic changes across components.

### Commits

All commits will adhere to the following format

```
fix: improve qr readability of alby payment integration

feat: Add dry run mode functionality and message display in booking process

refactor: email handler

revert: "update OOO e2e tests to remove flakiness
```

### Git Commit / Branch Format Key

- `feat`: A new feature
- `fix`: A bug fix
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `chore`: Changes to the build process or auxiliary tools and libraries such as documentation generation
- `revert`: Revert to a commit
- `wip`: Work in progress

You will most commonly use `fix`/`feat` commits and branches. If you don't know what type to use, default to one of those.

### Development Workflow

1. Create <type> branch from main

```bash
git checkout main
git pull
git checkout -b feature/your-feature-name
```

2. Make changes and commit regularly

```bash
git add .
git commit -m "type: brief description"
```

3. Keep branch updated with main

```bash
git checkout main
git pull
git checkout feature/your-feature-name
git rebase main
```

4. Push changes and create PR

```bash
git push origin feature/your-feature-name
```

<p align="right">(<a href="#top">back to top</a>)</p>
