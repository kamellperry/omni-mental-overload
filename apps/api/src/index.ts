import 'dotenv/config';
import express from 'express';
import { campaignsRouter } from './http/campaigns.router';
import { jobsRouter } from './http/jobs.router';
import { healthRouter } from './http/health.router';
import { errorMiddleware } from './lib/errors';
import { accountsRouter } from './http/accounts.router';
import { Queue } from 'bullmq';
import { getConnection } from './lib/queue';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const app = express();
app.use(express.json());

app.use('/health', healthRouter);
app.use('/campaigns', campaignsRouter);
app.use('/jobs', jobsRouter);
app.use('/accounts', accountsRouter);

// Dev-only Bull Board (no extra envs; uses REDIS_URL fallback)
if ((process.env.NODE_ENV ?? 'development') !== 'production') {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const connection = getConnection();
  const queueNames = ['crawl', 'qualify', 'dispatch', 'feedback', 'auth_purge'];
  const adapters = queueNames.map((name) => new BullMQAdapter(new Queue(name, { connection })));
  createBullBoard({ queues: adapters, serverAdapter });

  app.use('/admin/queues', serverAdapter.getRouter());
}

app.use(errorMiddleware);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API listening on :${port}`));
