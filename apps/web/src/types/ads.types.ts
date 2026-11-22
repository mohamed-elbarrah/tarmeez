export type AdConnectionStatus = "CONNECTED" | "REAUTH_REQUIRED" | "DISCONNECTED";
export type AdIntentStatus = "INITIATED" | "AUTHORIZED" | "COMPLETED" | "FAILED" | "EXPIRED" | "CANCELLED";
export type AdStatusActionState = "QUEUED" | "PROCESSING" | "CONFIRMED" | "REJECTED" | "NOT_CONFIRMED";

export interface AdAccountConnection {
  id: string;
  ownerUserId: string;
  provider: "META";
  externalAccountId: string;
  name: string;
  currency: string | null;
  reportingTimeZone: string | null;
  status: AdConnectionStatus;
  lastCampaignSyncAt: string | null;
  lastMetricsSyncAt: string | null;
}

export interface MetaAdAccountOption {
  id: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
}

export interface MetaIntent {
  id: string;
  status: AdIntentStatus;
  expiresAt: string;
  accounts: MetaAdAccountOption[];
}

export interface MetaStartResult {
  intentId: string;
  authorizationUrl: string;
  expiresAt: string;
}

export interface AdMetric {
  id: string;
  reportDate: string;
  currency: string | null;
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  reportedPurchases: string | null;
  reportedPurchaseValue: string | null;
  retrievedAt: string;
}

export interface AdCampaign {
  id: string;
  accountConnectionId: string;
  externalCampaignId: string;
  name: string;
  objective: string | null;
  configuredStatus: string | null;
  effectiveStatus: string | null;
  statusObservedAt: string | null;
  sourceUpdatedAt: string | null;
  updatedAt: string;
  account: Pick<AdAccountConnection, "id" | "name" | "currency" | "reportingTimeZone" | "ownerUserId">;
  dailyMetrics: AdMetric[];
}

export interface AdStatusAction {
  id: string;
  campaignId: string;
  actorUserId: string;
  idempotencyKey: string;
  expectedStatus: string;
  requestedStatus: string;
  state: AdStatusActionState;
  failureCode: string | null;
  requestedAt: string;
  completedAt: string | null;
}
