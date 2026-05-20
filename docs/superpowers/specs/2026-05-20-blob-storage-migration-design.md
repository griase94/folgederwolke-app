# Phase 9 — Blob Storage Migration — Design

**Status:** Brainstormed 2026-05-20, awaiting user review before plan.
**Branch:** `phase-9-blob-storage` (worktree off `origin/main` @ 3addcc3)
**Related issues:** #55 (Google Workspace for Nonprofits — deferred), #37 (env.ts COMMIT_SHA alias — separate PR)

---

## 1. Goal

Move all file storage (Belege, Rechnungs-PDFs, Spendenbescheinigungen, future exports) from Google Drive to **Vercel Blob private storage**, with a normalized `files` table as the schema backbone, hardened by client-side compression, three-layer Festschreibung enforcement, and a parked-but-ready backup script. Kill the OAuth-as-Andy auth path; the Google service account stays only for Sheets reads.

The work must satisfy five user-stated criteria, in priority order:

1. **No data loss, ever** — primary acceptance criterion. Every transactional boundary tested with failure injection; orphan reconciliation job catches anything that slips through.
2. **Free at current scale** — Vercel Blob Hobby tier covers our workload (<5GB / decade, ~500 files/year). Pro upgrade and DPA acceptance deferred until DSGVO HIGH items close (documented risk).
3. **No extra user auth for viewing/uploading** — public form remains anonymous (magic-link only); preview goes through the app's existing magic-link session.
4. **In-app previews** — Phase 9 ships `/api/files/[id]/blob` proxy route + `/app/files` browse view + per-entity preview component. No `webViewLink`-style external redirects, no Google login prompts.
5. **Easy compression** — `browser-image-compression` for images, `pdfjs-dist` + `pdf-lib` for scanned PDFs > 1.5MB. Both client-side, web-worker-backed, with graceful fallback to original.

## 2. Background

Phase 1 introduced a `FileStorage` interface in `src/lib/server/files/storage.ts` with two implementations: `drive-impl.ts` (Google Drive via OAuth-as-Andy) and `local-fs-impl.ts` (dev + test). Phase 7.5 hardened Festschreibung at the DB layer (ADR-0006 trigger + tamper-evident audit chain).

Production Drive integration broke during the Phase 7.5 → 8 transition: OAuth refresh-token rot, surfaced as `drive: fail` on `/healthz`. A multi-expert panel (storage architect, frontend, cost+compliance, Drive-defender) evaluated alternatives and converged on Vercel Blob. A follow-up deep-dive panel verified Blob is a CONDITIONAL FIT with three guardrails (soft-delete, app-code Festschreibung, no token in browser) and proved a 30–90 minute exit path to S3/R2/Hetzner.

The legal review (`docs/reviews/2026-05-19-dsgvo-legal-review.md`) flagged personal-Drive storage of PII (Belege contain Spendername, Betrag, IBAN, Anschrift) as not Art. 28 conformant. Phase 9 reduces this finding by moving files off personal Drive entirely; the residual finding (Vercel DPA requires Pro) is documented as a deferred risk pending the broader DSGVO cleanup.

## 3. Scope

### In scope (Phase 9, this PR)

- **Schema**: new `files` table (normalized, with `id`, `storage_key`, `storage_backend`, `mime_type`, `byte_size`, `sha256`, `original_filename`, `kind`, `uploaded_at`, `uploaded_by_user_id`, `uploaded_by_submitter_email`, `deleted_at`, `source_kind`). Foreign-key columns on every booking-bearing table.
- **Interface**: simplified `FileStorage` — `upload({buffer, mimeType, pathname})`, `download(pathname)`, `downloadStream(pathname)`, `archive(pathname, year)`, `viewUrl(pathname)`. No `idempotencyKey`, no `delete()`.
- **Implementations**: new `vercel-blob-impl.ts` (private store, `fra1` region). `local-fs-impl.ts` adapted to new interface. `drive-impl.ts` deleted.
- **Drive client**: file operations (upload/archive/createFolder) removed. Sheets-read path migrated from OAuth-as-Andy to existing service account `fdw-automation@folge-der-wolke.iam.gserviceaccount.com`.
- **Routes**:
  - `/api/files/[id]/blob` — auth-checked proxy route (replaces `/api/dev-files/[id]`)
  - `/app/files` — Vorstand browse view over `files` joined to owning entities
  - `/app/jahresabschluss/[year]/export/files.zip` — streaming ZIP export with category folders + index CSV
