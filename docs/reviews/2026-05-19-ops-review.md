# Operations / SRE Review — folgederwolke-app

**Date:** 2026-05-19
**Reviewer:** SRE / operations audit (backups, restore, monitoring, deploy, on-call)
**Scope:** `docs/RUNBOOK.md`, `.github/workflows/{ci,db-backup,audit-anchor,security}.yml`,
`scripts/{migrate,restore-smoke}.ts/.sh`, `docs/verfahrensdokumentation/11-notfall-konzept.md`,
`docs/legal/auftragsverarbeitung/README.md`, `vercel.json`, `svelte.config.js`,
`src/hooks.server.ts`, `src/routes/healthz/+server.ts`, `src/routes/api/cron/*`,
`src/lib/server/env.ts`, `.env.example`, `.gitignore`.

---

## TL;DR

**The app is NOT operationally launch-ready for the public form.** The core
mechanisms (nightly encrypted backup, audit-anchor, healthz, Vercel rollback,
restore RUNBOOK §2) exist on paper and many of them work, but the chain of
dependencies that protects an actual production incident has multiple unfixed
breaks:

- The restore-smoke test does **not exercise the real schema** (it invents a
  4-column mini-`expenses` table and asserts on that). A real production dump
  has never been proven to restore end-to-end in CI.
- No backup has ever been written by this repo (the workflow ships but the
  required GitHub secrets — `DATABASE_URL_BACKUP`, `BACKUP_REPO`,
  `BACKUP_TOKEN`, `BACKUP_AGE_RECIPIENT`, `DRIVE_BACKUP_FOLDER_ID` — are not in
  any committed artifact; failure mode is silent skip → green workflow → no
  data saved). Same shape for audit-anchor.
- No alerting whatsoever. If `db-backup.yml` returns exit 0 with the
  "Drive credentials not fully configured — skipping" branch every single
  night, the operator has no signal. If `daily-dispatcher` cron detects an
  audit-chain break, the result is a 207 JSON body in a Vercel function log
  that nobody reads.
- `DPA_GATE_PASSED` is documented in `docs/legal/.../README.md` as the gate
  that blocks `PUBLIC_FORM_ENABLED=true`, but is **not referenced anywhere in
  code**. The form is enabled-by-default in `env.ts` (`PUBLIC_FORM_ENABLED`
  defaults to `"true"`).
- The "manual migration step" (`scripts/migrate.ts`) is **not wired into any
  CI/CD path** — every prod deploy ships an app that may be ahead of the live
  schema. There is no boot-time schema-version check.
- `1Password` is referenced as the canonical store for the age private key
  and rotated secrets but the vault name is undocumented; if Andy is
  unavailable, nobody else knows where to look.

Counts: **6 CRIT, 8 HIGH, 9 MED, 6 LOW** (29 total).

---

## RPO / RTO assessment — concrete numbers

| Layer                         | Documented RPO            | Realistic RPO today         | Documented RTO | Realistic RTO today |
| ----------------------------- | ------------------------- | --------------------------- | -------------- | ------------------- |
| Vercel rollback (app-only)    | 0                         | 0                           | < 5 min        | < 5 min ✓           |
| Neon Point-in-Time-Restore    | up to 24h (within 7 days) | depends on Neon plan tier   | < 30 min       | unverified — see H2 |
| Nightly age-encrypted pg_dump | 24h                       | **∞ until secrets are set** | < 2h           | **untested**        |
| Google Drive secondary copy   | 24h                       | **same as above**           | < 1h           | untested            |
| Audit-log off-Postgres anchor | 7 days                    | **∞ until secrets are set** | n/a (forensic) | n/a                 |

The Notfall-Konzept table (`docs/verfahrensdokumentation/11-notfall-konzept.md`
§11.3) advertises the **documented** column. The **realistic** column shows
what would actually happen on 2026-05-19 if Neon were lost: the operator has
no encrypted dump, no Drive copy, and no anchor — only whatever Neon's
internal PITR retains, which depends on the Neon plan (Free is 7 days; if the
project is on Free and the loss is older than 7 days the data is gone).

**Action**: nothing in this report is meaningful until the Day 1 checklist is
done.

---

## Findings

Severity scale: **CRIT** = blocks launch / data-loss risk;
**HIGH** = ship now, fix within a week, accept controlled risk;
**MED** = should be fixed before Phase 2 close;
**LOW** = nice-to-have / polish.

---

### CRIT-1 — restore-smoke does not actually test the production restore path

**Where documented:** `docs/verfahrensdokumentation/02-dv-systemumgebung.md`
§2.7: "Restore-Test: täglich in CI via `scripts/restore-smoke.sh`."
`docs/RUNBOOK.md` §5.3: "Run restore smoke test locally".

**What the code does:** `scripts/restore-smoke.sh` (lines 56-83) **creates its
own minimal SQL schema** with 4 enum types and a single `expenses` table that
has none of the audit-log columns, no hash-chain trigger, no `app_export`
role, no `chain_seq`, and 2 fixture rows. It then `pg_dump`s that mini-schema,
runs `pg_restore`, and asserts `COUNT(*) >= 1` and that a `business_id` text
field exists. **A real Neon production dump has never been validated through
this pipeline.**

**Gap:** A schema or extension change (e.g. `pgcrypto` missing on the restore
target, a new enum value, `digest()` unavailable, advisory locks held across
restore, the `0009_audit_log_hardening` trigger function returning errors
because `app_runtime` does not exist on the restore target) would all pass
smoke today and fail on the actual disaster restore.

**Fix:**

1. Replace the inline `FIXTURE_SQL` heredoc with `pnpm tsx scripts/migrate.ts`
   against the scratch DB (the same migrator the live DB uses).
