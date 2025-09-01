import { z } from 'zod';

export const llmOutputSchema = z.object({
  qualified: z.boolean(),
  confidence: z.number().min(0).max(1),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()).max(8).default([]),
  flags: z.array(z.string()).max(8).default([]),
});

export type LLMOutput = z.infer<typeof llmOutputSchema>;

