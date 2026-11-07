import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SallaProvider } from './salla.provider.js';

const INTENT_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly salla: SallaProvider,
  ) {}

  async startSalla(userId: string, storeUrl: string) {
    const appId = this.config.get<string>('SALLA_APP_ID');
    if (!appId)
      throw new ServiceUnavailableException('Salla app is not configured');
    const domain = normalizeDomain(storeUrl);
    const membership = await this.prisma.merchantMembership.findUnique({
      where: { userId },
      select: { role: true, merchant: { select: { id: true, status: true } } },
    });
    if (!membership || membership.merchant.status !== 'ACTIVE') {
      throw new NotFoundException('Merchant workspace not found');
    }
    if (membership.role !== 'OWNER')
      throw new ForbiddenException('Workspace owner permission is required');
    const connected = await this.prisma.storeConnection.findFirst({
      where: {
        merchantId: membership.merchant.id,
        platform: 'SALLA',
        storeDomain: { contains: domain },
      },
      select: { id: true },
    });
    if (connected)
      throw new ConflictException(
        'This Salla store is already connected to this workspace',
      );

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const active = await this.prisma.sallaConnectionIntent.findFirst({
      where: {
        expectedStoreDomain: domain,
        completedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, merchantId: true },
    });
    if (active && active.merchantId !== membership.merchant.id) {
      throw new ConflictException(
        'A connection attempt for this Salla store is already in progress',
      );
    }
    const intent = active
      ? active
      : await this.prisma.sallaConnectionIntent.create({
          data: {
            merchantId: membership.merchant.id,
            expectedStoreDomain: domain,
            expiresAt,
          },
          select: { id: true, merchantId: true },
        });
    return {
      intentId: intent.id,
      installationUrl: `https://s.salla.sa/apps/install/${encodeURIComponent(appId)}`,
      expiresAt,
    };
  }

  async receiveSallaAppEvent(
    headers: { signature?: string; authorization?: string; strategy?: string },
    rawBody: Buffer | undefined,
    body: unknown,
  ) {
    const secret = this.config.get<string>('SALLA_WEBHOOK_SECRET');
    if (!secret || !rawBody || !this.verifyWebhook(headers, rawBody, secret)) {
      throw new UnauthorizedException('Invalid Salla webhook signature');
    }
    if (!isRecord(body))
      throw new ConflictException('Invalid Salla event payload');
    const eventData = isRecord(body.data) ? body.data : body;
    const eventName = body.event ?? body.event_name ?? eventData.event;
    if (
      eventName !== 'app.store.authorize' &&
      eventName !== 'app.store.authorized'
    ) {
      return { received: true, processed: false };
    }

    const accessToken = eventData.access_token ?? body.access_token;
    const refreshToken = eventData.refresh_token ?? body.refresh_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new ConflictException(
        'Salla authorization event did not contain an access token',
      );
    }
    const identity = await this.salla.getStoreIdentity(accessToken);
    const domain = identity.domain
      ? normalizeDomain(identity.domain)
      : undefined;
    if (!domain)
      throw new ConflictException(
        'Salla identity response did not include a store domain',
      );

    const existing = await this.prisma.storeConnection.findUnique({
      where: {
        platform_externalStoreId: {
          platform: 'SALLA',
          externalStoreId: identity.id,
        },
      },
      select: { id: true, merchantId: true },
    });
    const intent = await this.prisma.sallaConnectionIntent.findFirst({
      where: {
        expectedStoreDomain: domain,
        completedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, merchantId: true },
    });
    if (!intent && !existing) {
      throw new ConflictException(
        'No active Tarmeez connection attempt matches this Salla store',
      );
    }
    if (intent && existing && intent.merchantId !== existing.merchantId) {
      throw new ConflictException(
        'This Salla store is already connected to another workspace',
      );
    }
    const merchantId = existing?.merchantId ?? intent!.merchantId;
    const key = this.encryptionKey();
    const rawExpiry = eventData.expires ?? eventData.expires_at ?? body.expires;
    const expiresAt =
      typeof rawExpiry === 'number'
        ? new Date(rawExpiry > 10_000_000_000 ? rawExpiry : rawExpiry * 1000)
        : null;
    const data = {
      storeName: identity.name,
      storeDomain: identity.domain,
      status: 'CONNECTED' as const,
      accessTokenEncrypted: this.encrypt(accessToken, key),
      refreshTokenEncrypted:
        typeof refreshToken === 'string'
          ? this.encrypt(refreshToken, key)
          : null,
      tokenExpiresAt: expiresAt,
      verifiedAt: new Date(),
    };
    const connection = existing
      ? await this.prisma.storeConnection.update({
          where: {
            platform_externalStoreId: {
              platform: 'SALLA',
              externalStoreId: identity.id,
            },
          },
          data,
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
        })
      : await this.prisma.storeConnection.create({
          data: {
            ...data,
            merchantId,
            platform: 'SALLA',
            externalStoreId: identity.id,
          },
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
        });
    if (intent)
      await this.prisma.sallaConnectionIntent.update({
        where: { id: intent.id },
        data: { completedAt: new Date() },
      });
    return { received: true, processed: true, connection };
  }

  async list(userId: string) {
    const membership = await this.prisma.merchantMembership.findUnique({
      where: { userId },
      select: { merchantId: true },
    });
    if (!membership)
      throw new NotFoundException('Merchant workspace not found');
    return this.prisma.storeConnection.findMany({
      where: { merchantId: membership.merchantId },
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
    const membership = await this.prisma.merchantMembership.findUnique({
      where: { userId },
      select: { merchantId: true, role: true },
    });
    if (!membership)
      throw new NotFoundException('Merchant workspace not found');
    if (membership.role !== 'OWNER')
      throw new ForbiddenException('Workspace owner permission is required');
    const result = await this.prisma.storeConnection.updateMany({
      where: { id: connectionId, merchantId: membership.merchantId },
      data: {
        status: 'DISCONNECTED',
        accessTokenEncrypted: '',
        refreshTokenEncrypted: null,
      },
    });
    if (result.count !== 1) throw new NotFoundException('Connection not found');
    return { disconnected: true };
  }

  private verifyWebhook(
    headers: { signature?: string; authorization?: string; strategy?: string },
    body: Buffer,
    secret: string,
  ): boolean {
    if (headers.strategy?.toLowerCase() === 'token') {
      const supplied = headers.authorization
        ?.replace(/^Bearer\\s+/i, '')
        .trim();
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
      throw new ServiceUnavailableException(
        'SALLA_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
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

function normalizeDomain(input: string): string {
  try {
    const withProtocol = input.includes('://') ? input : `https://${input}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    throw new ConflictException('Enter a valid Salla store URL or domain');
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}
