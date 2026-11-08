import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const SALLA_USER_INFO_URL = 'https://accounts.salla.sa/oauth2/user/info';
const SALLA_API_BASE = 'https://api.salla.dev/admin/v2';
const PAGE_SIZE = 50;

export type SyncResource = 'PRODUCTS' | 'CUSTOMERS' | 'ORDERS';

export interface SallaPage {
  records: Record<string, unknown>[];
  hasMore: boolean;
}

export interface SallaRefreshedTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires?: number;
}

@Injectable()
export class SallaProvider {
  async getStoreIdentity(
    accessToken: string,
  ): Promise<{ id: string; name?: string; domain?: string }> {
    const response = await fetch(SALLA_USER_INFO_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) {
      throw new ServiceUnavailableException(
        'Could not retrieve Salla merchant identity',
      );
    }
    const root = isRecord(payload.data) ? payload.data : payload;
    const store = isRecord(root.store)
      ? root.store
      : isRecord(root.merchant)
        ? root.merchant
        : root;
    const id = store.store_id ?? store.id ?? root.store_id ?? root.merchant_id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      throw new ServiceUnavailableException(
        'Salla identity response did not contain a store identifier',
      );
    }
    const name = store.name ?? store.store_name;
    const domain = store.domain ?? store.url ?? store.store_url;
    return {
      id: String(id),
      ...(typeof name === 'string' ? { name } : {}),
      ...(typeof domain === 'string' ? { domain } : {}),
    };
  }

  async refreshToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<SallaRefreshedTokens> {
    const response = await fetch('https://accounts.salla.sa/oauth2/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !isRecord(payload) ||
      typeof payload.access_token !== 'string' ||
      typeof payload.refresh_token !== 'string'
    ) {
      throw new ServiceUnavailableException('Salla token refresh failed');
    }
    return payload as unknown as SallaRefreshedTokens;
  }

  async fetchPage(
    resource: SyncResource,
    accessToken: string,
    page: number,
  ): Promise<SallaPage> {
    const path = resource.toLowerCase();
    const url = new URL(`${SALLA_API_BASE}/${path}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(PAGE_SIZE));
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        `Salla ${resource.toLowerCase()} request failed (${response.status})`,
      );
      Object.assign(error, {
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
      });
      throw error;
    }
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new ServiceUnavailableException(
        `Unexpected Salla ${resource.toLowerCase()} response shape`,
      );
    }
    const records = payload.data.filter(isRecord);
    const pagination = isRecord(payload.pagination)
      ? payload.pagination
      : undefined;
    const currentPage =
      readNumber(pagination, 'currentPage', 'current_page') ?? page;
    const totalPages = readNumber(
      pagination,
      'totalPages',
      'total_pages',
      'last_page',
    );
    const totalRecords = readNumber(pagination, 'total', 'count');
    const links =
      pagination && isRecord(pagination.links) ? pagination.links : undefined;
    const hasNextLink =
      typeof links?.next === 'string' && links.next.length > 0;
    const hasMore =
      totalPages !== undefined
        ? currentPage < totalPages
        : totalRecords !== undefined
          ? currentPage * PAGE_SIZE < totalRecords
          : hasNextLink || records.length === PAGE_SIZE;
    return { records, hasMore };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(
  value: Record<string, unknown> | undefined,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate))
      return candidate;
    if (
      typeof candidate === 'string' &&
      candidate.trim() &&
      Number.isFinite(Number(candidate))
    )
      return Number(candidate);
  }
  return undefined;
}
