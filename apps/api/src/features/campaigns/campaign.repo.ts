import { getPrisma } from '../../db/prisma';
import type { Prisma } from '../../generated/prisma/client';

export const createCampaign = async (
  name: string,
  criteria: Prisma.InputJsonValue,
  criteriaHash: string,
) => {
  const prisma = getPrisma();
  return prisma.campaign.create({ data: { name, criteria, criteriaHash } });
};
