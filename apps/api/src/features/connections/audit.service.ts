import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditRepository, safeMetadata } from './audit.repository.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repository: AuditRepository) {}

  async record(input: {
    merchantId?: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata: Prisma.InputJsonValue;
  }): Promise<void> {
    try {
      await this.repository.create({
        ...input,
        metadata: safeMetadata(input.metadata),
      });
    } catch {
      this.logger.warn(`Audit write failed for ${input.action}`);
    }
  }
}
