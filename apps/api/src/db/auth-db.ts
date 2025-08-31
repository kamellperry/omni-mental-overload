import { PrismaClient as AuthPrismaClient } from '../generated/auth/client';

let authPrisma: AuthPrismaClient | undefined;

export const getAuthDb = (): AuthPrismaClient => {
  if (!authPrisma) authPrisma = new AuthPrismaClient();
  return authPrisma;
};

export type AuthDB = AuthPrismaClient;

