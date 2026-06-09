/**
 * Verein postal-address helpers.
 *
 * `VEREIN_ADRESSE` is a multi-line German postal address following DIN 5008 /
 * Deutsche Post conventions — each postal line on its own row, with an optional
 * care-of (`c/o …`) line directly below the name and above the street:
 *
 *   Folge der Wolke e.V.      ← the Verein name (a separate field)
 *   c/o Jonas Hackenberg      ┐
 *   Westermühlstraße 6        ├ VEREIN_ADRESSE (these helpers)
 *   80469 München             ┘
 *
 * The newline can reach us in three shapes depending on the env pipeline, so we
 * normalise all of them:
 *  - real `\n` — dotenv's double-quote expansion in `.env.*`, or a Vercel
 *    multi-line value;
 *  - a literal backslash-n (`\n` as two characters) — some env transports keep
 *    it escaped;
 *  - a legacy single-line value — returned as one line (we deliberately do NOT
 *    split on commas, since a care-of or company line may legitimately contain
 *    one).
 */

/** Split a postal address into trimmed, non-empty lines (top-to-bottom). */
export function addressLines(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .replace(/\\n/g, "\n") // literal backslash-n → real newline
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Collapse a postal address to one line for compact contexts (mail footer,
 * invoice sender line). Defaults to a middot separator.
 */
export function addressOneLine(
  raw: string | null | undefined,
  separator = " · ",
): string {
  return addressLines(raw).join(separator);
}
