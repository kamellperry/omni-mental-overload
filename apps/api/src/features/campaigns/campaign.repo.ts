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

export const setActive = async (id: string, active: boolean) => {
  const prisma = getPrisma();
  return prisma.campaign.update({ where: { id }, data: { active } });
};

export const softDelete = async (id: string) => {
  const prisma = getPrisma();
  return prisma.campaign.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
};

export const restore = async (id: string) => {
  const prisma = getPrisma();
  return prisma.campaign.update({ where: { id }, data: { active: true, deletedAt: null } });
};
