import { getPrisma } from '../../db/prisma';
import type { Job } from '../../generated/prisma/client';

export const createJob = async (data: {
  id: string;
  campaignId?: string;
  type: string;
  status?: 'queued' | 'started' | 'completed' | 'failed';
  key?: string;
}): Promise<Job> => {
  const prisma = getPrisma();
  return prisma.job.create({
    data: {
      id: data.id,
      campaignId: data.campaignId,
      type: data.type,
      status: data.status ?? 'queued',
      key: data.key,
    },
  });
};

export const findJob = async (id: string) => {
  const prisma = getPrisma();
  return prisma.job.findUnique({ where: { id } });
};
