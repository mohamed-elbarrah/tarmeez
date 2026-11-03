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

  async issueSignupOtp(input: IssueOtpInput): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction) => {
        const merchant = await transaction.merchant.findUnique({
          where: { id: input.merchantId },
          select: { emailVerifiedAt: true, status: true },
        });
        if (
          !merchant ||
          merchant.emailVerifiedAt ||
          merchant.status !== MerchantStatus.ACTIVE
        ) {
          return false;
        }

        const existing = await transaction.emailOtp.findUnique({
          where: {
            merchantId_purpose: {
              merchantId: input.merchantId,
              purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
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
              purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
            },
          },
          create: {
            merchantId: input.merchantId,
            purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
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

  async invalidateSignupOtp(merchantId: string, now: Date): Promise<void> {
    await this.prisma.emailOtp.updateMany({
      where: {
        merchantId,
        purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });
  }
}
