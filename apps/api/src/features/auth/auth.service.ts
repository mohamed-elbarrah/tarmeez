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
import { compare, hash } from 'bcryptjs';
import type {
  AuthMessageResponse,
  AuthSessionResponse,
  AuthSessionUser,
  SignupAcceptedResponse,
} from '@tarmeez/types';
import {
  EmailOtpPurpose,
  MerchantStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuthMailerService } from './auth-mailer.service.js';
import { AuthRepository } from './auth.repository.js';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';

interface AuthSessionResult extends AuthSessionResponse {
  refreshToken: string;
  refreshTokenMaxAge: number;
  refreshCookieName: string;
  refreshCookieSecure: boolean;
  refreshCookieSameSite: string;
}

const PASSWORD_HASH_ROUNDS = 12;
const REFRESH_COOKIE_NAME = 'tarmeez_refresh';
const DUMMY_PASSWORD_HASH =
  '$2b$12$1rA09K.Cn2juiKM7mfRjweQeth0Ad1hGtNey7ksX1kGHfQ5zWyNwe';
const SIGNUP_ACCEPTED_RESPONSE = {
  emailVerificationRequired: true,
  messageKey: 'success.auth.verification_code_sent',
} as const;
const PASSWORD_RESET_ACCEPTED_RESPONSE = {
  messageKey: 'success.auth.password_reset_code_sent',
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly authMailer: AuthMailerService,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterDto): Promise<SignupAcceptedResponse> {
    const email = input.email.trim().toLowerCase();
    const code = this.generateOtp();
    const codeHash = this.hashOtp(
      email,
      code,
      EmailOtpPurpose.SIGNUP_VERIFICATION,
    );
    const now = new Date();
    const expiresAt = this.otpExpiry(now);
    let shouldSend = false;
    let userId: string | undefined;

    const existing = await this.authRepository.findUserByEmail(email);
    if (existing) {
      if (
        input.invitationToken &&
        (existing.membership || existing.emailVerifiedAt)
      ) {
        throw new AppException(
          'errors.merchant.existing_account_invitation_required',
          HttpStatus.CONFLICT,
        );
      }
      userId = existing.id;
      shouldSend = await this.authRepository.issueOtp({
        userId,
        ...(input.invitationToken
          ? {
              invitationTokenHash: createHash('sha256')
                .update(input.invitationToken)
                .digest('hex'),
            }
          : {}),
        purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
        codeHash,
        expiresAt,
        now,
        cooldownMs: this.otpCooldownMs(),
      });
    } else {
      const passwordHash = await hash(input.password, PASSWORD_HASH_ROUNDS);
      try {
        const result = await this.authRepository.createUserWithSignupOtp({
          email,
          name: input.name.trim(),
          passwordHash,
          ...(input.invitationToken
            ? {
                invitationTokenHash: createHash('sha256')
                  .update(input.invitationToken)
                  .digest('hex'),
              }
            : {}),
          codeHash,
          expiresAt,
          now,
        });
        if (result.status === 'INVITATION_INVALID') {
          throw new AppException(
            'errors.merchant.invitation_invalid_or_expired',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (result.status === 'INVITATION_REQUIRED') {
          throw new AppException(
            'errors.merchant.invitation_token_required',
            HttpStatus.BAD_REQUEST,
          );
        }
        userId = result.user.id;
        shouldSend = true;
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          return SIGNUP_ACCEPTED_RESPONSE;
        }
        throw error;
      }
    }

    if (shouldSend && userId) {
      try {
        await this.authMailer.sendSignupVerificationCode(email, code);
      } catch {
        await this.authRepository.invalidateOtp(
          userId,
          EmailOtpPurpose.SIGNUP_VERIFICATION,
          new Date(),
        );
        this.logger.error('Signup verification email delivery failed');
        throw new AppException(
          'errors.auth.email_delivery_failed',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    return SIGNUP_ACCEPTED_RESPONSE;
  }

  async acceptInvitation(input: AcceptInvitationDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.authRepository.findUserByEmail(email);
    const passwordMatches = await compare(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (
      !user ||
      !passwordMatches ||
      user.role !== UserRole.MERCHANT ||
      user.status !== UserStatus.ACTIVE ||
      !user.emailVerifiedAt
    ) {
      throw new AppException(
        'errors.auth.invalid_credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const now = new Date();
    const refresh = this.newRefreshToken(now);
    const result = await this.authRepository.acceptInvitationForUser({
      userId: user.id,
      tokenHash: createHash('sha256')
        .update(input.invitationToken)
        .digest('hex'),
      now,
      familyId: refresh.familyId,
      tokenHashForRefresh: refresh.tokenHash,
      refreshExpiresAt: refresh.expiresAt,
    });
    if (result.status === 'ALREADY_ASSIGNED') {
      throw new AppException(
        'errors.merchant.existing_account_invitation_required',
        HttpStatus.CONFLICT,
      );
    }
    if (result.status !== 'ACCEPTED') {
      throw new AppException(
        'errors.merchant.invitation_invalid_or_expired',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.createSessionResponse(result.user, refresh);
  }

  async verifyEmail(input: VerifyEmailDto) {
    const email = input.email.trim().toLowerCase();
    const now = new Date();
    const refresh = this.newRefreshToken(now);
    const verification = await this.authRepository.verifySignupOtp({
      email,
      codeHash: this.hashOtp(
        email,
        input.code,
        EmailOtpPurpose.SIGNUP_VERIFICATION,
      ),
      now,
      maxAttempts: this.otpMaxAttempts(),
      tokenHash: refresh.tokenHash,
      familyId: refresh.familyId,
      refreshExpiresAt: refresh.expiresAt,
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

    return this.createSessionResponse(verification.user, refresh);
  }

  async login(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.authRepository.findUserByEmail(email);
    const passwordMatches = await compare(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches || !this.canAuthenticate(user)) {
      throw new AppException(
        'errors.auth.invalid_credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const now = new Date();
    const refresh = this.newRefreshToken(now);
    await this.authRepository.createRefreshToken({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      familyId: refresh.familyId,
      expiresAt: refresh.expiresAt,
    });
    return this.createSessionResponse(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      refresh,
    );
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new AppException(
        'errors.auth.invalid_refresh_token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const now = new Date();
    const refresh = this.newRefreshToken(now);
    const rotation = await this.authRepository.rotateRefreshToken({
      oldTokenHash: createHash('sha256').update(refreshToken).digest('hex'),
      newTokenHash: refresh.tokenHash,
      newTokenExpiresAt: refresh.expiresAt,
      now,
    });
    if (rotation.status === 'REUSED') {
      throw new AppException(
        'errors.auth.refresh_token_reused',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (rotation.status !== 'ROTATED') {
      throw new AppException(
        'errors.auth.invalid_refresh_token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.createSessionResponse(rotation.user, refresh);
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.authRepository.revokeRefreshToken(
        createHash('sha256').update(refreshToken).digest('hex'),
        new Date(),
      );
    }
  }

  async forgotPassword(input: ForgotPasswordDto): Promise<AuthMessageResponse> {
    const email = input.email.trim().toLowerCase();
    const user = await this.authRepository.findUserByEmail(email);
    if (!user || !this.canResetPassword(user) || !user.emailVerifiedAt) {
      return PASSWORD_RESET_ACCEPTED_RESPONSE;
    }

    const code = this.generateOtp();
    const now = new Date();
    const issued = await this.authRepository.issueOtp({
      userId: user.id,
      purpose: EmailOtpPurpose.PASSWORD_RESET,
      codeHash: this.hashOtp(email, code, EmailOtpPurpose.PASSWORD_RESET),
      expiresAt: this.otpExpiry(now),
      now,
      cooldownMs: this.otpCooldownMs(),
    });
    if (!issued) return PASSWORD_RESET_ACCEPTED_RESPONSE;

    try {
      await this.authMailer.sendPasswordResetCode(email, code);
    } catch {
      await this.authRepository.invalidateOtp(
        user.id,
        EmailOtpPurpose.PASSWORD_RESET,
        new Date(),
      );
      this.logger.error('Password reset email delivery failed');
    }
    return PASSWORD_RESET_ACCEPTED_RESPONSE;
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.newPassword, PASSWORD_HASH_ROUNDS);
    const result = await this.authRepository.resetPasswordWithOtp({
      email,
      codeHash: this.hashOtp(email, input.code, EmailOtpPurpose.PASSWORD_RESET),
      passwordHash,
      now: new Date(),
      maxAttempts: this.otpMaxAttempts(),
    });
    if (result === 'ATTEMPTS_EXCEEDED') {
      throw new AppException(
        'errors.auth.otp_attempts_exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result !== 'RESET') {
      throw new AppException(
        'errors.auth.invalid_or_expired_otp',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async createSessionResponse(
    user: AuthSessionUser,
    refresh: ReturnType<AuthService['newRefreshToken']>,
  ): Promise<AuthSessionResult> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });
    return {
      accessToken,
      user,
      refreshToken: refresh.rawToken,
      refreshTokenMaxAge: refresh.maxAge,
      refreshCookieName: REFRESH_COOKIE_NAME,
      refreshCookieSecure:
        this.config.getOrThrow<string>('app.environment') === 'production' ||
        this.config.getOrThrow<string>('auth.cookieSameSite') === 'none',
      refreshCookieSameSite: this.config.getOrThrow<string>(
        'auth.cookieSameSite',
      ),
    };
  }

  private newRefreshToken(now: Date) {
    const rawToken = randomBytes(32).toString('base64url');
    const maxAge = this.parseDurationMs(
      this.config.getOrThrow<string>('jwt.refreshExpiresIn'),
    );
    return {
      rawToken,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      familyId: randomUUID(),
      maxAge,
      expiresAt: new Date(now.getTime() + maxAge),
    };
  }

  private generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashOtp(
    email: string,
    code: string,
    purpose: EmailOtpPurpose,
  ): string {
    const pepper = this.config.getOrThrow<string>('auth.otpPepper');
    return createHmac('sha256', pepper)
      .update(`${purpose}:${email}:${code}`)
      .digest('hex');
  }

  private otpExpiry(now: Date): Date {
    return new Date(
      now.getTime() +
        this.config.getOrThrow<number>('auth.otpExpiresInMinutes') * 60_000,
    );
  }

  private otpCooldownMs(): number {
    return (
      this.config.getOrThrow<number>('auth.otpResendCooldownSeconds') * 1000
    );
  }

  private otpMaxAttempts(): number {
    return this.config.getOrThrow<number>('auth.otpMaxAttempts');
  }

  private canResetPassword(user: {
    status: UserStatus;
    emailVerifiedAt: Date | null;
    role: UserRole;
    membership: { merchant: { status: MerchantStatus } } | null;
  }): boolean {
    return (
      user.status === UserStatus.ACTIVE &&
      Boolean(user.emailVerifiedAt) &&
      (user.role === UserRole.ADMIN ||
        !user.membership ||
        user.membership.merchant.status === MerchantStatus.ACTIVE)
    );
  }

  private canAuthenticate(user: {
    status: UserStatus;
    emailVerifiedAt: Date | null;
    role: UserRole;
    membership: { merchant: { status: MerchantStatus } } | null;
  }): boolean {
    return (
      user.status === UserStatus.ACTIVE &&
      Boolean(user.emailVerifiedAt) &&
      (user.role === UserRole.ADMIN ||
        user.membership?.merchant.status === MerchantStatus.ACTIVE)
    );
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
