# Schema Review — folgederwolke-app

**Date:** 2026-05-19
**Reviewer:** schema-design audit (Drizzle / Postgres / migrations 0000–0009)
**Scope:** `drizzle/*.sql`, `src/lib/server/db/schema/*.ts`, hash-chain trigger,
id-allocator, mail-dedup index.

---

## TL;DR

The migration stack is in mostly-good shape. The hash-chain trigger and
discriminated-union CHECKs are well thought out. There are, however, a handful
of **real bugs**:

- One **CRIT** that will silently corrupt the audit chain on any insert that
  uses **sub-millisecond clock precision** — the JS-side hasher pads
  microseconds with the string `"000"` while Postgres emits actual microseconds
  for any timestamp not already at exact ms boundary. Any insert from `psql`,
  the backfill script, or a future stored-procedure path will produce a row
  the verifier rejects.
- One **CRIT** advisory-lock-key collision risk: `audit_log_chain` uses the
  un-namespaced string `'audit_log_chain'`, while every other advisory lock
  in the app uses a namespaced prefix (`id_counter:…`, `drive_folder:…`,
  `project_bid:…`, `drive_subfolder:…`). A future change to one of those
  prefixes that happens to `hashtext()` to the same 32-bit int as
  `'audit_log_chain'` would deadlock audit + that subsystem.
- Multiple **HIGH** issues around drift between schema-TS and SQL: the
  `auslagen_submissions` table declares three TS columns with no FK
  (`bezahlt_von_member_id` _is_ FK'd, but `decided_by_user_id`,
  `approved_expense_id`, and the rejected/decided user are NOT — the latter
  three have no FK in the SQL either, so deletes will leave dangling refs).
- Several **MED** indexing gaps: `donations.kategorie_id` is unindexed
  despite being a `restrict` FK (deletes will seq-scan); the
  `sent_mails` lookup index is fine, but the `entity_id` slot has a
  `NULLS NOT DISTINCT` only because of a hand-fix in 0003 — the **schema TS
  doesn't capture this**, so a `drizzle-kit push` (if anyone ever runs one)
  will re-create the index _without_ `NULLS NOT DISTINCT` and silently
  re-introduce the dup-mail bug.

### Severity tally

| Sev       | Count  |
| --------- | ------ |
| CRIT      | 2      |
| HIGH      | 7      |
| MED       | 9      |
| LOW       | 5      |
| NIT       | 3      |
| **Total** | **26** |

---

## Top 5

1. **CRIT — audit-chain microsecond drift between JS and Postgres**
   `chain.ts:73` pads ms→us with `"000"`. Postgres' `to_char(..., 'US')` emits
   real microseconds. Any timestamp with sub-ms precision (e.g. backfill from
   `psql`, or `now()` returning µs) hashes differently on the two sides → the
   nightly verifier marks the row as a `row_hash_mismatch`.
2. **CRIT — advisory-lock key not namespaced**
   `0009_audit_log_hardening.sql:55` uses `hashtext('audit_log_chain')`. Every
   other lock in the codebase uses a namespaced prefix. Today there's no
   collision, but a future change can break audit + another subsystem
   together with no compile-time warning.
