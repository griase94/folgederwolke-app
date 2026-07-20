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
