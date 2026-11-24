import { CommerceSyncService } from './commerce-sync.service.js';
import { SallaTokenError } from './salla.provider.js';
import { createCipheriv, randomBytes } from 'node:crypto';

describe('CommerceSyncService webhook queueing', () => {
  function serviceWith(
    repository: Record<string, unknown>,
    queue: Record<string, unknown>,
    enabled = true,
    salla: Record<string, unknown> = {},
  ) {
    return new CommerceSyncService(
      repository as never,
      {
        get: vi.fn((key: string) =>
          key === 'SALLA_ENABLED'
            ? enabled
            : key === 'SALLA_TOKEN_ENCRYPTION_KEY'
              ? Buffer.alloc(32, 7).toString('base64')
              : undefined,
        ),
      } as never,
      salla as never,
      queue as never,
    );
  }

  it('removes a newly-created run when no BullMQ job is accepted', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi.fn().mockResolvedValue({
        created: true,
        run: { id: 'run-1', resource: 'PRODUCTS', status: 'QUEUED' },
      }),
      deleteQueuedRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS'),
    ).rejects.toThrow('redis unavailable');
    expect(repository.deleteQueuedRun).toHaveBeenCalledWith('run-1');
  });

  it('preserves the queue error and marks the run recoverable when reconciliation fails', async () => {
    const queueError = new Error('queue unavailable');
    const reconciliationError = new Error('redis read unavailable');
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi.fn().mockResolvedValue({
        created: true,
        run: { id: 'run-1', resource: 'PRODUCTS', status: 'QUEUED' },
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(queueError),
      getJob: vi.fn().mockRejectedValue(reconciliationError),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS'),
    ).rejects.toBe(queueError);
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.queue_reconciliation_failed',
      }),
    );
  });

  it('reconciles an existing deduplicated run when its queue add is rejected', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi.fn().mockResolvedValue({
        created: false,
        run: { id: 'run-existing', resource: 'PRODUCTS', status: 'QUEUED' },
      }),
      deleteQueuedRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS'),
    ).rejects.toThrow('redis unavailable');
    expect(repository.deleteQueuedRun).toHaveBeenCalledWith('run-existing');
  });

  it('requeues a failed deduplicated run without creating a second run', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi.fn().mockResolvedValue({
        created: false,
        run: { id: 'run-failed', resource: 'PRODUCTS', status: 'FAILED' },
      }),
      requeueFailedRun: vi.fn().mockResolvedValue(true),
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS', 'event-1'),
    ).resolves.toEqual({
      queued: true,
      processed: true,
      syncRunId: 'run-failed',
    });
    expect(repository.createWebhookRun).toHaveBeenCalledTimes(1);
    expect(repository.requeueFailedRun).toHaveBeenCalledWith('run-failed');
    expect(queue.add).toHaveBeenCalledWith(
      'sync-connection',
      { syncRunId: 'run-failed' },
      expect.objectContaining({
        jobId: 'salla-connection-1-products-event-event-1',
      }),
    );
  });

  it('keeps a completed deduplicated run terminal', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi.fn().mockResolvedValue({
        created: false,
        run: { id: 'run-complete', resource: 'PRODUCTS', status: 'SUCCEEDED' },
      }),
      requeueFailedRun: vi.fn(),
    };
    const queue = { getJob: vi.fn().mockResolvedValue(null), add: vi.fn() };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS', 'event-1'),
    ).resolves.toMatchObject({
      queued: false,
      reason: 'already_terminal',
      syncRunId: 'run-complete',
    });
    expect(repository.requeueFailedRun).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('preserves a failed deduplicated run when its retry job is not accepted', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi.fn().mockResolvedValue({
        created: false,
        run: { id: 'run-failed', resource: 'PRODUCTS', status: 'FAILED' },
      }),
      requeueFailedRun: vi.fn().mockResolvedValue(true),
      updateRun: vi.fn().mockResolvedValue(undefined),
      deleteQueuedRun: vi.fn(),
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS', 'event-1'),
    ).rejects.toThrow('redis unavailable');
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-failed',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.queue_failed',
      }),
    );
    expect(repository.deleteQueuedRun).not.toHaveBeenCalled();
  });

  it('keeps the initial sync run recoverable when BullMQ lookup is unavailable', async () => {
    const repository = {
      createRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        resource: 'ALL',
        status: 'QUEUED',
        createdAt: new Date(),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = serviceWith(repository, queue);

    await expect(service.enqueueForConnection('connection-1')).rejects.toThrow(
      'redis unavailable',
    );
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'QUEUED',
        errorKey: 'errors.sync.queue_reconciliation_failed',
        finishedAt: null,
      }),
    );
  });

  it('keeps the initial sync queued when queue lookup is ambiguous', async () => {
    const queueError = new Error('queue response lost');
    const repository = {
      createRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        resource: 'ALL',
        status: 'QUEUED',
        createdAt: new Date(),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(queueError),
      getJob: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = serviceWith(repository, queue);

    await expect(service.enqueueForConnection('connection-1')).rejects.toBe(
      queueError,
    );
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'QUEUED',
        errorKey: 'errors.sync.queue_reconciliation_failed',
        finishedAt: null,
      }),
    );
  });

  it('leaves an initial sync queued when add fails after BullMQ accepted the job', async () => {
    const queueError = new Error('queue response lost');
    const repository = {
      createRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        resource: 'ALL',
        status: 'QUEUED',
        createdAt: new Date(),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(queueError),
      getJob: vi.fn().mockResolvedValue({ id: 'run-1' }),
    };
    const service = serviceWith(repository, queue);

    await expect(service.enqueueForConnection('connection-1')).rejects.toBe(
      queueError,
    );
    expect(repository.updateRun).not.toHaveBeenCalled();
  });

  it('marks an initial sync failed only when BullMQ confirms the job is absent', async () => {
    const queueError = new Error('redis unavailable');
    const repository = {
      createRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        resource: 'ALL',
        status: 'QUEUED',
        createdAt: new Date(),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(queueError),
      getJob: vi.fn().mockResolvedValue(null),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueForConnection('connection-1'),
    ).resolves.toMatchObject({
      queued: false,
      status: 'FAILED',
      syncRunId: 'run-1',
    });
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.queue_failed',
      }),
    );
  });

  it('keeps an enqueue run queued when BullMQ add fails but the job exists', async () => {
    const queueError = new Error('queue response lost');
    const repository = {
      findMembership: vi.fn().mockResolvedValue({
        merchantId: 'workspace-1',
        role: 'OWNER',
        merchant: { status: 'ACTIVE' },
      }),
      findConnectionForMerchant: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        resource: 'PRODUCTS',
        status: 'QUEUED',
        createdAt: new Date(),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(queueError),
      getJob: vi.fn().mockResolvedValue({ id: 'run-1' }),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueue('user-1', 'connection-1', 'PRODUCTS'),
    ).rejects.toBe(queueError);
    expect(repository.updateRun).not.toHaveBeenCalled();
  });

  it('marks an enqueue run recoverable when BullMQ failure status cannot be reconciled', async () => {
    const queueError = new Error('queue response lost');
    const repository = {
      findMembership: vi.fn().mockResolvedValue({
        merchantId: 'workspace-1',
        role: 'OWNER',
        merchant: { status: 'ACTIVE' },
      }),
      findConnectionForMerchant: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        resource: 'PRODUCTS',
        status: 'QUEUED',
        createdAt: new Date(),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(queueError),
      getJob: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueue('user-1', 'connection-1', 'PRODUCTS'),
    ).rejects.toBe(queueError);
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.queue_reconciliation_failed',
      }),
    );
  });

  it('does not enqueue webhook sync when Salla is disabled', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi.fn(),
      createWebhookRun: vi.fn(),
    };
    const queue = { add: vi.fn(), getJob: vi.fn() };
    const service = serviceWith(repository, queue, false);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS'),
    ).resolves.toEqual({
      queued: false,
      reason: 'integration_disabled',
    });
    expect(repository.findConnectionByExternalStoreId).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('marks a sync run failed without reauthorization when refresh configuration is missing', async () => {
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'ALL',
      }),
      findSyncContext: vi.fn().mockResolvedValue({
        id: 'connection-1',
        merchantId: 'workspace-1',
        status: 'CONNECTED',
        accessTokenEncrypted: 'unused',
        refreshTokenEncrypted: 'unused',
        tokenExpiresAt: new Date(Date.now() - 60_000),
      }),
      markConnectionReauthRequired: vi.fn().mockResolvedValue(undefined),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const service = serviceWith(repository, {});

    await expect(service.processRun('run-1')).rejects.toBeDefined();
    expect(repository.markConnectionReauthRequired).not.toHaveBeenCalled();
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.failed',
      }),
    );
  });

  it('refreshes proactively when a refresh token exists without an expiry', async () => {
    const key = Buffer.alloc(32, 7);
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'PRODUCTS',
      }),
      findSyncContext: vi.fn().mockResolvedValue({
        id: 'connection-1',
        merchantId: 'workspace-1',
        status: 'CONNECTED',
        accessTokenEncrypted: encrypt('old-access-token', key),
        refreshTokenEncrypted: encrypt('refresh-token', key),
        tokenExpiresAt: null,
      }),
      tryAcquireRefreshLock: vi.fn().mockResolvedValue({ count: 1 }),
      saveRefreshedTokens: vi.fn().mockResolvedValue({ count: 1 }),
      releaseRefreshLock: vi.fn().mockResolvedValue(undefined),
      updateRun: vi.fn().mockResolvedValue(undefined),
      upsertPage: vi.fn().mockResolvedValue(0),
    };
    const service = new CommerceSyncService(
      repository as never,
      {
        get: vi.fn(
          (keyName: string) =>
            ({
              SALLA_ENABLED: true,
              SALLA_CLIENT_ID: 'client-id',
              SALLA_CLIENT_SECRET: 'client-secret',
              SALLA_TOKEN_ENCRYPTION_KEY: keyValue(keyName),
            })[keyName],
        ),
      } as never,
      {
        refreshToken: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
        fetchPage: vi.fn().mockResolvedValue({ records: [], hasMore: false }),
      } as never,
      {} as never,
    );

    await service.processRun('run-1');

    expect(repository.tryAcquireRefreshLock).toHaveBeenCalled();
  });

  it('refreshes once and retries a Salla 401 without looping', async () => {
    const key = Buffer.alloc(32, 7);
    const unauthorized = Object.assign(new Error('expired access token'), {
      status: 401,
    });
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'PRODUCTS',
      }),
      findSyncContext: vi.fn().mockResolvedValue({
        id: 'connection-1',
        merchantId: 'workspace-1',
        status: 'CONNECTED',
        accessTokenEncrypted: encrypt('old-access-token', key),
        refreshTokenEncrypted: encrypt('refresh-token', key),
        tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
      }),
      tryAcquireRefreshLock: vi.fn().mockResolvedValue({ count: 1 }),
      saveRefreshedTokens: vi.fn().mockResolvedValue({ count: 1 }),
      releaseRefreshLock: vi.fn().mockResolvedValue(undefined),
      updateRun: vi.fn().mockResolvedValue(undefined),
      upsertPage: vi.fn().mockResolvedValue(0),
    };
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce({ records: [], hasMore: false });
    const service = new CommerceSyncService(
      repository as never,
      {
        get: vi.fn(
          (keyName: string) =>
            ({
              SALLA_ENABLED: true,
              SALLA_CLIENT_ID: 'client-id',
              SALLA_CLIENT_SECRET: 'client-secret',
              SALLA_TOKEN_ENCRYPTION_KEY: keyValue(keyName),
            })[keyName],
        ),
      } as never,
      {
        refreshToken: vi.fn().mockResolvedValue({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
        fetchPage,
      } as never,
      {} as never,
    );

    await service.processRun('run-1');

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(repository.tryAcquireRefreshLock).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary failures queued while BullMQ attempts remain', async () => {
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'PRODUCTS',
      }),
      findSyncContext: vi.fn().mockResolvedValue({
        id: 'connection-1',
        merchantId: 'workspace-1',
        status: 'CONNECTED',
        accessTokenEncrypted: encrypt('access-token', Buffer.alloc(32, 7)),
        refreshTokenEncrypted: null,
        tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const service = serviceWith(repository, {}, true, {
      fetchPage: vi.fn().mockRejectedValue(new Error('provider unavailable')),
    });
    const processRun = service.processRun.bind(service) as unknown as (
      id: string,
      attempt: { attemptsMade: number; maxAttempts: number },
    ) => Promise<void>;

    await expect(
      processRun('run-1', { attemptsMade: 0, maxAttempts: 4 }),
    ).rejects.toThrow('provider unavailable');
    expect(repository.updateRun).toHaveBeenLastCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'QUEUED',
        errorKey: 'errors.sync.retrying',
        finishedAt: null,
      }),
    );
  });

  it('marks an inactive connection run failed before throwing', async () => {
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'ALL',
      }),
      findSyncContext: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'DISCONNECTED' }),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const service = serviceWith(repository, {});

    await expect(service.processRun('run-1')).rejects.toBeDefined();
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.connection_inactive',
      }),
    );
  });

  it('fails a run when the provider repeats a page response', async () => {
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'PRODUCTS',
      }),
      findSyncContext: vi.fn().mockResolvedValue({
        id: 'connection-1',
        merchantId: 'workspace-1',
        status: 'CONNECTED',
        accessTokenEncrypted: encrypt('access-token', Buffer.alloc(32, 7)),
        refreshTokenEncrypted: null,
        tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
      }),
      updateRun: vi.fn().mockResolvedValue(undefined),
      upsertPage: vi.fn().mockResolvedValue(1),
    };
    const service = serviceWith(repository, {}, true, {
      fetchPage: vi
        .fn()
        .mockResolvedValue({ records: [{ id: 'same-record' }], hasMore: true }),
    });

    await expect(service.processRun('run-1')).rejects.toMatchObject({
      key: 'errors.sync.pagination_invalid',
    });
    expect(repository.updateRun).toHaveBeenLastCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.pagination_invalid',
      }),
    );
  });

  it('reports already queued and terminal webhook runs without duplicate work', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi
        .fn()
        .mockResolvedValueOnce({
          created: false,
          run: { id: 'run-1', status: 'QUEUED', resource: 'PRODUCTS' },
        })
        .mockResolvedValueOnce({
          created: false,
          run: { id: 'run-2', status: 'SUCCEEDED', resource: 'PRODUCTS' },
        }),
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
      add: vi.fn(),
    };
    const service = serviceWith(repository, queue);

    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS'),
    ).resolves.toMatchObject({
      queued: false,
      processed: false,
      reason: 'already_queued',
    });
    queue.getJob.mockResolvedValue(null);
    await expect(
      service.enqueueWebhookSync('store-1', 'PRODUCTS'),
    ).resolves.toMatchObject({
      queued: false,
      processed: false,
      reason: 'already_terminal',
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('uses durable event IDs and unique non-idempotent fallbacks when absent', async () => {
    const repository = {
      findConnectionByExternalStoreId: vi
        .fn()
        .mockResolvedValue({ id: 'connection-1', status: 'CONNECTED' }),
      createWebhookRun: vi.fn().mockResolvedValue({
        created: true,
        run: { id: 'run-1', status: 'QUEUED' },
      }),
    };
    const queue = {
      add: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn(),
    };
    const service = serviceWith(repository, queue);

    await service.enqueueWebhookSync('store-1', 'PRODUCTS', 'event-123');
    await service.enqueueWebhookSync('store-1', 'PRODUCTS');

    expect(repository.createWebhookRun.mock.calls[0][2]).toBe(
      'salla-connection-1-products-event-event-123',
    );
    const fallback = repository.createWebhookRun.mock.calls[1][2] as string;
    expect(fallback).toMatch(/^salla-connection-1-products-fallback-/);
    await service.enqueueWebhookSync('store-1', 'PRODUCTS');
    expect(repository.createWebhookRun.mock.calls[2][2]).not.toBe(fallback);
  });

  it('uses a newer token saved by another worker before acquiring a refresh lock', async () => {
    const key = Buffer.alloc(32, 7);
    const initialContext = {
      id: 'connection-1',
      merchantId: 'workspace-1',
      status: 'CONNECTED',
      accessTokenEncrypted: encrypt('old-access-token', key),
      refreshTokenEncrypted: encrypt('old-refresh-token', key),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    };
    const newerContext = {
      ...initialContext,
      accessTokenEncrypted: encrypt('new-access-token', key),
      refreshTokenEncrypted: encrypt('new-refresh-token', key),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    };
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'PRODUCTS',
      }),
      findSyncContext: vi
        .fn()
        .mockResolvedValueOnce(initialContext)
        .mockResolvedValueOnce(newerContext),
      tryAcquireRefreshLock: vi.fn(),
      updateRun: vi.fn().mockResolvedValue(undefined),
      upsertPage: vi.fn().mockResolvedValue(0),
    };
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('expired'), { status: 401 }),
      )
      .mockResolvedValueOnce({ records: [], hasMore: false });
    const service = new CommerceSyncService(
      repository as never,
      {
        get: vi.fn(
          (keyName: string) =>
            ({
              SALLA_ENABLED: true,
              SALLA_CLIENT_ID: 'client-id',
              SALLA_CLIENT_SECRET: 'client-secret',
              SALLA_TOKEN_ENCRYPTION_KEY: keyValue(keyName),
            })[keyName],
        ),
      } as never,
      { fetchPage, refreshToken: vi.fn() } as never,
      {} as never,
    );

    await service.processRun('run-1');

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(repository.tryAcquireRefreshLock).not.toHaveBeenCalled();
  });

  it('marks the connection and run for reauthorization when Salla rejects refresh tokens', async () => {
    const key = Buffer.alloc(32, 7);
    const repository = {
      findRun: vi.fn().mockResolvedValue({
        id: 'run-1',
        connectionId: 'connection-1',
        resource: 'ALL',
      }),
      findSyncContext: vi.fn().mockResolvedValue({
        id: 'connection-1',
        merchantId: 'workspace-1',
        status: 'CONNECTED',
        accessTokenEncrypted: encrypt('access-token', key),
        refreshTokenEncrypted: encrypt('refresh-token', key),
        tokenExpiresAt: new Date(Date.now() - 60_000),
      }),
      markConnectionReauthRequired: vi.fn().mockResolvedValue(undefined),
      tryAcquireRefreshLock: vi.fn().mockResolvedValue({ count: 1 }),
      releaseRefreshLock: vi.fn().mockResolvedValue(undefined),
      updateRun: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: vi.fn(
        (key: string) =>
          ({
            SALLA_ENABLED: true,
            SALLA_CLIENT_ID: 'client-id',
            SALLA_CLIENT_SECRET: 'client-secret',
            SALLA_TOKEN_ENCRYPTION_KEY:
              key === 'SALLA_TOKEN_ENCRYPTION_KEY' ? keyValue(key) : undefined,
          })[key],
      ),
    };
    const salla = {
      refreshToken: vi
        .fn()
        .mockRejectedValue(
          new SallaTokenError('INVALID_GRANT', 'invalid grant'),
        ),
    };
    const service = new CommerceSyncService(
      repository as never,
      config as never,
      salla as never,
      {} as never,
    );

    await expect(service.processRun('run-1')).rejects.toBeDefined();
    expect(repository.markConnectionReauthRequired).toHaveBeenCalledWith(
      'connection-1',
    );
    expect(repository.updateRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'FAILED',
        errorKey: 'errors.sync.reauth_required',
      }),
    );
  });
});

function keyValue(_key: string): string {
  return Buffer.alloc(32, 7).toString('base64');
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}
