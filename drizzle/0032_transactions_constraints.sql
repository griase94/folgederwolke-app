-- Task-10 (Phase-1 Foundation): the constraint this whole phase prepared for.
--
-- NOT NULL kategorie_id: all four write paths (createExpense/createIncome/
-- createDonation + the approval path) now resolve a non-null kategorie_id
-- (Tasks 6/7/8/9), so this no longer breaks any writer. 0030 wiped any legacy
-- rows that might still carry NULL.
--
-- CHECK constraints encode the domain invariants (spec §4):
--   * expenses_beleg_or_grund_ck: every expense has either a Beleg
--     (beleg_file_id) OR a Belegverzicht-Begründung (beleg_verzicht_grund).
--   * donations_zweckbindung_text_ck: a zweckgebundene Spende must carry the
--     Zweckbindungstext; zweckfreie Spenden need none.
--   * donations_sachspende_wertermittlung_ck: a Sachspende must carry both a
--     Wertermittlungs-Methode and a Zustandsbeschreibung; non-Sachspenden
--     (Geld-/Aufwandsspende) need neither.
ALTER TABLE "expenses"  ALTER COLUMN "kategorie_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "income"    ALTER COLUMN "kategorie_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ALTER COLUMN "kategorie_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses"  ADD CONSTRAINT "expenses_beleg_or_grund_ck"
  CHECK ("beleg_file_id" IS NOT NULL OR "beleg_verzicht_grund" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_zweckbindung_text_ck"
  CHECK ("zweckbindung_kind" = 'zweckfrei' OR "zweckbindung_text" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_sachspende_wertermittlung_ck"
  CHECK ("spende_kind" <> 'sachspende' OR ("wertermittlung_methode" IS NOT NULL AND "zustand_beschreibung" IS NOT NULL));
