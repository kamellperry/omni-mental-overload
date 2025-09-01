import { Worker, Job } from 'bullmq';
import { getConnection } from '../lib/queue';
import * as jobs from '../features/jobs/job.repo';
import { z } from 'zod';
import { refreshForCampaign } from '../features/candidates/candidate.service';

const payloadSchema = z.object({
  campaignId: z.string().min(1),
  use_llm: z.boolean().default(true),
  batch_size: z.number().int().min(1).max(2000).default(200),
});

export function startQualifyWorker() {
  const connection = getConnection();
  // eslint-disable-next-line no-new
  new Worker(
    'qualify',
    async (job: Job) => {
      const { id } = job;
      const input = payloadSchema.parse(job.data);
      await jobs.markStarted(String(id));
      try {
        // Ensure campaign_candidates is fresh before shortlist/LLM
        await refreshForCampaign(input.campaignId);
        // TODO: shortlist, cache by hashes, call LLM, write leads.
        void input; // silence unused for now
        await jobs.markCompleted(String(id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'qualify_failed';
        await jobs.markFailed(String(id), msg);
        throw err;
      }
    },
    { connection },
  );
}
