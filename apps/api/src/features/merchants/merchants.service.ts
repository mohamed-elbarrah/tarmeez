import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
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

  async getMyMerchant(userId: string) {
    const membership = await this.requireMembership(userId);
    return membership;
  }

  async updateMyMerchantName(userId: string, name: string) {
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
    return updated;
  }

  async getTeam(userId: string) {
    await this.requireMembership(userId);
    return this.merchantsRepository.findMyTeam(userId);
  }

  async getInvitations(userId: string) {
    await this.requireOwner(userId);
    return this.merchantsRepository.findMyInvitations(userId);
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
    return { invitation: result.invitation };
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
    return { invitation: result.invitation };
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
