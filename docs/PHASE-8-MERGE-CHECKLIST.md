# Phase 8 — Merge Checklist

Single-shot, linear checklist for safely landing `phase-8-local-dev-environment` to `main`. **Run top-to-bottom; don't skip steps.**

The work order is:

1. Phase 7.5 PR merges to `main` first (separate PR — already open).
2. Rebase phase-8 onto the updated `main`.
3. **One-time Neon migration reconciliation** (this PR introduces a CI workflow that runs migrations on every push to `main`; before that workflow fires, the live `__drizzle_migrations` table on Neon must agree with what's in `drizzle/meta/_journal.json` — otherwise the first auto-migrate run will explode).
4. Add the GitHub Actions secret `NEON_MIGRATE_DATABASE_URL`.
5. Open the PR to `main` and merge.
6. Verify the auto-migrate workflow ran clean.

---

## Pre-merge (do these BEFORE opening the PR)

### Step 1 — Wait for the phase-7.5 PR to merge to main

Don't open the phase-8 PR until phase-7.5 is on `main`. Otherwise the diff will be huge and reviewer-unfriendly.

### Step 2 — Rebase phase-8 onto main

```bash
cd /Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/.claude/worktrees/phase-8-local-dev-environment
git fetch origin main
git rebase origin/main
```

Expected: clean rebase. If conflicts in `CLAUDE.md`, `README.md`, or `MORNING.md`, resolve by keeping both sets of changes where they don't overlap.

After rebasing:

```bash
git push --force-with-lease origin phase-8-local-dev-environment
```

### Step 3 — One-time Neon `__drizzle_migrations` reconciliation

`drizzle/0010_post_review_hardening.sql` and `drizzle/0011_audit_trigger_digest_path_fix.sql` were hand-applied to Neon during phase-7.5 but were never registered in the `drizzle.__drizzle_migrations` tracking table. This phase-8 PR adds journal entries for them (so a fresh local DB picks them up correctly), which means the next `pnpm tsx scripts/migrate.ts` run against Neon will try to re-apply them. **Migration 0010 has non-idempotent `ALTER TABLE … ADD CONSTRAINT` statements** that will throw "constraint already exists" and roll back the whole migration on re-run.

Fix: manually insert rows for 0010 + 0011 + 0012 into `drizzle.__drizzle_migrations` so the migrator treats them as already-applied.

**Detailed procedure**: `docs/RUNBOOK.md` → §6.1 "One-time reconciliation before phase-8 merge". The runbook has copy-pastable psql commands. The condensed version:

```bash
# Set this to your Neon DIRECT URL (NOT the pooled URL)
export NEON_URL='postgres://<owner>:<password>@ep-...neon.tech/<db>?sslmode=require'

# 1. Inspect current state
psql "$NEON_URL" -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"
# Expected: rows 1–10 covering 0000_init through 0009_audit_log_hardening.

# 2. Compute the SHA256 hashes drizzle expects (run in repo root)
node -e '
  const fs=require("fs"); const c=require("crypto");
  for (const f of ["0010_post_review_hardening","0011_audit_trigger_digest_path_fix","0012_default_privileges"]) {
    const sql=fs.readFileSync(`drizzle/${f}.sql`,"utf8");
    console.log(f, c.createHash("sha256").update(sql).digest("hex"));
  }'

# 3. Apply 0012 manually (NEW in phase-8)
psql "$NEON_URL" -f drizzle/0012_default_privileges.sql

# 4. Register 0010, 0011, 0012 hashes (replace HASH_xxxx with values from step 2)
psql "$NEON_URL" <<SQL
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('HASH_0010', 1779203339000),
       ('HASH_0011', 1779203925000),
       ('HASH_0012', 1779207384669);
SQL

# 5. Verify default privileges landed
psql "$NEON_URL" -c '\ddp public'
# Expected: app_runtime gets arwd on tables; app_export gets r; sequences have rU for app_runtime.

# 6. Dry-run migrate.ts — must be a no-op
DIRECT_DATABASE_URL="$NEON_URL" pnpm tsx scripts/migrate.ts
# Expected: "Migrations complete." with no work done. If it tries to apply
# anything, hashes don't match — recompute step 2 and re-do step 4.
```

**Only after step 6 prints "Migrations complete." with no work done is reconciliation done.**

### Step 4 — Set the `NEON_MIGRATE_DATABASE_URL` GitHub secret

The new `.github/workflows/migrate.yml` runs on every push to `main` and applies pending migrations to Neon. It requires the repo secret `NEON_MIGRATE_DATABASE_URL` (DIRECT non-pooled URL with owner privileges).

Run **one** of:

```bash
# Option A — via gh CLI (fastest; uses .env's DIRECT_DATABASE_URL)
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

All four jobs (`unit-and-types`, `build`, `e2e`, `backup-restore-smoke`, `gitleaks`, `check-env-files`) should pass within ~10 minutes.

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
