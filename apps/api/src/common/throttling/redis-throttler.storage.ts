import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { bullConfig } from '../../config/bull.config.js';

const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockedKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockedTtl = redis.call('PTTL', blockedKey)
if blockedTtl > 0 then
  local hits = tonumber(redis.call('GET', hitsKey) or '0')
  local hitsTtl = redis.call('PTTL', hitsKey)
  return { hits, hitsTtl, 1, blockedTtl }
end

local hits = redis.call('INCR', hitsKey)
if hits == 1 then
  redis.call('PEXPIRE', hitsKey, ttl)
end
local hitsTtl = redis.call('PTTL', hitsKey)
if hits > limit then
  if blockDuration < 1 then blockDuration = ttl end
  redis.call('PSETEX', blockedKey, blockDuration, '1')
  return { hits, hitsTtl, 1, blockDuration }
end
return { hits, hitsTtl, 0, 0 }
`;

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly client: Redis;

  constructor(
    @Inject(bullConfig.KEY)
    config: ConfigType<typeof bullConfig>,
  ) {
    this.client = new Redis({
      ...config.connection,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      retryStrategy: () => null,
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Rate-limit Redis error: ${error.message}`);
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    if (this.client.status === 'wait') await this.client.connect();
    const prefix = `tarmeez:throttle:${throttlerName}:${key}`;
    const result = (await this.client.eval(
      INCREMENT_SCRIPT,
      2,
      `${prefix}:hits`,
      `${prefix}:blocked`,
      ttl,
      limit,
      blockDuration,
    )) as number[];

    return {
      totalHits: Number(result[0]),
      timeToExpire: Math.max(0, Math.ceil(Number(result[1]) / 1000)),
      isBlocked: Number(result[2]) === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(Number(result[3]) / 1000)),
    };
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
