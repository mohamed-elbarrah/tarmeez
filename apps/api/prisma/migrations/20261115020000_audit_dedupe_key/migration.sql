ALTER TABLE "audit_logs"
ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "audit_logs_dedupe_key_key"
ON "audit_logs"("dedupe_key");
