import {
  compareOAuthState,
  generateOAuthState,
  hashOAuthState,
} from './salla.state.js';
import { SallaPaginationError, SallaProvider } from './salla.provider.js';
import { SallaTokenError } from './salla.provider.js';
import { SallaConnectionIntentStatus } from '../../generated/prisma/enums.js';

describe('SallaProvider', () => {
  let provider: SallaProvider;

  beforeEach(() => {
    provider = new SallaProvider();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches a paginated resource using the store bearer token', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 101, name: 'Test product' }],
          pagination: { currentPage: 1, totalPages: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      provider.fetchPage('PRODUCTS', 'test-access-token', 1),
    ).resolves.toEqual({
      records: [{ id: 101, name: 'Test product' }],
      hasMore: true,
    });
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(requestUrl.toString()).toContain(
      '/admin/v2/products?page=1&per_page=50',
    );
    expect(requestOptions.headers).toMatchObject({
      authorization: 'Bearer test-access-token',
    });
  });

  it('fails safely when Salla returns a non-success response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'rate limited' }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '4' },
      }),
    );

    await expect(
      provider.fetchPage('ORDERS', 'test-access-token', 1),
    ).rejects.toMatchObject({
      message: 'Salla orders request failed (429)',
      status: 429,
      retryAfter: '4',
    });
  });

  it('rejects a full page without pagination metadata instead of inferring another page forever', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: Array.from({ length: 50 }, (_, id) => ({ id })) }), { status: 200 }),
    );

    await expect(provider.fetchPage('PRODUCTS', 'test-access-token', 1))
      .rejects.toBeInstanceOf(SallaPaginationError);
  });

  it('builds a Custom Mode authorization URL with offline access and the exact redirect URI', () => {
    const redirectUri = 'https://app.example.test/oauth/callback?tenant=one%2Ftwo';

    const authorizationUrl = provider.buildAuthorizationUrl({
      clientId: 'client-id',
      redirectUri,
      state: 'state-value',
    });

    expect(authorizationUrl.toString()).toBe(
      'https://accounts.salla.sa/oauth2/auth?client_id=client-id&redirect_uri=https%3A%2F%2Fapp.example.test%2Foauth%2Fcallback%3Ftenant%3Done%252Ftwo&response_type=code&scope=offline_access&state=state-value',
    );
  });

  it('exchanges an authorization code and validates the token response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      provider.exchangeAuthorizationCode(
        'authorization-code',
        'client-id',
        'client-secret',
        'https://app.example.test/callback',
      ),
    ).resolves.toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });

    const [, requestOptions] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(requestOptions.method).toBe('POST');
    expect((requestOptions.body as URLSearchParams).toString()).toBe(
      'grant_type=authorization_code&code=authorization-code&client_id=client-id&client_secret=client-secret&redirect_uri=https%3A%2F%2Fapp.example.test%2Fcallback',
    );
  });

  it('rejects an invalid authorization-code response without exposing secrets', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant', access_token: 'secret' }), {
        status: 400,
      }),
    );

    await expect(
      provider.exchangeAuthorizationCode(
        'authorization-code',
        'client-id',
        'client-secret',
        'https://app.example.test/callback',
      ),
    ).rejects.toMatchObject({ message: 'Salla authorization-code exchange failed' });
  });

  it('classifies invalid grants separately from transient provider failures', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    await expect(provider.refreshToken('refresh-token', 'client-id', 'client-secret'))
      .rejects.toMatchObject({ kind: 'INVALID_GRANT' } satisfies Partial<SallaTokenError>);

    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 }));
    await expect(provider.refreshToken('refresh-token', 'client-id', 'client-secret'))
      .rejects.toMatchObject({ kind: 'TRANSIENT' } satisfies Partial<SallaTokenError>);
  });

  it('rejects an authorization-code response with a non-numeric expiry', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: '3600',
        }),
        { status: 200 },
      ),
    );

    await expect(
      provider.exchangeAuthorizationCode(
        'authorization-code',
        'client-id',
        'client-secret',
        'https://app.example.test/callback',
      ),
    ).rejects.toMatchObject({ message: 'Salla authorization-code exchange failed' });
  });

  it('rejects a refresh response with an empty token', async () => {
    vi.mocked(fetch).mockResolvedValue(
      tokenResponse({ access_token: '', refresh_token: 'refresh-token' }),
    );

    await expect(
      provider.refreshToken('refresh-token', 'client-id', 'client-secret'),
    ).rejects.toMatchObject({ message: 'Salla token refresh failed' });
  });

  it('wraps authorization-code transport rejection without leaking the provider error', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new Error('connect failed with client-secret=super-secret'),
    );

    await expect(
      provider.exchangeAuthorizationCode(
        'authorization-code',
        'client-id',
        'client-secret',
        'https://app.example.test/callback',
      ),
    ).rejects.toMatchObject({
      message: 'Salla authorization-code exchange unavailable',
    });
  });

  it('wraps authorization-code timeout without leaking the timeout error', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('request timed out with client-secret=super-secret', 'TimeoutError'),
    );

    await expect(
      provider.exchangeAuthorizationCode(
        'authorization-code',
        'client-id',
        'client-secret',
        'https://app.example.test/callback',
      ),
    ).rejects.toMatchObject({
      message: 'Salla authorization-code exchange unavailable',
    });
  });

  it('wraps refresh transport rejection without leaking the provider error', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new Error('connect failed with refresh-token=super-secret'),
    );

    await expect(
      provider.refreshToken('refresh-token', 'client-id', 'client-secret'),
    ).rejects.toMatchObject({ message: 'Salla token refresh unavailable' });
  });

  it('wraps refresh timeout without leaking the timeout error', async () => {
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('request timed out with refresh-token=super-secret', 'TimeoutError'),
    );

    await expect(
      provider.refreshToken('refresh-token', 'client-id', 'client-secret'),
    ).rejects.toMatchObject({ message: 'Salla token refresh unavailable' });
  });

  it.each([
    ['non-number', '3600'],
    ['negative', -1],
    ['non-finite', Number.NaN],
  ])('rejects a refresh response with a %s expiry', async (_name, expiresIn) => {
    vi.mocked(fetch).mockResolvedValue(
      tokenResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: expiresIn,
      }),
    );

    await expect(
      provider.refreshToken('refresh-token', 'client-id', 'client-secret'),
    ).rejects.toMatchObject({ message: 'Salla token refresh failed' });
  });

  it('exposes the complete intent lifecycle status set', () => {
    expect(Object.values(SallaConnectionIntentStatus)).toEqual([
      'INITIATED',
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
    ]);
  });

  it('generates and verifies hashed OAuth state without storing the raw value', () => {
    const state = generateOAuthState();
    const stateHash = hashOAuthState(state);

    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(compareOAuthState(state, stateHash)).toBe(true);
    expect(compareOAuthState('different-state', stateHash)).toBe(false);
  });
});

function tokenResponse(payload: unknown): Response {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}
