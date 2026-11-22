import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './common/configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const config = app.get(ConfigService);
  const frontendOrigin = new URL(config.getOrThrow<string>('app.frontendUrl'))
    .origin;
  const trustProxyHops = config.getOrThrow<number>('app.trustProxyHops');

  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  });

  await app.listen(config.getOrThrow<number>('app.port'));
}

await bootstrap();
