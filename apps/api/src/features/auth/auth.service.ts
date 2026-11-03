import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuthMailerService } from './auth-mailer.service.js';
import { AuthRepository } from './auth.repository.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';

const PASSWORD_HASH_ROUNDS = 12;
const REFRESH_COOKIE_NAME = 'tarmeez_refresh';
const SIGNUP_ACCEPTED_RESPONSE = {
  emailVerificationRequired: true,
  messageKey: 'success.auth.verification_code_sent',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly authMailer: AuthMailerService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const code = this.generateOtp();
    const codeHash = this.hashOtp(email, code);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.config.getOrThrow<number>('auth.otpExpiresInMinutes') * 60_000,
    );
    let shouldSend = false;
    let merchantId: string | undefined;

    const existing = await this.authRepository.findMerchantByEmail(email);
    if (existing) {
      merchantId = existing.id;
      shouldSend = await this.authRepository.issueSignupOtp({
        merchantId,
        codeHash,
        expiresAt,
        now,
        cooldownMs:
          this.config.getOrThrow<number>('auth.otpResendCooldownSeconds') *
          1000,
      });
    } else {
      const passwordHash = await hash(input.password, PASSWORD_HASH_ROUNDS);
      try {
        const merchant = await this.authRepository.createMerchantWithSignupOtp({
          email,
          name: input.name.trim(),
          passwordHash,
          codeHash,
          expiresAt,
          now,
        });
        merchantId = merchant.id;
        shouldSend = true;
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          return SIGNUP_ACCEPTED_RESPONSE;
        }
        throw error;
      }
    }

    if (shouldSend && merchantId) {
      try {
        await this.authMailer.sendSignupVerificationCode(email, code);
      } catch {
        await this.authRepository.invalidateSignupOtp(merchantId, new Date());
        this.logger.error('Signup verification email delivery failed');
        throw new AppException(
          'errors.auth.email_delivery_failed',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    return SIGNUP_ACCEPTED_RESPONSE;
  }

  async verifyEmail(input: VerifyEmailDto) {
    const email = input.email.trim().toLowerCase();
    const now = new Date();
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTokenExpiresIn = this.config.getOrThrow<string>(
      'jwt.refreshExpiresIn',
    );
    const refreshTokenMaxAge = this.parseDurationMs(refreshTokenExpiresIn);
    const verification = await this.authRepository.verifySignupOtp({
      email,
      codeHash: this.hashOtp(email, input.code),
      now,
      maxAttempts: this.config.getOrThrow<number>('auth.otpMaxAttempts'),
      tokenHash: createHash('sha256').update(refreshToken).digest('hex'),
      familyId: randomUUID(),
      refreshExpiresAt: new Date(now.getTime() + refreshTokenMaxAge),
    });

    if (verification.status === 'ATTEMPTS_EXCEEDED') {
      throw new AppException(
        'errors.auth.otp_attempts_exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (verification.status !== 'VERIFIED') {
      throw new AppException(
        'errors.auth.invalid_or_expired_otp',
        HttpStatus.BAD_REQUEST,
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: verification.user.id,
      role: verification.user.role,
    });

    return {
      accessToken,
      user: verification.user,
      refreshToken,
      refreshTokenMaxAge,
      refreshCookieName: REFRESH_COOKIE_NAME,
      refreshCookieSecure:
        this.config.getOrThrow<string>('app.environment') === 'production',
    };
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashOtp(email: string, code: string): string {
    const pepper = this.config.getOrThrow<string>('auth.otpPepper');
    return createHmac('sha256', pepper)
      .update(`SIGNUP_VERIFICATION:${email}:${code}`)
      .digest('hex');
  }

  private parseDurationMs(duration: string): number {
    const match = /^([1-9]\d*)(ms|s|m|h|d)$/.exec(duration);
    if (!match) {
      throw new AppException(
        'errors.auth.configuration_invalid',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const amount = Number(match[1]);
    const units: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return amount * units[match[2]];
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
