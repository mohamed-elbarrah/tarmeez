import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AdsRepository } from './ads.repository.js';

export const ADS_SYNC_QUEUE = 'ads-sync';
export const AdsJobName = { ACCOUNT: 'ads:sync-account' } as const;

@Injectable()
export class AdsSyncService {
  constructor(private readonly repository: AdsRepository, @InjectQueue(ADS_SYNC_QUEUE) private readonly queue: Queue) {}

  async enqueueAccount(userId: string, accountId: string, trigger: 'INITIAL' | 'MANUAL' = 'MANUAL') {
    const membership = await this.repository.findMembership(userId);
    if (!membership || membership.merchant.status !== 'ACTIVE' || membership.role !== 'OWNER') return { queued: false };
    const account = await this.repository.findAccountForOwner(membership.merchantId, userId, accountId);
    if (!account || account.status === 'DISCONNECTED') return { queued: false };
    const run = await this.repository.createSyncRun({ merchant: { connect: { id: membership.merchantId } }, accountConnection: { connect: { id: account.id } }, trigger, rangeFrom: dateOnly(-90), rangeTo: dateOnly(0) });
    await this.queue.add(AdsJobName.ACCOUNT, { syncRunId: run.id, accountId: account.id }, { jobId: run.id, attempts: 4, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: false });
    return { queued: true, syncRunId: run.id };
  }
}

function dateOnly(offsetDays: number): Date { const date = new Date(); date.setUTCDate(date.getUTCDate() + offsetDays); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); }
