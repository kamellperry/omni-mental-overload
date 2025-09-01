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
      type: data.type,
      status: data.status ?? 'queued',
      ...(data.campaignId !== undefined ? { campaignId: data.campaignId } : {}),
      ...(data.key !== undefined ? { key: data.key } : {}),
    },
  });
};

export const findJob = async (id: string) => {
  const prisma = getPrisma();
  return prisma.job.findUnique({ where: { id } });
};

export const markStarted = async (id: string) => {
  const prisma = getPrisma();
  return prisma.job.update({ where: { id }, data: { status: 'started', startedAt: new Date(), errorText: null } });
};

export const markCompleted = async (id: string) => {
  const prisma = getPrisma();
  return prisma.job.update({ where: { id }, data: { status: 'completed', finishedAt: new Date() } });
};

export const markFailed = async (id: string, errorText: string) => {
  const prisma = getPrisma();
  return prisma.job.update({ where: { id }, data: { status: 'failed', finishedAt: new Date(), errorText } });
};
