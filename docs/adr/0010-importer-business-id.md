# ADR-0010: Sheet importer preserves business_id verbatim

**Status:** Accepted (Phase 1 schema; importer ships in Phase 6)

## Context

The legacy Apps Script system uses A-, E-, S-, FDW-, B-, AUS-, P-prefixed IDs
with `<PREFIX>-<YYYY>-<NNN>` format, zero-padded to at least 3 digits. These
IDs leak into PDFs (invoice numbers on the customer side, Bescheinigungs-Nr
on Finanzamt receipts), DSGVO-relevant exports, Andy's mental model, and any
Steuerberater query.

Re-numbering on import would invalidate every past PDF and break audit trails.

## Decision

Every entity table that issues a customer-facing ID has:

- `business_id text NOT NULL UNIQUE` — the human-facing ID.
- Format CHECK constraint: `business_id ~ '^<PREFIX>-[0-9]{4}-[0-9]{3,}$'`
  with the prefix specific to the table.
- Year-consistency CHECK: `(substring(business_id from <PREFIX-len+1> for 4))::int = year_of_buchung`.
- `source source_kind NOT NULL DEFAULT 'app'` provenance marker.
- `source_ref text NULL` — for sheet-imported rows, the legacy sheet row
  reference (`Ausgaben!A47` etc.) for audit-trail diagnostics.

## Counter seeding

After the Phase 6 importer ingests legacy IDs, `seed_id_counter_from_corpus(year, kind)`
sets `id_counters.next_value = MAX(parsed_seq) + 1` for that (year, kind) so
app-issued IDs continue without collision.

The function uses `regexp_match(business_id, '^<KIND>-(\d{4})-(\d+)$')[2]::bigint`
to extract the sequence segment from corpus rows, ignoring legacy weirdnesses
like a row that snuck through with mismatched padding.

## Issuing new IDs

`id_counters(year, kind)` row gets `SELECT ... FOR UPDATE` inside the
inserting transaction, then `next_value` is read + incremented. Formatted
as `<PREFIX>-<year>-<seq:3-pad>`. The Format CHECK + year-consistency CHECK
catch any application bug that produces a malformed ID before it's persisted.

## Re-application protection

`import_runs(idempotency_key, source_hash, ...)` tracks each importer run.
Re-applying without `--force-replace` refuses to start. `source_hash` is
SHA-256 of the export blob — a subtly different export (one new row, one
edited row) gets a different hash and is treated as a fresh run.

## Edge: bescheinigung_nr

Spendenbescheinigungen use a separate `B-{YYYY}-{NNN}` counter (D10 — yearly
reset). The `kind='B'` row in `id_counters` is keyed by year and produces
sequence numbers independent of the donation's own `S-...` business_id.
Both IDs live on the same `donations` row; the format CHECK on
`bescheinigung_nr` is null-tolerant (nullable column — set when the
Bescheinigung is issued, not when the donation is booked).
