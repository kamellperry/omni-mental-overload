import 'dotenv/config';
import { Worker, QueueScheduler, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

new QueueScheduler('crawl', { connection });
new QueueScheduler('qualify', { connection });
new QueueScheduler('dispatch', { connection });

new Worker('crawl', async (job: Job) => {
  const { campaignId, seed_type, seed_value, crawl_config } = job.data;
  console.log('crawl job', job.id, campaignId, seed_type, seed_value, crawl_config);
  await prisma.job.update({ where: { id: String(job.id) }, data: { status: 'completed' } });
}, { connection });

new Worker('qualify', async (job: Job) => {
  const { campaignId, batch_size, use_llm } = job.data;
  console.log('qualify job', job.id, campaignId, batch_size, use_llm);
  await prisma.job.update({ where: { id: String(job.id) }, data: { status: 'completed' } });
}, { connection });

new Worker('dispatch', async (job: Job) => {
  console.log('dispatch job', job.id);
}, { connection });
