import { SallaProvider } from './salla.provider.js';

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
});
