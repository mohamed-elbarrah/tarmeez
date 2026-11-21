import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: {
    merchantId?: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    metadata: Prisma.InputJsonValue;
    dedupeKey?: string;
    },
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    return client.auditLog.create({ data: { ...input, metadata: safeMetadata(input.metadata) } });
  }
}

const SAFE_METADATA_KEYS = new Set(['status', 'reason', 'resource', 'eventId', 'failureCode']);

export function safeMetadata(metadata: Prisma.InputJsonValue): Prisma.InputJsonObject {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => SAFE_METADATA_KEYS.has(key)),
  );
}
