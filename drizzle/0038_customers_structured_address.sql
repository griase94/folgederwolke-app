ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "strasse" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "plz" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "ort" text;