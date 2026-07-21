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
     */
    strasse: text("strasse"),
    plz: text("plz"),
    ort: text("ort"),
    /**
     * Legacy free-text address block. Superseded by strasse/plz/ort — kept
     * (additive migration) so the seed can split existing values; new code
     * assembles the invoice snapshot from the structured fields instead.
     */
    addressBlock: text("address_block"),
    /**
     * ISO 3166-1 alpha-2 country code. Default 'DE'.
     * The Rechnung v2 renderer renders the Land line below PLZ Ort ONLY
     * when this is not 'DE' (German customers don't get a redundant
     * "Deutschland" line).
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
