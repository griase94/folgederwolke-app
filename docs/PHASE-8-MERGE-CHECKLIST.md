# Phase 8 — Merge Checklist

Single-shot, linear checklist for safely landing `phase-8-local-dev-environment` to `main`. **Run top-to-bottom; don't skip steps.**

> **Status (2026-05-19)**: Steps 1, 2, and 4 are **already done**. The remaining gating step is **Step 3 — one-time Neon `__drizzle_migrations` reconciliation**. Once that's complete you can jump straight to Step 5 (open PR).

The work order is:

1. ✅ Phase 7.5 PR merged to `main` — landed as **PR #39** (commit `01caa4a`, "pragmatic-rebalance"), not the originally-planned PR #29.
2. ✅ Phase-8 integrated with `main` — done via `git merge origin/main` (commit `e90f568`), not a rebase. Branch is up to date with main.
3. 🔴 **One-time Neon migration reconciliation** — REQUIRED. The `migrate.yml` workflow added by this PR will try to re-apply 0010 (which has non-idempotent `ALTER TABLE ADD CONSTRAINT` statements) on first push to main, unless the `__drizzle_migrations` table on Neon is pre-populated.
4. ✅ GitHub Actions secret `NEON_MIGRATE_DATABASE_URL` — already set on 2026-05-19T20:20:48Z.
5. Open the PR to `main` and merge.
6. Verify the auto-migrate workflow ran clean.

---

## Pre-merge (do these BEFORE opening the PR)

### Step 1 — ✅ Phase-7.5 already on main (PR #39)

The originally-planned PR #29 (`phase(7.5): compliance hardening + audit chain + legal pages`) was closed in favour of PR #39 ("Phase 7.5 + pragmatic-rebalance: compliance fixes scaled to a 10-person Verein"), which is now `main` HEAD as commit `01caa4a`. Nothing to do here.

### Step 2 — ✅ Phase-8 integrated with `main`

Done. Phase-8 was integrated via `git merge origin/main` (merge commit `e90f568`). 14 conflicts were resolved — see the commit message for the resolution log. Branch already pushed to origin.

> If you ever need to RE-sync (because main moved further before you opened the PR), repeat:
>
> ```bash
> git fetch origin main && git merge origin/main
> # resolve conflicts; verify pnpm typecheck && pnpm test --run && pnpm test:e2e --grep '@phase-0|@phase-1|@phase-2'
> git push origin phase-8-local-dev-environment
> ```

### Step 3 — One-time Neon `__drizzle_migrations` reconciliation

**Discovered 2026-05-19 via direct Neon query**: the `drizzle.__drizzle_migrations` table on Neon contains only 4 rows (migrations 0000–0003). Migrations **0004 through 0011** were hand-applied to Neon (the app uses tables/columns from all of them — your prod app working confirms the schema is at the latest state) but were never registered in the tracking table. So we need to register 9 missing migrations (0004–0012), not just 3.

This phase-8 PR fixes the `_journal.json` side so fresh local DBs work correctly. The remaining task is registering the 9 hashes on Neon so `migrate.yml` doesn't try to re-apply any of them (some — like 0010's `ALTER TABLE … ADD CONSTRAINT` — are non-idempotent and would explode).

**Detailed procedure**: `docs/RUNBOOK.md` → §6.1. The condensed version:

