import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AdsRepository } from './ads.repository.js';
import { MetaProvider } from './meta.provider.js';
import { AdsControlJobName, ADS_CONTROL_QUEUE } from './ads-control.service.js';
import { adEncryptionKey, decryptAdToken } from './ads.crypto.js';

@Injectable()
@Processor(ADS_CONTROL_QUEUE)
export class AdsControlProcessor extends WorkerHost {
  private readonly logger = new Logger(AdsControlProcessor.name);
  constructor(
    private readonly repository: AdsRepository,
    private readonly provider: MetaProvider,
    private readonly config: ConfigService,
  ) {
    super();
  }
  async process(job: Job<{ actionId: string }>): Promise<void> {
    if (job.name !== AdsControlJobName.STATUS) return;
    const action = await this.repository.findActionForProcessing(
      job.data.actionId,
    );
    if (!action) return;
    await this.repository.updateAction(action.id, 'PROCESSING');
    try {
      const token = decryptAdToken(
        action.campaign.accountConnection.authorization.accessTokenEncrypted,
        adEncryptionKey(this.config.get<string>('META_TOKEN_ENCRYPTION_KEY')),
      );
      await this.provider.updateCampaignStatus(
        token,
        action.campaign.externalCampaignId,
        action.requestedStatus as 'ACTIVE' | 'PAUSED',
      );
      const confirmed = await this.provider.getCampaign(
        token,
        action.campaign.externalCampaignId,
      );
      const status = confirmed.configured_status ?? confirmed.status;
      if (status !== action.requestedStatus) {
        await this.repository.updateAction(
          action.id,
          'NOT_CONFIRMED',
          'META_STATUS_NOT_CONFIRMED',
        );
        return;
      }
      await this.repository.updateCampaignStatus(action.campaignId, {
        configuredStatus: status,
        effectiveStatus: confirmed.effective_status,
        sourceUpdatedAt: confirmed.updated_time
          ? new Date(confirmed.updated_time)
          : undefined,
        statusObservedAt: new Date(),
      });
      await this.repository.updateAction(action.id, 'CONFIRMED');
    } catch (error) {
      this.logger.error(
        `Meta status action failed for ${action.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.repository.updateAction(
        action.id,
        'REJECTED',
        'META_STATUS_UPDATE_FAILED',
      );
      throw error;
    }
  }
}
