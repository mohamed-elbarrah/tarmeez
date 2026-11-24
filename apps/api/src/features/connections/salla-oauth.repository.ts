import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditRepository } from './audit.repository.js';

@Injectable()
export class SallaOAuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit?: AuditRepository,
  ) {}

  async createIntent(input: {
    merchantId: string;
    initiatedByUserId: string;
    stateHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.sallaConnectionIntent.updateMany({
        where: {
          initiatedByUserId: input.initiatedByUserId,
          status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
          expiresAt: { lte: new Date() },
        },
        data: { status: 'EXPIRED', activeIntentKey: null },
      });
      try {
        return await tx.sallaConnectionIntent.create({
          data: { ...input, activeIntentKey: input.initiatedByUserId },
          select: { id: true, expiresAt: true },
        });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new AppException('errors.connections.salla_intent_active', 409);
        throw error;
      }
    });
  }

  async consumeState(stateHash: string) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.sallaConnectionIntent.updateMany({
        where: {
          stateHash,
          status: { in: ['INITIATED', 'PENDING'] },
          expiresAt: { gt: now },
        },
        data: { status: 'PROCESSING', consumedAt: now },
      });
      if (consumed.count !== 1) {
        const existing = await tx.sallaConnectionIntent.findUnique({
          where: { stateHash },
          select: { id: true, status: true },
        });
        if (existing?.status === 'CANCELLED')
          throw new SallaOAuthStateException(
            'errors.connections.salla_intent_cancelled',
            409,
            existing.id,
          );
        throw new AppException('errors.connections.salla_state_invalid', 400);
      }
      const intent = await tx.sallaConnectionIntent.findUniqueOrThrow({
        where: { stateHash },
        select: {
          id: true,
          merchantId: true,
          initiatedByUserId: true,
          expiresAt: true,
        },
      });
      const membership = await tx.merchantMembership.findUnique({
        where: { userId: intent.initiatedByUserId },
        select: {
          merchantId: true,
          role: true,
          merchant: { select: { status: true } },
        },
      });
      const invalidMembership =
        !membership ||
        membership.merchantId !== intent.merchantId ||
        membership.role !== 'OWNER' ||
        membership.merchant.status !== 'ACTIVE';
      if (invalidMembership) {
        const failed = await tx.sallaConnectionIntent.updateMany({
          where: { id: intent.id, status: 'PROCESSING' },
          data: {
            status: 'FAILED',
            failureCode: 'workspace_owner_required',
            failedAt: new Date(),
            activeIntentKey: null,
          },
        });
        if (failed.count !== 1)
          throw new AppException('errors.connections.salla_state_invalid', 400);
        if (!this.audit)
          throw new Error(
            'Audit repository is required for invalid callback state',
          );
        await this.audit.create(
          {
            merchantId: intent.merchantId,
            actorUserId: intent.initiatedByUserId,
            action: 'CONNECTION_AUTHORIZATION_FAILED',
            entityType: 'SALLA_CONNECTION_INTENT',
            entityId: intent.id,
            metadata: { reason: 'workspace_owner_required' },
          },
          tx,
        );
        return { invalid: true, intentId: intent.id };
      }
      return intent;
    });
    if ('invalid' in result)
      throw new SallaOAuthStateException(
        'errors.connections.workspace_owner_required',
        403,
        result.intentId,
      );
    return result;
  }

  findIntentForUser(userId: string, intentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const where = {
        id: intentId,
        merchant: {
          status: 'ACTIVE' as const,
          memberships: { some: { userId } },
        },
      };
      const select = {
        id: true,
        status: true,
        expiresAt: true,
        completedAt: true,
        failedAt: true,
        cancelledAt: true,
        failureCode: true,
      } as const;
      const intent = await tx.sallaConnectionIntent.findFirst({
        where,
        select,
      });
      if (
        !intent ||
        intent.expiresAt > new Date() ||
        !['INITIATED', 'PENDING', 'PROCESSING'].includes(intent.status)
      )
        return intent;
      const expired = await tx.sallaConnectionIntent.updateMany({
        where: {
          id: intent.id,
          status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
          expiresAt: { lte: new Date() },
        },
        data: { status: 'EXPIRED', activeIntentKey: null },
      });
      if (expired.count === 1) return { ...intent, status: 'EXPIRED' as const };
      return tx.sallaConnectionIntent.findFirst({ where, select });
    });
  }

  async cancelIntentForUser(userId: string, intentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const intent = await tx.sallaConnectionIntent.findFirst({
        where: {
          id: intentId,
          initiatedByUserId: userId,
          merchant: {
            status: 'ACTIVE',
            memberships: { some: { userId, role: 'OWNER' } },
          },
        },
        select: { id: true, merchantId: true, status: true },
      });
      if (!intent) return null;
      if (
        intent.status === 'CANCELLED' ||
        intent.status === 'FAILED' ||
        intent.status === 'EXPIRED'
      )
        return { id: intent.id, status: intent.status };
      if (intent.status === 'COMPLETED')
        throw new AppException(
          'errors.connections.salla_intent_completed',
          409,
        );

      const now = new Date();
      const cancelled = await tx.sallaConnectionIntent.updateMany({
        where: {
          id: intentId,
          status: { in: ['INITIATED', 'PENDING', 'PROCESSING'] },
        },
        data: { status: 'CANCELLED', activeIntentKey: null, cancelledAt: now },
      });
      if (cancelled.count !== 1)
        throw new AppException('errors.connections.salla_state_invalid', 400);
      if (!this.audit)
        throw new Error('Audit repository is required for intent cancellation');
      await this.audit.create(
        {
          merchantId: intent.merchantId,
          actorUserId: userId,
          action: 'CONNECTION_AUTHORIZATION_CANCELLED',
          entityType: 'SALLA_CONNECTION_INTENT',
          entityId: intentId,
          metadata: { status: 'CANCELLED' },
        },
        tx,
      );
      return { id: intent.id, status: 'CANCELLED' as const, cancelledAt: now };
    });
  }

  failIntent(
    intentId: string,
    failureCode: string,
    auditInput: { merchantId: string; actorUserId: string | null | undefined },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.sallaConnectionIntent.updateMany({
        where: { id: intentId, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          failureCode,
          failedAt: new Date(),
          activeIntentKey: null,
        },
      });
      if (result.count !== 1) return null;
      if (!this.audit)
        throw new Error('Audit repository is required for intent failure');
      await this.audit.create(
        {
          merchantId: auditInput.merchantId,
          actorUserId: auditInput.actorUserId,
          action: 'CONNECTION_AUTHORIZATION_FAILED',
          entityType: 'SALLA_CONNECTION_INTENT',
          entityId: intentId,
          metadata: { reason: failureCode },
        },
        tx,
      );
      return result;
    });
  }

  completeConnection(input: {
    intentId: string;
    merchantId: string;
    ownerUserId: string;
    externalStoreId: string;
    storeName?: string;
    storeDomain?: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    tokenExpiresAt: Date | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const { intentId: _intentId, ...connectionData } = input;
      const existing = await tx.storeConnection.findUnique({
        where: {
          platform_externalStoreId: {
            platform: 'SALLA',
            externalStoreId: input.externalStoreId,
          },
        },
        select: { id: true, merchantId: true },
      });
      if (existing && existing.merchantId !== input.merchantId)
        throw new AppException(
          'errors.connections.salla_ownership_conflict',
          409,
        );
      const lifecycleData = {
        ...connectionData,
        status: 'CONNECTED' as const,
        verifiedAt: new Date(),
      };
      const connection = existing
        ? tx.storeConnection.update({
            where: { id: existing.id },
            data: lifecycleData,
            select: { id: true },
          })
        : tx.storeConnection.create({
            data: { ...lifecycleData, platform: 'SALLA' },
            select: { id: true },
          });
      const saved = await connection;
      if (!this.audit)
        throw new Error(
          'Audit repository is required for connection persistence',
        );
      await this.audit.create(
        {
          merchantId: input.merchantId,
          actorUserId: input.ownerUserId,
          action: existing ? 'CONNECTION_REAUTHORIZED' : 'CONNECTION_CREATED',
          entityType: 'STORE_CONNECTION',
          entityId: saved.id,
          metadata: { status: 'CONNECTED' },
        },
        tx,
      );
      const completed = await tx.sallaConnectionIntent.updateMany({
        where: {
          id: input.intentId,
          merchantId: input.merchantId,
          initiatedByUserId: input.ownerUserId,
          status: 'PROCESSING',
        },
        data: {
          status: 'COMPLETED',
          connectionId: saved.id,
          completedAt: new Date(),
          activeIntentKey: null,
        },
      });
      if (completed.count !== 1)
        throw new AppException('errors.connections.salla_state_invalid', 400);
      return saved;
    });
  }
}

export class SallaOAuthStateException extends AppException {
  constructor(
    key: string,
    status: number,
    readonly intentId: string,
  ) {
    super(key, status);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
