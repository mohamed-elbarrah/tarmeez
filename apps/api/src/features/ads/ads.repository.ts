import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { MetaCampaign, MetaInsight } from './meta.provider.js';

@Injectable()
export class AdsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMembership(userId: string) {
    return this.prisma.merchantMembership.findUnique({ where: { userId }, select: { merchantId: true, role: true, merchant: { select: { status: true } } } });
  }

  createIntent(input: Prisma.AdConnectionIntentCreateInput) { return this.prisma.adConnectionIntent.create({ data: input }); }

  findIntentForUser(userId: string, id: string) {
    return this.prisma.adConnectionIntent.findFirst({ where: { id, initiatedByUserId: userId }, include: { authorization: true } });
  }

  findIntentByState(stateHash: string) { return this.prisma.adConnectionIntent.findUnique({ where: { stateHash } }); }

  failIntent(id: string) { return this.prisma.adConnectionIntent.updateMany({ where: { id, status: 'INITIATED' }, data: { status: 'FAILED' } }); }

  async authorizeIntent(id: string, input: { authorizationId: string }) {
    return this.prisma.adConnectionIntent.updateMany({ where: { id, status: 'INITIATED', expiresAt: { gt: new Date() } }, data: { status: 'AUTHORIZED', authorizationId: input.authorizationId } });
  }

  createAuthorization(input: Prisma.AdAuthorizationCreateInput) { return this.prisma.adAuthorization.create({ data: input }); }

  async completeAccounts(intentId: string, userId: string, accountIds: string[], accounts: Array<{ id: string; name: string; currency?: string; timezone_name?: string }>) {
    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.adConnectionIntent.findFirst({ where: { id: intentId, initiatedByUserId: userId, status: 'AUTHORIZED', expiresAt: { gt: new Date() } }, include: { authorization: true } });
      if (!intent?.authorization) return null;
      const selected = accounts.filter((account) => accountIds.includes(account.id));
      if (selected.length !== accountIds.length) return null;
      for (const account of selected) {
        const existing = await tx.adAccountConnection.findUnique({ where: { provider_externalAccountId: { provider: 'META', externalAccountId: account.id } }, select: { merchantId: true, ownerUserId: true } });
        if (existing && (existing.merchantId !== intent.merchantId || existing.ownerUserId !== userId)) return null;
        await tx.adAccountConnection.upsert({
          where: { provider_externalAccountId: { provider: 'META', externalAccountId: account.id } },
          create: { merchantId: intent.merchantId, ownerUserId: userId, authorizationId: intent.authorization.id, provider: 'META', externalAccountId: account.id, name: account.name, currency: account.currency, reportingTimeZone: account.timezone_name },
          update: { merchantId: intent.merchantId, ownerUserId: userId, authorizationId: intent.authorization.id, name: account.name, currency: account.currency, reportingTimeZone: account.timezone_name, status: 'CONNECTED' },
        });
      }
      await tx.adConnectionIntent.update({ where: { id: intentId }, data: { status: 'COMPLETED' } });
      return selected;
    });
  }

  listAccounts(merchantId: string) {
    return this.prisma.adAccountConnection.findMany({ where: { merchantId }, select: { id: true, ownerUserId: true, provider: true, externalAccountId: true, name: true, currency: true, reportingTimeZone: true, status: true, lastCampaignSyncAt: true, lastMetricsSyncAt: true }, orderBy: { createdAt: 'desc' } });
  }

  findAccountForRead(merchantId: string, id: string) { return this.prisma.adAccountConnection.findFirst({ where: { id, merchantId }, include: { authorization: true } }); }

  findAccountForOwner(merchantId: string, ownerUserId: string, id: string) { return this.prisma.adAccountConnection.findFirst({ where: { id, merchantId, ownerUserId }, include: { authorization: true } }); }

  findAccountByExternalForOwner(merchantId: string, ownerUserId: string, externalAccountId: string) { return this.prisma.adAccountConnection.findFirst({ where: { merchantId, ownerUserId, provider: 'META', externalAccountId }, include: { authorization: true } }); }

  findAccountForSync(id: string) { return this.prisma.adAccountConnection.findUnique({ where: { id }, include: { authorization: true } }); }

  createSyncRun(input: Prisma.AdSyncRunCreateInput) { return this.prisma.adSyncRun.create({ data: input }); }

  startSyncRun(id: string) { return this.prisma.adSyncRun.update({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date() } }).catch(() => null); }

  finishSyncRun(id: string, status: 'SUCCEEDED' | 'FAILED' | 'PARTIAL', failureCode?: string) { return this.prisma.adSyncRun.update({ where: { id }, data: { status, failureCode, finishedAt: new Date() } }); }

  async upsertCampaign(account: { id: string; merchantId: string }, campaign: MetaCampaign) {
    return this.prisma.adCampaign.upsert({ where: { accountConnectionId_externalCampaignId: { accountConnectionId: account.id, externalCampaignId: campaign.id } }, create: { merchantId: account.merchantId, accountConnectionId: account.id, externalCampaignId: campaign.id, name: campaign.name ?? campaign.id, objective: campaign.objective, configuredStatus: campaign.configured_status ?? campaign.status, effectiveStatus: campaign.effective_status, sourceUpdatedAt: parseDate(campaign.updated_time), statusObservedAt: new Date() }, update: { name: campaign.name ?? campaign.id, objective: campaign.objective, configuredStatus: campaign.configured_status ?? campaign.status, effectiveStatus: campaign.effective_status, sourceUpdatedAt: parseDate(campaign.updated_time), statusObservedAt: new Date() } });
  }

  async upsertInsights(campaignId: string, currency: string | null, insights: MetaInsight[]) {
    for (const insight of insights) {
      await this.prisma.adCampaignDailyMetric.upsert({ where: { campaignId_reportDate: { campaignId, reportDate: new Date(`${insight.date_start}T00:00:00.000Z`) } }, create: metricData(campaignId, currency, insight), update: metricData(campaignId, currency, insight) });
    }
  }

  markAccountSynced(id: string) { return this.prisma.adAccountConnection.update({ where: { id }, data: { lastCampaignSyncAt: new Date(), lastMetricsSyncAt: new Date() } }); }

  disconnectAccount(merchantId: string, ownerUserId: string, id: string) { return this.prisma.adAccountConnection.updateMany({ where: { id, merchantId, ownerUserId, status: { not: 'DISCONNECTED' } }, data: { status: 'DISCONNECTED' } }); }

  listCampaigns(merchantId: string, accountId: string, page: number, perPage: number, configuredStatus?: string) {
    const where: Prisma.AdCampaignWhereInput = { merchantId, accountConnectionId: accountId, ...(configuredStatus ? { configuredStatus } : {}) };
    return Promise.all([this.prisma.adCampaign.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { updatedAt: 'desc' }, include: { accountConnection: { include: { authorization: true } }, dailyMetrics: { orderBy: { reportDate: 'desc' }, take: 1 } } }), this.prisma.adCampaign.count({ where })]);
  }

  findCampaignForRead(merchantId: string, id: string) { return this.prisma.adCampaign.findFirst({ where: { id, merchantId }, include: { accountConnection: { include: { authorization: true } }, dailyMetrics: { orderBy: { reportDate: 'desc' }, take: 90 } } }); }

  findAction(campaignId: string, key: string) { return this.prisma.adCampaignStatusAction.findUnique({ where: { campaignId_idempotencyKey: { campaignId, idempotencyKey: key } } }); }

  findActionForRead(merchantId: string, campaignId: string, id: string) { return this.prisma.adCampaignStatusAction.findFirst({ where: { id, campaignId, merchantId } }); }

  findActionForProcessing(id: string) { return this.prisma.adCampaignStatusAction.findFirst({ where: { id, state: 'QUEUED' }, include: { campaign: { include: { accountConnection: { include: { authorization: true } } } } } }); }

  async createStatusAction(input: Prisma.AdCampaignStatusActionCreateInput) { return this.prisma.adCampaignStatusAction.create({ data: input }); }

  updateCampaignStatus(id: string, input: { configuredStatus: string; effectiveStatus?: string; sourceUpdatedAt?: Date; statusObservedAt: Date }) { return this.prisma.adCampaign.update({ where: { id }, data: input }); }

  updateAction(id: string, state: 'PROCESSING' | 'CONFIRMED' | 'REJECTED' | 'NOT_CONFIRMED', failureCode?: string) { return this.prisma.adCampaignStatusAction.update({ where: { id }, data: { state, failureCode, ...(state !== 'PROCESSING' ? { completedAt: new Date() } : {}) } }); }
}

function parseDate(value: string | undefined): Date | undefined { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date; }
function metricData(campaignId: string, currency: string | null, insight: MetaInsight): Prisma.AdCampaignDailyMetricUncheckedCreateInput {
  return { campaignId, reportDate: new Date(`${insight.date_start}T00:00:00.000Z`), currency, spend: insight.spend ? Number(insight.spend) : undefined, impressions: toBigInt(insight.impressions), clicks: toBigInt(insight.clicks), reportedPurchases: toBigInt(insight.reportedPurchases), reportedPurchaseValue: insight.reportedPurchaseValue ? Number(insight.reportedPurchaseValue) : undefined, retrievedAt: new Date() };
}
function toBigInt(value: string | undefined): bigint | undefined { return value && /^\d+$/.test(value) ? BigInt(value) : undefined; }
