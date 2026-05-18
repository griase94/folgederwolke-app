# ADR-0003: Money is stored in cents

**Status:** Accepted (Phase 1, applied)

## Context

Storing money as `numeric(10,2)` "Euro" is fine for display but invites
arithmetic surprises: floating-point in JS, `numeric` round-tripping through
ORMs, summation order effects across thousands of rows.

We need cents-precise arithmetic across summation, partial Erstattungen,
Storno, Anteil-Berechnungen, USt prep (Kleinunternehmer for now per §19 UStG,
but the design assumes a future where that flips).

## Decision

All money tables (`expenses`, `income`, `donations`, `invoices`, `member_beitrags`):

- `betrag_cents bigint NOT NULL` (or `netto_cents` / `brutto_cents` / `ust_cents`
  for invoices). Bigint, not int — accommodates yearly sums into hundreds of
  millions of cents.
- `betrag_eur numeric(12,2) GENERATED ALWAYS AS (betrag_cents::numeric / 100) STORED`.

The cents column is the source of truth. The euro column exists only for
read-side analytics (EÜR exports, dashboards): a simple `SUM(betrag_eur)` is
slightly cheaper than `SUM(betrag_cents) / 100.0` and lets SQL pretty-print
report values.

`src/lib/domain/money.ts` provides:

- `parseEuroToCents(string): bigint` for form inputs.
- `formatCentsAsEuro(bigint): string` for display (German locale, half-away-from-zero).
- `sumCents(bigint[]): bigint` for client-side rollups.

NEVER reverse-engineer cents from euro. Always start from cents.

## Display rounding

`Intl.NumberFormat('de-DE')` rounds half-away-from-zero ("kaufmännisch") which
matches German invoice-printing convention. Banker's rounding is NOT used.

## Consequences

- Drizzle's `bigint("...", { mode: "bigint" })` emits JS `bigint`. SQL `DEFAULT 0`
  literal is passed via `sql\`0\``to avoid`JSON.stringify(BigInt)` errors in
  drizzle-kit migration generation.
- CHECK constraints `betrag_cents >= 0` on income / donations / invoices
  prevent accidental negative entries. Expenses allow negative (for Storno).
- Currency column `char(3) NOT NULL DEFAULT 'EUR'` (ADR-0012) future-proofs
  multi-currency without schema breaks.
