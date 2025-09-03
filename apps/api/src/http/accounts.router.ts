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
import { createAccountSchema, updateAccountSchema } from '../features/accounts/account.schema';
import * as accountRepo from '../features/accounts/account.repo';
import { getActiveBundle, refreshBundle, upsertManual } from '../features/accounts/session.service';
import { onboardAccount } from '../features/accounts/onboard.service';
import { onboardAccountSchema } from '../features/accounts/onboard.schema';

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

router.get('/sessions/by-account-id', async (req, res, next) => {
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

// --- Host-scoped Account Manager endpoints (internal) ---

router.post('/', async (req, res, next) => {
  try {
    requireBearer(req);
    const input = createAccountSchema.parse(req.body ?? {});
    const rec = await accountRepo.createAccount(input);
    res.status(201).json({ id: rec.id, platform: rec.platform, account: rec.account, provider: rec.provider, providerAccountId: rec.providerAccountId, proxy: rec.proxy, status: rec.status, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
  } catch (err) {
    next(err);
  }
});

router.post('/onboard', async (req, res, next) => {
  try {
    requireBearer(req);
    const payload = onboardAccountSchema.parse(req.body ?? {});
    const out = await onboardAccount({ redis: redis() }, payload);
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    requireBearer(req);
    const input = updateAccountSchema.parse(req.body ?? {});
    const rec = await accountRepo.updateAccount(req.params.id, input);
    res.json({ id: rec.id, platform: rec.platform, account: rec.account, provider: rec.provider, providerAccountId: rec.providerAccountId, proxy: rec.proxy, status: rec.status, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/refresh', async (req, res, next) => {
  try {
    requireBearer(req);
    const accountId = req.params.id;
    const host = String(req.query.host || 'www.instagram.com');
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const bundle = await refreshBundle(redis(), accountId, host, { force });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.get('/sessions', async (req, res, next) => {
  try {
    requireBearer(req);
    const accountId = String(req.query.accountId || '');
    const host = String(req.query.host || '');
    if (!accountId || !host) throw new AppError('bad_request', 'accountId and host are required', 400);
    const bundle = await getActiveBundle(redis(), accountId, host);
    if (!bundle) return res.status(404).json({ error: 'not_found' });
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.post('/sessions/manual', async (req, res, next) => {
  try {
    requireBearer(req);
    const body = req.body ?? {};
    const out = await upsertManual(redis(), {
      accountId: String(body.accountId),
      platform: String(body.platform || 'instagram'),
      account: String(body.account),
      host: String(body.host),
      userAgent: String(body.userAgent),
      headers: (body.headers ?? {}) as Record<string, string>,
      cookieJar: (body.cookieJar ?? {}) as Record<string, unknown> | unknown[],
      proxy: (body.proxy as string | undefined) ?? null,
      expiresAt: new Date(String(body.expiresAt)),
    });
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});
