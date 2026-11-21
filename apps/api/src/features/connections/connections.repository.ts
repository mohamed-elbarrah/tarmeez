import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditRepository } from './audit.repository.js';

@Injectable()
export class ConnectionsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit?: AuditRepository,
  ) {}

  findWorkspaceOwner(userId: string) {
    return this.prisma.merchantMembership.findUnique({
      where: { userId },
      select: { merchantId: true, role: true, merchant: { select: { status: true } } },
    });
  }

  findConnectionByExternalStoreId(externalStoreId: string) {
    return this.prisma.storeConnection.findUnique({
      where: { platform_externalStoreId: { platform: 'SALLA', externalStoreId } },
      select: { id: true, merchantId: true, ownerUserId: true, status: true },
    });
  }

  listForWorkspace(merchantId: string) {
    return this.prisma.storeConnection.findMany({
      where: { merchantId },
      select: {
        id: true,
        platform: true,
        externalStoreId: true,
        storeName: true,
        storeDomain: true,
        status: true,
        connectedAt: true,
        verifiedAt: true,
      },
      orderBy: { connectedAt: 'desc' },
    });
  }

  async disconnect(userId: string, connectionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.merchantMembership.findUnique({
        where: { userId },
        select: { merchantId: true, role: true, merchant: { select: { status: true } } },
      });
      if (!membership || membership.merchant.status !== 'ACTIVE')
        throw new AppException('errors.merchant.not_found', 404);
      if (membership.role !== 'OWNER')
        throw new AppException('errors.connections.workspace_owner_required', 403);
      const result = await tx.storeConnection.updateMany({
        where: { id: connectionId, merchantId: membership.merchantId },
        data: { status: 'DISCONNECTED', accessTokenEncrypted: '', refreshTokenEncrypted: null },
      });
      if (result.count !== 1)
        throw new AppException('errors.connections.not_found', 404);
      if (!this.audit) throw new Error('Audit repository is required for disconnect');
      await this.audit.create({
        merchantId: membership.merchantId,
        actorUserId: userId,
        action: 'CONNECTION_DISCONNECTED',
        entityType: 'STORE_CONNECTION',
        entityId: connectionId,
        metadata: { status: 'DISCONNECTED' },
      }, tx);
      return { disconnected: true };
    });
  }

  updateWebhookTokens(
    externalStoreId: string,
    data: {
      storeName?: string;
      storeDomain?: string;
      accessTokenEncrypted: string;
      refreshTokenEncrypted?: string;
      tokenExpiresAt?: Date;
    },
    auditInput: { merchantId: string; connectionId: string; dedupeKey: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.storeConnection.updateMany({
          where: {
            platform: 'SALLA',
            externalStoreId,
            status: { in: ['CONNECTED', 'REAUTH_REQUIRED'] },
          },
          data: { ...data, status: 'CONNECTED', verifiedAt: new Date() },
        });
      if (result.count !== 1) return result;
      if (!this.audit) throw new Error('Audit repository is required for webhook token updates');
      await this.audit.create({
        merchantId: auditInput.merchantId,
        actorUserId: null,
        action: 'CONNECTION_WEBHOOK_TOKEN_UPDATED',
        entityType: 'STORE_CONNECTION',
        entityId: auditInput.connectionId,
        dedupeKey: auditInput.dedupeKey,
        metadata: { status: 'CONNECTED' },
      }, tx);
      return result;
    }).catch((error) => isUniqueViolation(error)
      ? { count: 0, duplicate: true as const }
      : Promise.reject(error));
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
