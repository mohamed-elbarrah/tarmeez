import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  COMMERCE_SYNC_QUEUE,
  CommerceSyncService,
} from './commerce-sync.service.js';

interface SyncJobData {
  syncRunId: string;
}

@Processor(COMMERCE_SYNC_QUEUE, { concurrency: 1 })
export class CommerceSyncProcessor extends WorkerHost {
  constructor(private readonly sync: CommerceSyncService) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    if (job.name !== 'sync-connection') return;
    await this.sync.processRun(job.data.syncRunId);
  }
}
