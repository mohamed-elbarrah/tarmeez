import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { SyncResource } from '../../generated/prisma/client.js';
import { ConnectionsSyncRepository } from './connections-sync.repository.js';
import { SallaProvider } from './salla.provider.js';

export const COMMERCE_SYNC_QUEUE = 'commerce-sync';
const RESOURCE_ORDER: Exclude<SyncResource, 'ALL'>[] = [
  'PRODUCTS',
  'CUSTOMERS',
  'ORDERS',
];

@Injectable()
export class CommerceSyncService {
  constructor(
    private readonly repository: ConnectionsSyncRepository,
    private readonly config: ConfigService,
    private readonly salla: SallaProvider,
    @InjectQueue(COMMERCE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(
    userId: string,
    connectionId: string,
    resource: SyncResource = 'ALL',
  ) {
    const membership = await this.repository.findMembership(userId);
    if (!membership)
      throw new NotFoundException('Merchant workspace not found');
    if (membership.role !== 'OWNER')
      throw new ForbiddenException('Workspace owner permission is required');
    const connection = await this.repository.findConnectionForMerchant(
      connectionId,
      membership.merchantId,
    );
    if (!connection) throw new NotFoundException('Connection not found');
    if (connection.status !== 'CONNECTED')
      throw new ConflictException('Connection is not active');

    const run = await this.repository.createRun(connectionId, resource);
    await this.queue.add(
      'sync-connection',
      { syncRunId: run.id },
      {
        jobId: run.id,
        attempts: 4,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return {
      syncRunId: run.id,
      resource: run.resource,
      status: run.status,
      createdAt: run.createdAt,
    };
  }

  async enqueueWebhookSync(
    externalStoreId: string,
    resource: Exclude<SyncResource, 'ALL'>,
  ) {
    const connection =
      await this.repository.findConnectionByExternalStoreId(externalStoreId);
    if (!connection || connection.status !== 'CONNECTED')
      return { queued: false };
    const window = Math.floor(Date.now() / 60_000);
    const jobId = `salla-${connection.id}-${resource.toLowerCase()}-${window}`;
    if (await this.queue.getJob(jobId)) return { queued: false };
    const run = await this.repository.createRun(connection.id, resource);
    await this.queue.add(
      'sync-connection',
      { syncRunId: run.id },
      {
        jobId,
        attempts: 4,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return { queued: true, syncRunId: run.id };
  }

  async status(userId: string, connectionId: string) {
    const membership = await this.repository.findMembership(userId);
    if (!membership)
      throw new NotFoundException('Merchant workspace not found');
    const connection = await this.repository.findConnectionForMerchant(
      connectionId,
      membership.merchantId,
    );
    if (!connection) throw new NotFoundException('Connection not found');
    return this.repository.listRuns(connectionId, membership.merchantId);
  }

  async data(
    userId: string,
    connectionId: string,
    resource: Exclude<SyncResource, 'ALL'>,
    page: number,
    perPage: number,
  ) {
    const membership = await this.repository.findMembership(userId);
    if (!membership)
      throw new NotFoundException('Merchant workspace not found');
    const connection = await this.repository.findConnectionForMerchant(
      connectionId,
      membership.merchantId,
    );
    if (!connection) throw new NotFoundException('Connection not found');
    const result = await this.repository.listData(
      connectionId,
      membership.merchantId,
      resource,
      page,
      perPage,
    );
    return {
      data: result.data,
      meta: {
        total: result.total,
        page,
        perPage,
        totalPages: Math.ceil(result.total / perPage),
      },
    };
  }

  async processRun(syncRunId: string): Promise<void> {
    const run = await this.repository.findRun(syncRunId);
    if (!run) throw new NotFoundException('Sync run not found');
    const context = await this.repository.findSyncContext(run.connectionId);
    if (!context || context.status !== 'CONNECTED')
      throw new ConflictException('Connection is not active');
    const token = await this.getValidAccessToken(context);
    await this.repository.updateRun(run.id, {
      status: 'RUNNING',
      startedAt: new Date(),
      errorKey: null,
      errorMessage: null,
    });
    const resources = run.resource === 'ALL' ? RESOURCE_ORDER : [run.resource];
    let fetched = 0;
    let upserted = 0;
    try {
      for (const resource of resources) {
        let pageNumber = 1;
        let hasMore = true;
        while (hasMore) {
          const result = await this.salla.fetchPage(
            resource,
            token,
            pageNumber,
          );
          fetched += result.records.length;
          upserted += await this.repository.upsertPage(
            context.id,
            context.merchantId,
            resource,
            result.records,
          );
          hasMore = result.hasMore;
          await this.repository.updateRun(run.id, {
            cursor: `${resource}:${pageNumber}`,
            fetchedCount: fetched,
            upsertedCount: upserted,
          });
          pageNumber += 1;
        }
      }
      await this.repository.updateRun(run.id, {
        status: 'SUCCEEDED',
        fetchedCount: fetched,
        upsertedCount: upserted,
        cursor: null,
        finishedAt: new Date(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      await this.repository.updateRun(run.id, {
        status: 'FAILED',
        fetchedCount: fetched,
        upsertedCount: upserted,
        errorKey: 'errors.sync.failed',
        errorMessage: message.slice(0, 500),
        finishedAt: new Date(),
      });
      throw error;
    }
  }

  private async getValidAccessToken(context: {
    id: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  }): Promise<string> {
    const refreshMarginMs = 2 * 60 * 1000;
    if (
      !context.tokenExpiresAt ||
      context.tokenExpiresAt.getTime() > Date.now() + refreshMarginMs
    ) {
      return this.decrypt(context.accessTokenEncrypted);
    }
    if (!context.refreshTokenEncrypted) {
      await this.repository.markConnectionReauthRequired(context.id);
      throw new ConflictException(
        'Salla refresh token is unavailable; reconnect the store',
      );
    }
    const clientId = this.config.get<string>('SALLA_CLIENT_ID');
    const clientSecret = this.config.get<string>('SALLA_CLIENT_SECRET');
    if (!clientId || !clientSecret)
      throw new ConflictException(
        'Salla OAuth client credentials are required to refresh tokens',
      );

    const lockToken = randomUUID();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const latest = await this.repository.findSyncContext(context.id);
      if (!latest || latest.status !== 'CONNECTED')
        throw new ConflictException('Salla connection is not active');
      if (
        latest.tokenExpiresAt &&
        latest.tokenExpiresAt.getTime() > Date.now() + refreshMarginMs
      ) {
        return this.decrypt(latest.accessTokenEncrypted);
      }
      const now = new Date();
      const lock = await this.repository.tryAcquireRefreshLock(
        context.id,
        lockToken,
        new Date(now.getTime() + 45_000),
        now,
      );
      if (lock.count === 1) {
        try {
          const refreshToken = latest.refreshTokenEncrypted
            ? this.decrypt(latest.refreshTokenEncrypted)
            : undefined;
          if (!refreshToken)
            throw new ConflictException(
              'Salla refresh token is unavailable; reconnect the store',
            );
          const tokens = await this.salla.refreshToken(
            refreshToken,
            clientId,
            clientSecret,
          );
          const expiryValue = tokens.expires_in ?? tokens.expires;
          if (typeof expiryValue !== 'number')
            throw new ConflictException(
              'Salla refresh response did not include token expiry',
            );
          const expiry =
            expiryValue > 10_000_000_000
              ? new Date(expiryValue)
              : new Date(Date.now() + expiryValue * 1000);
          const saved = await this.repository.saveRefreshedTokens(
            context.id,
            lockToken,
            {
              accessTokenEncrypted: this.encrypt(tokens.access_token),
              refreshTokenEncrypted: this.encrypt(tokens.refresh_token),
              tokenExpiresAt: expiry,
            },
          );
          if (saved.count !== 1)
            throw new ConflictException(
              'Salla refresh lock was lost before saving tokens',
            );
          return tokens.access_token;
        } finally {
          await this.repository.releaseRefreshLock(context.id, lockToken);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new ConflictException('Timed out waiting for Salla token refresh');
  }

  private encrypt(value: string): string {
    const encodedKey = this.config.get<string>('SALLA_TOKEN_ENCRYPTION_KEY');
    const key = encodedKey
      ? Buffer.from(encodedKey, 'base64')
      : Buffer.alloc(0);
    if (key.length !== 32)
      throw new ConflictException('Salla token encryption is misconfigured');
    const ivBytes = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, ivBytes);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [ivBytes, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString('base64url'))
      .join('.');
  }

  private decrypt(value: string): string {
    const encodedKey = this.config.get<string>('SALLA_TOKEN_ENCRYPTION_KEY');
    const key = encodedKey
      ? Buffer.from(encodedKey, 'base64')
      : Buffer.alloc(0);
    if (key.length !== 32)
      throw new ConflictException('Salla token encryption is misconfigured');
    const [ivPart, tagPart, encryptedPart] = value.split('.');
    if (!ivPart || !tagPart || !encryptedPart)
      throw new ConflictException('Stored Salla access token is invalid');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
