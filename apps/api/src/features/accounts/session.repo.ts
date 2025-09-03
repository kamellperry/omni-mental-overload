import { getAuthDb } from '../../db/auth-db';

type Identity = { platform: string; account: string; host: string };

export type AuthSessionRecord = {
  id: string;
  platform: string;
  account: string;
  host: string;
  userAgent: string;
  headers: unknown;
  cookieJar: unknown;
  status: 'active' | 'revoked';
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  accountId?: string | null;
  proxy?: string | null;
  providerSessionId?: string | null;
};

export async function findActiveSession(identity: Identity): Promise<AuthSessionRecord | null> {
  const db = getAuthDb();
  const rec = await db.authSession.findFirst({
    where: { ...identity, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  return (rec as unknown as AuthSessionRecord) ?? null;
}

export async function revokeById(id: string): Promise<AuthSessionRecord> {
  const db = getAuthDb();
  const rec = await db.authSession.update({
    where: { id },
    data: { status: 'revoked' },
  });
  return rec as unknown as AuthSessionRecord;
}

// Ensures only one active session per identity by revoking any existing active ones first.
export async function createAndActivateSession(
  input: Identity & {
    userAgent: string;
    headers: Record<string, string>;
    cookieJar: Record<string, unknown> | unknown[];
    expiresAt: Date;
  },
): Promise<AuthSessionRecord> {
  const db = getAuthDb();
  const rec = await db.$transaction(async (tx) => {
    await tx.authSession.updateMany({
      where: { platform: input.platform, account: input.account, host: input.host, status: 'active' },
      data: { status: 'revoked' },
    });
    const created = await tx.authSession.create({
      data: {
        platform: input.platform,
        account: input.account,
        host: input.host,
        userAgent: input.userAgent,
        headers: (input.headers as unknown) ?? {},
        cookieJar: (input.cookieJar as unknown) ?? {},
        status: 'active',
        expiresAt: input.expiresAt,
      },
    });
    return created;
  });
  return rec as unknown as AuthSessionRecord;
}

export async function purgeExpired(now: Date): Promise<number> {
  const db = getAuthDb();
  const res = await db.authSession.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return res.count;
}

// New host-scoped helpers using accountId
export async function findActiveByAccountHost(
  accountId: string,
  host: string,
): Promise<AuthSessionRecord | null> {
  const db = getAuthDb();
  const rec = await db.authSession.findFirst({
    where: { accountId, host, status: 'active' },
    orderBy: { updatedAt: 'desc' },
  });
  return (rec as unknown as AuthSessionRecord) ?? null;
}

export async function createActiveForAccountHost(input: {
  accountId: string;
  platform: string;
  account: string; // username
  host: string;
  userAgent: string;
  headers: Record<string, string>;
  cookieJar: Record<string, unknown> | unknown[];
  proxy?: string | null;
  providerSessionId?: string | null;
  expiresAt: Date;
}): Promise<AuthSessionRecord> {
  const db = getAuthDb();
  const rec = await db.$transaction(async (tx) => {
    await tx.authSession.updateMany({
      where: { accountId: input.accountId, host: input.host, status: 'active' },
      data: { status: 'revoked' },
    });
    const created = await tx.authSession.create({
      data: {
        accountId: input.accountId,
        platform: input.platform,
        account: input.account,
        host: input.host,
        userAgent: input.userAgent,
        headers: input.headers as unknown,
        cookieJar: input.cookieJar as unknown,
        proxy: input.proxy ?? undefined,
        providerSessionId: input.providerSessionId ?? undefined,
        status: 'active',
        expiresAt: input.expiresAt,
      },
    });
    return created as unknown as AuthSessionRecord;
  });
  return rec;
}
