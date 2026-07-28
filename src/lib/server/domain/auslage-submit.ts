/**
 * Batch Auslage submission core (Aurora A-flow S0).
 *
 * `submitAuslagenBatch` is the single write path shared by BOTH the public
 * extern form (S1) and the member portal (S2). It inserts N submission rows
 * under one `submission_group_id` in ONE transaction, writes one in-tx audit
 * anchor per row (ADR-0004 — a failed audit rolls the whole batch back so a
 * committed row always carries its create-anchor and a nonce retry can never
 * resolve to an unaudited row), optionally snapshots the member reimbursement
 * IBAN, optionally writes the member's profile IBAN (Fall B/C) in the same
 * transaction, and emits ONE `auslagen.submitted` digest for the best-effort
 * EingangsMail (deduped on the group, ADR-0005).
 *
 * Idempotency (nonce PER item, not per batch — flow-brief §4 risk 1):
 *   - Full sequential retry (all nonces already committed): inserts nothing,
 *     returns the existing group. `deduped=true`.
 *   - Partial retry (some nonces new): inserts only the missing items INTO the
 *     existing group.
 *   - Truly-concurrent first POST: the partial UNIQUE index on submission_nonce
 *     (migration 0033) is the backstop — the loser catches the 23505 and
 *     resolves to the committed group.
 *
 * Uploads happen BEFORE this call (storage→DB ordering): every item carries a
 * pre-resolved `belegFileId` OR a `belegVerzichtGrund` (the DB CHECK
 * `auslagen_submissions_beleg_or_grund_ck` enforces the either/or).
 */

import { inArray, eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { members } from "$lib/server/db/schema/members.js";
import { allocateBusinessIds } from "./id-allocator.js";
import { composeBezahltVonDisplay, type BezahltVon } from "./auslagen.js";
import { logAudit } from "$lib/server/audit-log/index.js";
import { bus } from "$lib/server/events/index.js";
import { berlinYear } from "$lib/domain/year.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuslageBatchItem {
  /** Client idempotency key (UUID) — one per Auslage block (retry dedup). */
  submissionNonce?: string | null;
  bezeichnung: string;
  kommentar?: string | null;
  /** ISO YYYY-MM-DD (validated upstream). */
  rechnungsdatum?: string | null;
  /** Integer cents, > 0 (ADR-0003). */
  betragCents: number;
  wofuer?: string | null;
  projectId?: string | null;
  /** Pre-uploaded Beleg (files.id). Mutually exclusive with belegVerzichtGrund. */
  belegFileId?: string | null;
  belegOriginalName?: string | null;
  /** Beleg-Verzicht reason (≥5 chars, validated upstream). Member arm only. */
  belegVerzichtGrund?: string | null;
}

export interface SubmitAuslagenBatchInput {
  /** One submitter for the whole batch (ADR-0007 discriminated union). */
  bezahltVon: BezahltVon;
  /**
   * Member-arm reimbursement IBAN snapshot (§2.2b): Fall A = snapshot of
   * members.iban; Fall B/C = the entered IBAN. Persisted to `erstattung_iban`
   * on every row of a MEMBER batch. Ignored for the extern/verein arms.
   */
  erstattungIban?: string | null;
  items: AuslageBatchItem[];
  consentTextVersion: string;
  actorUserId?: string | null;
  submitterIpPrefix?: string | null;
  submitterUaHash?: string | null;
  currency?: string;
  /**
   * Optional profile-IBAN write (Fall B checkbox / Fall C radio 2). Applied
   * inside the batch transaction so "im Profil gespeichert" only holds on a
   * successful submit. The IBAN must already be normalized + validated by the
   * caller. Audited in-tx as a member update (kind='iban_updated').
   */
  memberIbanWrite?: { memberId: string; iban: string } | null;
  /** Digest EingangsMail recipient — null skips the mail (e.g. verein arm). */
  notifyEmail?: string | null;
  notifyVorname?: string;
}

export interface SubmitAuslagenBatchResult {
  submissionGroupId: string;
  /** Every row in the group (existing + newly inserted), business-id order. */
  submissions: { id: string; businessId: string }[];
  /** true when the call resolved entirely to already-committed rows. */
  deduped: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * True if `err` is a Postgres unique-violation (23505) raised by the named
 * constraint. Walks the `cause` chain (drizzle may wrap the driver error).
 * Matching by constraint NAME keeps the nonce backstop from swallowing an
 * unrelated unique violation (e.g. business_id).
 */
function isUniqueViolationOf(err: unknown, constraintName: string): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur != null; i++) {
    if (typeof cur === "object") {
      const o = cur as { code?: unknown; constraint_name?: unknown };
      if (o.code === "23505" && o.constraint_name === constraintName)
        return true;
      // AggregateError from the bus / driver wrappers expose nested errors.
      const agg = cur as { errors?: unknown[] };
      if (Array.isArray(agg.errors)) {
        for (const e of agg.errors) {
          if (isUniqueViolationOf(e, constraintName)) return true;
        }
      }
    }
    cur =
      typeof cur === "object" && cur !== null && "cause" in cur
        ? (cur as { cause?: unknown }).cause
        : null;
  }
  return false;
}

