import { Prisma } from '../../generated/prisma/client';
import { getPrisma } from '../../db/prisma';

const scoreSql = Prisma.sql`
  LEAST(
    100,
    GREATEST(
      0,
      (pf.followers / 100),
      0
    )
    + CASE WHEN pf."hasLink" IS TRUE THEN 5 ELSE 0 END
    + COALESCE((pf.features ->> 'caption_count')::int, 0)
    + COALESCE((pf.features ->> 'link_domains_count')::int, 0)
  )
`;

export async function upsertInBounds(campaignId: string, where: Prisma.Sql): Promise<number> {
  const prisma = getPrisma();
  const affected = await prisma.$executeRaw`
    INSERT INTO "CampaignCandidate" AS cc ("campaignId", "username", "candidateScoreCheap", "updatedAt")
    SELECT ${campaignId}, pf."username", ${scoreSql}, now()
    FROM "ProfileFeatures" pf
    WHERE ${where}
    ON CONFLICT ("campaignId", "username") DO UPDATE
    SET "candidateScoreCheap" = EXCLUDED."candidateScoreCheap", "updatedAt" = now();
  `;
  return Number(affected ?? 0);
}

export async function evictOutOfBounds(campaignId: string, where: Prisma.Sql): Promise<number> {
  const prisma = getPrisma();
  const affected = await prisma.$executeRaw`
    DELETE FROM "CampaignCandidate" cc
    USING "ProfileFeatures" pf
    WHERE cc."campaignId" = ${campaignId}
      AND pf."username" = cc."username"
      AND NOT (${where});
  `;
  return Number(affected ?? 0);
}

export async function refreshCandidates(
  campaignId: string,
  where: Prisma.Sql,
): Promise<RefreshCandidatesResult> {
  const upserted = await upsertInBounds(campaignId, where);
  const evicted = await evictOutOfBounds(campaignId, where);
  return { upserted, evicted };
}

export interface RefreshCandidatesResult {
  upserted: number;
  evicted: number;
}
