import { PrismaClient } from '../generated/prisma/client';

let prisma: PrismaClient | undefined;

export const getPrisma = (): PrismaClient => {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
};

export type DB = PrismaClient;