3. **HIGH — `auslagen_submissions` FKs missing**
   `decided_by_user_id`, `approved_expense_id`, `bescheinigung_ausgestellt_von_user_id`
   (the last is fine — it's on donations and has a FK). In `auslagen_submissions`,
   `decided_by_user_id` and `approved_expense_id` have NO foreign-key in either
   the migration or the schema TS. Deleting a user / expense leaves dangling
   refs.
4. **HIGH — `sent_mails` index `NULLS NOT DISTINCT` not in TS schema**
   The Drizzle `uniqueIndex(...)` in `mails.ts` declares the same columns but
   without `NULLS NOT DISTINCT`. `drizzle-kit generate` will refuse, but
   `drizzle-kit push --force` or a fresh `drizzle-kit drop` cycle will
   regenerate without the option, silently breaking magic-link dedup.
5. **HIGH — `donations.kategorie_id` has no index but is a `RESTRICT` FK**
   On `kategorie` delete attempts, Postgres needs an FK-side index to perform
   the existence check. Without one, every delete (and the `restrict` check
   on a no-op) does a seq scan of donations.

---

## Findings (full list)

### F1 — CRIT — audit-log row_hash microsecond padding mismatch

- **File:** `src/lib/server/audit-log/chain.ts:73`
  ```ts
  const us = pad(d.getUTCMilliseconds(), 3) + "000";
  ```
- **Mirror:** `drizzle/0009_audit_log_hardening.sql:75`
  ```sql
  v_occurred := to_char(NEW.occurred_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US');
  ```
- **Observation:** `to_char('US')` returns the **actual** µs (Postgres
  timestamps natively have µs precision). JS pads ms with literal `"000"`.
  Any `occurred_at` whose µs portion isn't exactly `xxxYYY000` will hash
  differently on the two sides.
- **When does it happen?** Postgres' `now()` returns µs precision; in
  practice an INSERT from a TS path that supplies `occurred_at` as a JS
  `Date` (ms-precision) is byte-equal. But any of these inserts produces
  sub-ms:
  - The backfill script `scripts/backfill-audit-chain.ts` (if it ever
    reads `occurred_at` from DB and re-hashes).
  - Direct `psql` inserts during testing.
  - Future server-side `to_timestamp(epoch_us / 1e6)`-style writes.
  - `now()`-defaulted rows on the trigger side (the trigger hashes
    `NEW.occurred_at` which, on a defaulted row, is whatever `now()` returned —
    µs precision).
- **Risk:** Verifier reports `row_hash_mismatch` on production rows, pages
  on-call, eroded trust in the chain.
- **Fix (Postgres side, preferred — round the timestamp to ms before hashing):**
  ```sql
  v_occurred := to_char(date_trunc('milliseconds', NEW.occurred_at)
                        AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US');
  ```
  Then JS keeps padding `"000"` and the two sides agree.
  Alternatively, fix JS to actually read µs (it can't — `Date` is ms).
  Truncating to ms in SQL is the only durable fix.

### F2 — CRIT — advisory-lock key `'audit_log_chain'` not namespaced

- **File:** `drizzle/0009_audit_log_hardening.sql:55`,
  also `audit_log.ts:11` doc.
- **Observation:** Other advisory locks use namespaced strings:
  `id_counter:{year}:{kind}`, `drive_folder:{key}`, `drive_subfolder:…`,
  `project_bid:{year}`. The audit lock uses bare `'audit_log_chain'` —
  one string in a global 32-bit `hashtext` space.
- **Risk:** A future advisory-lock string whose `hashtext()` happens to
  collide will deadlock with audit-log inserts. `hashtext` collisions are
  ~1-in-4B, not negligible across a growing codebase.
- **Fix:** Rename to `audit_log:chain` (matches other namespaces). Run
  this in the trigger AND any verifier paths that take the same lock
  (none today, but plan for it).
  ```sql
  PERFORM pg_advisory_xact_lock(hashtext('audit_log:chain'));
  ```

### F3 — HIGH — `auslagen_submissions.decided_by_user_id` and `.approved_expense_id` have no FK

- **File:** `drizzle/0000_init.sql:71–73` (columns declared, no FK appended),
  `src/lib/server/db/schema/auslagen_submissions.ts:73, 76`.
- **Observation:** Both are typed `uuid` but neither the migration nor the
  drizzle schema adds `.references(...)`. Compare with `bezahlt_von_member_id`
  on the same table, which IS FK'd.
- **Risk:** Deleting a user leaves orphaned `decided_by_user_id`; deleting
  an expense (allowed pre-Festschreibung) leaves `approved_expense_id`
  pointing to nothing. Audit-inbox UI then shows "approved by ???".
- **Fix:**

  ```sql
  ALTER TABLE auslagen_submissions
    ADD CONSTRAINT auslagen_submissions_decided_by_user_id_fk
    FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE auslagen_submissions
    ADD CONSTRAINT auslagen_submissions_approved_expense_id_fk
    FOREIGN KEY (approved_expense_id) REFERENCES expenses(id) ON DELETE SET NULL;
  ```

  And mirror with `.references(...)` in the TS schema.

### F4 — HIGH — `sent_mails` index NULLS NOT DISTINCT not in TS schema

- **Files:** `src/lib/server/db/schema/mails.ts:60–65` (TS),
  `drizzle/0003_phase2_constraints.sql` (raw SQL fix).
- **Observation:** TS schema declares
  ```ts
  uniqueIndex("sent_mails_template_entity_attempt_uq").on(
    t.template,
    t.entityKind,
    t.entityId,
    t.sendAttempt,
  );
  ```
  with no NULLS NOT DISTINCT option. The DB index _does_ have it, applied
  via 0003. Future `drizzle-kit push` or `drizzle-kit drop` cycles
  re-create it without the option.
- **Risk:** Magic-link mails (entity_kind='user', entity_id=NULL) are no
  longer deduped → user can be spammed by replays of the same
  send-attempt.
- **Fix:** Either bypass Drizzle's index builder entirely (mark the TS
  declaration as `// authoritative: 0003_phase2_constraints.sql`) AND add
  a CI guard:
  ```sql
  -- in CI integration test:
  SELECT pg_get_indexdef(indexrelid)
    FROM pg_index
   WHERE indexrelid = 'sent_mails_template_entity_attempt_uq'::regclass;
  -- assert output contains 'NULLS NOT DISTINCT'
  ```
  Long-term: open a Drizzle issue / use a custom raw-SQL definition.

### F5 — HIGH — `donations.kategorie_id` has no index (FK is `RESTRICT`)

- **File:** `drizzle/0000_init.sql:403` (RESTRICT FK), `0000_init.sql:444–449`
  (six donation indexes — none on kategorie_id).
- **Observation:** Compare to expenses + income + invoices, which all
  index `kategorie_id`. Donations is the only table missing it.
- **Risk:** Any kategorie delete (or rename of legacy kategorie that
  re-evaluates the RESTRICT check) triggers a seq scan over donations.
  Also affects EÜR export which JOINs on kategorie_id.
- **Fix:**
  ```sql
  CREATE INDEX donations_kategorie_id_idx ON donations(kategorie_id);
  ```
  And in `donations.ts`:
  ```ts
  kategorieIdIdx: index("donations_kategorie_id_idx").on(t.kategorieId),
  ```

### F6 — HIGH — `audit_log.chain_seq` index should be UNIQUE

- **File:** `drizzle/0000_init.sql:439`, `src/lib/server/db/schema/audit_log.ts:63`.
- **Observation:** `audit_log_chain_seq_idx` is a plain b-tree on
  `chain_seq`. The trigger relies on monotonic sequencing, but nothing
  in the DB _prevents_ two rows from sharing a chain_seq if the trigger
  is bypassed or if the advisory lock fails (which it can't, but
  defensive uniqueness is cheap).
- **Risk:** Operator restore from a backup that has duplicate chain_seq
  → verifier sees ambiguous order; backfill cron may write a duplicate
  chain_seq onto pre-genesis rows.
- **Fix:**
  ```sql
  DROP INDEX audit_log_chain_seq_idx;
  CREATE UNIQUE INDEX audit_log_chain_seq_uq ON audit_log(chain_seq)
    WHERE chain_seq IS NOT NULL;
  ```
  Update TS schema to use `uniqueIndex(...)` with `.where(...)`.

### F7 — HIGH — `audit_log.row_hash` and `prev_hash` unconstrained

- **File:** `drizzle/0000_init.sql:47–48`.
- **Observation:** `row_hash` and `prev_hash` are plain `text`. The
  trigger writes 64-hex-char SHA-256 hashes, but anyone with INSERT
  privilege (which `app_runtime` has — the REVOKE is only on UPDATE,
  DELETE, TRUNCATE) can write **bogus** strings before the trigger
  runs. Wait — the trigger is `BEFORE INSERT` and **always** overwrites,
  so this is fine for the trigger path. But:
  - The trigger overwrites `NEW.chain_seq`, `NEW.prev_hash`, and
    `NEW.row_hash` unconditionally. Good.
  - But pre-genesis rows (`chain_seq IS NULL`) can still be inserted —
    the trigger sets `v_prev_seq := 0` and proceeds to assign chain_seq=1.
    There's NO mechanism to insert a "skip the chain" row anymore once
    the trigger ships, even though the backfill script needs it.
- **Risk:** The backfill script described in ADR-0004 cannot operate
  because the trigger forces chain_seq on every insert. The script needs
  to write `chain_seq=NULL` for old rows, then later UPDATE them — but
  UPDATE is REVOKEd from app_runtime. The backfill must run as
  `app_migrate` (which still has UPDATE) — verify this is documented.
- **Fix:** Add a SQL comment + a runbook note clarifying that backfill
  must run with the `app_migrate` role, and that the trigger does not
  permit pre-genesis rows post-activation. Optionally add:
  ```sql
  ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_row_hash_format_ck
    CHECK (row_hash IS NULL OR row_hash ~ '^[0-9a-f]{64}$');
  ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_prev_hash_format_ck
    CHECK (prev_hash IS NULL OR prev_hash = '' OR prev_hash ~ '^[0-9a-f]{64}$');
  ```

### F8 — HIGH — Trigger function lacks `SECURITY DEFINER` and explicit GRANT

- **File:** `drizzle/0009_audit_log_hardening.sql:37`.
- **Observation:** `audit_log_chain_fn()` runs as `SECURITY INVOKER`
  (default). For an INSERT by `app_runtime`, the trigger inherits the
  invoker's privileges — which include SELECT on audit_log (needed to
  read prev_hash) and INSERT on audit_log (needed for the trigger's
  effect). app_runtime has both, so today this works.
