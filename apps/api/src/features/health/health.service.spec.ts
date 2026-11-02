import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { HealthService } from './health.service.js';
import { RedisHealthService } from './redis-health.service.js';

describe('HealthService', () => {
  const prismaMock = { $queryRaw: vi.fn() };
  const redisMock = { ping: vi.fn() };
  const prisma = prismaMock as unknown as PrismaService;
  const redis = redisMock as unknown as RedisHealthService;
  let service: HealthService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    redisMock.ping = vi.fn().mockResolvedValue(undefined);
    service = new HealthService(prisma, redis);
  });

  it('reports both dependencies healthy', async () => {
    await expect(service.check()).resolves.toEqual({ db: 'ok', redis: 'ok' });
  });

  it('reports unavailable dependencies without exposing driver errors', async () => {
    redisMock.ping = vi.fn().mockRejectedValue(new Error('connection refused'));

    await expect(service.check()).rejects.toMatchObject({
      key: 'errors.health.dependencies_unavailable',
      details: { redis: ['unavailable'] },
    } satisfies Partial<AppException>);
  });
});
