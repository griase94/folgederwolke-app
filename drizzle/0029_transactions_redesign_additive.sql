CREATE TYPE "wertermittlung_methode" AS ENUM ('marktpreis', 'kaufbeleg', 'schaetzung', 'buchwert');--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "wertermittlung_methode" "wertermittlung_methode";--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "zustand_beschreibung" text;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "herkunftsbeleg_file_id" uuid REFERENCES "files"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "betriebsvermoegen" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "beleg_verzicht_grund" text;
