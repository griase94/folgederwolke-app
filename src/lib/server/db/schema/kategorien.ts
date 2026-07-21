/**
 * Kategorien — 35 Ausgaben (13 ideeller + 19 zweckbetrieb + 3 wirtschaftlich)
 * + 15 Einnahmen, all from legacy `apps-script/config.ts`.
 *
 * Columns per masterplan §4.2:
 *   - `sphere` — default steuerliche Sphäre (overridable per ADR-0008 + ADR-0011)
 *   - `eur_zeile` — Anlage-EÜR field number (null where ELSTER doesn't map a line)
 *   - `anlage_gem_zeile` — Anlage Gem (Gemeinnützigkeit) field number, also nullable
 *
 * Legacy stored these as 2-column dropdowns (Kategorie → Sphäre) on the
 * Stammdaten tab; the EÜR/Anlage-Gem mappings were NOT in legacy code (manual
 * ELSTER entry by Steuerberater:in). v1 seeds null and lets Phase 6 importer +
 * Steuerberater fill in the actual line numbers via a follow-up settings UI.
 */
// TODO multi-tenant: add verein_id

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sphereEnum } from "./enums.js";

/**
 * `kind`: 'expense' or 'income' — needed because both lists share the same
 * table (no point in two near-identical tables, and a single FK target from
 * expenses + income simplifies the model).
 */
export const kategorien = pgTable(
  "kategorien",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'expense' or 'income' (literal text, not an enum, to keep it open). */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    sphere: sphereEnum("sphere").notNull(),
    /** Anlage EÜR field number (e.g. 17 for Bürobedarf). Nullable when ambiguous. */
    eurZeile: integer("eur_zeile"),
    /** Anlage Gem field number (Gemeinnützigkeitserklärung). */
    anlageGemZeile: integer("anlage_gem_zeile"),
    /** Hidden from dropdowns but kept for legacy parity (referenced by old rows). */
    deactivated: boolean("deactivated").notNull().default(false),
    /**
     * Rechnungsfähig (Andy-Feedback 2026-07): whether this Kategorie may be
     * chosen when issuing an outgoing Rechnung. Only INCOME Kategorien that
     * represent an invoiceable Leistung are true (Honorar, Kuratierung,
     * Sponsoring m. Gegenleistung, Workshop, Vermietung Technik, Dienstleistung,
     * the Sonstige-WGB/Zweckbetrieb catch-alls). Donations, grants, member fees,
     * interest, cash-desk revenue (Bar/Garderobe/Eintritt/Merch) are false — they
     * are never invoiced. Expense Kategorien stay false. The invoice form filters
     * its Kategorie list on this flag (server-side); id-stable so it survives the
     * later name→id refactor (#115).
     */
    rechnungsfaehig: boolean("rechnungsfaehig").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    kindNameUq: uniqueIndex("kategorien_kind_name_uq").on(t.kind, t.name),
    sphereIdx: index("kategorien_sphere_idx").on(t.sphere),
  }),
);
