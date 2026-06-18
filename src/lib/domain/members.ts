/**
 * Client-safe member domain helpers.
 *
 * These can run in both the browser and on the server.
 * Server-only validation (Zod schemas) lives in $lib/server/domain/members.ts.
 */

// ---------------------------------------------------------------------------
// Shared view types (used by components to avoid importing from route $types)
// ---------------------------------------------------------------------------

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
  /** Night-2 C5-MEM-full: Beitragspflicht ausgesetzt? */
  beitragExempt: boolean;
  /** Night-2 C5-MEM-full: free-text justification (tooltip on the badge). */
  beitragExemptReason: string | null;
  isFixture: boolean;
  createdAt: string;
  beitrags: Record<number, BeitragCell>;
};

// ---------------------------------------------------------------------------
// Beitrag status helper
// ---------------------------------------------------------------------------
// NOTE: beitragStatusFor + BeitragStatus are removed as part of Package A
// (member-zahlung redesign). Call sites now use resolveBeitragState from
// $lib/domain/beitrag-state.ts (or an inline cents check during the Package D
// UI migration). This comment block is intentionally left for reviewer context.
// ---------------------------------------------------------------------------
