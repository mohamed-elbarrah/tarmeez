import { ConnectionsRepository } from './connections.repository.js';
import { SallaOAuthRepository } from './salla-oauth.repository.js';

describe('ConnectionsRepository', () => {
  it('scopes connection lookup by stable external store identity', async () => {
    const prisma = {
      storeConnection: {
        findUnique: vi.fn().mockResolvedValue({ id: 'connection-1' }),
      },
    };
    const repository = new ConnectionsRepository(prisma as never);

    await repository.findConnectionByExternalStoreId('store-1');

    expect(prisma.storeConnection.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          platform_externalStoreId: {
            platform: 'SALLA',
            externalStoreId: 'store-1',
          },
        },
      }),
    );
  });

  it('does not permit a connection lookup without the Salla platform discriminator', async () => {
    const prisma = {
      storeConnection: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const repository = new ConnectionsRepository(prisma as never);

    await repository.findConnectionByExternalStoreId('store-2');

    expect(
      prisma.storeConnection.findUnique.mock.calls[0][0].where
        .platform_externalStoreId.platform,
    ).toBe('SALLA');
  });

  it('atomically transitions only an unexpired pending state to processing', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'intent-1',
          merchantId: 'workspace-1',
          initiatedByUserId: 'user-1',
        }),
      },
      merchantMembership: {
        findUnique: vi.fn().mockResolvedValue({
          merchantId: 'workspace-1',
          role: 'OWNER',
          merchant: { status: 'ACTIVE' },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await repository.consumeState('state-hash');

    expect(tx.sallaConnectionIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stateHash: 'state-hash',
          status: { in: ['INITIATED', 'PENDING'] },
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        data: expect.objectContaining({
          status: 'PROCESSING',
          consumedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('reconnects a deliberately authorized disconnected store as connected', async () => {
    const tx = {
      storeConnection: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: 'connection-1',
            merchantId: 'workspace-1',
            status: 'DISCONNECTED',
          }),
        update: vi.fn().mockResolvedValue({ id: 'connection-1' }),
      },
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await repository.completeConnection({
      intentId: 'intent-1',
      merchantId: 'workspace-1',
      ownerUserId: 'user-1',
      externalStoreId: 'store-1',
      accessTokenEncrypted: 'access',
      refreshTokenEncrypted: 'refresh',
      tokenExpiresAt: null,
    });

    expect(tx.storeConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONNECTED',
          verifiedAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        actorUserId: 'user-1',
        action: 'CONNECTION_REAUTHORIZED',
        metadata: { status: 'CONNECTED' },
      }),
      tx,
    );
  });

  it('rolls back connection persistence when the required OAuth audit fails', async () => {
    const auditError = new Error('audit unavailable');
    const tx = {
      storeConnection: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'connection-1' }),
      },
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockRejectedValue(auditError) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.completeConnection({
        intentId: 'intent-1',
        merchantId: 'workspace-1',
        ownerUserId: 'user-1',
        externalStoreId: 'store-1',
        accessTokenEncrypted: 'access',
        refreshTokenEncrypted: 'refresh',
        tokenExpiresAt: null,
      }),
    ).rejects.toBe(auditError);
    expect(tx.sallaConnectionIntent.updateMany).not.toHaveBeenCalled();
  });

  it('writes the disconnect audit in the same transaction as credential revocation', async () => {
    const tx = {
      merchantMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            merchantId: 'workspace-1',
            role: 'OWNER',
            merchant: { status: 'ACTIVE' },
          }),
      },
      storeConnection: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new ConnectionsRepository(
      prisma as never,
      audit as never,
    );

    await repository.disconnect('user-1', 'connection-1');

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        actorUserId: 'user-1',
        action: 'CONNECTION_DISCONNECTED',
      }),
      tx,
    );
  });

  it('rolls back disconnect when the required audit write fails', async () => {
    const auditError = new Error('audit unavailable');
    const tx = {
      merchantMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            merchantId: 'workspace-1',
            role: 'OWNER',
            merchant: { status: 'ACTIVE' },
          }),
      },
      storeConnection: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockRejectedValue(auditError) };
    const repository = new ConnectionsRepository(
      prisma as never,
      audit as never,
    );

    await expect(repository.disconnect('user-1', 'connection-1')).rejects.toBe(
      auditError,
    );
  });

  it('fails an intent and writes its audit in one transaction', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await repository.failIntent('intent-1', 'oauth_failed', {
      merchantId: 'workspace-1',
      actorUserId: 'user-1',
    });

    expect(tx.sallaConnectionIntent.updateMany).toHaveBeenCalled();
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        actorUserId: 'user-1',
        action: 'CONNECTION_AUTHORIZATION_FAILED',
        entityId: 'intent-1',
        metadata: { reason: 'oauth_failed' },
      }),
      tx,
    );
  });

  it('does not retain a failed intent mutation when its required audit fails', async () => {
    const auditError = new Error('audit unavailable');
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockRejectedValue(auditError) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.failIntent('intent-1', 'oauth_failed', {
        merchantId: 'workspace-1',
        actorUserId: null,
      }),
    ).rejects.toBe(auditError);
  });

  it('does not overwrite a cancelled intent when a callback fails late', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn() };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.failIntent('intent-1', 'oauth_failed', {
        merchantId: 'workspace-1',
        actorUserId: 'user-1',
      }),
    ).resolves.toBeNull();
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('updates webhook tokens and audits them in one transaction without token metadata', async () => {
    const tx = {
      storeConnection: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new ConnectionsRepository(
      prisma as never,
      audit as never,
    );

    await repository.updateWebhookTokens(
      'store-1',
      {
        accessTokenEncrypted: 'encrypted-access',
        refreshTokenEncrypted: 'encrypted-refresh',
      },
      {
        merchantId: 'workspace-1',
        connectionId: 'connection-1',
        dedupeKey: 'salla-auth-body-1',
      },
    );

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        actorUserId: null,
        action: 'CONNECTION_WEBHOOK_TOKEN_UPDATED',
        entityId: 'connection-1',
        metadata: { status: 'CONNECTED' },
      }),
      tx,
    );
    expect(audit.create.mock.calls[0][0]).not.toHaveProperty(
      'accessTokenEncrypted',
    );
  });

  it('does not retain webhook token updates when their required audit fails', async () => {
    const auditError = new Error('audit unavailable');
    const tx = {
      storeConnection: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockRejectedValue(auditError) };
    const repository = new ConnectionsRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.updateWebhookTokens(
        'store-1',
        {
          accessTokenEncrypted: 'encrypted-access',
        },
        {
          merchantId: 'workspace-1',
          connectionId: 'connection-1',
          dedupeKey: 'salla-auth-body-2',
        },
      ),
    ).rejects.toBe(auditError);
  });

  it('treats a duplicate authorization webhook as a transactional no-op', async () => {
    const duplicate = { code: 'P2002' };
    const prisma = {
      $transaction: vi.fn(async () => {
        throw duplicate;
      }),
    };
    const audit = { create: vi.fn() };
    const repository = new ConnectionsRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.updateWebhookTokens(
        'store-1',
        {
          accessTokenEncrypted: 'encrypted-access',
        },
        {
          merchantId: 'workspace-1',
          connectionId: 'connection-1',
          dedupeKey: 'salla-auth-body-1',
        },
      ),
    ).resolves.toEqual({ count: 0, duplicate: true });
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('expires stale active intents before inserting a new unique active key', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi
          .fn()
          .mockResolvedValue({ id: 'intent-2', expiresAt: new Date() }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await repository.createIntent({
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
      stateHash: 'hash',
      expiresAt: new Date(),
    });

    expect(tx.sallaConnectionIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          initiatedByUserId: 'user-1',
          expiresAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
        data: { status: 'EXPIRED', activeIntentKey: null },
      }),
    );
    expect(tx.sallaConnectionIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ activeIntentKey: 'user-1' }),
      }),
    );
  });

  it('recovers stale processing intents even when their active key was cleared', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi
          .fn()
          .mockResolvedValue({ id: 'intent-2', expiresAt: new Date() }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await repository.createIntent({
      merchantId: 'workspace-1',
      initiatedByUserId: 'user-1',
      stateHash: 'hash',
      expiresAt: new Date(),
    });

    expect(
      tx.sallaConnectionIntent.updateMany.mock.calls[0][0].where,
    ).not.toHaveProperty('activeIntentKey');
  });

  it('translates a database unique collision into the active-intent AppException', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await expect(
      repository.createIntent({
        merchantId: 'workspace-1',
        initiatedByUserId: 'user-1',
        stateHash: 'hash',
        expiresAt: new Date(),
      }),
    ).rejects.toMatchObject({ key: 'errors.connections.salla_intent_active' });
  });

  it('completes connection persistence and intent completion in one transaction', async () => {
    const tx = {
      storeConnection: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'connection-1' }),
      },
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.completeConnection({
        intentId: 'intent-1',
        merchantId: 'workspace-1',
        ownerUserId: 'user-1',
        externalStoreId: 'store-1',
        accessTokenEncrypted: 'access',
        refreshTokenEncrypted: 'refresh',
        tokenExpiresAt: null,
      }),
    ).resolves.toEqual({ id: 'connection-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.sallaConnectionIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'intent-1',
          status: 'PROCESSING',
        }),
        data: expect.objectContaining({
          status: 'COMPLETED',
          connectionId: 'connection-1',
        }),
      }),
    );
  });

  it('checks active owner membership while consuming state', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'intent-1',
          merchantId: 'workspace-1',
          initiatedByUserId: 'user-1',
        }),
      },
      merchantMembership: {
        findUnique: vi.fn().mockResolvedValue({
          merchantId: 'workspace-1',
          role: 'OWNER',
          merchant: { status: 'ACTIVE' },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await repository.consumeState('state-hash');

    expect(tx.merchantMembership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('rejects a callback retry after state consumption', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'intent-1',
          merchantId: 'workspace-1',
          initiatedByUserId: 'user-1',
          status: 'PROCESSING',
        }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'intent-1',
          status: 'PROCESSING',
        }),
      },
      merchantMembership: {
        findUnique: vi.fn().mockResolvedValue({
          merchantId: 'workspace-1',
          role: 'OWNER',
          merchant: { status: 'ACTIVE' },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await repository.consumeState('state-hash');
    await expect(repository.consumeState('state-hash')).rejects.toMatchObject({
      key: 'errors.connections.salla_state_invalid',
    });
  });

  it('rejects state consumption for a suspended workspace owner', async () => {
    const tx = {
      sallaConnectionIntent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'intent-1',
          merchantId: 'workspace-1',
          initiatedByUserId: 'user-1',
        }),
      },
      merchantMembership: {
        findUnique: vi.fn().mockResolvedValue({
          merchantId: 'workspace-1',
          role: 'OWNER',
          merchant: { status: 'SUSPENDED' },
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await expect(repository.consumeState('state-hash')).rejects.toMatchObject({
      key: 'errors.connections.workspace_owner_required',
    });
    expect(tx.sallaConnectionIntent.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          activeIntentKey: null,
        }),
      }),
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        actorUserId: 'user-1',
        action: 'CONNECTION_AUTHORIZATION_FAILED',
        entityType: 'SALLA_CONNECTION_INTENT',
        entityId: 'intent-1',
        metadata: { reason: 'workspace_owner_required' },
      }),
      tx,
    );
  });

  it('scopes intent status to any member of the intent workspace', async () => {
    const tx = {
      sallaConnectionIntent: {
        findFirst: vi.fn().mockResolvedValue({ id: 'intent-1' }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await repository.findIntentForUser('member-1', 'intent-1');

    expect(tx.sallaConnectionIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'intent-1',
          merchant: {
            status: 'ACTIVE',
            memberships: { some: { userId: 'member-1' } },
          },
        },
      }),
    );
  });

  it('requires an active workspace for intent status reads', async () => {
    const tx = { sallaConnectionIntent: { findFirst: vi.fn() } };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await repository.findIntentForUser('member-1', 'intent-1');

    expect(tx.sallaConnectionIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          merchant: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      }),
    );
  });

  it('atomically expires an active intent before returning its status', async () => {
    const expiredAt = new Date(Date.now() - 1_000);
    const tx = {
      sallaConnectionIntent: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'intent-1',
          status: 'PROCESSING',
          expiresAt: expiredAt,
          completedAt: null,
          failedAt: null,
          failureCode: null,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await expect(
      repository.findIntentForUser('member-1', 'intent-1'),
    ).resolves.toMatchObject({
      id: 'intent-1',
      status: 'EXPIRED',
    });
    expect(tx.sallaConnectionIntent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'intent-1',
        status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
        expiresAt: { lte: expect.any(Date) },
      },
      data: { status: 'EXPIRED', activeIntentKey: null },
    });
  });

  it('cancels an active owner intent and audits the transition in one transaction', async () => {
    const tx = {
      sallaConnectionIntent: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: 'intent-1',
            merchantId: 'workspace-1',
            status: 'PENDING',
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      merchantMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            merchantId: 'workspace-1',
            role: 'OWNER',
            merchant: { status: 'ACTIVE' },
          }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn().mockResolvedValue(undefined) };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await repository.cancelIntentForUser('user-1', 'intent-1');

    expect(tx.sallaConnectionIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'intent-1',
          initiatedByUserId: 'user-1',
          merchant: {
            status: 'ACTIVE',
            memberships: { some: { userId: 'user-1', role: 'OWNER' } },
          },
        }),
      }),
    );
    expect(tx.sallaConnectionIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'intent-1',
          status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
        },
        data: expect.objectContaining({
          status: 'CANCELLED',
          activeIntentKey: null,
          cancelledAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: 'workspace-1',
        actorUserId: 'user-1',
        action: 'CONNECTION_AUTHORIZATION_CANCELLED',
        entityType: 'SALLA_CONNECTION_INTENT',
        entityId: 'intent-1',
      }),
      tx,
    );
  });

  it('returns a cancelled intent without mutating or auditing a repeat cancellation', async () => {
    const tx = {
      sallaConnectionIntent: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: 'intent-1',
            merchantId: 'workspace-1',
            status: 'CANCELLED',
          }),
        updateMany: vi.fn(),
      },
      merchantMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            merchantId: 'workspace-1',
            role: 'OWNER',
            merchant: { status: 'ACTIVE' },
          }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn() };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.cancelIntentForUser('user-1', 'intent-1'),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(tx.sallaConnectionIntent.updateMany).not.toHaveBeenCalled();
    expect(audit.create).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'EXPIRED'] as const)(
    'returns an already %s intent without mutating or auditing it',
    async (status) => {
      const tx = {
        sallaConnectionIntent: {
          findFirst: vi
            .fn()
            .mockResolvedValue({
              id: 'intent-1',
              merchantId: 'workspace-1',
              status,
            }),
          updateMany: vi.fn(),
        },
        merchantMembership: {
          findUnique: vi
            .fn()
            .mockResolvedValue({
              merchantId: 'workspace-1',
              role: 'OWNER',
              merchant: { status: 'ACTIVE' },
            }),
        },
      };
      const prisma = {
        $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
      };
      const audit = { create: vi.fn() };
      const repository = new SallaOAuthRepository(
        prisma as never,
        audit as never,
      );

      await expect(
        repository.cancelIntentForUser('user-1', 'intent-1'),
      ).resolves.toMatchObject({ status });
      expect(tx.sallaConnectionIntent.updateMany).not.toHaveBeenCalled();
      expect(audit.create).not.toHaveBeenCalled();
    },
  );

  it('rejects completed intents without changing or auditing them', async () => {
    const tx = {
      sallaConnectionIntent: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: 'intent-1',
            merchantId: 'workspace-1',
            status: 'COMPLETED',
          }),
        updateMany: vi.fn(),
      },
      merchantMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            merchantId: 'workspace-1',
            role: 'OWNER',
            merchant: { status: 'ACTIVE' },
          }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { create: vi.fn() };
    const repository = new SallaOAuthRepository(
      prisma as never,
      audit as never,
    );

    await expect(
      repository.cancelIntentForUser('user-1', 'intent-1'),
    ).rejects.toMatchObject({
      key: 'errors.connections.salla_intent_completed',
    });
    expect(tx.sallaConnectionIntent.updateMany).not.toHaveBeenCalled();
    expect(audit.create).not.toHaveBeenCalled();
  });

  it('does not find an intent outside the initiating owner workspace', async () => {
    const tx = {
      sallaConnectionIntent: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
      merchantMembership: { findUnique: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new SallaOAuthRepository(prisma as never);

    await expect(
      repository.cancelIntentForUser('other-user', 'intent-1'),
    ).resolves.toBeNull();
    expect(tx.sallaConnectionIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'intent-1',
          initiatedByUserId: 'other-user',
        }),
      }),
    );
    expect(tx.sallaConnectionIntent.updateMany).not.toHaveBeenCalled();
  });
});
