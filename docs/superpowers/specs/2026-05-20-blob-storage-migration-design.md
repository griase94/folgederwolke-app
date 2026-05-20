# Phase 9 — Blob Storage Migration — Design

**Status:** v2 — revised 2026-05-20 from 7-expert review. Awaiting user review before plan.
**Branch:** `phase-9-blob-storage` (worktree off `origin/main`)
**Related issues:** #55 (Workspace for Nonprofits — deferred), #37 (env.ts COMMIT_SHA alias — separate PR)
**Calibration:** Folge der Wolke is a 20-person gemeinnütziger Verein. Scope aims at data security + great UX + robust implementation + nice workflows. Enterprise-grade compliance items (TIA, DPIA paperwork, ed25519-signed audit events, virus scanning, field-level PII classification, multi-disaster DR runbooks, audit-log partitioning, mutation testing, sophisticated rate-limiting) are explicitly out of scope — see §13.

---

## 1. Goal

Move all file storage (Belege, Rechnungs-PDFs, Spendenbescheinigungen, future exports) from Google Drive to **Vercel Blob private storage** (`fra1`), with a normalized `files` table as the schema backbone, hardened by client-side compression, three-layer Festschreibung enforcement, and a parked-but-ready backup script. Kill the OAuth-as-Andy auth path; the Google service account stays only for Sheets reads.

The work must satisfy five user-stated criteria, in priority order:

1. **No data loss, ever** — primary acceptance criterion. Every transactional boundary tested with failure injection; orphan reconciliation catches anything that slips through.
2. **Free at current scale** — Vercel Blob Hobby tier covers our workload (<5GB / decade). Pro upgrade and DPA acceptance deferred until DSGVO HIGH items close generally (documented named risk).
3. **No extra user auth for viewing/uploading** — public form remains anonymous (magic-link only); preview goes through the app's existing magic-link session.
4. **In-app previews** — `/api/files/[id]/blob` proxy route + `/app/files` browse view + per-entity preview component. No `webViewLink`-style external redirects, no Google login prompts.
5. **Easy compression** — `browser-image-compression` for images, `pdfjs-dist` + `pdf-lib` for scanned PDFs > 1.5MB. Both client-side, web-worker-backed, with graceful fallback to original.

## 2. Background

Phase 1 introduced a `FileStorage` interface in `src/lib/server/files/storage.ts` with two implementations: `drive-impl.ts` (Google Drive via OAuth-as-Andy) and `local-fs-impl.ts` (dev + test). Phase 7.5 hardened Festschreibung at the DB layer (ADR-0006 trigger + tamper-evident audit chain).

Production Drive integration broke during the Phase 7.5 → 8 transition (OAuth refresh-token rot, surfaced as `drive: fail` on `/healthz`). A multi-expert panel evaluated alternatives and converged on Vercel Blob; a follow-up deep-dive confirmed Blob is a CONDITIONAL FIT with three guardrails (soft-delete, app-code Festschreibung, no token in browser). A 7-expert review of spec v1 identified the corrections incorporated into this v2.

The legal review (`docs/reviews/2026-05-19-dsgvo-legal-review.md`) flagged personal-Drive storage of PII (Belege contain Spendername, Betrag, IBAN, Anschrift) as not Art. 28 conformant. Phase 9 reduces this finding by moving files off personal Drive entirely; the residual Hobby-tier-no-DPA gap is documented as a named risk pending broader DSGVO cleanup (see §13).

## 3. Scope

### In scope (Phase 9, this PR)

- **Schema**: new `files` table, normalized; FK columns on every booking-bearing table; new `file_kind` enum; existing `entity_kind` enum extended to include `'file'` (so audit_log can reference files); existing `source_kind` enum reused; partial indices on every `*_file_id` column.
- **Festschreibung trigger extended to `files`** via a `year_of_buchung` generated column added to the table.
- **Interface**: simplified `FileStorage` — `upload({ buffer, mimeType, pathname })`, `download(pathname)`, `downloadStream(pathname)`, `archive(pathname, year)`. `viewUrl(fileId)` moved to a domain-level helper since it needs DB lookup. No `idempotencyKey`, no `delete()` (soft-delete via DB only).
- **Implementations**: new `vercel-blob-impl.ts` (private store, `fra1`). `local-fs-impl.ts` adapted to new interface. `drive-impl.ts` deleted.
- **Drive client**: file operations removed (`drive/client.ts` deleted, `drive/sheets-client.ts` introduced for the Sheets-read path). `getDriveAuth()` rewritten to use `GoogleAuth` with the existing service account `fdw-automation@folge-der-wolke.iam.gserviceaccount.com`.
- **Routes**:
  - `/api/files/[id]/blob` — auth-checked proxy route (replaces `/api/dev-files/[id]`)
  - `/api/files/[id]/thumbnail` — auth-checked thumbnail proxy (sized image preview)
  - `/app/files` — Vorstand browse view with URL-param-persisted filters
  - **Extend** existing `/app/jahresabschluss/[year]/bundle.zip` from c1 (`src/lib/server/export/bundle.ts`) to include Belege bytes in a new `09_Belege-{year}/` subfolder with sphere-aware substructure. The bundle already includes EÜR PDF, Spendenliste, Beleg-Index CSV, GoBD-Z3, Bescheinigungs-PDFs, Audit-Log slice, Mitgliedsbeiträge — Phase 9 just adds the actual Beleg files alongside the existing index. **No new `/export/files.zip` route**.
