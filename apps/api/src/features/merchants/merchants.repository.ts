import { Injectable } from '@nestjs/common';
import {
  MembershipRole,
  MerchantStatus,
  Prisma,
  UserRole,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class MerchantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMyMerchant(userId: string) {
    return this.prisma.merchantMembership.findUnique({
      where: { userId },
      select: {
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            emailVerifiedAt: true,
          },
        },
        merchant: {
          select: {
            id: true,
            name: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async updateMyMerchantName(userId: string, name: string) {
    const result = await this.prisma.merchant.updateMany({
      where: { ownerUserId: userId, status: MerchantStatus.ACTIVE },
      data: { name },
    });
    if (result.count !== 1) return null;
    return this.findMyMerchant(userId);
  }

  async findMyTeam(userId: string) {
    const membership = await this.prisma.merchantMembership.findUnique({
      where: { userId },
      select: { merchantId: true },
    });
    if (!membership) return null;
    return this.prisma.merchantMembership.findMany({
      where: { merchantId: membership.merchantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async findMyInvitations(userId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { ownerUserId: userId, status: MerchantStatus.ACTIVE },
      select: { id: true },
    });
    if (!merchant) return null;
    return this.prisma.invitation.findMany({
      where: {
        merchantId: merchant.id,
        acceptedAt: null,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async createInvitation(input: {
    merchantId: string;
    invitedByUserId: string;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        const merchant = await transaction.merchant.findFirst({
          where: {
            id: input.merchantId,
            ownerUserId: input.invitedByUserId,
            status: MerchantStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!merchant) return { status: 'OWNER_REQUIRED' as const };

        const user = await transaction.user.findUnique({
          where: { email: input.email },
          select: { role: true, membership: { select: { userId: true } } },
        });
        if (
          user &&
          (user.role === UserRole.ADMIN || user.membership !== null)
        ) {
          return { status: 'USER_ALREADY_ASSIGNED' as const };
        }

        const existing = await transaction.invitation.findUnique({
          where: { email: input.email },
        });
        if (
          existing &&
          !existing.acceptedAt &&
          !existing.revokedAt &&
          existing.expiresAt > input.now
        ) {
          return { status: 'INVITATION_EXISTS' as const };
        }

        const invitation = existing
          ? await transaction.invitation.update({
              where: { id: existing.id },
              data: {
                merchantId: merchant.id,
                invitedByUserId: input.invitedByUserId,
                role: MembershipRole.VIEWER,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
                acceptedAt: null,
                revokedAt: null,
              },
              select: {
                id: true,
                email: true,
                role: true,
                expiresAt: true,
                createdAt: true,
              },
            })
          : await transaction.invitation.create({
              data: {
                merchantId: merchant.id,
                invitedByUserId: input.invitedByUserId,
                email: input.email,
                role: MembershipRole.VIEWER,
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt,
              },
              select: {
                id: true,
                email: true,
                role: true,
                expiresAt: true,
                createdAt: true,
              },
            });
        return { status: 'CREATED' as const, invitation };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async resendInvitation(input: {
    merchantId: string;
    invitedByUserId: string;
    invitationId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.$transaction(
      async (transaction) => {
        const merchant = await transaction.merchant.findFirst({
          where: {
            id: input.merchantId,
            ownerUserId: input.invitedByUserId,
            status: MerchantStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!merchant) return { status: 'OWNER_REQUIRED' as const };

        const invitation = await transaction.invitation.findFirst({
          where: { id: input.invitationId, merchantId: merchant.id },
        });
        if (!invitation || invitation.acceptedAt) {
          return { status: 'NOT_RESENDABLE' as const };
        }
        const user = await transaction.user.findUnique({
          where: { email: invitation.email },
          select: { role: true, membership: { select: { userId: true } } },
        });
        if (
          user &&
          (user.role === UserRole.ADMIN || user.membership !== null)
        ) {
          return { status: 'USER_ALREADY_ASSIGNED' as const };
        }

        const updated = await transaction.invitation.update({
          where: { id: invitation.id },
          data: {
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            revokedAt: null,
          },
          select: {
            id: true,
            email: true,
            role: true,
            expiresAt: true,
            createdAt: true,
          },
        });
        return { status: 'RESENT' as const, invitation: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async revokeInvitation(userId: string, invitationId: string, now: Date) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { ownerUserId: userId, status: MerchantStatus.ACTIVE },
      select: { id: true },
    });
    if (!merchant) return false;
    const result = await this.prisma.invitation.updateMany({
      where: {
        id: invitationId,
        merchantId: merchant.id,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    return result.count === 1;
  }

  async removeTeamMember(userId: string, membershipId: string, now: Date) {
    return this.prisma.$transaction(
      async (transaction) => {
        const merchant = await transaction.merchant.findUnique({
          where: { ownerUserId: userId, status: MerchantStatus.ACTIVE },
          select: { id: true },
        });
        if (!merchant) return { status: 'OWNER_REQUIRED' as const };

        const target = await transaction.merchantMembership.findUnique({
          where: { id: membershipId },
          select: { id: true, userId: true, merchantId: true, role: true },
        });
        if (!target || target.merchantId !== merchant.id) {
          return { status: 'NOT_FOUND' as const };
        }
        if (target.userId === userId || target.role !== MembershipRole.VIEWER) {
          return { status: 'OWNER_PROTECTED' as const };
        }

        await transaction.merchantMembership.delete({
          where: { id: target.id },
        });
        await transaction.refreshToken.updateMany({
          where: { userId: target.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { status: 'REMOVED' as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
