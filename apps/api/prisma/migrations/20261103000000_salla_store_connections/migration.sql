CREATE TYPE "StorePlatform" AS ENUM ('SALLA');
CREATE TYPE "StoreConnectionStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED');
CREATE TABLE "store_connections" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "platform" "StorePlatform" NOT NULL,
  "external_store_id" TEXT NOT NULL,
  "store_name" TEXT,
  "store_domain" TEXT,
  "status" "StoreConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "access_token_encrypted" TEXT NOT NULL,
  "refresh_token_encrypted" TEXT,
  "token_expires_at" TIMESTAMP(3),
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_connections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "salla_connection_intents" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "expected_store_domain" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salla_connection_intents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "store_connections_platform_external_store_id_key" ON "store_connections"("platform", "external_store_id");
CREATE INDEX "store_connections_merchant_id_platform_idx" ON "store_connections"("merchant_id", "platform");
CREATE INDEX "salla_connection_intents_expected_store_domain_expires_at_c_idx" ON "salla_connection_intents"("expected_store_domain", "expires_at", "completed_at");
CREATE INDEX "salla_connection_intents_merchant_id_created_at_idx" ON "salla_connection_intents"("merchant_id", "created_at");
ALTER TABLE "store_connections" ADD CONSTRAINT "store_connections_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salla_connection_intents" ADD CONSTRAINT "salla_connection_intents_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