- **Risk:** If `app_runtime` ever loses SELECT (it shouldn't, but the
  audit reads `SELECT chain_seq, row_hash FROM audit_log WHERE chain_seq
IS NOT NULL ORDER BY chain_seq DESC LIMIT 1`), the trigger fails for
  every INSERT — sign-in breaks.
- **Fix:** Convert to `SECURITY DEFINER`, GRANT EXECUTE to PUBLIC, and
  set the search_path explicitly:

  ```sql
  CREATE OR REPLACE FUNCTION audit_log_chain_fn() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ ... $$;

  REVOKE ALL ON FUNCTION audit_log_chain_fn() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION audit_log_chain_fn() TO app_runtime;
  ```

### F9 — HIGH — pgcrypto extension created AFTER the function references `digest()`

- **File:** `drizzle/0009_audit_log_hardening.sql:89` (uses `digest`),
  line `97` (CREATE EXTENSION).
- **Observation:** The function definition references `digest(...)`
  before the `CREATE EXTENSION IF NOT EXISTS pgcrypto` line. Postgres
  PL/pgSQL doesn't resolve function bodies until invocation, so this
  works **today**. But on a fresh DB the first INSERT after migration
  will fail until `digest` resolves.
- **Risk:** Race-condition on first-deploy; some environments may need
  CONNECT-then-RECONNECT for the extension to be visible to a cached
  plan.
