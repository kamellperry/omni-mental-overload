import { Worker, Job } from 'bullmq';
import { getConnection } from '../lib/queue';
import { fetchJson } from '../lib/http';
import { z } from 'zod';
import * as jobs from '../features/jobs/job.repo';

const base = process.env.CRAWLER_BASE_URL || 'http://localhost:8000';

const payloadSchema = z.object({
  campaignId: z.string().min(1),
  seed_type: z.enum(['post', 'profile']),
  seed_value: z.string().min(1),
  crawl_config: z.object({ max_profiles: z.number().int().min(1).max(5000).default(500) }),
});

export function startCrawlWorker() {
  const connection = getConnection();

  new Worker(
    'crawl',
    async (job: Job) => {
      const { id } = job;
      const input = payloadSchema.parse(job.data);
      await jobs.markStarted(String(id));
      try {
        await fetchJson(`${base}/crawl/jobs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            seed_type: input.seed_type,
            seed_value: input.seed_value,
            crawl_config: input.crawl_config,
          }),
          timeoutMs: 10000,
        });
        await jobs.markCompleted(String(id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'crawl_failed';
        await jobs.markFailed(String(id), msg);
        throw err;
      }
    },
    { connection },
  );
}