- **Upload pipeline**: client-side compression (`browser-image-compression` + `pdfjs-dist`/`pdf-lib`) with per-page progress UI; server-side magic-byte MIME sniff (`file-type` npm); deterministic pathname-from-file_id; **blob upload first, then short DB transaction** (inverted from v1 to eliminate orphan windows on lost-ACK).
- **Thumbnail generation at upload**: for image kinds, generate a `200×200` webp at `belege/<year>/<id>.thumb.webp` alongside the original. PDF kind: render page 1 to webp.
- **Festschreibung**: three-layer enforcement (`denyWritesToReservedPrefixes` covering `archived/`+`quarantine/`+`tmp/`, route-action `festgeschriebenBis` checks, DB row-level trigger extended to `files`). Resumable archive job.
- **Orphan reconciliation**: nightly `scripts/files-reconcile.ts`, 48h age threshold on quarantine decisions, audit-log every action.
- **Backup**: `scripts/backup-files.ts` + `.github/workflows/files-backup.yml` (workflow_dispatch only). **Backup-RESTORE round-trip in CI smoke** (not just backup). Activation deferred but the path is exercised.
- **Tests**: storage conformance suite parameterized over impls, Vitest integration with `ChaosFileStorage` (including `failAfterBytes(n)`), Playwright E2E happy + sad paths, property-based authorization invariants, gated real-Blob CI on main, year-boundary tests, cross-year Storno round-trip.
- **Automated post-deploy smoke**: `.github/workflows/post-deploy-smoke.yml` runs after `migrate.yml` succeeds — curls `/healthz`, exercises a seed file via authenticated test session. Blocks subsequent deploys if it fails.
- **Preview env explicitly points at `folgederwolke-ci-test` Blob store**, not Production. Documented in cutover §11.
- **`/healthz` returns only `{db, sheets, blob: ok|fail}`** — no Nachname, no commit SHA, 30s in-process cache, blob check is head-only and does not write audit_log.
- **Error message table**: every error class → German user-facing text → suggested fix → optional help URL. Lives in `src/lib/components/forms/file-error-messages.ts`.
- **Export ZIP structure**: sphere-aware subfolders for `ausgaben/`, `einnahmen/`, `spenden/`, plus `00-EUER-YYYY.pdf`, `00-INDEX.csv`, donor-PII-safe filenames.
- **ADR-0012**: Blob durability + Festschreibung as compensating control + Hobby-tier named risk acceptance.
- **Docs**: `README.md` update (env vars), `CLAUDE.md` update (§4.1.1 #5 amended with literal new text in §11.5 below), `RUNBOOK.md` § for backup activation.

### Out of scope (deferred to a separate, smaller follow-up PR)

- **`drizzle/0014_drop_drive_columns.sql`** — destructive DROP of `*_drive_file_id` columns. Ships one week after Phase 9 for max rollback safety. Standard CLAUDE.md split-migration pattern.
- **Issue #55** — Google Workspace for Nonprofits (parallel future track for sheets DPA).
- **Issue #37** — env.ts `COMMIT_SHA` alias (cosmetic, separate small PR).
- **Migration of legacy Drive files**: confirmed by user — no production Belege to preserve. Existing Drive folder stays completely untouched.

### Explicitly deferred (no issue opened; documented here for posterity — see §13)

These items came from the 7-expert review but are enterprise-grade overkill for a 20-person Verein. They are NOT opened as issues. If they become real concerns later, they'll surface and get tracked then.

- TIA / DPIA formal compliance documents
- Full Verfahrensdokumentation chapter rewrites (only the file-storage table row gets updated)
- Vercel Pro upgrade for DPA — already named risk; revisit with broader DSGVO cleanup
- Sophisticated audit-log forgeability mitigations (signed events, ed25519 keys)
- Audit log partitioning / scale infra (10-year volume estimated < 4M rows)
- Mutation testing, perf tests at 10k+ files
- Defense against compromised-submitter scenarios (per-submitter rate-limit, virus scanning, EXIF stripping)
- Field-level PII classification
- Formal incident-response runbooks for low-probability events
- Multi-disaster DR procedures (Neon-and-Blob both lost simultaneously)
- sha256 dedup privacy-oracle hardening
- Cron-skip alerting for nightly jobs
- 7-day AO §200 RTO compliance hardening (revisit if/when an actual Prüfung is scheduled)
- Audit log extract in export ZIP

## 4. Architecture decisions

### 4.1 Normalized `files` table (Option C, confirmed)

Rationale unchanged from v1. First-class entity with FK columns on owning rows, sha256-based dedup, soft-delete via `deleted_at`. Same Beleg may back multiple entities (sphere splits, Storno chains) without file duplication.

### 4.2 Storage key shape

Pathname IS the storage key. Format:

```
<kind>/<year>/<id>.<ext>
```

Examples:
- `belege/2026/01900a32-…f.pdf` — id = `files.id` (gen_random_uuid)
- `belege/2026/01900a32-…f.thumb.webp` — generated thumbnail
- `rechnungen/2026/R-2026-0007.pdf` — id = the entity's existing `business_id` (already produced by `id_counters` per ADR-0010)
- `bescheinigungen/2026/Z-2026-0042.pdf` — id = donation's bescheinigung business_id
- `archived/belege/2025/01900…aa.pdf` — post-Festschreibung
- `quarantine/belege/2026/<original>.pdf` — orphan-reconciliation destination

**Year derivation**:
- For files **already linked** to an entity (Rechnungs-PDF regenerate, Bescheinigung): year derived from owning entity's `year_of_buchung` (per ADR-0001 `year_for_booking(gebucht_am)`).
- For files in the upload-then-link path (public form): year derived from `year_for_booking(now())` at upload time. Re-archived later if the linked expense's `gebucht_am` resolves to a different year.

**Idempotency**: `allowOverwrite: false` (Blob default) + deterministic pathname-from-id → second upload to same path errors loudly. We never get silent overwrites.

**Note on `lfd_nr` / business_id**: `id_counters` table + `business_id` pattern (ADR-0010) is already established. The export filename helper reads from existing `business_id` columns; no new sequence mechanism in Phase 9.

### 4.3 `FileStorage` interface (simplified, ports-and-adapters)

```ts
interface FileStorage {
  upload(args: { buffer: Uint8Array; mimeType: string; pathname: string }): Promise<{ etag: string }>;
  download(pathname: string): Promise<Uint8Array>;
  downloadStream(pathname: string): Promise<ReadableStream>;
  archive(pathname: string, year: number): Promise<{ newPathname: string }>;
  // No viewUrl on the interface — see §4.4
  // No delete() — soft-delete via DB only
}

// Domain-level helper (lives in src/lib/server/files/view-url.ts):
async function fileViewUrl(fileId: string): Promise<string>; // returns `/api/files/${fileId}/blob`
async function fileThumbnailUrl(fileId: string): Promise<string>; // returns `/api/files/${fileId}/thumbnail`
```

Notes:
- `viewUrl` removed from the interface (it needs DB access; doesn't belong in a storage adapter)
- `archive()` is the ONLY method that writes to `archived/*` paths. The vercel-blob-impl reserves the `archive()` method to call a **private** internal copy primitive that's not part of the interface — there is no `internal: true` flag or context-based bypass that any caller could trip. Upload/copy of `archived/*` paths from outside the archive method always throws.

### 4.4 `vercel-blob-impl.ts` behavior

- Private store, region `fra1`
- `BLOB_READ_WRITE_TOKEN` lives only in server-side env; runtime assertion + CI build-output scan prevent leaks
- `denyWritesToReservedPrefixes(['archived/', 'quarantine/', 'tmp/'])` guard wraps every public `upload()` and `copy()` call. Internal archive + quarantine helpers use private methods that bypass the guard explicitly via direct module-private function calls (not a flag, not a context — they're not exported).
- `allowOverwrite: false` on every public upload
- Public methods wrap all SDK calls in error redaction: any thrown error is re-thrown as `StorageError` (or subclass) with the underlying message scrubbed of `BLOB_READ_WRITE_TOKEN`, signed URLs, and stack-trace bearer headers
- Errors mapped to typed error classes: `StorageNotFoundError`, `StorageDuplicateError`, `StorageImmutabilityError`, `StorageNetworkError`, `StorageInvalidError`
- `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` is parsed inside `env.ts`; the exported env object exposes `{ clientEmail, getKeyForGoogleAuth() }` only, never the raw JSON string. The raw value is set to non-enumerable on the env object so `JSON.stringify(env)` cannot leak it.

### 4.5 Three-layer Festschreibung enforcement (corrected)

| Layer | Mechanism | What it blocks |
|---|---|---|
| L1 (storage impl) | `denyWritesToReservedPrefixes` in `vercel-blob-impl` | Any `put()` or `copy()` from public methods to `archived/`, `quarantine/`, or `tmp/` |
| L2 (route action) | `await fetchFestgeschriebenBis()` check + `FestschreibungError` throw | Any user-facing mutation (upload, soft-delete, archive) targeting a year ≤ `festgeschrieben_bis` |
| L3 (DB trigger) | Phase-7.5 row-level trigger, **extended in Phase 9** to include `files` | Any `UPDATE` or `DELETE` against a row with `festgeschrieben_at IS NOT NULL` (entity tables) OR against a `files` row whose `year_of_buchung` ≤ `settings.festgeschrieben_bis` |

L3 extension implementation: `files` gets a `year_of_buchung integer GENERATED ALWAYS AS (year_for_booking(uploaded_at)) STORED` column, and the existing `assert_not_festgeschrieben_fn()` trigger array is extended to include the `files` table. This way the existing trigger logic covers files without rewriting it.

Defense in depth: a single layer bypass doesn't compromise immutability.

### 4.6 Year-close + resumable archive job

```
1. User clicks "Jahr YYYY abschließen" in /app/jahresabschluss/[year]/close
2. Pre-flight checklist passes
3. BEGIN TX:
   - close_buchhaltungsjahr(YYYY, actor) flips festgeschrieben_at on entity rows
   - settings.festgeschrieben_bis = YYYY
   - audit_log entries
   COMMIT
4. Background job archive_year(YYYY):
   for each file with year_of_buchung = YYYY and NOT storage_key LIKE 'archived/%' and deleted_at IS NULL:
     storage.archive(file.storage_key, YYYY)
       a. newPathname = 'archived/' + storage_key
       b. head(newPathname) → if exists AND size matches → jump to step e (idempotent re-run)
       c. copy(storage_key, newPathname) with allowOverwrite: true (idempotent)
       d. head(newPathname) verify size + SHA256 (via head().checksum or a download-and-compare)
       e. head(storage_key) → if exists → del; if already gone → fine (idempotent)
     BEGIN TX:
       UPDATE files SET storage_key = newPathname
       INSERT audit_log (event='file_archived', file_id, actor)
     COMMIT (audit log entry is in same TX as storage_key update — chain consistency preserved)
```

The archive job iterates one file at a time. Each file's commit boundary is atomic. Resumability:
- Crash AFTER copy, BEFORE head verify → re-run: head(new) succeeds → skip copy, proceed to del + UPDATE
- Crash AFTER head verify, BEFORE del → re-run: head(new) succeeds → skip copy, head(old) succeeds → del
- Crash AFTER del, BEFORE UPDATE → re-run: head(new) succeeds, head(old) fails (gone) → skip both, do UPDATE+audit
- Crash DURING UPDATE+audit → DB transaction rollback; re-run starts from step a; pathway is fully idempotent

### 4.7 Soft-delete model

`files.deleted_at` (paired with `delete_reason`) is the only delete reachable from app code:

- Read path rejects rows with `deleted_at IS NOT NULL` → returns 410 Gone
- Browse view filters them out; Vorstand "Papierkorb" tab shows them with Restore action
- L2 guard prevents soft-delete of files attached to closed-year entities
- **Restore semantics when a current row with the same sha256 exists**: Restore action checks if any active row (`deleted_at IS NULL`) already has the same sha256. If yes, the Restore returns a user-facing German error: "Eine neue Version dieses Belegs ist bereits aktiv." The Vorstand can choose either to leave the new version, or to soft-delete the new one first and then restore the original.
- Hard-delete (`blob.del()` from app) is **never** called outside the archive job's internal del-after-copy step

### 4.8 Orphan reconciliation job

Runs nightly via `scripts/files-reconcile.ts` (or `pnpm files:reconcile`):

```
1. snapshotTime = now()
2. dbRows = SELECT id, storage_key, sha256 FROM files WHERE deleted_at IS NULL
3. blobs = blob.list() paginated through entire store
4. Diff with age threshold (48h buffer to avoid catching in-flight uploads):
   - blobs older than (snapshotTime - 48h) AND not in dbRows → ORPHAN
     → re-check DB for this storage_key (snapshot might be stale)
     → if still orphan: move to `quarantine/<original-pathname>` via internal helper
     → audit_log: event='file_orphan_quarantined', pathname, byte_size
   - dbRows whose storage_key has no matching blob → BROKEN_REF
     → UPDATE files SET deleted_at=now(), delete_reason='blob_missing'
     → audit_log: event='broken_reference_marked', file_id
     → email Andy via sendMail() (this is a real data-integrity event)
5. SHA verification: sample 10 random active files; head().checksum or download + sha256 compare
   → If mismatch: audit_log event='file_sha_mismatch', send email to Andy
```

Quarantine retention: 30-day window before manual review prompt. Hard-delete from quarantine requires explicit Vorstand action via a script, never automatic. (10-year AO §147 retention applies to KNOWN Belege; orphans are by definition not yet tied to any booking and the 30-day window is a recovery buffer, not a retention guarantee.)

## 5. Schema

### 5.1 `drizzle/0013_files_table.sql` (ships in PR1)

Updates from v1: `gen_random_uuid()` not uuidv7, `bigint byte_size`, enums for `kind`+`source_kind`, `entity_kind` extension, full CHECK constraints, all FKs with ON DELETE RESTRICT, partial indices on every `*_file_id` column, `year_of_buchung` generated column, trigger extension.

```sql
-- Add 'file' to entity_kind so audit_log can reference files
ALTER TYPE entity_kind ADD VALUE IF NOT EXISTS 'file';

-- New enum for file kinds
CREATE TYPE file_kind AS ENUM ('beleg', 'rechnung', 'bescheinigung', 'export');

CREATE TABLE files (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key                 text          NOT NULL,
  storage_backend             text          NOT NULL CHECK (storage_backend IN ('blob','local-fs')),
  mime_type                   text          NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif')),
  byte_size                   bigint        NOT NULL CHECK (byte_size > 0 AND byte_size <= 5497558138880),  -- 5TB hard cap matches Vercel Blob
  sha256                      text          NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  original_filename           text          NOT NULL CHECK (char_length(original_filename) <= 255),
  kind                        file_kind     NOT NULL,
  thumbnail_storage_key       text,                                          -- nullable: only image/PDF kinds get thumbnails
  uploaded_at                 timestamptz   NOT NULL DEFAULT now(),
  uploaded_by_user_id         uuid          NULL REFERENCES users(id) ON DELETE RESTRICT,
  uploaded_by_submitter_email text          NULL,
  deleted_at                  timestamptz   NULL,
  delete_reason               text          NULL CHECK (delete_reason IN ('user_request','blob_missing','superseded','test_cleanup','vorstand_purge')),
  source_kind                 source_kind   NOT NULL,                        -- existing enum, no default → must be set explicitly
  year_of_buchung             integer GENERATED ALWAYS AS (year_for_booking(uploaded_at)) STORED,
  CONSTRAINT files_uploaded_by_one_of CHECK (
    (uploaded_by_user_id IS NOT NULL AND uploaded_by_submitter_email IS NULL)
    OR (uploaded_by_user_id IS NULL AND uploaded_by_submitter_email IS NOT NULL)
  ),
  CONSTRAINT files_deleted_reason_paired CHECK (
    (deleted_at IS NULL AND delete_reason IS NULL)
    OR (deleted_at IS NOT NULL AND delete_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_files_storage_key   ON files (storage_key);                                   -- two files can never point at one blob
CREATE UNIQUE INDEX idx_files_sha256_active ON files (sha256) WHERE deleted_at IS NULL;               -- dedup
CREATE INDEX        idx_files_uploaded_at   ON files (uploaded_at);
CREATE INDEX        idx_files_year          ON files (year_of_buchung);
CREATE INDEX        idx_files_kind_year     ON files (kind, year_of_buchung);

-- FK columns on every booking-bearing table — ON DELETE RESTRICT so files outlive references
ALTER TABLE expenses              ADD COLUMN beleg_file_id          uuid NULL REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE income                ADD COLUMN beleg_file_id          uuid NULL REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE donations             ADD COLUMN beleg_file_id          uuid NULL REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE donations             ADD COLUMN bescheinigung_file_id  uuid NULL REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE auslagen_submissions  ADD COLUMN beleg_file_id          uuid NULL REFERENCES files(id) ON DELETE RESTRICT;
ALTER TABLE rechnungen            ADD COLUMN pdf_file_id            uuid NULL REFERENCES files(id) ON DELETE RESTRICT;

CREATE INDEX expenses_beleg_file_id_idx              ON expenses(beleg_file_id)              WHERE beleg_file_id IS NOT NULL;
CREATE INDEX income_beleg_file_id_idx                ON income(beleg_file_id)                WHERE beleg_file_id IS NOT NULL;
CREATE INDEX donations_beleg_file_id_idx             ON donations(beleg_file_id)             WHERE beleg_file_id IS NOT NULL;
CREATE INDEX donations_bescheinigung_file_id_idx     ON donations(bescheinigung_file_id)     WHERE bescheinigung_file_id IS NOT NULL;
CREATE INDEX auslagen_submissions_beleg_file_id_idx  ON auslagen_submissions(beleg_file_id)  WHERE beleg_file_id IS NOT NULL;
CREATE INDEX rechnungen_pdf_file_id_idx              ON rechnungen(pdf_file_id)              WHERE pdf_file_id IS NOT NULL;

-- Extend Phase-7.5 Festschreibung trigger to cover `files`
CREATE TRIGGER assert_not_festgeschrieben_trg
  BEFORE UPDATE OR DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION public.assert_not_festgeschrieben_fn();
```

### 5.2 `drizzle/0014_drop_drive_columns.sql` (separate follow-up PR, one week later)

Drops the now-dead `*_drive_file_id` columns from expenses, income, donations, auslagen_submissions, rechnungen. Same content as v1.

## 6. Upload pipeline

### 6.1 Client-side compression

Lives in `src/lib/client/file-compress.ts`, lazy-imported from upload routes only.

- **Images** (jpg/png/heic/webp/heif): `browser-image-compression`. Max 1.5MB, max 2400px on the longer side, output JPEG quality 0.85, web worker. HEIC: Safari 17+ auto-transcodes via `<input type=file>`; Android raw HEIC uses `heic2any` lazy polyfill (single 3MB wasm download cached after first upload). If `heic2any` fails (e.g. network), the original HEIC file is uploaded — the server-side allowlist now includes `image/heic` + `image/heif` so this succeeds.
- **PDFs > 1.5MB with text-poor first page** (`pdfjs.getTextContent()` returns < 400 chars): rasterize each page on `OffscreenCanvas` at 150 DPI, re-embed as JPEG quality 0.7 via `pdf-lib`. Page-by-page cleanup (`page.cleanup()`, `doc.destroy()`) to avoid iOS Safari OOM.
- **PDFs ≤ 1.5MB OR text-rich first page**: pass through unchanged.
- **Progress UI**: a `<progress aria-live="polite">` element shows "Komprimiere Beleg — Seite {n} von {total}". Spinner has `role="status"`. `beforeunload` handler warns "Komprimierung läuft. Wirklich abbrechen?".
- **Failure**: any thrown error in compression → log to console, upload original file unchanged.
- **Form state retention**: the compressed `File` object is held in `sessionStorage` (base64-encoded) until the server returns 2xx. On HTTP failure, the form re-uses the cached compressed file; no re-compression on retry.

### 6.2 Server action (`/auslage-einreichen/+page.server.ts`) — corrected pipeline

```
1. Zod-validate form
2. Bytes ← await request.formData() → file
3. Magic-byte MIME sniff via `file-type` npm package
   → if claimed MIME differs from sniffed → reject "Datei-Typ stimmt nicht mit Inhalt überein"
4. Server-side allowlist: application/pdf, image/jpeg, image/png, image/webp, image/heic, image/heif
5. Size cap: compressed file ≤ 4.5MB (Vercel function body limit)
   → if larger → reject with friendly German error + retry guidance + help URL
6. sha256 = await crypto.subtle.digest('SHA-256', bytes)
7. fileId = randomUUIDv4()
8. ext = mimeToExt(sniffedMime)
9. pathname = `belege/${year_for_booking(now())}/${fileId}.${ext}`

# Phase A — UPLOAD FIRST (no DB lock held during network call)
10. storage.upload({ buffer: bytes, mimeType: sniffedMime, pathname })
    → on throw → return friendly error to user, NO DB writes happened, no orphan
11. Generate thumbnail (image: sharp resize 200x200 webp; PDF: pdfjs page 1 → 200x200 webp)
12. thumbPathname = `belege/${year}/${fileId}.thumb.webp`
13. storage.upload({ buffer: thumbBytes, mimeType: 'image/webp', pathname: thumbPathname })
    → on throw → log warning but proceed (thumbnail is optional)

# Phase B — SHORT DB TX
14. BEGIN TX
    a. SELECT id FROM files WHERE sha256 = $1 AND deleted_at IS NULL  → existingFileId
       if existingFileId:
         → blob upload at step 10 succeeded under a unique pathname; this is a duplicate. Skip the rest of TX.
         → Schedule out-of-TX cleanup: storage.delete-direct(pathname, thumbPathname) (private helper, the one Blob.del() invocation outside archive)
         → use existingFileId for FK
    b. else:
         INSERT files (id=fileId, storage_key=pathname, thumbnail_storage_key=thumbPathname, mime_type, byte_size, sha256, original_filename, kind='beleg', source_kind='form', uploaded_by_submitter_email)
         use fileId for FK
    c. INSERT auslagen_submissions (beleg_file_id = existingFileId or fileId, ...)
    d. INSERT audit_log (event='file_uploaded' or 'file_deduped', entity_kind='file', entity_id=file_id, actor)
    COMMIT
    → on any rollback after step 10: blob exists at pathname; orphan reconciliation will catch it within 24h
15. Event-bus emit (mail dispatch to Andy)
16. Return success
```

The "blob first, then DB" inversion is the key fix vs. v1. The blob upload is the only network operation; the DB transaction is local and fast. If the DB TX fails for any reason, the orphan blob is caught by the nightly reconciliation. If the blob upload fails, no DB state changed.

The sha256-dedup case still hits a blob upload first — wasteful but correct, and the duplicate is cleaned up out-of-TX. This is the single allowed Blob.del() outside the archive method.

**Unique violation on (sha256) WHERE deleted_at IS NULL**: under concurrent identical uploads, one wins the INSERT, the other's INSERT fails with `unique_violation`. Catch this specifically in the TX, re-SELECT to find the existing fileId, complete the FK insertion against the existing row, and schedule cleanup of the second client's orphan blob.

### 6.3 App-generated PDFs (`domain/invoices.ts`, donation Bescheinigungen)

```
bytes = await pdfLibRender(...)
fileId = randomUUIDv4()
pathname = `<kind>/${entity.year_of_buchung}/${entity.business_id || fileId}.pdf`

# Same size cap as user uploads
if (bytes.byteLength > 4.5 * 1024 * 1024)
  throw new Error("Generated PDF exceeds 4.5MB function body limit")

storage.upload({ buffer: bytes, mimeType: 'application/pdf', pathname })
(thumbnail generation as above)

BEGIN TX
  INSERT files (id=fileId, storage_key=pathname, kind='rechnung'|'bescheinigung', source_kind='app', uploaded_by_user_id=actor, ...)
  UPDATE <entity> SET <kind>_file_id = fileId
  audit_log
COMMIT
```

**Bescheinigungs-PDFs: bit-for-bit preservation invariant**. The Spendenbescheinigung sent to the donor in 2026-Q1 is legally binding under §50(5) EStDV for 10 years. When the template changes (e.g. Vorstandsbeschluss updates the closing paragraph in 2027), regenerating creates a **NEW** file row (`source_kind='app'`, new fileId, new pathname), and the OLD file row is left untouched (not soft-deleted, still referenced if a donor ever queries). The `donations.bescheinigung_file_id` FK does NOT update on template change — it points at the file that was actually issued. Template-driven re-issue requires explicit Vorstand action with audit trail; never silent.

## 7. Read, preview, browse, export

### 7.1 `/api/files/[id]/blob` proxy route (auth-checked)

```ts
export const GET: RequestHandler = async ({ params, locals }) => {
  const fileId = z.string().uuid().parse(params.id);
  await requireAuthenticated(locals);
  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) });
  if (!file) {
    audit_log({ event: 'file_read_denied', file_id: fileId, actor: locals.user.id, reason: 'not_found' });
    return new Response('Not found', { status: 404 });
  }
  if (file.deleted_at) {
    audit_log({ event: 'file_read_denied', file_id: fileId, actor: locals.user.id, reason: 'soft_deleted' });
    return new Response('Gone', { status: 410 });
  }
  const authResult = await authorizeFileAccess(locals.user, file);
  if (!authResult.allowed) {
    audit_log({ event: 'file_read_denied', file_id: fileId, actor: locals.user.id, reason: authResult.reason });
    return new Response('Forbidden', { status: 403 });
  }
  const storage = await getFileStorage(file.storage_backend);
  const bytes = await storage.download(file.storage_key);
  audit_log({ event: 'file_read', file_id: fileId, actor: locals.user.id });
  return new Response(bytes, {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Disposition': formatContentDisposition('inline', file.original_filename),  // RFC 5987 encoded
      'Cache-Control': 'private, no-store',  // never cache (was max-age=300 in v1 — corrected)
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",  // sandbox PDF iframes
    },
  });
};
```

**`authorizeFileAccess(user, file)` truth table** (lives in `src/lib/server/files/authorize.ts`):

| Scenario | Vorstand | Magic-link submitter (matches `uploaded_by_submitter_email`) | Vereinsmitglied (matches `uploaded_by_user_id`) | Other authenticated user |
|---|---|---|---|---|
| File with owner entity (e.g. expense), not deleted | allow | allow if also owns the OWNING entity (e.g. their auslagen_submission) | allow if owner of OWNING entity | deny |
| File with multiple owner entities (sha256 dedup) | allow | allow if ANY of the owners' entities is theirs | allow if ANY of the owners' entities is theirs | deny |
| Orphan file (no owner FK) | allow | deny | deny | deny |
| File with soft-deleted OWNER entity but file itself active | allow | allow if was original submitter | allow if was original uploader | deny |
| File belongs to Storno chain — original at archived/, Storno-correction at current | allow both | allow if submitted | allow if uploaded | deny |
| Magic-link session valid but email no longer in users table | allow ONLY if Vorstand | deny (session no longer represents a Mitglied) | deny | deny |

The `authorizeFileAccess` function returns `{ allowed: boolean; reason: string }` so the denial reason is auditable.

**`formatContentDisposition(disposition, originalFilename)`** uses RFC 5987 (`filename*=UTF-8''...`) with a fallback `filename="..."` for older clients. `original_filename` is regex-validated at UPLOAD time (`/^[\w\s\-.()äöüÄÖÜß!&,@+_]{1,255}$/u`) so header injection at READ time is impossible.

`Content-Security-Policy: sandbox; default-src 'none'` blocks PDF.js from running JavaScript, navigating the parent frame, or making external network requests when rendered in an iframe.

### 7.2 Preview component (rewritten)

```svelte
<!-- src/lib/components/files/FilePreview.svelte -->
<script>
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  let { fileId, mimeType, originalFilename } = $props();
  const src = `/api/files/${fileId}/blob`;

  // PDF.js fallback on iOS Safari, which doesn't reliably render PDFs in iframes
  let usePdfJs = $state(false);
  onMount(() => {
    if (mimeType === 'application/pdf') {
      const ua = navigator.userAgent;
      const isIosSafari = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
      usePdfJs = isIosSafari;
    }
  });
</script>

{#if mimeType === 'application/pdf'}
  {#if usePdfJs}
    {#await import('$lib/components/files/PdfJsViewer.svelte') then mod}
      <mod.default {src} title={originalFilename} />
    {/await}
  {:else}
    <iframe {src} title={originalFilename} class="h-[80vh] w-full rounded border" />
  {/if}
{:else if mimeType.startsWith('image/')}
  <img {src} alt={originalFilename} class="max-h-[80vh] w-auto rounded border" />
{:else}
  <a href={src} download>{originalFilename} herunterladen</a>
{/if}
```

### 7.3 `/app/files` browse view

Vorstand-only. Server load fetches files + owner labels via the LEFT JOIN query.

Thumbnails use the new `/api/files/[id]/thumbnail` route (NOT `/blob` — the 200x200 webp is 5-20KB vs. 1.5MB for the full file). Lazy-loaded with `<img loading="lazy">`. No audit log on thumbnail reads (read-only, low-cost).

URL params: filters serialize to `?year=2026&kind=beleg&sphere=ideeller&owner=expense`. Filter changes update history via `goto(..., { replaceState: false, keepFocus: true })` so the page is shareable + back-button-friendly.

Empty state when no files: "Noch keine Dateien hochgeladen. Belege erscheinen hier, sobald sie eingereicht werden."

First-visit help banner explains: "Files-Ansicht zeigt alle Belege & PDFs quer durch Buchungseinträge."

sha256-prefix search is hidden behind an "Erweiterte Suche" disclosure (not in the default toolbar).

Per-row actions:
- **Open owning entity** — links to expense / income / donation detail
- **Vorschau** — opens FilePreview in a modal
- **Herunterladen** — `<a download>` using the export-style filename
- **Löschen** (Vorstand only, not for archived years) — confirm dialog, then sets `deleted_at` + `delete_reason='vorstand_purge'`

### 7.4 Extend `/app/jahresabschluss/[year]/bundle.zip` with Beleg files

The Steuerberater bundle already exists from c1 (`src/lib/server/export/bundle.ts`) and ships these entries via JSZip:

```
01_EÜR-{year}.pdf
02_Anlage-Gem-{year}.csv
03_Spendenliste-{year}.csv
04_Beleg-Index-{year}.csv          ← existing; uses Drive URLs — update to file_id refs
05_GoBD-Z3-{year}/                 ← gobd_z3_{year}.xml + README.md
06_Bescheinigungen-{year}/         ← per-donation PDFs
07_Audit-Log-{year}.csv
08_Mitgliedsbeiträge-{year}.csv
```

Phase 9 adds **one** new top-level entry: `09_Belege-{year}/` containing the actual Beleg PDFs/images in a sphere-aware structure. The existing `04_Beleg-Index-{year}.csv` becomes the manifest that ties business_id → local bundle path.

```
09_Belege-{year}/
├── ausgaben/
│   ├── ideeller/
│   │   └── A-2026-0001-Büromaterial-Müller-AG.pdf
│   ├── vermoegen/
│   ├── zweckbetrieb/
│   └── wirtschaftlich/
├── einnahmen/
│   ├── ideeller/
│   └── …
├── spenden/
│   ├── D-2026-0001.pdf            # business_id only, no donor name
│   └── …
└── rechnungen/                     # (06 already covers Bescheinigungen)
    └── R-2026-0001.pdf
```

Donor PII protection: `D-` filenames use ONLY business_id, never Spendername. The business_id → name mapping lives in the existing `03_Spendenliste-{year}.csv` (which already carries names — Steuerberater needs them).

`exportFilename(file, owner)` slugifies German-language `bezeichnung` (umlauts → ue, ß → ss; max 40 chars). For donations the slug is omitted.

**Two implementation updates required**:

1. `src/lib/server/export/beleg-index.ts` (existing) — change the `drive_url` column to `bundle_path` referencing the local in-bundle path under `09_Belege-{year}/...` so the CSV is self-contained.
2. `src/lib/server/export/bundle.ts` (existing) — accept a new optional `belegAttachments?: BelegAttachment[]` input parallel to `bescheinigungPdfs`; the bundle.zip route's `+server.ts` fetches Beleg bytes from `getFileStorage().download(file.storage_key)` for each file referenced by the year's expenses/income/donations/rechnungen, and passes them to `buildJahresabschlussBundle()`.

**Streaming consideration**: c1's bundle uses `JSZip` in-memory. For our 10-year horizon (max ~5GB lifetime, ~500MB per year at upper bound), in-memory is acceptable. If a single year ever crosses ~500MB, the plan includes a switch to streaming `archiver` as a follow-up; not required for Phase 9 ship.

Idempotency: bundle.zip route from c1 already handles per-request — no change.

Soft-deleted Belege are excluded from the bundle. Archived Belege (post-Festschreibung, at `archived/`) are included normally — they live at `archived/belege/<year>/<id>.ext`, the bundle reads via `storage.download()` which works on any pathname.

The same export filename logic is reused by the single-file download route `/app/files/[id]/download`.

## 8. Drive auth refactor (parallel cleanup)

Same as v1 — OAuth-as-Andy → existing service account `fdw-automation@folge-der-wolke.iam.gserviceaccount.com` for Sheets reads only. `src/lib/server/drive/client.ts` (file ops) deleted; `src/lib/server/drive/sheets-client.ts` introduced for the read path.

### 8.1 env.ts changes

Remove: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`.

Add:
- `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` — validated as JSON with `client_email` + `private_key`. Parsed inside `env.ts`; the exported `env` object exposes only `{ clientEmail, getKeyForGoogleAuth() }`. Raw value marked non-enumerable so `JSON.stringify(env)` cannot leak.
- `FINANCE_SHEET_ID` — for `/healthz` Sheets check and sheet-reader.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob store token (Production only; Preview env points at `BLOB_READ_WRITE_TOKEN_CI`).
- `STORAGE_BACKEND` — `'blob' | 'local-fs'`.

### 8.2 `/healthz` Drive check

`sheets.spreadsheets.get({ spreadsheetId: env.FINANCE_SHEET_ID, fields: 'spreadsheetId' })` — head-only, no PII returned, no audit_log write. Result body: `{ db: 'ok'|'fail', sheets: 'ok'|'fail', blob: 'ok'|'fail' }` — nothing else. 30-second in-process cache (`globalThis.__healthzCache`).

Blob check: `blob.head('healthz-probe.txt')` (a known-existing 0-byte file pre-seeded in the store). No audit_log.

## 9. Backup script (built but parked)

`scripts/backup-files.ts` — same as v1.

**Backup-RESTORE round-trip** in CI smoke is added in Phase 9: a CI job runs `backup → wipe ephemeral test store → restore from backup → SHA-verify every blob` against a 10-file fixture. This proves the backup is actually restorable, not just that the script doesn't crash.

**Explicit acknowledgment in this spec**: Until the backup is activated, a Vercel account compromise or store-deletion event results in total file loss (the `files` table in Neon survives but its `storage_key` values point at gone blobs). This risk is accepted at Phase 9 ship time. Activation procedure is documented in RUNBOOK.md §6.4 (added by this PR — see §11.5 below).

## 10. Testing strategy

The no-data-loss guarantee depends on this section. Acceptance gate: every item below passes before PR merges.

### 10.1 Test layers

| Layer | Tool | Coverage |
|---|---|---|
| Unit | Vitest | Pure helpers, schemas, key/filename builders, `formatContentDisposition`, `authorizeFileAccess` truth table |
| Storage conformance | Vitest, parameterized | `FileStorage` interface contract vs. all impls |
| Integration | Vitest + Postgres | DB + storage transactional behavior with `ChaosFileStorage` failure injection |
| E2E | Playwright | Full user flows |
| Property-based | `fast-check` | Path safety, authorization invariants |
| Backup verification | CI smoke | Backup → restore round-trip with SHA verify on every blob |
| Real-Blob integration | Gated CI (main only) | Conformance suite + 5-file smoke vs. live test Blob store |
| Post-deploy smoke | GitHub workflow | After `migrate.yml` succeeds, curls `/healthz` + exercises a seed file via authenticated session |

### 10.2 Storage conformance suite (≥ 35 invariants)

`src/lib/server/files/storage.conformance.test.ts` exports `runConformanceSuite(makeStorage)`. Invoked from `local-fs-impl.test.ts`, `in-memory-mock-impl.test.ts`, `vercel-blob-impl.test.ts` (gated on token).

Covers (non-exhaustive):
- Round-trip SHA-256 preserved for every supported MIME (pdf, jpeg, png, webp, heic, heif)
- 1-byte file round-trip
- 4.5MB-exactly file round-trip
- 4.5MB+1 byte rejected with `StorageInvalidError`
- Empty buffer rejected
- Unicode in original_filename (umlauts, emoji) survives slugify in export
- `upload(pathname)` twice with same content → second throws `StorageDuplicateError`
- Traversal sequences (`..`, `\0`, URL-encoded) → throws `StorageInvalidError` before backend call
- Pathname starting with `archived/` from public upload → throws `StorageImmutabilityError`
- Pathname starting with `quarantine/` or `tmp/` from public upload → throws `StorageImmutabilityError`
- `download(nonexistent)` → throws `StorageNotFoundError`
- `archive(pathname, year)`: file at new path with matching SHA, original gone
- `archive(archived/pathname)` → throws (can't re-archive)
- `archive` mid-flight crash: re-run is idempotent at every documented phase boundary
- `archive` head-verify catches SHA mismatch
- `downloadStream`: round-trip via stream produces identical bytes

### 10.3 `ChaosFileStorage` failure injection

Wrapper modes:
- `failNextUpload(n)`, `failNextDownload(n)`, `failNextArchive(n)` — fail next N calls
- `failAfterBytes(n)` — succeed for first n bytes, then fail (simulates network drop mid-stream)
- `delay(ms)` — slow operations (test timeout scenarios)
- `corruptBytes()` — succeed but return wrong bytes (SHA mismatch on read)
- `returnWrongViewUrl()` — return URL for a different file
- `failEveryN(n)` — intermittent failures

Integration tests verify:
- Upload fails → no `files` row, no `auslagen_submissions` row, no blob, no audit entry
- Upload succeeds → DB commit fails → orphan exists, reconciliation quarantines within 24h
- Archive copy fails → original intact, no broken refs
- Archive del fails → idempotent re-run completes
- Mid-stream drop → upload rejected as failure (caught via SHA verify after upload completes)
- Corrupt bytes → reconciliation SHA verify catches it, audit_log + Andy email

### 10.4 Orphan reconciliation tests

- 5 files in DB, 7 blobs in store (2 orphans aged > 48h) → quarantines 2
- 5 rows, 3 blobs (2 broken refs) → marks 2 rows `deleted_at` + sends Andy email
- Fixture with 10 valid pairs → no-op
- SHA mismatch on one file → alert, no auto-repair, audit_log
- Concurrent upload during reconciliation: 3 new files committed mid-job, age threshold (48h) prevents false-positive quarantine

### 10.5 Festschreibung tests

- Upload to year 2024 with `festgeschrieben_bis=2024` → L2 throws
- Direct `storage.upload({pathname: 'archived/belege/2024/x.pdf'})` from public method → L1 throws
- Direct `UPDATE files SET storage_key='archived/belege/2024/x' WHERE year_of_buchung=2024` → L3 trigger rejects
- Year-close: 100 files in 2025, advance to 2025 → all archived, SHAs verified, audit log 100 entries
- Archive job crash between copy and del → idempotent re-run
- Archive job crash between del and UPDATE → idempotent re-run
- Concurrent read during archive → no 404
- Cross-year Storno: original at `archived/belege/2024/x.pdf` immutable; correction at `belege/2026/y.pdf` writable
- Year-boundary: file uploaded at 2025-12-31T23:30:00Z (00:30 Berlin time on Jan 1) → year_for_booking = 2026, archive job for 2025 correctly skips it

### 10.6 E2E happy + sad paths (Playwright, `@phase-9` tag)

Happy:
- E1: Submit Auslage with PDF + image → inbox → categorize → preview iframe loads → download → SHA matches
- E2: Regenerate Rechnungs-PDF → new files row → old soft-deleted with delete_reason='superseded' → preview shows new
- E3: Browse `/app/files`, filter by year+kind+sphere, sha256 search, preview each
- E4: Export 2025 ZIP → unzip → `00-INDEX.csv` matches DB → each PDF SHA matches → sphere subfolders present → `00-EUER-2025.pdf` present
- E5: Close year 2025 → files moved to archived/, reading still works, upload to 2025 fails
- E6: Bescheinigungs-PDF template change in 2027 does not modify the 2026 issued PDFs (new file_id created)

Sad:
- S1: Upload pre-compression >25MB → friendly German error, retry preserves form state
- S2: Upload that compresses to >4.5MB → reject with retry guidance, form state preserved
- S3: Corrupt PDF (bad header) → compression fallback uploads original, preview shows "Download to view"
- S4: Browser crashes mid-upload → no row, no blob (or orphan caught in 24h)
- S5: Server killed mid-action → DB rollback, no orphan if upload was the first step (because blob came first), or orphan caught
- S6: Unauthorized `/app/files` → 403
- S7: Preview soft-deleted file → 410 Gone
- S8: Vorstand attempts soft-delete of archived-year file → friendly German error ("Jahr ist festgeschrieben")
- S9: Two clicks on Export → second returns 429 with Retry-After
- S10: Submit form on iOS Safari → preview renders via PDF.js fallback (not native iframe)
- S11: HEIC upload on Android with `heic2any` polyfill failing → original HEIC uploaded successfully (server accepts heic/heif)
- S12: Double-submit form (rapid clicks) → exactly one row via sha256 dedup

### 10.7 Concurrency tests

- Two clients upload same sha256 in parallel → exactly one files row, two `auslagen_submissions` rows pointing at it, one blob, second client's tentative blob cleaned up out-of-TX
- 50 parallel reads on same file → all succeed, 50 audit_log entries
- Upload during year-close → goes to open year via L2 guard or rejected with FestschreibungError
- Archive + read concurrent → no 404
- Concurrent export downloads of same year → second 429s

### 10.8 Authorization tests (property-based + manual)

- Property: user without authz never gets file bytes (403 + audit `file_read_denied`)
- Property: every successful read has corresponding `file_read` audit entry within 100ms
- Manual: path traversal → Zod UUID validation blocks
- Manual: `BLOB_READ_WRITE_TOKEN` never in build output, never in stack traces (error-redaction wrapper test)
- Manual: CSRF on cross-origin POST to `/auslage-einreichen` → SvelteKit rejects
- Manual: `Cache-Control: private, no-store` verified
- Manual: `Content-Security-Policy: sandbox` verified on PDF responses
- Manual: env stringification (`JSON.stringify(env)`) does not include `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` raw value

### 10.9 Real-Blob integration (gated, post-merge)

Same as v1 — runs only on push to `main`, uses `folgederwolke-ci-test` store. Pre-step `pnpm tsx scripts/blob-test-cleanup.ts` to keep the store clean (idempotent).

### 10.10 Acceptance gates (PR merge blockers)

- [ ] Conformance tests ≥ 35 invariants pass against local-fs + in-memory-mock
- [ ] Integration tests pass with `ChaosFileStorage` (all failure modes)
- [ ] E2E tests pass (happy + 12 sad paths)
- [ ] Authorization property-based + manual tests pass
- [ ] Concurrency tests pass
- [ ] Backup-RESTORE round-trip smoke passes in CI
- [ ] Real-Blob integration test passes on main (post-merge gate)
- [ ] Post-deploy smoke workflow runs and goes green on the deploy
- [ ] `/healthz` reports `{db, sheets, blob}` each independently
- [ ] CI build-output scan: no `vercel_blob_rw_` token strings, no `client_email`-shaped strings
- [ ] Manual data-loss-checklist signed (file `docs/reviews/phase-9-data-loss-checklist.md`, reviewer = Andy)

## 11. Cutover

### 11.1 Pre-merge (Andy's responsibility)

1. Provision Vercel Blob store
   - Dashboard → Storage → Create Blob Store
   - Region: `fra1`
   - Access: private
   - Store name: `folgederwolke-prod`
2. Provision second Blob store for CI + Preview
   - Same dashboard → Create → name `folgederwolke-ci-test`
3. Set Vercel env vars:
   - **Production**: `BLOB_READ_WRITE_TOKEN` (prod store), `STORAGE_BACKEND=blob`, `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (paste from `~/secrets/folgederwolke-service-account.json`), `FINANCE_SHEET_ID`
   - **Preview**: `BLOB_READ_WRITE_TOKEN` (CI-test store — different value!), `STORAGE_BACKEND=blob`, same SA JSON, same sheet ID. **Critical: Preview env must NOT inherit the Production token.**
4. Remove obsolete env vars (Production + Preview): `GOOGLE_OAUTH_*`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`
5. Confirm `vercel env ls` shows the expected layout for both environments
6. Run `pnpm dev:reset` locally (picks up new schema)

### 11.2 Merge → migrate → deploy → smoke

1. PR merges to `main` after CI green
2. `migrate.yml` runs 0013 against Neon (additive — safe to retry if it fails)
3. Vercel auto-deploys new build
4. **`post-deploy-smoke.yml` runs automatically** after `migrate.yml` success:
   - Curl `/healthz` until 200 (max 60s)
   - Exercise a seed file (upload via authenticated test session, download, SHA-check, delete)
   - On failure: block subsequent deploys until cleared
5. Andy verifies `/healthz` reports all green
6. Andy submits a test Beleg via `/auslage-einreichen` → confirms inbox + preview + browse view

### 11.3 PR2 (one week later)

Ships `drizzle/0014_drop_drive_columns.sql`. Zero code changes (references removed in PR1).

### 11.4 Rollback table

Same as v1, with one addition: post-deploy-smoke failure → block further auto-deploys via the workflow gate, Andy notified.

### 11.5 CLAUDE.md update (literal new text for §4.1.1 #5)

```
### 5. FileStorage interface — not Blob/Drive client directly (Phase 9)

Callers upload/download/archive files via `getFileStorage()` from
`src/lib/server/files/storage.ts` (`FileStorage` interface). Never import
`vercel-blob-impl.ts` or `local-fs-impl.ts` directly. Never import `@vercel/blob`
outside the impl file (enforced by ESLint rule
`@folgederwolke/no-direct-blob-import`).

`viewUrl(fileId)` and `thumbnailUrl(fileId)` live in
`src/lib/server/files/view-url.ts` (NOT on the FileStorage interface — they
need DB lookup to resolve fileId → storage_key).

The active implementation is selected by the `STORAGE_BACKEND` env var:
- `blob` (default, prod) → Vercel Blob private store in `fra1`
- `local-fs` (dev + test) → `LocalFsFileStorage` writing to `FILE_STORAGE_ROOT`

Soft-delete is the only delete mechanism reachable from app code (set
`files.deleted_at`). The only `blob.del()` calls live inside the archive method
(after copy + SHA verify) and inside the dedup-cleanup helper invoked by the
upload pipeline when a sha256 hit makes the just-uploaded blob redundant.
```

RUNBOOK additions (§6.4 — new section "Backup activation procedure"):

```
1. Decide on destination — recommended: Hetzner Storage Box (~€3.20/mo, 1TB,
   EU/DE, SSH/SFTP browsable). Alternative: B2 (~$0.06/GB-mo, EU available).
2. Provision the destination, generate SSH keypair + add public key to it
3. gh secret set BACKUP_DEST --body "sftp://u123@u123.your-storagebox.de:23/files-backup"
4. gh secret set BACKUP_SSH_PRIVATE_KEY --body "$(cat ~/.ssh/storagebox)"
5. Uncomment the `schedule:` block in `.github/workflows/files-backup.yml`
6. First manual run: gh workflow run files-backup.yml
7. Verify destination has expected structure + first file SHA matches
8. Document the rotation cadence (annual) in RUNBOOK §1
```

## 12. ADR-0012 (to be drafted in PR1)

```
ADR-0012: Blob storage — durability, Festschreibung as compensating control, named risks

Context:
- Vercel Blob is the primary file storage backend (Phase 9+)
- Blob has no native object-lock / WORM / versioning / soft-delete
- AO §147 requires 10-year immutable retention of Belege
- Vercel DPA applies to Pro+ only; we ship Phase 9 on Hobby for cost reasons

Decision:
1. Festschreibung immutability is enforced at three layers (storage prefix guard,
   domain-level year check, DB row-level trigger extended to files). The
   combination of `archived/` pathname prefix + `denyWritesToReservedPrefixes`
   + DB trigger is the WORM equivalent. GoBD Tz. 58/61 explicitly accepts
   software-enforced immutability when documented and tested.

2. Soft-delete via files.deleted_at is the only delete path reachable from
   app code. The only blob.del() calls are inside archive (after SHA verify)
   and inside the upload-pipeline dedup-cleanup helper.

3. Nightly orphan reconciliation catches transactional gaps within 24h.

4. Hobby-tier risk acceptance: Phase 9 ships on Vercel Hobby without a signed
   DPA. This is a lateral move from Drive's no-DPA personal-account state.
   Acceptable for current scale (20-person Verein); revisit when DSGVO HIGH
   items close generally. Not in scope: TIA stub, DPIA refresh, Pro upgrade.

5. Backup is built but parked. Vercel account compromise = total file loss
   until activation. Activation cost ~€3.20/mo (Hetzner). Accepted risk.

Consequences:
- ESLint rule prevents direct @vercel/blob imports outside vercel-blob-impl
- Audit log is the source of truth for what was uploaded/archived/deleted
- Off-platform backup activation unblocks the Workspace migration (issue #55)
```

## 13. Deferred work (no new issues opened — see §3 "Explicitly deferred")

These came up in the 7-expert review but are **enterprise-grade overkill for a 20-person Verein**. We are NOT opening GitHub issues for them. They live in this spec as a record. If any becomes a real concern, an issue gets opened at that time.

- TIA / DPIA formal documents
- Full Verfahrensdokumentation chapter rewrites
- Vercel Pro upgrade for DPA
- Sophisticated audit-log signature scheme (ed25519)
- Audit log partitioning at scale
- Mutation testing / 10k+-file perf tests
- Compromised-submitter defense (virus scan, EXIF strip, per-submitter rate-limit)
- Field-level PII classification
- Multi-disaster DR runbooks
- sha256 dedup privacy-oracle hardening
- Cron-skip alerting for nightly jobs
- 7-day AO §200 RTO compliance hardening
- Audit log extract in export ZIP

See also: existing issues — #55 (Workspace for Nonprofits), #37 (env.ts COMMIT_SHA alias).

## 14. Glossary

(Unchanged from v1.)

- **AO §147**: Abgabenordnung §147 — German tax law, 10-year retention of accounting records
- **Beleg**: receipt / documentary evidence for a booking entry
- **business_id**: deterministic per-(year, kind) sequence-derived identifier, e.g. `A-2026-007` (ADR-0010, via `id_counters`)
- **Buchungsjahr**: fiscal year for accounting purposes (Europe/Berlin TZ, per ADR-0001)
- **Festschreibung**: year-close lock making bookings immutable (ADR-0006)
- **GoBD §146 / Tz. 58/61**: Grundsätze ordnungsmäßiger Buchführung — German bookkeeping standards, software-immutability acceptance
- **lfd_nr**: fortlaufende Nummer (the existing `business_id` mechanism — no new sequence in Phase 9)
- **Sphere**: tax sphere (ideeller / vermoegen / zweckbetrieb / wirtschaftlich) per ADR-0002
- **Spendenbescheinigung / Zuwendungsbestätigung**: donation receipt; §50 EStDV makes the Verein liable for 10 years for the exact PDF issued
- **Storno**: correction entry (cancels a previously-booked entry with opposite-signed amount)
- **WORM**: Write-Once-Read-Many (immutable storage)

---

## Changelog

### v2 — 2026-05-20

Incorporated findings from the 7-expert review (storage architect, security, DSGVO, DBA, frontend, QA, Steuerberater, SRE). Scope calibrated to a 20-person Verein per Andy: data secure + great UX + robust impl + nice workflows; enterprise compliance theater out.

**Architecture changes**:
- Upload pipeline inverted: blob first, then short DB TX (eliminates orphan window on lost-ACK)
- Archive method made fully private inside impl (no flag-based bypass)
- Archive job recovery semantics explicit per-phase
- `denyWritesToArchivedPrefix` → `denyWritesToReservedPrefixes` covering `archived/`, `quarantine/`, `tmp/`
- `viewUrl` moved off interface to domain helper (needs DB)
- `authorizeFileAccess` truth table fully specified
- Error-redaction wrapper around all SDK calls
- File-row Festschreibung trigger via `year_of_buchung` generated column

**Schema changes**:
- `gen_random_uuid()` not `uuidv7()` (matches existing convention)
- `bigint byte_size` with 5TB cap
- `file_kind` enum (was text+CHECK); `source_kind` existing enum reused; `entity_kind` extended with `'file'`
- `storage_key` UNIQUE
- `mime_type` CHECK matching allowlist (now includes heic/heif)
- `sha256` hex format CHECK
- `original_filename` length CHECK
- `delete_reason` paired with `deleted_at`
- All FKs `ON DELETE RESTRICT` explicit
- Partial indices on all six `*_file_id` columns
- `thumbnail_storage_key` column added

**Pipeline changes**:
- Magic-byte MIME sniff via `file-type` npm
- Compressed file size cap applies to app-generated PDFs too
- File year derived from owning entity's `year_of_buchung` when possible
- sha256 unique_violation explicitly handled (catch + re-SELECT)
- Form state retention in sessionStorage across HTTP failures
- Bescheinigungs-PDF bit-for-bit preservation invariant

**Read pipeline changes**:
- Cache-Control: private, no-store (was max-age=300)
- CSP sandbox header on PDF proxy responses
- Failed reads create `file_read_denied` audit entries
- RFC 5987 Content-Disposition encoding
- Thumbnail route + column (not full-bytes for thumbs)
- iOS Safari PDF.js fallback

**Browse + Export changes**:
- `/app/files` URL-param filter persistence + empty state + onboarding copy
- Export ZIP: sphere subfolders + `00-EUER-YYYY.pdf` + donor-PII-safe filenames (D-NNNN not D-NNNN-Donor)
- Export idempotency (debounce double-click)

**Drive auth refactor**:
- `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` parsed-on-read, non-enumerable
- `/healthz` returns only `{db, sheets, blob}` — no Nachname, no SHA, 30s cache, no audit_log on blob check

**Tests added**:
- Year-boundary at Berlin midnight
- `failAfterBytes(n)` chaos mode
- Cross-year Storno round-trip
- File-row Festschreibung trigger
- Backup-RESTORE in CI (not just backup)
- Reconciliation false-positive under concurrent upload
- ZIP unicode round-trip
- 12 sad-path E2E scenarios (was 7)
- ≥ 35 conformance invariants (was ~30)

**Ops added**:
- Automated post-deploy smoke workflow
- Preview env separation from prod (explicit token + store)
- Backup-RESTORE smoke proves restorability
- Explicit risk acknowledgment for backup-parked state
- CLAUDE.md §4.1.1 #5 literal new text included
- RUNBOOK §6.4 procedure included

**Out of v2** (deferred without issues): TIA, DPIA, Pro upgrade, signed audit events, audit partitioning, mutation testing, virus scan, EXIF strip, multi-disaster DR runbook, sha256 privacy-oracle, cron-skip alerting, AO §200 RTO hardening, audit extract in export.

### v1 — 2026-05-20

Initial spec drafted from brainstorming session.
