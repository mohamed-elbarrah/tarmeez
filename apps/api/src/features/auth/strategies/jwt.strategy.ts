import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../../generated/prisma/client.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { AuthUser } from '../../../common/types/auth-user.types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
      issuer: config.getOrThrow<string>('jwt.issuer'),
      audience: config.getOrThrow<string>('jwt.audience'),
      algorithms: ['HS256'],
    });
  }

  validate(payload: unknown): AuthUser {
    if (typeof payload !== 'object' || payload === null) {
      throw this.invalidToken();
    }

    const claims = payload as Record<string, unknown>;
    const roles = Object.values(UserRole) as string[];
    if (
      typeof claims.sub !== 'string' ||
      claims.sub.length === 0 ||
      typeof claims.role !== 'string' ||
      !roles.includes(claims.role)
    ) {
      throw this.invalidToken();
    }

    return {
      id: claims.sub,
      role: claims.role as UserRole,
    };
  }

  private invalidToken(): AppException {
    return new AppException(
      'errors.auth.unauthorized',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
