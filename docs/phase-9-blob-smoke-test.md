# Phase 9 — manual blob smoke test (pre-merge)

This is a one-time pre-merge gate that Andy runs before merging the Phase 9 PR.
It exercises the real Vercel Blob backend (not the local-fs mock) to verify
that the SDK integration in `src/lib/server/files/vercel-blob-impl.ts` behaves
correctly against the live API.

## Prerequisites

1. Vercel Blob store `folgederwolke-ci-test` provisioned (separate from prod).
2. `BLOB_READ_WRITE_TOKEN_CI` available — a read-write token scoped to
   `folgederwolke-ci-test` only. Generate via
   `vercel storage blob token` for that store.

## Run

From the project root:

```bash
BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN_CI" \
STORAGE_BACKEND=blob \
pnpm test:e2e --grep @phase-9
```

The grep restricts the run to Phase 9 specs. The override env vars point the
storage factory at the real backend just for this invocation.

## What it verifies

- `upload` succeeds against a private blob store
- `download` round-trips bytes intact
- `archive` performs the head/copy/head/del three-phase rename
- `_internalDelByPath` deletes the blob (used by the dedup-cleanup path)
- Reserved-prefix writes (`archived/`, `quarantine/`, `tmp/`) throw
  `StorageImmutabilityError`
- Token redaction in error messages (no `vercel_blob_rw_*` leaks)

## What it does NOT verify

- DSGVO / data residency (covered by store provisioning in `fra1`)
- Quota / cost behaviour
- Multi-region failover

## After the run

Delete any test artifacts from `folgederwolke-ci-test` via Vercel dashboard
or `vercel storage blob list folgederwolke-ci-test` + `vercel storage blob rm <key>`.
The CI store is short-lived; it does not need to retain history.

If the run is green, comment "blob smoke ✅" on the Phase 9 PR before merge.
If red, escalate — do not merge.