2. Use `scripts/seed-fixtures.ts` to insert ≥ 5 rows across each of:
   `members`, `expenses`, `auslagen_submissions`, `audit_log`,
   `sent_mails`, `settings`, `invoices`.
3. After `pg_restore`, assert: (a) row counts match per-table, (b)
   `SELECT MAX(chain_seq) FROM audit_log` returns the same value as
   before dump, (c) `verifyAuditChain()` returns `ok: true`,
   (d) `app_runtime`, `app_migrate`, `app_export` roles exist with the
   expected privileges, (e) the chain-trigger function exists and is
   attached to `audit_log`.

---

### CRIT-2 — `PUBLIC_FORM_ENABLED` defaults to `true` and `DPA_GATE_PASSED` is unenforced

**Where documented:** `docs/legal/auftragsverarbeitung/README.md` lines 9-21:
"`PUBLIC_FORM_ENABLED=true` darf im Produktionsbetrieb ERST gesetzt werden,
wenn Vercel-AVV und Neon-AVV den Status `signed` haben. … Die
Umgebungsvariable `DPA_GATE_PASSED=true` in `.env.production` und Vercel erst
setzen, wenn beide kritischen AVVs unterschrieben sind."

**What the code does:**

- `src/lib/server/env.ts` line 42: `PUBLIC_FORM_ENABLED:
z.string().default("true").transform(v => v === "true")` — defaults to `true`
  when env var is absent.
- `DPA_GATE_PASSED` does not appear in `src/lib/server/env.ts`, anywhere in
  `src/`, in `scripts/`, or in `.github/workflows/`. The "gate" is a
  documentation artefact only.
- All three DPA statuses are `TODO` (Vercel, Neon, Google).

**Gap:** A merge to `main` deploys to Vercel; if Andy forgets to override
`PUBLIC_FORM_ENABLED` it ships enabled by default, even with all DPAs
unsigned. This is the inverse of safe-by-default.

**Fix:**

1. In `env.ts`, change the default to `"false"`.
2. Add `DPA_GATE_PASSED: z.string().default("false").transform(v => v === "true")`.
3. In `src/routes/auslage-einreichen/+page.server.ts`, gate on
   `env.PUBLIC_FORM_ENABLED && env.DPA_GATE_PASSED`. Return 404 if either is
   false.
4. Add a startup log line at app boot:
   `console.warn("[boot] public form gate: PUBLIC_FORM_ENABLED=… DPA_GATE_PASSED=…")`.

---

### CRIT-3 — Backup workflow silent-skips when secrets are missing

**Where documented:** `.github/workflows/db-backup.yml` lines 4-13 list the
required secrets; lines 86-89, 115-120 contain the graceful-skip behaviour.
RUNBOOK does not enumerate the secrets that must be set in GitHub Actions.

**What the code does:** If `BACKUP_REPO`/`BACKUP_TOKEN` are unset, step 4
exits 0 with `echo "BACKUP_REPO or BACKUP_TOKEN not set — skipping GitHub
push"`. If `DRIVE_BACKUP_FOLDER_ID`/`GOOGLE_OAUTH_*` are unset, step 5 does
the same. The workflow ends with a green checkmark and a summary like:

> ## Backup Summary
>
> - Timestamp: 20260519T023000Z
> - Encrypted file: backup-….dump.age
> - GitHub repo: `not configured`

Nobody is alerted. The workflow has run successfully but produced nothing.

**Gap:** Cron jobs that "succeed by doing nothing" are the textbook silent
failure. On day 14 you can have zero backups and a green Actions tab.

**Fix:**

1. Treat unconfigured secrets as **build failure** in production. The
   `exit 0` branches should be gated by an explicit
   `ALLOW_BACKUP_STUB=true` env var; if unset, `exit 1`.
2. Add a step at the very top of the job:
   ```yaml
   - name: Verify required secrets
     run: |
       for var in DATABASE_URL_BACKUP BACKUP_REPO BACKUP_TOKEN BACKUP_AGE_RECIPIENT \
                  GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_REFRESH_TOKEN DRIVE_BACKUP_FOLDER_ID; do
         if [ -z "${!var:-}" ]; then echo "::error::$var not set"; exit 1; fi
       done
     env:
       DATABASE_URL_BACKUP: ${{ secrets.DATABASE_URL_BACKUP }}
       …
   ```
3. Configure workflow-failure notification (email or Slack via
   `actions/github-script` posting to a webhook). GitHub does send an email
   to the repo admin by default on workflow failure if Actions email
   notifications are enabled in personal settings — verify this is on for
   `griase94`.

---

### CRIT-4 — No application-level monitoring / alerting

**Where documented:** Nothing. `docs/RUNBOOK.md` never references Sentry,
Datadog, BetterStack, uptime monitoring, Vercel Log Drains, or any alert
recipient.

**What the code does:** Errors are written to `console.error()` and end up
in Vercel function logs. Vercel free-tier retention is 1 hour for runtime
logs.

**Gap:** A 500-spike, an audit-chain break, an OAuth token expiry, a Neon
suspension, a Drive quota exceed — all of these are invisible to the
operator unless they happen to be looking at the dashboard.

**Fix (minimum viable):**

1. Add a free-tier uptime monitor (UptimeRobot, BetterStack free, or
   Vercel Built-in Monitoring) pointing at `https://folgederwolke-app.vercel.app/healthz`
   with 5-minute interval. Alert on non-200.
2. Set up Vercel Log Drain to a long-retention store (LogTail/Better Stack
   free tier accepts Vercel drains). Without this, a post-mortem 24h after
   an incident has nothing to read.
3. Add Sentry (free tier, 5k errors/month is plenty for an internal app):
   in `src/hooks.server.ts` add `handleError` handler. Sentry-as-a-DPA
   is documented separately.

