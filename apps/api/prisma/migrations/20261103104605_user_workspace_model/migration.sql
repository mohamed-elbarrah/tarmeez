-- Add the new account/workspace model while preserving existing auth accounts,
-- OTPs, and refresh sessions. Existing merchant account IDs are retained as
-- user IDs; each non-admin account receives a workspace with the same ID.

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'VIEWER');

ALTER TABLE "email_otps" DROP CONSTRAINT "email_otps_merchant_id_fkey";
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_merchant_id_fkey";

DROP INDEX "email_otps_merchant_id_purpose_key";
DROP INDEX "merchants_email_key";
DROP INDEX "refresh_tokens_merchant_id_revoked_at_idx";

ALTER INDEX "merchants_pkey" RENAME TO "legacy_merchant_accounts_pkey";
ALTER TABLE "merchants" RENAME TO "legacy_merchant_accounts";

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MERCHANT',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

INSERT INTO "users" (
    "id", "email", "name", "password_hash", "role", "status",
    "email_verified_at", "created_at", "updated_at"
)
SELECT
    "id", "email", "name", "password_hash", "role",
    "status"::text::"UserStatus", "email_verified_at", "created_at", "updated_at"
FROM "legacy_merchant_accounts";

CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

INSERT INTO "merchants" (
    "id", "owner_user_id", "name", "status", "created_at", "updated_at"
)
SELECT
    "id", "id", "name", "status", "created_at", "updated_at"
FROM "legacy_merchant_accounts"
WHERE "role" = 'MERCHANT';

CREATE TABLE "merchant_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_memberships_pkey" PRIMARY KEY ("id")
);

INSERT INTO "merchant_memberships" (
    "id", "user_id", "merchant_id", "role", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text, "id", "id", 'OWNER', "created_at", "updated_at"
FROM "legacy_merchant_accounts"
WHERE "role" = 'MERCHANT';

CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'VIEWER',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "email_otps" RENAME COLUMN "merchant_id" TO "user_id";
ALTER TABLE "refresh_tokens" RENAME COLUMN "merchant_id" TO "user_id";

DROP TABLE "legacy_merchant_accounts";

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "merchants_owner_user_id_key" ON "merchants"("owner_user_id");
CREATE UNIQUE INDEX "merchant_memberships_user_id_key" ON "merchant_memberships"("user_id");
CREATE UNIQUE INDEX "merchant_memberships_merchant_id_user_id_key" ON "merchant_memberships"("merchant_id", "user_id");
CREATE INDEX "merchant_memberships_merchant_id_role_idx" ON "merchant_memberships"("merchant_id", "role");
CREATE UNIQUE INDEX "invitations_email_key" ON "invitations"("email");
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "invitations_merchant_id_expires_at_idx" ON "invitations"("merchant_id", "expires_at");
CREATE INDEX "invitations_invited_by_user_id_idx" ON "invitations"("invited_by_user_id");
CREATE UNIQUE INDEX "email_otps_user_id_purpose_key" ON "email_otps"("user_id", "purpose");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

ALTER TABLE "merchants"
    ADD CONSTRAINT "merchants_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "merchant_memberships"
    ADD CONSTRAINT "merchant_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "merchant_memberships"
    ADD CONSTRAINT "merchant_memberships_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations"
    ADD CONSTRAINT "invitations_merchant_id_fkey"
    FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations"
    ADD CONSTRAINT "invitations_invited_by_user_id_fkey"
    FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_otps"
    ADD CONSTRAINT "email_otps_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
