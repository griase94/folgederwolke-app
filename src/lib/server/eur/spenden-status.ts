/**
 * Bescheinigungs-Status mapper for the C1 Spenden tab (pure, no DB).
 *
 * Heuristic until product defines a richer state machine:
 *   - issued   → bescheinigungNr + bescheinigungAusgestelltAm both set
 *   - na       → no member_id AND no spender_name AND < 200 € (Anonymspende)
 *   - pending  → otherwise (we have an identifiable spender)
 *   - declined → not used in v1; UI surfaces the bucket so we can wire later
 */

export type BescheinigungStatus = "issued" | "pending" | "declined" | "na";

export interface SpendeStatusRow {
  id: string;
  bescheinigungNr: string | null;
  bescheinigungAusgestelltAm: string | null;
  betragCents: number;
  memberId: string | null;
  spenderName: string | null;
  spendeKind: string;
}

const KLEINBETRAG_THRESHOLD_CENTS = 20000; // 200 €

export function bescheinigungStatusFor(
  row: SpendeStatusRow,
): BescheinigungStatus {
  if (row.bescheinigungNr && row.bescheinigungAusgestelltAm) {
    return "issued";
  }
  const cents = Number(row.betragCents);
  const hasIdentifiableSpender =
    row.memberId !== null ||
    (row.spenderName !== null && row.spenderName.trim().length > 0);

  if (!hasIdentifiableSpender && cents < KLEINBETRAG_THRESHOLD_CENTS) {
    return "na";
  }
  return "pending";
}

export const BESCHEINIGUNG_STATUS_LABEL: Record<BescheinigungStatus, string> = {
  issued: "Ausgestellt",
  pending: "Offen",
  declined: "Abgelehnt",
  na: "Nicht relevant",
};
