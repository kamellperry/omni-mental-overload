FROM oven/bun:1.2.20 as deps
WORKDIR /app
COPY package.json bun.lockb* tsconfig.json ./
RUN bun install

FROM oven/bun:1.2.20 as app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
EXPOSE 3000
CMD ["bun", "run", "dev"]