Without these, RUNBOOK §3 "Investigate" steps cannot be triggered — you
won't know there's anything to investigate.

---

### CRIT-5 — No migration step in CI/CD; no boot-time schema-version check

**Where documented:** `scripts/migrate.ts` exists; RUNBOOK does not mention
when it runs. `docs/verfahrensdokumentation/02-dv-systemumgebung.md` §2.6
shows the deploy flow as `git push → CI → Vercel → main → Production` —
**no migration step**.

**What the code does:** Migrations live in `drizzle/0000–0009_*.sql`.
`scripts/migrate.ts` runs `drizzle-orm/postgres-js/migrator` and requires
`DIRECT_DATABASE_URL`. It is invoked nowhere automatically.

**Gap:** If a PR adds `drizzle/0010_*.sql`, merging it ships app code that
expects a new column; Vercel deploy succeeds (build is schema-agnostic);
production runtime fails on first query against the missing column. There is
no `boot()` hook that checks `SELECT max(id) FROM drizzle_migrations` against
the committed migration list. The "manual `pnpm tsx scripts/migrate.ts`"
implicit step is not documented in RUNBOOK and not in any deploy procedure.

**Fix:**

1. Add `scripts/migrate.ts` invocation either:
   - As a Vercel `build` step that runs `pnpm tsx scripts/migrate.ts && pnpm build` (requires `DIRECT_DATABASE_URL` in Vercel env), **or**
   - As a GitHub Actions job that runs against prod after merge to `main` and before tagging the deploy as healthy.
2. Add a boot-time check in `src/hooks.server.ts` (one-shot, behind a module
   flag): query `SELECT count(*) FROM drizzle_migrations` and log the
   highest applied migration; warn if it does not match the count of `.sql`
   files in `./drizzle/` shipped in the bundle.