- **Upload pipeline**: client-side compression (`browser-image-compression` + `pdfjs-dist`/`pdf-lib`) → SvelteKit server action → transactional `files` insert + blob upload → audit log.
- **Festschreibung**: three-layer enforcement (`denyWritesToArchivedPrefix` in blob impl, route-action `festgeschriebenBis` checks, existing DB trigger). Resumable archive job triggered by year-close.
- **Orphan reconciliation job**: nightly `scripts/files-reconcile.ts`, manual via `pnpm files:reconcile`.
- **Backup**: `scripts/backup-files.ts` + `.github/workflows/files-backup.yml` (workflow_dispatch only). Smoke-tested in CI, not on cron.
- **Tests**: storage conformance suite (parameterized over impls), Vitest integration with `ChaosFileStorage` failure injection, Playwright E2E happy + sad paths, property-based authorization invariants, gated real-Blob CI job.
- **ADR-0012**: Blob durability + Festschreibung-via-app-code as compensating control for no native WORM.
- **Docs**: `README.md` update (env vars), `CLAUDE.md` update (architectural conventions §4.1.1 #5 amended), `RUNBOOK.md` (backup enablement procedure).

### Out of scope (deferred)

- **PR2 (one week later)**: `drizzle/0014_drop_drive_columns.sql` — destructive DROP of `*_drive_file_id` columns. Split per CLAUDE.md pattern for max rollback safety.
- **Issue #55**: Google Workspace for Nonprofits enrollment (parallel future track for sheets DPA + optional backup destination).
- **Issue #37**: `env.ts` `VERCEL_GIT_COMMIT_SHA → COMMIT_SHA` alias (cosmetic, separate small PR).
- **Vercel Pro upgrade + DPA acceptance**: deferred until DSGVO HIGH cleanup; documented as named risk in RUNBOOK.
- **Active backup cron + destination provisioning**: script ships ready; cron enablement is a 30-second config change when the time comes.
- **Migration of legacy Drive files**: confirmed by user — no production Belege to preserve. The existing Drive folder stays completely untouched (no rename, no archive script).
- **Drive folder cleanup**: same as above. Existing Drive folder is abandoned-in-place.
- **Steuerberater handoff workflow**: covered by the ZIP export route; no separate UI in Phase 9.

## 4. Architecture decisions

### 4.1 Normalized `files` table (Option C)

Rejected: per-entity `*_storage_key` columns (denormalized). Reasons:
- Same Beleg may eventually back two expenses (sphere split). Denormalized requires copying the file or copying the key — fragile.
- File lifecycle (uploaded_at, deleted_at, sha256, audit history) belongs on the file, not on each owning entity.
- Browse view over a single `files` table is one SELECT, not a UNION ALL across five tables.
- Future file kinds (exports, tax filings, etc.) attach by adding a column to one table, not by introducing N new column-per-kind variants.

Accepted: `files (id, ...)` first-class entity. Owning entities carry FK columns: `expenses.beleg_file_id`, `donations.beleg_file_id`, `donations.bescheinigung_file_id`, `rechnungen.pdf_file_id`, etc.

### 4.2 Storage key shape

Pathname IS the storage key. Format:

```
<kind>/<year>/<identifier>.<ext>
```

Examples:
- `belege/2026/0190…32.pdf` — id = `files.id` (UUIDv7)
- `rechnungen/2026/R-2026-0007.pdf` — id = `rechnungen.rechnungsnummer` (domain identifier)
- `bescheinigungen/2026/0190…04.pdf` — id = `files.id`
- `archived/belege/2025/0190…aa.pdf` — post-Festschreibung

Year: `year_for_booking(uploaded_at)` per ADR-0001 (Europe/Berlin TZ).

Rationale:
- UUIDv7 IDs sort by time → Vercel dashboard / file listings group naturally
- Domain identifiers (Rechnungsnummer) used where they already exist for human-readability
- `<kind>/<year>/<id>.<ext>` shape works as-is on any S3-compatible store → portable
- Pathname is deterministic from the row, no separate idempotency-key concept needed

### 4.3 `FileStorage` interface (simplified)

```ts
interface FileStorage {
  upload(args: { buffer: Uint8Array; mimeType: string; pathname: string }): Promise<{ viewUrl: string }>;
  download(pathname: string): Promise<Uint8Array>;
  downloadStream(pathname: string): Promise<ReadableStream>;
  archive(pathname: string, year: number): Promise<{ newPathname: string }>;
  viewUrl(pathname: string): Promise<string>;
}
```

Notes:
- **No `delete()`**: soft-delete is via `files.deleted_at`. The only blob-level deletion is `archive()`'s internal `copy + verify + del` cycle, scoped to the archive job.
- **`viewUrl(pathname)` is impl-aware**: for Blob, returns `/api/files/[id]/blob` (the proxy route) — never the raw `*.private.blob.vercel-storage.com` URL. For local-fs, the same shape. This kills the 4 hard-coded `drive.google.com/...` templates in components.
- **`downloadStream` is new**: needed for the ZIP export to avoid loading 5GB into a Vercel function's memory.
- **No `idempotencyKey`**: pathname is deterministic + `allowOverwrite: false` (Blob default) → second upload to same path errors loudly.

### 4.4 `vercel-blob-impl.ts` behavior

- Private store, region `fra1` (Frankfurt, S3-backed in AWS eu-central-1)
- `BLOB_READ_WRITE_TOKEN` lives only in server-side env; runtime assertion prevents leaks
- `denyWritesToArchivedPrefix(pathname)` guard wraps every `put()` and `copy()` (except the internal archive-job pass-through)
- `allowOverwrite: false` on all `put()` calls
- `archive()` = `copy → head verify SHA → del`; verifies destination exists with matching size before deleting source
- Errors mapped to typed error classes: `StorageNotFoundError`, `StorageDuplicateError`, `StorageImmutabilityError`, `StorageNetworkError`

### 4.5 Three-layer Festschreibung enforcement

| Layer | Mechanism | What it blocks |
|---|---|---|
| L1 (storage impl) | `denyWritesToArchivedPrefix` in `vercel-blob-impl` | Any `put()` or `copy()` to a pathname starting with `archived/`, except the archive job's internal pass-through |
| L2 (route action) | `await fetchFestgeschriebenBis()` check + `FestschreibungError` throw | Any user-facing mutation (upload, soft-delete, archive) targeting a year ≤ `festgeschrieben_bis` |
| L3 (DB trigger) | Existing Phase-7.5 row-level trigger | Any `UPDATE` against a row with `festgeschrieben_at IS NOT NULL` |

Defense in depth: a single layer bypass doesn't compromise immutability.

### 4.6 Year-close flow

```
1. User clicks "Jahr YYYY abschließen" in /app/jahresabschluss/[year]/close
2. Pre-flight checklist passes (no orphan files, all categorized, EÜR balances)
3. BEGIN TX:
   - close_buchhaltungsjahr(YYYY, actor) flips festgeschrieben_at on all entity rows
   - settings.festgeschrieben_bis = YYYY
   - audit_log entries
   COMMIT
4. Background job archive_year(YYYY):
   for each file with year_for_booking(uploaded_at) = YYYY and storage_key NOT LIKE 'archived/%':
     storage.archive(file.storage_key, YYYY)
       → copy old→new, head verify SHA, del old
     UPDATE files SET storage_key = newKey
     audit_log: event='file_archived'
```

Archive job is resumable: each file's `storage_key` update is committed individually. Re-running picks up where it crashed.

### 4.7 Soft-delete model

`files.deleted_at` is the only delete mechanism reachable from app code:

- Soft-delete: `UPDATE files SET deleted_at = now() WHERE id = ?` (gated by Festschreibung route check)
- Read path rejects rows with `deleted_at IS NOT NULL` (returns 410 Gone)
- Browse view filters them out by default; Vorstand has a "Papierkorb" tab to view + restore (sets `deleted_at = NULL`)
- Hard-delete (`blob.del()` from app) is **never** called outside the archive job
- A future periodic purge of long-soft-deleted files is out of scope (10-year retention; deletion may never happen for AO §147 purposes)

### 4.8 Orphan reconciliation job

Runs nightly (or `pnpm files:reconcile`):

1. `SELECT storage_key FROM files WHERE deleted_at IS NULL`
2. `blob.list()` paginated through entire store
3. Diff:
   - Blobs not in DB → ORPHAN → move to `quarantine/<original-pathname>`, audit log, weekly digest
   - DB rows missing blobs → BROKEN_REF → mark `deleted_at = now(), delete_reason = 'blob_missing'`, audit log, alert
4. SHA verification: random sample of 10 files, verify `head().size` matches `files.byte_size`, full SHA on a subset

This is the safety net. If anything ever slips past the transactional upload, this job catches it within 24h.

## 5. Schema

### 5.1 `drizzle/0013_files_table.sql` (ships in PR1)

```sql
CREATE TABLE files (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  storage_key     text NOT NULL,
  storage_backend text NOT NULL CHECK (storage_backend IN ('blob','local-fs')),
  mime_type       text NOT NULL,
  byte_size       integer NOT NULL CHECK (byte_size > 0),
  sha256          text NOT NULL,
  original_filename text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('beleg','rechnung','bescheinigung','export')),
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by_user_id uuid REFERENCES users(id),
  uploaded_by_submitter_email text,
  deleted_at      timestamptz,
  delete_reason   text,
  source_kind     text NOT NULL DEFAULT 'app' CHECK (source_kind IN ('app','form','sheet_import','fixture')),
  CONSTRAINT files_uploaded_by_one_of CHECK (
    (uploaded_by_user_id IS NOT NULL AND uploaded_by_submitter_email IS NULL)
    OR (uploaded_by_user_id IS NULL AND uploaded_by_submitter_email IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_files_sha256_active ON files (sha256) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_uploaded_at ON files (uploaded_at);
CREATE INDEX idx_files_kind_year ON files (kind, (year_for_booking(uploaded_at)));
CREATE INDEX idx_files_storage_key ON files (storage_key);

-- Foreign keys on owning entities
ALTER TABLE expenses              ADD COLUMN beleg_file_id          uuid REFERENCES files(id);
ALTER TABLE income                ADD COLUMN beleg_file_id          uuid REFERENCES files(id);
ALTER TABLE donations             ADD COLUMN beleg_file_id          uuid REFERENCES files(id);
ALTER TABLE donations             ADD COLUMN bescheinigung_file_id  uuid REFERENCES files(id);
ALTER TABLE auslagen_submissions  ADD COLUMN beleg_file_id          uuid REFERENCES files(id);
ALTER TABLE rechnungen            ADD COLUMN pdf_file_id            uuid REFERENCES files(id);

-- Grants handled by 0012_default_privileges (app_runtime CRUD, app_export SELECT)
```

### 5.2 `drizzle/0014_drop_drive_columns.sql` (separate follow-up PR)

```sql
ALTER TABLE expenses              DROP COLUMN beleg_drive_file_id;
ALTER TABLE income                DROP COLUMN beleg_drive_file_id;
ALTER TABLE donations             DROP COLUMN beleg_drive_file_id;
ALTER TABLE donations             DROP COLUMN bescheinigung_pdf_drive_file_id;
ALTER TABLE auslagen_submissions  DROP COLUMN beleg_drive_file_id;
ALTER TABLE rechnungen            DROP COLUMN pdf_drive_file_id;
```

Shipped one week after PR1 to provide a rollback window. By that point all code references are on the new `*_file_id` columns; the old columns are dead weight.

## 6. Upload pipeline

### 6.1 Client-side compression

In `src/lib/client/file-compress.ts` (lazy-imported only from upload routes):

- **Images** (jpg/png/heic/webp): `browser-image-compression` with `maxSizeMB: 1.5`, `maxWidthOrHeight: 2400`, `useWebWorker: true`, `fileType: 'image/jpeg'`. HEIC auto-transcoded by Safari 17+; `heic2any` lazy polyfill for Android edge cases.
- **PDFs**: only if `file.size > 1.5MB` AND first-page `pdfjs.getTextContent()` returns < 400 chars. Rasterize each page at 150 DPI via `OffscreenCanvas`, re-embed as JPEG quality 0.7 with `pdf-lib`, output new PDF. Page-by-page cleanup (`page.cleanup()`, `doc.destroy()`) to avoid iOS Safari OOM.
- **Always**: try/catch around the entire compression. On any error, return the original file unchanged.
- **Keep whichever is smaller** (compressed vs original) and SHA-check the compressed against the source isn't corrupted (round-trip parse-and-render).

### 6.2 Server action (`/auslage-einreichen/+page.server.ts`)

```
1. zod-validate form
2. server-side size cap: reject if compressed file > 4.5MB (Vercel function body limit)
3. server-side MIME allowlist: application/pdf, image/jpeg, image/png, image/webp
4. compute SHA256 of the bytes
5. BEGIN transaction:
   a. SELECT id FROM files WHERE sha256 = ? AND deleted_at IS NULL
      → if hit, reuse existing file_id (dedup path; no second blob written)
   b. INSERT files (id, storage_key=tmp, mime_type, byte_size, sha256, original_filename, kind, uploaded_by_submitter_email, source_kind='form') RETURNING id
   c. pathname = `belege/${year_for_booking(now())}/${file_id}.${ext}`
   d. storage.upload({buffer, mimeType, pathname})
      → on throw: ROLLBACK, return friendly error
   e. UPDATE files SET storage_key = pathname WHERE id = file_id
   f. INSERT auslagen_submissions (beleg_file_id = file_id, ...)
   g. audit_log: event='file_uploaded', file_id, actor
   COMMIT
6. Event-bus emit (mail dispatch to Andy)
7. Return success
```

Failure semantics:
- (5d) blob.upload throws → ROLLBACK → no `files` row, no `auslagen_submissions` row, no blob → user sees retry-friendly error
- (5e–g) commit fails after blob exists → blob is orphan → reconciliation job quarantines it within 24h
- Compression fails entirely → original uploaded; if original > 25MB hard cap, server-side rejection with friendly German error and re-upload guidance

### 6.3 App-generated PDFs (`domain/invoices.ts` regeneratePdf, donations Bescheinigungen)

Simpler — no compression needed (PDFs are generated server-side at controlled sizes):

```
bytes = await pdfLibRender(...)
fileId = uuidv7()
pathname = `rechnungen/${year}/${rechnungsnummer}.pdf`
storage.upload({buffer: bytes, mimeType: 'application/pdf', pathname})
INSERT files (id=fileId, storage_key=pathname, kind='rechnung', source_kind='app', uploaded_by_user_id=actor, ...)
UPDATE rechnungen SET pdf_file_id = fileId
audit_log
```

## 7. Read, preview, browse, export

### 7.1 `/api/files/[id]/blob` proxy route (the *only* public file path)

```ts
export const GET: RequestHandler = async ({ params, locals }) => {
  const fileId = z.string().uuid().parse(params.id);  // path traversal blocked here
  await requireAuthenticated(locals);
  const file = await db.query.files.findFirst({ where: eq(files.id, fileId) });
  if (!file) return new Response('Not found', { status: 404 });
  if (file.deleted_at) return new Response('Gone', { status: 410 });
  await authorizeFileAccess(locals.user, file);  // owner of Auslage OR Vorstand
  const storage = await getFileStorage(file.storage_backend);
  const bytes = await storage.download(file.storage_key);
  audit_log({ event: 'file_read', file_id: fileId, actor: locals.user.id });
  return new Response(bytes, {
    headers: {
      'Content-Type': file.mime_type,
      'Content-Disposition': `inline; filename="${encodeFilename(file.original_filename)}"`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
```

### 7.2 Preview component (rewritten)

```svelte
<!-- src/lib/components/admin/inbox/BelegPreview.svelte -->
<script>
  let { fileId, mimeType, originalFilename } = $props();
  const src = `/api/files/${fileId}/blob`;
</script>
{#if mimeType === 'application/pdf'}
  <iframe {src} title={originalFilename} class="h-[80vh] w-full rounded border" />
{:else if mimeType.startsWith('image/')}
  <img {src} alt={originalFilename} class="max-h-[80vh] w-auto rounded border" />
{:else}
  <a href={src} download>{originalFilename} herunterladen</a>
{/if}
```

No hard-coded URL templates. Works for any backend. Removes 4 existing `drive.google.com/...` constants from the codebase.

### 7.3 `/app/files` browse view

Vorstand-only. Server load:

```sql
SELECT
  f.*,
  COALESCE(e.id::text, i.id::text, d.id::text, s.id::text, r.id::text) AS owner_id,
  CASE WHEN e.id IS NOT NULL THEN 'expense'
       WHEN i.id IS NOT NULL THEN 'income'
       WHEN d.id IS NOT NULL THEN 'donation'
       WHEN s.id IS NOT NULL THEN 'submission'
       WHEN r.id IS NOT NULL THEN 'rechnung'
       ELSE 'orphan'
  END AS owner_kind,
  COALESCE(e.bezeichnung, i.bezeichnung, d.spendername, s.submitter_email, r.rechnungsnummer) AS owner_label,
  COALESCE(e.sphere, i.sphere, d.sphere) AS sphere
FROM files f
LEFT JOIN expenses              e ON e.beleg_file_id          = f.id
LEFT JOIN income                i ON i.beleg_file_id          = f.id
LEFT JOIN donations             d ON d.beleg_file_id          = f.id OR d.bescheinigung_file_id = f.id
LEFT JOIN auslagen_submissions  s ON s.beleg_file_id          = f.id
LEFT JOIN rechnungen            r ON r.pdf_file_id            = f.id
WHERE f.deleted_at IS NULL
ORDER BY f.uploaded_at DESC
LIMIT 100 OFFSET ?;
```

UI:
- Filters: year, kind, owner kind, sphere
- Search: by original_filename, sha256 prefix, owner label
- Thumbnail: lazy-loaded `<img loading="lazy" src="/api/files/[id]/blob">` for image kinds; static PDF icon for `application/pdf`
- Each row: "Open owning entity" + "Preview file" actions
- Vorstand-only "Papierkorb" tab shows soft-deleted files with Restore action

### 7.4 Export `/app/jahresabschluss/[year]/export/files.zip`

Vorstand-only. Streams ZIP archive built on-the-fly with `archiver` npm (level 0 — no re-deflate of already-compressed PDFs/JPEGs).

Archive structure:

```
folge-der-wolke-belege-2026.zip
├── 00-INDEX.csv                                  # spreadsheet manifest
├── ausgaben/                                     # E-YYYY-NNNN prefix
├── einnahmen/                                    # I-YYYY-NNNN prefix
├── spenden/                                      # D-YYYY-NNNN prefix
├── rechnungen/                                   # Rechnungsnummer
└── bescheinigungen/                              # Z-YYYY-NNNN prefix
```

Filename helper:

```ts
function exportFilename(file, owner) {
  const prefix = {
    expense:       `E-${year}-${owner.lfd_nr.padStart(4,'0')}`,
    income:        `I-${year}-${owner.lfd_nr.padStart(4,'0')}`,
    donation:      `D-${year}-${owner.lfd_nr.padStart(4,'0')}`,
    rechnung:      owner.rechnungsnummer,
    bescheinigung: `Z-${year}-${owner.lfd_nr.padStart(4,'0')}`,
  }[owner.kind];
  const slug = slugify(owner.bezeichnung ?? owner.spendername ?? '', { maxLen: 40 });
  return `${prefix}-${slug}.${mimeToExt(file.mime_type)}`;
}
```

Stream-based; uses `FileStorage.downloadStream` to avoid loading 5GB into memory.

The same export filename logic is reused by a single-file download path `/app/files/[id]/download` so the Steuerberater always gets `E-2026-0001-Büromaterial.pdf`, never `IMG_1234.jpg`.

## 8. Drive auth refactor (parallel cleanup)

Touches only the Sheets-read code path. File ops on Drive are deleted entirely.

### 8.1 `src/lib/server/drive/auth.ts` rewrite

Before: `OAuth2Client` + `refresh_token` (impersonates Andy).

After:

```ts
import { GoogleAuth } from 'google-auth-library';
import { env } from '$lib/server/env.js';

let _auth: GoogleAuth | null = null;

export function getDriveAuth(): GoogleAuth {
  if (_auth) return _auth;
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
  _auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return _auth;
}
```

### 8.2 env.ts changes

Remove: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (the file-path variant is unused).

Add: `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (z.string() that validates as JSON with `client_email` and `private_key` fields). Add: `FINANCE_SHEET_ID` (used by `/healthz` and sheet-reader).

Dev: `.env.development.local` (gitignored) reads from `~/secrets/folgederwolke-service-account.json` via shell expansion. Documented in README.

Prod: Vercel env var, paste the JSON contents directly.

### 8.3 `/healthz` Drive check

Before: `drive.files.list({ pageSize: 1 })` (fails on expired token).

After: `sheets.spreadsheets.values.get({ spreadsheetId: env.FINANCE_SHEET_ID, range: 'Mitglieder!B6:B6' })`. Returns "first member's Nachname" on success. Returns clear error on failure (SA not granted access, missing env, etc.).

`/healthz` reports three subsystems independently: `db`, `sheets`, `blob`. Each can fail without the others reporting fail.

### 8.4 Files deleted in this phase

- `src/lib/server/files/drive-impl.ts`
- `src/lib/server/drive/client.ts` (file CRUD only; the Sheets-read path moves to a new `src/lib/server/drive/sheets-client.ts`)
- All `drive.google.com/file/d/...` URL templates in components:
  - `src/lib/components/admin/inbox/BelegPreview.svelte`
  - `src/lib/server/export/beleg-index.ts` (2 occurrences)
  - `src/routes/app/inbox/[ausId]/+page.server.ts`
  - `src/lib/domain/inbox.ts` (doc comment)

## 9. Backup script (built but parked)

`scripts/backup-files.ts`:

```
1. SELECT storage_key, sha256 FROM files WHERE deleted_at IS NULL ORDER BY uploaded_at
2. For each:
     bytes = await storage.download(storage_key)
     verify SHA256(bytes) === db.sha256 → abort if mismatch
     write to <BACKUP_DEST>/<storage_key>
3. Write <BACKUP_DEST>/manifest.csv with all metadata (id, sha256, byte_size, uploaded_at)
4. --verify mode: download a sample 10 files (or 10%, whichever is greater), SHA-check
5. --dry-run mode: list what would be backed up without writing
```

`.github/workflows/files-backup.yml`:

```yaml
on:
  workflow_dispatch:   # manual only; cron commented out for now
  # schedule: [{cron: '17 3 * * *'}]
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - ...checkout, install...
      - run: pnpm tsx scripts/backup-files.ts --dest "$BACKUP_DEST"
        env:
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
          DIRECT_DATABASE_URL:   ${{ secrets.DIRECT_DATABASE_URL }}
          BACKUP_DEST:           ${{ secrets.BACKUP_DEST }}   # not set yet
```

CI smoke job exercises the script against a fixture every PR, so it's known-working when activation time comes.

Activation procedure (documented in `RUNBOOK.md §X`):
1. Provision Hetzner Storage Box (€3.20/mo, 1TB, EU/DE) — recommended; B2 documented as alternative
2. `gh secret set BACKUP_DEST --body 'sftp://...'`
3. Uncomment the `schedule:` block in `files-backup.yml`
4. First-run smoke: trigger `workflow_dispatch` manually, verify destination has expected structure

## 10. Testing strategy

The no-data-loss guarantee depends on this section. Acceptance gate: every item below passes before PR merges.

### 10.1 Test layers

| Layer | Tool | Coverage |
|---|---|---|
| Unit | Vitest | Pure helpers, schemas, key/filename builders |
| Storage conformance | Vitest, parameterized | `FileStorage` interface contract vs. all impls |
| Integration | Vitest + Postgres | DB + storage transactional behavior with `ChaosFileStorage` failure injection |
| E2E | Playwright | Full user flows (upload → review → categorize → preview → archive → export) |
| Property-based | `fast-check` | Path safety, authorization invariants |
| Backup verification | CI smoke job | Round-trip via fixture |
| Real-Blob integration | Gated CI (main only) | Conformance suite vs. live Blob test store |

### 10.2 Storage conformance suite

`src/lib/server/files/storage.conformance.test.ts` exports `runConformanceSuite(makeStorage)`. Invoked from:

- `local-fs-impl.test.ts`
- `in-memory-mock-impl.test.ts`
- `vercel-blob-impl.test.ts` (gated on `BLOB_READ_WRITE_TOKEN` presence)

Covers ~30 invariants: round-trip SHA, duplicate-path rejection, traversal blocked, archived-prefix denied, archive copy/verify/del semantics, not-found error class, viewUrl shape, etc.

### 10.3 `ChaosFileStorage` failure injection

Wrapper that selectively fails the next N calls of any method. Integration tests verify:

- Upload fails → DB rollback complete, no orphan, no row, no audit entry
- Upload succeeds, DB commit fails → orphan exists, reconciliation job quarantines within 24h
- Archive `copy()` fails → original intact, no broken refs
- Archive `del()` fails → idempotent re-run completes
- Network drop mid-stream → equivalent to upload failure

### 10.4 Orphan reconciliation tests

- Fixture with 5 files in DB, 7 blobs in store (2 orphans) → job quarantines 2, alerts via weekly digest mock
- Fixture with 5 rows, 3 blobs (2 broken refs) → job marks 2 rows deleted_at + delete_reason='blob_missing'
- Fixture with 10 valid pairs → job is a no-op
- SHA mismatch on one file → job alerts, doesn't auto-repair

### 10.5 Festschreibung tests

- Upload to year 2024 with `festgeschrieben_bis=2024` → L2 throws `FestschreibungError` before reaching storage
- Direct call to `storage.upload({pathname: 'archived/belege/2024/x.pdf'})` → L1 throws `StorageImmutabilityError`
- Year-close: 100 files in 2025, advance to 2025 → all archived, SHAs verified, audit log has 100 events
- Archive job crash between copy and del → re-run is idempotent (head check + skip)
- Concurrent read during archive → either path serves, never 404
- Storno entry after year-close → original file at archived path (immutable), Storno entry's file at current year path (writable)

### 10.6 E2E happy + sad paths (Playwright, `@phase-9` tag)

Happy:
- E1: Submit Auslage with PDF + image → inbox → categorize → preview iframe loads → download → SHA matches
- E2: Regenerate Rechnungs-PDF → new files row → old soft-deleted or superseded → preview shows new
- E3: Browse `/app/files`, filter, preview, search
- E4: Export 2025 ZIP → unzip → `00-INDEX.csv` matches DB → each PDF SHA matches
- E5: Close year 2025 → files moved to archived/, reading still works, upload to 2025 fails

Sad:
- S1: Upload >25MB → friendly German error, no row
- S2: Upload compresses to >4.5MB → reject, no row
- S3: Corrupt PDF header → compression fallback uploads original, preview shows graceful "download to view"
- S4: Browser crashes mid-upload → no row, no blob (or orphan caught by reconciliation)
- S5: Server killed mid-action → DB rollback complete
- S6: Unauthorized `/app/files` → 403
- S7: Soft-deleted file preview → 410 Gone

### 10.7 Concurrency tests

- Two clients upload same sha256 in parallel → exactly one row, one blob, both receive same `file_id`
- 50 parallel reads on same file → all succeed, audit log has 50 entries
- Upload during year-close → goes to open year, doesn't interfere with archive job processing previous year
- Archive + read concurrent → no 404 during transition window

### 10.8 Authorization tests (property-based + manual)

- Property: user without access never gets file bytes (403 + audit entry)
- Manual: path traversal in `fileId` → Zod UUID validation blocks
- Manual: `BLOB_READ_WRITE_TOKEN` never reaches browser → CI scan of `build/` output fails build if present
- Manual: CSRF token missing → SvelteKit rejects
- Manual: cache headers `Cache-Control: private, no-cache` verified

### 10.9 Real-Blob integration (gated)

Runs only on push to `main`. Uses dedicated `folgederwolke-ci-test` Blob store (separate from prod). Runs full conformance suite + 5-file smoke. Failure blocks subsequent deploys.

### 10.10 Acceptance gates (PR merge blockers)

- [ ] All conformance tests green vs. local-fs + in-memory-mock
- [ ] All integration tests green with `ChaosFileStorage`
- [ ] All E2E tests green (happy + sad)
- [ ] All authorization tests green (property-based + manual)
- [ ] All concurrency tests green
- [ ] Backup script smoke round-trips a fixture
- [ ] Real-Blob integration test passes on main
- [ ] `/healthz` reports `db`, `sheets`, `blob` independently
- [ ] CI build-output scan for `BLOB_READ_WRITE_TOKEN` → not present
- [ ] Manual reviewer signs off that the test plan covers every data-loss scenario in §6, §7, §10

## 11. Cutover

### 11.1 Pre-merge (Andy's responsibility)

1. Provision Vercel Blob store
   - Dashboard → Storage → Create Blob Store
   - Region: `fra1`
   - Access: private
2. Add Vercel env vars (Production):
   - `BLOB_READ_WRITE_TOKEN` (copied from Blob store page)
   - `STORAGE_BACKEND=blob`
   - `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (paste contents of `~/secrets/folgederwolke-service-account.json`)
   - `FINANCE_SHEET_ID` (for `/healthz` Sheets check)
3. Remove obsolete env vars:
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_KEY_FILE`

### 11.2 Merge → deploy → verify

1. PR merges to `main` after CI green
2. `migrate.yml` runs against Neon → applies 0013 (files table + FK columns)
3. Vercel auto-deploys new build
4. Manual smoke:
   - `/healthz` returns all green
   - Submit a test Beleg via `/auslage-einreichen` → success
   - Open in inbox, preview, categorize as expense
   - Visit `/app/files`, confirm new file appears
   - Trigger an export download for current year

### 11.3 PR2 (one week later)

Ships `drizzle/0014_drop_drive_columns.sql`. Zero code changes (the references were removed in PR1). Standard merge → migrate → done.

### 11.4 Rollback

| Failure | Effect | Action |
|---|---|---|
| CI fails | Nothing in prod | Push fix |
| 0013 migration fails | Schema half-applied | Manual fix per `RUNBOOK §6`, re-run |
| Vercel deploy fails | Old deploy can't read new schema | Revert via Vercel dashboard; schema is additive so no DB rollback needed |
| Runtime fails post-deploy | App broken | Revert deploy on Vercel; schema rollback NOT needed for 0013; 0014 hasn't shipped yet |
| 0014 ships, runtime then fails | Cannot easily rollback (columns dropped) | Roll forward only — this is why 0014 is a separate PR after 1 week of soak |

## 12. ADR-0012 (new)

To be drafted in same PR:

```
ADR-0012: Blob-storage durability and Festschreibung as compensating control

Context:
- Vercel Blob is the primary file storage backend (Phase 9+)
- Blob has no native object-lock / WORM / versioning / soft-delete
- AO §147 requires 10-year immutable retention of Belege

Decision:
- Festschreibung immutability is enforced at three layers: storage-prefix guard,
  domain-level year check, and DB row-level trigger. The combination of
  archived/ pathname prefix + denyWritesToArchivedPrefix is the WORM equivalent.
- Soft-delete via files.deleted_at is the only delete path reachable from
  app code. Blob.del() is called only by the archive job, which is itself
  subject to layer-1 enforcement on its inputs.
- Nightly orphan reconciliation job catches transactional gaps within 24h.
- Backup script ready for activation when DSGVO posture demands off-platform
  copies; deferred until then per the pragmatic-rebalance review.

Consequences:
- Adding new file-mutation code paths requires going through FileStorage
  interface only — direct blob SDK calls are banned by ESLint rule.
- The audit log is the source of truth for what was uploaded/archived/deleted;
  Vercel does not provide per-blob audit logs.
- Off-platform backup (Hetzner Storage Box or B2) is a Phase-2 follow-up,
  unblocked by completing the Workspace for Nonprofits enrollment (issue #55).
```

## 13. Open issues / deferred work (recap)

- Issue #55 — Google Workspace for Nonprofits (sheets DPA + optional backup destination)
- Issue #37 — env.ts COMMIT_SHA alias (cosmetic, separate PR)
- Vercel Pro upgrade + DPA — deferred, documented as named risk
- Active backup cron + destination provisioning — script ready, activation is a 30-second config change
- PR2 (0014_drop_drive_columns) — one week after PR1

## 14. Glossary

- **AO §147**: Abgabenordnung §147 — German tax law, 10-year retention of accounting records
- **Beleg**: receipt / documentary evidence for a booking entry
- **Buchungsjahr**: fiscal year for accounting purposes (Europe/Berlin timezone, per ADR-0001)
- **Festschreibung**: year-close lock making bookings immutable (ADR-0006)
- **GoBD §146**: Grundsätze ordnungsmäßiger Buchführung §146 — German bookkeeping standards
- **lfd_nr**: fortlaufende Nummer — sequential numbering required by AO §147
- **Sphere**: tax sphere (ideeller / vermoegen / zweckbetrieb / wirtschaftlich) per ADR-0002
- **Spendenbescheinigung / Zuwendungsbestätigung**: donation receipt for tax-deductibility purposes
- **Storno**: correction entry (cancels a previously-booked entry with opposite-signed amount)
- **WORM**: Write-Once-Read-Many (immutable storage)
