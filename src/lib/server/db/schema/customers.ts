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
    /** Multi-line address block used verbatim in the invoice Doc template. */
    addressBlock: text("address_block"),
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
