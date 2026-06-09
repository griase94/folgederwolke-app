ALTER TABLE "auslagen_submissions" ADD COLUMN "submission_nonce" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "auslagen_submissions_submission_nonce_uq" ON "auslagen_submissions" USING btree ("submission_nonce") WHERE submission_nonce IS NOT NULL;
