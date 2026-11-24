import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AdsRepository } from './ads.repository.js';

export const ADS_CONTROL_QUEUE = 'ads-control';
export const AdsControlJobName = { STATUS: 'ads:campaign-status' } as const;

@Injectable()
export class AdsControlService {
  constructor(
    private readonly repository: AdsRepository,
    @InjectQueue(ADS_CONTROL_QUEUE) private readonly queue: Queue,
  ) {}
  async enqueue(actionId: string) {
    await this.queue.add(
      AdsControlJobName.STATUS,
      { actionId },
      {
        jobId: actionId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
