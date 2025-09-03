import { z } from 'zod';

// MVP credentials for Instagram (no 2FA or hints yet; can be extended later)
export const credentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const createAccountSchema = z.object({
  platform: z.literal('instagram'),
  account: z.string().min(1), // username
  provider: z.literal('pydoll'),
  providerAccountId: z.string().min(1),
  credentials: credentialsSchema,
  proxy: z.string().min(1), // vendor string as-is
  status: z.enum(['active', 'disabled']).optional(),
});

export const updateAccountSchema = z.object({
  credentials: credentialsSchema.optional(),
  proxy: z.string().min(1).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type CredentialsInput = z.infer<typeof credentialsSchema>;

