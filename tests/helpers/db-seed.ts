/**
 * DB seed helpers for unit + integration tests.
 *
 * Wraps low-level Drizzle inserts so individual test files don't have to
 * import schema types directly. Each helper returns the created row so tests
 * can grab the generated ID.
 */

import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";

// ---------------------------------------------------------------------------
// seedMember
// ---------------------------------------------------------------------------

export async function seedMember(opts: {
  name: string;
  eintrittsDatum?: string;
  austrittsDatum?: string | null;
  beitragExempt?: boolean;
  beitragExemptReason?: string;
  email?: string | null;
}): Promise<typeof members.$inferSelect> {
  const db = getDb();
  const [row] = await db
    .insert(members)
    .values({
      vorname: opts.name,
      nachname: "Fixture",
      email: opts.email ?? null,
      eintrittsDatum: opts.eintrittsDatum ?? "2020-01-01",
      austrittsDatum: opts.austrittsDatum ?? null,
      beitragExempt: opts.beitragExempt ?? false,
      beitragExemptReason: opts.beitragExempt
        ? (opts.beitragExemptReason ?? "Test")
        : null,
      isFixture: true,
    })
    .returning();
  if (!row) throw new Error("seedMember: insert returned no row");
  return row;
}

// ---------------------------------------------------------------------------
// seedOpenBeitrag
// ---------------------------------------------------------------------------

export async function seedOpenBeitrag(opts: {
  memberId: string;
  year: number;
  cents?: bigint;
}): Promise<void> {
  const db = getDb();
  const cents = opts.cents ?? 6969n;
  await db
    .insert(memberBeitrags)
    .values({
      memberId: opts.memberId,
      year: opts.year,
      betragCents: cents,
      paidCents: 0n,
    })
    .onConflictDoNothing();
}

// ---------------------------------------------------------------------------
// seedPaidBeitrag
// ---------------------------------------------------------------------------

export async function seedPaidBeitrag(opts: {
  memberId: string;
  year: number;
  cents?: bigint;
  gezahltAm?: string;
}): Promise<void> {
  const db = getDb();
  const cents = opts.cents ?? 6969n;
  const gezahltAm = opts.gezahltAm ?? `${opts.year}-03-31`;
  await db
    .insert(memberBeitrags)
    .values({
      memberId: opts.memberId,
      year: opts.year,
      betragCents: cents,
      paidCents: cents,
      gezahltAm,
    })
    .onConflictDoNothing();
}
