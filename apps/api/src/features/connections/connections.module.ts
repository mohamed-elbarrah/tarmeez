import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';
import { SallaProvider } from './salla.provider.js';

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, SallaProvider],
})
export class ConnectionsModule {}
