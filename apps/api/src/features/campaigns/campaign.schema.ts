import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';

// Recursive JSON-like type compatible with Prisma JSON at the edges.
type Jsonish = string | number | boolean | { [k: string]: Jsonish } | Jsonish[];
export const jsonValueSchema: z.ZodType<Jsonish> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const createCampaignSchema = z.object({
  name: z.string().min(1),
  criteria: jsonValueSchema,
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const discoverSchema = z.object({
  seed_type: z.enum(['post', 'hashtag']).default('post'),
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