- **Fix:** Move `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to the top
  of 0009 (before the function), or even better, to 0000_init.sql
  alongside `pg_trgm`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- needed by audit_log trigger
  ```

### F10 — MED — `kategorien_kind_ck` uses text instead of enum

- **File:** `drizzle/0000_init.sql:525–526`.
- **Observation:** `kategorien.kind` is `text NOT NULL CHECK (kind IN
('expense', 'income'))`. The schema TS comment justifies this
  ("literal text, not an enum, to keep it open"). But the same logic
  applies to `id_counters.kind` (`A`/`E`/`S`/`FDW`/`B`/`AUS`/`P`) which
  has NO CHECK at all.
- **Risk:** Typo'd `kind` value in id_counters (e.g. `'a'` lowercase)
  silently creates a parallel counter that never collides with the real
  one — and produces malformed IDs that fail the business_id CHECK on
  the entity table.
- **Fix:**
  ```sql
  ALTER TABLE id_counters
    ADD CONSTRAINT id_counters_kind_ck
    CHECK (kind IN ('A', 'E', 'S', 'FDW', 'B', 'AUS', 'P'));
  ```

### F11 — MED — `donations_aufwandsspende_ck` is too weak

- **File:** `drizzle/0000_init.sql:557–563`.
- **Observation:**
  ```sql
  CHECK (
    (spende_kind <> 'aufwandsspende'
       AND aufwandsspende_aus_expense_id IS NULL
       AND aufwandsspende_verzicht_datum IS NULL)
    OR
    (spende_kind = 'aufwandsspende')
  )
  ```
  When `spende_kind='aufwandsspende'`, ANY combination of the
  aufwandsspende\_\* fields is allowed — including all NULL. Per ADR-0007
  (well, the donation analogue), Aufwandsspende SHOULD require at least
  `aufwandsspende_verzicht_datum`.
- **Risk:** Spendenbescheinigung PDF for Aufwandsspende renders with
  missing legally-required dates → §10b EStG violation.
- **Fix:**
  ```sql
  CHECK (
    (spende_kind <> 'aufwandsspende'
       AND aufwandsspende_aus_expense_id IS NULL
       AND aufwandsspende_verzicht_datum IS NULL)
    OR
    (spende_kind = 'aufwandsspende'
       AND aufwandsspende_verzicht_datum IS NOT NULL
       AND aufwandsspende_aus_expense_id IS NOT NULL)
  )
  ```

### F12 — MED — `invoices.brutto_cents` not constrained to equal `netto+ust`

- **File:** `drizzle/0000_init.sql:250–254`, `568–570`.
- **Observation:** Three independent money columns; the only CHECKs are
  `>= 0`. Nothing enforces `brutto_cents = netto_cents + ust_cents`.
  Kleinunternehmer means `ust_cents = 0` and `netto = brutto`, but if
  the app ever flips to "with USt" a buggy form action could produce
  brutto ≠ netto+ust silently.
- **Risk:** EÜR export sums brutto, ELSTER expects coherent USt
  reporting; inconsistency goes undetected.
- **Fix:**
  ```sql
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_brutto_eq_netto_plus_ust_ck
    CHECK (brutto_cents = netto_cents + ust_cents);
  ```

### F13 — MED — `rate_limit_attempts` has no TTL / cleanup

- **File:** `src/lib/server/db/schema/users.ts:108–125`.
- **Observation:** Every magic-link issuance inserts a row, never deleted.
  After a year, table grows to ≥100k rows. Index is on
  `(key, occurred_at DESC)` so reads stay fast — but disk + vacuum cost.
