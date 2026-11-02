import { registerAs } from '@nestjs/config';

export const bullConfig = registerAs('bull', () => ({
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    // BullMQ workers require null so Redis manages command retries.
    maxRetriesPerRequest: null,
  },
}));
