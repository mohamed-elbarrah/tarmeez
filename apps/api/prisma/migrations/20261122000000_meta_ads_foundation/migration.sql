CREATE TYPE "AdProvider" AS ENUM ('META');
CREATE TYPE "AdConnectionStatus" AS ENUM ('CONNECTED', 'REAUTH_REQUIRED', 'DISCONNECTED');
CREATE TYPE "AdIntentStatus" AS ENUM ('INITIATED', 'AUTHORIZED', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "AdSyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
CREATE TYPE "AdSyncTrigger" AS ENUM ('INITIAL', 'MANUAL', 'SCHEDULED', 'RECONCILIATION');
CREATE TYPE "AdStatusActionState" AS ENUM ('QUEUED', 'PROCESSING', 'CONFIRMED', 'REJECTED', 'NOT_CONFIRMED');

CREATE TABLE "ad_connection_intents" (
  "id" TEXT NOT NULL, "merchant_id" TEXT NOT NULL, "initiated_by_user_id" TEXT NOT NULL,
  "provider" "AdProvider" NOT NULL, "state_hash" TEXT NOT NULL, "status" "AdIntentStatus" NOT NULL DEFAULT 'INITIATED',
  "expires_at" TIMESTAMP(3) NOT NULL, "authorization_code_hash" TEXT, "authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ad_connection_intents_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ad_authorizations" (
  "id" TEXT NOT NULL, "merchant_id" TEXT NOT NULL, "owner_user_id" TEXT NOT NULL, "provider" "AdProvider" NOT NULL,
  "access_token_encrypted" TEXT NOT NULL, "granted_permissions" JSONB, "token_expires_at" TIMESTAMP(3),
  "status" "AdConnectionStatus" NOT NULL DEFAULT 'CONNECTED', "last_validated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ad_authorizations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ad_account_connections" (
  "id" TEXT NOT NULL, "merchant_id" TEXT NOT NULL, "owner_user_id" TEXT NOT NULL, "authorization_id" TEXT NOT NULL,
  "provider" "AdProvider" NOT NULL, "external_account_id" TEXT NOT NULL, "name" TEXT NOT NULL, "currency" TEXT,
  "reporting_time_zone" TEXT, "status" "AdConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "last_campaign_sync_at" TIMESTAMP(3), "last_metrics_sync_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ad_account_connections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ad_campaigns" (
  "id" TEXT NOT NULL, "merchant_id" TEXT NOT NULL, "account_connection_id" TEXT NOT NULL, "external_campaign_id" TEXT NOT NULL,
  "name" TEXT NOT NULL, "objective" TEXT, "configured_status" TEXT, "effective_status" TEXT, "status_observed_at" TIMESTAMP(3),
  "source_updated_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ad_campaign_daily_metrics" (
  "id" TEXT NOT NULL, "campaign_id" TEXT NOT NULL, "report_date" DATE NOT NULL, "currency" TEXT,
  "spend" DECIMAL(18,4), "impressions" BIGINT, "clicks" BIGINT, "reported_purchases" BIGINT,
  "reported_purchase_value" DECIMAL(18,4), "attribution_setting" TEXT, "metric_version" TEXT NOT NULL DEFAULT 'meta-insights-v1',
  "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_campaign_daily_metrics_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ad_sync_runs" (
  "id" TEXT NOT NULL, "merchant_id" TEXT NOT NULL, "account_connection_id" TEXT NOT NULL, "trigger" "AdSyncTrigger" NOT NULL,
  "status" "AdSyncStatus" NOT NULL DEFAULT 'QUEUED', "range_from" DATE, "range_to" DATE,
  "campaigns_processed" INTEGER NOT NULL DEFAULT 0, "metrics_processed" INTEGER NOT NULL DEFAULT 0, "failure_code" TEXT,
  "started_at" TIMESTAMP(3), "finished_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_sync_runs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ad_campaign_status_actions" (
  "id" TEXT NOT NULL, "merchant_id" TEXT NOT NULL, "campaign_id" TEXT NOT NULL, "actor_user_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL, "expected_status" TEXT NOT NULL, "requested_status" TEXT NOT NULL,
  "state" "AdStatusActionState" NOT NULL DEFAULT 'QUEUED', "failure_code" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
  CONSTRAINT "ad_campaign_status_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ad_connection_intents_state_hash_key" ON "ad_connection_intents"("state_hash");
CREATE INDEX "ad_connection_intents_initiated_by_user_id_status_idx" ON "ad_connection_intents"("initiated_by_user_id", "status");
CREATE INDEX "ad_connection_intents_merchant_id_created_at_idx" ON "ad_connection_intents"("merchant_id", "created_at");
CREATE INDEX "ad_authorizations_merchant_id_provider_status_idx" ON "ad_authorizations"("merchant_id", "provider", "status");
CREATE INDEX "ad_authorizations_owner_user_id_provider_status_idx" ON "ad_authorizations"("owner_user_id", "provider", "status");
CREATE UNIQUE INDEX "ad_account_connections_owner_user_id_provider_external_account_id_key" ON "ad_account_connections"("owner_user_id", "provider", "external_account_id");
CREATE UNIQUE INDEX "ad_account_connections_provider_external_account_id_key" ON "ad_account_connections"("provider", "external_account_id");
CREATE INDEX "ad_account_connections_merchant_id_status_idx" ON "ad_account_connections"("merchant_id", "status");
CREATE UNIQUE INDEX "ad_campaigns_account_connection_id_external_campaign_id_key" ON "ad_campaigns"("account_connection_id", "external_campaign_id");
CREATE INDEX "ad_campaigns_merchant_id_configured_status_idx" ON "ad_campaigns"("merchant_id", "configured_status");
CREATE UNIQUE INDEX "ad_campaign_daily_metrics_campaign_id_report_date_key" ON "ad_campaign_daily_metrics"("campaign_id", "report_date");
CREATE INDEX "ad_campaign_daily_metrics_report_date_idx" ON "ad_campaign_daily_metrics"("report_date");
CREATE INDEX "ad_sync_runs_account_connection_id_created_at_idx" ON "ad_sync_runs"("account_connection_id", "created_at");
CREATE INDEX "ad_sync_runs_merchant_id_status_idx" ON "ad_sync_runs"("merchant_id", "status");
CREATE UNIQUE INDEX "ad_campaign_status_actions_campaign_id_idempotency_key_key" ON "ad_campaign_status_actions"("campaign_id", "idempotency_key");
CREATE INDEX "ad_campaign_status_actions_campaign_id_state_idx" ON "ad_campaign_status_actions"("campaign_id", "state");
CREATE INDEX "ad_campaign_status_actions_merchant_id_requested_at_idx" ON "ad_campaign_status_actions"("merchant_id", "requested_at");

ALTER TABLE "ad_connection_intents" ADD CONSTRAINT "ad_connection_intents_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_connection_intents" ADD CONSTRAINT "ad_connection_intents_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_connection_intents" ADD CONSTRAINT "ad_connection_intents_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "ad_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_authorizations" ADD CONSTRAINT "ad_authorizations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_authorizations" ADD CONSTRAINT "ad_authorizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_account_connections" ADD CONSTRAINT "ad_account_connections_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_account_connections" ADD CONSTRAINT "ad_account_connections_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_account_connections" ADD CONSTRAINT "ad_account_connections_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "ad_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_account_connection_id_fkey" FOREIGN KEY ("account_connection_id") REFERENCES "ad_account_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_campaign_daily_metrics" ADD CONSTRAINT "ad_campaign_daily_metrics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_sync_runs" ADD CONSTRAINT "ad_sync_runs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_sync_runs" ADD CONSTRAINT "ad_sync_runs_account_connection_id_fkey" FOREIGN KEY ("account_connection_id") REFERENCES "ad_account_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_campaign_status_actions" ADD CONSTRAINT "ad_campaign_status_actions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_campaign_status_actions" ADD CONSTRAINT "ad_campaign_status_actions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_campaign_status_actions" ADD CONSTRAINT "ad_campaign_status_actions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
