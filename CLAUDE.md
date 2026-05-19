# CLAUDE.md — folgederwolke-app architectural conventions

Reference document for AI agents and contributors working in this codebase.
Keep this in sync when ADRs or masterplan sections are updated.

---

## Key references

- **Masterplan**: `docs/` (internal; ask Andy for current version)
- **Phase 2 backlog**: `docs/phase2-backlog.md`
- **ADRs**: `docs/adr/` — binding decisions; do not contradict without a new ADR
- **Protected branch**: `main` — PRs only, no direct push. Feature work on `phase-N-*` branches.

---

## Architectural conventions (§4.1.1)

### 1. Money is always integer cents (ADR-0003)

Never use floats for EUR amounts. Store as `integer` (cents). Display with
`toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })`.
German locale: comma as decimal separator (`12,50 €`).

### 2. Event bus for side effects

Use `src/lib/server/events/bus.ts` for audit-log writes, mail dispatch triggers,
and future integrations. Do not call `sendMail()` or `auditLog()` directly from
route actions — emit an event and let registered handlers run.

### 3. Fiscal year via `year_for_booking` (ADR-0001)

Always use the `year_for_booking(ts)` SQL function (Europe/Berlin timezone) for
Buchungsjahr assignment. Never use `new Date().getFullYear()`.

### 4. Sphere assignment is explicit (ADR-0002)

Every income/expense row carries a `sphere` enum value (`ideeller`, `vermoegen`,
`zweckbetrieb`, `wirtschaftlich`). Never infer sphere from category alone.

### 5. FileStorage interface — not drive client directly

Callers upload/download/archive files via `getFileStorage()` from
`src/lib/server/files/storage.ts` (`FileStorage` interface). Never import
`drive-impl.ts` or `local-fs-impl.ts` directly.

The active implementation is selected by the `STORAGE_BACKEND` env var:

- `drive` (default, prod) → `src/lib/server/files/drive-impl.ts`
- `local-fs` (dev + test) → `src/lib/server/files/local-fs-impl.ts`, writes to `FILE_STORAGE_ROOT`

### 6. Audit log is append-only (ADR-0004)

`audit_log` rows are never updated or deleted. `app_runtime` role has only
INSERT on `audit_log`. Hash chain columns (`chain_seq`, `prev_hash`, `row_hash`)
are filled by a trigger (Phase 7.5); leave nullable columns alone.

### 7. Mail idempotency via sent_mails (ADR-0005)

`sendMail()` deduplicates via `UNIQUE(template, entity_kind, entity_id, send_attempt)`.
To re-send, increment `send_attempt`. Never call the provider directly.

### 8. Festschreibung prevents post-close mutation (ADR-0006)

Archived Buchungsjahre are immutable. Route actions must check
`settings.festgeschrieben_bis` before accepting writes.

### 9. bezahlt_von is a discriminated union (ADR-0007)

Use `bezahlt_von_kind` enum + nullable `extern_*` columns (gated by CHECK
constraint). Never add a freeform "payer" text field.

### 10. Source provenance on every app-created row (ADR-0010)

Set `source_kind='app'` on rows created by the app, `'form'` for public-form
submissions, `'sheet_import'` for importer rows, `'fixture'` for seed data.

---

## Database roles (§4.5)

| Role          | Privileges                                                    |
| ------------- | ------------------------------------------------------------- |
| `app_runtime` | CRUD on all tables; INSERT-only on `audit_log`                |
| `app_migrate` | Full DDL (Neon owner role); used only by `scripts/migrate.ts` |
| `app_export`  | SELECT on all tables; used by tax export and backup tooling   |

Roles are created idempotently in `drizzle/0002_roles.sql`.

Default privileges for **future** tables are granted by `drizzle/0012_default_privileges.sql`
— new tables added in later migrations automatically get the right grants for
`app_runtime` (CRUD) and `app_export` (SELECT) without requiring per-migration GRANTs.

In production (Neon), all three roles are NOLOGIN — Neon manages connection auth
itself. In local dev and tests, `scripts/dev-up.sh` and `scripts/db/reset-test-db.sh`
run `ALTER ROLE app_runtime WITH LOGIN PASSWORD 'app_runtime'` (and the same for
`app_export`) so the connection URLs in `.env.development` / `.env.test` work.

---

## Key ADR summary

| ADR  | Topic                                  | Status               |
| ---- | -------------------------------------- | -------------------- |
| 0001 | Year derivation via `year_for_booking` | Accepted             |
| 0002 | Sphere snapshot on booking             | Accepted             |
| 0003 | Cents-only monetary storage            | Accepted             |
| 0004 | Audit log tamper-evidence (hash chain) | Accepted (Phase 7.5) |
| 0005 | Mail idempotency via `sent_mails`      | Accepted             |
| 0006 | Festschreibung / year-close lock       | Accepted             |
| 0007 | bezahlt_von discriminated union        | Accepted             |
| 0008 | Project sphere override                | Accepted             |
| 0009 | Auth threat model                      | Accepted             |
| 0010 | Importer business_id deduplication     | Accepted             |

