-- AlterEnum
ALTER TYPE "public"."SeedType" ADD VALUE 'hashtag';

-- AlterTable
ALTER TABLE "public"."Campaign" ADD COLUMN     "criteriaWhere" TEXT;
