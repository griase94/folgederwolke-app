# CLAUDE.md — folgederwolke-app architectural conventions

Reference document for AI agents and contributors working in this codebase.
Keep this in sync when ADRs or masterplan sections are updated.

---

## Key references

- **Masterplan**: `docs/` (internal; ask Andy for current version)
- **Phase 2 backlog**: `docs/phase2-backlog.md`
- **ADRs**: `docs/adr/` — binding decisions; do not contradict without a new ADR
- **Branch**: `phase-2-public-form` — protected; no direct push to `main`

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

Callers upload/download/archive files via `src/lib/server/files/storage.ts`
(`FileStorage` interface), not by importing `drive/client.ts` directly.
The Drive implementation lives in `src/lib/server/files/drive-impl.ts`.

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

## Environment variables

All env vars are declared and validated in `src/lib/server/env.ts` (Zod schema).
Add new vars there first, then to `.env.example`, then to `.github/workflows/ci.yml`.
Never read `process.env` directly in app code — use `env` from `env.ts`.

---

## Testing

- Unit tests: `pnpm test --run` (Vitest, `tests/unit/` and `src/**/*.test.ts`)
- E2E tests: `pnpm test:e2e` (Playwright, `tests/e2e/`)
- Tag new E2E tests with `@phase-N` matching the current phase.
- CI runs cumulative E2E grep: `@phase-0|@phase-1|@phase-2|...` (grows each phase).
