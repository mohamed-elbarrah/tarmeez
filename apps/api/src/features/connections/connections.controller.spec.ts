import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import { ConnectionsController } from './connections.controller.js';

describe('ConnectionsController Salla callback redirects', () => {
  it('redirects invalid callback state to the safe frontend result route', async () => {
    const connections = {
      handleSallaCallback: vi
        .fn()
        .mockRejectedValue(
          new AppException(
            'errors.connections.salla_state_invalid',
            HttpStatus.BAD_REQUEST,
          ),
        ),
    };
    const response = { redirect: vi.fn() };
    const controller = new ConnectionsController(
      connections as never,
      {} as never,
      { get: vi.fn().mockReturnValue('https://app.example.test') } as never,
    );

    await controller.sallaCallback({ state: 'bad-state' }, response as never);

    expect(response.redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'https://app.example.test/connections/salla/result?status=FAILED&reason=state_invalid',
    );
  });

  it('redirects callback failures with intent id and no provider details', async () => {
    const connections = {
      handleSallaCallback: vi.fn().mockResolvedValue({
        intentId: 'intent-1',
        status: 'FAILED',
        reason: 'provider_denied',
      }),
    };
    const response = { redirect: vi.fn() };
    const controller = new ConnectionsController(
      connections as never,
      {} as never,
      { get: vi.fn().mockReturnValue('https://app.example.test') } as never,
    );

    await controller.sallaCallback(
      { state: 'state', error: 'access_denied' },
      response as never,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'https://app.example.test/connections/salla/result?intentId=intent-1&status=FAILED&reason=provider_denied',
    );
  });

  it('preserves a safe intent id when the owner was removed during callback validation', async () => {
    const error = new AppException(
      'errors.connections.workspace_owner_required',
      HttpStatus.FORBIDDEN,
    );
    Object.assign(error, { intentId: 'intent-1' });
    const connections = {
      handleSallaCallback: vi.fn().mockRejectedValue(error),
    };
    const response = { redirect: vi.fn() };
    const controller = new ConnectionsController(
      connections as never,
      {} as never,
      { get: vi.fn().mockReturnValue('https://app.example.test') } as never,
    );

    await controller.sallaCallback({ state: 'state' }, response as never);

    expect(response.redirect).toHaveBeenCalledWith(
      HttpStatus.FOUND,
      'https://app.example.test/connections/salla/result?intentId=intent-1&status=FAILED&reason=workspace_owner_required',
    );
  });
});

describe('ConnectionsController Salla intent cancellation', () => {
  it('delegates authenticated cancellation and returns the safe status response', async () => {
    const connections = {
      cancelSallaIntent: vi
        .fn()
        .mockResolvedValue({ id: 'intent-1', status: 'CANCELLED' }),
    };
    const controller = new ConnectionsController(
      connections as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.cancelIntent({ id: 'user-1', role: 'MERCHANT' }, 'intent-1'),
    ).resolves.toEqual({ id: 'intent-1', status: 'CANCELLED' });
    expect(connections.cancelSallaIntent).toHaveBeenCalledWith(
      'user-1',
      'intent-1',
    );
  });
});
