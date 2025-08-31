import 'dotenv/config';
<<<<<<< HEAD
import { Worker, QueueScheduler, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { getPlatformHeaders, invalidatePlatformHeaders } from './lib/pydoll';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

new QueueScheduler('crawl', { connection });
new QueueScheduler('qualify', { connection });
new QueueScheduler('dispatch', { connection });

new Worker('crawl', async (job: Job) => {
  const { campaignId, seed_type, seed_value, crawl_config } = job.data as {
    campaignId: string;
    seed_type: string;
    seed_value: string;
    crawl_config?: any;
  };
  console.log('crawl job', job.id, campaignId, seed_type, seed_value);

  // Determine platform/host (IG default for now)
  const platform = 'ig';
  const account = process.env.IG_ACCOUNT_ID || 'default';
  const host = 'www.instagram.com';

  let headers: Record<string, string> | undefined = undefined;
  try {
    headers = await getPlatformHeaders(connection, platform, account, host);
    console.log('pydoll.headers.get', { platform, account, host, hit: !!headers });
  } catch (e) {
    console.error('pydoll.headers.get.failed', { platform, account, host, error: String(e) });
  }

  const crawlerUrl = (process.env.CRAWLER_URL || 'http://crawler:8000').replace(/\/$/, '');
  const body = JSON.stringify({
    seed_type,
    seed_value,
    crawl_config: { ...(crawl_config || {}), mode: 'real', headers },
  });

  let ok = false;
  try {
    const resp = await fetch(`${crawlerUrl}/crawl/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    ok = resp.ok;
    if (!ok) {
      // Invalidate on common auth/rate issues
      if (resp.status === 401 || resp.status === 403) {
        await invalidatePlatformHeaders(connection, platform, account, host);
      }
      console.error('crawler.post.error', { status: resp.status });
    } else {
      console.log('crawler.job.posted', { jobId: job.id, seed_type, seed_value });
    }
  } catch (e) {
    console.error('crawler.post.failed', { error: String(e) });
  }

  await prisma.job.update({ where: { id: String(job.id) }, data: { status: ok ? 'completed' : 'failed' } });
}, { connection });

new Worker('qualify', async (job: Job) => {
  const { campaignId, batch_size, use_llm } = job.data;
  console.log('qualify job', job.id, campaignId, batch_size, use_llm);
  await prisma.job.update({ where: { id: String(job.id) }, data: { status: 'completed' } });
}, { connection });

new Worker('dispatch', async (job: Job) => {
  console.log('dispatch job', job.id);
}, { connection });
=======
import './workers/index';
>>>>>>> dev
