# ADR-0012: Blob Storage — Festschreibung as Compensating Control + Named Risks

**Status:** Accepted (Phase 9)

## Context

- Vercel Blob is the primary file storage backend (Phase 9+)
- Blob has no native object-lock / WORM / versioning / soft-delete
- AO §147 requires 10-year immutable retention of Belege
- Vercel DPA applies to Pro+ only; Phase 9 ships on Hobby tier
- The plan is calibrated to a 20-person Verein, not an enterprise

## Decision

### 1. Three-layer Festschreibung enforcement

- **L1 (storage impl):** `denyWritesToReservedPrefixes` in `vercel-blob-impl.ts` guards `archived/`, `quarantine/`, `tmp/`. Public `upload()` and `copy()` throw `StorageImmutabilityError`. Internal helpers (`_internalDelByPath`, `_internalQuarantine`) bypass via direct module-private calls.
- **L2 (domain):** route actions check `settings.festgeschrieben_bis` before any file mutation on a closed year. `archiveYear()` runs BEFORE `closeBuchhaltungsjahr` in the year-close action to belt-and-suspenders against future automation that might bump `festgeschrieben_bis`.
- **L3 (DB trigger):** `assert_not_festgeschrieben_fn_files()` on the `files` table rejects UPDATE/DELETE/INSERT for years ≤ `settings.festgeschrieben_bis`. **Dedicated function** (not shared with entity tables) because `files` reads `uploaded_at`, not `gebucht_am`.

GoBD Tz. 58/61 accepts software-enforced immutability when documented + tested. Three layers = defense in depth.

### 2. Soft-delete model

`files.deleted_at` is the only delete path reachable from app code. The only blob-level `del()` calls live inside (a) `archive()` after the three-phase head→copy→head→del sequence verifies the destination object's size matches the source, and (b) `upload-pipeline.ts` dedup-cleanup after the unique-violation race. Both grep-guarded in CI (`scripts/check-internal-del.sh`).

`archive()` performs a size-equality check (not a sha256 round-trip) before the source delete — Vercel Blob writes are atomic per object (a copy either succeeds fully or does not appear at the destination), so size-equality is proportionate to detect partial-copy state. A sha256 verify would double archive-time blob downloads with no additional safety guarantee at this scale.

### 3. Orphan reconciliation as manual script

`pnpm files:reconcile` detects + repairs drift within a 48h age window (avoids false-positive quarantining of in-flight uploads). Not on a cron — Verein-scale calibration.

### 4. Hobby-tier named risk

Phase 9 ships on Vercel Hobby without a signed DPA. This is a lateral move from Drive's no-DPA personal-account state. Acceptable for current scale; revisit when DSGVO HIGH items close. Out of scope: TIA stub, DPIA refresh, Pro upgrade.

### 5. Backup parked

Vercel account compromise = total file loss until backup is activated (`scripts/backup-files.ts` + `.github/workflows/files-backup.yml` are shipped but `workflow_dispatch`-only). Activation per RUNBOOK §6.4. Accepted risk; ~€3.20/mo (Hetzner Storage Box) when activated.

### 6. Phase 11 — invoice PDFs are now Original-Belege under this regime

Phase 11 moved invoice PDFs from `invoices.pdf_bytes` (bytea) onto Vercel Blob via the same `files`-table pipeline that holds Belege. Two consequences for this ADR:

- **The file IS the Rechnung** — not a Beleg-scan whose original lives elsewhere. Under § 14 Abs. 1 Satz 2 UStG (Echtheit der Herkunft / Unversehrtheit / Lesbarkeit über 10 Jahre) and § 147 AO, the Verein is the **issuer** of the legally binding document; the Blob copy is the only durable copy until §5 above is un-parked. To compensate for this without activating off-platform backup yet, `finalizePdfJob` emits an `invoice.pdf_generated` event whose `audit_log` row carries `files.sha256`. Any silent blob mutation becomes detectable via the hash-chained audit log (ADR-0004), which is itself replicated to the weekly off-Postgres anchor — extending tamper-evidence to invoice content without doubling storage.

- **Festschreibung year mismatch is accepted** — the `files` table trigger keys on `uploaded_at`, while invoice Festschreibung keys on `gebucht_am`. For a Rechnung dated 2025-12-29 but generated 2026-01-15, the file row's Festschreibung year is 2026, not 2025. The invoice row itself is correctly locked (entity-level trigger uses `gebucht_am`); soft-delete of historic-invoice files would route through code paths that also check `settings.festgeschrieben_bis`. Direct DB mutation bypassing app code is outside the L3 guarantee — accepted for Verein scale, tracked here rather than via a new ADR.

## Consequences

- ESLint rule (`no-restricted-imports`) prevents direct `@vercel/blob` imports outside `vercel-blob-impl.ts`
- CI grep guard prevents `_internal*` storage methods from being called outside allowed callsites
- Audit log is the source of truth for what was uploaded / archived / deleted
- Off-platform backup activation unblocks the Google Workspace for Nonprofits migration (issue #55)
- archiveYear runs BEFORE `closeBuchhaltungsjahr` in the year-close route action
