import { Worker, Job, Queue } from 'bullmq';
import { getConnection } from '../lib/queue';
import { purgeExpired } from '../features/accounts/session.service';
import { getAuthDb } from '../db/auth-db';

const QUEUE_NAME = 'auth_purge';
const ENABLED = (process.env.SCHED_ENABLE_AUTH_PURGE ?? 'true').toLowerCase() === 'true';
const EVERY_MS = Number(process.env.SCHED_AUTH_PURGE_EVERY_MS ?? 15 * 60 * 1000);

export async function startAuthPurgeWorker() {
  if (!ENABLED) return;

  const connection = getConnection();

  new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      await purgeExpired({ db: getAuthDb(), redis: connection });
    },
    { connection },
  );

  const q = new Queue(QUEUE_NAME, { connection });
  await q.add(
    'auth.purge.repeat',
    {},
    { repeat: { every: EVERY_MS }, jobId: 'auth_purge:repeat', removeOnComplete: true },
  );
}

