import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditService } from '../connections/audit.service.js';
import { adEncryptionKey, decryptAdToken, encryptAdToken } from './ads.crypto.js';
import { AdsRepository } from './ads.repository.js';
import { generateAdOAuthState, hashAdOAuthState } from './ads.state.js';
import { MetaProvider } from './meta.provider.js';
import { AdsSyncService } from './ads-sync.service.js';
import { AdsControlService } from './ads-control.service.js';

const INTENT_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);
  constructor(private readonly repository: AdsRepository, private readonly provider: MetaProvider, private readonly config: ConfigService, private readonly audit: AuditService, private readonly sync: AdsSyncService, private readonly control: AdsControlService) {}

  async startMeta(userId: string) {
    const membership = await this.ownerMembership(userId);
    const appId = this.config.get<string>('META_APP_ID');
    const redirectUri = this.config.get<string>('META_REDIRECT_URI');
    if (!appId || !redirectUri || !this.config.get<boolean>('META_ENABLED')) throw new AppException('errors.ads.meta_not_configured', HttpStatus.SERVICE_UNAVAILABLE);
    const state = generateAdOAuthState();
    const intent = await this.repository.createIntent({ merchant: { connect: { id: membership.merchantId } }, initiatedBy: { connect: { id: userId } }, provider: 'META', stateHash: hashAdOAuthState(state), expiresAt: new Date(Date.now() + INTENT_TTL_MS) });
    return { intentId: intent.id, authorizationUrl: this.provider.buildAuthorizationUrl({ appId, redirectUri, state }).toString(), expiresAt: intent.expiresAt };
  }

  async handleMetaCallback(input: { code?: string; state?: string; error?: string }) {
    if (!input.state) throw new AppException('errors.ads.meta_state_invalid', HttpStatus.BAD_REQUEST);
    const intent = await this.repository.findIntentByState(hashAdOAuthState(input.state));
    if (!intent || intent.expiresAt <= new Date() || intent.status !== 'INITIATED') throw new AppException('errors.ads.meta_state_invalid', HttpStatus.BAD_REQUEST);
    if (input.error || !input.code) { await this.repository.failIntent(intent.id); return { intentId: intent.id, status: 'FAILED' as const }; }
    try {
      const appId = this.config.get<string>('META_APP_ID'); const secret = this.config.get<string>('META_APP_SECRET'); const redirect = this.config.get<string>('META_REDIRECT_URI');
      if (!appId || !secret || !redirect) throw new AppException('errors.ads.meta_not_configured', HttpStatus.SERVICE_UNAVAILABLE);
      const token = await this.provider.exchangeCode(input.code, appId, secret, redirect);
      const accounts = await this.provider.listAdAccounts(token.access_token);
      const authorization = await this.repository.createAuthorization({ merchant: { connect: { id: intent.merchantId } }, owner: { connect: { id: intent.initiatedByUserId } }, provider: 'META', accessTokenEncrypted: encryptAdToken(token.access_token, adEncryptionKey(this.config.get<string>('META_TOKEN_ENCRYPTION_KEY'))), grantedPermissions: ['ads_read', 'ads_management'], tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : undefined, status: 'CONNECTED', lastValidatedAt: new Date() });
      await this.repository.authorizeIntent(intent.id, { authorizationId: authorization.id });
      return { intentId: intent.id, status: 'AUTHORIZED' as const, accounts: accounts.map(({ id, name, currency, timezone_name }) => ({ id, name, currency, timezone_name })) };
    } catch (error) {
      this.logger.warn(`Meta OAuth failed for intent ${intent.id}`);
      await this.repository.failIntent(intent.id);
      throw error;
    }
  }

  async getIntent(userId: string, intentId: string) {
    const intent = await this.repository.findIntentForUser(userId, intentId);
    if (!intent) throw new AppException('errors.ads.intent_not_found', HttpStatus.NOT_FOUND);
    if (intent.status !== 'AUTHORIZED' || !intent.authorization) return { id: intent.id, status: intent.status, expiresAt: intent.expiresAt, accounts: [] };
    const token = decryptAdToken(intent.authorization.accessTokenEncrypted, adEncryptionKey(this.config.get<string>('META_TOKEN_ENCRYPTION_KEY')));
    const accounts = await this.provider.listAdAccounts(token);
    return { id: intent.id, status: intent.status, expiresAt: intent.expiresAt, accounts };
  }

  async completeMeta(userId: string, intentId: string, accountIds: string[]) {
    const intent = await this.repository.findIntentForUser(userId, intentId);
    if (!intent?.authorization) throw new AppException('errors.ads.intent_not_ready', HttpStatus.CONFLICT);
    const accounts = await this.provider.listAdAccounts(decryptAdToken(intent.authorization.accessTokenEncrypted, adEncryptionKey(this.config.get<string>('META_TOKEN_ENCRYPTION_KEY'))));
    const result = await this.repository.completeAccounts(intentId, userId, accountIds, accounts.map((account) => ({ id: account.id, name: account.name ?? account.id, currency: account.currency, timezone_name: account.timezone_name })));
    if (!result) throw new AppException('errors.ads.account_selection_invalid', HttpStatus.BAD_REQUEST);
    await this.audit.record({ merchantId: intent.merchantId, actorUserId: userId, action: 'AD_ACCOUNTS_CONNECTED', entityType: 'AD_CONNECTION_INTENT', entityId: intentId, metadata: { status: 'COMPLETED', resource: 'META' } });
    const syncs: Array<{ externalAccountId: string; queued: boolean }> = [];
    for (const account of result) {
      const linked = await this.repository.findAccountByExternalForOwner(intent.merchantId, userId, account.id);
      if (!linked) continue;
      try { const sync = await this.sync.enqueueAccount(userId, linked.id, 'INITIAL'); syncs.push({ externalAccountId: account.id, queued: sync.queued }); }
      catch { this.logger.error(`Initial Meta sync queueing failed for account ${linked.id}`); syncs.push({ externalAccountId: account.id, queued: false }); }
    }
    return { connected: result.map((account) => ({ externalAccountId: account.id, name: account.name ?? account.id, syncQueued: syncs.find((item) => item.externalAccountId === account.id)?.queued ?? false })) };
  }

  async listAccounts(userId: string) {
    const membership = await this.readMembership(userId);
    return this.repository.listAccounts(membership.merchantId);
  }

  async disconnect(userId: string, accountId: string) {
    const membership = await this.ownerMembership(userId);
    const result = await this.repository.disconnectAccount(membership.merchantId, userId, accountId);
    if (result.count !== 1) throw new AppException('errors.ads.account_not_found', HttpStatus.NOT_FOUND);
    await this.audit.record({ merchantId: membership.merchantId, actorUserId: userId, action: 'AD_ACCOUNT_DISCONNECTED', entityType: 'AD_ACCOUNT_CONNECTION', entityId: accountId, metadata: { status: 'DISCONNECTED', resource: 'META' } });
    return { disconnected: true };
  }

  async syncAccount(userId: string, accountId: string) {
    const result = await this.sync.enqueueAccount(userId, accountId, 'MANUAL');
    if (!result.queued) throw new AppException('errors.ads.account_not_found', HttpStatus.NOT_FOUND);
    return result;
  }

  async listCampaigns(userId: string, accountId: string, page: number, perPage: number, status?: string) {
    const membership = await this.readMembership(userId);
    const account = await this.repository.findAccountForRead(membership.merchantId, accountId);
    if (!account || account.status === 'DISCONNECTED') throw new AppException('errors.ads.account_not_found', HttpStatus.NOT_FOUND);
    const [data, total] = await this.repository.listCampaigns(membership.merchantId, accountId, page, perPage, status);
    return { data: data.map(serializeCampaign), meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) } };
  }

  async campaign(userId: string, campaignId: string) {
    const membership = await this.readMembership(userId); const campaign = await this.repository.findCampaignForRead(membership.merchantId, campaignId);
    if (!campaign) throw new AppException('errors.ads.campaign_not_found', HttpStatus.NOT_FOUND);
    return serializeCampaign(campaign);
  }

  async requestStatus(userId: string, campaignId: string, input: { status: 'ACTIVE' | 'PAUSED'; expectedStatus: string; idempotencyKey: string }) {
    const membership = await this.ownerMembership(userId); const campaign = await this.repository.findCampaignForRead(membership.merchantId, campaignId);
    if (!campaign || campaign.accountConnection.ownerUserId !== userId || campaign.accountConnection.status !== 'CONNECTED') throw new AppException('errors.ads.campaign_not_found', HttpStatus.NOT_FOUND);
    if (campaign.configuredStatus !== input.expectedStatus) throw new AppException('errors.ads.campaign_changed', HttpStatus.CONFLICT);
    const existing = await this.repository.findAction(campaignId, input.idempotencyKey);
    if (existing) return { actionId: existing.id, state: existing.state };
    const action = await this.repository.createStatusAction({ merchant: { connect: { id: membership.merchantId } }, campaign: { connect: { id: campaignId } }, actor: { connect: { id: userId } }, idempotencyKey: input.idempotencyKey, expectedStatus: input.expectedStatus, requestedStatus: input.status });
    await this.audit.record({ merchantId: membership.merchantId, actorUserId: userId, action: 'AD_CAMPAIGN_STATUS_REQUESTED', entityType: 'AD_CAMPAIGN_STATUS_ACTION', entityId: action.id, metadata: { status: input.status, resource: 'META' } });
    await this.control.enqueue(action.id);
    return { actionId: action.id, state: action.state };
  }

  async action(userId: string, campaignId: string, actionId: string) {
    const membership = await this.readMembership(userId); const action = await this.repository.findActionForRead(membership.merchantId, campaignId, actionId);
    if (!action) throw new AppException('errors.ads.status_action_not_found', HttpStatus.NOT_FOUND);
    return action;
  }

  private async ownerMembership(userId: string) { const membership = await this.readMembership(userId); if (membership.role !== 'OWNER') throw new AppException('errors.connections.workspace_owner_required', HttpStatus.FORBIDDEN); return membership; }
  private async readMembership(userId: string) { const membership = await this.repository.findMembership(userId); if (!membership || membership.merchant.status !== 'ACTIVE') throw new AppException('errors.merchant.not_found', HttpStatus.NOT_FOUND); return membership; }
}

