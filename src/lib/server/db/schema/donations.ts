/**
 * Spenden — donations with Bescheinigungs-Nr (D10: `B-{YYYY}-{NNN}`).
 *
 * Applies ADRs 0001, 0002, 0003, 0006, 0010, 0012.
 *
 * Aufwandsspende fields are present but UI is gated behind a future flag
 * (D9 — Aufwandsspende deferred to Phase 2). The columns ship now so that
 * the importer (Phase 6) can hydrate them from legacy data even if the
 * admin UI doesn't expose them in v1.
 *
 * `bescheinigung_nr` is the Finanzamt-Bescheinigungs-Nr — also a
 * `<PREFIX>-<YYYY>-<NNN>` style ID using prefix `B`. Format CHECK is
 * applied in the hand-written SQL migration alongside the business_id one.
 */
// TODO multi-tenant: add verein_id

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import {
  bescheidTypEnum,
  sourceKindEnum,
  spendeKindEnum,
  sphereEnum,
  wertermittlungMethodeEnum,
  zweckbindungKindEnum,
} from "./enums.js";
import { expenses } from "./expenses.js";
import { files } from "./files.js";
import { kategorien } from "./kategorien.js";
import { members } from "./members.js";
import { projects } from "./projects.js";
import { users } from "./users.js";

export const donations = pgTable(
  "donations",
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
    zugewendetAm: date("zugewendet_am"),

    // --- ADR-0003 ---
    betragCents: bigint("betrag_cents", { mode: "bigint" }).notNull(),
    betragEur: numeric("betrag_eur", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`(betrag_cents::numeric / 100)`),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),

    // --- Spender (member OR free-text) ---
    memberId: uuid("member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    spenderName: text("spender_name"),
    spenderAdresse: text("spender_adresse"),
    spenderEmail: text("spender_email"),

    // --- Spende kind + zweckbindung ---
    spendeKind: spendeKindEnum("spende_kind").notNull().default("geldspende"),
    zweckbindungKind: zweckbindungKindEnum("zweckbindung_kind")
      .notNull()
      .default("zweckfrei"),
    zweckbindungText: text("zweckbindung_text"),

    // --- Kategorie + sphere snapshots (ADR-0002) ---
    kategorieId: uuid("kategorie_id")
      .notNull()
      .references(() => kategorien.id, {
        onDelete: "restrict",
      }),
    kategorieNameSnapshot: text("kategorie_name_snapshot").notNull(),
    sphereSnapshot: sphereEnum("sphere_snapshot").notNull().default("ideeller"),

    // --- Project link (optional, e.g. zweckgebundene Spende für Projekt X) ---
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    // --- Bescheinigung (D10) ---
    bescheinigungNr: text("bescheinigung_nr"),
    bescheinigungAusgestelltAm: date("bescheinigung_ausgestellt_am"),
    bescheinigungAusgestelltVonUserId: uuid(
      "bescheinigung_ausgestellt_von_user_id",
    ).references(() => users.id, { onDelete: "set null" }),
    bescheinigungPdfDriveFileId: text("bescheinigung_pdf_drive_file_id"),
    bescheidTyp: bescheidTypEnum("bescheid_typ"),

    // --- Phase 9: FK to normalized `files` table (Drive → Blob migration) ---
    belegFileId: uuid("beleg_file_id").references(() => files.id, {
      onDelete: "restrict",
    }),
    bescheinigungFileId: uuid("bescheinigung_file_id").references(
      () => files.id,
      { onDelete: "restrict" },
    ),

    // --- Aufwandsspende (D9 — schema only, UI deferred to Phase 2) ---
    /**
     * If this is an Aufwandsspende, the originating expense whose Erstattung
     * the member waived. NULL for Geld/Sachspende.
     */
    aufwandsspendeAusExpenseId: uuid(
      "aufwandsspende_aus_expense_id",
    ).references((): AnyPgColumn => expenses.id, { onDelete: "set null" }),
    aufwandsspendeVerzichtDatum: date("aufwandsspende_verzicht_datum"),
    /** Version-stamped BMF-compliant consent text the member actually agreed to. */
    aufwandsspendeVerzichtTextSnapshot: text(
      "aufwandsspende_verzicht_text_snapshot",
    ),

    // --- SPEC-02 Sachspende Wertermittlung (additive, migration 0029) ---
    wertermittlungMethode: wertermittlungMethodeEnum("wertermittlung_methode"),
    zustandBeschreibung: text("zustand_beschreibung"),
    herkunftsbelegFileId: uuid("herkunftsbeleg_file_id").references(
      () => files.id,
      { onDelete: "restrict" },
    ),
    /**
     * false = Privatvermögen (default), true = aus Betriebsvermögen — flag for
     * the Zuwendungsbestätigung legal-text branch (SPEC-02). Flag only.
     */
    betriebsvermoegen: boolean("betriebsvermoegen").notNull().default(false),

    // --- ADR-0006 Festschreibung ---
    festgeschriebenAt: timestamp("festgeschrieben_at", { withTimezone: true }),
    festgeschriebenByUserId: uuid("festgeschrieben_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => donations.id,
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
    businessIdUq: uniqueIndex("donations_business_id_uq").on(t.businessId),
    bescheinigungNrUq: uniqueIndex("donations_bescheinigung_nr_uq")
      .on(t.bescheinigungNr)
      .where(sql`bescheinigung_nr IS NOT NULL`),
    yearOfBuchungIdx: index("donations_year_of_buchung_idx").on(
      t.yearOfBuchung,
    ),
    memberIdIdx: index("donations_member_id_idx").on(t.memberId),
    projectIdIdx: index("donations_project_id_idx").on(t.projectId),
    gebuchtAmIdx: index("donations_gebucht_am_idx").on(t.gebuchtAm),
  }),
);
