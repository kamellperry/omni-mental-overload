import { z } from 'zod';

export const identitySchema = z.object({
  platform: z.string().min(1),
  account: z.string().min(1),
  host: z.string().min(1),
});

export const headersSchema = z.record(z.string(), z.string());

// For now, allow cookieJar to be a map or an array of simple objects.
export const cookieJarSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.record(z.string(), z.unknown())),
]);

export const createSessionSchema = identitySchema.extend({
  userAgent: z.string().min(1),
  headers: headersSchema,
  cookieJar: cookieJarSchema,
  // If not provided, service will set default now + 30 days
  expiresAt: z.coerce.date().optional(),
});

export const getActiveSessionQuerySchema = identitySchema;

export const revokeSessionSchema = z.object({
  id: z.string().uuid(),
});

export const sessionStatusSchema = z.enum(['active', 'revoked']);

export const sessionOutputSchema = identitySchema.extend({
  id: z.string().uuid(),
  userAgent: z.string(),
  headers: headersSchema,
  cookieJar: cookieJarSchema,
  status: sessionStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

