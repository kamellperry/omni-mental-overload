export const ACCOUNT_MANAGEMENT_CONFIG = {
  cache: {
    keyPrefix: {
      account: 'account:',
      accountList: 'accounts:list:',
      serviceAccount: 'service_account:',
      accountsByService: 'accounts:by_service:',
    },
    ttl: {
      account: 300, // 5 minutes
      accountList: 60, // 1 minute
      serviceAccount: 600, // 10 minutes
      accountsByService: 120, // 2 minutes
    },
  },
  db: {
    queryTimeout: 5000,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  limits: {
    maxAccountsPerServiceAccount: 10,
    maxActiveAccountsPerUser: 50,
    cookieRefreshIntervalDays: 30,
    maxDailyMessages: 500,
    maxHourlyMessages: 50,
  },
  health: {
    checkIntervalMs: 60000, // 1 minute
    maxFailuresBeforeDeactivation: 3,
    cookieExpiryWarningDays: 7,
  },
  rateLimit: {
    defaultDailyLimit: 50,
    defaultHourlyLimit: 10,
    cooldownPeriodMs: 3600000, // 1 hour
  },
  security: {
    apiKeyLength: 32,
    apiKeyPrefix: 'sk_',
    encryptionAlgorithm: 'aes-256-gcm',
  },
  api: {
    UNKNOWN_NAME: 'unknown',
  },
} as const;

export type CacheKeyPrefix =
  (typeof ACCOUNT_MANAGEMENT_CONFIG)['cache']['keyPrefix'][keyof (typeof ACCOUNT_MANAGEMENT_CONFIG)['cache']['keyPrefix']];
export type AccountLimit =
  (typeof ACCOUNT_MANAGEMENT_CONFIG)['limits'][keyof (typeof ACCOUNT_MANAGEMENT_CONFIG)['limits']];

export function getAccountCacheKey(identity: { platform: string; account: string; host: string }): string {
  const { platform, account, host } = identity;
  return `${ACCOUNT_MANAGEMENT_CONFIG.cache.keyPrefix.account}${platform}:${account}:${host}`;
}

export function getServiceAccountCacheKey(serviceAccountId: string): string {
  return `${ACCOUNT_MANAGEMENT_CONFIG.cache.keyPrefix.serviceAccount}${serviceAccountId}`;
}

export function getAccountListCacheKey(type: 'active' | 'all' = 'active'): string {
  return `${ACCOUNT_MANAGEMENT_CONFIG.cache.keyPrefix.accountList}${type}`;
}

export function getAccountsByServiceCacheKey(serviceAccountId: string): string {
  return `${ACCOUNT_MANAGEMENT_CONFIG.cache.keyPrefix.accountsByService}${serviceAccountId}`;
}

