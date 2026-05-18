# RUNBOOK

> Skeleton — Phase 7.5 (`compliance-hardening`) completes this document with full step-by-step procedures.

## Rotate Secrets

<!-- Phase 7.5 fills in: SESSION_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN, RESEND_API_KEY, DATABASE_URL rotation steps with zero-downtime Vercel env swap procedure. -->

_Placeholder: see Phase 7.5._

## Restore from Backup

<!-- Phase 7.5 fills in: Neon point-in-time restore procedure, Drive file recovery, audit-chain integrity re-check after restore. -->

_Placeholder: see Phase 7.5._

## Emergency Stop

To abort the autonomous build mid-run: `touch ~/.folgederwolke-build/state/ABORT`

To roll back to the last known-good phase tag and clean up orphaned branches/PRs/previews:

```bash
scripts/orchestration/cleanup.sh [phase-number]
```

<!-- Phase 7.5 fills in: production emergency stop, Vercel instant rollback command, Neon connection pool drain. -->

_Placeholder for production procedure: see Phase 7.5._

## Investigate Audit Chain Break

<!-- Phase 7.5 fills in: how to detect tampered audit rows (hash mismatch), re-seal procedure, legal notification requirements under GoBD. -->

_Placeholder: see Phase 7.5._
