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

## Phase 12 Limitations

### Edit-after-issuance gate is workflow-disciplined, not enforced. (2026-05-26)

Phase 12 added `editInvoice` allowing in-place edits while `bezahltAm IS NULL`.
GoBD Rn. 119 strictly treats issuance (sending to the Kunde) as the immutability
anchor, not payment receipt. Andy's current workflow ("never edit an invoice
I've already emailed") is the operational control; the audit_log diff is the
trail. Upgrade path: add an explicit `issued_at` column + "Als versendet
markieren" button — deferred to Phase 13.

### Trigger carve-out for payment fields (2026-05-26)

Migration `0025_invoice_festschreibung_payment_carveout.sql`. The festschreibung
row-level UPDATE trigger now permits UPDATEs that touch ONLY
`{bezahlt_am, paid_by_income_id, updated_at}` even on festgeschriebene rows.
Rationale: § 11 EStG (Zufluss/Abfluss) — for cash-basis EÜR, income belongs to
the **year of receipt**, independent of the invoice's own booking year. A
Rechnung dated 2025-12-29 paid 2026-01-15 lands in income year 2026; if 2025
is closed and 2026 is open, the mark-paid UPDATE must succeed. The carve-out
is a precise column-set whitelist — every substantive invoice field is still
locked.

### DSGVO Art. 16 — supersedeInvoice now re-reads customers. (2026-05-26)

Previously the supersede copied `customer_name_snapshot` /
`customer_address_snapshot` from the OLD invoice. As of Phase 12, the supersede
re-SELECTs from `customers` so a Berichtigungspflicht-driven correction
actually flows into the Storno-Neuausstellung. Documented here so a future
reader knows snapshot semantics differ between createInvoice (snapshots at
create) vs supersedeInvoice (re-reads at supersede).
