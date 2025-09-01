import { z } from 'zod';

export const createSeedSchema = z.object({
  type: z.enum(['post', 'hashtag']),
  value: z.string().min(1),
  enabled: z.boolean().optional().default(true),
});

export type CreateSeedInput = z.infer<typeof createSeedSchema>;