- **Risk:** Slow accretion; not urgent.
- **Fix:** Add a cron task (Phase 7 cron) that does
  `DELETE FROM rate_limit_attempts WHERE occurred_at < now() - interval '7 days'`,
  OR partition by month, OR use a BRIN index instead of btree.

### F14 — MED — `magic_links` and `sessions` have no consumed/expired cleanup

- **File:** `src/lib/server/db/schema/users.ts:78–101, 51–76`.
- **Observation:** Same pattern as F13; consumed/expired rows accumulate
  forever. `magic_links` is also subject to the 60s dedup query
  `WHERE issuedAt > now() - 60_000`, which is indexed by `email_canonical`
  but not by `(email_canonical, issued_at)` composite — full index scan
  - filter per request.
- **Risk:** Login latency degrades over time.
- **Fix:**
  - Add a composite index `(email_canonical, issued_at DESC)` to magic_links.
  - Add a cron task: delete consumed/expired tokens older than 90 days.

### F15 — MED — `magic_links` 60s dedup query index ordering

- **File:** `src/lib/server/auth/index.ts:92–99`, `users.ts:99`.
- **Observation:** The dedup query filters by `email_canonical`,
  `consumed_at IS NULL`, `expires_at > now()`, `issued_at > now() - 60s`.
  Only `email_canonical` is indexed; the other three are post-filter.
- **Fix:** Composite index:
  ```sql
  CREATE INDEX magic_links_email_issued_idx
    ON magic_links (email_canonical, issued_at DESC)
    WHERE consumed_at IS NULL;
  ```

### F16 — MED — `donations.member_id ON DELETE set null` while `donations` are GoBD-immutable

- **File:** `drizzle/0000_init.sql:402`.
- **Observation:** `donations.member_id ON DELETE set null`. Once a
  donation is festgeschrieben (per ADR-0006), it's supposed to be
  immutable. But deleting a member silently mutates the donation
  (member_id → NULL). The app-level Festschreibung trigger (Phase 7.5)
  may guard against this, but the FK rule bypasses any trigger that
  fires on UPDATE.
- **Risk:** GoBD: post-close mutation of a Spendenbescheinigung
  donor field.
- **Fix:**
  ```sql
  ALTER TABLE donations DROP CONSTRAINT donations_member_id_members_id_fk;
  ALTER TABLE donations ADD CONSTRAINT donations_member_id_members_id_fk
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT;
  ```
  Members are also soft-deletable in practice (`austritts_datum`); use
  that pattern instead.

### F17 — MED — `expenses.bezahlt_von_member_id ON DELETE set null` is similarly leaky for festgeschriebene Auslagen

- **File:** `drizzle/0000_init.sql:413`.
- **Observation:** Same shape as F16 — once an Auslage is paid out and
  festgeschrieben, the member who fronted the money is part of the
  permanent record. SET NULL alters it.
- **Fix:** RESTRICT (and rely on soft-delete via austritts_datum).

### F18 — MED — `invoices.paid_by_income_id` is `uuid` but has NO foreign key

- **File:** `drizzle/0000_init.sql:265`, `src/lib/server/db/schema/invoices.ts:121–122`.
- **Observation:** Declared as `uuid` with no FK in either layer.
- **Risk:** Reconciliation queries that JOIN invoices on
  paid_by_income_id can match deleted income rows; also no referential
  integrity for the reverse lookup.
- **Fix:**
  ```sql
  ALTER TABLE invoices ADD CONSTRAINT invoices_paid_by_income_id_fk
    FOREIGN KEY (paid_by_income_id) REFERENCES income(id) ON DELETE SET NULL;
  ```

### F19 — MED — `invoices.drive_status` is `text` but has finite domain

- **File:** `drizzle/0005_invoices_pdf_bytes.sql:15`,
  `src/lib/server/db/schema/invoices.ts:119`.
- **Observation:** Comment says `'pending' | 'uploaded' | 'failed' | 'skipped'`
  but no CHECK enforces the domain.
- **Risk:** Typo → row that no cron job ever picks up.
- **Fix:**
  ```sql
  ALTER TABLE invoices ADD CONSTRAINT invoices_drive_status_ck
    CHECK (drive_status IS NULL OR drive_status IN ('pending', 'uploaded', 'failed', 'skipped'));
  ```
  (Or convert to a pgEnum — better long-term.)

### F20 — MED — `auslagen_submissions.decision` is `text` with the same problem

