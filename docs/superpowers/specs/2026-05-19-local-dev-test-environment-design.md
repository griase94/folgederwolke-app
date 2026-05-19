# Local dev + hermetic test environment — Design

**Date:** 2026-05-19
**Status:** Approved (brainstorming complete; implementation plan pending)
**Author:** Andy Griesbeck (with Claude as collaborator)

---

## 1. Problem

Dev and E2E tests currently run against the live Neon Postgres. That is:

- **Risky** — a stray destructive query or test seed-collision can damage real data
- **Slow** — every dev run pays for network round-trips to Neon
- **Coupled to Neon credentials** — fresh checkouts need real secrets just to boot
- **Non-hermetic for tests** — Playwright runs share state with whatever's in Neon

We want a docker-compose-driven local Postgres, an in-app dev mail backend that writes `.eml` files to disk and surfaces magic-link URLs in the console, hermetic E2E and unit tests that reset the test database to a known seeded state before every run, CI parity with the local setup, and a developer experience where the dev DB persists across restarts unless the developer explicitly purges or reseeds it.

## 2. Goals

1. **Dev DB persists** across `docker compose down` / restart; explicit `pnpm dev:reset` purges.
2. **Test DB is hermetic** — dropped, recreated, migrated, and seeded before every `pnpm test:e2e` / `pnpm test` run.
3. **Mirror live exactly** where it matters: same Postgres major + minor version (17), same extensions, same app roles, same migrations.
4. **CI runs the same shape** as local where reasonable; CI uses GitHub's `services:` block for speed, local uses `docker-compose.yml`.
5. **No external creds required** for a fresh checkout to run unit + E2E tests locally and in CI.
6. **Self-documenting** — a `README` section that lets a new contributor (or future-you in 6 months) run `pnpm dev:up` and have a working local setup in under 5 minutes.

## 3. Non-goals

- Parallel Playwright workers across multiple DBs (current `fullyParallel: false` stays; can be tackled later if test suite slows).
- Template-database fast cloning (`CREATE DATABASE … TEMPLATE …`). Drop+create+migrate+seed is ~3–5s at current migration count; revisit when reset time crosses ~10s.
- A MinIO/S3 stand-in for Drive. The existing `FileStorage` interface plus a local-fs implementation is sufficient.
- A real Google Drive sandbox for tests. Drive code path is exercised manually before merging `drive-impl.ts` changes.
- A live SMTP catcher (mailpit/MailHog). Tests assert against the `sent_mails` table; dev writes `.eml` files to disk and logs magic-link URLs to console.

## 4. Architecture overview

**One `docker-compose.yml`, one service: Postgres.** Mail and file storage are handled in-app via interface implementations — no extra containers.

Two databases live on the single Postgres instance:

| Database             | Lifetime                                                      | Used by                          |
| -------------------- | ------------------------------------------------------------- | -------------------------------- |
| `folgederwolke_dev`  | Persistent (named volume `folgederwolke_pgdata`)              | `vite dev`, manual psql sessions |
| `folgederwolke_test` | Dropped + recreated + migrated + seeded before every test run | Playwright, Vitest               |

**Two connection URLs per environment**, mirroring the existing Neon split:

