ALTER TABLE "email_otps" ADD COLUMN "invitation_id" TEXT;

CREATE INDEX "email_otps_invitation_id_idx" ON "email_otps"("invitation_id");

ALTER TABLE "email_otps"
    ADD CONSTRAINT "email_otps_invitation_id_fkey"
    FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
