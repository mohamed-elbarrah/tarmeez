import { MetaProvider } from './meta.provider.js';

describe('MetaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a Meta ad-account ID without duplicating the act_ prefix', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await new MetaProvider().listCampaigns('access-token', 'act_123456789');

    const [requestUrl] = vi.mocked(fetch).mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe('/v25.0/act_123456789/campaigns');
  });

  it('adds the act_ prefix when Meta returns a numeric ad-account ID', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await new MetaProvider().listCampaigns('access-token', '123456789');

    const [requestUrl] = vi.mocked(fetch).mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.pathname).toBe('/v25.0/act_123456789/campaigns');
  });
});
