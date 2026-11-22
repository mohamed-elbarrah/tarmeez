import { timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  EmailOtpPurpose,
  MembershipRole,
  MerchantStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

interface CreateUserWithSignupOtpInput {
  email: string;
  name: string;
  passwordHash: string;
  invitationTokenHash?: string;
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
  userId: string;
  invitationTokenHash?: string;
  purpose: EmailOtpPurpose;
  codeHash: string;
  expiresAt: Date;
  now: Date;
  cooldownMs: number;
}

class AuthTransactionAbort extends Error {}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { membership: { include: { merchant: true } } },
    });
  }

  async createUserWithSignupOtp(input: CreateUserWithSignupOtpInput) {
    return this.prisma.$transaction(async (transaction) => {
      let invitation = null;
      if (input.invitationTokenHash) {
        invitation = await transaction.invitation.findUnique({
          where: { tokenHash: input.invitationTokenHash },
          include: { merchant: true },
        });
        if (
          !invitation ||
          invitation.email !== input.email ||
          invitation.role !== MembershipRole.VIEWER ||
          invitation.acceptedAt ||
          invitation.revokedAt ||
          invitation.expiresAt <= input.now ||
          invitation.merchant.status !== MerchantStatus.ACTIVE
        ) {
          return { status: 'INVITATION_INVALID' as const };
        }
      } else {
        const pendingInvitation = await transaction.invitation.findUnique({
          where: { email: input.email },
        });
        if (
          pendingInvitation &&
          !pendingInvitation.acceptedAt &&
          !pendingInvitation.revokedAt &&
          pendingInvitation.expiresAt > input.now
        ) {
          return { status: 'INVITATION_REQUIRED' as const };
        }
      }

      const user = await transaction.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          role: UserRole.MERCHANT,
          status: UserStatus.ACTIVE,
        },
      });
      if (!invitation) {
        await transaction.merchant.create({
          data: {
            ownerUserId: user.id,
            name: input.name,
            status: MerchantStatus.ACTIVE,
            memberships: {
              create: { userId: user.id, role: MembershipRole.OWNER },
            },
          },
        });
      }
      await transaction.emailOtp.create({
        data: {
          userId: user.id,
          invitationId: invitation?.id,
          purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          lastSentAt: input.now,
        },
      });
      return { status: 'CREATED' as const, user };
    });
  }

  async issueOtp(input: IssueOtpInput): Promise<boolean> {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: input.userId },
          include: { membership: { include: { merchant: true } } },
        });
        if (!user || user.status !== UserStatus.ACTIVE) return false;
        let invitationId: string | null = null;
        if (user.role === UserRole.MERCHANT) {
          if (user.membership) {
            if (user.membership.merchant.status !== MerchantStatus.ACTIVE) {
              return false;
            }
          } else if (
            input.purpose === EmailOtpPurpose.SIGNUP_VERIFICATION &&
            !user.emailVerifiedAt
          ) {
            const invitation = await transaction.invitation.findUnique({
              where: { email: user.email },
              include: { merchant: true },
            });
            if (
              !invitation ||
              !input.invitationTokenHash ||
              invitation.tokenHash !== input.invitationTokenHash ||
              invitation.acceptedAt ||
              invitation.revokedAt ||
              invitation.expiresAt <= input.now ||
              invitation.merchant.status !== MerchantStatus.ACTIVE
            ) {
              return false;
            }
            invitationId = invitation.id;
          } else if (
            input.purpose !== EmailOtpPurpose.PASSWORD_RESET ||
            !user.emailVerifiedAt
          ) {
            return false;
          }
        }
        if (
          input.purpose === EmailOtpPurpose.SIGNUP_VERIFICATION &&
          user.emailVerifiedAt
        ) {
          return false;
        }
        if (
          input.purpose === EmailOtpPurpose.PASSWORD_RESET &&
          !user.emailVerifiedAt
        ) {
          return false;
        }

        const existing = await transaction.emailOtp.findUnique({
          where: {
            userId_purpose: {
              userId: input.userId,
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
            userId_purpose: {
              userId: input.userId,
              purpose: input.purpose,
            },
          },
          create: {
            userId: input.userId,
            invitationId,
            purpose: input.purpose,
            codeHash: input.codeHash,
            expiresAt: input.expiresAt,
            lastSentAt: input.now,
          },
          update: {
            invitationId,
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
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.findUnique({
            where: { email: input.email },
            include: { membership: { include: { merchant: true } } },
          });
          if (
            !user ||
            user.role !== UserRole.MERCHANT ||
            user.status !== UserStatus.ACTIVE ||
            user.emailVerifiedAt
          ) {
            return { status: 'INVALID' as const };
          }

          const otp = await transaction.emailOtp.findUnique({
            where: {
              userId_purpose: {
                userId: user.id,
                purpose: EmailOtpPurpose.SIGNUP_VERIFICATION,
              },
            },
          });
          if (!otp || otp.consumedAt) {
            return { status: 'INVALID' as const };
          }

          let invitation: {
            id: string;
            email: string;
            role: string;
            merchantId: string;
            acceptedAt: Date | null;
            revokedAt: Date | null;
            expiresAt: Date;
            merchant: { status: MerchantStatus };
          } | null = null;
          if (user.membership) {
            if (
              user.membership.merchant.status !== MerchantStatus.ACTIVE ||
              otp.invitationId
            ) {
              return { status: 'INVALID' as const };
            }
          } else {
            if (!otp.invitationId) return { status: 'INVALID' as const };
            invitation = await transaction.invitation.findUnique({
              where: { id: otp.invitationId },
              include: { merchant: true },
            });
            if (
              !invitation ||
              invitation.email !== user.email ||
              invitation.role !== MembershipRole.VIEWER ||
              invitation.acceptedAt ||
              invitation.revokedAt ||
              invitation.expiresAt <= input.now ||
              invitation.merchant.status !== MerchantStatus.ACTIVE
            ) {
              return { status: 'INVALID' as const };
            }
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
              where: { id: otp.id, attempts: otp.attempts, consumedAt: null },
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

          if (invitation) {
            const accepted = await transaction.invitation.updateMany({
              where: {
                id: invitation.id,
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { gt: input.now },
              },
              data: { acceptedAt: input.now },
            });
            if (accepted.count !== 1) throw new AuthTransactionAbort();
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
          if (consumed.count !== 1) throw new AuthTransactionAbort();

          const verified = await transaction.user.updateMany({
            where: {
              id: user.id,
              emailVerifiedAt: null,
              status: UserStatus.ACTIVE,
            },
            data: { emailVerifiedAt: input.now },
          });
          if (verified.count !== 1) throw new AuthTransactionAbort();

          if (invitation) {
            await transaction.merchantMembership.create({
              data: {
                userId: user.id,
                merchantId: invitation.merchantId,
                role: MembershipRole.VIEWER,
              },
            });
          }

          await transaction.refreshToken.create({
            data: {
              userId: user.id,
              tokenHash: input.tokenHash,
              familyId: input.familyId,
              expiresAt: input.refreshExpiresAt,
            },
          });
          return {
            status: 'VERIFIED' as const,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof AuthTransactionAbort) {
        return { status: 'INVALID' as const };
      }
      throw error;
    }
  }

  async acceptInvitationForUser(input: {
    userId: string;
    tokenHash: string;
    now: Date;
    familyId: string;
    tokenHashForRefresh: string;
    refreshExpiresAt: Date;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: input.userId },
          include: { membership: true },
        });
        if (
          !user ||
          user.role !== UserRole.MERCHANT ||
          user.status !== UserStatus.ACTIVE ||
          !user.emailVerifiedAt
        ) {
          return { status: 'INVALID' as const };
        }
        if (user.membership) return { status: 'ALREADY_ASSIGNED' as const };

        const invitation = await transaction.invitation.findUnique({
          where: { tokenHash: input.tokenHash },
          include: { merchant: true },
        });
        if (
          !invitation ||
          invitation.email !== user.email ||
          invitation.role !== MembershipRole.VIEWER ||
          invitation.acceptedAt ||
          invitation.revokedAt ||
          invitation.expiresAt <= input.now ||
          invitation.merchant.status !== MerchantStatus.ACTIVE
        ) {
          return { status: 'INVALID' as const };
        }

        const accepted = await transaction.invitation.updateMany({
          where: {
            id: invitation.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: input.now },
          },
          data: { acceptedAt: input.now },
        });
        if (accepted.count !== 1) return { status: 'INVALID' as const };

        await transaction.merchantMembership.create({
          data: {
            userId: user.id,
            merchantId: invitation.merchantId,
            role: MembershipRole.VIEWER,
          },
        });
        await transaction.refreshToken.create({
          data: {
            userId: user.id,
            tokenHash: input.tokenHashForRefresh,
            familyId: input.familyId,
            expiresAt: input.refreshExpiresAt,
          },
        });
        return {
          status: 'ACCEPTED' as const,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createFirstAdmin(input: {
    email: string;
    name: string;
    passwordHash: string;
    now: Date;
  }): Promise<'CREATED' | 'ADMIN_EXISTS' | 'EMAIL_EXISTS'> {
    return this.prisma.$transaction(
      async (transaction) => {
        const adminCount = await transaction.user.count({
          where: { role: UserRole.ADMIN },
        });
        if (adminCount > 0) return 'ADMIN_EXISTS';

        const existing = await transaction.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (existing) return 'EMAIL_EXISTS';

        await transaction.user.create({
          data: {
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: input.now,
          },
        });
        return 'CREATED';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createRefreshToken(input: {
    userId: string;
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
            user: { include: { membership: { include: { merchant: true } } } },
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

        const userCanAuthenticate =
          existing.user.status === UserStatus.ACTIVE &&
          Boolean(existing.user.emailVerifiedAt) &&
          (existing.user.role === UserRole.ADMIN ||
            existing.user.membership?.merchant.status ===
              MerchantStatus.ACTIVE);
        if (!userCanAuthenticate || existing.expiresAt <= input.now) {
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
            userId: existing.user.id,
            tokenHash: input.newTokenHash,
            familyId: existing.familyId,
            expiresAt: input.newTokenExpiresAt,
          },
        });
        return {
          status: 'ROTATED' as const,
          user: {
            id: existing.user.id,
            email: existing.user.email,
            name: existing.user.name,
            role: existing.user.role,
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
        const user = await transaction.user.findUnique({
          where: { email: input.email },
          include: { membership: { include: { merchant: true } } },
        });
        if (
          !user ||
          user.status !== UserStatus.ACTIVE ||
          !user.emailVerifiedAt ||
          (user.role === UserRole.MERCHANT &&
            user.membership &&
            user.membership.merchant.status !== MerchantStatus.ACTIVE)
        ) {
          return 'INVALID';
        }

        const otp = await transaction.emailOtp.findUnique({
          where: {
            userId_purpose: {
              userId: user.id,
              purpose: EmailOtpPurpose.PASSWORD_RESET,
            },
          },
        });
        if (!otp || otp.consumedAt || otp.expiresAt <= input.now) {
          return 'INVALID';
        }
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

        await transaction.user.update({
          where: { id: user.id },
          data: { passwordHash: input.passwordHash },
        });
        await transaction.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: input.now },
        });
        return 'RESET';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async invalidateOtp(
    userId: string,
    purpose: EmailOtpPurpose,
    now: Date,
  ): Promise<void> {
    await this.prisma.emailOtp.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: now },
    });
  }
}
