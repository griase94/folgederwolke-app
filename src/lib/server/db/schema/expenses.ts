/**
 * Expenses (Ausgaben) — the highest-traffic GoBD-relevant table.
 *
 * Applies ADRs 0001, 0002, 0003, 0006, 0007, 0008, 0010, 0012 in one place.
 *
 * - ADR-0001: `gebucht_am timestamptz NOT NULL DEFAULT now()`; `year_of_buchung`
 *   is a STORED generated column computed by `year_for_booking(gebucht_am)`
 *   (hand-written in `drizzle/sql/functions/year_for_booking.sql`; the migration
 *   appends `GENERATED ALWAYS AS (year_for_booking(gebucht_am)) STORED`).
 * - ADR-0002: `sphere_snapshot`, `kategorie_name_snapshot` immutable at write
 *   time. FK to kategorie retained for live-rename lookup only.
 * - ADR-0003: `betrag_cents bigint NOT NULL`; STORED generated `betrag_eur`.
 *   The generated-column SQL is appended in the hand-written migration.
 * - ADR-0006 (Festschreibung mixin): `festgeschrieben_at`,
 *   `festgeschrieben_by_user_id`, `supersedes_id` (self-FK) for Storno chains.
 * - ADR-0007: `bezahlt_von_kind` discriminator + three nullable extern fields +
 *   `bezahlt_von_display` write-time text snapshot.
 * - ADR-0008: `sphere_override` + `sphere_override_reason` for pre-Festschreibung
 *   admin corrections.
 * - ADR-0010: `business_id text NOT NULL UNIQUE`. Format CHECK + year-consistency
 *   CHECK constraints added in the hand-written SQL migration.
 * - ADR-0012: `currency char(3) DEFAULT 'EUR'`, `source` provenance enum.
 *
 * Two-step approve→pay flow (UX review): `approved_at` + `approved_by_user_id`
 * before `erstattet_am`. Partial index `WHERE approved_at IS NOT NULL AND
 * erstattet_am IS NULL` powers the dashboard "Pay 3 approved" query.
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
import {
  bezahltVonKindEnum,
  sourceKindEnum,
  sphereEnum,
  statusEnum,
} from "./enums.js";
import { files } from "./files.js";
import { kategorien } from "./kategorien.js";
import { members } from "./members.js";
import { projects } from "./projects.js";
import { users } from "./users.js";
import { zahlungsarten } from "./zahlungsarten.js";

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // --- ADR-0010 + ADR-0012 ---
    businessId: text("business_id").notNull(),
    source: sourceKindEnum("source").notNull().default("app"),
    sourceRef: text("source_ref"),

    // --- ADR-0001 — booking date + derived year ---
    gebuchtAm: timestamp("gebucht_am", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // STORED generated column — booking year derives from the CASH-flow date
    // (Abfluss per § 11 EStG), falling back to year_for_booking(gebucht_am)
    // when no cash date is recorded yet. `extract(year FROM date)` is IMMUTABLE
    // (the `::timestamptz` form is only STABLE and a STORED generated column
    // rejects it); `year_for_booking()` is the IMMUTABLE Berlin-tz helper in
    // drizzle/sql/functions/year_for_booking.sql. Migration 0034 applies this.
    yearOfBuchung: integer("year_of_buchung").generatedAlwaysAs(
      sql`COALESCE(extract(year FROM abfluss_datum)::int, year_for_booking(gebucht_am))`,
    ),

    // --- Domain dates ---
    /** Rechnungsdatum (Belegdatum) — date the receipt was issued. */
    rechnungsdatum: date("rechnungsdatum"),
    /**
     * Geldfluss-Datum / Abfluss — date the money actually moved.
     * C2-TAX (cycle 2): the admin direct path now requires this field on
     * kind=ausgabe per EÜR §11 EStG. No new column added — the existing
     * `abfluss_datum` column already carries this semantic (the original
     * migration 0018 that added a parallel `geldfluss_datum` was reverted
     * after julia-buchhaltung flagged the duplicate; see PR #74 review).
     */
    abflussDatum: date("abfluss_datum"),

    // --- ADR-0003 — cents storage ---
    betragCents: bigint("betrag_cents", { mode: "bigint" }).notNull(),
    betragEur: numeric("betrag_eur", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`(betrag_cents::numeric / 100)`),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),

    // --- Domain text ---
    bezeichnung: text("bezeichnung").notNull(),
    kommentar: text("kommentar"),

    // --- ADR-0002 — sphere + kategorie snapshots + live FK ---
    kategorieId: uuid("kategorie_id")
      .notNull()
      .references(() => kategorien.id, {
        onDelete: "restrict",
      }),
    kategorieNameSnapshot: text("kategorie_name_snapshot").notNull(),
    sphereSnapshot: sphereEnum("sphere_snapshot").notNull(),

    // --- ADR-0008 — pre-Festschreibung sphere override ---
    sphereOverride: sphereEnum("sphere_override"),
    sphereOverrideReason: text("sphere_override_reason"),

    // --- Project / Zahlungsart links ---
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    zahlungsartId: uuid("zahlungsart_id").references(() => zahlungsarten.id, {
      onDelete: "set null",
    }),

    // --- ADR-0007 — bezahlt_von discriminated union ---
    bezahltVonKind: bezahltVonKindEnum("bezahlt_von_kind").notNull(),
    bezahltVonMemberId: uuid("bezahlt_von_member_id").references(
      () => members.id,
      {
        onDelete: "set null",
      },
    ),
    externName: text("extern_name"),
    externIban: text("extern_iban"),
    externEmail: text("extern_email"),
    /** Write-time snapshot of the human label ("Verein", "Maria K.", "Extern: ..."). */
    bezahltVonDisplay: text("bezahlt_von_display").notNull(),

    // --- Optional invoice link (rechnungs-empfänger for Eingangsrechnung). */
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),

    // --- Beleg (file storage) ---
    belegDriveFileId: text("beleg_drive_file_id"),
    belegOriginalName: text("beleg_original_name"),
    // --- Phase 9: FK to normalized `files` table (Drive → Blob migration) ---
    belegFileId: uuid("beleg_file_id").references(() => files.id, {
      onDelete: "restrict",
    }),
    /**
     * Free-text reason a Beleg is absent (Eigenbeleg / Belegverzicht), additive
     * via migration 0029. NULL when a Beleg is present.
     */
    belegVerzichtGrund: text("beleg_verzicht_grund"),

    // --- Workflow status (Inbox → Geprüft → Erstattet) ---
    status: statusEnum("status").notNull().default("zu_pruefen"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedByUserId: uuid("rejected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    rejectedReason: text("rejected_reason"),
    erstattetAm: date("erstattet_am"),

    // --- ADR-0006 — Festschreibung mixin ---
    festgeschriebenAt: timestamp("festgeschrieben_at", { withTimezone: true }),
    festgeschriebenByUserId: uuid("festgeschrieben_by_user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => expenses.id,
      {
        onDelete: "set null",
      },
    ),

    // --- Provenance + housekeeping ---
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
    businessIdUq: uniqueIndex("expenses_business_id_uq").on(t.businessId),
    statusIdx: index("expenses_status_idx").on(t.status),
    yearOfBuchungIdx: index("expenses_year_of_buchung_idx").on(t.yearOfBuchung),
    sphereSnapshotIdx: index("expenses_sphere_snapshot_idx").on(
      t.sphereSnapshot,
    ),
    kategorieIdIdx: index("expenses_kategorie_id_idx").on(t.kategorieId),
    projectIdIdx: index("expenses_project_id_idx").on(t.projectId),
    bezahltVonMemberIdx: index("expenses_bezahlt_von_member_idx").on(
      t.bezahltVonMemberId,
    ),
    gebuchtAmIdx: index("expenses_gebucht_am_idx").on(t.gebuchtAm),
    // Partial "Pay 3 approved" index added via hand-written SQL.
  }),
);
