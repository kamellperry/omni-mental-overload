# Agent User Instructions (Do not ignore, read in full)

Purpose: consistent, simple, and fast code. Small modules. Clear boundaries. No redundancy. No thousand-line files.

## Repository layout

```bash
/             root config and docs
/apps/api     Bun + Express + Prisma + BullMQ
/apps/crawler uv + FastAPI + curl_cffi
/packages     optional shared libs later
/scripts      project scripts
```

Keep API and crawler independent. Shared DB schema lives with API.

## General rules

* Keep files under \~400 lines. Split earlier if logical seams appear.
* One export of concern per file. Prefer named exports.
* Kebab-case file names. PascalCase for types and classes. camelCase for functions and variables.
* No commented-out code. Comments explain why, not what.
* Fail fast on bad input. Validate at edges.
* Errors bubble with context. No silent catches.
* All async I/O is cancellable or time-bounded.
* Feature-first structure. Routes thin. Services pure.
* Tests near code. Unit where logic lives. Integration at app boundary.

## API service (TypeScript, Bun)

### Structure

```bash
apps/api/src/
  http/            routers and middlewares only
  features/        domain modules (services, schemas, repos)
  workers/         BullMQ processors and schedulers
  lib/             cross-cutting utils
  db/              Prisma client wrapper
```

Routers import feature barrels only. Features depend on db and lib. Workers reuse feature services.

### Type and validation

* Enable strict mode. ABSOLUTELY NO `any`. Allow `unknown` at boundaries.
* Validate all inputs with Zod. Derive types from schemas.
* Use discriminated unions for state machines.
* Narrow errors with custom error classes.

### Style

* Prefer `async/await`. No floating promises. Wrap with `void` only in fire-and-forget jobs.
* Never mix default and named exports in one module.
* Pure functions in services. No HTTP or process globals inside services.
* One router per domain. No deep nesting.

### File placement

```bash
features/users/
  index.ts            # barrel
  user.schema.ts      # zod schemas
  user.service.ts     # domain logic
  user.repo.ts        # Prisma queries
  user.worker.ts      # job handlers if needed
http/users.router.ts  # routes mapping -> service
```

### Tooling and commands

* Type check: `bunx tsc --noEmit`
* Lint: ESLint or Biome. Pick one.

  * ESLint: `bunx eslint .`
  * Biome: `bunx @biomejs/biome lint .`
* Format: Prettier or Biome.

  * Prettier: `bunx prettier -w .`
  * Biome: `bunx @biomejs/biome format -w .`
* Test: `bun test`
* Start: `bun run dev`

### ESLint preset (example .eslintrc.json)

```json
{
  "root": true,
  "env": { "es2022": true, "node": true },
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "max-lines": ["error", { "max": 400, "skipBlankLines": true, "skipComments": true }],
    "max-lines-per-function": ["error", 80]
  }
}
```

### Prettier preset (example)

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

### Biome alternative (biome.json)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.7.0/schema.json",
  "formatter": { "lineWidth": 100 },
  "linter": { "rules": { "style": { "useConsistentTypeImports": "error" } } }
}
```

### Prisma

* Keep schema in `apps/api/prisma/`.
* One migration per PR. Name clearly.
* No raw SQL in services. Put complex queries in `*.repo.ts` with typed helpers.

### BullMQ

* One queue per domain. Processor files under `workers/`.
* Rate limit per account via group keys.
* Repeatables for crawl, qualify, dispatch, feedback sweep.

## Crawler service (Python, uv)

### Structure

```bash
apps/crawler/app/
  api/            FastAPI routers only
  core/           domain logic and orchestration
  io/             DB and HTTP clients
  models/         Pydantic models and schemas
  workers/        background tasks
```

Routers call core. Core uses io and models. No DB or HTTP inside routers.

### Style

* Python 3.11+. Use `typing` and `pydantic` v2 models.
* ruff for lint and format. mypy for static types.
* No global state. Pass dependencies through function args or small containers.
* Use `async` I/O where practical. Bounded concurrency.
* Structured logging with JSON lines.

### Tooling and commands

* Install: `uv sync`
* Run dev: `uv run fastapi dev app/main.py`
* Lint: `uv run ruff check .`
* Format: `uv run ruff format .`
* Type check: `uv run mypy app`
* Test: `uv run pytest -q`

### ruff (pyproject.toml excerpt)

```toml
[tool.ruff]
line-length = 100
select = ["E","F","I","UP","B","SIM","PL"]
ignore = ["E501"]

[tool.ruff.format]
quote-style = "single"

[tool.mypy]
python_version = "3.11"
strict = true
warn_unused_ignores = true
warn_return_any = true
warn_unreachable = true
```

### FastAPI

* Keep route modules small. Only request parsing and response mapping.
* Pydantic models validate inputs and outputs.
* No DB calls in route functions. Use core services.

### DB I/O

* `asyncpg` for Postgres. One module for queries. Use connection pools.
* Parameterize all queries. No string concat SQL.
* Idempotent upserts for profiles and features.

### HTTP and scraping

* `curl_cffi` for resilient HTTP. Centralize headers and retry policy.
* Backoff and jitter. Respect per-domain concurrency caps.
* Compute and store `content_hash` and `version_hash` on write.

## Testing

* Unit tests for services and repos. Mock I/O at boundaries.
* API contract tests for routers.
* Golden tests for LLM prompts and output parsing.
* Smoke tests for queues and schedulers.

## CI pipeline order

1. Install deps cache.
2. Generate Prisma client.
3. `bunx tsc --noEmit` and `uv run mypy app`.
4. Lint and format check: ESLint or Biome, Ruff.
5. Unit tests: `bun test` and `uv run pytest`.
6. Build Docker images.
7. Apply Prisma migrations in staging only.

## Git and PR hygiene

* Small PRs. One concern.
* Descriptive titles. Include migration note if present.
* PR checklist: types pass, linters pass, tests pass, migrations applied locally.
* No TODOs without tracking issues.

## File and module size caps

* 400 lines per file target.
* 80 lines per function target.
* Split when a module has more than about 10 exports.

## Naming and boundaries

* Mirror the Remix-style conventions for clarity: thin routes, feature barrels, service separation, and kebab-case files.
* Keep API routes and workers minimal. Domain logic lives in services.

## Pre-commit hooks (optional)

Use lefthook or pre-commit.

```
pre-commit: bunx tsc --noEmit && bunx eslint . && bunx prettier -c .
pre-commit: uv run ruff check . && uv run mypy app
```

## Performance and safety

* Timeouts on all external calls.
* Bounded queues and backpressure.
* Cache LLM decisions by hash for TTL.
* Metrics: requests, errors, latency, queue depth.
