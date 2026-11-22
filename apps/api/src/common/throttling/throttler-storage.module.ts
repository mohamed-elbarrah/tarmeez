import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { bullConfig } from '../../config/bull.config.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

@Global()
@Module({
  imports: [ConfigModule.forFeature(bullConfig)],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}
