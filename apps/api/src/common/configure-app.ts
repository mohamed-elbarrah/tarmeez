import type { INestApplication } from '@nestjs/common';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { ResponseInterceptor } from './interceptors/response.interceptor.js';
import { ValidationPipe } from './pipes/validation.pipe.js';

export function configureApp(app: INestApplication): void {
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(new ValidationPipe());
  app.enableShutdownHooks();
}
