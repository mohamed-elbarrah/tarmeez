import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler.storage.js';
import { ThrottlerStorageModule } from './common/throttling/throttler-storage.module.js';
import { AppConfigModule } from './config/config.module.js';
import { AdminModule } from './features/admin/admin.module.js';
import { AnalyticsModule } from './features/analytics/analytics.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { ConnectionsModule } from './features/connections/connections.module.js';
import { HealthModule } from './features/health/health.module.js';
import { MerchantsModule } from './features/merchants/merchants.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage,
      }),
    }),
    AppConfigModule,
    JobsModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    MerchantsModule,
    ConnectionsModule,
    AnalyticsModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
