import { Worker, Job } from 'bullmq';
import { getConnection } from '../lib/queue';
import * as jobs from '../features/jobs/job.repo';

export function startFeedbackWorker() {
  const connection = getConnection();
  // eslint-disable-next-line no-new
  new Worker(
    'feedback',
    async (job: Job) => {
      const { id } = job;
      await jobs.markStarted(String(id));
      try {
        // TODO: poll provider(s) and write feedback_events.
        await jobs.markCompleted(String(id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'feedback_failed';
        await jobs.markFailed(String(id), msg);
        throw err;
      }
    },
    { connection },
  );
}

