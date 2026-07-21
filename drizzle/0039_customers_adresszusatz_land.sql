ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "adresszusatz" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "land" text DEFAULT 'Deutschland';