type CampaignWithMetrics = Prisma.AdCampaignGetPayload<{ include: { dailyMetrics: true; accountConnection: { include: { authorization: true } } } }>;

function serializeCampaign(campaign: CampaignWithMetrics) {
  return {
    id: campaign.id,
    accountConnectionId: campaign.accountConnectionId,
    externalCampaignId: campaign.externalCampaignId,
    name: campaign.name,
    objective: campaign.objective,
    configuredStatus: campaign.configuredStatus,
    effectiveStatus: campaign.effectiveStatus,
    statusObservedAt: campaign.statusObservedAt,
    sourceUpdatedAt: campaign.sourceUpdatedAt,
    updatedAt: campaign.updatedAt,
    account: {
      id: campaign.accountConnection.id,
      name: campaign.accountConnection.name,
      currency: campaign.accountConnection.currency,
      reportingTimeZone: campaign.accountConnection.reportingTimeZone,
      ownerUserId: campaign.accountConnection.ownerUserId,
    },
    dailyMetrics: campaign.dailyMetrics.map((metric) => ({
      id: metric.id,
      reportDate: metric.reportDate,
      currency: metric.currency,
      spend: metric.spend?.toString() ?? null,
      impressions: metric.impressions === null ? null : metric.impressions?.toString() ?? null,
      clicks: metric.clicks === null ? null : metric.clicks?.toString() ?? null,
      reportedPurchases: metric.reportedPurchases === null ? null : metric.reportedPurchases?.toString() ?? null,
      reportedPurchaseValue: metric.reportedPurchaseValue?.toString() ?? null,
      retrievedAt: metric.retrievedAt,
    })),
  };
}
