import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';

export const jsonValueSchema: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

export const createCampaignSchema = z.object({
  name: z.string().min(1),
  criteria: jsonValueSchema,
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
