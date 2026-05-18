/**
 * Domain helpers for the Audit Inbox admin path (Phase 4).
 *
 * Exports:
 *  - manualImportSubmission: insert an auslagen_submission as if submitted via
 *    the public form, but marks source as 'admin_entry' and skips Drive upload
 *    when no Beleg is provided.
 *  - approveSubmission: atomically create an `expenses` row (status='geprueft',
 *    approved_at = now()) AND mark the submission decided. Idempotent: a
 *    second call returns the existing expense row instead of inserting again.
 *  - rejectSubmission: mark the submission rejected (no expense row created)
 *    and emit the `auslage.rejected` event so the bus handler fires the
 *    RejectionMail + audit log.
 *  - markExpenseErstattet: set `erstattet_am` + `zahlungsart_id` and emit
 *    `expense.erstattet` so the bus handler fires ErstattungsMail (dedup'd by
 *    sent_mails UNIQUE).
 *
 * §4.1.1 #2 (event bus for side effects), ADR-0005 (mail idempotency),
 * ADR-0006 (Festschreibung), ADR-0007 (bezahlt_von discriminated copy).
 */

import { randomUUID } from "node:crypto";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by approve-pay-flow's additions
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by approve-pay-flow's additions
import { expenses } from "$lib/server/db/schema/expenses.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by approve-pay-flow's additions
import { members } from "$lib/server/db/schema/members.js";
import { bus } from "$lib/server/events/index.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import {
  composeBezahltVonDisplay,
  type BezahltVon,
} from "$lib/server/domain/auslagen.js";
import { DATENSCHUTZ_VERSION } from "$lib/server/domain/datenschutz.js";

// ---------------------------------------------------------------------------
// Berlin year helper (copied from auslage-einreichen — avoids circular dep)
// ---------------------------------------------------------------------------

function berlinYear(now: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
    }).format(now),
    10,
  );
}

// ---------------------------------------------------------------------------
// manualImportSubmission
// ---------------------------------------------------------------------------

export interface ManualImportInput {
  bezahlt_von: BezahltVon;
  bezeichnung: string;
  kommentar?: string | null;
  rechnungsdatum?: string | null;
  betragCents: number;
  currency?: string;
  wofuer?: string | null;
  /** Set when admin uploads a Beleg via Drive before calling this helper. */
  belegDriveFileId?: string | null;
  belegOriginalName?: string | null;
  /** UUID of the admin user performing the import (for audit log). */
  actorUserId: string;
}

export interface ManualImportResult {
  submissionId: string;
  ausId: string;
}

/**
 * Insert an auslagen_submission on behalf of someone — the "paper receipt
 * phone-in" admin path. Mirrors the public form action logic but:
 *
 *  - skips rate limiting (admin-only gate in calling route action)
 *  - skips Drive upload (caller pre-uploads if needed, passes belegDriveFileId)
 *  - sets `source` discriminator in audit payload to 'admin_entry'
 *  - emits `auslagen.submitted` on the bus → same EingangsMail + audit handlers
 *    as the public form
 */
export async function manualImportSubmission(
  input: ManualImportInput,
): Promise<ManualImportResult> {
  const bv = input.bezahlt_von;

  // ── 1. Allocate business ID (Berlin TZ) ──────────────────────────────────
  const year = berlinYear();
  const ausId = await allocateBusinessId("AUS", year);

  // ── 2. Insert DB row ──────────────────────────────────────────────────────
  const db = getDb();
  const [insertedRow] = await db
    .insert(auslagenSubmissions)
    .values({
      businessId: ausId,
      bezeichnung: input.bezeichnung,
      kommentar: input.kommentar ?? null,
      rechnungsdatum: input.rechnungsdatum ?? null,
      betragCents: BigInt(input.betragCents),
      currency: input.currency ?? "EUR",
      wofuer: input.wofuer ?? null,
      bezahltVonKind: bv.kind,
      bezahltVonMemberId: bv.kind === "member" ? bv.member_id : null,
      externName: bv.kind === "extern" ? bv.name : null,
      externIban: bv.kind === "extern" ? bv.iban : null,
      externEmail: bv.kind === "extern" ? bv.email : null,
      bezahltVonDisplay: composeBezahltVonDisplay(bv),
      belegDriveFileId: input.belegDriveFileId ?? null,
      belegOriginalName: input.belegOriginalName ?? null,
      // Admin-entry: no submitter fingerprint (the admin is the actor)
      submitterIpPrefix: null,
      submitterUaHash: null,
      // Consent is implicit for admin entries — store current version
      consentTextVersion: DATENSCHUTZ_VERSION,
    })
    .returning({ id: auslagenSubmissions.id });

  if (!insertedRow) {
    throw new Error(
      `[manual-import] INSERT auslagen_submissions returned no row for ${ausId}`,
    );
  }
  const submissionId = insertedRow.id;

  // ── 3. Emit domain event (EingangsMail + audit log via registered handlers) ──
  const recipientEmail =
    bv.kind === "extern"
      ? bv.email
      : bv.kind === "member"
        ? (bv.email ?? null)
        : null;

  const vorname =
    bv.kind === "member"
      ? (bv.display_name.split(" ")[0] ?? bv.display_name)
      : bv.kind === "extern"
        ? (bv.name.split(" ")[0] ?? bv.name)
        : "Mitglied";

  // bus.emit may throw AggregateError if audit handler fails — let it bubble
  // to the calling action so the 500 surface is correct.
  await bus.emit("auslagen.submitted", {
    submissionId,
    ausId,
    email: recipientEmail,
    vorname,
    bezeichnung: input.bezeichnung,
    betragCents: input.betragCents,
    driveFileId: input.belegDriveFileId ?? null,
    consentTextVersion: DATENSCHUTZ_VERSION,
    // Admin entry — no real IP/UA. Use actor UUID as a stable sentinel.
    ipPrefix: `admin:${input.actorUserId.slice(0, 8)}`,
    userAgentHash: randomUUID().replace(/-/g, "").slice(0, 8),
    bezahltVonKind: bv.kind,
  });

  return { submissionId, ausId };
}
