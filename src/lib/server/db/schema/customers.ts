/**
 * Kunden (Rechnungs-Empfänger).
 *
 * Single name + address block — legacy stored these on the Kunden sheet with
 * separate columns (Anrede, Vorname, Nachname, Firma, Strasse, PLZ, Ort).
 * Here normalized: `display_name` is what shows on the invoice header line;
 * `address_block` is the multi-line address used by the single-paragraph
 * address block in the Doc template (§6.3).
 */
// TODO multi-tenant: add verein_id

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Display name (Firma OR "Vorname Nachname"). */
    name: text("name").notNull(),
    /** Salutation line ("Liebe Maria", "Sehr geehrte Damen und Herren"). */
    anrede: text("anrede"),
    /**
     * Structured postal address (Andy-Feedback 2026-07). The free-text
     * `address_block` was error-prone; the invoice briefblock snapshot is now
     * assembled from these fields. `strasse` includes the Hausnummer.
     * Nullable at the DB level (additive migration; existing rows may lack
     * them) — mandatory is enforced in the Kunden-Modal + Zod.
     *
     * `adresszusatz` is an optional line (z. Hd. / c/o / Gebäude) that renders
     * BETWEEN the name and the Straße in the Briefblock (DIN 5008). `land` is
     * an optional free-text country line (default "Deutschland"), rendered in
     * the Briefblock ONLY when it differs from "Deutschland" — German inland
     * post carries no country line. `land` supersedes the ISO `country` below
     * (a 20-person Verein doesn't need a country dropdown).
     */
    adresszusatz: text("adresszusatz"),
    strasse: text("strasse"),
    plz: text("plz"),
    ort: text("ort"),
    land: text("land").default("Deutschland"),
    /**
     * Legacy free-text address block. Superseded by strasse/plz/ort — kept
     * (additive migration) so the seed can split existing values; new code
     * assembles the invoice snapshot from the structured fields instead.
     */
    addressBlock: text("address_block"),
    /**
     * Legacy ISO 3166-1 alpha-2 country code (default 'DE'). SUPERSEDED by the
     * free-text `land` above — kept as a vestigial column (additive-only, no
     * destructive drop pre-launch). New code reads/writes `land`; this stays
     * at its 'DE' default and the Rechnung renderer's ISO-country line never
     * fires (the country now renders from the assembled Briefblock instead).
     */
    country: text("country").notNull().default("DE"),
    email: text("email"),
    notes: text("notes"),
    isFixture: boolean("is_fixture").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    nameIdx: index("customers_name_idx").on(t.name),
  }),
);
