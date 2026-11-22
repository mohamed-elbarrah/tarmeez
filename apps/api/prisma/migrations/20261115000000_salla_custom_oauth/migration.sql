-- Add explicit ownership while preserving the existing merchant workspace scope.
ALTER TABLE "store_connections"
ADD COLUMN "owner_user_id" TEXT;

UPDATE "store_connections" AS sc
SET "owner_user_id" = m."owner_user_id"
FROM "merchants" AS m
WHERE m."id" = sc."merchant_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "store_connections"
    WHERE "owner_user_id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Salla Custom OAuth migration precondition failed: store_connections.owner_user_id could not be backfilled for one or more rows; repair merchant ownership before retrying migration';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "store_connections" AS sc
    LEFT JOIN "merchants" AS m ON m."id" = sc."merchant_id"
    LEFT JOIN "users" AS u ON u."id" = sc."owner_user_id"
    WHERE m."id" IS NULL
       OR u."id" IS NULL
       OR m."owner_user_id" <> sc."owner_user_id"
  ) THEN
    RAISE EXCEPTION
      'Salla Custom OAuth migration precondition failed: store connection ownership is orphaned or inconsistent';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "store_connections"
    GROUP BY "platform", "external_store_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Salla Custom OAuth migration precondition failed: duplicate store connection identities exist';
  END IF;
END $$;

ALTER TABLE "store_connections"
ALTER COLUMN "owner_user_id" SET NOT NULL;

CREATE INDEX "store_connections_owner_user_id_platform_idx"
ON "store_connections"("owner_user_id", "platform");

ALTER TABLE "store_connections"
ADD CONSTRAINT "store_connections_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "SallaConnectionIntentStatus" AS ENUM ('INITIATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

ALTER TABLE "salla_connection_intents"
ADD COLUMN "initiated_by_user_id" TEXT,
ADD COLUMN "state_hash" TEXT,
ADD COLUMN "active_intent_key" TEXT,
ADD COLUMN "status" "SallaConnectionIntentStatus" NOT NULL DEFAULT 'INITIATED',
ADD COLUMN "consumed_at" TIMESTAMP(3),
ADD COLUMN "failed_at" TIMESTAMP(3),
ADD COLUMN "failure_code" TEXT,
ADD COLUMN "connection_id" TEXT;

UPDATE "salla_connection_intents" AS sci
SET "initiated_by_user_id" = m."owner_user_id"
FROM "merchants" AS m
WHERE m."id" = sci."merchant_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "salla_connection_intents"
    WHERE "initiated_by_user_id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Salla Custom OAuth migration precondition failed: salla_connection_intents.initiated_by_user_id could not be backfilled for one or more rows; repair merchant ownership before retrying migration';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "salla_connection_intents" AS sci
    LEFT JOIN "merchants" AS m ON m."id" = sci."merchant_id"
    LEFT JOIN "users" AS u ON u."id" = sci."initiated_by_user_id"
    WHERE m."id" IS NULL OR u."id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Salla Custom OAuth migration precondition failed: connection intent ownership is orphaned';
  END IF;
END $$;

ALTER TABLE "salla_connection_intents"
ALTER COLUMN "initiated_by_user_id" SET NOT NULL,
ALTER COLUMN "expected_store_domain" DROP NOT NULL;

UPDATE "salla_connection_intents"
SET "status" = 'COMPLETED'
WHERE "completed_at" IS NOT NULL;

-- Preserve incomplete legacy intents while only expiring those whose OAuth window ended.
UPDATE "salla_connection_intents"
SET "status" = 'EXPIRED',
    "failure_code" = 'legacy_intent_migrated',
    "failed_at" = COALESCE("failed_at", NOW())
WHERE "completed_at" IS NULL
  AND "expires_at" <= NOW();

-- Only the newest unexpired row per user with a usable state receives the
-- unique active key; legacy rows without state hashes remain recoverable but
-- are not made active implicitly.
WITH newest_active AS (
  SELECT DISTINCT ON ("initiated_by_user_id") "id", "initiated_by_user_id"
  FROM "salla_connection_intents"
   WHERE "status" IN ('INITIATED', 'PENDING', 'PROCESSING')
     AND "expires_at" > NOW()
     AND "state_hash" IS NOT NULL
  ORDER BY "initiated_by_user_id", "created_at" DESC
)
UPDATE "salla_connection_intents" AS sci
SET "active_intent_key" = newest."initiated_by_user_id"
FROM newest_active AS newest
WHERE sci."id" = newest."id";

CREATE UNIQUE INDEX "salla_connection_intents_state_hash_key"
ON "salla_connection_intents"("state_hash");

CREATE UNIQUE INDEX "salla_connection_intents_active_intent_key_key"
ON "salla_connection_intents"("active_intent_key");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "sync_runs" AS sr
    LEFT JOIN "store_connections" AS sc ON sc."id" = sr."connection_id"
    WHERE sc."id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Salla Custom OAuth migration precondition failed: orphaned sync runs exist';
  END IF;
END $$;

CREATE INDEX "salla_connection_intents_initiated_by_user_id_created_at_idx"
ON "salla_connection_intents"("initiated_by_user_id", "created_at");

CREATE INDEX "salla_connection_intents_connection_id_idx"
ON "salla_connection_intents"("connection_id");

ALTER TABLE "salla_connection_intents"
ADD CONSTRAINT "salla_connection_intents_initiated_by_user_id_fkey"
FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "salla_connection_intents_connection_id_fkey"
FOREIGN KEY ("connection_id") REFERENCES "store_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sync_runs"
ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "sync_runs_dedupe_key_key"
ON "sync_runs"("dedupe_key");
