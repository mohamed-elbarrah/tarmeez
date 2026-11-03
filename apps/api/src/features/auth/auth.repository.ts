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
