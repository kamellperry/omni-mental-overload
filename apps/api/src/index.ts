import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const app = express();
app.use(express.json());

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

const crawlQueue = new Queue('crawl', { connection });
const qualifyQueue = new Queue('qualify', { connection });
const dispatchQueue = new Queue('dispatch', { connection });

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/campaigns', async (req, res) => {
  const body = z.object({ name: z.string().min(1), criteria: z.record(z.any()) }).parse(req.body);
  const criteriaHash = Bun.hash(JSON.stringify(body.criteria)).toString();
  const campaign = await prisma.campaign.create({ data: { name: body.name, criteria: body.criteria, criteriaHash } });
  res.json(campaign);
});

app.post('/campaigns/:id/discover', async (req, res) => {
  const { id } = req.params;
  const body = z.object({
    seed_type: z.enum(['post','profile']).default('post'),
    seed_value: z.string(),
    crawl_config: z.object({ max_profiles: z.number().int().min(1).max(5000).default(500) }).default({ max_profiles: 500 })
  }).parse(req.body);
  const job = await crawlQueue.add('crawl.seed', { campaignId: id, ...body }, { removeOnComplete: true, removeOnFail: { age: 86400 } });
  await prisma.job.create({ data: { id: job.id as string, campaignId: id, type: 'crawl.seed', status: 'queued' } });
  res.json({ job_id: job.id });
});

app.post('/campaigns/:id/qualify', async (req, res) => {
  const { id } = req.params;
  const body = z.object({ use_llm: z.boolean().default(true), batch_size: z.number().int().min(1).max(2000).default(200) }).parse(req.body ?? {});
  const job = await qualifyQueue.add('qualify.campaign', { campaignId: id, ...body }, { removeOnComplete: true, removeOnFail: { age: 86400 } });
  await prisma.job.create({ data: { id: job.id as string, campaignId: id, type: 'qualify.campaign', status: 'queued' } });
  res.json({ job_id: job.id });
});

app.get('/campaigns/:id/leads', async (req, res) => {
  const { id } = req.params;
  const take = Number(req.query.limit ?? 50);
  const leads = await prisma.lead.findMany({ where: { campaignId: id }, take, orderBy: { score: 'desc' } });
  res.json({ items: leads });
});

app.get('/jobs/:id', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  res.json(job ?? {});
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API listening on :${port}`));
