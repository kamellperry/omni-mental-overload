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
bun run dev & bun run queue:worker

cd ../crawler
uv sync
uv run fastapi dev app/main.py
```

Or run everything via Docker:

```bash
docker compose up --build
```

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
