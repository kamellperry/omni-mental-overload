import { createQueue, getConnection } from '../lib/queue';
import { getPrisma } from '../db/prisma';

const connection = getConnection();
const prisma = getPrisma();

const qualifyQ = createQueue('qualify');
const dispatchQ = createQueue('dispatch');
const feedbackQ = createQueue('feedback');
const crawlQ = createQueue('crawl');

async function acquireSchedulerLock(): Promise<boolean> {
  const key = 'locks:scheduler';
  const ok = await connection.set(key, '1', 'EX', 60, 'NX');
  return ok === 'OK';
}

async function renewSchedulerLock() {
  const key = 'locks:scheduler';
  await connection.expire(key, 60);
}

export async function registerGlobalRepeatables() {
  if (process.env.SCHED_ENABLE_DISPATCH === 'true') {
    await dispatchQ.add(
      'dispatch.dm.repeat',
      {},
      {
        repeat: { pattern: process.env.SCHED_DISPATCH_CRON || '5 * * * *' },
        jobId: 'dispatch:repeat',
        removeOnComplete: true,
      },
    );
  }

  if (process.env.SCHED_ENABLE_FEEDBACK === 'true') {
    await feedbackQ.add(
      'feedback.sweep.repeat',
      {},
      {
        repeat: { pattern: process.env.SCHED_FEEDBACK_CRON || '*/15 * * * *' },
        jobId: 'feedback:repeat',
        removeOnComplete: true,
      },
    );
  }

  if (process.env.SCHED_ENABLE_CRAWL_REFRESH === 'true') {
    // Gate until seeds exist — placeholder env until seeds model exists.
    const seedsReady = process.env.SCHED_CRAWL_SEEDS_READY === 'true';
    if (seedsReady) {
      await crawlQ.add(
        'crawl.refresh.repeat',
        {},
        {
          repeat: { every: Number(process.env.SCHED_CRAWL_REFRESH_EVERY_MS || 30 * 60 * 1000) },
          jobId: 'crawl:refresh',
          removeOnComplete: true,
        },
      );
    }
  }
}

export async function registerCampaignQualify(
  campaignId: string,
  cron = process.env.SCHED_QUALIFY_CRON || '15 0 * * *',
) {
  if (process.env.SCHED_ENABLE_QUALIFY !== 'true') return;
  await qualifyQ.add(
    'qualify.campaign.repeat',
    { campaignId },
    { repeat: { pattern: cron }, jobId: `qualify:${campaignId}`, removeOnComplete: true },
  );
}

export async function removeCampaignQualify(campaignId: string) {
  const jobs = await qualifyQ.getRepeatableJobs();
  const target = jobs.find((j) => j.id === `qualify:${campaignId}`);
  if (target?.key) {
    await qualifyQ.removeRepeatableByKey(target.key);
  }
}

export async function scheduleAllActiveCampaigns() {
  const campaigns = await prisma.campaign.findMany({});
  for (const c of campaigns) {
    await registerCampaignQualify(c.id);
  }
}

export async function schedulerBoot() {
  if (!(await acquireSchedulerLock())) return; // another instance is scheduler
  await registerGlobalRepeatables();
  await scheduleAllActiveCampaigns();
  setInterval(renewSchedulerLock, 20000);
}