- **File:** `drizzle/0000_init.sql:70`.
- **Observation:** Schema TS says `'approved' | 'rejected'`. No CHECK.
- **Fix:**
  ```sql
  ALTER TABLE auslagen_submissions ADD CONSTRAINT auslagen_submissions_decision_ck
    CHECK (decision IS NULL OR decision IN ('approved', 'rejected'));
  ```

### F21 — LOW — `import_runs.status` is `text` with no CHECK

- **File:** `drizzle/0000_init.sql:188`.
- **Observation:** Comment says `'ok' | 'failed' | 'rolled_back'`.
  Default is `'running'` (also valid). No CHECK.
- **Fix:**
  ```sql
  ALTER TABLE import_runs ADD CONSTRAINT import_runs_status_ck
    CHECK (status IN ('running', 'ok', 'failed', 'rolled_back'));
  ```

### F22 — LOW — `audit_log.actor_kind` is `text` with default `'user'`

- **File:** `drizzle/0000_init.sql:38`.
- **Observation:** Comment says `'user' | 'system'`. No CHECK.
- **Fix:** Either enum or CHECK.

### F23 — LOW — `import_runs.force_replace_used` is `integer` but used as boolean

- **File:** `drizzle/0000_init.sql:191`.
- **Observation:** Default `0`. Used as a count (0 vs >0). Should be
  boolean.
- **Fix:** Either rename or convert column type. Low priority.

### F24 — LOW — Currency CHECK missing

- **File:** every money table has `currency char(3) DEFAULT 'EUR'`.
- **Observation:** No CHECK that currency is in {EUR}. ADR says
  "future-proof multi-currency".
- **Fix:** For v1, lock to EUR with a CHECK. When multi-currency
  ships, drop the CHECK and add a stricter validation.

### F25 — LOW — `audit_log.entity_id` is `uuid` not bound to entity_kind

- **File:** `drizzle/0000_init.sql:43`.
- **Observation:** No FK (correct — multi-table polymorphic). But no
  validation that the (entity_kind, entity_id) tuple ever pointed at a
  real row.
- **Fix:** Add a verification cron that samples old audit rows for
  dangling refs. Not a schema fix.

### F26 — NIT — `expenses.business_id_year_ck` uses substring positions

- **File:** `drizzle/0000_init.sql:505`.
- **Observation:** `(substring(business_id from 3 for 4))::int = year_of_buchung`
  works for `A-YYYY-...` but is fragile if prefix length changes.
  Same comment for `S-`, `E-`, `FDW-`.
- **Fix (nit):** Use regex_match instead:
  ```sql
  CHECK ((regexp_match(business_id, '-(\d{4})-'))[1]::int = year_of_buchung)
  ```
  Marginally more robust.

---

## Suspicious-but-intentional list

| Item                                                                      | Why it's OK                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `expenses.betrag_cents` allows negative (no `>= 0` CHECK)                 | ADR-0003 + ADR-0006: Storno produces a counter-row with negative betrag_cents. Income/donations/invoices keep `>= 0`.                            |
| `audit_log.chain_seq` etc. nullable in 0000                               | ADR-0004 explicitly: Phase 1 ships columns, Phase 7.5 ships trigger. Pre-genesis rows are intentionally NULL and backfilled.                     |
| `sphere_overrides` schema is a placeholder `__sphereOverridesPlaceholder` | ADR-0011 defers the override table to Phase 2. Schema barrel needs an export for `drizzle-kit generate` to see no gap.                           |
| `id_counters.kind` is `text` not enum                                     | ADR-0010: importer-friendly; importer can write whatever the legacy sheet had. F10 still recommends a CHECK.                                     |
| `kategorien.kind` is `text not enum`                                      | Same logic — "to keep it open" per schema doc. Already has CHECK constraint.                                                                     |
| `bigint("betrag_cents", { mode: "bigint" })` returns JS `bigint`          | ADR-0003 explicitly chooses this over `mode: "number"` to avoid precision loss past 2^53 cents (≈ 90 trillion EUR — unrealistic, but defensive). |
| FK `invoices.customer_id ON DELETE restrict`                              | Correct — invoices are GoBD-immutable; deleting a Kunde must be blocked.                                                                         |
| FK `expenses.kategorie_id ON DELETE restrict`                             | Same — kategorie deletion would break the historic record; soft-delete via `deactivated` flag is the intended path.                              |
| `donations.kategorie_id ON DELETE restrict`                               | Same intent. (But missing INDEX — see F5.)                                                                                                       |
| `member_beitrags.member_id ON DELETE cascade`                             | Beiträge are a per-member detail; deleting a member (which only happens if no audit-relevant history exists) should drop their Beitrags rows.    |
| `sessions.user_id ON DELETE cascade`                                      | Sessions are ephemeral; deleting a user obviously invalidates them.                                                                              |
| Trigger is `BEFORE INSERT` only (not BEFORE UPDATE/DELETE)                | UPDATE/DELETE are REVOKE'd from app_runtime; only `app_migrate` can do them and it's expected to know what it's doing.                           |
| `sent_mails` index `NULLS NOT DISTINCT` overrides drizzle TS              | F4 — intentional but undocumented in TS. Add a CI guard.                                                                                         |
| `currency char(3)` (fixed-length 3)                                       | Future-proof for ISO 4217 codes.                                                                                                                 |
| `audit_log.actor_user_id ON DELETE set null`                              | Yes, audit rows survive user deletion. Correct.                                                                                                  |

