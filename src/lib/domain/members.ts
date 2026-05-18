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

export type MemberView = {
  id: string;
  vorname: string;
  nachname: string;
  email: string | null;
  iban: string | null;
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