// ---------------------------------------------------------------------------
// submitAuslagenBatch
// ---------------------------------------------------------------------------

export async function submitAuslagenBatch(
  input: SubmitAuslagenBatchInput,
): Promise<SubmitAuslagenBatchResult> {
  if (input.items.length === 0) {
    throw new Error("submitAuslagenBatch: items must not be empty");
  }

  const db = getDb();
  const year = berlinYear();
  const bv = input.bezahltVon;
  const currency = input.currency ?? "EUR";
  const actorKind = input.actorUserId ? "user" : "system";
  // Member arm snapshots its reimbursement IBAN; extern/verein leave it NULL
  // (the extern arm's IBAN lives in extern_iban, written below).
  const erstattungIban =
    bv.kind === "member" ? (input.erstattungIban ?? null) : null;

  // Assigned from the transaction result below; the catch either returns
  // (nonce-race backstop) or rethrows, so these are always set past the block.
  let inserted: { id: string; businessId: string }[];
  let existingRows: { id: string; businessId: string }[];
  let groupId: string;

  try {
    const txResult = await db.transaction(async (tx) => {
      // 1. Pre-check nonces — which items are already committed, and to which
      //    group. Null nonces never dedup (always fresh inserts).
      const nonces = input.items
        .map((i) => i.submissionNonce)
        .filter((n): n is string => typeof n === "string" && n.length > 0);
      const existing = nonces.length
        ? await tx
            .select({
              id: auslagenSubmissions.id,
              businessId: auslagenSubmissions.businessId,
              submissionGroupId: auslagenSubmissions.submissionGroupId,
              submissionNonce: auslagenSubmissions.submissionNonce,
            })
            .from(auslagenSubmissions)
            .where(inArray(auslagenSubmissions.submissionNonce, nonces))
        : [];

      const existingByNonce = new Map(
        existing.map((r) => [r.submissionNonce!, r]),
      );
      // Reuse the group of any already-committed sibling; else mint a new one.
      const resolvedGroupId =
        existing.find((r) => r.submissionGroupId)?.submissionGroupId ??
        crypto.randomUUID();

      const newItems = input.items.filter(
        (i) => !(i.submissionNonce && existingByNonce.has(i.submissionNonce)),
      );

      // 2. Full idempotent retry — nothing new to insert.
      if (newItems.length === 0) {
        return {
          groupId: resolvedGroupId,
          existing: existing.map((r) => ({
            id: r.id,
            businessId: r.businessId,
          })),
          inserted: [] as { id: string; businessId: string }[],
        };
      }

      // 3. Allocate business IDs on THIS transaction (atomic — rollback frees them).
      const businessIds = await allocateBusinessIds(
        "AUS",
        newItems.length,
        year,
        tx,
      );

      // 4. Insert each new row + its in-tx create-anchor.
      const insertedRows: { id: string; businessId: string }[] = [];
      for (let k = 0; k < newItems.length; k++) {
        const item = newItems[k]!;
        const businessId = businessIds[k]!;
        const [row] = await tx
          .insert(auslagenSubmissions)
          .values({
            businessId,
            submissionGroupId: resolvedGroupId,
            submissionNonce: item.submissionNonce ?? null,
            bezeichnung: item.bezeichnung,
            kommentar: item.kommentar ?? null,
            rechnungsdatum: item.rechnungsdatum ?? null,
            betragCents: BigInt(item.betragCents),
            currency,
            wofuer: item.wofuer ?? null,
            bezahltVonKind: bv.kind,
            bezahltVonMemberId: bv.kind === "member" ? bv.member_id : null,
            externName: bv.kind === "extern" ? bv.name : null,
            externIban: bv.kind === "extern" ? bv.iban : null,
            externEmail: bv.kind === "extern" ? bv.email : null,
            bezahltVonDisplay: composeBezahltVonDisplay(bv),
            erstattungIban,
            belegDriveFileId: null,
            belegFileId: item.belegFileId ?? null,
            belegOriginalName: item.belegOriginalName ?? null,
            belegVerzichtGrund: item.belegVerzichtGrund ?? null,
            submitterIpPrefix: input.submitterIpPrefix ?? null,
            submitterUaHash: input.submitterUaHash ?? null,
            consentTextVersion: input.consentTextVersion,
          })
          .returning({ id: auslagenSubmissions.id });
        if (!row)
          throw new Error("submitAuslagenBatch: INSERT returned no row");
        insertedRows.push({ id: row.id, businessId });

        await logAudit(
          {
            action: "create",
            entityKind: "auslagen_submission",
            entityId: row.id,
            entityBusinessId: businessId,
            actorUserId: input.actorUserId ?? null,
            actorKind,
            actorIpPrefix: input.submitterIpPrefix ?? undefined,
            actorUaHash: input.submitterUaHash ?? undefined,
            payload: {
              bezeichnung: item.bezeichnung,
              betragCents: item.betragCents,
              bezahltVonKind: bv.kind,
              consentTextVersion: input.consentTextVersion,
              submissionGroupId: resolvedGroupId,
            },
          },
          tx,
        );
      }

      // 5. Optional profile-IBAN write (Fall B/C) — in-tx so it commits with
      //    the batch. The value is pre-normalized/validated by the caller.
      if (input.memberIbanWrite) {
        await tx
          .update(members)
          .set({ iban: input.memberIbanWrite.iban, updatedAt: new Date() })
          .where(eq(members.id, input.memberIbanWrite.memberId));
        await logAudit(
          {
            action: "update",
            entityKind: "member",
            entityId: input.memberIbanWrite.memberId,
            actorUserId: input.actorUserId ?? null,
            actorKind,
            payload: { kind: "iban_updated", source: "auslage_submit" },
          },
          tx,
        );
      }

      return {
        groupId: resolvedGroupId,
        existing: existing.map((r) => ({ id: r.id, businessId: r.businessId })),
        inserted: insertedRows,
      };
    });

    groupId = txResult.groupId;
    existingRows = txResult.existing;
    inserted = txResult.inserted;
  } catch (err) {
    // Concurrent-first-POST backstop: the partial UNIQUE index on
    // submission_nonce caught a duplicate. Resolve to the committed group.
    if (isUniqueViolationOf(err, "auslagen_submissions_submission_nonce_uq")) {
      const nonces = input.items
        .map((i) => i.submissionNonce)
        .filter((n): n is string => typeof n === "string" && n.length > 0);
      const rows = nonces.length
        ? await db
            .select({
              id: auslagenSubmissions.id,
              businessId: auslagenSubmissions.businessId,
              submissionGroupId: auslagenSubmissions.submissionGroupId,
            })
            .from(auslagenSubmissions)
            .where(inArray(auslagenSubmissions.submissionNonce, nonces))
        : [];
      if (rows.length) {
        return {
          submissionGroupId:
            rows.find((r) => r.submissionGroupId)?.submissionGroupId ??
            crypto.randomUUID(),
          submissions: rows.map((r) => ({
            id: r.id,
            businessId: r.businessId,
          })),
          deduped: true,
        };
      }
    }
    throw err;
  }

  const deduped = inserted.length === 0;
  const submissions = [...existingRows, ...inserted].sort((a, b) =>
    a.businessId.localeCompare(b.businessId),
  );

  // 6. Post-commit: emit ONE best-effort digest for the EingangsMail. Read the
  //    whole group so the mail lists every item (existing + new). Deduped on
  //    the group (entity_id = submissionGroupId) so a retry re-emit is a no-op
  //    at the sent_mails layer — exactly one EingangsMail per batch (ADR-0005).
  try {
    const groupRows = await db
      .select({
        businessId: auslagenSubmissions.businessId,
        bezeichnung: auslagenSubmissions.bezeichnung,
        betragCents: auslagenSubmissions.betragCents,
      })
      .from(auslagenSubmissions)
      .where(eq(auslagenSubmissions.submissionGroupId, groupId))
      .orderBy(auslagenSubmissions.businessId);

    const items = groupRows.map((r) => ({
      ausId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
    }));
    const gesamtCents = items.reduce((s, i) => s + i.betragCents, 0);
    const first = items[0];

    if (first) {
      await bus.emit("auslagen.submitted", {
        // Single-item legacy fields describe the FIRST item (greeting +
        // fallbacks); the digest handler reads submissionGroupId + items.
        submissionId: submissions[0]?.id ?? "",
        ausId: first.ausId,
        email: input.notifyEmail ?? null,
        vorname: input.notifyVorname ?? "",
        bezeichnung: first.bezeichnung,
        betragCents: gesamtCents,
        driveFileId: null,
        consentTextVersion: input.consentTextVersion,
        ipPrefix: input.submitterIpPrefix ?? "",
        userAgentHash: input.submitterUaHash ?? "",
        bezahltVonKind: bv.kind,
        submissionGroupId: groupId,
        items,
      });
    }
  } catch (emitErr) {
    // The batch + its audit anchors are already committed. A digest-mail hiccup
    // must not surface as an error to the caller (the user would needlessly
    // retry and just dedup on the nonces). Log and proceed.
    console.error(
      `[auslage-submit] post-commit digest emit failed for group ${groupId}:`,
      emitErr,
    );
  }

  return { submissionGroupId: groupId, submissions, deduped };
}
