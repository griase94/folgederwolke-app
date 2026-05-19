# Audit-log tamper-evidence — review (2026-05-19)

> Reviewer: cryptography + integrity engineering pass
> Scope: ADR-0004 implementation in `drizzle/0009_audit_log_hardening.sql`,
> `src/lib/server/audit-log/{chain,verifier,index}.ts`,
> `scripts/backfill-audit-chain.ts`, `.github/workflows/audit-anchor.yml`,
> `docs/verfahrensdokumentation/07-unveraenderbarkeit.md`.

## TL;DR

The system **partially delivers** ADR-0004's promise of cryptographic
tamper-evidence, but in its current form it does **not** meet the bar for
GoBD §§ 145–147 AO "Unveränderbarkeit" against an attacker with Postgres write
access, and it does not give a Steuerberater an independent verification path.

Two issues are **show-stoppers**:

1.  Four of the audit row's columns (`actor_kind`, `actor_ip_prefix`,
    `actor_ua_hash`, `entity_business_id`) are stored but **not hashed** — a
    DB-write attacker can swap `actor_kind` from `system` to `user`, rewrite IP
    prefix, or rewrite the human-facing business-id ("AUS-2024-007" →
    "AUS-2024-099") without breaking the chain.
2.  The off-Postgres "anchor" is a weekly CSV dump of every chain row pushed to
    a _single_ private GitHub repo using a single PAT. An attacker who reaches
    Postgres almost certainly also has GitHub Actions secrets access (same
    Vercel-linked GitHub org/repo). There is no second, jurisdictionally
    independent anchor, no signature, no Merkle root, no out-of-band notary.
    The ADR claims "the actual tamper-evidence comes from anchoring … to
    storage that the PG attacker does NOT control" — that property is
    aspirational, not implemented.

