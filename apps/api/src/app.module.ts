import { Module } from '@nestjs/common';
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
})
export class AppModule {}
