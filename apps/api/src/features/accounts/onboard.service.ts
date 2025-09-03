import type IORedis from 'ioredis';
import { onboardAccountSchema, type OnboardAccountInput } from './onboard.schema';
import * as accounts from './account.repo';
import { createAccount as pydollCreate, refreshSession as pydollRefresh } from './pydoll.client';
import * as sessions from './session.service';

type Deps = { redis: IORedis };

export async function onboardAccount(deps: Deps, input: unknown) {
  const parsed = onboardAccountSchema.parse(input) as OnboardAccountInput;

  // If account exists, validate mapping or allow override via force
  const existing = await accounts.findByPlatformAccount(parsed.platform, parsed.account);
  if (existing) {
    // If we already have a providerAccountId, keep it unless force is set and we want to rebind
    if (!parsed.force) {
      return { accountId: existing.id, providerAccountId: existing.providerAccountId };
    }
  }

  // Create (or ensure) account in PyDoll
  const created = await pydollCreate({
    platform: parsed.platform,
    credentials: parsed.credentials,
    proxy: parsed.proxy ?? null,
  });

  // Persist/Upsert our account record
  let account = existing;
  if (!account) {
    account = await accounts.createAccount({
      platform: parsed.platform,
      account: parsed.account,
      provider: 'pydoll',
      providerAccountId: created.id,
      credentials: parsed.credentials as unknown as Record<string, unknown>,
      proxy: parsed.proxy ?? '',
      status: 'active',
    });
  } else {
    // Update mapping and proxy/credentials if force
    await accounts.updateAccount(account.id, {
      credentials: parsed.credentials as unknown as Record<string, unknown>,
      proxy: parsed.proxy,
      status: 'active',
    });
  }

  // Optionally prewarm bundles for requested hosts
  const bundles: Record<string, sessions.SessionBundle> = {} as any;
  if (parsed.hosts && parsed.hosts.length > 0) {
    for (const h of parsed.hosts) {
      const b = await sessions.refreshBundle(deps.redis, account!.id, h, { force: true });
      bundles[h] = b;
    }
  }

  return {
    accountId: account!.id,
    providerAccountId: created.id,
    platform: parsed.platform,
    account: parsed.account,
    proxy: parsed.proxy ?? null,
    bundles: Object.keys(bundles).length > 0 ? bundles : undefined,
  };
}

