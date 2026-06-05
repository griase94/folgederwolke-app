/**
 * Shared KPI copy helpers for the transaction list headers (pure, no DB/DOM).
 *
 * Centralises the German count-pluralisation that the three tab KPIs render so
 * they stop drifting: Einnahmen + Spenden previously hardcoded the plural
 * ("{count} Buchungen" / "{count} Spenden"), giving the wrong "1 Buchungen" /
 * "1 Spenden" at a count of one. Ausgaben already pluralised correctly; these
 * helpers lift that one rule into a single place (item 6).
 */

/** "1 X" / "n Xe" — picks singular vs plural by count. */
export function pluralizeCount(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "1 Buchung" / "n Buchungen" — Ausgaben/Einnahmen count label. */
export function buchungenLabel(count: number): string {
  return pluralizeCount(count, "Buchung", "Buchungen");
}

/** "1 Spende" / "n Spenden" — Spenden count label. */
export function spendenLabel(count: number): string {
  return pluralizeCount(count, "Spende", "Spenden");
}
