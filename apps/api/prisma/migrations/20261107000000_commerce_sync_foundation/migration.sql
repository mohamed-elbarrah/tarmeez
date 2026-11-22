-- CreateEnum
CREATE TYPE "SyncResource" AS ENUM ('ALL', 'PRODUCTS', 'CUSTOMERS', 'ORDERS');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "store_connections" ADD COLUMN     "refresh_lock_expires_at" TIMESTAMP(3),
ADD COLUMN     "refresh_lock_token" TEXT;

-- CreateTable
CREATE TABLE "commerce_products" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "product_type" TEXT,
    "status" TEXT,
    "currency" TEXT,
    "price" DECIMAL(18,4),
    "sale_price" DECIMAL(18,4),
    "quantity" INTEGER,
    "is_available" BOOLEAN,
    "source_created_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "source_data" JSONB,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_customers" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "country" TEXT,
    "source_created_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "source_data" JSONB,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_orders" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "external_id" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT,
    "currency" TEXT,
    "subtotal" DECIMAL(18,4),
    "discount_total" DECIMAL(18,4),
    "shipping_total" DECIMAL(18,4),
    "tax_total" DECIMAL(18,4),
    "total" DECIMAL(18,4),
    "source_created_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "source_data" JSONB,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commerce_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "external_product_id" TEXT,
    "external_variant_id" TEXT,
    "name" TEXT,
    "sku" TEXT,
    "quantity" DECIMAL(18,4),
    "unit_price" DECIMAL(18,4),
    "total" DECIMAL(18,4),
    "currency" TEXT,
    "source_data" JSONB,

    CONSTRAINT "commerce_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "resource" "SyncResource" NOT NULL,
    "status" "SyncRunStatus" NOT NULL DEFAULT 'QUEUED',
    "cursor" TEXT,
    "fetched_count" INTEGER NOT NULL DEFAULT 0,
    "upserted_count" INTEGER NOT NULL DEFAULT 0,
    "error_key" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commerce_products_merchant_id_source_updated_at_idx" ON "commerce_products"("merchant_id", "source_updated_at");

-- CreateIndex
CREATE INDEX "commerce_products_connection_id_status_idx" ON "commerce_products"("connection_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_products_connection_id_external_id_key" ON "commerce_products"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "commerce_customers_merchant_id_source_updated_at_idx" ON "commerce_customers"("merchant_id", "source_updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_customers_connection_id_external_id_key" ON "commerce_customers"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "commerce_orders_merchant_id_source_created_at_idx" ON "commerce_orders"("merchant_id", "source_created_at");

-- CreateIndex
CREATE INDEX "commerce_orders_connection_id_status_idx" ON "commerce_orders"("connection_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "commerce_orders_connection_id_external_id_key" ON "commerce_orders"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "commerce_order_items_order_id_idx" ON "commerce_order_items"("order_id");

-- CreateIndex
CREATE INDEX "commerce_order_items_product_id_idx" ON "commerce_order_items"("product_id");

-- CreateIndex
CREATE INDEX "sync_runs_connection_id_created_at_idx" ON "sync_runs"("connection_id", "created_at");

-- CreateIndex
CREATE INDEX "sync_runs_connection_id_resource_status_idx" ON "sync_runs"("connection_id", "resource", "status");

-- AddForeignKey
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "store_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_customers" ADD CONSTRAINT "commerce_customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_customers" ADD CONSTRAINT "commerce_customers_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "store_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "store_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "commerce_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_items" ADD CONSTRAINT "commerce_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce_order_items" ADD CONSTRAINT "commerce_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "store_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

