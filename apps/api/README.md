# API

Bun + Express + Prisma + BullMQ

## Dev
```bash
bun install
bunx prisma generate
bunx prisma migrate dev --name init
bun run dev
bun run queue:worker
```