- `DATABASE_URL` — app runtime connection, uses **`app_runtime` role** (CRUD + INSERT-only on `audit_log`). Used by SvelteKit dev server and the application code path under test.
- `DIRECT_DATABASE_URL` — DDL/admin connection, uses **`postgres` superuser** locally (mirrors Neon's owner role). Used by `drizzle-kit`, `scripts/migrate.ts`, `scripts/seed.ts`, the reset script, and `pnpm db:console`.

This split forces dev to surface permission bugs early (e.g., missing grants on a new table) without making ad-hoc psql exploration painful.

**Mail and file storage**: pluggable implementations selected via env.

- `STORAGE_BACKEND=local-fs` in dev/test → `LocalFsFileStorage` writes to `./.dev-data/drive/` (dev) or `./.dev-data/drive-test/` (test). Production unchanged (Drive impl).
- `MAIL_PROVIDER=dev-eml` in dev → writes `.eml` files to `./.dev-data/mail/` and logs magic-link URLs to console.
- `MAIL_PROVIDER=no-op` in test → writes the `sent_mails` row (preserving idempotency / assertion behavior per ADR-0005) and returns success without doing any SMTP I/O. Deterministic, no fake-SMTP host needed.

## 5. Components

### 5.1 `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      - "15432:5432" # non-standard host port to avoid collisions
    volumes:
      - folgederwolke_pgdata:/var/lib/postgresql/data
      - ./scripts/db/init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d postgres"]
      interval: 2s
      timeout: 3s
      retries: 30

volumes:
  folgederwolke_pgdata:
```

Notes:

- **Debian variant, not alpine** — avoids libc/ICU divergence from Neon's Debian-based build.
- **Port 15432** — avoids collision with any local Postgres install on 5432.
- **`init.sql` runs only on first volume init** — anything ongoing must live in migrations.

### 5.2 `scripts/db/init.sql`

Runs once when `folgederwolke_pgdata` is created. Creates the dev database. Roles are created by `drizzle/0002_roles.sql` (don't duplicate).

```sql
CREATE DATABASE folgederwolke_dev;
-- Test DB is created on demand by scripts/db/reset-test-db.sh
```

### 5.3 `scripts/db/reset-test-db.sh`

Bash, idempotent, ~25 lines. Loads `.env.test` so `DIRECT_DATABASE_URL` is set. Refuses to run unless `DIRECT_DATABASE_URL` points at localhost (safety guard against accidentally wiping Neon).

```bash
#!/usr/bin/env bash
set -euo pipefail

# Load .env.test into the shell
set -a
source .env.test
[[ -f .env.test.local ]] && source .env.test.local
set +a

# Safety: refuse if not localhost
[[ "${DIRECT_DATABASE_URL:-}" == *"localhost"* || "${DIRECT_DATABASE_URL:-}" == *"127.0.0.1"* ]] \
  || { echo "reset-test-db: refusing — DIRECT_DATABASE_URL is not localhost"; exit 1; }

# Connect to the admin DB ('postgres') to manage folgederwolke_test
ADMIN_URL="${DIRECT_DATABASE_URL%/*}/postgres"

# ALLOW_CONNECTIONS false fails if the DB doesn't exist yet — tolerate that
psql "$ADMIN_URL" -c "ALTER DATABASE folgederwolke_test WITH ALLOW_CONNECTIONS false;" 2>/dev/null || true
psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS folgederwolke_test WITH (FORCE);"
psql "$ADMIN_URL" -c "CREATE DATABASE folgederwolke_test;"

# Migrate and seed against the new test DB (env already points at folgederwolke_test)
pnpm tsx scripts/migrate.ts
pnpm tsx scripts/seed.ts

echo "reset-test-db: done."
```

`DROP DATABASE … WITH (FORCE)` (PG13+) terminates open connections atomically, replacing the older `pg_terminate_backend` + retry dance. `ALLOW_CONNECTIONS false` is a belt-and-suspenders to prevent reconnects between commands.

### 5.4 `scripts/db/wait-for-postgres.sh`

Real query loop, not just `pg_isready` (which false-positives on first boot before `init.sql` finishes).

```bash
#!/usr/bin/env bash
set -euo pipefail
ADMIN_URL="${DIRECT_DATABASE_URL%/*}/postgres"
timeout=30
while ! psql "$ADMIN_URL" -c 'select 1' >/dev/null 2>&1; do
  ((timeout--)) || { echo "wait-for-postgres: timed out"; exit 1; }
  sleep 1
done
```

### 5.5 `scripts/dev-up.sh`

Idempotent one-shot dev bootstrap. Loads `.env.development` so `DATABASE_URL` / `DIRECT_DATABASE_URL` are available to all subcommands.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Load .env.development into the shell so all subcommands see DATABASE_URL etc.
set -a
source .env.development
[[ -f .env.development.local ]] && source .env.development.local
set +a

docker compose up -d postgres
./scripts/db/wait-for-postgres.sh
pnpm tsx scripts/migrate.ts

# Seed only if dev DB is empty (kategorien is a good sentinel)
if [[ "$(psql "$DIRECT_DATABASE_URL" -t -c 'select count(*) from kategorien;' | tr -d ' ')" == "0" ]]; then
  pnpm tsx scripts/seed.ts
fi
```

The same `source .env.development` pattern is used by `scripts/db/reset-test-db.sh` (loading `.env.test` instead) so env-var loading is consistent across all orchestration scripts.

### 5.6 `src/lib/server/files/local-fs-impl.ts`

New `FileStorage` implementation, ~60 lines.

- Files stored as `<root>/<id>` with sidecar `<root>/<id>.meta.json` containing `{mimeType, name, createdAt}`.
- `<root>` = `process.env.FILE_STORAGE_ROOT` (defaults to `./.dev-data/drive/`).
- `webViewLink` returned is a synthetic `file:///` URL — doesn't open in tests but satisfies the interface.
- Throws `FileNotFoundError` on missing files (mirroring Drive's 404 contract).
- Path-traversal guard: all ids are sanitized to alphanumeric + dash before joining to `<root>`.

`src/lib/server/files/storage.ts` factory updated: if `STORAGE_BACKEND=local-fs`, return `LocalFsFileStorage`; otherwise the existing Drive impl. Default in `.env.development` and `.env.test` is `local-fs`.

### 5.7 `src/lib/server/mail/dev-eml-impl.ts`

New dev-only mail backend, ~15 lines.

- Writes each outgoing mail to `./.dev-data/mail/<timestamp>-<template>.eml` (RFC 5322 format).
- Logs magic-link URLs (template = `magic_link`) to console for fastest dev iteration.
- Still writes to `sent_mails` table via the existing event-bus path (no change to the bus).
- Selected when `MAIL_PROVIDER=dev-eml`. Default in `.env.development`.

Tests use a separate `no-op` provider (`src/lib/server/mail/no-op-impl.ts`, ~10 lines) selected via `MAIL_PROVIDER=no-op`. It writes the `sent_mails` row through the existing event-bus path and returns success without touching SMTP. Test assertions read `sent_mails` rows directly. This is deterministic — no reliance on "SMTP failing silently" — and isolates tests from any nodemailer behavior change.

### 5.8 `drizzle/0012_default_privileges.sql`

(Migrations 0010 and 0011 were taken on `phase-7.5-compliance-hardening` after the spec was first written — 0010 is post-review hardening, 0011 is the audit trigger digest path fix. This new migration shifts to 0012.)

Fixes a latent bug surfaced by the dev-as-`app_runtime` switch: `0002_roles.sql` grants on existing tables but lacks `ALTER DEFAULT PRIVILEGES`, so new tables added in future migrations don't auto-grant.

```sql
-- Apply default grants to all FUTURE tables created in schema public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO app_export;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- Re-revoke UPDATE/DELETE on audit_log defaults (per ADR-0004 / migration 0009)
-- Note: audit_log already exists, so 0009's REVOKEs hold; this only matters
-- if a future audit_log_v2 is added — flagged here so it doesn't get missed.
```

### 5.9 `.env.development` (committed)

```
DATABASE_URL=postgres://app_runtime:app_runtime@localhost:15432/folgederwolke_dev
DIRECT_DATABASE_URL=postgres://postgres:postgres@localhost:15432/folgederwolke_dev
SESSION_SECRET=dev-only-not-secret-replace-locally
STORAGE_BACKEND=local-fs
FILE_STORAGE_ROOT=./.dev-data/drive
MAIL_PROVIDER=dev-eml
MAIL_FROM=dev@folgederwolke.local
ADMIN_EMAILS=admin@example.com,andy.griesbeck@gmail.com
PUBLIC_FORM_ENABLED=true
VEREIN_NAME=Folge der Wolke e.V. (DEV)
```

Note: `app_runtime` role needs a password set in `0002_roles.sql` (currently `NOLOGIN`). Implementation plan must add `ALTER ROLE app_runtime WITH LOGIN PASSWORD 'app_runtime';` in a new migration (`0011_app_runtime_login.sql`) gated to non-production (use `current_database()` check or just accept that Neon's role config differs from local — set the password in Neon separately and document).

### 5.10 `.env.test` (committed)

Same shape, with `folgederwolke_test` as the database. `STORAGE_BACKEND=local-fs` with `FILE_STORAGE_ROOT=./.dev-data/drive-test`. `MAIL_PROVIDER=no-op` (writes `sent_mails`, returns success, no SMTP I/O — see §5.7).

### 5.11 `playwright.config.ts` updates

- Drop `scripts/e2e-serve.sh`. Replace `webServer.command` with inline `node build/index.js`.
- Load `.env.test` at the top of `playwright.config.ts` via `dotenv.config({ path: '.env.test' })` so vars are available to `webServer.env`.
- Populate `webServer.env` explicitly with the vars the SvelteKit server needs (DATABASE_URL, SESSION_SECRET, etc.) — no shell-script intermediary.
- Add a `globalSetup` script (`tests/playwright-global-setup.ts`) that shells out to `scripts/db/reset-test-db.sh` before the webServer boots. The reset script loads `.env.test` itself, so no env forwarding needed.
- Build is invoked once before the test run via `pretest:e2e` npm script (not inside webServer).

### 5.12 `vitest.config.ts` updates

- Add `globalSetup: './tests/vitest-global-setup.ts'`. The setup file loads `.env.test` via dotenv and shells out to `scripts/db/reset-test-db.sh`.
- `singleFork: true` is kept — globalSetup runs in the main process before any fork.
- `pnpm test:watch` does **not** trigger a reset — it uses the dev DB (see §5.13). Watch mode is for iterating on test code, not on schema or seed.

### 5.13 `package.json` scripts (final list)

```json
{
  "scripts": {
    "dev:up": "bash scripts/dev-up.sh",
    "dev:reset": "docker compose down -v && pnpm dev:up",
    "db:console": "psql $DIRECT_DATABASE_URL",
    "pretest:e2e": "pnpm build"
  }
}
```

Notes:

- DB reset is owned by the test frameworks' `globalSetup` hooks (Playwright + Vitest), not by an npm pre-hook. Single source of truth, env vars naturally available, can't drift between `pnpm test` and `pnpm test:e2e`.
- `pretest:e2e` only builds — the reset is invoked from Playwright's globalSetup.
- `test:watch` runs against the dev DB (no reset). Devs iterating on tests use `pnpm dev:up` first, then `pnpm test:watch`. When fixtures drift, `pnpm dev:reset`.
- No separate `dev:down` — `docker compose down` is muscle memory.
- No separate `dev:reseed` — `pnpm tsx scripts/seed.ts` against the dev DB is idempotent and runnable directly. `dev:reset` is the nuclear option.
- User-facing scripts: 3 (`dev:up`, `dev:reset`, `db:console`). `pretest:e2e` is auto-invoked.

### 5.14 `.github/workflows/ci.yml` updates

- Bump existing `services: postgres:16` in `backup-restore-smoke` job to `postgres:17` (confirmed version-skew bug — Neon is on 17.8).
- Add `services: postgres:17` block to `e2e` job; remove Neon-related secrets from its env block.
- Add `services: postgres:17` block to `unit-and-types` job only if unit tests actually hit DB (audit before).
- All `services:` blocks use the same env (`POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=postgres`) and the same healthcheck.
- The reset script + migrations + seed run as a CI step before tests, identical to local flow.

CI does **not** use docker-compose. GitHub's `services:` is faster (cached on runner image) and cleaner. The 10-line YAML diff is a one-time cost; "single source of truth" loses to "less orchestration overhead per CI run."

### 5.15 Documentation: `README.md` section + `CLAUDE.md` updates

**`CLAUDE.md`** (project conventions for AI agents and contributors) also needs updates — it currently has a 4-line "Testing" section that doesn't reflect the new harness. Specifically:

- **§"Testing"** — expand to cover docker-compose stack, globalSetup auto-reset, tests connecting as `app_runtime`, `MAIL_PROVIDER=no-op` / `STORAGE_BACKEND=local-fs` defaults, pointer to README for full setup.
- **§"Environment variables"** — update the "declare in env.ts → add to .env.example" pattern to include the new committed `.env.development` / `.env.test` files.
- **§5 FileStorage convention** — note that `STORAGE_BACKEND` env var selects impl (drive vs local-fs).
- **§"Database roles"** — note migration 0012 default privileges; note local-only LOGIN setup (Neon manages own role auth).
- **§"Key references"** — fix stale `phase-2-public-form` reference (the actual protected branch is `main`, per the same file's branch protection section).

**`README.md`** (user-facing) gets a new "Local development" section covering:

A new "Local development" section is added to `README.md`, covering:

1. **Prerequisites**: Docker Desktop (macOS) or Docker Engine (Linux), Node 20+, pnpm 10+.
2. **First-time setup**: `cp .env.development.example .env.development.local` (if any overrides needed), then `pnpm install && pnpm dev:up`.
3. **Daily commands** (the 3 user-facing npm scripts: `dev:up`, `dev:reset`, `db:console`) with one-line descriptions. Note that `pnpm test` and `pnpm test:e2e` auto-reset the test DB via globalSetup.
4. **Where state lives**:
   - DB → docker volume `folgederwolke_pgdata`
   - Drive files → `./.dev-data/drive/`
   - Sent mail → `./.dev-data/mail/` (open `.eml` in any mail client, or check console for magic-link URLs)
5. **How to inspect the DB**: `pnpm db:console` (psql), or use Drizzle Studio with `DIRECT_DATABASE_URL` from `.env.development`.
6. **How to inspect mail**: `ls -la .dev-data/mail/`, console output for magic links.
7. **Running tests**: `pnpm test` (unit), `pnpm test:e2e` (E2E). Both auto-reset the test DB.
8. **Resetting state**: `pnpm dev:reset` (nuclear — purges volume, re-bootstraps).
9. **Pointing at Neon instead** (rare): create `.env.development.local` with `DATABASE_URL` and `DIRECT_DATABASE_URL` set to the Neon URLs. Vite picks `.env.development.local` over `.env.development`.
10. **CI parity**: explanation that CI uses GitHub's `services:` block, not docker-compose, but runs the same reset+migrate+seed steps.
11. **Architecture pointers**: links to `docs/superpowers/specs/2026-05-19-local-dev-test-environment-design.md` (this doc), `CLAUDE.md` for conventions, and the relevant ADRs.

A short "Troubleshooting" subsection covers the top failure modes from §7.

## 6. Data flow

### 6.1 Daily dev workflow

```
$ pnpm dev:up           # docker compose up -d postgres; wait; migrate; seed if empty
$ pnpm dev              # vite dev — reads .env.development → app_runtime against folgederwolke_dev
                        # files go to ./.dev-data/drive/; magic links logged to console
$ pnpm db:console       # psql session for ad-hoc queries (uses superuser DIRECT_DATABASE_URL)
$ docker compose down   # stops postgres; volume preserved
$ pnpm dev:reset        # nuclear — purges volume, re-bootstraps
```

### 6.2 Test workflow (local + CI, identical sequence)

```
$ pnpm test:e2e
  └─ pretest:e2e
      └─ pnpm build                          # SvelteKit build
  └─ playwright test
      ├─ playwright-global-setup.ts loads .env.test, runs reset-test-db.sh
      │  └─ drop+create+migrate+seed (~3-5s)
      ├─ webServer: starts node build/index.js with .env.test forwarded via webServer.env
      └─ tests run against fresh folgederwolke_test

$ pnpm test
  └─ vitest with vitest-global-setup.ts → loads .env.test, runs reset-test-db.sh
     └─ tests run against fresh folgederwolke_test
```

## 7. Failure modes and mitigations

| Failure mode                                                        | Mitigation                                                                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dev points at Neon by accident                                      | `.env.development` committed with localhost URLs; Neon URL only reachable via opt-in `.env.development.local`.                                                           |
| Test reset hits Neon by accident                                    | `reset-test-db.sh` refuses to run unless `DIRECT_DATABASE_URL` contains `localhost` or `127.0.0.1`.                                                                      |
| Port 5432 collision with local PG install                           | Compose maps `15432:5432`; env files use 15432.                                                                                                                          |
| `pg_isready` false-positive on first boot                           | `scripts/db/wait-for-postgres.sh` does real `select 1` loop, 30s timeout.                                                                                                |
| `DROP DATABASE` race with active connections                        | `ALTER DATABASE … WITH ALLOW_CONNECTIONS false` then `DROP DATABASE … WITH (FORCE)`. Single atomic kick.                                                                 |
| Vite picks Neon URL from `.env.local` instead of `.env.development` | Audit which file holds the Neon URL today; document precedence in README; if needed, rename `.env` → `.env.production` so dev mode definitively uses `.env.development`. |
| `init.sql` not re-run when changed                                  | Document loudly in README; any ongoing config goes in migrations, not init.                                                                                              |
| New table added without grant in future migration                   | `0012_default_privileges.sql` adds `ALTER DEFAULT PRIVILEGES`.                                                                                                           |
| Connection pool holds stale connections to a dropped DB             | Reset script runs in Playwright `globalSetup` **before** webServer boots; webServer never sees the drop.                                                                 |
| `services: postgres:16` vs Neon's 17 in CI                          | Bumped to 17 in this PR.                                                                                                                                                 |

## 8. Risks (residual)

- **`init.sql` changes silently ignored** unless devs run `pnpm dev:reset`. Acceptable — documented in README.
- **`app_runtime` password in `.env.development`** is fine (committed, dev-only, no secrets) but devs who point at Neon via `.env.development.local` need to handle the Neon `app_runtime` password separately. Documented.
- **No automated check that `.env.development` and CI env stay in sync** — divergence will surface as CI-only failures. Considered acceptable at single-developer scale; revisit if team grows.
- **`STORAGE_BACKEND=local-fs` divergence from real Drive behavior** — `LocalFsFileStorage` may not perfectly mirror Drive (e.g., quota errors, sharing flags). Real Drive code path is exercised manually by a sandbox-folder test before merging `drive-impl.ts` changes.

## 9. Out of scope (deliberate)

- Template-database fast cloning (`CREATE DATABASE … TEMPLATE …`). Add when reset > 10s.
- Parallel Playwright workers across multiple test DBs. Add when E2E run exceeds tolerable wall-clock.
- MinIO / S3 stand-in for Drive.
- Real Google Drive sandbox folder for tests.
- Mailpit / MailHog SMTP catcher.
- Migration-rollback / down-migration workflow (none exist today; not added by this work).
- DB snapshot artifacts on test failure (test expert suggested; deferred until first painful debugging session demands it).
- CI artifact upload for `.dev-data/mail/` or DB dumps.

## 10. Deliverables (implementation checklist)

The implementation plan (next step) breaks these into ordered tasks. Listed here as the complete delta:

**New files:**

- `docker-compose.yml`
- `scripts/db/init.sql`
- `scripts/db/reset-test-db.sh`
- `scripts/db/wait-for-postgres.sh`
- `scripts/dev-up.sh`
- `src/lib/server/files/local-fs-impl.ts`
- `src/lib/server/mail/dev-eml-impl.ts`
- `src/lib/server/mail/no-op-impl.ts`
- `drizzle/0012_default_privileges.sql`
- `drizzle/0011_app_runtime_login.sql` (sets login + password for `app_runtime`; local-only guarded)
- `.env.development`
- `.env.test`
- `tests/playwright-global-setup.ts`
- `tests/vitest-global-setup.ts`

**Edited files:**

- `src/lib/server/files/storage.ts` (factory branch on `STORAGE_BACKEND`)
- `src/lib/server/mail/` (factory branches on `MAIL_PROVIDER=dev-eml` and `MAIL_PROVIDER=no-op`; integrate `dev-eml-impl.ts` + `no-op-impl.ts`)
- `playwright.config.ts` (inline command, webServer.env, globalSetup, dotenv load of `.env.test`)
- `vitest.config.ts` (globalSetup)
- `package.json` (4 new scripts: `dev:up`, `dev:reset`, `db:console`, `pretest:e2e`)
- `.github/workflows/ci.yml` (services blocks; remove Neon secrets from e2e/unit; bump 16→17 in backup-restore-smoke)
- `.gitignore` (add `.dev-data/`)
- `README.md` (new "Local development" section, ~50 lines)
- `CLAUDE.md` (expand "Testing" section, update "Environment variables" + "Database roles" notes, fix stale "Key references" branch line)

**Deleted files:**

- `scripts/e2e-serve.sh` (workaround no longer needed with modern Playwright)

## 11. Open questions

None remaining for the design phase. Implementation plan may surface tactical questions during sequencing.

---

**Next step:** invoke the writing-plans skill to produce an ordered implementation plan based on this spec.
