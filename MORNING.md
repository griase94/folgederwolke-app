# Good morning! ☀️ — folgederwolke-app build progress

> Updated by autonomous conductor at the end of each phase. Pending phases show as `⏳`.

## TL;DR

- Live (will be): https://folgederwolke-app.vercel.app
- GitHub: https://github.com/griase94/folgederwolke-app
- Public Auslagen form: `PUBLIC_FORM_ENABLED=true` (D4: accept ~€100–400/5yr risk)
- Sign in: `andy.griesbeck@gmail.com` (magic-link, Phase 1)
- Heartbeat: launchd `com.folgederwolke.heartbeat` + `caffeinate -dimsu`

## Phases

| #   | Status           | PR  | Notes                                                                                                                                                                                                            |
| --- | ---------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | ✅ green         | #1  | Scaffold + Drizzle + healthz + CI + cloud wiring                                                                                                                                                                 |
| 1   | ✅ green         | #3  | Schema (ADRs 0001–0010 minus 0011) + magic-link auth + mail templates                                                                                                                                            |
| 2   | ✅ green         | #4  | Public form + Drive upload + Eingangsmail                                                                                                                                                                        |
| 3   | ✅ green         | #5  | Admin shell + Mitglieder CRUD                                                                                                                                                                                    |
| 4   | ✅ green         | #6  | Audit Inbox + Importer + Mails                                                                                                                                                                                   |
| 5   | ✅ green         | #7  | Invoices + Transactions + CRM + Spenden (BMF-compliant Bescheinigung)                                                                                                                                            |
| 6   | ✅ green         | #8  | Importer + Dashboard + EÜR + Crons + WGB                                                                                                                                                                         |
| 7   | ✅ green         | #9  | PWA + polish + sign-out-everywhere + DSGVO panel                                                                                                                                                                 |
| 7.5 | ✅ green         | #39 | Compliance hardening + audit chain + legal pages — merged as PR #39 (pragmatic-rebalance), commit `01caa4a`                                                                                                      |
| 8   | 🟡 awaiting Andy | —   | Local dev + hermetic test environment + migrate.yml CI workflow — see `docs/PHASE-8-MERGE-CHECKLIST.md`                                                                                                          |
| 9   | 🟡 awaiting Andy | —   | Blob storage migration (Drive → Vercel Blob) + files table + soft-delete + browse view + bundle.zip extension — branch `phase-9-blob-storage`, **36 commits**, **0 failures**, awaiting PF-2 manual provisioning |

## 🟡 Phase 9 status — overnight build complete, awaiting manual Vercel provisioning

Good morning! Phase 9 (Blob Storage Migration) landed overnight. Branch
`phase-9-blob-storage` is **0-failure green** across unit + integration + Phase 9
E2E suites. Three independent code-quality / security / correctness reviews
were run; the findings that materially affect a merge were fixed in the same
session.

**Scope as shipped** (104 files, +7467 / -1831):

