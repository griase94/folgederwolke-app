# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.15.3 create --template minimal --types ts --no-install folgederwolke-app
```

## Local development

This project uses Docker Compose for a local Postgres instance, an in-app local-filesystem stand-in for Google Drive, and an in-app `.eml`-to-disk stand-in for outgoing mail. No external credentials are needed for a fresh checkout to run unit + E2E tests.

### Prerequisites

- Docker Desktop (macOS) or Docker Engine (Linux)
- Node.js 20+ and pnpm 10+
- `psql` client (`brew install postgresql` on macOS, `apt install postgresql-client` on Linux)

### First-time setup

```bash
pnpm install
pnpm dev:up
```

`pnpm dev:up` is idempotent: it boots docker-compose, waits for Postgres, applies migrations, sets up the `app_runtime` and `app_export` roles, and seeds the dev database if it's empty. Subsequent runs are fast.

### Daily commands

| Command               | What it does                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev:up`         | Start the local stack, ensure migrations + seed (idempotent)                  |
| `pnpm dev`            | Run `vite dev` against the local stack (run `dev:up` first if not already up) |
| `pnpm dev:reset`      | **Nuclear**: purge docker volume + re-bootstrap (loses all dev DB data)       |
| `pnpm db:console`     | `psql` into the dev database as superuser                                     |
| `pnpm test`           | Run unit tests — resets test DB first via Vitest globalSetup                  |
| `pnpm test:e2e`       | Run E2E tests — resets test DB first via Playwright globalSetup               |
| `docker compose down` | Stop containers; volume preserved (dev DB survives)                           |

### Where state lives

- **Dev database** → docker named volume `folgederwolke_pgdata`
- **Drive files (dev)** → `./.dev-data/drive/` (gitignored)
- **Drive files (tests)** → `./.dev-data/drive-test/` (wiped per test run)
- **Sent mail (dev)** → `./.dev-data/mail/` (gitignored); inspect with any mail client, or check console for magic-link URLs
- **Sent mail (tests)** → only the `sent_mails` table row (no I/O — `MAIL_PROVIDER=no-op`)

### Inspecting the database

```bash
pnpm db:console               # psql shell, superuser access
```

Drizzle Studio works too: it reads `DIRECT_DATABASE_URL` from `.env.development`. Run `pnpm drizzle-kit studio`.

### Inspecting outgoing mail in dev

```bash
ls -la .dev-data/mail/        # list recent .eml files
open .dev-data/mail/*.eml     # macOS: opens in Mail.app
```

Magic-link URLs are also logged directly to the dev server console — fastest path during login flow testing.

### Resetting state

- **Reseed without purging** (preserves dev DB structure, re-applies idempotent seed):
  ```bash
  set -a && source .env.development && set +a && pnpm tsx scripts/seed.ts
  ```
  (Note: this `source .env.development` may fail on lines with unquoted special chars; if so, set `DATABASE_URL` and `DIRECT_DATABASE_URL` manually first, or run `pnpm tsx scripts/seed.ts` after a `pnpm dev:up`.)
- **Nuclear reset** (purges docker volume + file storage):
  ```bash
  pnpm dev:reset
  rm -rf .dev-data/
  ```

### Pointing dev at Neon temporarily

Create `.env.development.local` (gitignored) with your Neon URLs:

```
DATABASE_URL=postgres://...@<neon-host>/...
DIRECT_DATABASE_URL=postgres://...@<neon-host>/...
STORAGE_BACKEND=drive
GOOGLE_OAUTH_CLIENT_ID=...
# (plus the other Neon-only secrets)
```

Vite loads `.env.development.local` after `.env.development`, so it overrides cleanly.

### CI parity

CI uses GitHub Actions' `services: postgres:17` block for Postgres (not docker-compose) — faster on hosted runners and pre-cached on the standard image. The same reset script and migrations run before tests. See `.github/workflows/ci.yml`.

### Troubleshooting

