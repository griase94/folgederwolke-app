/**
 * The tally a batch reimbursement reports back (Aurora A-flow S3.1).
 *
 * A bulk commit rarely ends in a clean yes or no: some claims go through, some
 * are skipped because there is no IBAN yet (§7), some sit in a closed year the
 * server still refuses, some were already paid. Collapsing that into
 * "erfolgreich"/"fehlgeschlagen" is how an admin loses track of who still needs
 * money — so the result is always an itemised tally.
 *
 * Pure on purpose: the page renders it through the toast kit, the tests read it
 * as data.
 */

export interface BulkErstattungSummary {
  erstattet: string[];
  /** Skipped: no payout account yet (§7). NOT an error. */
  ibanFehlt: string[];
  festgeschrieben: string[];
  bereitsBezahlt: string[];
  notFound: string[];
  fehler: { id: string; error: string }[];
}

export type BulkResultTone = "ok" | "warn";

export interface BulkResult {
  tone: BulkResultTone;
  /** One-line headline, e.g. "4 von 5 erstattet". */
  headline: string;
  /** Itemised counts, in the order an admin cares about them. */
  tally: string[];
}

function n(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function buildBulkResult(s: BulkErstattungSummary): BulkResult {
  const attempted =
    s.erstattet.length +
    s.ibanFehlt.length +
    s.festgeschrieben.length +
    s.bereitsBezahlt.length +
    s.notFound.length +
    s.fehler.length;

  const tally: string[] = [];
  if (s.erstattet.length)
    tally.push(n(s.erstattet.length, "erstattet", "erstattet"));
  // Named before the failures: this is the bucket the admin can actually act on.
  if (s.ibanFehlt.length)
    tally.push(`${s.ibanFehlt.length}× IBAN fehlt — übersprungen`);
  if (s.bereitsBezahlt.length)
    tally.push(`${s.bereitsBezahlt.length}× bereits erstattet`);
  if (s.festgeschrieben.length)
    tally.push(`${s.festgeschrieben.length}× festgeschrieben`);
  if (s.notFound.length) tally.push(`${s.notFound.length}× nicht gefunden`);
  if (s.fehler.length) tally.push(n(s.fehler.length, "Fehler", "Fehler"));

  // Anything that did not go through makes this a warn — a half-done batch must
  // never look like a clean success.
  const clean = s.erstattet.length === attempted && attempted > 0;

  const headline =
    attempted === 0
      ? "Keine Auslagen verarbeitet"
      : clean
        ? `${s.erstattet.length} von ${attempted} erstattet`
        : `${s.erstattet.length} von ${attempted} erstattet — Rest siehe Liste`;

  return { tone: clean ? "ok" : "warn", headline, tally };
}
