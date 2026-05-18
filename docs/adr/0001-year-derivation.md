# ADR-0001: Year derivation = Buchhaltungsjahr

**Status:** Accepted (Phase 1, applied)

## Context

Every booking-relevant artifact (Auslage, Spende, Rechnung, Ausgangsrechnung)
needs a stable "year" tag for: EÜR rollup, ID-counter scope (`A-2026-007`),
Bescheinigungs-Nr scope (`B-{YYYY}-{NNN}` per D10), Festschreibung boundary,
dashboard filters, and importer mapping back to legacy A-IDs.

Three candidate years exist for any row:

1. **Calendar year of `created_at`** — when the row was inserted in our DB.
2. **Calendar year of `rechnungsdatum` / `gebucht_am`** — the booking date.
3. **Calendar year of the actual money movement (`erstattet_am`, `geld_eingang_datum`).**

Option 1 is wrong: a Belegt-im-Dezember-2025 Auslage submitted in January 2026
must land in EÜR-2025. Option 3 is wrong for accrual purposes: VAT/EÜR follow
Buchungsdatum, not Zahlungsdatum (Kleinunternehmer scope mitigates the latter
but the principle stands). Option 2 is the only correct one.

## Decision

Each of `expenses`, `income`, `donations`, `invoices` has:

- `gebucht_am timestamptz NOT NULL DEFAULT now()` — the Buchungsdatum.
  Distinct from `created_at` (provenance) and `rechnungsdatum` (Belegdatum).
- `year_of_buchung int GENERATED ALWAYS AS (year_for_booking(gebucht_am)) STORED`.

`year_for_booking(timestamptz)` is an `IMMUTABLE` SQL function returning
`extract(year FROM ts AT TIME ZONE 'Europe/Berlin')::int`. Source:
`drizzle/sql/functions/year_for_booking.sql`; same content is prepended to
the first drizzle migration so it exists before the dependent CREATE TABLEs.

Pure-TS mirror lives in `src/lib/domain/year.ts` for hint-display and tests.

## Importer impact

Phase 6's sheet importer sets `gebucht_am` to the legacy timestamp recorded on
the sheet (`Geldfluss-Datum` for Ausgaben, `Geldeingang` for Einnahmen, with
the same fallback chain legacy `imports.ts` used). This makes `year_of_buchung`
match the year segment of the legacy A-/E-/S-/FDW-ID, satisfying the
year-consistency CHECK constraint (ADR-0010).

## Tested edge cases

- 23:30 Berlin on 2025-12-31 → year 2025.
- 00:30 Berlin on 2026-01-01 → year 2026.
- 23:30 UTC on 2025-12-31 (= 00:30 Berlin on 2026-01-01) → year 2026.

## Consequences

- All year-scoped queries (`WHERE year_of_buchung = ?`) hit the partial index
  on `year_of_buchung` and never need a function-on-column predicate.
- `year_of_buchung` is immutable per row even if `gebucht_am` is corrected
  (Festschreibung trigger blocks the update post-close; pre-close, edits flow
  through and the generated column re-computes — that's fine).
- A Storno row (`supersedes_id` set, negative `betrag_cents`) inherits its
  own `year_of_buchung` from its own `gebucht_am` — the Storno itself is a
  bookable event in its year.
