/**
 * Public-form submissions before audit-inbox approval converts them into
 * an `expenses` row.
 *
 * The public form (Phase 2, `/auslage`) writes here. Admin "audit inbox"
 * (Phase 4) reviews, approves, and on approve creates an `expenses` row
 * linked via `expenses.source = 'form' + expenses.source_ref = submission.business_id`.
 *
 * Stores the same `bezahlt_von` discriminated union as expenses (ADR-0007)
 * so admins don't have to re-enter member/extern info on approve.
 *
 * Receipt file lands in Drive `_incoming/`; admin move-to-Belege/<year>/
 * happens on approve.
 */
// TODO multi-tenant: add verein_id

import {
  bigint,
  char,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bezahltVonKindEnum } from "./enums.js";
import { expenses } from "./expenses.js";
import { files } from "./files.js";
import { members } from "./members.js";
import { projects } from "./projects.js";
import { users } from "./users.js";

export const auslagenSubmissions = pgTable(
  "auslagen_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** AUS-{YYYY}-{NNN} business_id. */
    businessId: text("business_id").notNull(),

    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    bezeichnung: text("bezeichnung").notNull(),
    kommentar: text("kommentar"),
    rechnungsdatum: date("rechnungsdatum"),
    betragCents: bigint("betrag_cents", { mode: "bigint" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),

    /** Free-form Wofür string (legacy form's "Wofür war die Ausgabe"). */
    wofuer: text("wofuer"),

    // --- bezahlt_von discriminated union (ADR-0007 mirror) ---
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
    bezahltVonDisplay: text("bezahlt_von_display").notNull(),

    // --- Beleg uploaded to _incoming/ ---
    belegDriveFileId: text("beleg_drive_file_id"),
    belegOriginalName: text("beleg_original_name"),
    // --- Phase 9: FK to normalized `files` table ---
    belegFileId: uuid("beleg_file_id").references(() => files.id, {
      onDelete: "restrict",
    }),

    // --- Audit-inbox state ---
    /** NULL = open in inbox, set when approved or rejected. */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** 'approved' | 'rejected' (text, not enum — only two values and easy to extend). */
    decision: text("decision"),
    // FK added in migration 0010 (schema review HIGH-F3 — was a bare uuid
    // with no constraint). ON DELETE RESTRICT so a user delete doesn't leave
    // an unattributed decision row.
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    decisionReason: text("decision_reason"),
    /**
     * Optional project this submission belongs to (Night-2 C1-PRJ-B/C).
     * Additive, NULL allowed — backfill is manual via UI / Night 3+ batch.
     * ON DELETE SET NULL: deleting the project nulls this FK, it does NOT
     * cascade-delete the submission.
     */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /** If approved, link to the created expense row. */
    approvedExpenseId: uuid("approved_expense_id").references(
      () => expenses.id,
      { onDelete: "restrict" },
    ),
    /**
     * When admin first viewed/opened this submission in the audit inbox
     * (Phase 4). Used to highlight unread items.
     */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    /** IP/UA fingerprint for abuse-tracking (no full IP stored). */
    submitterIpPrefix: text("submitter_ip_prefix"),
    submitterUaHash: text("submitter_ua_hash"),

    // --- DSGVO consent (Phase 2 hardening) ---
    /**
     * Snapshot of DATENSCHUTZ_VERSION the submitter agreed to. Stored so
     * auditors can reconstruct exactly which legal text applied.
     */
    consentTextVersion: text("consent_text_version").notNull(),
    /** Server-side timestamp of when the consent checkbox was submitted. */
    consentGivenAt: timestamp("consent_given_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    businessIdUq: uniqueIndex("auslagen_submissions_business_id_uq").on(
      t.businessId,
    ),
    decidedAtIdx: index("auslagen_submissions_decided_at_idx").on(t.decidedAt),
    submittedAtIdx: index("auslagen_submissions_submitted_at_idx").on(
      t.submittedAt,
    ),
    projectIdIdx: index("auslagen_submissions_project_id_idx").on(t.projectId),
  }),
);
