import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { configureApp } from '../src/common/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisHealthService } from '../src/features/health/redis-health.service.js';

process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgresql://tarmeez:secret@localhost:5432/tarmeez';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-more-than-thirty-two-characters';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-more-than-thirty-two-characters';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const { AppModule } = await import('../src/app.module.js');

describe('Health endpoint (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = { $queryRaw: vi.fn() };
  const redis = { ping: vi.fn() };

  beforeEach(async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue(undefined);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisHealthService)
      .useValue(redis)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports both dependencies and uses the success envelope', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        success: true,
        data: { db: 'ok', redis: 'ok' },
      });
  });

  it('returns a service-unavailable error when a dependency is down', async () => {
    redis.ping.mockRejectedValueOnce(new Error('connection refused'));

    await request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect({
        success: false,
        error: {
          key: 'errors.health.dependencies_unavailable',
          statusCode: 503,
          details: { redis: ['unavailable'] },
        },
      });
  });
});
