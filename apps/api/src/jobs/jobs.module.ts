import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { bullConfig } from '../config/bull.config.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [bullConfig.KEY],
      useFactory: (config: ConfigType<typeof bullConfig>) => config,
    }),
  ],
  exports: [BullModule],
})
export class JobsModule {}
