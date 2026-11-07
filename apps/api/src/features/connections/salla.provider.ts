import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const SALLA_USER_INFO_URL = 'https://accounts.salla.sa/oauth2/user/info';

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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
