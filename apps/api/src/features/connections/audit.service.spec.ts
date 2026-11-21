import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  it('persists only allowlisted metadata and never token-like fields', async () => {
    const repository = { create: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as never);

    await service.record({
      action: 'CONNECTION_CREATED',
      entityType: 'STORE_CONNECTION',
      metadata: {
        status: 'CONNECTED',
        reason: 'authorized',
        accessToken: 'secret-access-token',
        refreshToken: 'secret-refresh-token',
      },
    });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { status: 'CONNECTED', reason: 'authorized' },
    }));
  });

  it('swallows persistence failures so primary operations can continue', async () => {
    const repository = { create: vi.fn().mockRejectedValue(new Error('database unavailable')) };
    const service = new AuditService(repository as never);

    await expect(service.record({
      action: 'CONNECTION_DISCONNECTED',
      entityType: 'STORE_CONNECTION',
      metadata: { status: 'DISCONNECTED' },
    })).resolves.toBeUndefined();
  });
});