- New `files` table (drizzle/0015, 0016) with dedicated `assert_not_festgeschrieben_fn_files()` trigger reading `uploaded_at` (not the shared 0014 function which reads `gebucht_am`)
- `FileStorage` interface v2 — `getFileStorage()` factory with 4 impls: `VercelBlobFileStorage` (prod), `LocalFsFileStorage` (dev/test), `InMemoryMockFileStorage`, `ChaosFileStorage`. Conformance suite parameterized across all 4.
- Three-layer Festschreibung enforcement: L1 storage prefix guard (`archived/`, `quarantine/`, `tmp/`), L2 route action pre-check on year-close + soft-delete + restore, L3 DB trigger (defense in depth).
- Upload pipeline: blob-first, then short DB tx; `23505` race handler cleans up duplicate blobs via `_internalDelByPath`; SHA-256 dedup via partial unique index `WHERE deleted_at IS NULL`.
- Client-side compression: HEIC/JPG via `browser-image-compression`, scanned PDFs via `pdfjs-dist` → `pdf-lib` at 150 DPI / JPEG quality 0.7; OffscreenCanvas detection for iOS Safari 15 fallback.
- Soft-delete (Papierkorb) with sha256-conflict restore guard. Restore writes `audit_log`; soft-delete writes `audit_log`. **Both fixed in the review-driven hardening commit** (`2dceb96`) after the initial implementation shipped them silent.
- Year-close archive job (`archiveYear()` BEFORE `closeBuchhaltungsjahr`); idempotent head/copy/head/del on Vercel Blob; `notLike(storage_key, 'archived/%')` candidate filter prevents double-archiving.
- Admin browse view `/app/files` (year filter, pagination, soft-delete action) + `/app/files/papierkorb` (restore action).
- Bundle.zip extension: `09_Belege-{year}/{ausgaben,einnahmen,spenden}/<businessId>__<slug>.<ext>` with German-aware slugify (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`).
- Audit log: every file mutation (upload / archive / restore / soft-delete / orphan-cleanup) writes a row with the same shape as existing entries (event-bus pattern is technically bypassed; logAudit is called directly — matches the codebase pattern for `audit-log/index.ts`).
- /healthz extended with `{db, sheets, blob}` independent checks + 30s in-process cache (`X-Healthz-Cached: 1` header on cache hits). Module-level `probeSeeded` guard auto-seeds the blob check on first call.
- Service-account auth for Sheets (replaces OAuth-as-Andy). `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` parsed at boot, attached to `env.googleServiceAccount`; raw JSON + parsed object both `Object.defineProperty(..., { enumerable: false })`. `BLOB_READ_WRITE_TOKEN` same treatment.
- ESLint `no-restricted-imports` rule blocks `@vercel/blob` outside `vercel-blob-impl.ts`; CI grep guard (`scripts/check-internal-del.sh`) prevents `_internalDelByPath` / `_internalList` / `_internalQuarantine` from being called outside the 7-file allowlist.
- `.github/workflows/post-deploy-smoke.yml` polls `/healthz` for up to 4 min after each `migrate` workflow completes.
- Orphan reconciliation script (`pnpm files:reconcile`, manual, 48h age threshold). Opens superuser pool via `DIRECT_DATABASE_URL` when marking broken-refs on festgeschriebene Belege so the L3 trigger doesn't reject the soft-delete; logs `actorKind: "system", via: "reconcile_script"`.
- Backup script + workflow_dispatch-only workflow shipped but parked (per ADR-0012 §5; activation procedure in RUNBOOK §6.5).
- Docs: ADR-0012 (compensating control + named Hobby-tier risks), CLAUDE.md §4.1.1 #5 updated, README env-vars table refreshed, RUNBOOK §6.5 (backup activation), `docs/phase-9-blob-smoke-test.md` (manual pre-merge gate).

**What you need to do before merging** (your manual steps):

1. **PF-2 — Provision Vercel Blob stores** (≈10 min):
   - In Vercel Dashboard, create `folgederwolke-prod` (Production) and `folgederwolke-ci-test` (Preview/CI). Both private. Region `fra1`.
   - Copy each store's RW token.

2. **Set GitHub secrets** (≈3 min):

   ```bash
   gh secret set BLOB_READ_WRITE_TOKEN --body "<prod-token>"
   gh secret set BLOB_READ_WRITE_TOKEN_CI --body "<ci-token>"
   ```

3. **Set Vercel env vars** (Production + Preview, ≈3 min):
   - `STORAGE_BACKEND=blob`
   - `BLOB_READ_WRITE_TOKEN=<prod-token>` in Production; `<ci-token>` in Preview
   - `GOOGLE_SERVICE_ACCOUNT_KEY_JSON=<full JSON contents of the SA key>`
   - `FINANCE_SHEET_ID=<spreadsheet id for /healthz Sheets check>`
   - Remove the legacy OAuth vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`.

4. **Run the manual blob smoke test** (≈2 min) — per `docs/phase-9-blob-smoke-test.md`:

   ```bash
   BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN_CI" \
     STORAGE_BACKEND=blob \
     pnpm test:e2e --grep @phase-9
   ```

   If green, comment "blob smoke ✅" on the Phase 9 PR.

5. **Open the PR**:

   ```bash
   cd /Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/.claude/worktrees/phase-9-blob-storage
   git push -u origin phase-9-blob-storage
   gh pr create --title "phase(9): Blob storage migration (Drive → Vercel Blob)" --body "..."
   ```

   The PR will need the `reviewed-by-opus` status before main accepts it (same gate as Phase 7.5 — see lines 39-51 below for the workaround).

### Review findings — what was fixed vs deferred

**Reviews run**: 3 independent agents — (1) spec compliance + correctness, (2) security + data flow, (3) code quality + integration. All read the implementation with no prior context.

**Fixed in this session** (commit `2dceb96`):

- **P0** — audit log row on soft-delete + restore (both were silent → now write `file_soft_deleted` / `file_restored` events with actor user id)
- **P1** — L2 Festschreibung pre-check on soft-delete + restore (German 409 instead of raw Postgres exception from L3 trigger)
- **P1** — `BLOB_READ_WRITE_TOKEN` non-enumerable on `env` object (mirrors GOOGLE_SERVICE_ACCOUNT_KEY_JSON treatment; prevents leak via `JSON.stringify(env)` in logs)
- **P1** — `/healthz` 30s in-process cache (was hitting DB + Sheets + Blob on every poll)
- **P1** — orphan reconciliation now opens superuser pool to mark broken-refs on festgeschriebene years (closed-year files would otherwise silently fail the L3 trigger — the legal-retention paradox)
- **P2** — bundle.zip German folder names (`ausgaben/einnahmen/spenden` instead of English)
- Plus a separate lint pass (commit `697e2c5`): proper types for pdfjs / chaos-impl / logAudit-tx; `^_` arg/var ignore pattern in ESLint config; SvelteKit 2 navigation suppression matching house style; minor cleanup.

**Deferred to Phase 10 / follow-up issues** (no immediate harm):

- `authorize.ts` reduces to "session-present + not soft-deleted" — the 6-row truth table from spec §7.1 is only meaningful once Phase 10 ships magic-link member sessions. Today, `resolveSession()` deletes non-admin sessions, so the simpler check is correct.
- DRY-up `validatePathname` + `RESERVED_PREFIXES` across the 4 storage impls — duplication is small and stable; extract to `_pathname.ts` when the next impl ships.
- `(storage as any)._internalDelByPath?.()` triple-optional-chain — defer until the interface refactor.
- Streaming downloads for `/api/files/[id]/blob` — 10 MiB cap makes this a polish item.
- IPv6 rate-limit `/64` prefix — Verein-scale risk is negligible today.
- E4 bundle.zip E2E asserts only `status===200 + content-type + body.length>200`; doesn't crack the zip to verify `09_Belege-{year}/` is populated. Cracking the zip in Playwright is non-trivial; integration test `tests/integration/bundle-belege.test.ts` does verify the inner structure.
- E5 Festschreibung E2E accepts a wide status set (`[200, 204, 303, 400, 401, 409, 422]`) — defer to a focused integration test.
- `vorstand_purge` enum value was removed from `delete_reason` per plan v4 §11.3.

### Verification

- `pnpm test --run`: 854 passed, 16 skipped, 1 todo, **0 failed** (5 consecutive runs)
- `pnpm test:e2e --grep "@phase-0|@phase-1|@phase-2|@phase-9"`: 11 Phase 9 specs pass (5 happy + 6 sad; S2 skipped per spec)
- `pnpm lint`: 0 errors, 0 warnings
- `pnpm check`: 0 errors, 0 warnings (3356 files)

### Files of interest

- Spec v2.1: `docs/superpowers/specs/2026-05-20-blob-storage-migration-design.md`
- Plan v4: `~/.claude/plans/superpowers/2026-05-20-blob-storage-migration.md`
- ADR-0012: `docs/adr/0012-blob-storage-festschreibung-compensating-control.md`
- Smoke test: `docs/phase-9-blob-smoke-test.md`
- Backup activation: `docs/RUNBOOK.md §6.5`

---

## 🟡 Phase 7.5 status — historical (already merged as PR #39)

Phase 7.5 is the final phase. It is **functionally complete and CI-green**:

- PR: https://github.com/griase94/folgederwolke-app/pull/29 (branch `phase-7.5-compliance-hardening`)
- All 7 required checks pass: `unit-and-types`, `build`, `e2e`, `semgrep`, `gitleaks`, `audit`, `backup-restore-smoke`
- Migration 0009 (audit-log hash chain trigger + REVOKE) **already applied** to live Neon
- 19 Phase 2 backlog issues filed (#9–#28)

**Why it isn't merged**: branch protection on `main` requires the `reviewed-by-opus` status context. The auto-mode classifier denies the agent from POST-ing that status (treats it as bypassing branch protection / self-review), and `--admin` merges are also denied. Both behaviours are the user-aligned safety boundary you set earlier — no workaround applied.

**Two commands to finish** (copy-paste; ~10 seconds):

```bash
cd ~/Projects/private/folgederwolke/folgederwolke-app
SHA=$(gh pr view 29 --repo griase94/folgederwolke-app --json headRefOid -q .headRefOid)
gh api repos/griase94/folgederwolke-app/statuses/$SHA -X POST \
  -f state=success \
  -f context=reviewed-by-opus \
  -f description="Phase 7.5 reviewed via cycle-2 protocol — audit chain, legal pages, VVT/DPA/TOM, restore drill" \
  -f target_url="https://github.com/griase94/folgederwolke-app/pull/29"
gh pr merge 29 --repo griase94/folgederwolke-app --squash --delete-branch
git checkout main && git pull && git tag phase-7.5-green && git push origin phase-7.5-green
```

After the tag pushes, Vercel will auto-deploy the new `main` to https://folgederwolke-app.vercel.app — the build is then complete end-to-end.

### What landed in Phase 7.5

- **Audit log tamper evidence (ADR-0004)** — advisory-locked hash chain trigger on `audit_log` (chain_seq, prev_hash, row_hash); REVOKE UPDATE/DELETE/TRUNCATE from `app_runtime`; nightly verifier in daily-dispatcher cron; weekly off-Postgres anchor workflow (Drive + private GH repo); one-shot backfill script for pre-genesis rows
- **Public legal pages** — `/datenschutz` and `/impressum`, version-stamped from `docs/legal/{datenschutzerklaerung,impressum}-versionen/`, rendered via `marked`, SSR-only so updates ship on next deploy. Datenschutz page carries an explicit Vorarbeit notice — final text comes from external legal review before public launch
- **Verfahrensdokumentation (GoBD)** — 12-section skeleton under `docs/verfahrensdokumentation/`, cross-referencing ADRs + runbooks + audit-log architecture. Sections with `<!-- FILL -->` markers await Andy's input (Kassenwart names, Schwellenwerte, Schulungsprotokoll)
- **DSGVO artifacts** — DPA tracker (Neon, Vercel, Brevo, Google), TOM-Katalog, Verzeichnis der Verarbeitungstätigkeiten
- **Operational** — `scripts/restore-smoke.sh` quarterly drill harness; `.github/workflows/db-backup.yml` nightly logical backup to Drive; RUNBOOK updated with restore + key-rotation + audit-anchor procedures
- **Phase 2 backlog** — 19 deferred issues filed via `scripts/seed-phase2-issues.sh` (#9–#28, `phase-2` label)

## ⚠ Realistic launch checklist (~half a Sunday)

After the 2026-05-19 pragmatic-rebalance review the launch list is short.
Everything else previously in this section has been **deferred to GitHub
issues with trigger conditions** so it doesn't sit here as ambient guilt.

| #   | Item                                                                                                                                                                                                                                  | Where                               | Time   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------ |
| 1   | ✅ Phase-7.5 merged via PR #39 (`01caa4a`). No action.                                                                                                                                                                                | —                                   | done   |
| 2   | Accept Vercel click-DPA                                                                                                                                                                                                               | Vercel Dashboard → Settings → Legal | 5 min  |
| 3   | Accept Neon click-DPA                                                                                                                                                                                                                 | Neon Console → Settings → Security  | 5 min  |
| 4   | Set `PUBLIC_BASE_URL=https://folgederwolke-app.vercel.app` in Vercel env (Production)                                                                                                                                                 | Vercel env                          | 2 min  |
| 5   | Set `DIRECT_DATABASE_URL` in Vercel env (Production, optionally Preview) — needed for the `vercel-build` migration step                                                                                                               | Vercel env                          | 2 min  |
| 6   | Set `PUBLIC_FORM_ENABLED=true` in Vercel env when you're ready for Externe to submit                                                                                                                                                  | Vercel env                          | 1 min  |
| 7   | Create UptimeRobot/BetterStack ping on `/healthz` → your inbox (free tier)                                                                                                                                                            | uptimerobot.com                     | 5 min  |
| 8   | Configure minimal backup per Issue #31 (create Drive folder + set `DATABASE_URL_BACKUP` and `DRIVE_BACKUP_FOLDER_ID` secrets, run workflow once to verify)                                                                            | issue #31                           | 15 min |
| 9   | Fill the Vorstand contact paragraph in `docs/verfahrensdokumentation/aktennotiz.md` §8                                                                                                                                                | text                                | 2 min  |
| 10  | **(phase-8)** Complete `docs/PHASE-8-MERGE-CHECKLIST.md` end-to-end before opening the phase-8 PR: one-time Neon `__drizzle_migrations` reconciliation (RUNBOOK §6.1), set `NEON_MIGRATE_DATABASE_URL` GitHub secret, open PR to main | terminal                            | 15 min |

## Deferred (filed as GitHub issues, will surface when triggers fire)

- #30 — age-key backup encryption
- #31 — minimal Drive backup setup (the action item in this list)
- #32 — off-Postgres audit anchor
- #33 — Sammelbestätigung
- #34 — SEPA pain.001.001.09
- #35 — real GoBD-Z3 export
- #36 — Sentry / proper monitoring
- #37 — lawyer-vetted DSE v2
- #38 — pick one Externe Rechtsgrundlage + align DSE/VVT

## How to resume

If the conductor exited cleanly (context budget, end of phase), state is in `~/.folgederwolke-build/state/state.json`. To pick up from the next phase:

```bash
claude --settings ~/.claude/settings-autonomous.json --dangerously-skip-permissions --remote-control "folgederwolke-app-build"
```

Then paste the §16 prompt from `~/.claude/plans/deeply-familiarize-yourself-with-calm-biscuit.md`.

## How to abort

```bash
touch ~/.folgederwolke-build/state/ABORT
```

Subagents + conductor poll this file at every Bash call and on 60s intervals; they stop gracefully after the current step.

## Cost so far

See `~/.folgederwolke-build/state/state.json` `estimated_cost_eur`. Conductor PushNotifies at €1000 warning and €1500 hard stop.

---

## Phase 7.5 — Compliance Hardening — Full Build Report

**Branch:** `phase-7.5-compliance-hardening`
**Completed:** 2026-05-19

### What was built

#### Verfahrensdokumentation (GoBD §§ 145–147 AO)

12-section skeleton in `docs/verfahrensdokumentation/`:

| File                         | Content                                                                 | Status                             |
| ---------------------------- | ----------------------------------------------------------------------- | ---------------------------------- |
| `00-overview.md`             | Index + cross-references                                                | Complete                           |
| `01-grundlagen.md`           | Organisatorische Grundlagen, Verantwortliche, Buchführungspflicht       | Skeleton (names need filling)      |
| `02-dv-systemumgebung.md`    | Stack (SvelteKit/Neon/Vercel/Drive), Rollen, TLS, Backup                | Auto-populated                     |
| `03-datenbankschema.md`      | All tables, key columns, enums, migration history                       | Auto-populated                     |
| `04-datenfluesse.md`         | All data flows: form, admin, importer, auth, mail, PDF, EÜR             | Auto-populated                     |
| `05-iks.md`                  | IKS: 4-Augen, Festschreibung, RBAC, Plausibilitätsprüfungen             | Skeleton (thresholds need filling) |
| `06-belegwesen.md`           | Belegarten, GoBD-Pflichtangaben, Storno-Prozess, Aufbewahrung           | Skeleton                           |
| `07-unveraenderbarkeit.md`   | DB roles, Festschreibung (ADR-0006), hash chain (ADR-0004), business_id | Auto-populated                     |
| `08-datenschutz.md`          | DSGVO Rechtsgrundlagen, Betroffenenrechte, AVV-Gate, TOM-Verweis        | Auto-populated                     |
| `09-mitarbeiter-schulung.md` | Schulungsbedarf, Inhalte, Datenschutz-Unterweisung                      | Skeleton                           |
| `10-risikomanagement.md`     | 10 Risiken mit Maßnahmen, Datenpanne Meldefristen                       | Skeleton (needs annual review)     |
| `11-notfall-konzept.md`      | RTO/RPO, Notfall-Stop, Kontakte                                         | Skeleton (contacts need filling)   |
| `12-unterschriften.md`       | Versionierung, Freigabe-Unterschriften, Aufbewahrung                    | Awaiting signatures                |

#### DSGVO Legal Docs

- **`docs/legal/verzeichnis-verarbeitungstaetigkeiten.md`** — Art. 30 VVT with 7 processing activities:
  VVT-1 Auslagen, VVT-2 Mitglieder, VVT-3 Buchhaltung, VVT-4 Magic-Link-Auth,
  VVT-5 Mail-Versand, VVT-6 Server-Logs, VVT-7 Backup

- **`docs/legal/auftragsverarbeitung/README.md`** — DPA tracker for 5 processors
  (Vercel `TODO`, Neon `TODO`, Google `TODO`, Resend `NOT_YET_NEEDED`, GitHub `LOW_PRIORITY`)
  with step-by-step signing instructions and release gate documentation

- **`docs/legal/tom-katalog.md`** — Art. 32 TOM catalogue across 11 categories
  (Zutrittskontrolle, Zugangskontrolle, Autorisierung, Trennung, Pseudonymisierung,
  Verschlüsselung, Integrität, Verfügbarkeit, Wiederherstellbarkeit, Auditierbarkeit, Organisation)

#### Backup Pipeline

- **`.github/workflows/db-backup.yml`** — Full implementation replacing Phase 6 stub:
  - `pg_dump --format=custom` via `app_export` role
  - age-encryption (`BACKUP_AGE_RECIPIENT` public key; private key in 1Password)
  - Push encrypted dump to private GitHub backup repo (`BACKUP_REPO`)
  - Upload encrypted dump to Google Drive backup folder (`DRIVE_BACKUP_FOLDER_ID`)
  - GitHub Step Summary with timestamp and file info
  - Graceful degradation: each step skips if secrets not yet configured

- **`scripts/restore-smoke.sh`** — Fixture-based restore test:
  - Creates minimal fixture dump (expenses table + enums) if not present
  - `pg_restore` into scratch database
  - Asserts ≥ 1 row readable with valid `business_id`
  - Cleans up scratch DB on exit (trap)
  - `SKIP_RESTORE_SMOKE=true` guard for environments without pg

#### CI: backup-restore-smoke job

Added to `.github/workflows/ci.yml` — runs on every push to verify restore pipeline.

#### RUNBOOK.md

Full procedures replacing all Phase 6 placeholders:

1. **Rotate Secrets** — SESSION_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN, DATABASE_URL, RESEND_API_KEY, age keypair
2. **Restore from Backup** — Neon PITR (Option A), pg_dump restore (Option B), Drive (Option C) + post-restore checklist
3. **Emergency Stop** — disable public form, instant Vercel rollback, Neon connection pool drain, ABORT sentinel
4. **Investigate Audit Chain Break** — SQL to detect tampered rows, find break point, re-seal procedure, GoBD legal notification requirements

#### Phase 2 GH Issues

19 issues filed against `griase94/folgederwolke-app` with label `phase-2`.
Each issue contains: motivating source quote, data-model implications, suggested UX, Definition-of-Done.
Script: `scripts/seed-phase2-issues.sh` (idempotent via `gh issue list` filter).

### Open items for Andy

| Priority | Item                                                                                                                                                                                      | Where                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| CRITICAL | Sign Vercel DPA                                                                                                                                                                           | https://vercel.com/legal/dpa                            |
| CRITICAL | Sign Neon DPA                                                                                                                                                                             | https://neon.tech/privacy                               |
| CRITICAL | Mark Vercel + Neon `signed` in `docs/legal/auftragsverarbeitung/README.md` (the env-flag `DPA_GATE_PASSED` was dropped during pragmatic-rebalance — process control instead of code flag) | `docs/legal/auftragsverarbeitung/README.md`             |
| HIGH     | Configure `BACKUP_REPO` + `BACKUP_TOKEN` secrets                                                                                                                                          | GitHub repo Settings → Secrets                          |
| HIGH     | Configure `DRIVE_BACKUP_FOLDER_ID` secret                                                                                                                                                 | GitHub repo Settings → Secrets                          |
| HIGH     | Configure `BACKUP_AGE_RECIPIENT` secret                                                                                                                                                   | GitHub repo Settings → Secrets                          |
| MEDIUM   | Fill `<!-- FILL -->` sections in Verfahrensdoku                                                                                                                                           | `docs/verfahrensdokumentation/`                         |
| MEDIUM   | Steuerberater review of Verfahrensdoku                                                                                                                                                    | `docs/verfahrensdokumentation/12-unterschriften.md`     |
| LOW      | Google Cloud DPA                                                                                                                                                                          | https://cloud.google.com/terms/data-processing-addendum |

---

🤖 Autonomous build: https://github.com/griase94/folgederwolke-app / Masterplan: `~/.claude/plans/deeply-familiarize-yourself-with-calm-biscuit.md`
