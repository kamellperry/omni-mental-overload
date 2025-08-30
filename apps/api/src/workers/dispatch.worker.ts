import { Worker, Job } from 'bullmq';
import { getConnection } from '../lib/queue';
import * as jobs from '../features/jobs/job.repo';

export function startDispatchWorker() {
  const connection = getConnection();
  // eslint-disable-next-line no-new
  new Worker(
    'dispatch',
    async (job: Job) => {
      const { id } = job;
      await jobs.markStarted(String(id));
      try {
        // TODO: pick top leads per account within quota and send.
        await jobs.markCompleted(String(id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'dispatch_failed';
        await jobs.markFailed(String(id), msg);
        throw err;
      }
    },
    { connection },
  );
}

