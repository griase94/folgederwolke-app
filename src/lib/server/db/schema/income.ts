/**
 * Einnahmen — symmetric to expenses but no bezahlt_von / Erstattung flow.
 *
 * Applies ADRs 0001, 0002, 0003, 0006, 0010, 0012.
 */
// TODO multi-tenant: add verein_id

import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sourceKindEnum, sphereEnum } from "./enums.js";
import { kategorien } from "./kategorien.js";
import { projects } from "./projects.js";
import { users } from "./users.js";
import { zahlungsarten } from "./zahlungsarten.js";

export const income = pgTable(
  "income",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // --- ADR-0010 + ADR-0012 ---
    businessId: text("business_id").notNull(),
    source: sourceKindEnum("source").notNull().default("app"),
    sourceRef: text("source_ref"),

    // --- ADR-0001 ---
    gebuchtAm: timestamp("gebucht_am", { withTimezone: true })
      .notNull()
      .defaultNow(),
    yearOfBuchung: integer("year_of_buchung").generatedAlwaysAs(
      sql`year_for_booking(gebucht_am)`,
    ),

    // --- Domain dates ---
    geldEingangDatum: date("geld_eingang_datum"),
    rechnungsdatum: date("rechnungsdatum"),

    // --- ADR-0003 ---
    betragCents: bigint("betrag_cents", { mode: "bigint" }).notNull(),
    betragEur: numeric("betrag_eur", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`(betrag_cents::numeric / 100)`),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),

    // --- Domain text ---
    bezeichnung: text("bezeichnung").notNull(),
    kommentar: text("kommentar"),

    // --- ADR-0002 ---
    kategorieId: uuid("kategorie_id").references(() => kategorien.id, {
      onDelete: "restrict",
    }),
    kategorieNameSnapshot: text("kategorie_name_snapshot").notNull(),
    sphereSnapshot: sphereEnum("sphere_snapshot").notNull(),

    // --- Project / Zahlungsart links ---
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    zahlungsartId: uuid("zahlungsart_id").references(() => zahlungsarten.id, {
      onDelete: "set null",
    }),

    // --- Beleg ---
    belegDriveFileId: text("beleg_drive_file_id"),
    belegOriginalName: text("beleg_original_name"),

    // --- ADR-0006 Festschreibung mixin ---
    festgeschriebenAt: timestamp("festgeschrieben_at", { withTimezone: true }),
    festgeschriebenByUserId: uuid("festgeschrieben_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => income.id,
      {
        onDelete: "set null",
      },
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    businessIdUq: uniqueIndex("income_business_id_uq").on(t.businessId),
    yearOfBuchungIdx: index("income_year_of_buchung_idx").on(t.yearOfBuchung),
    sphereSnapshotIdx: index("income_sphere_snapshot_idx").on(t.sphereSnapshot),
    kategorieIdIdx: index("income_kategorie_id_idx").on(t.kategorieId),
    projectIdIdx: index("income_project_id_idx").on(t.projectId),
    gebuchtAmIdx: index("income_gebucht_am_idx").on(t.gebuchtAm),
  }),
);
