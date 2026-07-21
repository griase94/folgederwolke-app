/**
 * One German date formatter for every transaction surface (feed + type lists)
 * so a date reads the same everywhere: zero-padded `dd.mm.yyyy` (`10.03.2026`,
 * never `10.3.2026`). Pure + client-safe.
 */

const fmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * `dd.mm.yyyy` for an ISO date string. Bare `YYYY-MM-DD` (a Berlin-local
 * calendar date — cash dates are SQL `date`s) is sliced directly to avoid a
 * timezone parse shift; timestamps go through Intl (local, matching the prior
 * `toLocaleDateString` behaviour) but zero-padded.
 */
export function formatDatumDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return fmt.format(new Date(iso));
}

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/**
 * Month + year for an ISO date, German long form (`Februar 2026`). This is the
 * canonical Leistungszeitraum derivation: the invoice form pre-fills the
 * (mandatory, § 14 Abs. 4 Nr. 6 UStG) Leistungszeitraum from the Leistungsdatum
 * as the compact month — never a long sentence, so it always fits the PDF head.
 *
 * A bare `YYYY-MM-DD` (a Berlin-local calendar date) is read part-by-part to
 * avoid a UTC parse shift landing on the previous month at month boundaries.
 * Empty / unparseable input returns "".
 */
export function leistungszeitraumFromDatum(iso: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) {
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx >= 0 && monthIdx < 12) return `${MONTHS_DE[monthIdx]} ${m[1]}`;
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}
