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
| `bash source .env.development` errors on `(DEV)`      | Some env values have unquoted special chars. `scripts/dev-up.sh` uses a custom parser that tolerates this. For direct shell use, edit the value to quote it.              |

### Architecture pointers

- **Design**: `docs/superpowers/specs/2026-05-19-local-dev-test-environment-design.md`
- **Project conventions**: `CLAUDE.md`
- **ADRs**: `docs/adr/` (especially 0002 sphere assignment, 0004 audit log tamper-evidence, 0005 mail idempotency)

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
