import { CommerceSyncProcessor } from './commerce-sync.processor.js';

describe('CommerceSyncProcessor', () => {
  it('passes BullMQ attempt metadata to the sync service', async () => {
    const sync = { processRun: vi.fn().mockResolvedValue(undefined) };
    const processor = new CommerceSyncProcessor(sync as never);

    await processor.process({
      name: 'sync-connection',
      data: { syncRunId: 'run-1' },
      attemptsMade: 1,
      opts: { attempts: 4 },
    } as never);

    expect(sync.processRun).toHaveBeenCalledWith('run-1', { attemptsMade: 1, maxAttempts: 4 });
  });
});
