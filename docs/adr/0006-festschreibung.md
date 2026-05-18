# ADR-0006: Festschreibung (year-close lock)

**Status:** Accepted (Phase 1: columns + function; row-level trigger in Phase 7.5)

## Context

GoBD § 146 (and HGB § 239 by extension) requires that booked entries become
immutable after Festschreibung — typically the year-close. Corrections are
allowed but must produce a Storno entry, not overwrite history.

## Decision

All four entity tables (`expenses`, `income`, `donations`, `invoices`) carry
the Festschreibung mixin:

- `festgeschrieben_at timestamptz NULL` — when locked; NULL = open.
- `festgeschrieben_by_user_id uuid NULL` — who triggered the close.
- `supersedes_id uuid NULL` — for Storno rows pointing at the row they
  correct. Self-referencing FK with `ON DELETE SET NULL`.

`close_buchhaltungsjahr(p_year integer, p_actor uuid)` is a PL/pgSQL function
that atomically flips all four tables for the given year. Returns per-table
row counts for the audit-log payload. Refuses years < 2020 or > current
calendar year.

A row-level trigger forbidding UPDATE on festgeschrieben rows ships in **Phase
7.5** (along with audit-log tamper-evidence). Phase 1 only sets up the columns

- the close function so the data shape is right.

## Storno mechanics

Post-Festschreibung corrections produce a new row with:

- `supersedes_id` = the row being corrected.
- `betrag_cents` = negative of the original.
- `gebucht_am` = the correction's own booking date (typically current).
- All other fields as needed.

Rolling sums by year (EÜR) naturally net out: the original year's sum still
includes the original positive; the correction year's sum includes the
negative. This matches how Steuerberater:innen expect Stornos to appear.

## Closing the year

UI (Phase 6+) triggers `SELECT * FROM close_buchhaltungsjahr(2025, $userId)`
from a confirmation modal. Result rows are written as audit_log entries.

## Idempotency

Re-running `close_buchhaltungsjahr(2025, ...)` after the year is already
closed is a no-op (the `WHERE festgeschrieben_at IS NULL` predicate matches
zero rows). Result: per-table counts of 0.
