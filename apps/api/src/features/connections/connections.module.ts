import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';
import { ConnectionsSyncRepository } from './connections-sync.repository.js';
import { CommerceSyncProcessor } from './commerce-sync.processor.js';
import {
  CommerceSyncService,
  COMMERCE_SYNC_QUEUE,
} from './commerce-sync.service.js';
import { SallaProvider } from './salla.provider.js';

@Module({
  imports: [BullModule.registerQueue({ name: COMMERCE_SYNC_QUEUE })],
  controllers: [ConnectionsController],
  providers: [
    ConnectionsService,
    ConnectionsSyncRepository,
    CommerceSyncService,
    CommerceSyncProcessor,
    SallaProvider,
  ],
})
export class ConnectionsModule {}
