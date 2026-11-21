import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const SALLA_USER_INFO_URL = 'https://accounts.salla.sa/oauth2/user/info';
const SALLA_AUTHORIZATION_URL = 'https://accounts.salla.sa/oauth2/auth';
const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
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

export interface SallaAuthorizationTokens extends SallaRefreshedTokens {}

export class SallaTokenError extends Error {
  constructor(readonly kind: 'INVALID_GRANT' | 'TRANSIENT', message: string) {
    super(message);
    this.name = 'SallaTokenError';
  }
}

export class SallaPaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SallaPaginationError';
  }
}

@Injectable()
export class SallaProvider {
  buildAuthorizationUrl(input: {
    clientId: string;
    redirectUri: string;
    state: string;
    scope?: string[];
  }): URL {
    const url = new URL(SALLA_AUTHORIZATION_URL);
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', (input.scope ?? ['offline_access']).join(' '));
    url.searchParams.set('state', input.state);
    return url;
  }

  async exchangeAuthorizationCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<SallaAuthorizationTokens> {
    const response = await fetchTokenResponse(
      SALLA_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(15_000),
      },
      'Salla authorization-code exchange unavailable',
    );
    const payload: unknown = await response.json().catch(() => null);
    const tokens = parseTokenResponse(payload);
    if (!response.ok || !tokens) {
      throw tokenFailure(payload, 'Salla authorization-code exchange failed');
    }
    return tokens;
  }

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
    const response = await fetchTokenResponse(
      SALLA_TOKEN_URL,
      {
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
      },
      'Salla token refresh unavailable',
    );
    const payload: unknown = await response.json().catch(() => null);
    const tokens = parseTokenResponse(payload);
    if (!response.ok || !tokens) {
      throw tokenFailure(payload, 'Salla token refresh failed');
    }
    return tokens;
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
    const hasPaginationMetadata =
      totalPages !== undefined || totalRecords !== undefined || hasNextLink;
    if (!hasPaginationMetadata && records.length === PAGE_SIZE)
      throw new SallaPaginationError('Salla pagination metadata is missing');
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

async function fetchTokenResponse(
  input: RequestInfo | URL,
  init: RequestInit,
  unavailableMessage: string,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new SallaTokenError('TRANSIENT', unavailableMessage);
  }
}

function tokenFailure(payload: unknown, message: string): SallaTokenError {
  if (isRecord(payload)) {
    const code = payload.error ?? payload.code;
    if (typeof code === 'string' && ['invalid_grant', 'unauthorized', 'invalid_token'].includes(code.toLowerCase()))
      return new SallaTokenError('INVALID_GRANT', message);
  }
  return new SallaTokenError('TRANSIENT', message);
}

function parseTokenResponse(payload: unknown): SallaRefreshedTokens | undefined {
  if (!isRecord(payload)) return undefined;
  if (
    typeof payload.access_token !== 'string' ||
    payload.access_token.length === 0 ||
    typeof payload.refresh_token !== 'string' ||
    payload.refresh_token.length === 0
  ) {
    return undefined;
  }
  if (
    ('expires_in' in payload && !isNumericExpiry(payload.expires_in)) ||
    ('expires' in payload && !isNumericExpiry(payload.expires))
  ) {
    return undefined;
  }
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    ...(typeof payload.expires_in === 'number'
      ? { expires_in: payload.expires_in }
      : {}),
    ...(typeof payload.expires === 'number' ? { expires: payload.expires } : {}),
  };
}

function isNumericExpiry(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
