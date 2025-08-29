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