```bash
cd /Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app
set -a && source .env && set +a

# 1. Inspect current state
psql "$DIRECT_DATABASE_URL" -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"
# Expected (as of 2026-05-19): 4 rows covering 0000–0003.

# 2. Sanity-check the schema is actually at the latest state
psql "$DIRECT_DATABASE_URL" <<'SQL'
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='nachname') AS has_0004,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='pdf_bytes') AS has_0005,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='projects') AS has_0006,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='eur_summary') AS has_0007,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_log' AND column_name='chain_seq') AS has_0009;
SQL
# All `t` → safe to proceed. Any `f` → STOP and tell me.

# 3. Apply 0012 against Neon (only new SQL in phase-8)
cd /Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/.claude/worktrees/phase-8-local-dev-environment
psql "$DIRECT_DATABASE_URL" -f drizzle/0012_default_privileges.sql

# 4. Register all 9 missing migration hashes
psql "$DIRECT_DATABASE_URL" <<'SQL'
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('eb494bbf119482e7e4e5a1b4615775586c49aba607973e5602902d54dde215cb', 1747612800000),  -- 0004
  ('5cc83a7c70f0ddececd1ea7c7f9076142f5555a67a70b0d3fa35d3505c88eefc', 1747699200000),  -- 0005
  ('955e66c269cbc3abf5aa969420643cae33d86cc0f77ab523b7cd9b0d5e31444a', 1747785600000),  -- 0006
  ('5c9c0e6c3f42408ee1ffe4ade90ef54e544608e2e26a6aec73a987bc5fecf6d8', 1747900000000),  -- 0007
  ('3a8735281cf7eb8c45f40ec2cc4963f61029976c78ee3d7868bebdaccc412197', 1747958400000),  -- 0008
  ('e4ed7e42247b407ebb843d2a177b540487ce6ba252418993f751a91787a7802d', 1748044800000),  -- 0009
  ('e40da08c88a358f49faa60467d51211386dcf6c65f11f27accafb6572a98e954', 1779203339000),  -- 0010
  ('2cd54a2a50d7215f4eb0d1322fecd3be407620c704bd4ff62e1e1d9b8108ba65', 1779203925000),  -- 0011
  ('f4b2304c4509a4d5d3ad9c93f63dbbe72cd7af613b0bac54bb927f9ef68fb2b1', 1779207384669); -- 0012
SQL

# 5. Verify default privileges landed (from 0012)
psql "$DIRECT_DATABASE_URL" -c '\ddp public'
# Expected: app_runtime gets arwd on tables; app_export gets r; sequences have rU for app_runtime.

# 6. Confirm __drizzle_migrations now has 13 rows
psql "$DIRECT_DATABASE_URL" -c "SELECT id, substr(hash,1,12) AS hash_prefix, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"

# 7. Dry-run migrate.ts — must complete without applying anything
DIRECT_DATABASE_URL="$DIRECT_DATABASE_URL" pnpm tsx scripts/migrate.ts
# Expected: "Migrations complete." with no per-migration log lines. If it
# tries to apply anything, hashes don't match — recompute via the node loop
# in §6.1 step 2 of RUNBOOK and re-do step 4.
```

**Only after step 7 prints "Migrations complete." with no per-migration log lines is reconciliation done.**

### Step 4 — ✅ `NEON_MIGRATE_DATABASE_URL` GitHub secret already set

Set on 2026-05-19T20:20:48Z. Verify with `gh secret list | grep NEON_MIGRATE_DATABASE_URL`. If you ever need to rotate, run **one** of:

```bash
# Option A — via gh CLI (fastest; uses .env's DIRECT_DATABASE_URL).
# If `source .env` errors on unquoted values, fall back to Option B.
set -a && source .env && set +a
echo "$DIRECT_DATABASE_URL" | gh secret set NEON_MIGRATE_DATABASE_URL

# Option B — via gh CLI with explicit value
gh secret set NEON_MIGRATE_DATABASE_URL --body 'postgres://<owner>:<password>@ep-...neon.tech/<db>?sslmode=require'

# Option C — via GitHub UI
# Go to: https://github.com/griase94/folgederwolke-app/settings/secrets/actions/new
# Name: NEON_MIGRATE_DATABASE_URL
# Value: <paste the same DIRECT URL>
```

Verify with:

```bash
gh secret list | grep NEON_MIGRATE_DATABASE_URL
```

Expected: a row with the secret name (no value shown — by design).

---

## Open + merge the PR

### Step 5 — Push branch + open PR

