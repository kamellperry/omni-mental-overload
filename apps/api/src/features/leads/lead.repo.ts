import { getPrisma } from '../../db/prisma';
import type { Lead } from '../../generated/prisma/client';

export const listByCampaign = async (
  campaignId: string,
  take: number,
): Promise<Lead[]> => {
  const prisma = getPrisma();
  return prisma.lead.findMany({ where: { campaignId }, take, orderBy: { score: 'desc' } });
};

