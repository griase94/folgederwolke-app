/**
 * Invoices (Ausgangsrechnungen) — invoices the Verein issues to Kunden.
 *
 * Applies ADRs 0001, 0002, 0003, 0006, 0010, 0012.
 *
 * Differs from income in that the invoice is the legal artifact (PDF stored
 * in Drive). The corresponding payment receipt is a separate income row,
 * linked via `paid_by_income_id` for reconciliation.
 *
 * `drive_doc_id` / `drive_pdf_id` track the Google Doc copy + exported PDF
 * (per §6.3-6.4). `pdf_status` reflects the async generation pipeline.
 */
// TODO multi-tenant: add verein_id

import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  customType,
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

/** Postgres bytea column ↔ Node Buffer mapping (drizzle has no native bytea). */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});
import { customers } from "./customers.js";
import { pdfStatusEnum, sourceKindEnum, sphereEnum } from "./enums.js";
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

    // --- Drive (Doc + PDF) per §6.3 ---
    driveDocId: text("drive_doc_id"),
    drivePdfFileId: text("drive_pdf_file_id"),
    pdfStatus: pdfStatusEnum("pdf_status").notNull().default("not_generated"),
    pdfStatusError: text("pdf_status_error"),

    // --- Drive-failure resilience (Phase 5) ---
    /** Raw PDF bytes — populated when pdf-lib renders. Persists even if
     *  Drive upload fails so admins can still download from the app. */
    pdfBytes: bytea("pdf_bytes"),
    /** Drive sync state: 'pending' | 'uploaded' | 'failed' | 'skipped' — null
     *  while no PDF has been generated. */
    driveStatus: text("drive_status"),

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
    driveStatusIdx: index("invoices_drive_status_idx").on(t.driveStatus),
    rechnungsdatumIdx: index("invoices_rechnungsdatum_idx").on(
      t.rechnungsdatum,
    ),
  }),
);
