-- CreateEnum
CREATE TYPE "public"."AuthStatus" AS ENUM ('active', 'revoked');

-- CreateTable
CREATE TABLE "public"."AuthSession" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "cookieJar" JSONB NOT NULL,
    "status" "public"."AuthStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthSession_platform_account_host_idx" ON "public"."AuthSession"("platform", "account", "host");

-- CreateIndex
CREATE INDEX "AuthSession_platform_account_host_status_idx" ON "public"."AuthSession"("platform", "account", "host", "status");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "public"."AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_account_idx" ON "public"."AuthSession"("account");
