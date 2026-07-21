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

## Nachtrag — Post-close carve-outs for payment + certificate metadata (2026-07-21)

Migration `0040_expense-paid-carveout.sql` extends the same principle as the
invoice payment carve-out (0025) to two more non-booking metadata sets. The
festschreibung row-level UPDATE trigger (`assert_not_festgeschrieben_fn`) now
carries, on a festgeschriebene row, two additional column-set whitelists. The
migration `CREATE OR REPLACE`s the function on the **live 0037 body**, keeping
the invoice carve-out (0025) and the DSGVO donor-PII erasure carve-out (F31 / 0037) byte-for-byte; income remains fully locked.

### (a) Expenses — payment columns `{erstattet_am, zahlungsart_id, status, updated_at}`

§ 11 EStG (Abflussprinzip): a reimbursement belongs to the **year the money left
the account**, not the expense's own year. A Dezember-Auslage reimbursed in
January books into the new year; if the old year is closed and the new one is
open, marking it paid must succeed. The carve-out permits ONLY those four
columns. **Crucially `abfluss_datum` (the `year_of_buchung` driver, migration 0034) stays in the LOCKED set:** a member/extern row already carries its
Abfluss-Datum, so `markExpenseAsPaid` preserves it (COALESCE) and passes; a
Verein-direct row with NULL `abfluss_datum` would have `abfluss_datum` set to the
payment date — moving the Buchungsjahr — so the trigger rejects it and the app
surfaces an honest German 409 (never marked paid in a closed year without a
cash-out date). `markExpenseAsPaid` (detail + list-kebab route actions) and
`markExpenseErstattet` (the `?/bulk-mark-erstattet` batch path) both drop their
app pre-gate; the trigger is the sole enforcer, and the reimburse paths degrade
its 23514 to an honest per-row 409 so a single blocked row never 500s the batch.

Note on `status`: it is included in the allowed set purely as payment-workflow
metadata (`geprueft` → `erstattet`), the way the reimburse UPDATE sets it. It is
theoretically settable in isolation on a festgeschriebene Auslage, but no app
path does so — every writer that touches `status` in the carve-out also writes
`erstattet_am`. It carries no Buchungswert.

### (b) Donations — certificate columns `{bescheinigung_nr, bescheinigung_ausgestellt_am, bescheinigung_ausgestellt_von_user_id, bescheid_typ, updated_at}`

A Zuwendungsbestätigung can be issued (assigned a B-Nummer + Ausstellungs-
Metadaten) after the donation's year is closed — a Dezember-Spende certified in
the following February. Issuance writes only certificate metadata, never a
booking value; the exact set `allocateBescheinigung` writes is the whitelist.
All donor-PII, financial, Sachspende/Aufwandsspende/Zweckbindung fields stay
byte-equal. This branch **coexists** with the F31 PII-erasure branch (two
independent `donations` IF-blocks; either matching path returns): a
festgeschriebene Spende thus permits EITHER a GDPR PII erasure OR a certificate
issuance, never an arbitrary edit. `allocateBescheinigung` no longer 409s on a
festgeschriebene Spende (the `bescheinigung_nr IS NULL` TOCTOU guard stays).

Both carve-outs are precise column-set whitelists — every booking value
(Beträge, Kategorie, Sphäre, Daten) and, for donations, all donor PII remain
locked. income carries no carve-out (any UPDATE on a closed income row → 23514).
