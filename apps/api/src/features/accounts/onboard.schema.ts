import { z } from 'zod';
import { credentialsSchema } from './account.schema';

const allowedHosts = z.enum(['www.instagram.com', 'i.instagram.com']);

export const onboardAccountSchema = z.object({
  platform: z.literal('instagram'),
  account: z.string().min(1),
  credentials: credentialsSchema,
  proxy: z.string().min(1).optional(),
  hosts: z.array(allowedHosts).optional(),
  force: z.boolean().optional(),
});

export type OnboardAccountInput = z.infer<typeof onboardAccountSchema>;

