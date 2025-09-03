import { getAuthDb } from '../../db/auth-db';

export type AuthAccountRecord = {
  id: string;
  platform: string;
  account: string;
  provider: string;
  providerAccountId: string;
  credentials: unknown; // stored JSON; parsed by callers that need it
  proxy: string;
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
};

export async function createAccount(input: {
  platform: 'instagram';
  account: string;
  provider: 'pydoll';
  providerAccountId: string;
  credentials: Record<string, unknown>;
  proxy: string;
  status?: 'active' | 'disabled';
}): Promise<AuthAccountRecord> {
  const db = getAuthDb();
  const rec = await db.authAccount.create({
    data: {
      platform: input.platform,
      account: input.account,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      credentials: input.credentials as unknown,
      proxy: input.proxy,
      status: (input.status as any) ?? 'active',
    },
  });
  return rec as unknown as AuthAccountRecord;
}

export async function updateAccount(
  id: string,
  changes: Partial<{
    credentials: Record<string, unknown>;
    proxy: string;
    status: 'active' | 'disabled';
  }>,
): Promise<AuthAccountRecord> {
  const db = getAuthDb();
  const rec = await db.authAccount.update({
    where: { id },
    data: {
      ...(changes.credentials ? { credentials: changes.credentials as unknown } : {}),
      ...(typeof changes.proxy === 'string' ? { proxy: changes.proxy } : {}),
      ...(changes.status ? { status: changes.status as any } : {}),
    },
  });
  return rec as unknown as AuthAccountRecord;
}

export async function findById(id: string): Promise<AuthAccountRecord | null> {
  const db = getAuthDb();
  const rec = await db.authAccount.findUnique({ where: { id } });
  return (rec as unknown as AuthAccountRecord) ?? null;
}

export async function findByPlatformAccount(
  platform: 'instagram',
  account: string,
): Promise<AuthAccountRecord | null> {
  const db = getAuthDb();
  const rec = await db.authAccount.findUnique({ where: { platform_account: { platform, account } } });
  return (rec as unknown as AuthAccountRecord) ?? null;
}

