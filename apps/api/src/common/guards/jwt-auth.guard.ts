import { ExecutionContext, Injectable, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../exceptions/app.exception.js';
import type { AuthUser } from '../types/auth-user.types.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthUser>(
    error: unknown,
    user: TUser | false | null,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (error || !user) {
      throw new AppException(
        'errors.auth.unauthorized',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user as TUser;
  }
}
