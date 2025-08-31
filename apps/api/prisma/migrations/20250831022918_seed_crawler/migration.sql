-- CreateEnum
CREATE TYPE "public"."SeedType" AS ENUM ('post');

-- AlterTable
ALTER TABLE "public"."Campaign" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."CrawlSeed" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "public"."SeedType" NOT NULL,
    "value" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlSeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrawlSeed_campaignId_idx" ON "public"."CrawlSeed"("campaignId");

-- CreateIndex
CREATE INDEX "CrawlSeed_enabled_idx" ON "public"."CrawlSeed"("enabled");

-- AddForeignKey
ALTER TABLE "public"."CrawlSeed" ADD CONSTRAINT "CrawlSeed_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
