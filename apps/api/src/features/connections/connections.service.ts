import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception.js';
import { ConnectionsRepository } from './connections.repository.js';
import { CommerceSyncService } from './commerce-sync.service.js';
import { SallaOAuthRepository } from './salla-oauth.repository.js';
import { SallaProvider } from './salla.provider.js';
import type { SyncResource } from './salla.provider.js';
import { generateOAuthState, hashOAuthState } from './salla.state.js';
import { AuditService } from './audit.service.js';

const INTENT_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly repository: ConnectionsRepository,
    private readonly oauthRepository: SallaOAuthRepository,
    private readonly config: ConfigService,
    private readonly salla: SallaProvider,
    private readonly commerceSync: CommerceSyncService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async startSalla(userId: string) {
    const membership = await this.repository.findWorkspaceOwner(userId);
    if (!membership || membership.merchant.status !== 'ACTIVE')
      throw new AppException('errors.merchant.not_found', HttpStatus.NOT_FOUND);
    if (membership.role !== 'OWNER')
      throw new AppException(
        'errors.connections.workspace_owner_required',
        HttpStatus.FORBIDDEN,
      );
    if (!this.config.get<boolean>('SALLA_ENABLED'))
      throw new AppException(
        'errors.connections.salla_not_configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const clientId = this.config.get<string>('SALLA_CLIENT_ID');
    const redirectUri = this.config.get<string>('SALLA_REDIRECT_URI');
    if (!clientId || !redirectUri)
      throw new AppException(
        'errors.connections.salla_not_configured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const state = generateOAuthState();
    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const intent = await this.oauthRepository.createIntent({
      merchantId: membership.merchantId,
      initiatedByUserId: userId,
      stateHash: hashOAuthState(state),
      expiresAt,
    });
    const authorizationUrl = this.salla.buildAuthorizationUrl({
      clientId,
      redirectUri,
      state,
    });
    return {
      intentId: intent.id,
      authorizationUrl: authorizationUrl.toString(),
      expiresAt: intent.expiresAt,
    };
  }

  async handleSallaCallback(input: {
    code?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }) {
    if (!input.state)
      throw new AppException(
        'errors.connections.salla_state_invalid',
        HttpStatus.BAD_REQUEST,
      );
    const intent = await this.oauthRepository.consumeState(
      hashOAuthState(input.state),
    );
    if (input.error) {
      await this.oauthRepository.failIntent(intent.id, 'provider_denied', {
        merchantId: intent.merchantId,
        actorUserId: intent.initiatedByUserId,
      });
      return {
        intentId: intent.id,
        status: 'FAILED' as const,
        reason: 'provider_denied' as const,
      };
    }
    if (!input.code) {
      await this.oauthRepository.failIntent(
        intent.id,
        'authorization_code_missing',
        {
          merchantId: intent.merchantId,
          actorUserId: intent.initiatedByUserId,
        },
      );
      return {
        intentId: intent.id,
        status: 'FAILED' as const,
        reason: 'authorization_code_missing' as const,
      };
    }
    let connection: { id: string };
    try {
      const clientId = this.config.get<string>('SALLA_CLIENT_ID');
      const clientSecret = this.config.get<string>('SALLA_CLIENT_SECRET');
      const redirectUri = this.config.get<string>('SALLA_REDIRECT_URI');
      if (!clientId || !clientSecret || !redirectUri)
        throw new AppException(
          'errors.connections.salla_not_configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      const tokens = await this.salla.exchangeAuthorizationCode(
        input.code,
        clientId,
        clientSecret,
        redirectUri,
      );
      const identity = await this.salla.getStoreIdentity(tokens.access_token);
      const key = this.encryptionKey();
      connection = await this.oauthRepository.completeConnection({
        intentId: intent.id,
        merchantId: intent.merchantId,
        ownerUserId: intent.initiatedByUserId,
        externalStoreId: identity.id,
        storeName: identity.name,
        storeDomain: identity.domain,
        accessTokenEncrypted: this.encrypt(tokens.access_token, key),
        refreshTokenEncrypted: this.encrypt(tokens.refresh_token, key),
        tokenExpiresAt: exchangeTokenExpiry(tokens.expires_in, tokens.expires),
      });
    } catch (error) {
      const failed = await this.oauthRepository.failIntent(
        intent.id,
        failureCode(error),
        {
          merchantId: intent.merchantId,
          actorUserId: intent.initiatedByUserId,
        },
      );
      if (failed === null)
        return { intentId: intent.id, status: 'CANCELLED' as const };
      this.logger.warn(`Salla OAuth callback failed for intent ${intent.id}`);
      return {
        intentId: intent.id,
        status: 'FAILED' as const,
        reason: failureReason(error),
      };
    }
    const initialSync = await this.queueInitialSync(intent.id, connection.id);
    return initialSync
      ? { intentId: intent.id, status: 'COMPLETED' as const }
      : {
          intentId: intent.id,
          status: 'COMPLETED' as const,
          reason: 'sync_failed' as const,
        };
  }

  private async queueInitialSync(
    intentId: string,
    connectionId: string,
  ): Promise<boolean> {
    try {
      const initialSync =
        await this.commerceSync.enqueueForConnection(connectionId);
      if (!initialSync.queued)
        this.logger.warn(
          `Salla initial sync is not queued for completed intent ${intentId}`,
        );
      return initialSync.queued;
    } catch {
      this.logger.error(
        `Salla initial sync queueing failed for completed intent ${intentId} and connection ${connectionId}`,
      );
      return false;
    }
  }

  async getSallaIntentStatus(userId: string, intentId: string) {
    const intent = await this.oauthRepository.findIntentForUser(
      userId,
      intentId,
    );
    if (!intent)
      throw new AppException(
        'errors.connections.intent_not_found',
        HttpStatus.NOT_FOUND,
      );
    return intent;
  }

  async cancelSallaIntent(userId: string, intentId: string) {
    const intent = await this.oauthRepository.cancelIntentForUser(
      userId,
      intentId,
    );
    if (!intent)
      throw new AppException(
        'errors.connections.intent_not_found',
        HttpStatus.NOT_FOUND,
      );
    return intent;
  }

  async receiveSallaAppEvent(
    headers: { signature?: string; authorization?: string; strategy?: string },
    rawBody: Buffer | undefined,
    body: unknown,
  ) {
    const secret = this.config.get<string>('SALLA_WEBHOOK_SECRET');
    if (!secret || !rawBody || !this.verifyWebhook(headers, rawBody, secret))
      throw new AppException(
        'errors.webhooks.invalid_signature',
        HttpStatus.UNAUTHORIZED,
      );
    if (!this.config.get<boolean>('SALLA_ENABLED'))
      return {
        received: true,
        processed: false,
        reason: 'integration_disabled' as const,
      };
    if (!isRecord(body))
      throw new AppException(
        'errors.webhooks.invalid_payload',
        HttpStatus.BAD_REQUEST,
      );
    const eventData = isRecord(body.data) ? body.data : body;
    const eventName = body.event ?? body.event_name ?? eventData.event;
    const resource = resourceForEvent(eventName);
    if (resource) {
      const storeId =
        readExternalStoreId(eventData) ?? readExternalStoreId(body);
      if (!storeId)
        return { received: true, processed: false, reason: 'store_id_missing' };
      const eventId =
        readEventId(body) ??
        readNestedEventId(eventData) ??
        createHash('sha256').update(rawBody).digest('hex');
      const queued = await this.commerceSync.enqueueWebhookSync(
        storeId,
        resource,
        eventId,
      );
      return {
        received: true,
        processed: queued.queued,
        syncRunId: queued.syncRunId,
      };
    }
    if (
      eventName !== 'app.store.authorize' &&
      eventName !== 'app.store.authorized'
    )
      return { received: true, processed: false };
    const accessToken = eventData.access_token ?? body.access_token;
    if (typeof accessToken !== 'string' || !accessToken)
      return {
        received: true,
        processed: false,
        reason: 'authorization_token_missing',
      };
    const identity = await this.salla.getStoreIdentity(accessToken);
    const existing = await this.repository.findConnectionByExternalStoreId(
      identity.id,
    );
    if (!existing)
      return { received: true, processed: false, reason: 'unknown_store' };
    if (
      existing.status !== 'CONNECTED' &&
      existing.status !== 'REAUTH_REQUIRED'
    )
      return {
        received: true,
        processed: false,
        reason: 'connection_inactive',
      };
    const refreshToken = eventData.refresh_token ?? body.refresh_token;
    const rawExpiry = eventData.expires ?? eventData.expires_at ?? body.expires;
    const key = this.encryptionKey();
    const webhookData = {
      storeName: identity.name,
      storeDomain: identity.domain,
      accessTokenEncrypted: this.encrypt(accessToken, key),
      ...(typeof refreshToken === 'string'
        ? { refreshTokenEncrypted: this.encrypt(refreshToken, key) }
        : {}),
      ...(typeof rawExpiry === 'number'
        ? { tokenExpiresAt: unixSecondsExpiry(rawExpiry) ?? undefined }
        : {}),
    };
    const updated = await this.repository.updateWebhookTokens(
      identity.id,
      webhookData,
      {
        merchantId: existing.merchantId,
        connectionId: existing.id,
        dedupeKey: `salla-auth-${createHash('sha256').update(rawBody).digest('hex')}`,
      },
    );
    if ('duplicate' in updated && updated.duplicate)
      return { received: true, processed: false, reason: 'duplicate' as const };
    if (updated.count !== 1)
      return {
        received: true,
        processed: false,
        reason: 'connection_inactive',
      };
    return { received: true, processed: true };
  }

  async list(userId: string) {
    const membership = await this.repository.findWorkspaceOwner(userId);
    if (!membership || membership.merchant.status !== 'ACTIVE')
      throw new AppException('errors.merchant.not_found', HttpStatus.NOT_FOUND);
    return this.repository.listForWorkspace(membership.merchantId);
  }

  async disconnect(userId: string, connectionId: string) {
    return this.repository.disconnect(userId, connectionId);
  }

  private async recordAudit(input: Parameters<AuditService['record']>[0]) {
    if (!this.audit) return;
    try {
      await this.audit.record(input);
    } catch {
      this.logger.warn(`Audit write failed for ${input.action}`);
    }
  }

  private verifyWebhook(
    headers: { signature?: string; authorization?: string; strategy?: string },
    body: Buffer,
    secret: string,
  ) {
    if (headers.strategy?.toLowerCase() === 'token') {
      const supplied = headers.authorization?.replace(/^Bearer\s+/i, '').trim();
      if (!supplied) return false;
      const expected = Buffer.from(secret);
      const received = Buffer.from(supplied);
      return (
        received.length === expected.length &&
        timingSafeEqual(received, expected)
      );
    }
    if (!headers.signature) return false;
    const received = Buffer.from(headers.signature.trim().toLowerCase(), 'hex');
    const expected = createHmac('sha256', secret).update(body).digest();
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  }

  private encryptionKey(): Buffer {
    const value = this.config.get<string>('SALLA_TOKEN_ENCRYPTION_KEY');
    const key = value ? Buffer.from(value, 'base64') : Buffer.alloc(0);
    if (key.length !== 32)
      throw new AppException(
        'errors.connections.token_encryption_misconfigured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return key;
  }

  private encrypt(value: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((part) => part.toString('base64url'))
      .join('.');
  }
}

function durationExpiry(value: number | undefined): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return null;
  return new Date(Date.now() + value * 1000);
}

function exchangeTokenExpiry(
  expiresIn: number | undefined,
  expires: number | undefined,
): Date | null {
  return expiresIn !== undefined
    ? durationExpiry(expiresIn)
    : unixSecondsExpiry(expires);
}

function unixSecondsExpiry(value: number | undefined): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return null;
  return new Date(value * 1000);
}

