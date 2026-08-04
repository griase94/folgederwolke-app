/**
 * The two formatters every mail needs — money and dates.
 *
 * Both were copy-pasted into each template before; a mail that formats money
 * its own way is a mail that eventually disagrees with the app about what the
 * member is owed. Cents-only per ADR-0003 (never a float), de-DE locale, which
 * also supplies the NBSP before the € sign.
 */

/** Integer cents → "36,40 €" (de-DE, NBSP before the sign). */
export function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

/** Date → "09.07.2026". Accepts the ISO strings some event payloads carry. */
export function datum(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
