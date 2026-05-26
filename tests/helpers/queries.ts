/**
 * DB query helpers for test assertions.
 *
 * These helpers read from the test DB so test files can assert on
 * the actual state after a mutation action runs.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { memberBeitrags, members } from "$lib/server/db/schema/members.js";
import { sentMails } from "$lib/server/db/schema/mails.js";

// ---------------------------------------------------------------------------
// getMemberBeitrag
// ---------------------------------------------------------------------------

export async function getMemberBeitrag(
  memberId: string,
  year: number,
): Promise<typeof memberBeitrags.$inferSelect | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(memberBeitrags)
    .where(
      and(eq(memberBeitrags.memberId, memberId), eq(memberBeitrags.year, year)),
    );
  return row;
}

// ---------------------------------------------------------------------------
// getSentMailsForMember
// ---------------------------------------------------------------------------

export async function getSentMailsForMember(
  memberIdOrName: string,
): Promise<(typeof sentMails.$inferSelect)[]> {
  const db = getDb();
  const isUuid = /^[0-9a-f-]{36}$/i.test(memberIdOrName);
  if (isUuid) {
    return db
      .select()
      .from(sentMails)
      .where(eq(sentMails.entityId, memberIdOrName));
  }
  // Name path: look up member by vorname (seedMember stores the `name` arg as vorname)
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.vorname, memberIdOrName));
  if (!member) return [];
  return db.select().from(sentMails).where(eq(sentMails.entityId, member.id));
}

// ---------------------------------------------------------------------------
// countSentMails
// ---------------------------------------------------------------------------

export async function countSentMails(
  template: string,
  memberId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sentMails)
    .where(
      and(
        eq(
          sentMails.template,
          template as (typeof sentMails.$inferSelect)["template"],
        ),
        eq(sentMails.entityId, memberId),
      ),
    );
  return rows.length;
}
