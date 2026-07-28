-- Aurora A-flow foundation (M1/M3/M4). All additive + idempotent so a
-- re-applied batch (or a hand-patched DB) cannot wedge the whole transaction.
--
-- M1: auslagen_submissions.submission_group_id — batch grouping (one UUID per
--     multi-Auslage submit; NULL = legacy single-submit / group-of-one).
-- M4: auslagen_submissions.erstattung_iban — member-arm reimbursement IBAN
--     snapshot; workshop reads COALESCE(erstattung_iban, extern_iban, members.iban).
-- M3: users.member_id — links a member_self_service login to its Mitglied row
--     (auto-provisioned on first member sign-in); ON DELETE RESTRICT.

ALTER TABLE "auslagen_submissions" ADD COLUMN IF NOT EXISTS "submission_group_id" uuid;--> statement-breakpoint
ALTER TABLE "auslagen_submissions" ADD COLUMN IF NOT EXISTS "erstattung_iban" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "member_id" uuid;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_member_id_members_id_fk'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_member_id_members_id_fk"
      FOREIGN KEY ("member_id") REFERENCES "public"."members"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auslagen_submissions_submission_group_id_idx" ON "auslagen_submissions" USING btree ("submission_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_member_id_idx" ON "users" USING btree ("member_id");
