import IORedis from 'ioredis';
import { Queue } from 'bullmq';

let connection: IORedis | undefined;

export const getConnection = (): IORedis => {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return connection;
};

export const createQueue = (name: string): Queue => new Queue(name, { connection: getConnection() });