---

## Branch protection

- `main` is protected — PRs only, require passing CI.
- Feature work goes on `phase-N-*` branches.
- Do **not** push directly; do **not** force-push `main`.
- Each phase ends with a PR reviewed against the reviewer matrix in
  `scripts/orchestration/reviewers/`.

---

## Deployment + migrations

- **Production**: Vercel (SvelteKit `@sveltejs/adapter-vercel`) against Neon Postgres 17.8.
- **Every push to `main`** triggers two independent things:
  - Vercel auto-deploys the app.
  - `.github/workflows/migrate.yml` runs `pnpm tsx scripts/migrate.ts` against Neon (gated on the `NEON_MIGRATE_DATABASE_URL` repo secret).
- **Migrations** live in `drizzle/<NNNN>_*.sql`. Generate via `pnpm drizzle-kit generate`. The migrator reads `drizzle/meta/_journal.json` and applies anything not in Neon's `drizzle.__drizzle_migrations` table (matched by SHA256 hash).
- **Destructive migrations**: split into two phases — additive migration ships first, code change second, DROP last. Don't ship code that requires a not-yet-applied schema change.
- **Manual hotfix to Neon**: avoid. If you must, follow `docs/RUNBOOK.md §6.4` to keep `__drizzle_migrations` in sync, or the next auto-migrate will try to re-apply and likely fail.
- **GitHub secrets**: documented in `README.md` "Deploying to production" → "GitHub Actions secrets" table. Use `gh secret list` to inspect, `gh secret set <NAME> --body '<value>'` to add or rotate.
- **Runbook for failure modes**: `docs/RUNBOOK.md` (§1 rotate secrets, §2 restore from backup, §3 emergency stop, §6 migration runbook).

---

## Environment variables

All env vars are declared and validated in `src/lib/server/env.ts` (Zod schema).
Never read `process.env` directly in app code — use `env` from `env.ts`.

When adding a new env var:

1. Add it to the Zod schema in `src/lib/server/env.ts` with sensible default.
2. Document it in `.env.example` (for prod / Neon documentation).
3. If the var has a dev-specific value, add it to `.env.development` (committed,
   no secrets). If test-specific, add to `.env.test` (committed).
4. If CI needs to set it as a secret, add the GitHub secret reference to
   `.github/workflows/ci.yml`.
5. For dev-only secrets (rare), use `.env.development.local` (gitignored).

---

## Testing

### Stack

- Unit tests: `pnpm test --run` (Vitest — runs `tests/unit/` + `src/**/*.test.ts`)
- E2E tests: `pnpm test:e2e` (Playwright — runs `tests/e2e/`)

### Local + CI Postgres

Both test types run against a **hermetic local Postgres** in docker compose
(see `docker-compose.yml`). CI uses GitHub Actions' `services: postgres:17`
block — same shape, faster on hosted runners.

Both `vitest.config.ts` and `playwright.config.ts` register a **globalSetup**
hook that runs `scripts/db/reset-test-db.sh` before any test starts. The reset
script drops + recreates `folgederwolke_test`, applies all migrations, runs
the seed (reference data + fixtures), and sets up `app_runtime` LOGIN. Each
test invocation gets a known-clean DB. Reset takes ~3-6s on local.

Within a single `pnpm test:e2e` run, Playwright tests share the seeded state
(`fullyParallel: false`). Tests that mutate global state (festschreibung,
year-close) should be ordered last in `testDir` or wrapped in `test.describe.serial()`.

### Connection identities

- Tests connect as **`app_runtime`** (CRUD + INSERT-only on `audit_log`).
  This catches grant bugs early — if you add a table without grants, tests fail
  immediately rather than surfacing in prod.
- The reset script and seed scripts connect as **superuser** via `DIRECT_DATABASE_URL`.

### Mail in tests

- `MAIL_PROVIDER=no-op` is set in `.env.test`. The provider writes the
  `sent_mails` row through the existing event-bus path and returns success
  without any SMTP I/O.
- Test assertions about outgoing mail read from the `sent_mails` table
  directly (ADR-0005 idempotency).

### File storage in tests

- `STORAGE_BACKEND=local-fs` with `FILE_STORAGE_ROOT=./.dev-data/drive-test`.
  Files written by tests land in `./.dev-data/drive-test/` and are wiped by
  the reset script before each test run.

### Tags + CI grep

- Tag new E2E tests with `@phase-N` matching the current phase.
- CI runs cumulative E2E grep: `@phase-0|@phase-1|@phase-2` (will expand
  in future phases as latent bugs in phase-3+ tests get triaged).

### Watch mode

- `pnpm test:watch` does **not** trigger a reset — it uses whatever DB the
  shell env points at. For iterating on test code, run `pnpm dev:up` first.
  When fixtures drift, exit watch and run `pnpm test --run` (which resets) or
  `pnpm dev:reset` (nuclear).

### Setup details

See `README.md` "Local development" section for prerequisites, docker compose
commands, and troubleshooting.
