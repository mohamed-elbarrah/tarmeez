import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AdsRepository } from './ads.repository.js';
import { ADS_SYNC_QUEUE, AdsJobName } from './ads-sync.service.js';
import { MetaProvider } from './meta.provider.js';
import { ConfigService } from '@nestjs/config';
import { adEncryptionKey, decryptAdToken } from './ads.crypto.js';

@Injectable()
@Processor(ADS_SYNC_QUEUE)
export class AdsSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AdsSyncProcessor.name);
  constructor(
    private readonly repository: AdsRepository,
    private readonly provider: MetaProvider,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(
    job: Job<{ syncRunId: string; accountId: string }>,
  ): Promise<void> {
    if (job.name !== AdsJobName.ACCOUNT) return;
    const run = await this.repository.startSyncRun(job.data.syncRunId);
    if (!run) return;
    try {
      const account = await this.repository.findAccountForSync(
        job.data.accountId,
      );
      if (!account || account.status !== 'CONNECTED') {
        await this.repository.finishSyncRun(
          run.id,
          'FAILED',
          'ACCOUNT_INACTIVE',
        );
        return;
      }
      const token = decryptAdToken(
        account.authorization.accessTokenEncrypted,
        adEncryptionKey(this.config.get<string>('META_TOKEN_ENCRYPTION_KEY')),
      );
      const campaigns = await this.provider.listCampaigns(
        token,
        account.externalAccountId,
      );
      for (const campaign of campaigns) {
        const saved = await this.repository.upsertCampaign(account, campaign);
        const insights = await this.provider.getCampaignInsights(
          token,
          campaign.id,
          formatDate(run.rangeFrom),
          formatDate(run.rangeTo),
        );
        await this.repository.upsertInsights(
          saved.id,
          account.currency,
          insights,
        );
      }
      await this.repository.finishSyncRun(run.id, 'SUCCEEDED');
      await this.repository.markAccountSynced(account.id);
    } catch (error) {
      this.logger.error(
        `Meta sync failed for run ${run.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.repository.finishSyncRun(run.id, 'FAILED', 'META_SYNC_FAILED');
      throw error;
    }
  }
}

function formatDate(value: Date | null): string {
  return (value ?? new Date()).toISOString().slice(0, 10);
}
