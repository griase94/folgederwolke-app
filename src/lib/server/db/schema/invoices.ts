/**
 * Invoices (Ausgangsrechnungen) — invoices the Verein issues to Kunden.
 *
 * Applies ADRs 0001, 0002, 0003, 0006, 0010, 0012.
 *
 * Differs from income in that the invoice is the legal artifact (PDF stored
 * in Vercel Blob via the Phase 9 `files` table). The corresponding payment
 * receipt is a separate income row, linked via `paid_by_income_id` for
 * reconciliation.
 *
 * `pdf_file_id` is the FK to the canonical PDF in `files`; `pdf_status`
 * reflects the async generation pipeline (queued → running → generated, or
 * failed with a non-null `pdf_status_error`).
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

import { customers } from "./customers.js";
import { pdfStatusEnum, sourceKindEnum, sphereEnum } from "./enums.js";
import { files } from "./files.js";
import { kategorien } from "./kategorien.js";
import { projects } from "./projects.js";
import { users } from "./users.js";

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // --- ADR-0010 + ADR-0012 ---
    /** Invoice number = business_id (FDW-2026-001 style). */
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

    // --- Invoice meta ---
    rechnungsdatum: date("rechnungsdatum").notNull(),
    leistungsDatum: date("leistungs_datum"),
    faelligkeitsDatum: date("faelligkeits_datum"),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    /** Customer-name snapshot at issue (immutable — Customer renames don't rewrite history). */
    customerNameSnapshot: text("customer_name_snapshot").notNull(),
    customerAddressSnapshot: text("customer_address_snapshot"),

    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    // --- Money (ADR-0003) ---
    nettoCents: bigint("netto_cents", { mode: "bigint" }).notNull(),
    nettoEur: numeric("netto_eur", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`(netto_cents::numeric / 100)`),
    /** Kleinunternehmer §19 UStG — keep ust_cents=0 by convention. */
    ustCents: bigint("ust_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    bruttoCents: bigint("brutto_cents", { mode: "bigint" }).notNull(),
    bruttoEur: numeric("brutto_eur", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`(brutto_cents::numeric / 100)`),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),

    // --- Kategorie + sphere snapshot ---
    kategorieId: uuid("kategorie_id").references(() => kategorien.id, {
      onDelete: "restrict",
    }),
    kategorieNameSnapshot: text("kategorie_name_snapshot").notNull(),
    sphereSnapshot: sphereEnum("sphere_snapshot").notNull(),

    // --- Body ---
    bezeichnung: text("bezeichnung").notNull(),
    leistungsBeschreibung: text("leistungs_beschreibung"),
    /**
     * Leistungszeitraum per § 14 Abs. 4 Nr. 6 UStG. Required on every invoice.
     * Always the compact month now (Andy-Feedback 2026-07) — e.g. "Februar 2026",
     * derived by the form from the mandatory Leistungsdatum. DB enforces NOT NULL
     * + length ≥ 3.
     */
    leistungszeitraum: text("leistungszeitraum").notNull(),

    // --- PDF persistence (Phase 11 — Vercel Blob via files table) ---
    pdfStatus: pdfStatusEnum("pdf_status").notNull().default("not_generated"),
    pdfStatusError: text("pdf_status_error"),
    /** FK to files.id holding the canonical rendered PDF. NULL while
     *  queued/generating; set inside finalizePdfJob after the blob upload +
     *  files INSERT succeed. */
    pdfFileId: uuid("pdf_file_id").references(() => files.id, {
      onDelete: "restrict",
    }),

    // --- Payment reconciliation ---
    paidByIncomeId: uuid("paid_by_income_id"),
    bezahltAm: date("bezahlt_am"),

    // --- ADR-0006 Festschreibung ---
    festgeschriebenAt: timestamp("festgeschrieben_at", { withTimezone: true }),
    festgeschriebenByUserId: uuid("festgeschrieben_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => invoices.id,
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
    businessIdUq: uniqueIndex("invoices_business_id_uq").on(t.businessId),
    yearOfBuchungIdx: index("invoices_year_of_buchung_idx").on(t.yearOfBuchung),
    customerIdIdx: index("invoices_customer_id_idx").on(t.customerId),
    projectIdIdx: index("invoices_project_id_idx").on(t.projectId),
    pdfStatusIdx: index("invoices_pdf_status_idx").on(t.pdfStatus),
    pdfFileIdIdx: index("invoices_pdf_file_id_idx").on(t.pdfFileId),
    rechnungsdatumIdx: index("invoices_rechnungsdatum_idx").on(
      t.rechnungsdatum,
    ),
  }),
);