---

## Table → FK → Indexes → Trigger map

| Table                | PK         | Outgoing FKs (target / on-delete)                                                                                                                                                                                                                                                 | Incoming FKs                                                                                                                          | Indexes                                                                                                                                                    | Triggers                                   |
| -------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| audit_log            | uuid       | actor_user_id → users.id (SET NULL)                                                                                                                                                                                                                                               | —                                                                                                                                     | occurred_at; (entity_kind,entity_id); (actor_user_id, occurred_at); chain_seq (should be UNIQUE — F6)                                                      | BEFORE INSERT `audit_log_chain_trg` (0009) |
| auslagen_submissions | uuid       | bezahlt_von_member_id → members.id (SET NULL); **missing** decided_by_user_id, approved_expense_id (F3)                                                                                                                                                                           | —                                                                                                                                     | business_id UQ; decided_at; submitted_at; bezeichnung TRGM                                                                                                 | —                                          |
| customers            | uuid       | —                                                                                                                                                                                                                                                                                 | invoices.customer_id, expenses.customer_id                                                                                            | name; name TRGM                                                                                                                                            | —                                          |
| donations            | uuid       | member_id (SET NULL — F16); kategorie_id (RESTRICT); project_id (SET NULL); bescheinigung_ausgestellt_von_user_id (SET NULL); aufwandsspende_aus_expense_id (SET NULL); festgeschrieben_by_user_id (SET NULL); supersedes_id (self, SET NULL); created_by_user_id (SET NULL)      | —                                                                                                                                     | business_id UQ; bescheinigung_nr UQ (partial); year_of_buchung; member_id; project_id; gebucht_am — **kategorie_id missing (F5)**                          | —                                          |
| expenses             | uuid       | kategorie_id (RESTRICT); project_id (SET NULL); zahlungsart_id (SET NULL); bezahlt_von_member_id (SET NULL — F17); customer_id (SET NULL); approved_by_user_id, rejected_by_user_id, festgeschrieben_by_user_id, created_by_user_id (all SET NULL); supersedes_id self (SET NULL) | donations.aufwandsspende_aus_expense_id (SET NULL)                                                                                    | business_id UQ; status; year_of_buchung; sphere_snapshot; kategorie_id; project_id; bezahlt_von_member_id; gebucht_am; pay_queue partial; bezeichnung TRGM | —                                          |
| id_counters          | uuid       | —                                                                                                                                                                                                                                                                                 | —                                                                                                                                     | (year, kind) UQ                                                                                                                                            | —                                          |
| import_runs          | uuid       | triggered_by_user_id → users.id (SET NULL)                                                                                                                                                                                                                                        | —                                                                                                                                     | idempotency_key UQ                                                                                                                                         | —                                          |
| income               | uuid       | kategorie_id (RESTRICT); project_id (SET NULL); zahlungsart_id (SET NULL); festgeschrieben_by_user_id (SET NULL); supersedes_id self (SET NULL); created_by_user_id (SET NULL)                                                                                                    | —                                                                                                                                     | business_id UQ; year_of_buchung; sphere_snapshot; kategorie_id; project_id; gebucht_am                                                                     | —                                          |
| invoice_jobs         | uuid       | invoice_id → invoices.id (CASCADE)                                                                                                                                                                                                                                                | —                                                                                                                                     | idempotency_key UQ; invoice_id; (status, next_attempt_at)                                                                                                  | —                                          |
| invoices             | uuid       | customer_id (RESTRICT); project_id (SET NULL); kategorie_id (RESTRICT); festgeschrieben_by_user_id (SET NULL); supersedes_id self (SET NULL); created_by_user_id (SET NULL); **paid_by_income_id missing FK (F18)**                                                               | invoice_jobs.invoice_id (CASCADE)                                                                                                     | business_id UQ; year_of_buchung; customer_id; project_id; pdf_status; drive_status (partial); rechnungsdatum                                               | —                                          |
| kategorien           | uuid       | —                                                                                                                                                                                                                                                                                 | expenses.kategorie_id (RESTRICT); income.kategorie_id (RESTRICT); donations.kategorie_id (RESTRICT); invoices.kategorie_id (RESTRICT) | (kind, name) UQ; sphere                                                                                                                                    | —                                          |
| sent_mails           | uuid       | —                                                                                                                                                                                                                                                                                 | —                                                                                                                                     | (template, entity_kind, entity_id, send_attempt) UQ + NULLS NOT DISTINCT (raw SQL); status; queued_at; provider_message_id                                 | —                                          |
| member_beitrags      | uuid       | member_id → members.id (CASCADE)                                                                                                                                                                                                                                                  | —                                                                                                                                     | (member_id, year) UQ; year                                                                                                                                 | —                                          |
| members              | uuid       | —                                                                                                                                                                                                                                                                                 | many SET NULL refs                                                                                                                    | nachname; email_canonical; nachname TRGM                                                                                                                   | —                                          |
| projects             | uuid       | —                                                                                                                                                                                                                                                                                 | many SET NULL refs                                                                                                                    | business_id UQ; name; name TRGM                                                                                                                            | —                                          |
| settings             | text (key) | —                                                                                                                                                                                                                                                                                 | —                                                                                                                                     | —                                                                                                                                                          | —                                          |
| magic_links          | uuid       | —                                                                                                                                                                                                                                                                                 | —                                                                                                                                     | token_hash UQ; email_canonical; expires_at                                                                                                                 | —                                          |
| rate_limit_attempts  | uuid       | —                                                                                                                                                                                                                                                                                 | —                                                                                                                                     | (key, occurred_at DESC NULLS LAST)                                                                                                                         | —                                          |
| sessions             | uuid       | user_id → users.id (CASCADE)                                                                                                                                                                                                                                                      | —                                                                                                                                     | token_hash UQ; user_id; expires_at                                                                                                                         | —                                          |
| users                | uuid       | —                                                                                                                                                                                                                                                                                 | many SET NULL refs                                                                                                                    | email_canonical UQ                                                                                                                                         | —                                          |
| zahlungsarten        | uuid       | —                                                                                                                                                                                                                                                                                 | expenses.zahlungsart_id, income.zahlungsart_id (SET NULL)                                                                             | label UQ; kind                                                                                                                                             | —                                          |

