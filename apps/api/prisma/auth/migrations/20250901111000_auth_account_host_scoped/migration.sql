-- CreateTable: AuthAccount
CREATE TABLE "public"."AuthAccount" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'pydoll',
    "providerAccountId" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "proxy" TEXT NOT NULL,
    "status" "public"."AuthStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint for (platform, account)
CREATE UNIQUE INDEX "AuthAccount_platform_account_key" ON "public"."AuthAccount"("platform", "account");

-- AlterTable: AuthSession (add account linkage and snapshot fields)
ALTER TABLE "public"."AuthSession"
  ADD COLUMN     "accountId" TEXT,
  ADD COLUMN     "proxy" TEXT,
  ADD COLUMN     "providerSessionId" TEXT;

-- Index on accountId for faster lookups
CREATE INDEX "AuthSession_accountId_idx" ON "public"."AuthSession"("accountId");

-- Add foreign key from AuthSession.accountId -> AuthAccount.id
ALTER TABLE "public"."AuthSession"
  ADD CONSTRAINT "AuthSession_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "public"."AuthAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

