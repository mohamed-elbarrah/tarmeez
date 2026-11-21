ALTER TYPE "SallaConnectionIntentStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "salla_connection_intents"
ADD COLUMN "cancelled_at" TIMESTAMP(3);