| Symptom                                               | Cause / fix                                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev:up` fails with port 15432 already in use    | Another Postgres is using 15432; `lsof -i :15432` to find it, or change the port in `docker-compose.yml`                                                                  |
| Schema seems out of date after pulling                | Run `pnpm dev:up` — it applies any new migrations on the existing volume                                                                                                  |
| Changed `scripts/db/init.sql` but Postgres ignores it | `init.sql` runs only on a fresh volume. Use `pnpm dev:reset` to recreate the volume. Anything ongoing belongs in a migration, not init.sql.                               |
| `permission denied for table X` in dev                | A new table was added without grants — migration 0012 fixes this for future tables; for existing offenders, add explicit GRANT in the migration that introduced the table |
| Magic-link URL not visible                            | Check `.dev-data/mail/*.eml` files; if none, ensure `MAIL_PROVIDER=dev-eml` in `.env.development`                                                                         |
| `bash source .env.development` errors on `(DEV)`      | All values are now quoted (`VEREIN_NAME="…"` etc.). If you still see this, you're on an old branch — `git pull`.                                                          |

### Architecture pointers

- **Design**: `docs/superpowers/specs/2026-05-19-local-dev-test-environment-design.md`
- **Project conventions**: `CLAUDE.md`
- **ADRs**: `docs/adr/` (especially 0002 sphere assignment, 0004 audit log tamper-evidence, 0005 mail idempotency)
- **Phase 8 merge checklist** (one-shot, linear): `docs/PHASE-8-MERGE-CHECKLIST.md`
- **Production runbook**: `docs/RUNBOOK.md` (§6 covers migrations, §1 covers secret rotation, §3 covers emergency stops)

## Deploying to production

Production is Vercel (SvelteKit `@sveltejs/adapter-vercel`) against Neon Postgres 17.8. Every push to `main` triggers two things:

1. **Vercel auto-deploys the app** from the new `main` commit.
2. **`.github/workflows/migrate.yml` runs `pnpm tsx scripts/migrate.ts`** against Neon (gated on the `NEON_MIGRATE_DATABASE_URL` repo secret being set). Drizzle applies any pending migrations and the workflow re-runs migrate a second time to confirm idempotency.

The two run independently — there's a short window where Vercel may serve the new code against the old schema. Migrations are designed to be backward-compatible with the previous code revision; if you're adding a destructive migration (DROP COLUMN etc.), land it in two phases: (1) merge a migration that makes the column nullable / additive, deploy, (2) merge code that stops using it, deploy, (3) merge the DROP.

### GitHub Actions secrets

| Secret                                                       | Purpose                                                                                          | Where used                                              | How to set                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NEON_MIGRATE_DATABASE_URL`                                  | Direct (non-pooled) Neon URL with owner role — used by `migrate.yml` to apply pending migrations | `.github/workflows/migrate.yml`                         | `echo "$DIRECT_DATABASE_URL" \| gh secret set NEON_MIGRATE_DATABASE_URL` (uses the value from your local `.env`) |
| `DATABASE_URL`                                               | Existing pooled Neon URL                                                                         | `.github/workflows/ci.yml` `build` job + Vercel runtime | Pre-existing                                                                                                     |
| `SESSION_SECRET`                                             | App session HMAC                                                                                 | Vercel runtime + `ci.yml` build                         | Pre-existing                                                                                                     |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`                | Google Drive OAuth-as-Andy                                                                       | Vercel runtime + `ci.yml` build                         | Pre-existing — rotate via `docs/RUNBOOK.md §1.2`                                                                 |
| `SMTP_HOST/PORT/USER/PASSWORD`, `MAIL_PROVIDER`, `MAIL_FROM` | Outgoing mail                                                                                    | Vercel runtime + `ci.yml` build                         | Pre-existing                                                                                                     |
| `BACKUP_REPO`, `BACKUP_TOKEN`                                | Private GitHub repo for off-Postgres backups + token with write access                           | `.github/workflows/db-backup.yml`                       | Pre-existing — see `docs/RUNBOOK.md §1.5`                                                                        |
| `BACKUP_AGE_RECIPIENT`                                       | age public key for encrypting nightly dumps (private key in 1Password)                           | `.github/workflows/db-backup.yml`                       | Pre-existing — see `docs/RUNBOOK.md §1.5`                                                                        |
| `DRIVE_BACKUP_FOLDER_ID`                                     | Google Drive folder ID where encrypted dumps are uploaded                                        | `.github/workflows/db-backup.yml`                       | Pre-existing                                                                                                     |

**Verify what's set:**

```bash
gh secret list --repo griase94/folgederwolke-app
```

**Add or rotate a secret:**

```bash
gh secret set <NAME> --body '<value>'
# or interactively from a file:
gh secret set <NAME> < secret.txt
```

**Important**: `NEON_MIGRATE_DATABASE_URL` is read **only** by the GitHub Actions migrate workflow. It is NOT used by Vercel (Vercel has its own `DATABASE_URL` env var). Keeping them as separate secrets means rotating the Neon owner password requires updating GitHub _and_ Vercel — but it also means CI can use a different role with broader privileges than the runtime role.

### Adding a new migration

```bash
# 1. Edit schema in src/lib/server/db/schema/
# 2. Generate the migration file + snapshot
pnpm drizzle-kit generate

# 3. Inspect the generated SQL — drizzle-kit doesn't catch every case
#    (FK constraints, custom triggers). Edit drizzle/<NNNN>_<name>.sql if needed.

# 4. Test locally (purges volume + re-bootstraps with the new migration)
pnpm dev:reset

# 5. Commit migration file + snapshot + journal entry together
git add drizzle/<NNNN>_*.sql drizzle/meta/_journal.json drizzle/meta/<NNNN>_snapshot.json
git commit -m "feat(db): migration <NNNN> — <description>"

# 6. Push. On merge to main, .github/workflows/migrate.yml applies it to Neon.
```

If a migration ever needs a hotfix (applied to Neon via psql outside of the normal flow), follow `docs/RUNBOOK.md §6.4` to keep `__drizzle_migrations` in sync.

### What happens on `main` push

```
git push origin main
    ├─► Vercel webhook → build + deploy
    │       └─► serves new code (against current Neon schema)
    └─► GitHub Actions webhook → migrate.yml
            ├─► pnpm install
            ├─► pnpm tsx scripts/migrate.ts  (against NEON_MIGRATE_DATABASE_URL)
            │       └─► applies pending migrations
            └─► smoke-check: re-run migrate → must be no-op (proves idempotency)
```

Check the most recent migrate run:

```bash
gh run list --workflow=migrate.yml --limit 5
gh run view <run-id> --log
```

### Build (legacy SvelteKit instructions)

```sh
pnpm build
```

You can preview the production build with `pnpm preview`. Vercel handles building automatically.
