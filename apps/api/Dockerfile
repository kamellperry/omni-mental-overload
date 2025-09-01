FROM oven/bun:1.2.20 as deps
WORKDIR /app
COPY package.json bun.lockb* tsconfig.json ./
RUN bun install

FROM oven/bun:1.2.20 as app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma clients for core DB and auth DB
RUN bunx prisma generate \
  && bunx prisma generate --schema prisma/auth/schema.prisma
EXPOSE 3000
CMD ["bun", "run", "dev"]
