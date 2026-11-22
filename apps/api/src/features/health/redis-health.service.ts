import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { bullConfig } from '../../config/bull.config.js';

@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthService.name);
  private client: Redis;
  private readonly options: RedisOptions;

  constructor(
    @Inject(bullConfig.KEY)
    config: ConfigType<typeof bullConfig>,
  ) {
    this.options = {
      ...config.connection,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_000,
      retryStrategy: () => null,
    };
    this.client = this.createClient();
  }

  async ping(): Promise<void> {
    if (this.client.status === 'end') {
      this.client = this.createClient();
    }
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    await this.client.ping();
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  private createClient(): Redis {
    const client = new Redis(this.options);
    client.on('error', (error: Error) => {
      this.logger.warn(`Redis health connection error: ${error.message}`);
    });
    return client;
  }
}
