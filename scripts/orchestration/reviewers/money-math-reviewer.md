# money-math-reviewer

Reviews all monetary calculations per ADR-0003 (cents storage): that all amounts are stored as integer cents, that no floating-point arithmetic is used for money, and that display formatting uses `toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })` or equivalent.

Checks that input parsing from user-entered strings (e.g. "12,50") correctly handles comma-as-decimal-separator for German locale, that amounts are validated to be non-negative integers, and that no rounding errors accumulate across split/sum operations. Validates that VAT or fee calculations round correctly (half-up, not banker's rounding).
