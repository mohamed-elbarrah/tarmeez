import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MerchantsController } from './merchants.controller.js';
import { MerchantsRepository } from './merchants.repository.js';
import { MerchantsService } from './merchants.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MerchantsController],
  providers: [MerchantsRepository, MerchantsService],
})
export class MerchantsModule {}
