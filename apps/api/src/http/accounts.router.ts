import { Router, type Request } from 'express';
import IORedis from 'ioredis';
import { getConnection } from '../lib/queue';
import { AppError } from '../lib/errors';
import { getAuthDb } from '../db/auth-db';
import {
  createSession,
  getActiveSession,
  revokeSession,
  purgeExpired,
} from '../features/accounts/session.service';
import {
  createSessionSchema,
  getActiveSessionQuerySchema,
  revokeSessionSchema,
} from '../features/accounts/session.schema';

const router = Router();

function requireBearer(req: Request): void {
  const token = process.env.AUTH_SERVICE_API_KEY;
  const header = req.get('authorization') || '';
  if (!token || !header.toLowerCase().startsWith('bearer ')) {
    throw new AppError('am.auth_missing', 'Authorization required', 401);
  }
  const provided = header.slice(7);
  if (provided !== token) {
    throw new AppError('am.auth_invalid', 'Invalid authorization token', 403);
  }
}

function redis(): IORedis {
  return getConnection();
}

router.post('/sessions', async (req, res, next) => {
  try {
    requireBearer(req);
    const payload = createSessionSchema.parse(req.body ?? {});
    const out = await createSession({ db: getAuthDb(), redis: redis() }, payload);
    res.status(201).json({
      id: out.id,
      platform: out.platform,
      account: out.account,
      host: out.host,
      userAgent: out.userAgent,
      headers: out.headers,
      cookieJar: out.cookieJar,
      status: out.status,
      createdAt: out.createdAt.toISOString(),
      updatedAt: out.updatedAt.toISOString(),
      expiresAt: out.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions', async (req, res, next) => {
  try {
    requireBearer(req);
    const query = getActiveSessionQuerySchema.parse(req.query ?? {});
    const out = await getActiveSession({ db: getAuthDb(), redis: redis() }, query);
    if (!out) return res.status(404).json({ error: 'not_found' });
    res.json({
      id: out.id,
      platform: out.platform,
      account: out.account,
      host: out.host,
      userAgent: out.userAgent,
      headers: out.headers,
      cookieJar: out.cookieJar,
      status: out.status,
      createdAt: out.createdAt.toISOString(),
      updatedAt: out.updatedAt.toISOString(),
      expiresAt: out.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/:id/revoke', async (req, res, next) => {
  try {
    requireBearer(req);
    const params = revokeSessionSchema.parse({ id: req.params.id });
    const out = await revokeSession({ db: getAuthDb(), redis: redis() }, params);
    res.json({
      id: out.id,
      platform: out.platform,
      account: out.account,
      host: out.host,
      userAgent: out.userAgent,
      headers: out.headers,
      cookieJar: out.cookieJar,
      status: out.status,
      createdAt: out.createdAt.toISOString(),
      updatedAt: out.updatedAt.toISOString(),
      expiresAt: out.expiresAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/purge-expired', async (req, res, next) => {
  try {
    requireBearer(req);
    const deleted = await purgeExpired({ db: getAuthDb(), redis: redis() });
    res.json({ deleted });
  } catch (err) {
    next(err);
  }
});

export const accountsRouter = router;

