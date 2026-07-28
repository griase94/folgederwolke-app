/**
 * Member self-service allowlist (Aurora A-flow S2a).
 *
 * The admin allowlist (`allowlist.ts`) is an env-configured set. The MEMBER
 * allowlist is the live `members` table: a canonical email is member-eligible
 * iff there is an ACTIVE member row (no Austritt, or Austritt strictly in the
 * future) that carries that email. "Active" mirrors the dashboard definition
 * (`isNull(austrittsDatum) OR austrittsDatum > current_date`) so login
 * eligibility and the "aktive Mitglieder" count never disagree.
 *
 * WHY match by re-canonicalizing in JS instead of `WHERE email_canonical = ?`:
 * `members.email_canonical` is written by two different paths that disagree —
 * `members-actions.ts` stores a naive `email.toLowerCase().trim()`, while the
 * magic-link pipeline (and seed fixtures) use the full Gmail-canonicalization
 * (`canonicalizeEmail`, which strips dot-tricks + `+suffix`). Matching a
 * magic-link's canonical email against the drifted column would silently lock
 * out any Gmail member created through the admin UI. Re-applying the SAME
 * `canonicalizeEmail` to `members.email` at read time is the only apples-to-
 * apples comparison. The members table is Verein-sized (tens of rows), so the
 * scan is trivial. (The email_canonical drift itself is a separate latent bug
 * tracked for the Mitglieder path — not fixed here to keep the auth diff small.)
 */

import { and, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { canonicalizeEmail } from "$lib/domain/email.js";

/** Read-only DB handle — a pooled client or an in-flight transaction. */
type MemberReader = Pick<ReturnType<typeof getDb>, "select">;

/** The member identity surfaced to the auth + portal layers. */
export interface MemberIdentity {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  iban: string | null;
}

const memberColumns = {
  id: members.id,
  vorname: members.vorname,
  nachname: members.nachname,
  email: members.email,
  iban: members.iban,
} as const;

/**
 * Active = kein Austritt oder Austritt strikt in der Zukunft.
 * Matches `domain/dashboard.ts` (B3 fix) so the definitions can't drift.
 */
const activeMember = or(
  isNull(members.austrittsDatum),
  gt(members.austrittsDatum, sql`current_date`),
);

/**
 * Return the ACTIVE member whose email canonicalizes to `canonical`, or null.
 * Used by the magic-link issue + consume paths to decide member eligibility.
 * Pass `client` (a `tx`) to run inside a transaction.
 */
export async function findActiveMemberByEmail(
  canonical: string,
  client: MemberReader = getDb(),
): Promise<MemberIdentity | null> {
  const rows = await client
    .select(memberColumns)
    .from(members)
    .where(and(isNotNull(members.email), activeMember));

  for (const row of rows) {
    if (row.email && canonicalizeEmail(row.email) === canonical) {
      return row;
    }
  }
  return null;
}

/**
 * Return the member row for `memberId` iff it is still active, else null.
 * Used by `resolveSession` to enforce allowlist parity for member sessions:
 * deactivating a member (setting a past Austritt) revokes their portal access
 * within one request — the member analogue of the admin CRIT-3 re-check.
 * O(1) by primary key; no email canonicalization needed (the member_id binding
 * was established at consume time).
 */
export async function getActiveMemberById(
  memberId: string,
  client: MemberReader = getDb(),
): Promise<MemberIdentity | null> {
  const rows = await client
    .select(memberColumns)
    .from(members)
    .where(and(eq(members.id, memberId), activeMember))
    .limit(1);

  return rows[0] ?? null;
}