---

## Migration ordering check

| #    | File                           | Pre-cond   | OK? | Notes                                                                          |
| ---- | ------------------------------ | ---------- | --- | ------------------------------------------------------------------------------ |
| 0000 | init                           | none       | ✓   | Single big file. Functions defined inline.                                     |
| 0001 | phase2_additions               | 0000       | ✓   | NOT NULL backfill pattern correct: add nullable, backfill, alter NOT NULL.     |
| 0002 | roles                          | 0000       | ✓   | Idempotent role creation. REVOKE here is duplicated in 0009 — safe.            |
| 0003 | phase2_constraints             | 0000       | ✓   | DROP-then-CREATE INDEX — does NOT lose data (index only).                      |
| 0004 | members_contact_columns        | 0000       | ✓   | All ADD COLUMN IF NOT EXISTS; nullable.                                        |
| 0005 | invoices_pdf_bytes             | 0000       | ✓   | All nullable.                                                                  |
| 0006 | projects_customers_soft_delete | 0000       | ✓   | All nullable.                                                                  |
| 0007 | eur_views                      | 0000       | ✓   | View only.                                                                     |
| 0008 | views                          | 0000       | ✓   | View only.                                                                     |
| 0009 | audit_log_hardening            | 0002, 0000 | ⚠   | F9: pgcrypto installed AFTER function body. F1, F2 critical bugs in this file. |

No forwards-only violations (no DROP TABLE, no DROP COLUMN). No data-loss DDL.

---

## Drift check (TS schema vs SQL)

Differences found:

1. `mails.ts` `uniqueIndex` does not encode `NULLS NOT DISTINCT` (F4).
2. `auslagen_submissions.ts` `decidedByUserId`, `approvedExpenseId` have no
   `.references(...)` and the SQL doesn't either — both layers in sync,
   but both wrong (F3).
3. `audit_log.ts` `chainSeqIdx` is `index(...)` not `uniqueIndex(...)` — SQL
   matches TS but the design intent is unique (F6).
4. `invoices.ts` `paidByIncomeId` no FK in TS, no FK in SQL (F18).
5. All `currency` columns have neither CHECK nor enum (F24).

No drift in column types or NULLability — that's clean.

---

## Footer

This review covers migrations 0000–0009 and all schema files under
`src/lib/server/db/schema/`. The two CRIT items (F1, F2) should be fixed
before audit-log goes to production; everything else is incremental
hardening. The FK gaps (F3, F18) are the next-most-urgent — they're
silent integrity bugs.

— end of review —
