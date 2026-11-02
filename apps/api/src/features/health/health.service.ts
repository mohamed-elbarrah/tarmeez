import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { RedisHealthService } from './redis-health.service.js';

export interface HealthStatus {
  db: 'ok';
  redis: 'ok';
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisHealthService,
  ) {}

  async check(): Promise<HealthStatus> {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    if (database.status === 'rejected' || redis.status === 'rejected') {
      throw new AppException(
        'errors.health.dependencies_unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
        {
          ...(database.status === 'rejected' ? { db: ['unavailable'] } : {}),
          ...(redis.status === 'rejected' ? { redis: ['unavailable'] } : {}),
        },
      );
    }

    return { db: 'ok', redis: 'ok' };
  }
}