3. Document the migration step in `RUNBOOK.md` §6 (new section "Deploy a
   schema change").

---

### CRIT-6 — Audit-anchor and backup secrets cannot be re-derived from this repo

**Where documented:** Listed in workflow comments. `docs/RUNBOOK.md` §1.5
covers `BACKUP_AGE_RECIPIENT` rotation. `1Password` item names are listed
("folgederwolke-app / age backup key", "folgederwolke-app / SESSION_SECRET",
"folgederwolke-app / GOOGLE_OAUTH_REFRESH_TOKEN").

**Gap:** The 1Password **vault name** is never stated. The shape (Personal /
Team / Business) is never stated. If Andy is in hospital on day 30, the
Vorstand member who reads RUNBOOK has no idea where the age private key
lives, who has the account, or what to ask. The "Notfall-Kontakte" table in
`11-notfall-konzept.md` §11.2 has placeholders: `<!-- FILL: Telefon -->`,
`<!-- FILL --> | <!-- FILL -->` for Kassenwart and 1. Vorstand. The
Steuerberater contact (`§4.4`) is also `<!-- FILL: Steuerberater Kontakt -->`.

**Fix:**

1. Fill in `docs/verfahrensdokumentation/11-notfall-konzept.md` §11.2 with
   actual names + phone numbers (this is German legal documentation; the
   gaps render the Notfallkonzept void for DSGVO Art. 32).
2. Add a section to RUNBOOK §1 "Where secrets live" — explicit 1Password
   vault name, account email used to sign in, who is shared on each item,
   and a fallback recovery path (e.g. a paper copy of the age private key
   in a bank safe).
3. Document Steuerberater in §4.4.

---

### HIGH-1 — `/healthz` response shape diverges from documentation

**Where documented:** RUNBOOK §1.3 step 4, §2.1 step 9, §3.2:
`Expected: {"status":"ok","db":"connected"}`.

**What the code does:** `src/routes/healthz/+server.ts` returns
`{ db: "ok" | "fail", drive: "ok" | "skip" | "fail", sha, deployedAt }` with
status 200 (if db=ok) or 503 (otherwise). There is no `status` field and no
`db: "connected"` string.

**Gap:** Anyone following RUNBOOK to verify a restore by `grep`ing for the
documented string will fail. Uptime monitors written against the documented
shape will produce false positives.

**Fix:** Either update `healthz/+server.ts` to also emit `status: "ok"|"fail"`
and `db: "connected"|"down"` aliases, or update RUNBOOK to match the actual
response. Prefer the latter — `db: "ok"` is the right field.

---

### HIGH-2 — Neon PITR retention is asserted but unverified

**Where documented:** `11-notfall-konzept.md` §11.3 says Neon PITR is
"bis zu 24h (7-Tage-Fenster)".

**What the code does:** Nothing in this repo verifies the Neon plan tier
or the actual PITR retention setting on the project.

**Gap:** Neon's Free plan has 1-day history retention, the Launch plan has
7 days, the Scale plan has 14 days. If the project is on Free, the 7-day
documented number is wrong — RTO/RPO is overstated. There is no recorded
artifact saying which plan the project is on.

**Fix:**

1. In RUNBOOK §2.1 Option A, prepend: "Neon plan tier: <Launch|Scale>.
   Actual PITR retention: N days. Verify in Neon Console → Project Settings
   → History."
2. Add a recurring Day-30 checklist item to re-verify.

---

### HIGH-3 — Backup-restore-smoke runs on every push but does not fail prod deploys

**Where documented:** CI comment in `.github/workflows/ci.yml` line 113:
"Phase 7.5: smoke-test the restore pipeline on every push."

**What the code does:** The `backup-restore-smoke` job is a normal CI job
in `ci.yml`. Vercel's GitHub integration auto-deploys `main` on push
regardless of GitHub Actions state unless the project is configured with
"Ignored Build Step" / "Deployment Protection" / required status checks.

**Gap:** A red `backup-restore-smoke` does not block a Vercel production
deploy by default. The protection is a GitHub branch-protection rule on
`main` requiring this status check + the Vercel "Deploy Hooks" feature.
There is no `.github/branch-protection.yml` or terraform manifest, no docs
saying "I have configured this in GitHub Settings".

**Fix:**

1. Set GitHub branch protection on `main`: require `unit-and-types`,
   `build`, `e2e`, `backup-restore-smoke`, `semgrep`, `gitleaks`, `audit`
   as required status checks; require at least 1 approval; no force-push.
2. In Vercel: Settings → Git → enable "Required Checks before Deploy" (or
   equivalent) so a red CI does not auto-promote to production. Vercel-side
   "Deployment Protection" includes "Production Deployment Protection" which
   can be wired to a Branch-Protection setting.
3. Document the exact branch-protection settings in RUNBOOK §6 (new section).

---

### HIGH-4 — Backup contains no integrity check (no checksum, no test-restore)

**Where documented:** None.

**What the code does:** `db-backup.yml` runs `pg_dump`, encrypts, pushes,
exits. Nothing reads back the pushed file and verifies (a) it can be
decrypted with a known-good identity (b) `pg_restore --list` on it produces
a sensible TOC.

**Gap:** A corrupted dump (network truncation, age recipient typo) is only
detected when an actual restore is attempted — i.e. at the worst possible
moment.

**Fix:** Add a step 4.5 to `db-backup.yml`:

```yaml
- name: Verify dump TOC
  run: |
    age --decrypt --identity <(echo "$AGE_VERIFY_IDENTITY") "${ENCRYPTED_FILE}" \
      | pg_restore --list > /dev/null
  env:
    AGE_VERIFY_IDENTITY: ${{ secrets.BACKUP_AGE_VERIFY_IDENTITY }}
```

Use a **separate, throw-away** age identity (not the primary one in
1Password) so CI never sees the real recovery key. The identity is for
verification only and is rotated independently.

(Alternative: encrypt to multiple recipients — main key in 1Password +
a CI-only verifier key — using `age --recipient … --recipient …`.)

---

### HIGH-5 — Drive upload uses OAuth refresh-as-Andy, not a service account

**Where documented:** `.env.example` line 13 marks the OAuth grant as
"OAuth-as-Andy, scope: drive.file + documents + spreadsheets.readonly".

**What the code does:** `db-backup.yml` step 5 obtains an access token from
the refresh token (lines 122-128) and uploads via resumable Drive upload.
If Andy's Google account is suspended, the refresh token revoked, OAuth
consent screen needs re-verification (every 7 days for unverified apps in
testing mode), or 2FA recovery — the backup silently fails.

**Gap:** Single point of failure on Andy's personal Google account. A
Workspace service account with `drive.file` scope on a folder owned by the
service account, or a delegated Workspace identity, is the standard
production pattern.

**Fix:** Migrate the Drive upload to a service-account key (Workspace if
the org has one; personal GCP project with delegated access otherwise).
Plumb `GOOGLE_DRIVE_SA_KEY_JSON` into `db-backup.yml` and the audit-anchor
workflow (TODO step in `audit-anchor.yml` line 95). Document in RUNBOOK
that the SA key rotation procedure is separate from
`GOOGLE_OAUTH_REFRESH_TOKEN`.

---

### HIGH-6 — Audit-anchor stub mode: no signed commits, no off-network witness

**Where documented:** `.github/workflows/audit-anchor.yml` lines 21-27
("If any of the _*ANCHOR*_ secrets is unset, the push step exits 0 (stub
mode) so the workflow doesn't fail loudly until Andy has provisioned
them.").

**What the code does:**

- Workflow runs weekly; if secrets missing, no anchor is committed; no
  alert.
- When secrets are set, the bot pushes a CSV to a private repo. The commit
  is **not GPG-signed**. The git history of the anchor repo is the only
  tamper-evidence; an attacker with `AUDIT_ANCHOR_TOKEN` could rewrite
  history.

**Gap:**

1. Stub-mode silent failure (same shape as CRIT-3).
2. No signed commits → the tamper-evidence story relies on "GitHub keeps
   logs", which the anchor's whole point was to avoid.
3. No second witness — the comment promises a Drive copy (line 95-97) but
   it is `if: false`, so 1-of-1, not 2-of-2.

**Fix:**

1. Require all `AUDIT_ANCHOR_*` secrets and fail loudly if missing.
2. Configure the bot identity to sign commits (`git config user.signingkey`,
   `git commit -S`); store the bot's GPG private key in GH Actions
   encrypted secrets.
3. Wire the Drive backup (remove `if: false`, use the same SA from
   HIGH-5).
4. Optional but cheap: also POST the tip-hash to a free public timestamping
   service (OpenTimestamps; `ots stamp anchor-….csv`) — gives third-party
   evidence with no operator dependency.

---

### HIGH-7 — `daily-dispatcher` audit-chain break has no out-of-band alert

**Where documented:** `src/routes/api/cron/daily-dispatcher/+server.ts`
lines 81-92 surface chain breaks as `errors.audit_chain` in the JSON
response body. The cron returns HTTP 207.

**What the code does:** A chain break — the single highest-priority signal
the app produces — ends up as a string in a JSON body in a Vercel function
log line.

**Gap:** Vercel cron failures are visible in the Vercel dashboard but no
mail/SMS/Slack alert is configured. A successful 207 is "succeeded" from
Vercel's standpoint. The operator does not know.

**Fix:**

1. Inside `runAuditChainVerification`, if `!result.ok`, also POST to an
   alert webhook (Discord webhook, Slack, etc.) using `fetch()` with the
   chain head + first 5 break rows. Webhook URL is a Vercel env var,
   defaults to no-op if unset.
2. Set the cron response to 500 (not 207) on chain break so Vercel's
   "Cron Health" UI shows it as red.

---

### HIGH-8 — `daily-dispatcher` cron has no missed-run recovery

**Where documented:** None.

**What the code does:** Vercel cron is best-effort: if a region is down at
03:00 UTC, the run is skipped. The next attempt is 24h later. The
`runAuditChainVerification`, `cleanupMagicLinks`, `cleanupSessions`, and
`retryFailedDriveUploads` calls assume "ran yesterday".

**Gap:** A 3-day cron gap means: (a) expired magic_links accumulate (low
risk, but a security hygiene regression); (b) audit chain is not verified
for 72h — if a tamper happens in that window, it is detected on a 4-day
delay; (c) Drive uploads stay in failed state.

**Fix:**

1. Add a "last run at" row in `settings` (key=`cron_last_run_<task>`).
2. On each run, compare `now() - last_run` to the expected interval; if
   > 1.5× interval, log a warning and call the alert webhook.
3. None of the dispatcher tasks are time-window-bound (no per-day work),
   so missed runs catch up automatically — but the gap signal still
   matters for monitoring.

---

### MED-1 — `CRON_SECRET` missing from `.env.example`

**Where documented:** `src/lib/server/env.ts` line 49 declares
`CRON_SECRET: z.string().default("")`. Comments say "Secret shared between
Vercel cron scheduler and the app."

**What the code does:** If `CRON_SECRET` is unset, both cron endpoints
return 401 to every caller (`isCronAuthorized` returns false when
`!cronSecret`). The app silently rejects all crons.

**Gap:** A developer fresh-cloning the repo and following `.env.example`
will not set `CRON_SECRET`, deploy, and have non-functioning crons with
no error message.

**Fix:** Add to `.env.example`:

```
# Cron auth — Vercel sets Authorization: Bearer ${CRON_SECRET}
# Generate: openssl rand -base64 32
CRON_SECRET=
```

---

### MED-2 — `.env.example` missing GitHub-Actions-only secrets

**Where documented:** Workflow files list them in comments;
`.env.example` does not.

**What the code does:** `db-backup.yml` and `audit-anchor.yml` require:
`DATABASE_URL_BACKUP`, `BACKUP_REPO`, `BACKUP_TOKEN`,
`BACKUP_AGE_RECIPIENT`, `DRIVE_BACKUP_FOLDER_ID`, `AUDIT_ANCHOR_REPO`,
`AUDIT_ANCHOR_TOKEN`. None are in `.env.example`.

**Gap:** New operators have no consolidated view of "what secrets does this
repo need". `.env.example` covers app runtime; the GitHub Actions secrets
are separately documented in workflow comments only.

**Fix:** Add a "GitHub Actions secrets (not used at runtime)" section at
the bottom of `.env.example` enumerating every secret name with a one-line
purpose. Or, better, create `docs/SECRETS.md` listing every secret across
all three planes (Vercel env, GH Actions secrets, 1Password items), each
with: name, purpose, rotation cadence, owner, where it is set.

---

### MED-3 — `pg_dump` runs against `app_export` but app code uses `DATABASE_URL`

**Where documented:** `.github/workflows/db-backup.yml` line 6 says
"role: `app_export`, direct URL". CLAUDE.md §"Database roles" table
specifies `app_export` is for "tax export and backup tooling".

**What the code does:** The workflow trusts the secret value. Nothing
enforces that the connection string in `DATABASE_URL_BACKUP` actually uses
the `app_export` role. If an operator pastes the `app_runtime` connection
string by mistake, `pg_dump` still works and the backup succeeds, but the
security boundary is broken.

**Gap:** Soft control; relies on operator discipline.

**Fix:** First step in the backup job: `psql "${DATABASE_URL}" -c
"SELECT current_user;"`; assert output is `app_export`.

---

### MED-4 — Restore RUNBOOK §2.1 "B" Step 2: which dump to restore is unspecified

**Where documented:** `docs/RUNBOOK.md` §2.1 Option B step 2:
`ls -la *.dump.age | tail -10` — "Identify the dump to restore".

**Gap:** A backup repo with 365 nightlies and 5 ad-hoc dumps lists files
without sizes-vs-row-counts or content summaries. The operator has no way
to know "which one is closest to the point I want to restore to". Filenames
like `backup-20260519T023000Z.dump.age` give timestamp but not the chain
head, dump size delta, or "the one that contains the row I'm trying to
recover".

**Fix:**

1. Backup commit message format: `backup: ${ENCRYPTED_FILE} (rows: …, audit_chain_head: …, db_size: …)`. Add a pre-encrypt
   step that emits these statistics into the commit message.
2. RUNBOOK §2.1 B step 2: explicit guidance — "Find the dump immediately
   before the suspected incident time. Use `git log --oneline backup-repo/`
   and read commit messages to find chain heads."

---

### MED-5 — Restore RUNBOOK §2.1 "B" Step 4 hand-waves the Neon branch creation

**Where documented:** `docs/RUNBOOK.md` §2.1 B step 4: "Neon Console →
Branches → New Branch → 'restore-YYYY-MM-DD'. Copy new branch
DATABASE_URL (direct, not pooled) → RESTORE_URL".

**Gap:** A new branch in Neon inherits from the current main; restoring a
dump into it requires either: (a) wiping the inherited data first
(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` — risky, must run as
DB owner), or (b) using `pg_restore --clean --if-exists`. The current step
5 (`pg_restore --no-owner --no-acl --exit-on-error`) does **not** clean.
First object-already-exists error halts the restore.

**Fix:** Either:

1. Document that the restore branch must be created from a **specific
   timestamp prior to the start of the dump file** (Neon Branches → from
   PITR), so the schema is empty/old. Or
2. Change the restore command to:
   ```bash
   pg_restore --no-owner --no-acl --clean --if-exists --exit-on-error \
     -d "${RESTORE_URL}" backup-TARGET.dump
   ```
3. Add a 2c-equivalent: `psql -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT … TO …;"` before restore, owned by `app_migrate`.

Then update `scripts/restore-smoke.sh` so this exact command path is
exercised in CI (closes CRIT-1 partly).

---

### MED-6 — Restore RUNBOOK §2.1 "B" Step 7: audit-chain verification is gestured at

**Where documented:** RUNBOOK §2.1 step 7: "Verify audit chain integrity
(see §4 below)". §4.1 has the verification SQL.

**Gap:** The §4.1 SQL is the **Phase 7.5 in-DB** verifier — it relies on
`canonical_json()` SQL function (line 252: "canonical_json() is defined in
drizzle/sql/functions/canonical_json.sql"). I cannot find that file in the
`drizzle/` tree. Looking at the actual hash recipe in
`drizzle/0009_audit_log_hardening.sql` lines 71-89, the hash is a
pipe-separated string concat (`v_concat := v_prev_hash || '|' || …`), not
`canonical_json()`. The RUNBOOK SQL would compute the wrong hash and
flag every row as tampered.

**Fix:** Replace the §4.1 SQL with the exact recipe from
`drizzle/0009_audit_log_hardening.sql` lines 71-89, or replace the §4.1
SQL with `SELECT (verifyAuditChain()).ok` via a SQL function wrapper, or
delete §4.1 SQL and say "run `pnpm tsx scripts/verify-audit-chain.ts`"
(which does not currently exist — create it).

---

### MED-7 — `daily-dispatcher` and `beitragsreminder` rate-limit attempts table cleanup is silent

**Where documented:** `src/routes/api/cron/daily-dispatcher/+server.ts`
line 63 cleans `rate_limit_attempts > 1 hour`.

**Gap:** If rate-limit cleanup silently fails for a week, the table grows
unbounded. There is no alert, no per-task metric, no record of the
cleanup result anywhere except a Vercel log line.

**Fix:** Persist each task result in a `cron_runs` table:
`(task_name, started_at, finished_at, ok, result_jsonb)`. Then `/healthz`
can include `cron_lag` (max age across tasks). A new dashboard widget
shows it.

---

### MED-8 — No documented Vercel rollback procedure for "the latest deploy is broken AND I do not know which previous deploy is healthy"

**Where documented:** RUNBOOK §3.2: `vercel rollback` (interactive).

**Gap:** "Interactive" assumes a healthy human in front of a terminal. For
an out-of-band incident (Andy AFK), the procedure is `→ ?`. The
Notfall-Konzept names "Technischer Betreiber" as Andy with no backup.

**Fix:**

1. In RUNBOOK §3.2 add: "If the latest 3 deploys are all bad, find the most
   recent green-CI commit on `main`: `gh run list --workflow=CI
--branch=main --status=success -L 1 --json headSha,databaseId`; the
   `headSha` is the commit; locate its Vercel deployment via
   `vercel ls --prod | head -10`."
2. Pre-record the "current known-good deployment URL" as a 1Password note,
   updated weekly.

---

### MED-9 — `.svelte-kit` adapter dual-mode is undocumented for production

**Where documented:** `svelte.config.js` comment: "Vercel build sets
VERCEL=1; local/CI builds use adapter-node so `pnpm preview` + Playwright
E2E work via `node build/index.js`."

**Gap:** Both adapters ship. The canonical production adapter for a Vercel
deploy is `adapter-vercel`. If `VERCEL=1` is not set (e.g. a future
deploy via `vercel build` locally, or `vercel deploy --prebuilt`), the
build would use `adapter-node` and ship the wrong output.

**Fix:** Either:

1. Switch unconditionally to `adapter-vercel` and use a separate
   `playwright.config.ts` `webServer` command that runs `vite preview`
   (which renders SSR via the dev pipeline). Or
2. Assert `process.env.VERCEL === "1"` in the `vercel.json` build command:
   `"buildCommand": "test \"$VERCEL\" = \"1\" && pnpm build"`. Or
3. Document the constraint in CLAUDE.md and the deploy section of RUNBOOK.

---

### LOW-1 — Concurrency guard missing on db-backup

**Where documented:** None.

**What the code does:** `db-backup.yml` has no `concurrency:` block. A
manual `workflow_dispatch` triggered during the nightly run would race
against the cron run, both trying to push the same encrypted file to the
backup repo with different timestamps. Git push order resolves it but the
double-pg_dump wastes Neon compute.

**Fix:** Add to `db-backup.yml`:

```yaml
concurrency:
  group: db-backup
  cancel-in-progress: false
```

---

### LOW-2 — Backup-restore-smoke does not call `cleanup` if `pg_restore` succeeds but assertions fail

**Where documented:** `scripts/restore-smoke.sh` line 109: `trap cleanup
EXIT` — actually this does call cleanup on `die`, so this is fine.
Withdrawing this finding. (Left here for transparency.)

---

### LOW-3 — `.env.example` lists `BACKUP_AGE_RECIPIENT` as app env var; it isn't

**Where documented:** `.env.example` line 56:
`BACKUP_AGE_RECIPIENT=                # age public key`.

**What the code does:** `BACKUP_AGE_RECIPIENT` is referenced only in
`db-backup.yml` (GitHub Actions secret); not in `env.ts`, not in `src/`.

**Gap:** Confuses developers — `.env.example` is for app runtime, but this
is a CI-only secret.

**Fix:** Remove from `.env.example`; move to `docs/SECRETS.md` (see MED-2).

---

### LOW-4 — `vercel.json` cron is unauthenticated by default

**Where documented:** `vercel.json` shows two crons; the endpoints check
`CRON_SECRET`. Vercel automatically sends `Authorization: Bearer
<CRON_SECRET>` if the env var is set in the project.

**Gap:** The protection is real but undocumented — a reader of
`vercel.json` cannot tell whether `/api/cron/daily-dispatcher` is exposed
to the internet. Easy mental error for a future developer is to expose a
new cron with no auth check.

**Fix:** In `vercel.json`, comment each cron line: `"// auth: CRON_SECRET
header — see src/routes/api/cron/daily-dispatcher/+server.ts"`. (JSON
doesn't support comments — alternative: a top-of-file `_comment` key or
move cron config into `vercel.config.ts` once Vercel supports it.)

---

### LOW-5 — No SLO / error budget defined

**Where documented:** None.

**Gap:** Without a stated availability target ("99% monthly", "1h
allowable downtime per quarter"), the operator has no decision criterion
for "do I need to roll back?" vs "can this wait until morning?".

**Fix:** Add `docs/SLO.md` with: target availability (suggest 99% — this
is a single-instance Vercel hobby/team project, not a 5-9 SaaS),
acceptable RTO/RPO, and a brief error-budget policy ("If we burn the
monthly budget, all new features pause until we ship 1 reliability fix").

---

### LOW-6 — No release tagging convention

**Where documented:** CLAUDE.md: "Each phase ends with a PR reviewed
against the reviewer matrix" — no git tag policy.

**Gap:** RUNBOOK §3 "rollback to last known good" relies on
`vercel rollback`. There are no `v1.2.3` tags or `phase-7.5` annotated tags
on `main` to anchor "good" to.

**Fix:** Tag every merge to `main` with `phase-N.M` (annotated tag with
the deploy commit SHA, deploy URL, and a one-line summary). `git push
--tags`. Vercel ties commit SHAs to deploy URLs already, but the tag
list in `git tag -l` is the operator's source of truth.

---

## Day 1 operations checklist

Things Andy MUST verify or configure before going live with the public form.
Each item is binary (done/not done) and concrete.

### Backups & restore

- [ ] Set GitHub Actions secrets in `griase94/folgederwolke-app`:
      `DATABASE_URL_BACKUP` (Neon `app_export` direct URL),
      `BACKUP_REPO` (e.g. `griase94/fdw-backups`),
      `BACKUP_TOKEN` (fine-grained PAT, Contents:Write on `fdw-backups`),
      `BACKUP_AGE_RECIPIENT` (age public key),
      `DRIVE_BACKUP_FOLDER_ID`.
- [ ] Create the private `fdw-backups` GitHub repo (currently referenced but
      may not exist) — empty init commit, branch protected.
- [ ] Generate age keypair with `age-keygen`; store private key in 1Password
      under vault `<NAME>` item `folgederwolke-app / age backup key`.
      **Document the vault name in RUNBOOK §1.5 and 11-notfall-konzept §11.2.**
- [ ] Manually run `gh workflow run db-backup.yml`; verify (a) workflow
      green, (b) a `.dump.age` file landed in `fdw-backups`, (c) the same
      file landed in the Drive folder.
- [ ] Manually decrypt the latest dump with the 1Password age key
      (`age --decrypt --identity key.txt …`), and `pg_restore --list` it.
      Confirm a sensible TOC. (This is the missing test from HIGH-4.)
- [ ] Run a **real** restore drill against a Neon scratch branch using
      RUNBOOK §2.1 B. Time it; record RTO. Verify
      `SELECT MAX(chain_seq) FROM audit_log` matches the source. **If RTO > 2h or steps don't work, fix RUNBOOK before continuing.**

### Audit-anchor

- [ ] Set GitHub Actions secrets: `AUDIT_ANCHOR_REPO`,
      `AUDIT_ANCHOR_TOKEN`. Create the `folgederwolke-audit-anchor` private
      repo. Manually run the workflow; verify a CSV lands.
- [ ] Configure the anchor bot to sign commits (HIGH-6 fix).

### CI/CD gating

- [ ] In GitHub Settings → Branches → `main`, require all of:
      `unit-and-types`, `build`, `e2e`, `backup-restore-smoke`, `semgrep`,
      `gitleaks`, `audit`. Require 1 review. Disallow force-push.
- [ ] In Vercel Settings → Git → set Production branch = `main`; enable
      "Vercel for GitHub Build Cancellation" so red CI does not deploy.
- [ ] Document the exact list of required checks in RUNBOOK §6.

### Migration safety

- [ ] Add `scripts/migrate.ts` to the deploy pipeline (CRIT-5 fix).
- [ ] Verify the live schema matches the committed migrations: `psql -c
    "SELECT name FROM drizzle_migrations ORDER BY id"` returns rows for
      all of `0000`–`0009`.

### Public-form gate

- [ ] Flip the `PUBLIC_FORM_ENABLED` default in `env.ts` to `false`
      (CRIT-2). Add `DPA_GATE_PASSED`. Wire the gate.
- [ ] In Vercel Production env: set `PUBLIC_FORM_ENABLED=true` and
      `DPA_GATE_PASSED=true` only after Vercel-DPA and Neon-DPA are signed.
- [ ] Update `docs/legal/auftragsverarbeitung/README.md` rows 28-29 to
      `signed` + date.

### Monitoring

- [ ] Stand up an uptime monitor on `/healthz` (5-min interval, alert email
      to Andy + secondary contact).
- [ ] Configure a Vercel Log Drain to LogTail/Better Stack free tier.
- [ ] Add Sentry to `hooks.server.ts` (`handleError` hook). Set
      `SENTRY_DSN` in Vercel env. Verify a thrown error reaches Sentry.
- [ ] Configure an alert webhook (Discord/Slack); add `ALERT_WEBHOOK_URL`
      to Vercel env. Wire from `runAuditChainVerification` (HIGH-7).
- [ ] Enable GitHub Actions email-on-failure notifications in
      `griase94`'s personal settings.

### Contacts / docs

- [ ] Fill in `docs/verfahrensdokumentation/11-notfall-konzept.md` §11.2:
      real names, phone numbers, after-hours contacts for Andy, Kassenwart, 1. Vorstand. **Without this, the Notfallkonzept is legally void.**
- [ ] Fill in Steuerberater contact in RUNBOOK §4.4.
- [ ] Create `docs/SECRETS.md` (MED-2 fix).
- [ ] Update RUNBOOK §1.3 healthz expected response to actual JSON shape
      (HIGH-1).

### Restore-smoke (the actual test)

- [ ] Rewrite `scripts/restore-smoke.sh` to apply all 10 migrations via
      `scripts/migrate.ts` and seed via `scripts/seed-fixtures.ts`
      (CRIT-1). Add assertions on `audit_log` chain head and on role
      existence.

---

## Day 30 operations checklist (recurring)

Re-run on a calendar reminder. Each item has a cadence.

### Weekly

- [ ] **Mon morning:** Check `gh run list --workflow=db-backup.yml -L 7` —
      all 7 runs in the last week succeeded with non-empty summary.
- [ ] **Mon morning:** Check `gh run list --workflow=audit-anchor.yml -L 1` —
      Sunday run succeeded; spot-check the CSV tip-hash against the
      previous week's tip (different only if new rows appended).
- [ ] **Mon morning:** Verify the latest backup in the Drive folder
      is < 24h old.
- [ ] Hit `/healthz`; confirm 200 with `db: ok, drive: ok`.
- [ ] Review Vercel "Functions" tab for error spikes >1% of requests.

### Monthly

- [ ] **First Monday of the month:** Run a full restore drill against a
      throwaway Neon branch. Time the steps; record in RUNBOOK §2.3
      (a new section). Update RTO documentation if reality has diverged.
- [ ] Decrypt one randomly-chosen older dump (3+ months old) and verify
      it still pg_restores. This is the only way to catch silent
      bit-rot of the age private key or the dump file.
- [ ] Re-verify Neon plan tier and PITR window in Neon Console; record
      in RUNBOOK.
- [ ] Re-verify `DPA_GATE_PASSED` and `PUBLIC_FORM_ENABLED` settings in
      Vercel; confirm match documented values.
- [ ] Spot-check one row in `audit_log` (latest) — confirm `chain_seq` is
      monotonically incrementing and `verifyAuditChain` returns `ok: true`.

### Quarterly

- [ ] Rotate `SESSION_SECRET` (RUNBOOK §1.1). Verify magic-link flow
      end-to-end after rotation.
- [ ] Rotate `BACKUP_TOKEN` and `AUDIT_ANCHOR_TOKEN` (GitHub PATs).
- [ ] Re-verify all DPAs are still signed and unchanged at their current
      version (Vercel, Neon, Google).

### Annually

- [ ] Rotate `GOOGLE_OAUTH_REFRESH_TOKEN` (RUNBOOK §1.2). Note: Google
      may force re-consent for OAuth apps in testing mode every 7 days;
      verify the app has been moved to "In production" verification status.
- [ ] Rotate `DATABASE_URL` password (RUNBOOK §1.3).
- [ ] Re-key `BACKUP_AGE_RECIPIENT` (RUNBOOK §1.5). Keep prior private key
      indexed in 1Password for the GoBD-required 10-year retention window.
- [ ] Update `docs/verfahrensdokumentation/10-risikomanagement.md` §10.4
      revision history.
- [ ] Re-review this ops document; record cadence in §1 of RUNBOOK.

### As-needed

- [ ] **Before each phase merge:** verify the new phase's required tests
      are in the CI `--grep` cumulative list (CLAUDE.md §Testing).
- [ ] **Before any schema migration:** dry-run on a Neon branch; never run
      `scripts/migrate.ts` against `main` first.
- [ ] **Before tagging Festschreibung year-close:** full off-site backup of
      the Festschreibung-day database state, retained 10 years
      (`fdw-backups` retention is "forever" per `db-backup.yml` line 16, so
      this is already covered — but confirm the file exists for that day).

---

## Severity tally

| Severity  | Count  |
| --------- | ------ |
| CRIT      | 6      |
| HIGH      | 8      |
| MED       | 9      |
| LOW       | 6      |
| **Total** | **29** |

## Top 5 operational blockers (in order)

1. **CRIT-2** — `PUBLIC_FORM_ENABLED` defaults to `true` and `DPA_GATE_PASSED`
   is documentation only. The public-form release-gate is not enforced in
   code.
2. **CRIT-1** — `scripts/restore-smoke.sh` does not exercise the real
   schema; the "tested-every-push restore pipeline" is theatre.
3. **CRIT-3** — `db-backup.yml` silently skips on missing secrets and
   reports "Backup Summary: not configured" as a green workflow. The
   nightly backup may not exist at all.
4. **CRIT-4** — No application-level monitoring or alerting; an audit-chain
   break, OAuth failure, or 500-spike is invisible to the operator.
5. **CRIT-5** — Migrations have no automated path. A merge with a new
   migration deploys app code ahead of schema, with no boot-time check.

## Report path

`/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/reviews/2026-05-19-ops-review.md`
