import { HttpStatus } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception.js';
import { ConnectionsService } from './connections.service.js';

describe('ConnectionsService Salla OAuth orchestration', () => {
  const repository = {
    findWorkspaceOwner: vi.fn(),
    findConnectionByExternalStoreId: vi.fn(),
    updateWebhookTokens: vi.fn(),
    listForWorkspace: vi.fn(),
    disconnect: vi.fn(),
  };
  const oauthRepository = {
    createIntent: vi.fn(),
    findIntentForUser: vi.fn(),
    consumeState: vi.fn(),
    completeConnection: vi.fn(),
    failIntent: vi.fn(),
    cancelIntentForUser: vi.fn(),
  };
  const config = { get: vi.fn() };
  const salla = {
    buildAuthorizationUrl: vi.fn(),
    exchangeAuthorizationCode: vi.fn(),
    getStoreIdentity: vi.fn(),
  };
  const commerceSync = { enqueueForConnection: vi.fn(), enqueueWebhookSync: vi.fn() };
  const audit = { record: vi.fn() };

  function service() {
    return new ConnectionsService(
      repository as never,
      oauthRepository as never,
      config as never,
      salla as never,
      commerceSync as never,
      audit as never,
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();
    oauthRepository.completeConnection.mockResolvedValue({ id: 'connection-1' });
    config.get.mockImplementation((key: string) => ({
      SALLA_ENABLED: true,
      SALLA_CLIENT_ID: 'client-id',
      SALLA_CLIENT_SECRET: 'client-secret',
      SALLA_REDIRECT_URI: 'https://api.example.test/connections/salla/callback',
      'app.frontendUrl': 'https://app.example.test',
      SALLA_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
      SALLA_WEBHOOK_SECRET: 'webhook-secret',
    })[key]);
    salla.buildAuthorizationUrl.mockReturnValue(
      new URL('https://accounts.salla.sa/oauth2/auth?state=raw-state'),
    );
  });

  it('persists OAuth connection lifecycle without a service-level audit write', async () => {
    oauthRepository.consumeState.mockResolvedValue({ id: 'intent-1', merchantId: 'workspace-1', initiatedByUserId: 'user-1' });
    salla.exchangeAuthorizationCode.mockResolvedValue({ access_token: 'secret-access', refresh_token: 'secret-refresh', expires_in: 3600 });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });

    await service().handleSallaCallback({ state: 'state-1', code: 'code-1' });

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('delegates disconnect auditing to the transaction-bound repository', async () => {
    repository.disconnect.mockResolvedValue({ disconnected: true });

    await expect(service().disconnect('user-1', 'connection-1')).resolves.toEqual({ disconnected: true });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('cancels a Salla intent through the owner-scoped repository', async () => {
    oauthRepository.cancelIntentForUser.mockResolvedValue({ id: 'intent-1', status: 'CANCELLED' });

    await expect(service().cancelSallaIntent('user-1', 'intent-1')).resolves.toEqual({ id: 'intent-1', status: 'CANCELLED' });
    expect(oauthRepository.cancelIntentForUser).toHaveBeenCalledWith('user-1', 'intent-1');
  });

  it('preserves cancellation when the provider fails after the intent was cancelled', async () => {
    oauthRepository.consumeState.mockResolvedValue({ id: 'intent-1', merchantId: 'workspace-1', initiatedByUserId: 'user-1' });
    salla.exchangeAuthorizationCode.mockRejectedValue(new Error('provider unavailable'));
    oauthRepository.failIntent.mockResolvedValue(null);

    await expect(service().handleSallaCallback({ state: 'state-1', code: 'code-1' })).resolves.toMatchObject({
      intentId: 'intent-1', status: 'CANCELLED',
    });
  });

  it('rejects connection start with the safe not-configured error when Salla is disabled', async () => {
    repository.findWorkspaceOwner.mockResolvedValue({
      merchantId: 'workspace-1',
      role: 'OWNER',
      merchant: { status: 'ACTIVE' },
    });
    config.get.mockImplementation((key: string) =>
      ({
        SALLA_ENABLED: false,
        SALLA_CLIENT_ID: 'client-id',
        SALLA_REDIRECT_URI:
          'https://api.example.test/connections/salla/callback',
      })[key],
    );

    await expect(service().startSalla('user-1')).rejects.toMatchObject({
      key: 'errors.connections.salla_not_configured',
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
    expect(oauthRepository.createIntent).not.toHaveBeenCalled();
  });

  it('creates a hashed-state intent and returns an authorization URL without a store URL', async () => {
    repository.findWorkspaceOwner.mockResolvedValue({
      merchantId: 'workspace-1',
      role: 'OWNER',
      merchant: { status: 'ACTIVE' },
    });
    oauthRepository.createIntent.mockImplementation(async (input) => ({
      id: 'intent-1',
      expiresAt: input.expiresAt,
    }));

    const result = await service().startSalla('user-1');

    expect(result).toMatchObject({
      intentId: 'intent-1',
      authorizationUrl: 'https://accounts.salla.sa/oauth2/auth?state=raw-state',
    });
    expect(oauthRepository.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        initiatedByUserId: 'user-1',
        stateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(oauthRepository.createIntent.mock.calls[0][0].stateHash).not.toBe(
      'raw-state',
    );
  });

  it('rejects a second active intent for the same initiating user', async () => {
    repository.findWorkspaceOwner.mockResolvedValue({
      merchantId: 'workspace-1',
      role: 'OWNER',
      merchant: { status: 'ACTIVE' },
    });
    oauthRepository.createIntent.mockRejectedValue(
      new AppException(
        'errors.connections.salla_intent_active',
        HttpStatus.CONFLICT,
      ),
    );

    await expect(service().startSalla('user-1')).rejects.toMatchObject({
      key: 'errors.connections.salla_intent_active',
    });
  });

  it('consumes state once, exchanges code, saves the connection, and queues initial sync', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1',
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    salla.exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });
    salla.getStoreIdentity.mockResolvedValue({
      id: 'store-1',
      name: 'Store',
      domain: 'store.example',
    });

    const result = await service().handleSallaCallback({
      code: 'code-1',
      state: 'state-1',
    });

    expect(result).toMatchObject({ intentId: 'intent-1', status: 'COMPLETED' });
    expect(oauthRepository.consumeState).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(oauthRepository.completeConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        ownerUserId: 'user-1',
        externalStoreId: 'store-1',
      }),
    );
    expect(commerceSync.enqueueForConnection).toHaveBeenCalledWith(
      'connection-1',
    );
    expect(result).not.toHaveProperty('access_token');
  });

  it('keeps the completed intent and connection when initial sync queueing fails', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1',
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
    });
    salla.exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });
    oauthRepository.completeConnection.mockResolvedValue({ id: 'connection-1' });
    commerceSync.enqueueForConnection.mockRejectedValue(new Error('queue unavailable'));

    await expect(
      service().handleSallaCallback({ code: 'code-1', state: 'state-1' }),
    ).resolves.toEqual({ intentId: 'intent-1', status: 'COMPLETED', reason: 'sync_failed' });
    expect(oauthRepository.completeConnection).toHaveBeenCalled();
    expect(oauthRepository.failIntent).not.toHaveBeenCalled();
  });

  it('treats expires_in as a duration when persisting OAuth tokens', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1', merchantId: 'workspace-1', initiatedByUserId: 'user-1',
    });
    salla.exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600,
    });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });

    const before = Date.now();
    await service().handleSallaCallback({ code: 'code-1', state: 'state-1' });
    const expiry = oauthRepository.completeConnection.mock.calls[0][0].tokenExpiresAt as Date;

    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + 3_599_000);
    expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + 3_601_000);
  });

  it('treats an OAuth expires value near 1.9 billion as a Unix timestamp', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1', merchantId: 'workspace-1', initiatedByUserId: 'user-1',
    });
    salla.exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'access-token', refresh_token: 'refresh-token', expires: 1_900_000_000,
    });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });

    await service().handleSallaCallback({ state: 'state-1', code: 'code-1' });

    expect(oauthRepository.completeConnection.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ tokenExpiresAt: new Date(1_900_000_000 * 1000) }),
    );
  });

  it('records provider denial as a safe failed status without exchanging a code', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1',
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
    });

    const result = await service().handleSallaCallback({
      state: 'state-1',
      error: 'access_denied',
    });

    expect(result).toEqual({ intentId: 'intent-1', status: 'FAILED', reason: 'provider_denied' });
    expect(oauthRepository.failIntent).toHaveBeenCalledWith(
      'intent-1',
      'provider_denied',
      expect.objectContaining({ merchantId: 'workspace-1', actorUserId: 'user-1' }),
    );
    expect(salla.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not bind a store when its existing connection belongs to another workspace', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1',
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
    });
    salla.exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });
    oauthRepository.completeConnection.mockRejectedValue(
      new AppException('errors.connections.salla_ownership_conflict', HttpStatus.CONFLICT),
    );

    await expect(
      service().handleSallaCallback({ code: 'code-1', state: 'state-1' }),
    ).resolves.toEqual({ intentId: 'intent-1', status: 'FAILED', reason: 'ownership_conflict' });
    expect(oauthRepository.failIntent).toHaveBeenCalledWith(
      'intent-1',
      'salla_ownership_conflict',
      expect.objectContaining({ merchantId: 'workspace-1', actorUserId: 'user-1' }),
    );
  });

  it('rejects callback state when the initiating user is no longer an active owner', async () => {
    oauthRepository.consumeState.mockRejectedValue(
      new AppException('errors.connections.workspace_owner_required', HttpStatus.FORBIDDEN),
    );

    await expect(
      service().handleSallaCallback({ code: 'code-1', state: 'state-1' }),
    ).rejects.toMatchObject({ key: 'errors.connections.workspace_owner_required' });
    expect(salla.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('returns intent status only to its initiating user and workspace', async () => {
    oauthRepository.findIntentForUser.mockResolvedValue({
      id: 'intent-1',
      status: 'PROCESSING',
      expiresAt: new Date('2030-01-01'),
      completedAt: null,
      failedAt: null,
      failureCode: null,
    });

    await expect(service().getSallaIntentStatus('user-1', 'intent-1')).resolves.toEqual(
      expect.objectContaining({ id: 'intent-1', status: 'PROCESSING' }),
    );
    expect(oauthRepository.findIntentForUser).toHaveBeenCalledWith(
      'user-1',
      'intent-1',
    );
  });

  it('marks exchange failures failed without exposing provider details', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1',
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
    });
    salla.exchangeAuthorizationCode.mockRejectedValue(
      new Error('provider secret should not escape'),
    );

    await expect(
      service().handleSallaCallback({ code: 'code-1', state: 'state-1' }),
    ).resolves.toEqual({ intentId: 'intent-1', status: 'FAILED', reason: 'oauth_failed' });
    expect(oauthRepository.failIntent).toHaveBeenCalledWith(
      'intent-1', 'oauth_failed', expect.objectContaining({ merchantId: 'workspace-1', actorUserId: 'user-1' }),
    );
  });

  it('marks identity failures failed and never saves a connection', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1',
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
    });
    salla.exchangeAuthorizationCode.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });
    salla.getStoreIdentity.mockRejectedValue(new Error('identity response leaked'));

    await expect(
      service().handleSallaCallback({ code: 'code-1', state: 'state-1' }),
    ).resolves.toEqual({ intentId: 'intent-1', status: 'FAILED', reason: 'oauth_failed' });
  });

  it('does not process a replayed callback after atomic state consumption rejects it', async () => {
    oauthRepository.consumeState.mockRejectedValue(
      new AppException('errors.connections.salla_state_invalid', HttpStatus.BAD_REQUEST),
    );

    await expect(
      service().handleSallaCallback({ code: 'code-1', state: 'replayed-state' }),
    ).rejects.toMatchObject({ key: 'errors.connections.salla_state_invalid' });
    expect(salla.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('acknowledges an unknown authorization webhook without creating or binding a connection', async () => {
    repository.findConnectionByExternalStoreId.mockResolvedValue(null);
    salla.getStoreIdentity.mockResolvedValue({ id: 'unknown-store' });
    const body = {
      event: 'app.store.authorized',
      data: { access_token: 'access-token' },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await expect(
      service().receiveSallaAppEvent({ signature }, rawBody, body),
    ).resolves.toEqual({ received: true, processed: false, reason: 'unknown_store' });
    expect(repository.updateWebhookTokens).not.toHaveBeenCalled();
  });

  it('does not reconnect a disconnected store from a delayed authorization webhook', async () => {
    repository.findConnectionByExternalStoreId.mockResolvedValue({
      id: 'connection-1', merchantId: 'workspace-1', status: 'DISCONNECTED',
    });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });
    const body = { event: 'app.store.authorized', data: { access_token: 'access-token' } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await expect(
      service().receiveSallaAppEvent({ signature }, rawBody, body),
    ).resolves.toEqual({ received: true, processed: false, reason: 'connection_inactive' });
    expect(repository.updateWebhookTokens).not.toHaveBeenCalled();
  });

  it('preserves token expiry when an authorization webhook omits expiry', async () => {
    repository.findConnectionByExternalStoreId.mockResolvedValue({
      id: 'connection-1', merchantId: 'workspace-1', status: 'CONNECTED',
    });
    repository.updateWebhookTokens.mockResolvedValue({ count: 1 });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });
    const body = { event: 'app.store.authorized', data: { access_token: 'access-token' } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await service().receiveSallaAppEvent({ signature }, rawBody, body);

    expect(repository.updateWebhookTokens.mock.calls[0][1]).not.toHaveProperty('tokenExpiresAt');
  });

  it('deduplicates replayed authorization webhooks with the verified body fingerprint', async () => {
    repository.findConnectionByExternalStoreId.mockResolvedValue({
      id: 'connection-1', merchantId: 'workspace-1', status: 'CONNECTED',
    });
    repository.updateWebhookTokens.mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0, duplicate: true });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });
    const body = { event: 'app.store.authorized', data: { access_token: 'access-token' } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await service().receiveSallaAppEvent({ signature }, rawBody, body);
    await expect(service().receiveSallaAppEvent({ signature }, rawBody, body)).resolves.toEqual({
      received: true, processed: false, reason: 'duplicate',
    });

    expect(repository.updateWebhookTokens).toHaveBeenNthCalledWith(
      1,
      'store-1',
      expect.any(Object),
      expect.objectContaining({
        merchantId: 'workspace-1', connectionId: 'connection-1',
        dedupeKey: `salla-auth-${createHash('sha256').update(rawBody).digest('hex')}`,
      }),
    );
    expect(repository.updateWebhookTokens).toHaveBeenCalledTimes(2);
  });

  it('does not mutate or enqueue Salla work when the integration is disabled', async () => {
    config.get.mockImplementation((key: string) => key === 'SALLA_ENABLED' ? false : ({
      SALLA_WEBHOOK_SECRET: 'webhook-secret',
    })[key]);
    const body = { event: 'app.store.authorized', data: { access_token: 'access-token' } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await expect(
      service().receiveSallaAppEvent({ signature }, rawBody, body),
    ).resolves.toEqual({ received: true, processed: false, reason: 'integration_disabled' });
    expect(salla.getStoreIdentity).not.toHaveBeenCalled();
    expect(commerceSync.enqueueWebhookSync).not.toHaveBeenCalled();
  });

  it('fails a callback safely when Salla is disabled before exchanging tokens', async () => {
    oauthRepository.consumeState.mockResolvedValue({
      id: 'intent-1', merchantId: 'workspace-1', initiatedByUserId: 'user-1',
    });
    config.get.mockImplementation((key: string) => key === 'SALLA_ENABLED' ? false : undefined);

    await expect(service().handleSallaCallback({ state: 'state-1', code: 'code-1' })).resolves.toEqual({
      intentId: 'intent-1', status: 'FAILED', reason: 'not_configured',
    });
    expect(oauthRepository.failIntent).toHaveBeenCalledWith(
      'intent-1', 'salla_not_configured', expect.objectContaining({ merchantId: 'workspace-1', actorUserId: 'user-1' }),
    );
    expect(salla.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('parses webhook expiry values as Unix timestamps in seconds', async () => {
    repository.findConnectionByExternalStoreId.mockResolvedValue({
      id: 'connection-1', merchantId: 'workspace-1', status: 'CONNECTED',
    });
    salla.getStoreIdentity.mockResolvedValue({ id: 'store-1' });
    repository.updateWebhookTokens.mockResolvedValue({ count: 1 });
    const expires = 1_900_000_000;
    const body = {
      event: 'app.store.authorized',
      data: { access_token: 'access-token', expires },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await service().receiveSallaAppEvent({ signature }, rawBody, body);

    expect(repository.updateWebhookTokens).toHaveBeenCalledWith(
      'store-1', expect.objectContaining({ tokenExpiresAt: new Date(expires * 1000) }),
      expect.objectContaining({ merchantId: 'workspace-1', connectionId: 'connection-1', dedupeKey: expect.any(String) }),
    );
  });

  it('passes the Salla event identifier into webhook deduplication', async () => {
    repository.findConnectionByExternalStoreId.mockResolvedValue({ id: 'connection-1', merchantId: 'workspace-1', status: 'CONNECTED' });
    commerceSync.enqueueWebhookSync.mockResolvedValue({ queued: true, syncRunId: 'run-1' });
    const body = { event: 'product.updated', event_id: 'event-123', data: { store_id: 'store-1' } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await service().receiveSallaAppEvent({ signature }, rawBody, body);

    expect(commerceSync.enqueueWebhookSync).toHaveBeenCalledWith('store-1', 'PRODUCTS', 'event-123');
  });

  it('uses the exact raw body hash as the missing-event-ID fallback', async () => {
    commerceSync.enqueueWebhookSync.mockResolvedValue({ queued: true, syncRunId: 'run-1' });
    const body = { event: 'product.updated', data: { id: 'product-1', store_id: 'store-1' } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await service().receiveSallaAppEvent({ signature }, rawBody, body);
    await service().receiveSallaAppEvent({ signature }, rawBody, body);

    const fingerprint = createHash('sha256').update(rawBody).digest('hex');
    expect(commerceSync.enqueueWebhookSync).toHaveBeenNthCalledWith(1, 'store-1', 'PRODUCTS', fingerprint);
    expect(commerceSync.enqueueWebhookSync).toHaveBeenNthCalledWith(2, 'store-1', 'PRODUCTS', fingerprint);
  });

  it('uses distinct raw body hashes for distinct payloads without event IDs', async () => {
    commerceSync.enqueueWebhookSync.mockResolvedValue({ queued: true, syncRunId: 'run-1' });
    const body = { event: 'product.updated', id: 'resource-1', data: { store_id: 'store-1' } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    await service().receiveSallaAppEvent({ signature }, rawBody, body);
    const secondBody = { event: 'product.updated', id: 'resource-2', data: { store_id: 'store-1' } };
    const secondRawBody = Buffer.from(JSON.stringify(secondBody));
    const secondSignature = createHmac('sha256', 'webhook-secret').update(secondRawBody).digest('hex');
    await service().receiveSallaAppEvent({ signature: secondSignature }, secondRawBody, secondBody);

    expect(commerceSync.enqueueWebhookSync.mock.calls.map((call) => call[2])).toEqual([
      createHash('sha256').update(rawBody).digest('hex'),
      createHash('sha256').update(secondRawBody).digest('hex'),
    ]);
  });
});
