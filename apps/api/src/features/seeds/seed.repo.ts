import { getPrisma } from '../../db/prisma';
import type { SeedType, CrawlSeed } from '../../generated/prisma/client';

export const createSeed = async (
  campaignId: string,
  type: SeedType,
  value: string,
  enabled = true,
): Promise<CrawlSeed> => {
  const prisma = getPrisma();
  return prisma.crawlSeed.create({ data: { campaignId, type, value, enabled } });
};

export const countEnabled = async (): Promise<number> => {
  const prisma = getPrisma();
  return prisma.crawlSeed.count({ where: { enabled: true } });
};

export const listEnabled = async () => {
  const prisma = getPrisma();
  return prisma.crawlSeed.findMany({ where: { enabled: true } });
};

export const listEnabledByCampaign = async (campaignId: string) => {
  const prisma = getPrisma();
  return prisma.crawlSeed.findMany({ where: { campaignId, enabled: true } });
};

