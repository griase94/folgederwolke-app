/**
 * Bescheinigungs-Status mapper for the C1 Spenden tab (pure, no DB).
 *
 * Lives under `src/lib/domain/` because the Svelte component (SpendenTab)
 * needs the label map at render time — `$lib/server/...` cannot be imported
 * from client-side code, even if the helper itself is pure.
 *
 * Heuristic until product defines a richer state machine:
 *   - issued   → bescheinigungNr + bescheinigungAusgestelltAm both set
 *   - na       → no member_id AND no spender_name AND < 300 €
 *                (vereinfachter Spendennachweis per §50 Abs. 4 EStDV —
 *                anonymous Kleinbetrag-Spenden need no Bescheinigung up to 300 €)
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

/**
 * Kleinbetrag-Bescheinigung threshold (vereinfachter Spendennachweis).
 *
 * §50 Abs. 4 EStDV: für Zuwendungen bis 300 € genügt der Bareinzahlungsbeleg
 * oder die Buchungsbestätigung; eine förmliche Zuwendungsbestätigung ist nicht
 * erforderlich. Threshold raised from 200 € to 300 € by Jahressteuergesetz
 * (most recent applicable version) — 300 € is the current value used by all
 * BMF-Vordrucke.
 */
const KLEINBETRAG_THRESHOLD_CENTS = 30000; // 300 € per §50 Abs. 4 EStDV

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
