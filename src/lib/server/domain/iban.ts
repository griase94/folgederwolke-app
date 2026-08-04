/**
 * Server-side IBAN entry point.
 *
 * The implementation moved to `$lib/domain/iban.ts` (A-S2b) so the member
 * portal can run the SAME checksum live in the browser — an IBAN that the
 * form accepts must never be one the server rejects. This module stays as the
 * server-facing name so existing callers keep their `$lib/server/...` import.
 */

export {
  SEPA_IBAN_LENGTHS,
  normalizeIban,
  validateIban,
  formatIban,
  maskIbanDisplay,
} from "$lib/domain/iban.js";