function failureCode(error: unknown): string {
  return error instanceof AppException
    ? (error.key.split('.').at(-1) ?? 'oauth_failed')
    : 'oauth_failed';
}

function failureReason(
  error: unknown,
): 'oauth_failed' | 'ownership_conflict' | 'not_configured' {
  if (!(error instanceof AppException)) return 'oauth_failed';
  if (error.key === 'errors.connections.salla_ownership_conflict')
    return 'ownership_conflict';
  if (error.key === 'errors.connections.salla_not_configured')
    return 'not_configured';
  return 'oauth_failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resourceForEvent(event: unknown): SyncResource | undefined {
  if (typeof event !== 'string') return undefined;
  if (event.startsWith('product.')) return 'PRODUCTS';
  if (event.startsWith('customer.')) return 'CUSTOMERS';
  if (event.startsWith('order.')) return 'ORDERS';
  return undefined;
}

function readExternalStoreId(
  value: Record<string, unknown>,
): string | undefined {
  const direct = value.store_id ?? value.merchant_id ?? value.merchant;
  if (typeof direct === 'string' || typeof direct === 'number')
    return String(direct);
  for (const key of ['store', 'merchant']) {
    const nested = value[key];
    if (isRecord(nested)) {
      const id = nested.store_id ?? nested.merchant_id ?? nested.id;
      if (typeof id === 'string' || typeof id === 'number') return String(id);
    }
  }
  return undefined;
}

function readEventId(value: Record<string, unknown>): string | undefined {
  const candidate = value.event_id ?? value.eventId;
  return typeof candidate === 'string' || typeof candidate === 'number'
    ? String(candidate)
    : undefined;
}

function readNestedEventId(value: Record<string, unknown>): string | undefined {
  const nestedEvent = value.event;
  const candidate =
    value.event_id ??
    value.eventId ??
    (isRecord(nestedEvent)
      ? (nestedEvent.event_id ?? nestedEvent.eventId)
      : undefined);
  return typeof candidate === 'string' || typeof candidate === 'number'
    ? String(candidate)
    : undefined;
}