In addition, the trigger has a latent race against the `id_counters`
allocator on `hashtext()` collision, the trigger function is not
`SECURITY DEFINER` (so app_runtime's own search_path is in effect), and the
backfill script orders pre-genesis rows by `occurred_at` (which is the _only_
column protected by the resulting hash — circular).

The verifier itself is correct for the columns it covers, and it does catch
the standard payload/prev_hash tamper cases. But it cannot catch tampering of
fields outside the hash, and it cannot catch chain-suffix truncation (see
finding **CRIT-04**).

| Severity  | Count  |
| --------- | ------ |
| CRIT      | 5      |
| HIGH      | 6      |
| MED       | 5      |
| LOW       | 3      |
| NIT       | 2      |
| **Total** | **21** |

Top three by blast radius: **CRIT-01** (un-hashed columns), **CRIT-02** (anchor
is co-located with the attacker), **CRIT-04** (truncation invisible to verifier
between weekly anchors).

---

## Threat model recap

ADR-0004 implicitly defends against three attackers:

| #   | Attacker                                | Properties needed                         | Defended?                                                                                                                                                                 |
| --- | --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Insider with **app_runtime** access     | Cannot UPDATE/DELETE/TRUNCATE audit_log   | **Yes**, via REVOKE (assuming no role escalation).                                                                                                                        |
| B   | Insider with **Neon owner / superuser** | Cannot rewrite history undetectably       | **No**. They can `ALTER TABLE … DISABLE TRIGGER`, rewrite rows, recompute hashes, and then re-enable. The only check is the off-PG anchor, which is co-located (CRIT-02). |
| C   | External attacker post-breach (full DB) | Same as B + cannot evade external auditor | **No** for the same reason.                                                                                                                                               |

The honest statement that should be in ADR-0004: against attackers B and C the
in-DB chain is a **tripwire**, and tamper-evidence relies _entirely_ on the
external anchor. The current anchor design does not provide that.

---

## Findings

### CRIT-01 — Four audit columns are stored but not hashed

`drizzle/0009_audit_log_hardening.sql:78-86` — the `v_concat` recipe only
covers `prev_hash`, `actor_user_id`, `action`, `entity_kind`, `entity_id`,
`occurred_at`, `payload`. Missing from the hash but **present on the row** and
indexed:

- `actor_kind` ("user" vs "system" vs "import" — this is the _first thing_ a
  forensic auditor looks at)
- `actor_ip_prefix`
- `actor_ua_hash`
- `entity_business_id` (the human-facing identifier like `AUS-2024-007` —
  forging this is exactly the GoBD threat: an attacker rewrites which paper
  receipt the row references)
- `id` (UUID PK)
- `payload` _before_ `jsonb_strip_nulls` (a NULL-valued key can be added or
  removed without changing the hash — see HIGH-04)

**Exploit (attacker B/C):**

```sql
-- Re-attribute a sensitive UPDATE action from "system" to "user=alice" so
-- the trail blames the auditor's intern instead of the cron job.
UPDATE audit_log
   SET actor_kind = 'user', actor_ua_hash = 'xxx', actor_ip_prefix = '10.0.0'
 WHERE id = '<row>';
-- Verifier still says ok=true. Anchor CSV unchanged (only chain_seq, row_hash,
-- occurred_at are exported).
```

**Fix.** Extend the hash to _all_ persisted columns except the chain-metadata
columns themselves. Migration sketch (`drizzle/0010_audit_chain_full_columns.sql`):

```sql
CREATE OR REPLACE FUNCTION audit_log_chain_fn() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_prev_seq    integer;
  v_prev_hash   text;
  v_payload     text;
  v_occurred    text;
  v_concat      text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'audit_log is append-only (op=%)', TG_OP;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));
  SELECT chain_seq, row_hash INTO v_prev_seq, v_prev_hash
    FROM audit_log WHERE chain_seq IS NOT NULL
    ORDER BY chain_seq DESC LIMIT 1;
  IF v_prev_seq IS NULL THEN
    v_prev_seq := 0; v_prev_hash := '';
  END IF;
  v_payload := COALESCE(NEW.payload::text, '\N');   -- raw, not stripped
  v_occurred := to_char(NEW.occurred_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US');
  v_concat :=
       v_prev_hash
    || '|' || (v_prev_seq + 1)::text          -- bind to chain position
    || '|' || NEW.id::text                    -- bind to PK
    || '|' || COALESCE(NEW.actor_user_id::text, '\N')
    || '|' || NEW.actor_kind
    || '|' || COALESCE(NEW.actor_ip_prefix, '\N')
    || '|' || COALESCE(NEW.actor_ua_hash, '\N')
    || '|' || NEW.action::text
    || '|' || NEW.entity_kind::text
    || '|' || COALESCE(NEW.entity_id::text, '\N')
    || '|' || COALESCE(NEW.entity_business_id, '\N')
    || '|' || v_occurred
    || '|' || v_payload;
  NEW.chain_seq := v_prev_seq + 1;
  NEW.prev_hash := v_prev_hash;
  NEW.row_hash  := encode(digest(v_concat, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;
```

The `chain.ts`, `verifier.ts`, and `backfill-audit-chain.ts` recipes need the
matching change. The backfill must run before the new trigger ships, and the
ADR needs a "chain v2" section noting that rows with `chain_seq <
$bootstrap_seq` use recipe v1.

---

### CRIT-02 — The off-Postgres anchor is co-located with the attacker

`.github/workflows/audit-anchor.yml:55–93` — the anchor is a `git push` to a
private GitHub repo using a PAT stored as a GitHub Actions secret in the
_same_ GitHub org as the app. Threat-modelling this:

- An attacker who has compromised the app to reach Postgres (the stated threat
  model in ADR-0004) typically also has Vercel project access (env vars,
  rotate-tokens) and very plausibly the GitHub org if the same SSO/owner
  account is shared.
- The anchor token has `Contents:Write` — so the attacker can `git push --force`
  to rewrite history in the anchor repo just as easily as they can rewrite
  Postgres.
- `AUDIT_ANCHOR_REPO` and `AUDIT_ANCHOR_TOKEN` are both _secrets_; the
  resulting attestation is unsigned. There is no proof to a Steuerberater that
  the CSV they're looking at came from Postgres at the timestamp the commit
  claims (the bot's commit metadata is attacker-controllable).
- The Drive backup is `if: false` — not wired.
- "Stub mode" silently `exit 0`s. A misconfigured CI looks identical to a
  successful anchor. There is no alert if anchor pushes stop.

**This is the single biggest gap between ADR-0004's claim and the
implementation.** Without a true out-of-org anchor the in-DB chain is not
tamper-_evident_, only tamper-_resistant_.

**Fix (operational, in order of effort).** Pick at least _two_:

1.  **Sign the anchor.** Generate an Ed25519 key on Andy's hardware, store the
    private key off-cloud (YubiKey, paper backup), publish the public key in
    the verfahrensdokumentation and in the ADR. The workflow signs the CSV
    _and_ the tip hash with `minisign` / `signify` / `ssh-keygen -Y sign`. A
    Steuerberater can verify with the public key alone. Sketch:
    ```yaml
    - name: Sign anchor file
      env:
        SIGNING_KEY_B64: ${{ secrets.AUDIT_ANCHOR_SIGNING_KEY }}
      run: |
        echo "$SIGNING_KEY_B64" | base64 -d > /tmp/sign.key
        ssh-keygen -Y sign -f /tmp/sign.key -n audit-anchor "${AUDIT_FILE}"
        # produces ${AUDIT_FILE}.sig
        shred -u /tmp/sign.key
    ```
    The signing key MUST NOT be the same secret store the app uses.
2.  **Push to a second, independent destination.** AWS S3 with Object Lock
    in compliance mode (immutable for N years) using IAM credentials provisioned
    by Andy's personal AWS account (not the Vercel-integrated one).
3.  **Notarize the tip hash with an external timestamping service** (RFC 3161,
    `openssl ts`, FreeTSA / DigiCert / Sectigo). A signed time-stamp on the
    weekly tip hash gives an attacker no way to rewrite history retroactively.
4.  **Email the tip hash to a fixed external address weekly** as a redundant
    paper-trail (Andy's tax adviser, the Vorstand mailbox).
5.  **Anchor more often than weekly.** A 7-day undetected tampering window is
    very long for GoBD purposes. Move to daily, and consider streaming the
    tip-hash to a public chain (OpenTimestamps Bitcoin attestation is free).
6.  **Detect anchor failure.** Add a daily Vercel-cron task that queries the
    anchor repo via its public API and confirms a commit landed in the last 8
    days. Page Andy if not.

---

### CRIT-03 — Trigger function is not `SECURITY DEFINER` and has no fixed `search_path`

`drizzle/0009_audit_log_hardening.sql:37–93` — the function runs with the
calling role's privileges and the calling role's `search_path`. Two
consequences:

- `digest()` is `pgcrypto`'s extension function; it lives in whichever schema
  `CREATE EXTENSION pgcrypto` placed it (default: `public`). If a future
  migration moves pgcrypto to its own schema, or if a privileged role's
  `search_path` excludes `public`, the trigger silently breaks at the _next
  INSERT_ and the transaction rolls back — but the symptom (every audit-log
  insert failing in production) is catastrophic.
- An attacker with the ability to create objects in any schema on the
  search_path (Neon's default lets `app_runtime` write to public unless
  explicitly revoked) could shadow `digest()` with a function that returns a
  constant. The trigger would then sign every row with the same hash and the
  verifier would still pass.

**Fix.** Add `SECURITY DEFINER` (owned by the migrate role) and a pinned
`search_path`:

```sql
CREATE OR REPLACE FUNCTION audit_log_chain_fn() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$ … $$;
REVOKE EXECUTE ON FUNCTION audit_log_chain_fn() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_log_chain_fn() TO app_runtime;
```

And qualify the call: `encode(public.digest(v_concat, 'sha256'), 'hex')` (or
move pgcrypto to its own schema and qualify accordingly).

---

### CRIT-04 — Verifier cannot detect chain-suffix truncation

`src/lib/server/audit-log/verifier.ts:80–95` — the verifier walks rows
`WHERE chain_seq IS NOT NULL ORDER BY chain_seq ASC` and reports the highest
seen `chain_seq` as `head`. There is **no comparison** against an expected
head value — so if an attacker deletes the last K rows of the chain
(`DELETE FROM audit_log WHERE chain_seq > N`), the verifier sees a perfectly
valid chain of length N and returns `ok: true`.

The off-Postgres anchor records the previous week's head, but:

- nothing in the verifier reads the anchor;
- between two anchor runs (≤ 7 days) the attacker has a full window to
  delete-and-go-undetected;
- the anchor itself is co-located with the attacker (CRIT-02).

Combined with CRIT-02 this means an attacker can quietly trim the tail of the
chain after every Saturday anchor.

**Fix.** Three additions:

1.  Persist `last_observed_head` to `settings` after every successful verify;
    refuse if current head < persisted head. Sketch in `verifier.ts`:
    ```ts
    const persisted = await db.execute<{ value: { seq: number } }>(
      sql`SELECT value FROM settings WHERE key = 'audit_chain_last_head'`,
    );
    const persistedHead = persisted[0]?.value?.seq ?? 0;
    if ((head ?? 0) < persistedHead) {
      breaks.push({
        chainSeq: persistedHead,
        rowId: "<truncated>",
        kind: "chain_suffix_truncated" as never,
        stored: String(head),
        expected: String(persistedHead),
      });
    }
    await db.execute(sql`
      INSERT INTO settings (key, value)
      VALUES ('audit_chain_last_head', jsonb_build_object('seq', ${head ?? 0}))
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        WHERE (settings.value->>'seq')::int < ${head ?? 0}
    `);
    ```
2.  Add an `audit_chain_head` row to a _separate, append-only_ table written
    by the same trigger (so the head is duplicated and harder to silently
    rewrite atomically).
3.  Have the anchor workflow compare each new run's head against the prior
    week's tip file in the anchor repo and _fail loudly_ on regression.

---

### CRIT-05 — Backfill orders pre-genesis rows by `occurred_at`, which the attacker controls

`scripts/backfill-audit-chain.ts:82-84`:

```ts
WHERE chain_seq IS NULL
ORDER BY occurred_at ASC, id ASC
```

`occurred_at` is `DEFAULT NOW()` on the column but is settable from app code
(`logAudit` passes it through to drizzle). Any pre-genesis row whose
`occurred_at` was set by app code (not by `DEFAULT`) is positioned at an
attacker-influenceable point in the chain after backfill. The `id` tiebreak is
a v4 UUID — random — so even ties are non-deterministic across re-runs (the
script is "idempotent" only because re-runs find nothing to do; if backfill is
re-run after a partial failure, the surviving rows can end up in a different
order than the first run intended).

More importantly: the only column on a pre-genesis row that's both
_deterministic_ and _trusted_ is the row's database-assigned `xmin` / `ctid` /
insertion order, which the script does not use.

**Fix.**

- Before backfill, take a snapshot of `(id, occurred_at)` in a side table.
- Order by `(occurred_at, id)` after **verifying** that the (occurred_at, id)
  pair is unique across pre-genesis rows; refuse to run if not.
- Persist the snapshot in the anchor on first run so the ordering is
  externally witnessable.
- Document in ADR-0004 that pre-genesis rows are protected only relative to
  themselves _after backfill_ — they are not retroactively tamper-evident.
- Forbid `logAudit` callers from passing `occurredAt` (`index.ts` doesn't
  accept one today — good — but the trigger reads `NEW.occurred_at` which is
  fed by `DEFAULT NOW()`; harden by `NEW.occurred_at := now() AT TIME ZONE
'UTC';` inside the trigger, ignoring any client-supplied value).

---

### HIGH-01 — `hashtext('audit_log_chain')` collision risk with other advisory locks

`drizzle/0009_audit_log_hardening.sql:55` uses the bare key
`hashtext('audit_log_chain')`. Three other advisory-lock keyspaces exist:

- `id_counter:${year}:${kind}` (`src/lib/server/domain/id-allocator.ts:41`)
- `project_bid:${year}` (`src/lib/server/domain/projects-actions.ts:44`)
- `drive_folder:${settingsKey}` / `drive_subfolder:${appFolderId}:${folderName}`
  (`src/lib/server/drive/client.ts`)

`hashtext` is a 32-bit hash; the birthday-paradox collision probability at
~10⁴ distinct keys is ~10⁻²·³. The real worry isn't a chance collision but
that _the chain insert is correlated with id-allocator advisory locks in the
same transaction_ — `allocateBusinessId` runs first inside an `expense_insert`
transaction, then the audit row is appended, then the chain-trigger advisory
lock fires. If the two `hashtext` values happened to collide:

- the chain trigger would block on the id-counter lock (already held by the
  _same_ transaction → fine, advisory locks are re-entrant per session), but
- if a _different_ transaction holds it for the same shard, both writers
  serialize on a lock they don't realize they share, and any deadlock
  detector trace becomes incomprehensible.

**Fix.** Namespace all advisory locks via a two-arg form so the keyspace is
explicit and disjoint:

```sql
PERFORM pg_advisory_xact_lock(101, hashtext('audit_log_chain'));  -- ns=101
```

And in the TS allocators:

```ts
sql`SELECT pg_advisory_xact_lock(201, hashtext(${`id_counter:${year}:${kind}`}))`;
```

With distinct namespaces (101=audit-chain, 201=id-counter, 202=project-bid,
301=drive) collisions are impossible. Document the namespace registry in
`docs/adr/0004-audit-log.md`.

---

### HIGH-02 — `app_runtime` retains `INSERT` on audit_log but can also `SELECT` and trigger reads other rows

The chain trigger reads `audit_log` (`SELECT chain_seq, row_hash …`). Without
`SECURITY DEFINER` (CRIT-03) it relies on app_runtime's SELECT privilege.
That's the case in `0002_roles.sql:31` (`GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES`, then `REVOKE UPDATE, DELETE` from audit_log only) — so
app_runtime can read every audit row. Combined with the recipe omissions
(CRIT-01), an attacker with app_runtime can:

1.  Read the head row, get its `chain_seq` and `row_hash`.
2.  Insert a chosen row knowing exactly what the chain will look like.
3.  Mutate `actor_kind` / `actor_ip_prefix` on the _just-inserted_ row
    via … wait, UPDATE is revoked. OK, that's a defense — for fields outside
    the hash, the attacker via app_runtime can't change them after the fact.
    But via the **Neon owner** role they can.

Re-state the property:

- ADR-0004 protects against attacker A (app_runtime) for hashed columns only.
- It does not protect against attacker A for un-hashed columns (but app_runtime
  also can't UPDATE them, so the only window is _at INSERT time_, which is the
  attacker setting the value — same as legitimate use).
- It does not protect against attacker B (owner) at all (CRIT-02/03/04).

**Fix.** Document this matrix in ADR-0004 verbatim, and add CRIT-01's column
expansion so the second bullet collapses.

---

### HIGH-03 — `payload` canonicalisation is non-deterministic across Postgres versions

`drizzle/0009_audit_log_hardening.sql:71` casts `jsonb_strip_nulls(NEW.payload)`
to `text`. The trigger and verifier both rely on Postgres producing the same
canonical text form. Postgres documents that `jsonb::text` produces "the JSON
representation" but does **not** promise byte-stable key ordering across
versions or platforms (in practice it sorts by hash since 9.4, but this is
an implementation detail). A future PG major upgrade could change the
serialisation and break verification of all historical rows.

**Fix.**

- Pin the serialisation by computing the canonical form in the trigger
  explicitly: walk the jsonb tree, sort keys lexicographically by codepoint,
  emit compact JSON. Easier path: store a **second** column `payload_canonical
text` written by the trigger using a stable algorithm; never recompute.
- Or pin Postgres major version in `docs/verfahrensdokumentation/02-dv-systemumgebung.md`
  and document a re-anchoring step before any PG major upgrade.
- Cover with an integration test that asserts hash stability across PG
  patch versions (CI matrix on `pg-14`, `pg-15`, `pg-16`).

---

### HIGH-04 — `jsonb_strip_nulls` makes NULL-keyed payload edits invisible

`drizzle/0009_audit_log_hardening.sql:71` strips keys whose value is JSON
`null` before hashing. So `{"amount": 100, "note": null}` and `{"amount":
100}` hash identically. An attacker (or a sloppy bug) can add or remove
`null`-valued keys without breaking the chain. For an _audit log_ this is
explicitly the wrong choice: every byte the user submitted should be in the
hash.

**Fix.** Hash `NEW.payload::text` raw, with `COALESCE(..., '\N')` for the
genuine NULL case (no `payload` at all). If you must canonicalise, do it
deterministically and _before_ the row hits the DB (in `logAudit`), then hash
the bytes you canonicalised — never let Postgres re-canonicalise.

---

### HIGH-05 — No HMAC; in-DB chain is publicly recomputable

ADR-0004 specifies plain SHA-256. Any party with read access (`app_export`,
the Drive backup, the anchor repo's reader) can recompute hashes
identically. That's intended — but it also means an attacker who can write
to the table and recompute hashes can re-sign the chain end-to-end. The only
defense is the external anchor (CRIT-02).

A keyed HMAC with a secret stored **outside** Postgres (Vercel env / AWS KMS)
gives independent value: an attacker with full PG access cannot recompute
valid hashes without the key. The external auditor still verifies because the
key is escrowed (KMS audit trail of `Decrypt` calls) or because a public
commit-and-reveal scheme is used.

**Fix.** Add an HMAC mode behind a feature flag. Migration sketch:

```sql
ALTER TABLE audit_log ADD COLUMN row_hmac text;
-- migrate.ts loads AUDIT_CHAIN_HMAC_KEY from env and writes it to a
-- session-local GUC at connection setup:
--   SET LOCAL app.audit_hmac_key = '<base64 32 bytes>';
-- Trigger reads it:
v_key := current_setting('app.audit_hmac_key', true);
IF v_key IS NULL OR length(v_key) < 16 THEN
  RAISE EXCEPTION 'audit chain: HMAC key not configured';
END IF;
NEW.row_hmac := encode(hmac(v_concat, decode(v_key,'base64'), 'sha256'), 'hex');
```

The trade-off (key rotation, escrow, "what if Andy loses the key") needs an
ADR amendment. Until then, this is a deliberate accepted-risk; document it.

---

### HIGH-06 — Trigger creation precedes pgcrypto extension creation

`drizzle/0009_audit_log_hardening.sql:37-97`:

1.  `CREATE OR REPLACE FUNCTION audit_log_chain_fn()` calls `digest(...)`.
2.  `CREATE EXTENSION IF NOT EXISTS pgcrypto;`

PL/pgSQL function bodies are parsed but not bound at CREATE time, so the
migration succeeds even if pgcrypto wasn't pre-installed. The first INSERT
**after** the migration completes (extension is by then created) works. But
if the migration is interrupted between steps 1 and 2 (e.g. timeout, network
blip), the trigger exists in a database where pgcrypto is missing and **every
subsequent audit_log insert fails** until the extension is created — and
since the migration framework records 0009 as complete only after the whole
file ran, re-running migrate would do nothing.

**Fix.** Hoist the `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to the very top
of the migration. Also consider adding it to `0000_init.sql` so the dependency
is asserted from genesis.

---

### MED-01 — Trigger replays correctly only if `occurred_at` is server-clocked

The hash includes `occurred_at`. The column is `DEFAULT NOW()` but the
trigger uses `NEW.occurred_at` which is client-supplied if the INSERT spells
it out. A buggy or malicious caller can set `occurred_at` arbitrarily (e.g.
"1970-01-01") to position a row in the chain at a misleading wall-clock time
while still satisfying chain_seq ordering. The verifier doesn't check that
`occurred_at` is non-decreasing along the chain.

**Fix.**

- Force `NEW.occurred_at := now() AT TIME ZONE 'UTC';` inside the trigger.
  (Drop the client-supplied value entirely. Document in ADR.)
- Add a CHECK constraint: `occurred_at <= now() + interval '5 seconds'`
  (clock skew).
- Verifier should assert `occurred_at[i] >= occurred_at[i-1]` and report a
  break otherwise (kind: `monotonicity_break`).

---

### MED-02 — `chain_seq` is `integer` (32-bit), not `bigint`

`src/lib/server/db/schema/audit_log.ts:55`:

```ts
chainSeq: integer("chain_seq"),
```

Postgres `integer` = `int4`, max `2_147_483_647`. The system promises 10-year
retention (verfahrensdokumentation §7.3). 2.1B rows / 10 years = ~6.7
rows/second sustained — plausible at scale, certainly within reach if any
high-frequency tracing actions get added. Overflow would cause `INSERT` to
fail (good — better than silent wrap) but the failure mode is "the app stops
writing audit rows" which is a GoBD-breaking outage.

**Fix.** Migrate to `bigint`:

```sql
ALTER TABLE audit_log ALTER COLUMN chain_seq TYPE bigint;
```

TS schema: `bigint("chain_seq", { mode: "number" })` (or string mode for full
precision).

---

### MED-03 — Verifier scans whole chain every night; no resumable cursor

`src/lib/server/audit-log/verifier.ts:80` does a full `ORDER BY chain_seq ASC`
sequential scan. The verifier note acknowledges this is fine "up to a few
million rows". A nightly Vercel cron has a serverless timeout (10–15 min) and
loads every row into memory.

**Fix.**

- Persist the highest verified `(chain_seq, row_hash)` to `settings`. On the
  next run, start from that point.
- Periodically (weekly?) do a full from-genesis verify to catch insertions
  _before_ the resume point (insert with old chain_seq is technically blocked
  by the trigger but a malicious owner could disable the trigger).
- Stream rows instead of `await`-ing the full array; the verifier's loop is
  already O(1)-memory per row, but the postgres-js execute returns a single
  array.

---

### MED-04 — Verifier returns 200 OK on chain breaks (with `errors.audit_chain`)

`src/routes/api/cron/daily-dispatcher/+server.ts:104` returns HTTP 207
multi-status if any task reports an error. That's fine for cron-runner
visibility but there is **no paging integration** — no PushNotification, no
PagerDuty, no email. The ADR explicitly says "failure pages Andy via
PushNotification" (ADR-0004 §3) but the wiring isn't there.

**Fix.** Either (a) add a `sendPushNotification(...)` call in the
`!auditResult.ok` branch of the dispatcher, or (b) wire Vercel monitoring to
page on non-2xx responses from this cron, or both. Update the verfahrens-
dokumentation §4 runbook with a concrete escalation path.

---

### MED-05 — Backfill takes a session-level lock but uses a pooled connection

`scripts/backfill-audit-chain.ts:38,55` — `postgres(url, {prepare:false, max:1})`
and `SELECT pg_advisory_lock(...)`. The script comment says
"DIRECT_DATABASE_URL (NOT the pooled URL — we hold a long lock)" but nothing
_enforces_ that the URL is the direct one. If someone runs it with the pooled
URL by accident, the session-level lock is on a transient pooled session that
PgBouncer / Neon's pooler can hand back to other queries, breaking the
exclusivity guarantee.

**Fix.** Assert before acquiring:

```ts
const isDirect = await db.execute<{ b: boolean }>(
  sql`SELECT current_setting('server_version_num')::int >= 0 AS b`,
);
// Better: check that we're NOT going through pgbouncer
const { rows } = await db.execute<{ app: string }>(
  sql`SELECT application_name AS app FROM pg_stat_activity WHERE pid = pg_backend_pid()`,
);
if (process.env.DIRECT_DATABASE_URL?.includes("-pooler")) {
  throw new Error("Refusing to run backfill on pooled connection");
}
```

And: switch to `pg_advisory_xact_lock` inside a single `db.transaction(...)`
so the lock semantics match the trigger's (xact-scoped, auto-released).

---

### LOW-01 — `verifier.ts` re-canonicalises payload via Postgres at verify time

`src/lib/server/audit-log/verifier.ts:91` selects
`COALESCE(jsonb_strip_nulls(payload)::text, '{}')`. The verifier comment
calls this out as deliberate ("byte-equivalence with the trigger") but it
means the verifier inherits HIGH-03's PG-version sensitivity. If a future
upgrade changes jsonb text form, the verifier and the trigger move in
lockstep — so the verifier always passes — but a CSV anchor exported from
the old PG version no longer matches. Hide this footgun.

**Fix.** When CRIT-01's fix lands and the trigger writes a `payload_canonical
text` column, the verifier just compares to that column without re-running
`jsonb_strip_nulls`.

---

### LOW-02 — `chain.ts` `formatOccurredAtForHash` only has ms precision; trigger has us

`src/lib/server/audit-log/chain.ts:72-73`:

```ts
const us = pad(d.getUTCMilliseconds(), 3) + "000";
```

JS `Date` is ms-precision; the formatter pads with literal `'000'` for the
last 3 microsecond digits. PostgreSQL `timestamp` is microsecond-precision —
a row whose `occurred_at` comes from `now()` typically has nonzero microsecond
digits. The trigger computes the hash with the real microsecond digits; the
verifier (reading rows back via postgres-js) gets a JS `Date` already
truncated to ms. **Result: verifier will mark every row with nonzero
microsecond digits as `row_hash_mismatch`.**

Cross-check: the trigger uses `to_char(occurred_at AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.US')` — `US` is 6-digit microseconds. The verifier
SELECT returns `occurred_at` as a postgres-js driver value, which by default
is converted to a JS `Date` (ms precision). The microseconds are silently
discarded.

This _should_ be currently broken; if existing tests don't catch it, that's
because all chain rows tested so far happen to have us=0 (or the verifier
hasn't been run against real production rows yet). Either way, it's a
ticking time bomb the very first time a real `now()` writes a row with
nonzero microseconds.

**Fix.**

- In the verifier SELECT, return the timestamp as text in the exact trigger
  format:
  ```ts
  to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS occurred_at_str
  ```
  then concat that string directly, bypassing JS `Date` entirely.
- In `chain.ts`, leave the formatter as-is but mark it "for synthetic inputs
  only; never use against rows roundtripped through JS Date".
- Add an integration test that inserts a row via real `now()` and verifies
  the chain. CI should fail today on this.

This deserves an upgrade to **HIGH** if confirmed via integration test.

---

### LOW-03 — Verfahrensdokumentation §7.2.3 understates the recipe

`docs/verfahrensdokumentation/07-unveraenderbarkeit.md:32-36` describes the
recipe as `sha256(prev_hash || canonical_json(row_without_hash_columns))`.
The actual implementation pipes seven specific fields with `|` separators and
`\N` NULL markers. A Steuerberater reading just the dokumentation cannot
verify the chain — they need either `chain.ts` or `0009_*.sql`.

**Fix.** Inline the byte-exact recipe into §7.2.3 with example, separator,
NULL marker, microsecond format, and a worked example (one synthetic row,
intermediate concat string, output hex digest).

---

### NIT-01 — Hash recipe is one-byte ambiguous for empty `prev_hash`

The first row has `prev_hash = ''` and `parts.join('|')` produces a leading
`|`. Concatenations like `'' + '|' + 'create' + ...` and `'\N' + '|' +
'create' + ...` differ by one character, so this is _not_ ambiguous in
practice — but it's worth a comment because reviewers stumble on it.

**Fix.** Add a comment in `chain.ts` and `0009_*.sql` explicitly stating that
`prev_hash` for chain_seq=1 is the **empty string `''`**, NOT `'\N'`, NOT
`'0' * 64`, NOT `'null'`. Document in ADR-0004 too.

---

### NIT-02 — Migration mentions a non-existent `audit_log_chain_trigger`

`docs/verfahrensdokumentation/07-unveraenderbarkeit.md:38` calls the trigger
`audit_log_chain_trigger`. The actual name is `audit_log_chain_trg`. Will
confuse an auditor looking it up in `pg_trigger`.

**Fix.** Search-and-replace `audit_log_chain_trigger` →
`audit_log_chain_trg` in the verfahrensdokumentation.

---

## Verifier walkthrough — one tampering scenario, end-to-end

**Scenario.** An attacker compromises the app and gets `app_runtime` (not
owner). They want to hide that "user=alice" approved an Auslagenerstattung of
€5,000 — make it look like the cron job (`actor_kind='system'`) auto-approved
it instead, so during audit the trail leads to a faceless bot.

**Step 1.** Attacker discovers they cannot UPDATE audit_log (REVOKE in 0009).

**Step 2.** Attacker tries `DELETE FROM audit_log WHERE id=$evil_row;` —
also revoked.

**Step 3.** Attacker inserts a _new_ row at the chain tail saying the
approval was reverted by the bot. Trigger fires, advisory lock acquired,
new row gets `chain_seq = N+1, row_hash = sha256(prev || system_user_id |
revert | ...)`. Verifier accepts.

This step **succeeds** — the attacker has muddied the trail. The append-only
chain doesn't prevent it; it only prevents _deleting the original_. **This
is expected** and is documented in the GoBD model ("Storno + Neubuchung" in
verfahrensdokumentation §7.2.2).

**Step 4.** But the attacker also wants to make the original row look like a
system action, not alice's action. With `app_runtime` they cannot UPDATE. So
this attack stops here for attacker A.

**Step 5.** Attacker now finds a way to escalate to the Neon owner role
(e.g. dump Vercel env, find OWNER_DATABASE_URL in a logged error).

**Step 6.** As owner, attacker `ALTER TABLE audit_log DISABLE TRIGGER
audit_log_chain_trg;` (succeeds — owner can disable triggers).

**Step 7.** Attacker `UPDATE audit_log SET actor_kind='system',
actor_user_id=NULL WHERE id=$evil_row;`. **Verifier still passes** because
`actor_kind` is not in the hash recipe (CRIT-01) — and `actor_user_id` IS in
the hash but the trigger is disabled so the attacker can also recompute
`row_hash` for this row.

**Step 8.** Attacker then `UPDATE audit_log SET row_hash = $new_hash, prev_hash =
$same WHERE id=$evil_row;`. This breaks `prev_hash` on the NEXT row, so the
attacker must rewrite the entire chain suffix from `chain_seq=evil_seq` to
the current head. With the trigger disabled they can.

**Step 9.** `ALTER TABLE audit_log ENABLE TRIGGER audit_log_chain_trg;`

**Step 10.** Next daily verifier run: walks the chain, every row's
`row_hash` is recomputable from the visible fields (the recipe doesn't
include `actor_kind`), every `prev_hash` lines up. **Verifier returns
`ok=true`.**

**Step 11.** Next Sunday's anchor: exports `(chain_seq, row_hash,
occurred_at)` — all consistent — to the private GitHub repo. As the
attacker still has GitHub PAT access (CRIT-02), they can also `--force` push
the anchor repo to match. No external party sees a discrepancy.

**Outcome.** Tampering succeeded undetected.

**Where the system _should_ have caught it:**

- **CRIT-01 fix** would have made step 7 visible: `row_hash` would no longer
  match because `actor_kind` is now hashed.
- **CRIT-02 fix** would have made step 11 hard: the attacker can't forge a
  signature over the new chain without the (offline) signing key.
- **CRIT-04 fix** would have caught the suffix rewrite: `audit_chain_last_head`
  in `settings` would show the old head; rewriting it would itself be a
  tamper signal (and ideally that signal is also anchored externally).
- **HIGH-05 (HMAC) fix** would have made step 8 impossible: without the
  HMAC key the attacker cannot produce valid `row_hmac` values.
- **MED-01 fix** (verifier asserts `occurred_at` monotonicity, owner-disable
  audit) — well, owner-disable is unauditable from PG's catalog directly,
  but it's reflected in `pg_event_trigger`s which the daily verifier could
  inspect.

---

## Recommendations (priority order)

1.  **Land CRIT-01.** Hash every persisted column, not just the seven in the
    current recipe. New migration + matching `chain.ts` / `verifier.ts` /
    backfill. Tag the chain "v2" and document the boundary chain_seq.
2.  **Land CRIT-04.** Persist the head to `settings`; verifier refuses on
    regression; anchor compares against prior tip.
3.  **Land CRIT-03.** `SECURITY DEFINER`, fixed `search_path`, qualified
    `public.digest()`, REVOKE EXECUTE FROM PUBLIC.
4.  **Land HIGH-06.** Hoist `CREATE EXTENSION pgcrypto` above the function
    definition, and also add it to `0000_init.sql`.
5.  **Land LOW-02 (escalate to HIGH on confirmation).** Fix the microsecond
    precision bug in the verifier SELECT. Run an integration test today.
6.  **Begin CRIT-02 mitigation now.** Even before HMAC: sign the weekly
    anchor with an Ed25519 key whose private half lives on Andy's YubiKey,
    publish the public key in ADR-0004 and verfahrensdokumentation. Add a
    second anchor destination (S3 Object Lock in Andy's personal AWS, or
    OpenTimestamps Bitcoin attestation). Wire the missing failure paging.
7.  **Land MED-01.** Trigger sets `occurred_at := now()` itself; verifier
    asserts monotonicity.
8.  **Plan HIGH-05.** ADR amendment for HMAC mode + key escrow story.
    Migration sketched above.
9.  **Land MED-02.** `chain_seq bigint`.
10. **Land HIGH-01.** Two-arg `pg_advisory_xact_lock` with explicit namespace
    integer.
11. **Land HIGH-03.** Stable canonicalisation written by the trigger into a
    new `payload_canonical text` column; verifier compares against that
    column, not against re-canonicalising.
12. **Land HIGH-04.** Hash `payload::text` raw; document.
13. **Land MED-03.** Resumable verifier.
14. **Land MED-04.** Page on chain break.
15. **Land MED-05.** Backfill refuses pooled URL; use xact-scoped advisory
    lock inside a transaction.
16. **Land LOW-03, NIT-01, NIT-02.** Documentation cleanup so the
    verfahrensdokumentation is a self-contained verification spec a
    Steuerberater can act on without reading TypeScript.
17. **Re-write ADR-0004** to reflect the actual threat model the
    implementation defends: app_runtime is bounded; owner/external-attacker is
    _only_ bounded by the external anchor; the GoBD claim is conditional on
    the anchor being well-engineered. Today the ADR overclaims.

---

## Appendix — files reviewed

- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/drizzle/0002_roles.sql`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/drizzle/0009_audit_log_hardening.sql`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/src/lib/server/audit-log/chain.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/src/lib/server/audit-log/verifier.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/src/lib/server/audit-log/index.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/src/lib/server/db/schema/audit_log.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/src/lib/server/domain/cron-tasks.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/src/lib/server/domain/id-allocator.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/src/routes/api/cron/daily-dispatcher/+server.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/scripts/backfill-audit-chain.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/scripts/migrate.ts`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/scripts/seed.ts` (genesis section)
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/.github/workflows/audit-anchor.yml`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/adr/0004-audit-log.md`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/verfahrensdokumentation/07-unveraenderbarkeit.md`
- `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/tests/unit/audit-chain.test.ts`
