/**
 * Client-safe member domain helpers.
 *
 * These can run in both the browser and on the server.
 * Server-only validation (Zod schemas) lives in $lib/server/domain/members.ts.
 */

// ---------------------------------------------------------------------------
// Shared view types (used by components to avoid importing from route $types)
// ---------------------------------------------------------------------------

export type BeitragStatus = "paid" | "open" | "waived";

export type BeitragCell = {
  id: string;
  betragCents: number;
  paidCents: number;
  gezahltAm: string | null;
} | null;

/**
 * C5-MEM-lite — €-summen aggregate for the Mitglieder-Matrix header line.
 * Lives in the client-safe module so `MemberMatrix.svelte` can `import type`
 * it without dragging a server module into the client bundle.
 *
 * Mirrored by the server helper `memberBeitragsTotals(year)` in
 * `$lib/server/domain/members.ts` (re-exported from there for callers that
 * already use the server module).
 *
 * Night-2 C5-MEM-full extends the aggregate with `exemptCount` (count of
 * active members where `beitrag_exempt = true`). Exempt members are also
 * excluded from the `offenCents` sum — see `memberBeitragsTotals` in
 * `$lib/server/domain/members.ts` for the SQL.
 */
export type MemberBeitragsTotals = {
  memberCount: number;
  exemptCount: number;
  paidCents: number;
  offenCents: number;
};

export type MemberView = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  iban: string | null;
  telefon: string | null;
  adresse: string | null;
  dateOfBirth: string | null;
  role: string;
  eintrittsDatum: string | null;
  austrittsDatum: string | null;
  isFixture: boolean;
  createdAt: string;
  beitrags: Record<number, BeitragCell>;
};

// ---------------------------------------------------------------------------
// Beitrag status helper
// ---------------------------------------------------------------------------

/**
 * Derive the display status from paid_cents and betrag_cents.
 * waived = betrag_cents is 0 (Ehrenmitglied / Beitragserlass).
 * paid   = paid_cents >= betrag_cents (and betrag_cents > 0).
 * open   = everything else.
 */
export function beitragStatusFor(row: {
  betragCents: bigint | number;
  paidCents: bigint | number;
}): BeitragStatus {
  const betrag = BigInt(row.betragCents);
  const paid = BigInt(row.paidCents);
  if (betrag === 0n) return "waived";
  if (paid >= betrag) return "paid";
  return "open";
}
