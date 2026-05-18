# ADR-0007: `bezahlt_von` discriminated union + write-time display snapshot

**Status:** Accepted (Phase 1, applied)

## Context

An Auslage can be paid by three distinct payer types:

1. **Verein** — paid directly from the Vereinskonto. No member or extern data.
2. **Member** — a Mitglied fronted the cost; Verein must reimburse to their
   stored IBAN.
3. **Extern** — a non-member (Helfer:in, Künstler:in) fronted the cost; Verein
   must reimburse to their free-text name/IBAN/email (collected on the form).

A naive design uses three nullable FK/text columns and trusts the application
to keep them consistent. That's a bug magnet.

## Decision

Three columns + CHECK constraint:

- `bezahlt_von_kind` — enum (`verein`, `member`, `extern`).
- `bezahlt_von_member_id uuid NULL` — FK to members; required iff `kind=member`.
- `extern_name`, `extern_iban`, `extern_email` — required iff `kind=extern`
  (well, `extern_name` is the hard requirement; IBAN+email are required for
  Erstattung but the form enforces that, not the DB).

Plus a write-time snapshot:

- `bezahlt_von_display text NOT NULL` — the human label captured at insert.
  Possible values: `"Verein"`, `"Maria Müller"`, `"Extern: Anna B."`.

The display column is **not** a generated column. Drizzle / Postgres can't
generate based on a JOIN (would need a function-on-columns that reads
members.name); a write-time snapshot is the right pattern and mirrors
`kategorie_name_snapshot` (ADR-0002).

The CHECK constraint on `expenses` (and `auslagen_submissions`):

```sql
(bezahlt_von_kind = 'verein' AND bezahlt_von_member_id IS NULL
   AND extern_name IS NULL AND extern_iban IS NULL AND extern_email IS NULL)
OR
(bezahlt_von_kind = 'member' AND bezahlt_von_member_id IS NOT NULL
   AND extern_name IS NULL AND extern_iban IS NULL AND extern_email IS NULL)
OR
(bezahlt_von_kind = 'extern' AND bezahlt_von_member_id IS NULL
   AND extern_name IS NOT NULL)
```

## Consequences

- Form action populates all five columns (or nulls) atomically.
- Audit-inbox approval (Phase 4) reads `auslagen_submissions` and copies
  these into the new `expenses` row with the same shape — the CHECK ensures
  no foot-gun.
- Renaming a member's display name updates members.vorname/nachname; existing
  expenses retain the snapshot (a rename doesn't rewrite history).
