import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  MerchantInvitation,
  MerchantProfileResponse,
  MerchantTeamMember,
} from '@tarmeez/types';
import {
  MembershipRole,
  MerchantStatus,
} from '../../generated/prisma/client.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuthMailerService } from '../auth/auth-mailer.service.js';
import { MerchantsRepository } from './merchants.repository.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    private readonly merchantsRepository: MerchantsRepository,
    private readonly authMailer: AuthMailerService,
  ) {}

  async getMyMerchant(userId: string): Promise<MerchantProfileResponse> {
    const membership = await this.requireMembership(userId);
    return this.serializeProfile(membership);
  }

  async updateMyMerchantName(
    userId: string,
    name: string,
  ): Promise<MerchantProfileResponse> {
    const membership = await this.requireMembership(userId);
    if (membership.role !== MembershipRole.OWNER) {
      throw new AppException(
        'errors.merchant.owner_required',
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.merchantsRepository.updateMyMerchantName(
      userId,
      name,
    );
    if (!updated) {
      throw new AppException(
        'errors.merchant.owner_required',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.serializeProfile(updated);
  }

  async getTeam(userId: string): Promise<MerchantTeamMember[]> {
    await this.requireMembership(userId);
    const team = await this.merchantsRepository.findMyTeam(userId);
    if (!team) {
      throw new AppException('errors.merchant.not_found', HttpStatus.NOT_FOUND);
    }
    return team.map((member) => this.serializeTeamMember(member));
  }

  async getInvitations(userId: string): Promise<MerchantInvitation[]> {
    await this.requireOwner(userId);
    const invitations = await this.merchantsRepository.findMyInvitations(userId);
    if (!invitations) {
      throw new AppException('errors.merchant.not_found', HttpStatus.NOT_FOUND);
    }
    return invitations.map((invitation) =>
      this.serializeInvitation(invitation),
    );
  }

  async createInvitation(userId: string, email: string) {
    const membership = await this.requireOwner(userId);
    const token = this.newInvitationToken();
    const now = new Date();
    const result = await this.merchantsRepository.createInvitation({
      merchantId: membership.merchant.id,
      invitedByUserId: userId,
      email,
      tokenHash: this.hashInvitationToken(token),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      now,
    });

    if (result.status === 'USER_ALREADY_ASSIGNED') {
      throw new AppException(
        'errors.merchant.user_already_assigned',
        HttpStatus.CONFLICT,
      );
    }
    if (result.status === 'INVITATION_EXISTS') {
      throw new AppException(
        'errors.merchant.invitation_already_pending',
        HttpStatus.CONFLICT,
      );
    }
    if (result.status !== 'CREATED') {
      throw new AppException(
        'errors.merchant.owner_required',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.deliverInvitation(
      membership,
      email,
      token,
      result.invitation.id,
    );
    return { invitation: this.serializeInvitation(result.invitation) };
  }

  async resendInvitation(userId: string, invitationId: string) {
    const membership = await this.requireOwner(userId);
    const token = this.newInvitationToken();
    const now = new Date();
    const result = await this.merchantsRepository.resendInvitation({
      merchantId: membership.merchant.id,
      invitedByUserId: userId,
      invitationId,
      tokenHash: this.hashInvitationToken(token),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    });

    if (result.status === 'USER_ALREADY_ASSIGNED') {
      throw new AppException(
        'errors.merchant.user_already_assigned',
        HttpStatus.CONFLICT,
      );
    }
    if (result.status === 'NOT_RESENDABLE') {
      throw new AppException(
        'errors.merchant.invitation_not_found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (result.status !== 'RESENT') {
      throw new AppException(
        'errors.merchant.owner_required',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.deliverInvitation(
      membership,
      result.invitation.email,
      token,
      result.invitation.id,
    );
    return { invitation: this.serializeInvitation(result.invitation) };
  }

  async revokeInvitation(userId: string, invitationId: string) {
    await this.requireOwner(userId);
    const revoked = await this.merchantsRepository.revokeInvitation(
      userId,
      invitationId,
      new Date(),
    );
    if (!revoked) {
      throw new AppException(
        'errors.merchant.invitation_not_found',
        HttpStatus.NOT_FOUND,
      );
    }
    return { messageKey: 'success.merchant.invitation_revoked' };
  }

  async removeTeamMember(userId: string, membershipId: string) {
    await this.requireOwner(userId);
    const result = await this.merchantsRepository.removeTeamMember(
      userId,
      membershipId,
      new Date(),
    );
    if (result.status === 'NOT_FOUND') {
      throw new AppException(
        'errors.merchant.member_not_found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (result.status === 'OWNER_PROTECTED') {
      throw new AppException(
        'errors.merchant.owner_cannot_be_removed',
        HttpStatus.CONFLICT,
      );
    }
    if (result.status !== 'REMOVED') {
      throw new AppException(
        'errors.merchant.owner_required',
        HttpStatus.FORBIDDEN,
      );
    }
    return { messageKey: 'success.merchant.member_removed' };
  }

  private serializeProfile(
    membership: NonNullable<
      Awaited<ReturnType<MerchantsRepository['findMyMerchant']>>
    >,
  ): MerchantProfileResponse {
    return {
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
      user: {
        ...membership.user,
        emailVerifiedAt:
          membership.user.emailVerifiedAt?.toISOString() ?? null,
      },
      merchant: {
        ...membership.merchant,
        createdAt: membership.merchant.createdAt.toISOString(),
        updatedAt: membership.merchant.updatedAt.toISOString(),
      },
    };
  }

  private serializeTeamMember(member: {
    id: string;
    role: MembershipRole;
    createdAt: Date;
    user: { id: string; email: string; name: string };
  }): MerchantTeamMember {
    return { ...member, createdAt: member.createdAt.toISOString() };
  }

  private serializeInvitation(invitation: {
    id: string;
    email: string;
    role: MembershipRole;
    expiresAt: Date;
    createdAt: Date;
  }): MerchantInvitation {
    return {
      ...invitation,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    };
  }

  private async requireMembership(userId: string) {
    const membership = await this.merchantsRepository.findMyMerchant(userId);
    if (!membership) {
      throw new AppException('errors.merchant.not_found', HttpStatus.NOT_FOUND);
    }
    if (membership.merchant.status !== MerchantStatus.ACTIVE) {
      throw new AppException(
        'errors.merchant.workspace_suspended',
        HttpStatus.FORBIDDEN,
      );
    }
    return membership;
  }

  private async requireOwner(userId: string) {
    const membership = await this.requireMembership(userId);
    if (membership.role !== MembershipRole.OWNER) {
      throw new AppException(
        'errors.merchant.owner_required',
        HttpStatus.FORBIDDEN,
      );
    }
    return membership;
  }

  private async deliverInvitation(
    membership: NonNullable<
      Awaited<ReturnType<MerchantsRepository['findMyMerchant']>>
    >,
    email: string,
    token: string,
    invitationId: string,
  ): Promise<void> {
    try {
      await this.authMailer.sendTeamInvitation(
        email,
        membership.merchant.name,
        membership.user.name,
        token,
      );
    } catch {
      await this.merchantsRepository.revokeInvitation(
        membership.user.id,
        invitationId,
        new Date(),
      );
      this.logger.error('Team invitation email delivery failed');
      throw new AppException(
        'errors.auth.email_delivery_failed',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private newInvitationToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashInvitationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