```bash
git push -u origin phase-8-local-dev-environment

gh pr create --base main --title "phase(8): local dev + hermetic test environment" --body-file - <<'EOF'
## Summary

Replaces live-Neon dev and tests with a hermetic Docker Compose Postgres + in-app stubs for mail and file storage. Local dev DB persists; test DB resets per run; CI uses GitHub `services:` for the same shape.

## Highlights

- `docker-compose.yml` with Postgres 17 (matching Neon 17.8) on port 15432
- `LocalFsFileStorage` and `dev-eml` / `no-op` mail providers behind env-driven factories
- `scripts/dev-up.sh` + `pnpm dev:up` / `dev:reset` / `db:console`
- Migration `0012_default_privileges.sql` — fixes latent grant bug for future tables
- Vitest + Playwright `globalSetup` hooks reset `folgederwolke_test` before every run
- CI: `services: postgres:17` for unit + e2e; bumps `backup-restore-smoke` from 16 → 17
- New `.github/workflows/migrate.yml` runs migrations on push to main (gated on `NEON_MIGRATE_DATABASE_URL`)
- `assertProductionEnvSafe()` rejects dev-only `MAIL_PROVIDER` / `STORAGE_BACKEND` values
- `/api/dev-files/[id]` proxy endpoint so local-fs viewUrls actually open in a browser
- Pre-existing `admin-shell.spec.ts` cookie-injection bug fixed (latent — surfaced by switch to local stack)
- Pre-existing `_journal.json` missing entries for 0010 + 0011 fixed (latent — would have caused migration drift on next fresh DB)

## Spec
`docs/superpowers/specs/2026-05-19-local-dev-test-environment-design.md`

## Pre-merge actions taken (Phase 8 checklist)
- [x] One-time Neon `__drizzle_migrations` reconciliation (RUNBOOK §6.1) — registered 0010/0011/0012 hashes; dry-run migrate.ts is a no-op.
- [x] `NEON_MIGRATE_DATABASE_URL` repo secret set.

## Test plan
- [x] `pnpm dev:up` from a clean checkout
- [x] `pnpm test --run` all green (377 passed, 1 skipped)
- [x] `pnpm test:e2e --grep '@phase-0|@phase-1|@phase-2'` all green locally (19/19)
- [x] Typecheck clean
- [ ] CI green
- [ ] `migrate.yml` workflow runs no-op on first push to main (proves reconciliation worked)
EOF
```

### Step 6 — Watch CI

```bash
gh pr checks --watch
```

All six jobs (`unit-and-types`, `build`, `e2e`, `backup-restore-smoke`, `gitleaks`, `check-env-files`) should pass within ~10 minutes.

### Step 7 — Merge

Once CI is green: merge via GitHub UI (or `gh pr merge --merge`). The merge triggers `.github/workflows/migrate.yml`, which should print "Migrations complete." with no work done (because reconciliation already registered everything).

### Step 8 — Verify the auto-migrate workflow

```bash
gh run list --workflow=migrate.yml --limit 1
gh run view <run-id> --log | tail -30
```

Expected: the run shows the migrate command completed without applying anything new ("0 migrations" or equivalent silence). If it tries to apply anything: reconciliation didn't take. Re-run `RUNBOOK §6.1`.

---

## Post-merge — clean up the worktree (optional)

```bash
cd /Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app
git branch -D phase-8-local-dev-environment
git worktree remove .claude/worktrees/phase-8-local-dev-environment
```

---

## If something goes wrong

| Symptom                                         | Likely cause                                                | Fix                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `migrate.yml` workflow tries to apply 0010/0011 | Hashes in step 2 didn't match what was registered in step 4 | Recompute hashes in step 2, drop the bad rows from `__drizzle_migrations`, re-insert with correct hashes                        |
| `gh secret set` fails with "permission denied"  | gh CLI auth missing `repo` scope                            | `gh auth refresh -s repo`                                                                                                       |
| Rebase shows hundreds of conflicts              | Phase-7.5 wasn't squash-merged                              | If phase-7.5 was a merge-commit-merge, this branch is in good shape — try a plain `git merge origin/main` instead of rebase     |
| Vercel deploy is live but `migrate.yml` failed  | Schema drift window                                         | Manually apply any pending migration via `psql "$NEON_URL" -f drizzle/<pending>.sql` and register its hash; re-run the workflow |
| `psql` command in step 2 fails                  | Network firewall blocking Neon                              | Try from a different network, or use Neon SQL editor via web UI                                                                 |

---

## What this checklist DOES NOT cover

- **Phase 9+ migrations**: Once `migrate.yml` is wired and Neon's `__drizzle_migrations` is in sync, future migrations just need `pnpm drizzle-kit generate` → commit → push. The workflow handles the rest. See `docs/RUNBOOK.md` §6.3.
- **Adding more GitHub secrets**: For non-migration concerns (e.g. a new third-party API key), use `gh secret set <NAME>` or the GitHub UI. Update the secrets table in `README.md` "Deploying to production" when you do.
- **Rotating `NEON_MIGRATE_DATABASE_URL`**: If the Neon owner password rotates, run `gh secret set NEON_MIGRATE_DATABASE_URL --body '<new URL>'`. No code changes needed.
