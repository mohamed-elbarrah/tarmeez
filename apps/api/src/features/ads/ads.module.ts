import { Module } from '@nestjs/common';
import { AdsController } from './ads.controller.js';
import { AdsService } from './ads.service.js';
import { AdsRepository } from './ads.repository.js';
import { MetaProvider } from './meta.provider.js';
import { AuditRepository } from '../connections/audit.repository.js';
import { AuditService } from '../connections/audit.service.js';
import { BullModule } from '@nestjs/bullmq';
import { ADS_SYNC_QUEUE } from './ads-sync.service.js';
import { AdsSyncService } from './ads-sync.service.js';
import { AdsSyncProcessor } from './ads-sync.processor.js';
import { ADS_CONTROL_QUEUE, AdsControlService } from './ads-control.service.js';
import { AdsControlProcessor } from './ads-control.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: ADS_SYNC_QUEUE }),
    BullModule.registerQueue({ name: ADS_CONTROL_QUEUE }),
  ],
  controllers: [AdsController],
  providers: [
    AdsService,
    AdsRepository,
    MetaProvider,
    AuditRepository,
    AuditService,
    AdsSyncService,
    AdsSyncProcessor,
    AdsControlService,
    AdsControlProcessor,
  ],
})
export class AdsModule {}
