import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Redis } from 'ioredis';
import { bullConfig } from '../../config/bull.config.js';

@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthService.name);
  private readonly client: Redis;

  constructor(
    @Inject(bullConfig.KEY)
    config: ConfigType<typeof bullConfig>,
  ) {
    this.client = new Redis({
      ...config.connection,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1_000,
      retryStrategy: () => null,
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis health connection error: ${error.message}`);
    });
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
