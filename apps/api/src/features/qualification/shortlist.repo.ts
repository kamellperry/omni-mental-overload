import { Prisma } from '../../generated/prisma/client';
import { getPrisma } from '../../db/prisma';

export type CampaignRecord = {
  id: string;
  criteria: Prisma.JsonValue;
  criteriaHash: string;
};

export async function getCampaign(campaignId: string): Promise<CampaignRecord | null> {
  const prisma = getPrisma();
  const rec = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, criteria: true, criteriaHash: true },
  });
  return rec as CampaignRecord | null;
}

export type ShortlistItem = {
  username: string;
  versionHash: string;
  followers: number;
  recentActivityAt: Date | null;
  updatedAt: Date;
  features: Prisma.JsonValue;
};

export async function listShortlist(campaignId: string, limit: number): Promise<ShortlistItem[]> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<ShortlistItem[]>`
SELECT cc."username", pf."versionHash", pf."followers", pf."recentActivityAt", pf."updatedAt", pf."features"
FROM "CampaignCandidate" cc
JOIN "ProfileFeatures" pf ON pf."username" = cc."username"
WHERE cc."campaignId" = ${campaignId}
ORDER BY cc."candidateScoreCheap" DESC, pf."recentActivityAt" DESC NULLS LAST, pf."updatedAt" DESC
LIMIT ${limit}
`;
  return rows;
}

export async function hasRecentLLMScore(
  campaignId: string,
  username: string,
  profileHash: string,
  criteriaHash: string,
  notBefore: Date,
): Promise<boolean> {
  const prisma = getPrisma();
  const rec = await prisma.lLMScore.findFirst({
    where: { campaignId, username, profileHash, criteriaHash, createdAt: { gte: notBefore } },
    select: { campaignId: true },
  });
  return Boolean(rec);
}

export type RawProfile = {
  username: string;
  payload: Prisma.JsonValue;
};

export async function getRawProfiles(usernames: string[]): Promise<RawProfile[]> {
  if (usernames.length === 0) return [];
  const prisma = getPrisma();
  const rows = await prisma.profileRaw.findMany({
    where: { username: { in: usernames } },
    select: { username: true, payload: true },
  });
  return rows as unknown as RawProfile[];
}

export async function insertLLMScore(input: {
  campaignId: string;
  username: string;
  profileHash: string;
  criteriaHash: string;
  score: number;
  confidence: number;
  reasons: Prisma.InputJsonValue;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.lLMScore.create({
    data: {
      campaignId: input.campaignId,
      username: input.username,
      profileHash: input.profileHash,
      criteriaHash: input.criteriaHash,
      score: input.score,
      confidence: input.confidence,
      reasons: input.reasons,
    },
  });
}

export async function upsertLead(input: {
  campaignId: string;
  username: string;
  score: number;
  qualified: boolean;
  reasons: Prisma.InputJsonValue;
}): Promise<void> {
  const prisma = getPrisma();
  await prisma.lead.upsert({
    where: { campaignId_username: { campaignId: input.campaignId, username: input.username } },
    update: { score: input.score, qualified: input.qualified, reasons: input.reasons, qualifiedAt: new Date() },
    create: {
      campaignId: input.campaignId,
      username: input.username,
      score: input.score,
      qualified: input.qualified,
      reasons: input.reasons,
    },
  });
}

