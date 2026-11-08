import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { SyncResource } from './salla.provider.js';

type Row = Record<string, unknown>;

@Injectable()
export class ConnectionsSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMembership(userId: string) {
    return this.prisma.merchantMembership.findUnique({
      where: { userId },
      select: { merchantId: true, role: true },
    });
  }

  markConnectionReauthRequired(connectionId: string) {
    return this.prisma.storeConnection.update({
      where: { id: connectionId },
      data: { status: 'REAUTH_REQUIRED' },
    });
  }

  findSyncContext(connectionId: string) {
    return this.prisma.storeConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        merchantId: true,
        status: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        tokenExpiresAt: true,
        refreshLockToken: true,
        refreshLockExpiresAt: true,
      },
    });
  }

  createRun(connectionId: string, resource: 'ALL' | SyncResource) {
    return this.prisma.syncRun.create({ data: { connectionId, resource } });
  }

  findRun(id: string) {
    return this.prisma.syncRun.findUnique({ where: { id } });
  }

  findConnectionForMerchant(connectionId: string, merchantId: string) {
    return this.prisma.storeConnection.findFirst({
      where: { id: connectionId, merchantId, platform: 'SALLA' },
      select: { id: true, status: true },
    });
  }

  listRuns(connectionId: string, merchantId: string) {
    return this.prisma.syncRun.findMany({
      where: { connectionId, connection: { merchantId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        resource: true,
        status: true,
        fetchedCount: true,
        upsertedCount: true,
        errorKey: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });
  }

  async listData(
    connectionId: string,
    merchantId: string,
    resource: SyncResource,
    page: number,
    perPage: number,
  ) {
    const skip = (page - 1) * perPage;
    const where = { connectionId, merchantId };
    const [data, total] = await this.prisma.$transaction([
      resource === 'PRODUCTS'
        ? this.prisma.commerceProduct.findMany({
            where,
            skip,
            take: perPage,
            orderBy: { sourceUpdatedAt: 'desc' },
          })
        : resource === 'CUSTOMERS'
          ? this.prisma.commerceCustomer.findMany({
              where,
              skip,
              take: perPage,
              orderBy: { sourceUpdatedAt: 'desc' },
            })
          : this.prisma.commerceOrder.findMany({
              where,
              skip,
              take: perPage,
              orderBy: { sourceCreatedAt: 'desc' },
              include: { items: true },
            }),
      resource === 'PRODUCTS'
        ? this.prisma.commerceProduct.count({ where })
        : resource === 'CUSTOMERS'
          ? this.prisma.commerceCustomer.count({ where })
          : this.prisma.commerceOrder.count({ where }),
    ]);
    return { data, total };
  }

  updateRun(id: string, data: Prisma.SyncRunUpdateInput) {
    return this.prisma.syncRun.update({ where: { id }, data });
  }

  tryAcquireRefreshLock(
    connectionId: string,
    lockToken: string,
    expiresAt: Date,
    now: Date,
  ) {
    return this.prisma.storeConnection.updateMany({
      where: {
        id: connectionId,
        status: 'CONNECTED',
        OR: [
          { refreshLockExpiresAt: null },
          { refreshLockExpiresAt: { lt: now } },
        ],
      },
      data: { refreshLockToken: lockToken, refreshLockExpiresAt: expiresAt },
    });
  }

  saveRefreshedTokens(
    connectionId: string,
    lockToken: string,
    data: {
      accessTokenEncrypted: string;
      refreshTokenEncrypted: string;
      tokenExpiresAt: Date;
    },
  ) {
    return this.prisma.storeConnection.updateMany({
      where: { id: connectionId, refreshLockToken: lockToken },
      data: {
        ...data,
        refreshLockToken: null,
        refreshLockExpiresAt: null,
        status: 'CONNECTED',
      },
    });
  }

  releaseRefreshLock(connectionId: string, lockToken: string) {
    return this.prisma.storeConnection.updateMany({
      where: { id: connectionId, refreshLockToken: lockToken },
      data: { refreshLockToken: null, refreshLockExpiresAt: null },
    });
  }

  findConnectionByExternalStoreId(externalStoreId: string) {
    return this.prisma.storeConnection.findUnique({
      where: {
        platform_externalStoreId: { platform: 'SALLA', externalStoreId },
      },
      select: { id: true, status: true },
    });
  }

  async upsertPage(
    connectionId: string,
    merchantId: string,
    resource: SyncResource,
    records: Row[],
  ): Promise<number> {
    for (const row of records) {
      const externalId = readId(row.id);
      if (!externalId) continue;
      if (resource === 'PRODUCTS')
        await this.upsertProduct(connectionId, merchantId, externalId, row);
      if (resource === 'CUSTOMERS')
        await this.upsertCustomer(connectionId, merchantId, externalId, row);
      if (resource === 'ORDERS')
        await this.upsertOrder(connectionId, merchantId, externalId, row);
    }
    return records.filter((row) => readId(row.id)).length;
  }

  private async upsertProduct(
    connectionId: string,
    merchantId: string,
    externalId: string,
    row: Row,
  ) {
    const price = money(row.price ?? row.regular_price);
    const salePrice = money(row.sale_price);
    await this.prisma.commerceProduct.upsert({
      where: { connectionId_externalId: { connectionId, externalId } },
      create: {
        connectionId,
        merchantId,
        externalId,
        name: stringValue(row.name) ?? `Salla product ${externalId}`,
        sku: stringValue(row.sku),
        description: stringValue(row.description),
        productType: stringValue(row.type),
        status: stringValue(nested(row.status, 'name') ?? row.status),
        currency: stringValue(nested(row.currency, 'code') ?? row.currency),
        price,
        salePrice,
        quantity: integerValue(row.quantity),
        isAvailable: booleanValue(row.is_available),
        sourceCreatedAt: dateValue(row.created_at),
        sourceUpdatedAt: dateValue(row.updated_at),
        lastSyncedAt: new Date(),
      },
      update: {
        name: stringValue(row.name) ?? `Salla product ${externalId}`,
        sku: stringValue(row.sku),
        description: stringValue(row.description),
        productType: stringValue(row.type),
        status: stringValue(nested(row.status, 'name') ?? row.status),
        currency: stringValue(nested(row.currency, 'code') ?? row.currency),
        price,
        salePrice,
        quantity: integerValue(row.quantity),
        isAvailable: booleanValue(row.is_available),
        sourceCreatedAt: dateValue(row.created_at),
        sourceUpdatedAt: dateValue(row.updated_at),
        lastSyncedAt: new Date(),
      },
    });
  }

  private async upsertCustomer(
    connectionId: string,
    merchantId: string,
    externalId: string,
    row: Row,
  ) {
    const values = customerValues(row);
    await this.prisma.commerceCustomer.upsert({
      where: { connectionId_externalId: { connectionId, externalId } },
      create: {
        connectionId,
        merchantId,
        externalId,
        ...values,
        lastSyncedAt: new Date(),
      },
      update: { ...values, lastSyncedAt: new Date() },
    });
  }

  private async upsertOrder(
    connectionId: string,
    merchantId: string,
    externalId: string,
    row: Row,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const customer = isRecord(row.customer) ? row.customer : undefined;
      const customerExternalId = customer ? readId(customer.id) : undefined;
      let customerId: string | undefined;
      if (customer && customerExternalId) {
        const values = customerValues(customer);
        const savedCustomer = await transaction.commerceCustomer.upsert({
          where: {
            connectionId_externalId: {
              connectionId,
              externalId: customerExternalId,
            },
          },
          create: {
            connectionId,
            merchantId,
            externalId: customerExternalId,
            ...values,
            lastSyncedAt: new Date(),
          },
          update: { ...values, lastSyncedAt: new Date() },
          select: { id: true },
        });
        customerId = savedCustomer.id;
      }
      const amounts = isRecord(row.amounts) ? row.amounts : row;
      const totalAmount = amounts.total;
      const currency = stringValue(
        nested(totalAmount, 'currency') ?? row.currency,
      );
      const orderValues = {
        customerId,
        reference: stringValue(row.reference_id ?? row.reference),
        status: stringValue(nested(row.status, 'name') ?? row.status),
        currency,
        subtotal: money(amounts.sub_total ?? amounts.subtotal),
        discountTotal: money(amounts.total_discount ?? amounts.discount),
        shippingTotal: money(amounts.shipping_cost ?? amounts.shipping),
        taxTotal: money(amounts.tax_amount ?? amounts.tax),
        total: money(totalAmount),
        sourceCreatedAt: dateValue(nested(row.date, 'date') ?? row.created_at),
        sourceUpdatedAt: dateValue(row.updated_at),
        lastSyncedAt: new Date(),
      };
      const savedOrder = await transaction.commerceOrder.upsert({
        where: { connectionId_externalId: { connectionId, externalId } },
        create: { connectionId, merchantId, externalId, ...orderValues },
        update: orderValues,
        select: { id: true },
      });
      await transaction.commerceOrderItem.deleteMany({
        where: { orderId: savedOrder.id },
      });
      if (Array.isArray(row.items)) {
        const items = [];
        for (const item of row.items.filter(isRecord)) {
          const product = isRecord(item.product) ? item.product : item;
          const externalProductId = readId(product.id);
          const linkedProduct = externalProductId
            ? await transaction.commerceProduct.findUnique({
                where: {
                  connectionId_externalId: {
                    connectionId,
                    externalId: externalProductId,
                  },
                },
                select: { id: true },
              })
            : null;
          const itemTotal = item.total ?? item.amount;
          items.push({
            orderId: savedOrder.id,
            productId: linkedProduct?.id,
            externalProductId,
            externalVariantId: readId(
              item.variant_id ?? nested(item.variant, 'id'),
            ),
            name: stringValue(product.name ?? item.name),
            sku: stringValue(product.sku ?? item.sku),
            quantity: money(item.quantity),
            unitPrice: money(item.price ?? item.unit_price),
            total: money(itemTotal),
            currency: stringValue(nested(itemTotal, 'currency') ?? currency),
          });
        }
        if (items.length)
          await transaction.commerceOrderItem.createMany({ data: items });
      }
    });
  }
}

function customerValues(row: Row) {
  const name =
    stringValue(row.name) ??
    ([stringValue(row.first_name), stringValue(row.last_name)]
      .filter(Boolean)
      .join(' ') ||
      undefined);
  return {
    name,
    email: stringValue(row.email),
    phone: stringValue(row.mobile ?? row.phone),
    city: stringValue(nested(row.city, 'name') ?? row.city),
    country: stringValue(nested(row.country, 'name') ?? row.country),
    sourceCreatedAt: dateValue(row.created_at),
    sourceUpdatedAt: dateValue(row.updated_at),
  };
}

function money(value: unknown): number | undefined {
  const raw = isRecord(value) ? (value.amount ?? value.value) : value;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() && Number.isFinite(Number(raw)))
    return Number(raw);
  return undefined;
}

function nested(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function integerValue(value: unknown): number | undefined {
  const parsed = money(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function dateValue(value: unknown): Date | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readId(value: unknown): string | undefined {
  return typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
    ? String(value)
    : undefined;
}

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
