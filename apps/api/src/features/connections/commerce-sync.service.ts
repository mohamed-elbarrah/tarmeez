import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
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
import { SallaPaginationError, SallaProvider, SallaTokenError } from './salla.provider.js';
import { AppException } from '../../common/exceptions/app.exception.js';

export const COMMERCE_SYNC_QUEUE = 'commerce-sync';
export const MAX_SYNC_PAGES = 1_000;

interface SyncAttempt {
  attemptsMade: number;
  maxAttempts: number;
}
const RESOURCE_ORDER: Exclude<SyncResource, 'ALL'>[] = [
  'PRODUCTS',
  'CUSTOMERS',
  'ORDERS',
];

@Injectable()
export class CommerceSyncService {
  private readonly logger = new Logger(CommerceSyncService.name);

  constructor(
    private readonly repository: ConnectionsSyncRepository,
    private readonly config: ConfigService,
    private readonly salla: SallaProvider,
    @InjectQueue(COMMERCE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  private sallaEnabled(): boolean {
    return this.config.get<boolean>('SALLA_ENABLED') === true;
  }

  async enqueue(
    userId: string,
    connectionId: string,
    resource: SyncResource = 'ALL',
  ) {
    if (!this.sallaEnabled())
      throw new AppException('errors.connections.salla_not_configured', HttpStatus.SERVICE_UNAVAILABLE);
    const membership = await this.repository.findMembership(userId);
    if (!membership || membership.merchant.status !== 'ACTIVE')
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
    try {
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
    } catch (error) {
      if (typeof this.queue.getJob !== 'function') {
        await this.repository.updateRun(run.id, {
          status: 'FAILED', errorKey: 'errors.sync.queue_failed',
          errorMessage: 'Sync could not be queued', finishedAt: new Date(),
        });
        throw error;
      }
      try {
        const job = await this.queue.getJob(run.id);
        if (!job) {
          await this.repository.updateRun(run.id, {
            status: 'FAILED', errorKey: 'errors.sync.queue_failed',
            errorMessage: 'Sync could not be queued', finishedAt: new Date(),
          });
        }
      } catch {
        try {
          await this.repository.updateRun(run.id, {
            status: 'FAILED',
            errorKey: 'errors.sync.queue_reconciliation_failed',
            errorMessage: 'Sync queue status could not be verified; retry is safe',
            finishedAt: new Date(),
          });
        } catch {
          this.logger.error(`Could not reconcile sync run ${run.id}`);
        }
      }
      throw error;
    }
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
    eventId?: string,
  ) {
    if (!this.sallaEnabled())
      return { queued: false, reason: 'integration_disabled' as const };
    const connection =
      await this.repository.findConnectionByExternalStoreId(externalStoreId);
    if (!connection || connection.status !== 'CONNECTED')
      return { queued: false };
    // Only durable provider IDs are exact dedupe keys; missing IDs need reconciliation.
    const jobId = eventId
      ? `salla-${connection.id}-${resource.toLowerCase()}-event-${encodeURIComponent(eventId)}`
      : `salla-${connection.id}-${resource.toLowerCase()}-fallback-${randomUUID()}`;
    const { run, created } = await this.repository.createWebhookRun(
      connection.id,
      resource,
      jobId,
    );
    let requeuedFailed = false;
    if (!created) {
      if (run.status === 'QUEUED') {
        if (await this.queue.getJob(jobId))
          return { queued: false, processed: false, reason: 'already_queued' as const, syncRunId: run.id };
      } else if (run.status === 'RUNNING') {
        return { queued: false, processed: false, reason: 'already_processing' as const, syncRunId: run.id };
      } else if (run.status === 'FAILED') {
        if (await this.queue.getJob(jobId))
          return { queued: false, processed: false, reason: 'already_queued' as const, syncRunId: run.id };
        requeuedFailed = await this.repository.requeueFailedRun(run.id);
        if (!requeuedFailed)
          return { queued: false, processed: false, reason: 'already_terminal' as const, syncRunId: run.id };
      } else {
        return { queued: false, processed: false, reason: 'already_terminal' as const, syncRunId: run.id };
      }
    }
    try {
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
    } catch (error) {
      try {
        if (!(await this.queue.getJob(jobId))) {
          if (requeuedFailed) {
            await this.repository.updateRun(run.id, {
              status: 'FAILED',
              errorKey: 'errors.sync.queue_failed',
              errorMessage: 'Sync could not be queued',
              finishedAt: new Date(),
            });
          } else {
            await this.repository.deleteQueuedRun(run.id);
          }
        }
      } catch {
        try {
          await this.repository.updateRun(run.id, {
            status: 'FAILED',
            errorKey: 'errors.sync.queue_reconciliation_failed',
            errorMessage: 'Sync queue status could not be verified; retry is safe',
            finishedAt: new Date(),
          });
        } catch {
          this.logger.error(`Could not reconcile webhook sync run ${run.id}`);
        }
      }
      throw error;
    }
    return { queued: true, processed: true, syncRunId: run.id };
  }

  async enqueueForConnection(connectionId: string) {
    if (!this.sallaEnabled())
      return { queued: false, reason: 'integration_disabled' as const };
    const run = await this.repository.createRun(connectionId, 'ALL');
    try {
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
      return { queued: true, syncRunId: run.id, resource: run.resource, status: run.status, createdAt: run.createdAt };
    } catch (error) {
      if (typeof this.queue.getJob !== 'function') {
        await this.markQueueReconciliationFailed(run.id);
        throw error;
      }
      let job;
      try {
        job = await this.queue.getJob(run.id);
      } catch {
        await this.markQueueReconciliationFailed(run.id);
        throw error;
      }
      if (job) throw error;
      try {
        await this.repository.updateRun(run.id, {
          status: 'FAILED',
          errorKey: 'errors.sync.queue_failed',
          errorMessage: 'Initial sync could not be queued',
          finishedAt: new Date(),
        });
      } catch {
        await this.markQueueReconciliationFailed(run.id);
        throw error;
      }
      this.logger.error(`Salla initial sync queueing failed for connection ${connectionId}`);
      return {
        queued: false,
        syncRunId: run.id,
        resource: run.resource,
        status: 'FAILED' as const,
        createdAt: run.createdAt,
      };
    }
  }

  async status(userId: string, connectionId: string) {
    const membership = await this.repository.findMembership(userId);
    if (!membership || membership.merchant.status !== 'ACTIVE')
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
    if (!membership || membership.merchant.status !== 'ACTIVE')
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

  async processRun(
    syncRunId: string,
    attempt: SyncAttempt = { attemptsMade: 0, maxAttempts: 1 },
  ): Promise<void> {
    const run = await this.repository.findRun(syncRunId);
    if (!run) throw new NotFoundException('Sync run not found');
    if (!this.sallaEnabled()) {
      const error = new AppException('errors.connections.salla_not_configured', HttpStatus.SERVICE_UNAVAILABLE);
      await this.updateRunFailure(run.id, 0, 0, attempt, 'errors.connections.salla_not_configured', 'Salla integration is disabled');
      throw error;
    }
    const context = await this.repository.findSyncContext(run.connectionId);
    if (!context || context.status !== 'CONNECTED') {
      const error = new ConflictException('Connection is not active');
      await this.updateRunFailure(run.id, 0, 0, attempt, 'errors.sync.connection_inactive', 'Connection is not active');
      throw error;
    }
    let fetched = 0;
    let upserted = 0;
    try {
      let token = await this.getValidAccessToken(context);
      let refreshedAfterUnauthorized = false;
      await this.repository.updateRun(run.id, {
        status: 'RUNNING',
        startedAt: new Date(),
        errorKey: null,
        errorMessage: null,
      });
      const resources = run.resource === 'ALL' ? RESOURCE_ORDER : [run.resource];
      for (const resource of resources) {
        let pageNumber = 1;
        let hasMore = true;
        const seenResponses = new Set<string>();
        while (hasMore) {
          if (pageNumber > MAX_SYNC_PAGES)
            throw new AppException('errors.sync.pagination_invalid', HttpStatus.BAD_GATEWAY);
          let result: Awaited<ReturnType<SallaProvider['fetchPage']>>;
          try {
            result = await this.salla.fetchPage(resource, token, pageNumber);
          } catch (error) {
            if (!refreshedAfterUnauthorized && isUnauthorized(error)) {
              refreshedAfterUnauthorized = true;
              token = await this.getValidAccessToken(context, true);
              continue;
            }
            throw error;
          }
          if (result.hasMore) {
            if (result.records.length === 0)
              throw new AppException('errors.sync.pagination_invalid', HttpStatus.BAD_GATEWAY);
            const responseFingerprint = JSON.stringify(result.records);
            if (seenResponses.has(responseFingerprint))
              throw new AppException('errors.sync.pagination_invalid', HttpStatus.BAD_GATEWAY);
            seenResponses.add(responseFingerprint);
          }
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
      const reauth = error instanceof AppException && error.key === 'errors.connections.reauth_required';
      const paginationInvalid = error instanceof AppException && error.key === 'errors.sync.pagination_invalid'
        || error instanceof SallaPaginationError;
      await this.updateRunFailure(
        run.id,
        fetched,
        upserted,
        attempt,
        reauth ? 'errors.sync.reauth_required' : paginationInvalid ? 'errors.sync.pagination_invalid' : undefined,
        reauth ? 'Reconnect the Salla store' : paginationInvalid ? 'Salla pagination was invalid or made no progress' : undefined,
      );
      throw error;
    }
  }

  private async getValidAccessToken(context: {
    id: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  }, forceRefresh = false): Promise<string> {
    const refreshMarginMs = 2 * 60 * 1000;
    if (!forceRefresh && (
      (context.tokenExpiresAt && context.tokenExpiresAt.getTime() > Date.now() + refreshMarginMs) ||
      (!context.tokenExpiresAt && !context.refreshTokenEncrypted)
    )) {
      return this.decrypt(context.accessTokenEncrypted);
    }
    if (!context.refreshTokenEncrypted) {
      await this.repository.markConnectionReauthRequired(context.id);
      throw new AppException('errors.connections.reauth_required', HttpStatus.CONFLICT);
    }
    const clientId = this.config.get<string>('SALLA_CLIENT_ID');
    const clientSecret = this.config.get<string>('SALLA_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new AppException('errors.connections.salla_not_configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const lockToken = randomUUID();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const latest = await this.repository.findSyncContext(context.id);
      if (!latest || latest.status !== 'CONNECTED')
        throw new ConflictException('Salla connection is not active');
      const latestTokenValid = latest.tokenExpiresAt && latest.tokenExpiresAt.getTime() > Date.now() + refreshMarginMs;
      if (latestTokenValid && (!forceRefresh || latest.accessTokenEncrypted !== context.accessTokenEncrypted)) {
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
             throw new AppException('errors.connections.reauth_required', HttpStatus.CONFLICT);
          const tokens = await this.salla.refreshToken(
            refreshToken,
            clientId,
            clientSecret,
          );
          const expiry = refreshTokenExpiry(tokens.expires_in, tokens.expires);
          if (!expiry)
              throw new AppException('errors.connections.reauth_required', HttpStatus.CONFLICT);
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
             throw new AppException('errors.connections.reauth_required', HttpStatus.CONFLICT);
           return tokens.access_token;
          } catch (error) {
            if (error instanceof AppException && error.key === 'errors.connections.reauth_required')
              throw error;
            if (error instanceof SallaTokenError && error.kind === 'INVALID_GRANT') {
              await this.repository.markConnectionReauthRequired(context.id);
              throw new AppException('errors.connections.reauth_required', HttpStatus.CONFLICT);
            }
            throw new AppException('errors.connections.salla_refresh_unavailable', HttpStatus.SERVICE_UNAVAILABLE);
         } finally {
          await this.repository.releaseRefreshLock(context.id, lockToken);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new AppException('errors.connections.salla_refresh_unavailable', HttpStatus.SERVICE_UNAVAILABLE);
  }

  private updateRunFailure(
    runId: string,
    fetched: number,
    upserted: number,
    attempt: SyncAttempt,
    terminalErrorKey?: string,
    terminalMessage?: string,
  ) {
    const terminal = Boolean(terminalErrorKey) || attempt.attemptsMade + 1 >= Math.max(attempt.maxAttempts, 1);
    return this.repository.updateRun(runId, {
      status: terminal ? 'FAILED' : 'QUEUED',
      fetchedCount: fetched,
      upsertedCount: upserted,
      errorKey: terminal ? terminalErrorKey ?? 'errors.sync.failed' : 'errors.sync.retrying',
      errorMessage: terminal ? terminalMessage ?? 'Salla sync failed' : 'Salla sync will retry',
      finishedAt: terminal ? new Date() : null,
    });
  }

  private async markQueueReconciliationFailed(runId: string): Promise<void> {
    try {
      await this.repository.updateRun(runId, {
        status: 'QUEUED',
        errorKey: 'errors.sync.queue_reconciliation_failed',
        errorMessage: 'Sync queue status could not be verified; retry is safe',
        finishedAt: null,
      });
    } catch {
      this.logger.error(`Could not reconcile initial sync run ${runId}`);
    }
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

function refreshTokenExpiry(expiresIn: number | undefined, expires: number | undefined): Date | null {
  if (expiresIn !== undefined)
    return durationExpiry(expiresIn);
  return expires !== undefined ? unixSecondsExpiry(expires) : null;
}

function durationExpiry(value: number): Date | null {
  return Number.isFinite(value) && value >= 0 ? new Date(Date.now() + value * 1000) : null;
}

function unixSecondsExpiry(value: number): Date | null {
  return Number.isFinite(value) && value >= 0 ? new Date(value * 1000) : null;
}

function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}
