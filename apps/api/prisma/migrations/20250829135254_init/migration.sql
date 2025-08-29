-- CreateTable
CREATE TABLE "public"."Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "criteriaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "campaignId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "qualified" BOOLEAN NOT NULL,
    "reasons" JSONB NOT NULL,
    "qualifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("campaignId","username")
);

-- CreateTable
CREATE TABLE "public"."Job" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "key" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorText" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CampaignCandidate" (
    "campaignId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "candidateScoreCheap" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignCandidate_pkey" PRIMARY KEY ("campaignId","username")
);

-- CreateTable
CREATE TABLE "public"."LLMScore" (
    "campaignId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profileHash" TEXT NOT NULL,
    "criteriaHash" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMScore_pkey" PRIMARY KEY ("campaignId","username","profileHash","criteriaHash")
);

-- CreateTable
CREATE TABLE "public"."ProfileRaw" (
    "username" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "ProfileRaw_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "public"."ProfileFeatures" (
    "username" TEXT NOT NULL,
    "followers" INTEGER NOT NULL,
    "engagement" DOUBLE PRECISION,
    "lang" TEXT,
    "country" TEXT,
    "hasLink" BOOLEAN,
    "recentActivityAt" TIMESTAMP(3),
    "features" JSONB NOT NULL,
    "versionHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileFeatures_pkey" PRIMARY KEY ("username")
);

-- CreateIndex
CREATE INDEX "Lead_campaignId_score_idx" ON "public"."Lead"("campaignId", "score");

-- CreateIndex
CREATE INDEX "Job_campaignId_idx" ON "public"."Job"("campaignId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "public"."Job"("status");

-- CreateIndex
CREATE INDEX "CampaignCandidate_campaignId_candidateScoreCheap_idx" ON "public"."CampaignCandidate"("campaignId", "candidateScoreCheap");

-- CreateIndex
CREATE INDEX "LLMScore_campaignId_idx" ON "public"."LLMScore"("campaignId");

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CampaignCandidate" ADD CONSTRAINT "CampaignCandidate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
