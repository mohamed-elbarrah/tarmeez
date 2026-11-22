import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const GRAPH_BASE = 'https://graph.facebook.com/v25.0';
const META_AUTH_URL = 'https://www.facebook.com/v25.0/dialog/oauth';

export interface MetaTokenResponse { access_token: string; token_type?: string; expires_in?: number }
export interface MetaAdAccount { id: string; name?: string; currency?: string; timezone_name?: string }
export interface MetaCampaign {
  id: string; name?: string; objective?: string; status?: string;
  configured_status?: string; effective_status?: string; updated_time?: string;
}
export interface MetaInsight {
  date_start: string; date_stop: string; spend?: string; impressions?: string; clicks?: string;
  reportedPurchases?: string; reportedPurchaseValue?: string;
}

@Injectable()
export class MetaProvider {
  buildAuthorizationUrl(input: { appId: string; redirectUri: string; state: string }): URL {
    const url = new URL(META_AUTH_URL);
    url.searchParams.set('client_id', input.appId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'ads_read,ads_management');
    url.searchParams.set('state', input.state);
    return url;
  }

  async exchangeCode(code: string, appId: string, appSecret: string, redirectUri: string): Promise<MetaTokenResponse> {
    const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code', code);
    const payload = await this.request(url);
    if (!isRecord(payload) || typeof payload.access_token !== 'string') throw new MetaProviderError('META_OAUTH_FAILED');
    return { access_token: payload.access_token, ...(typeof payload.expires_in === 'number' ? { expires_in: payload.expires_in } : {}) };
  }

  async listAdAccounts(token: string): Promise<MetaAdAccount[]> {
    const payload = await this.paginate('/me/adaccounts', token, 'id,name,currency,timezone_name');
    return payload.map((item): MetaAdAccount => ({
      id: stringValue(item.id), name: optionalString(item.name), currency: optionalString(item.currency), timezone_name: optionalString(item.timezone_name),
    })).filter((item) => Boolean(item.id));
  }

  async listCampaigns(token: string, accountId: string): Promise<MetaCampaign[]> {
    const payload = await this.paginate(`/${adAccountPath(accountId)}/campaigns`, token, 'id,name,objective,status,configured_status,effective_status,updated_time');
    return payload.map((item): MetaCampaign => ({
      id: stringValue(item.id), name: optionalString(item.name), objective: optionalString(item.objective),
      status: optionalString(item.status), configured_status: optionalString(item.configured_status),
      effective_status: optionalString(item.effective_status), updated_time: optionalString(item.updated_time),
    })).filter((item) => Boolean(item.id));
  }

  async updateCampaignStatus(token: string, campaignId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void> {
    const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(campaignId)}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ status }), signal: AbortSignal.timeout(20_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload) || payload.success !== true) throw new MetaProviderError(response.status === 190 ? 'META_TOKEN_INVALID' : 'META_STATUS_UPDATE_FAILED');
  }

  async getCampaign(token: string, campaignId: string): Promise<MetaCampaign> {
    const payload = await this.request(`${GRAPH_BASE}/${encodeURIComponent(campaignId)}?fields=id,name,objective,status,configured_status,effective_status,updated_time`, token);
    if (!isRecord(payload) || typeof payload.id !== 'string') throw new MetaProviderError('META_CAMPAIGN_NOT_FOUND');
    return { id: payload.id, name: optionalString(payload.name), objective: optionalString(payload.objective), status: optionalString(payload.status), configured_status: optionalString(payload.configured_status), effective_status: optionalString(payload.effective_status), updated_time: optionalString(payload.updated_time) };
  }

  async getCampaignInsights(token: string, campaignId: string, from: string, to: string): Promise<MetaInsight[]> {
    const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(campaignId)}/insights`);
    url.searchParams.set('fields', 'date_start,date_stop,spend,impressions,clicks,actions,action_values');
    url.searchParams.set('time_range', JSON.stringify({ since: from, until: to }));
    url.searchParams.set('time_increment', '1');
    const payload = await this.request(url, token);
    if (!isRecord(payload) || !Array.isArray(payload.data)) throw new MetaProviderError('META_INVALID_RESPONSE');
    return payload.data.filter(isRecord).map((row) => {
      const actions = Array.isArray(row.actions) ? row.actions.filter(isRecord) : [];
      const values = Array.isArray(row.action_values) ? row.action_values.filter(isRecord) : [];
      const purchase = actions.find((item) => item.action_type === 'purchase');
      const purchaseValue = values.find((item) => item.action_type === 'purchase');
      return {
        date_start: stringValue(row.date_start), date_stop: stringValue(row.date_stop),
        spend: optionalString(row.spend), impressions: optionalString(row.impressions), clicks: optionalString(row.clicks),
        reportedPurchases: purchase ? optionalString(purchase.value) : undefined,
        reportedPurchaseValue: purchaseValue ? optionalString(purchaseValue.value) : undefined,
      };
    }).filter((item) => Boolean(item.date_start));
  }

  private async paginate(path: string, token: string, fields: string): Promise<Record<string, unknown>[]> {
    const records: Record<string, unknown>[] = [];
    let next: string | undefined = `${GRAPH_BASE}${path}?fields=${encodeURIComponent(fields)}&limit=100`;
    for (let page = 0; next && page < 100; page += 1) {
      const payload = await this.request(next, token);
      if (!isRecord(payload) || !Array.isArray(payload.data)) throw new MetaProviderError('META_INVALID_RESPONSE');
      records.push(...payload.data.filter(isRecord));
      next = isRecord(payload.paging) && typeof payload.paging.next === 'string' ? payload.paging.next : undefined;
    }
    if (next) throw new MetaProviderError('META_PAGINATION_LIMIT');
    return records;
  }

  private async request(input: string | URL, token?: string): Promise<unknown> {
    try {
      const url = new URL(input);
      if (token) url.searchParams.set('access_token', token);
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new MetaProviderError(response.status === 401 ? 'META_TOKEN_INVALID' : 'META_REQUEST_FAILED');
      return payload;
    } catch (error) {
      if (error instanceof MetaProviderError) throw error;
      throw new ServiceUnavailableException('Meta API unavailable');
    }
  }
}

export class MetaProviderError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'MetaProviderError'; }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function adAccountPath(accountId: string): string { return accountId.startsWith('act_') ? accountId : `act_${accountId}`; }
