import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

interface HandlerResult<T> {
  data?: T;
  meta?: unknown;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((result: T) => {
        const value = result as HandlerResult<T> | null;
        const data =
          value && typeof value === 'object' && 'data' in value
            ? value.data
            : result;
        const meta =
          value && typeof value === 'object' && 'meta' in value
            ? value.meta
            : undefined;

        return {
          success: true,
          data,
          ...(meta === undefined ? {} : { meta }),
        };
      }),
    );
  }
}
