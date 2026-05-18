/**
 * Dashboard load — wires real counts we can compute now.
 *
 * memberCount:       total members (no filter — includes ausgetreten)
 * activeMemberCount: members without austrittsDatum
 * openBeitragsCount: member_beitrags rows for current year where paid_cents < betrag_cents
 *
 * Values requiring later-phase data (auslagen, SEPA, Spenden) remain as '—'.
 */

import { count, eq, lt, isNull, and } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";

export const load: PageServerLoad = async () => {
  const db = getDb();
  const currentYear = new Date().getFullYear();

  const [memberCountRow, activeMemberCountRow, openBeitragsCountRow] =
    await Promise.all([
      // All members (including ausgetreten)
      db.select({ value: count() }).from(members),

      // Active members only (no austrittsDatum)
      db
        .select({ value: count() })
        .from(members)
        .where(isNull(members.austrittsDatum)),

      // Open beitrags for current year: paid_cents < betrag_cents
      db
        .select({ value: count() })
        .from(memberBeitrags)
        .where(
          and(
            eq(memberBeitrags.year, currentYear),
            lt(memberBeitrags.paidCents, memberBeitrags.betragCents),
          ),
        ),
    ]);

  return {
    memberCount: memberCountRow[0]?.value ?? 0,
    activeMemberCount: activeMemberCountRow[0]?.value ?? 0,
    openBeitragsCount: openBeitragsCountRow[0]?.value ?? 0,
  };
};
