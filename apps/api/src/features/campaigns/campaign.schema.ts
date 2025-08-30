import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';

// Prisma.InputJsonValue excludes JS null; use Prisma.JsonNull sentinel if needed at call sites.
export const jsonValueSchema: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

export const createCampaignSchema = z.object({
  name: z.string().min(1),
  criteria: jsonValueSchema,
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const discoverSchema = z.object({
  seed_type: z.enum(['post', 'profile']).default('post'),
  seed_value: z.string(),
  crawl_config: z
    .object({ max_profiles: z.number().int().min(1).max(5000).default(500) })
    .default({ max_profiles: 500 }),
});

export const qualifySchema = z
  .object({
    use_llm: z.boolean().default(true),
    batch_size: z.number().int().min(1).max(2000).default(200),
  })
  .default({ use_llm: true, batch_size: 200 });
