/**
 * Where a reimbursement actually goes — the ONE payout-IBAN resolution
 * (Aurora A-flow S3, ratified M4).
 *
 * Precedence, highest first:
 *   1. `auslagen_submissions.erstattung_iban` — the SNAPSHOT taken when the
 *      member submitted (A-S2b). Immune to later profile edits: the money goes
 *      where it was promised to go at submit time.
 *   2. `expenses.extern_iban` — the extern arm carries its IBAN on the expense.
 *   3. live `members.iban` — deliberate fallback (ratified 28.07): submissions
 *      from before S2b have no snapshot, and for those the member's CURRENT
 *      account is the only sensible truth (a bank change should be honoured;
 *      a one-off deviating IBAN could not have existed back then).
 *
 * WHY A SUBQUERY AND NOT A PLAIN JOIN: `auslagen_submissions.approved_expense_id`
 * has a foreign key but NO unique constraint, so the schema does not forbid two
 * submissions pointing at one expense. A naive LEFT JOIN would then emit the
 * expense TWICE — and in the Werkstatt pool that is a double-counted amount,
 * i.e. wrong money on screen. Picking exactly one submission deterministically
 * makes the resolution independent of that guarantee.
 */

import { sql, type SQL } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { members } from "$lib/server/db/schema/members.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";

/**
 * NOTE ON THE `${expenses}."col"` FORM: interpolating a COLUMN
 * (`${expenses.id}`) into a raw sql template renders it BARE as `"id"`, which
 * inside a correlated subquery silently binds to the subquery's own column —
 * a perfectly valid query with the wrong answer (the snapshot became
 * unreachable and payouts fell through to the live member IBAN). Always
 * qualify the outer table explicitly here.
 *
 * The snapshot IBAN of the ONE submission that owns this expense, as a scalar
 * subquery. Deterministic by business_id so a (schema-legal) duplicate link can
 * never multiply rows or make the result depend on physical row order.
 */
export const erstattungSnapshotIban: SQL<string | null> = sql`(
  SELECT s.erstattung_iban
  FROM ${auslagenSubmissions} s
  WHERE s.approved_expense_id = ${expenses}."id"
    AND s.erstattung_iban IS NOT NULL
  ORDER BY s.business_id
  LIMIT 1
)`;

/** The AUS-Nr of that same submission — what the Werkstatt shows, not the Expense-Nr. */
export const erstattungAusNr: SQL<string | null> = sql`(
  SELECT s.business_id
  FROM ${auslagenSubmissions} s
  WHERE s.approved_expense_id = ${expenses}."id"
  ORDER BY s.business_id
  LIMIT 1
)`;

/** The payer's CURRENT profile IBAN, as a scalar subquery (no join needed). */
export const memberLiveIban: SQL<string | null> = sql`(
  SELECT m.iban FROM ${members} m
  WHERE m.id = ${expenses}."bezahlt_von_member_id"
)`;

/**
 * The resolved payout IBAN as a SQL expression, usable in ANY select over
 * `expenses` — deliberately join-free, so no consumer can accidentally
 * multiply rows (and so the helper works against a minimal db stub).
 */
export const payoutIbanSql: SQL<string | null> = sql`COALESCE(
  ${erstattungSnapshotIban},
  ${expenses.externIban},
  ${memberLiveIban}
)`;

/** Which source won — for the Werkstatt's quiet provenance note and for tests. */
export type PayoutSource = "snapshot" | "extern" | "member-live";

export interface PayoutTarget {
  iban: string | null;
  source: PayoutSource | null;
}

/**
 * Resolve the payout target for ONE expense. Used by the §7 guard before a
 * reimbursement is committed — the server, not the client, is the authority on
 * "no reimbursement without an IBAN".
 */
export async function resolvePayoutIban(
  expenseId: string,
  client: Pick<ReturnType<typeof getDb>, "select"> = getDb(),
): Promise<PayoutTarget> {
  const [row] = await client
    .select({
      snapshot: erstattungSnapshotIban,
      extern: expenses.externIban,
      memberLive: memberLiveIban,
    })
    .from(expenses)
    .where(sql`${expenses.id} = ${expenseId}`)
    .limit(1);

  if (!row) return { iban: null, source: null };
  if (row.snapshot) return { iban: row.snapshot, source: "snapshot" };
  if (row.extern) return { iban: row.extern, source: "extern" };
  if (row.memberLive) return { iban: row.memberLive, source: "member-live" };
  return { iban: null, source: null };
}
