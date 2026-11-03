import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EmailOtpPurpose,
  MerchantStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface CreateMerchantWithOtpInput {
  email: string;
  name: string;
  passwordHash: string;
  codeHash: string;
  expiresAt: Date;
  now: Date;
}

interface VerifySignupOtpInput {
  email: string;
  codeHash: string;
  now: Date;
  maxAttempts: number;
  tokenHash: string;
  familyId: string;
  refreshExpiresAt: Date;
}

interface IssueOtpInput {
  merchantId: string;
  purpose: EmailOtpPurpose;
  codeHash: string;
  expiresAt: Date;
  now: Date;
  cooldownMs: number;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMerchantByEmail(email: string) {
    return this.prisma.merchant.findUnique({ where: { email } });
  }

  async createMerchantWithSignupOtp(input: CreateMerchantWithOtpInput) {
    return this.prisma.$transaction(async (transaction) => {
      const merchant = await transaction.merchant.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          role: 'MERCHANT',
          status: MerchantStatus.ACTIVE,
        },
      });

      await transaction.emailOtp.create({
        data: {
          merchantId: merchant.id,
          purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          lastSentAt: input.now,
        },
      });

      return merchant;
    });
  }

  async issueOtp(input: IssueOtpInput): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction) => {
        const merchant = await transaction.merchant.findUnique({
          where: { id: input.merchantId },
          select: { emailVerifiedAt: true, status: true },
        });
        if (
          !merchant ||
          merchant.status !== MerchantStatus.ACTIVE ||
          (input.purpose === EmailOtpPurpose.SIGNUP_VERIFICATION &&
            merchant.emailVerifiedAt) ||
          (input.purpose === EmailOtpPurpose.PASSWORD_RESET &&
            !merchant.emailVerifiedAt)
        ) {
          return false;
        }

        const existing = await transaction.emailOtp.findUnique({
          where: {
            merchantId_purpose: {
              merchantId: input.merchantId,
              purpose: input.purpose,
            },
          },
        });
        if (
          existing &&
          !existing.consumedAt &&
          existing.lastSentAt.getTime() > input.now.getTime() - input.cooldownMs
        ) {
          return false;
        }

        await transaction.emailOtp.upsert({
          where: {
            merchantId_purpose: {
              merchantId: input.merchantId,
              purpose: input.purpose,
            },
          },
          create: {
            merchantId: input.merchantId,
            purpose: input.purpose,
            codeHash: input.codeHash,
            expiresAt: input.expiresAt,
            lastSentAt: input.now,
          },
          update: {
            codeHash: input.codeHash,
            expiresAt: input.expiresAt,
            attempts: 0,
            lastSentAt: input.now,
            consumedAt: null,
          },
        });

        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async verifySignupOtp(input: VerifySignupOtpInput) {
    return this.prisma.$transaction(
      async (transaction) => {
        const merchant = await transaction.merchant.findUnique({
          where: { email: input.email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
          },
        });
        if (!merchant) {
          return { status: 'INVALID' as const };
        }

        const otp = await transaction.emailOtp.findUnique({
          where: {
            merchantId_purpose: {
              merchantId: merchant.id,
              purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
            },
          },
        });

        if (!otp || merchant.status !== MerchantStatus.ACTIVE) {
          return { status: 'INVALID' as const };
        }
        if (merchant.emailVerifiedAt || otp.consumedAt) {
          return { status: 'INVALID' as const };
        }
        if (otp.expiresAt <= input.now) {
          await transaction.emailOtp.updateMany({
            where: { id: otp.id, consumedAt: null },
            data: { consumedAt: input.now },
          });
          return { status: 'INVALID' as const };
        }
        if (otp.attempts >= input.maxAttempts) {
          await transaction.emailOtp.updateMany({
            where: { id: otp.id, consumedAt: null },
            data: { consumedAt: input.now },
          });
          return { status: 'ATTEMPTS_EXCEEDED' as const };
        }

        const expected = Buffer.from(otp.codeHash, 'hex');
        const actual = Buffer.from(input.codeHash, 'hex');
        const matches =
          expected.length === actual.length &&
          timingSafeEqual(expected, actual);

        if (!matches) {
          const attempts = otp.attempts + 1;
          await transaction.emailOtp.updateMany({
            where: {
              id: otp.id,
              attempts: otp.attempts,
              consumedAt: null,
            },
            data: {
              attempts,
              ...(attempts >= input.maxAttempts
                ? { consumedAt: input.now }
                : {}),
            },
          });
          return {
            status:
              attempts >= input.maxAttempts
                ? ('ATTEMPTS_EXCEEDED' as const)
                : ('INVALID' as const),
          };
        }

        const consumed = await transaction.emailOtp.updateMany({
          where: {
            id: otp.id,
            codeHash: input.codeHash,
            consumedAt: null,
            expiresAt: { gt: input.now },
            attempts: { lt: input.maxAttempts },
          },
          data: { consumedAt: input.now },
        });
        if (consumed.count !== 1) {
          return { status: 'INVALID' as const };
        }

        const verified = await transaction.merchant.updateMany({
          where: {
            id: merchant.id,
            emailVerifiedAt: null,
            status: MerchantStatus.ACTIVE,
          },
          data: { emailVerifiedAt: input.now },
        });
        if (verified.count !== 1) {
          return { status: 'INVALID' as const };
        }

        await transaction.refreshToken.create({
          data: {
            merchantId: merchant.id,
            tokenHash: input.tokenHash,
            familyId: input.familyId,
            expiresAt: input.refreshExpiresAt,
          },
        });

        return {
          status: 'VERIFIED' as const,
          user: {
            id: merchant.id,
            email: merchant.email,
            name: merchant.name,
            role: merchant.role,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createRefreshToken(input: {
    merchantId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.refreshToken.create({ data: input });
  }

  async rotateRefreshToken(input: {
    oldTokenHash: string;
    newTokenHash: string;
    newTokenExpiresAt: Date;
    now: Date;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.refreshToken.findUnique({
          where: { tokenHash: input.oldTokenHash },
          include: {
            merchant: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                emailVerifiedAt: true,
              },
            },
          },
        });
        if (!existing) return { status: 'INVALID' as const };

        if (existing.revokedAt) {
          await transaction.refreshToken.updateMany({
            where: { familyId: existing.familyId, revokedAt: null },
            data: { revokedAt: input.now },
          });
          return { status: 'REUSED' as const };
        }
        if (
          existing.expiresAt <= input.now ||
          existing.merchant.status !== MerchantStatus.ACTIVE ||
          !existing.merchant.emailVerifiedAt
        ) {
          return { status: 'INVALID' as const };
        }

        const revoked = await transaction.refreshToken.updateMany({
          where: {
            id: existing.id,
            revokedAt: null,
            expiresAt: { gt: input.now },
          },
          data: { revokedAt: input.now },
        });
        if (revoked.count !== 1) return { status: 'INVALID' as const };

        await transaction.refreshToken.create({
          data: {
            merchantId: existing.merchant.id,
            tokenHash: input.newTokenHash,
            familyId: existing.familyId,
            expiresAt: input.newTokenExpiresAt,
          },
        });
        return {
          status: 'ROTATED' as const,
          user: {
            id: existing.merchant.id,
            email: existing.merchant.email,
            name: existing.merchant.name,
            role: existing.merchant.role,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeRefreshToken(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async resetPasswordWithOtp(input: {
    email: string;
    codeHash: string;
    passwordHash: string;
    now: Date;
    maxAttempts: number;
  }): Promise<'RESET' | 'INVALID' | 'ATTEMPTS_EXCEEDED'> {
    return this.prisma.$transaction(
      async (transaction) => {
        const merchant = await transaction.merchant.findUnique({
          where: { email: input.email },
          select: { id: true, emailVerifiedAt: true, status: true },
        });
        if (
          !merchant ||
          !merchant.emailVerifiedAt ||
          merchant.status !== MerchantStatus.ACTIVE
        )
          return 'INVALID';

        const otp = await transaction.emailOtp.findUnique({
          where: {
            merchantId_purpose: {
              merchantId: merchant.id,
              purpose: EmailOtpPurpose.PASSWORD_RESET,
            },
          },
        });
        if (!otp || otp.consumedAt || otp.expiresAt <= input.now)
          return 'INVALID';
        if (otp.attempts >= input.maxAttempts) return 'ATTEMPTS_EXCEEDED';

        const expected = Buffer.from(otp.codeHash, 'hex');
        const actual = Buffer.from(input.codeHash, 'hex');
        const matches =
          expected.length === actual.length &&
          timingSafeEqual(expected, actual);
        if (!matches) {
          const attempts = otp.attempts + 1;
          await transaction.emailOtp.updateMany({
            where: { id: otp.id, attempts: otp.attempts, consumedAt: null },
            data: {
              attempts,
              ...(attempts >= input.maxAttempts
                ? { consumedAt: input.now }
                : {}),
            },
          });
          return attempts >= input.maxAttempts
            ? 'ATTEMPTS_EXCEEDED'
            : 'INVALID';
        }

        const consumed = await transaction.emailOtp.updateMany({
          where: {
            id: otp.id,
            codeHash: input.codeHash,
            consumedAt: null,
            expiresAt: { gt: input.now },
            attempts: { lt: input.maxAttempts },
          },
          data: { consumedAt: input.now },
        });
        if (consumed.count !== 1) return 'INVALID';

        await transaction.merchant.update({
          where: { id: merchant.id },
          data: { passwordHash: input.passwordHash },
        });
        await transaction.refreshToken.updateMany({
          where: { merchantId: merchant.id, revokedAt: null },
          data: { revokedAt: input.now },
        });
        return 'RESET';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async invalidateOtp(
    merchantId: string,
    purpose: EmailOtpPurpose,
    now: Date,
  ): Promise<void> {
    await this.prisma.emailOtp.updateMany({
      where: {
        merchantId,
        purpose,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
  }
}
