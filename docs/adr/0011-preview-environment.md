# ADR-0011: Preview environment + post-deploy smoke

**Status:** Accepted (2026-05-26)

## Context

Commit `226a65d` (PR #57) fixed three prod 500s captured from Vercel logs on
2026-05-20: (A) SvelteKit named-action / default-action conflict across six
routes; (B) `expenses_business_id_format_ck` constraint rejecting the `AUS-`
prefix on the approve flow; (C) a dead `/app/dev/mails` nav link. None of
these were caught by local unit or E2E tests because they only manifest
against the real Vercel + Neon + Blob runtime.

A full staging environment was considered: separate Vercel project, long-lived
`staging` branch, promote-to-prod workflow. Rejected as overscoped for a
20-person Verein — two projects with synced env vars is ongoing ops burden,
Mailtrap adds an external dependency, and GH Actions usage would exceed the
free tier on a normal PR cadence. The incremental bug-catching value over PR
previews is marginal. (Archived plan: `.claude/plans/2026-05-21-staging-environment.md`.)

The constraint envelope: Vercel Hobby, Neon free tier, GH Actions free tier,
no additional paid services.

## Decision

1. **PR previews as the integration-test environment.** Every PR against `main`
   triggers a focused E2E suite run against its Vercel preview deploy. The
   existing single-Vercel-project topology is preserved — no second project.

2. **Database isolation via Neon copy-on-write branch.** A single `preview`
   branch is forked from the production Neon branch. All PR preview deploys
   share it. Schema is kept current by the `preview-e2e.yml` workflow, which
   runs `scripts/migrate.ts` against the preview branch on every PR run.

3. **Blob store isolation.** A separate Vercel Blob store (`folgederwolke-preview-blob`)
   is connected to the Preview environment only, using the default
   `BLOB_READ_WRITE_TOKEN` name. The prod blob store is simultaneously
   disconnected from Preview — this fixes a latent safety bug where any
   preview file upload would land in the production store.

4. **Mail isolation.** `MAIL_PROVIDER=no-op` is set in the Vercel Preview
   environment. The no-op provider writes `sent_mails` rows via the existing
   event-bus path (ADR-0005) without any SMTP I/O. No Mailtrap.

5. **Per-run data namespacing.** `E2E_RUN_ID` is set to `pr<N>-<attempt>` by
   the workflow. All rows created by a test run carry this prefix via
   `tests/e2e/lib/run-id.ts` helpers (`nsEmail`, `nsLabel`). Concurrent PRs
   share the preview DB without collisions. A best-effort cleanup job
   (`scripts/preview-cleanup.ts`) deletes namespaced rows after each run.

6. **Session minting without SMTP.** `issueSession()` is extracted from
   `consumeMagicLink` in `src/lib/server/auth/index.ts`. The
   `scripts/mint-session.ts` CLI uses it to insert a real session row and
   print the cookie, which the workflow injects via Playwright's
   `context.addCookies`. The magic-link SMTP path is bypassed; the DB path is
   exercised.

7. **Branch protection gates on the check.** `main` requires the
   `preview-e2e / e2e` status check to pass on the PR head SHA before merge.
   This makes the preview suite the merge gate for the PR-#57 bug class.

8. **Post-deploy prod smoke + auto-rollback.** After every production deploy
   reports success, three read-only smoke tests run against prod
   (`tests/e2e/post-deploy-smoke.spec.ts`). First failure: GH issue filed and
   one retry after 30 s. Second failure: `scripts/ci/vercel-rollback.sh`
   promotes the previous READY production deployment to Current via the Vercel
   API (instant alias flip, no rebuild). All migrations are additive-first, so
   rolling back the app does not require rolling back the DB.

9. **Single-project topology eliminates cron leakage.** Vercel only runs
   scheduled crons on the Production deployment, so preview deploys never
   trigger `daily-dispatcher` or any other cron handler.

## Consequences

- **Env-var drift risk.** Production and Preview share one Vercel project, so
  drift is auditable via `vercel env ls preview` vs `vercel env ls production`.
  The workflow will silently miss a missing var; run a periodic parity check if
  this becomes a problem.
- **Latent prod-blob-in-preview bug fixed.** Disconnecting the prod blob store
  from Preview (Decision 3) is a bonus safety fix, not just a test-isolation
  measure.
- **No mail observability on preview.** The `no-op` provider cannot send real
  emails. Manual verification of mail content on preview is not possible; use
  local dev for that.
- **`/healthz` freshness ceiling.** The post-deploy smoke's DB-connectivity
  check hits `/healthz`. If the route caches its response (e.g. 30 s
  Cache-Control), a stale 200 can mask a transient DB failure. Acceptable at
  this scale.
- **Shared preview Neon branch may flake global-state tests.** Tests that
  mutate settings, festschreibung, or year-close state can affect subsequent
  runs from concurrent PRs. Wrap such tests in `test.describe.serial()` or
  gate them to the local-postgres suite only.
- **Auto-rollback can trigger unnecessarily.** A flaky smoke (network blip,
  cold-start race) on both attempts causes a rollback of a good deploy. The
  2-attempt bar and the GH issue make the decision auditable and reversible.

## Alternatives considered

- **Full staging environment** (separate Vercel project, long-lived staging
  branch, promote workflow) — rejected; see Context.
- **Per-PR Neon branches** (Neon CI/CD pattern) — better per-run isolation,
  but roughly three times the workflow complexity and requires provisioning/
  teardown on every PR. Deferred; revisit if shared-branch collisions become
  frequent.
- **Skip the post-deploy smoke** — cheap safety net with high value-to-cost
  ratio; kept.
- **Alert only, no auto-rollback** — slower mean-time-to-recovery. The hybrid
  approach (alert + rollback after retry) is the chosen sweet spot.

## Files

New files added in this change set:

| Path                                      | Role                                                       |
| ----------------------------------------- | ---------------------------------------------------------- |
| `scripts/seed-preview.ts`                 | Idempotent baseline seed for the preview Neon branch       |
| `scripts/mint-session.ts`                 | CLI: inserts a real session row, prints cookie to stdout   |
| `scripts/preview-cleanup.ts`              | Best-effort delete of e2e-namespaced rows after a run      |
| `scripts/ci/wait-for-vercel.sh`           | Polls Vercel Deployments API until a commit SHA is READY   |
| `scripts/ci/vercel-rollback.sh`           | Promotes the previous READY prod deployment to Current     |
| `playwright.preview.config.ts`            | Playwright config for deployed-preview runs (no webServer) |
| `tests/e2e/lib/run-id.ts`                 | `E2E_RUN_ID` helper — `getRunId`, `nsEmail`, `nsLabel`     |
| `tests/e2e/preview-smoke.spec.ts`         | PR preview E2E suite (runtime, Blob, nav health, auth)     |
| `tests/e2e/post-deploy-smoke.spec.ts`     | Prod smoke: `/`, `/app` redirect, `/healthz`               |
| `.github/workflows/preview-e2e.yml`       | PR workflow: wait → migrate → seed → mint → Playwright     |
| `.github/workflows/post-deploy-smoke.yml` | Post-prod-deploy smoke + GH issue + auto-rollback          |

Modified files:

| Path                           | Change                                                 |
| ------------------------------ | ------------------------------------------------------ |
| `src/lib/server/auth/index.ts` | Extract `issueSession()` from `consumeMagicLink`       |
| `.github/workflows/ci.yml`     | Add `paths-ignore` for docs, cache Playwright browsers |
