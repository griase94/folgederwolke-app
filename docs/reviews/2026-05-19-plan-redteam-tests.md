# Red-team review — Overnight "Perfect Night" implementation plan, test rigor angle

Reviewer: Claude (Opus 4.7), invoked as senior test-engineering specialist.
Target: `docs/superpowers/plans/2026-05-20-overnight-perfect-night.md` against the spec `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md`, the prior spec red-team (`docs/reviews/2026-05-19-spec-redteam-tests.md`), and the actual codebase state.

The plan converts a strong spec into 27 ordered tasks. The orchestrator scaffolding is well-shaped; the test discipline is where the plan **stops short of mechanizing what the spec promises**. Several canaries reference exports that don't exist, the TDD-anchor enforcement is human-prose-only, and the vitest config will silently skip the canary directory. This report enumerates 13 findings (6 BLOCKING / 5 HIGH / 2 MED) and proposes 5 concrete additions.

---

## Findings

### P-01 — Canary tests reference symbols that don't exist (BLOCKING)

The canary suite (Tasks 9-14) is meant to act as the infra smoke that gates Wave 1. But the test bodies in the plan import functions that **do not exist in the codebase**:

- Task 14 (`dashboard-1000-rows-perf.test.ts`): `import { loadDashboardData } from "$lib/server/domain/dashboard"`. The actual module exports `loadDashboardKpis()` + `loadRecentActivity()` — **no `loadDashboardData`** (`src/lib/server/domain/dashboard.ts:89, :250`).
- Task 13 (`id-allocator-concurrency.test.ts`): `allocateBusinessId({ kind: "AUS" })`. Real signature is `allocateBusinessId(kind: AllocatorKind, year?: number)` — positional, not an object (`src/lib/server/domain/id-allocator.ts:30`). The test won't even type-check.
- Task 13 (`sphere-required.test.ts`): `createIncome({ betragCents: 100 })` is `await expect(...).rejects.toThrow(/sphere/i)`. Real `CreateIncomeInput` requires `bezeichnung, kategorieNameSnapshot, sphereSnapshot, actorUserId, businessId` — the test's `@ts-expect-error` only suppresses the missing `sphere`. The real error message will say `bezeichnung` is undefined, not "sphere", so the regex `/sphere/i` won't match. The test passes for the wrong reason or fails for a wrong reason — placebo canary.

**Consequence:** preflight's `canary-suite-present` check (Task 7) only counts files; it never runs them. The first time a build agent triggers the canaries on a worktree, they go red and the orchestrator's defer logic interprets it as infra failure (per spec §Cross-wave regression fixtures). The night stalls on a test-author bug, not an infra bug, with no human in the loop.

**Fix:** Task 9-14 must include a `pnpm test --run tests/canary/...` step where the test is **proven to pass** before the commit. Today the plan shows the commands but the test bodies reference unimported symbols, so they cannot pass. Either rewrite the tests to match the real API, or add small wrapper exports in source first (`loadDashboardData` as a thin façade over `loadDashboardKpis + loadRecentActivity`; an object-shaped `allocateBusinessId` overload; an explicit `sphere`-validation guard in `createIncome` that runs BEFORE other validation).

### P-02 — Vitest config silently skips `tests/canary/**` (BLOCKING)

`vitest.config.ts`:

```ts
include: [
  "src/**/*.{test,spec}.{js,ts}",
  "tests/unit/**/*.{test,spec}.{js,ts}",
],
```

The canary directory `tests/canary/**` is **not in the include glob**. So:

- `pnpm test --run` (CI default) will not pick up canary tests.
- `pnpm test --run tests/canary/year-boundary.test.ts` (explicit path) works because vitest accepts an override path.
- The plan adds a `canary` alias in package.json (Task 23) but the alias body is never specified in the plan; the include never gets edited.

**Consequence:** the canary suite is invisible to CI. The spec promises "every sub-PR's CI runs the canary suite" (§Cross-wave regression fixtures). Without an include-glob update, CI green is a lie for canary coverage. Worse: a regression in C4 that breaks the sphere-required guard would not surface until the morning — by which time 8 other clusters may have merged on top of it.

**Fix:** Task 8 (CI workflow patch) or a new task must add `"tests/canary/**/*.{test,spec}.{js,ts}"` to the vitest `include` array AND add a `package.json` script `"canary": "pnpm vitest --run tests/canary"` that's invoked from CI as a distinct step.

### P-03 — Canary tests requiring live Postgres aren't gated on it (BLOCKING)

Tasks 11 (festschreibung), 12 (audit_log REVOKE), 13 (audit-chain integrity, id-allocator), 14 (dashboard perf) all execute SQL against the test DB. The plan's "Step 2: Run + commit" for Task 11 invokes `pnpm dev:up` explicitly. **Tasks 12, 13, 14 do not.** They assume the DB is still up because Task 11 brought it up.

This breaks two ways:

1. If the plan-executor runs out of order (e.g. resuming from a checkpoint after Task 11 succeeded but the docker container was shut down for OS reboot), Tasks 12-14 fail at connection-error level, not at assertion level. The orchestrator's "5 attempts then defer" logic will burn three of those attempts before recognizing it's a docker-state problem.
2. The `vitest-global-setup.ts` does run `reset-test-db.sh` which itself fails if docker isn't up — so the failure surfaces, but it surfaces as "reset failed" rather than "Task X needs docker". Build agents (per spec §Build agent role) won't know to run `pnpm dev:up`.

**Fix:** Tasks 11-14 each get an explicit `pnpm dev:up` precondition step, and the preflight gets a docker-up gate that runs `pg_isready` against EACH of the 9 cluster-allocated ports (5441-5449), not just `docker ps`. Today's preflight check `docker-postgres-healthy` greps `docker ps` for "postgres" — that catches "no Postgres" but not "wrong port" or "container running but listening on default 5432 not 5441".

### P-04 — TDD-anchor verification is a prompt instruction, not a script (BLOCKING)

The spec §TDD protocol says "Red commit `[TDD-red]` exists; running its tests at that commit produces a non-zero exit code". The plan's build-agent template (Task 15) and code-review reviewer prompt (Task 17) both reference this discipline in **prose**:

> "Green commit `[TDD-green]` exists later in history; the test bodies in the green commit are a SUPERSET of the bodies in the `tests/.tdd-red/c<N>-cycle<k>.txt` anchor file"

There is **no script** in the plan that:

- Greps the PR's commit log for `[TDD-red]` and `[TDD-green]` tags
- Checks out the red commit and runs the test files, asserting non-zero exit
- Diffs `tests/.tdd-red/c<N>-cycle<k>.txt` against the green-commit test bodies
- Asserts the red-commit's test bodies contain at least one symbol from the green-commit's production change (defeats `expect(true).toBe(false)` placebo)
- Refuses the PR if any of the above fails

This work is delegated to a "generic code reviewer" agent (spec §Roles) that reads the prompt and does the check by hand. That agent gets context-bombed across cycles, gets fatigued by cycle 4, and may rubber-stamp by cycle 6. The whole point of "machine-verified TDD" is mechanized enforcement; without a script, it's TDD-by-vibes.

Additionally: **the `tests/.tdd-red/` directory is not in `.gitignore`** (verified — `.gitignore` only excludes `node_modules`, `.svelte-kit`, `.claude`, `.dev-data`, `.env*`). Good — that means the anchor file CAN be committed. But there's also no `.tdd-red/.gitkeep`, and an empty directory may not be created if the build agent skips Step 1 of its TDD cycle. The reviewer's job is then to detect the absence — but if the reviewer is prose-only and the absence is silent, the discipline degrades.

**Fix:** Add an explicit task that creates `scripts/orchestrate/verify-tdd.ts` with these mechanical checks, invoked from CI on every sub-PR, AND from the orchestrator's tick before it accepts a code-review "RESOLVED" verdict. Fail-closed.

### P-05 — Visual snapshot baseline is unspecified and never created (BLOCKING)

Spec §Required test categories: "Visual snapshot (Playwright + diff) — every UI cluster", with baselines "pinned to ubuntu-24.04 + Chromium v140-stable". Plan §Tasks: no task creates a baseline directory, no task runs `playwright test --update-snapshots` in a Linux container before clusters dispatch. The current codebase has zero `*-snapshots/` directories (verified).

When C6 (primitives) opens its first sub-PR, its visual-diff reviewer (spec §Roles) will run `expect(page).toHaveScreenshot()` — and fail because no baseline exists. The reviewer's prompt (Task 17, `reviewer/visual-diff.md`) doesn't include "if no baseline exists, create one and proceed with subsequent diffs" — it says "diff against pre-change baseline".

**Consequence:** the first UI cluster's visual-diff reviewer posts `[VERDICT: NOT RESOLVED]` not because of a regression but because of missing baselines. The orchestrator escalates. Build agent restarts. Same failure. Three restarts → cluster deferred. Wave 2 doesn't start. Cascade.

**Fix:** New task between Task 8 and Task 9 — "Generate visual baselines in pinned container". Body:

```bash
docker run --rm -v $PWD:/work -w /work mcr.microsoft.com/playwright:v1.49.1-jammy \
  pnpm exec playwright test --update-snapshots
git add tests/e2e/*-snapshots/
git commit -m "test(visual): seed playwright baselines from pinned Linux runner"
```

Without this, every UI-touching cluster's first review cycle has a guaranteed false-failure.

### P-06 — Canary asserts on `verifyAuditChain` returning `ok: true` from a freshly-reset DB without seeded chain (BLOCKING)

Task 13's `audit-chain-integrity.test.ts`:

```ts
it("verifies the current chain is clean", async () => {
  const r = await verifyAuditChain();
  expect(r.ok).toBe(true);
  expect(r.breaks).toEqual([]);
});
```

The `verifyAuditChain` implementation walks `audit_log` rows ordered by `chain_seq` and verifies hash continuity. On a freshly-reset test DB, the seed (`scripts/seed.ts`) inserts reference data via plain INSERTs, **not via the audit-emitting domain functions** — so the `audit_log` table likely contains either (a) zero rows (chain head null) or (b) only pre-genesis rows the chain trigger ignored. `verifyAuditChain` returns `ok: true, head: null, persistedHead: null` — which technically satisfies `r.ok === true`, but **the assertion doesn't actually exercise the chain verifier**. It passes vacuously.

This is Pattern C (placebo TDD) from the spec's own §Test-quality refusal patterns. The canary is supposed to verify the verifier; instead it verifies that an empty table isn't broken.

**Fix:** the canary must explicitly insert N audit rows via the domain (or directly with the trigger firing), assert `head === N` and `breaks.length === 0`. Without that, the canary fails to catch any regression in the chain trigger, the hash function, or the verifier walker.

---

### P-07 — `pool: "forks"` + `singleFork: true` masks parallelism bugs but creates a 9× serial run cost (HIGH)

`vitest.config.ts` runs `pool: "forks"` with `singleFork: true`. Every vitest test in every cluster runs in a single fork — no parallelism. This **mitigates** the prior red-team's F-18 concern about Postgres state races, but creates a new one for the overnight: the canary suite (10 tests, several integration-heavy) plus per-cluster integration tests (30+ tests) plus existing unit tests (40+ files) all run in series.

For a build agent that runs `pnpm test --run` on every iteration, a serial pass through 80+ files is 60-120 seconds. Per the spec, "minimum 2 cycles" → typically 4-6 → if cluster C1 takes 8 cycles, that's 8 × 5 agents × 90 seconds of test runs per cycle = ~60 minutes of pure test wall-clock for one cluster.

The plan doesn't address this. Build agents will appear to hang; the orchestrator's 5-min-tick polling may misinterpret slow CI as "still running" when it's actually thrashing.

**Fix:** keep singleFork for DB-touching integration tests but split unit tests (no DB) into a `forks: { singleFork: false, maxForks: 4 }` second project. Vitest's `projects` config supports this. The plan should add a Task that splits the config and updates `pnpm test` to run both projects.

### P-08 — Critical-path-coverage reviewer's verification is unscriptable (HIGH)

Spec §Roles: critical-path-coverage reviewer "reads the §Critical-path test matrix and verifies the cluster covers every critical path it touches". Plan §Task 17 (`critical-path-coverage.md`) is one of 8 reviewer prompts — all written in prose. There's no:

- Machine-readable critical-path matrix (a TS/JSON file the reviewer can `import`)
- Automated check that a sub-PR's diff touching a critical-path file (e.g. `src/lib/server/eur/**`) added or modified a test file matching the matrix entry
- Way for the orchestrator to detect "reviewer claimed RESOLVED but never actually opened the diff" — the reviewer posts a structured comment, parser parses it, orchestrator trusts it

By cycle 4 of cluster C1, with the test-quality reviewer, code reviewer, critical-path-coverage reviewer, visual-diff reviewer, UX-flow reviewer, vereinsmitglied-Native reviewer, AND four originating-expert reviewers all running per cycle, reviewer fatigue is mathematically guaranteed. The "every 3rd cycle second-opinion" mitigation is good but insufficient — it catches drift, not initial laziness.

**Fix:** encode the critical-path matrix as `scripts/orchestrate/critical-paths.ts` (an array of `{ paths: string[], requiredTestFiles: string[], requiredAssertions: RegExp[] }`). Add a CI check that diffs the PR's changed-files list against the matrix and fails if a touched critical path lacks an updated test. Reviewers verify the harder semantic question; the script catches the trivially-missing.

### P-09 — Reviewer-fatigue budget is unbounded and there's no cycle-time monitoring (HIGH)

Spec §Convergence gates: "minimum 2 cycles, no upper cap". Plan: same. With ~10 reviewers per cycle (4 originating-expert for C1, plus 6 generic), and the spec demanding 5-path walkthroughs from every originating-expert with Playwright traces written to disk… each reviewer cycle for C1 spawns ~10 agent invocations. If C1 takes 8 cycles, that's 80 reviewer invocations for ONE cluster. Multiply by 9 clusters: easily 400+ agent invocations overnight.

The plan has no:

- Per-tick budget for total spawned agents
- Per-cluster soft-budget for cycles (after which the orchestrator routes to "scope reviewer" — spec mentions but plan doesn't task)
- Anthropic API rate-limit handling (preflight checks `gh api rate_limit` ≥4000 — that's GitHub, not Anthropic)
- Telemetry on cycle wall-clock to detect runaway clusters

**Consequence:** by 3am, the orchestrator may have spawned 200 reviewers, hit Anthropic's rate limit (if any per-account), and stalled silently. The state file shows clusters in `REVIEWING` forever. No alarm.

**Fix:** add a `max_cycles_soft = 5` per cluster (after which the scope-reviewer agent runs to split or accept), and instrument the tick to log spawn-count and reject new dispatches if Anthropic-rate-limit-headers (returned in agent responses) drop below 10%. The morning report includes a "agent spawn count by cluster" table.

### P-10 — Fixture proliferation across canary, seed.ts, and dashboard-perf is uncoordinated (HIGH)

The plan uses "fixture" in three senses:

- **Canary fixtures**: tests in `tests/canary/`
- **Test fixtures in `seed.ts`/`seed-fixtures.ts`**: 5 members, 2 projects, 2 customers, marked `is_fixture=true` (per `scripts/seed.ts` and `scripts/seed-fixtures.ts`)
- **Dashboard-perf fixtures**: 1000 income + 1000 expense rows inserted in `tests/canary/dashboard-1000-rows-perf.test.ts`'s `beforeAll`

The dashboard-perf test inserts 2000 rows in `beforeAll` and **never cleans up**. With `singleFork: true`, those rows survive into subsequent vitest tests in the same run. The seed.ts reset wipes them on the NEXT `pnpm test --run` (reset-test-db.sh runs), but within a single run, any test that asserts on counts of `income` or `expenses` rows (e.g. C1's EÜR aggregation tests) will see the 2000 extras.

**Fix:** the perf canary uses a `beforeAll`/`afterAll` pair that inserts rows in a transaction and `ROLLBACK`s, OR explicitly DELETEs by a tag in `afterAll`. The plan never makes this explicit.

Additionally: existing tests like `tests/unit/eur.test.ts` and `tests/unit/dashboard.test.ts` already assert on aggregate counts. The plan has no audit of whether they break under the new 2000-row fixture. C1 build agent will get a flaky test it didn't write.

### P-11 — C8 mail-content tests have ambiguous layering — component vs integration (HIGH)

Spec §Required test categories for C8: "Mail content (`renderMailTemplate` + `sent_mails` row)" — explicit two-layer (component-render assertions on HTML, plus integration-level assertions on the `sent_mails` table with `MAIL_PROVIDER=no-op`).

Plan Task 13's mail canary (`mail-provider-no-op.test.ts`) only does the integration-level assertion: "two concurrent sends produce two distinct `sent_mails` rows". The component-level assertion is delegated to C8's build-agent prompt (Task 16, c8-mail-templates.md — written by the build agent at run time from the cluster template). The cluster template (Task 16) is a thin per-cluster prompt; nothing in the plan REQUIRES C8 to produce component-render tests for ALL 6 templates.

**Consequence:** C8 may ship a Giro-QR feature with only the `sent_mails`-row test ("mail was sent, subject correct"). The HTML body — and specifically the `data:image/png` payload of the Giro QR code — is never asserted. The mail looks fine to the test-quality reviewer because it's "tested at the integration level".

**Fix:** the c8-mail-templates.md cluster prompt must explicitly enumerate the 6 templates AND require a per-template component-level test that:

- renders the template via `renderMailTemplate("foo", props)`
- asserts on a fixture HTML snapshot
- for BeitragsReminder + InvoiceVersendetMail, additionally extracts the `data:image/png` base64, decodes via jsqr, asserts the EPC 069 payload structure

This is the F-15 finding from the spec red-team — and the plan doesn't carry it forward.

---

### P-12 — Trigger location for festschreibung is `0010_post_review_hardening.sql`, but spec says `0010` AND plan task asserts SQLSTATE 23514 unconditionally (MED)

The plan's canary `festschreibung-trigger.test.ts` (Task 11) asserts `error.code === '23514'`. The actual trigger in `drizzle/0010_post_review_hardening.sql` raises with `USING ERRCODE = 'check_violation'`, which Postgres maps to SQLSTATE 23514. Good.

But the canary's insert+update flow uses raw SQL with placeholder column names (`betrag_cents`, `sphere`, `kategorie_id`) and a comment "Adjust column list at execution time to match `drizzle/`". This is plan-time procrastination: the SQL is left for the build agent to fix. If the build agent gets the columns wrong, the test errors at the INSERT (not the UPDATE), and the test passes for the wrong reason — Pattern C placebo. The plan should ship the test with REAL column names verified against the schema.

Additionally: the trigger only fires on UPDATE OR DELETE (per the source — `BEFORE UPDATE OR DELETE`). The canary tests UPDATE, which is correct. But the spec §Critical-path test matrix says "DB trigger refuses mutation" — which a real attacker could attempt via DELETE too. The canary should test both.

### P-13 — Plan doesn't task anyone with the "second-opinion reviewer" actually being spawned (MED)

Spec §Roles: "Second-opinion reviewer (challenge) — 1 every 3rd cycle (cluster-wide). Fresh persona spawn with NO memory of prior cycles." Plan §Tasks: never mentions this role. The reviewer-role prompts (Task 17) list 8 roles; second-opinion is not one of them. The orchestrator-tick prompt (Task 19) doesn't gate dispatch on "if cycle %3 == 0, also spawn second-opinion".

**Consequence:** the anti-echo-chamber mitigation that the spec calls out is never wired up. Echo-chamber risk is fully real.

**Fix:** add a 9th reviewer-role prompt (`reviewer/second-opinion.md`), wire it into the tick logic, and make its dispatch conditional on `cluster.cycles.length % 3 === 0`.

---

## Top 5 most dangerous gaps

1. **P-01 — canaries reference non-existent symbols.** The night cannot start because the canary suite cannot pass. Preflight passes (it only counts files). Wave 1 dispatches. First cluster runs canary, fails on import. Defer counter increments. Cascade.

2. **P-02 — vitest skips `tests/canary/**`.** Even if P-01 is fixed, the canary suite is invisible to CI. Every sub-PR's "CI green" claim is hollow on canary coverage. A C4 sphere-regression won't surface until morning.

3. **P-04 — TDD-anchor enforcement is unscripted.** "Machine-verified TDD" is the spec's signature discipline; the plan delivers it as a prose instruction to a reviewer agent that suffers fatigue by cycle 5. Without a script, TDD discipline degrades silently.

4. **P-05 — no visual snapshot baselines.** First UI cluster's first review cycle will false-fail on missing baselines. Either deferral cascade or the reviewer rationalizes "no baseline = pass" — neither is a real visual-diff.

5. **P-06 — audit-chain canary passes vacuously.** The single test most likely to catch a 3am regression of the audit-log trigger (which underpins ADR-0004 tamper-evidence) doesn't actually exercise the verifier. By morning, an audit-chain hash regression could be merged across 9 clusters and the canary never noticed.

---

## Proposed concrete additions

Five additions the plan should include to materially reduce test-quality risk:

1. **`scripts/orchestrate/verify-tdd.ts`** + Task between Task 8 and Task 9 — automate the TDD-anchor check (see P-04). Run from CI on every sub-PR. The orchestrator's tick refuses to accept a code-review verdict until this script passes. Test it in isolation against a synthetic placebo-TDD commit history to confirm it would reject placebo.

2. **Pre-flight baseline task** — between Task 8 and Task 9, "Generate visual baselines in pinned `mcr.microsoft.com/playwright:v1.49.1-jammy` container, commit baselines to overnight branch" (see P-05). Without this, every UI cluster has a guaranteed first-cycle false-failure.

3. **Update `vitest.config.ts` include + add `package.json` canary alias** — in Task 23 or a new task. Without the include update, the canary suite is invisible to `pnpm test`. The `canary` script alias the plan mentions in §File structure (line 46) is never actually written in the task body; this must be specified.

4. **Mechanize the critical-path matrix** — `scripts/orchestrate/critical-paths.ts` exports `CRITICAL_PATHS: Array<{ files: RegExp; requiredTestPattern: RegExp; matrix_entry: string }>`. A CI check that examines `git diff --name-only origin/overnight-2026-05-20...HEAD` and asserts every matched `files` regex has at least one corresponding test file changed. Reviewers verify semantic coverage; the script catches the trivially-missing.

5. **Fix the canary test bodies BEFORE the night starts** — Tasks 11-14 currently ship test bodies that reference non-existent exports or use wrong call signatures. Rewrite them to match the real API (verified against the codebase) AND prove them green in the plan-execution session itself, not in the night-build agent. The preflight check `canary-suite-present` should be upgraded to `canary-suite-passing`: not just "files exist" but `pnpm exec vitest --run tests/canary` exits 0.

---

## Summary

- **13 findings total.**
- **BLOCKING / HIGH / MED split: 6 BLOCKING / 5 HIGH / 2 MED.**
- **5 concrete additions proposed.**

The plan's orchestrator scaffolding is mostly sound. The test-rigor angle has a consistent failure mode: **the spec promises machine-verified discipline; the plan delivers prose-instructed reviewer agents.** That gap is where test discipline degrades silently overnight. The first six findings (P-01 through P-06) are all blocking — the night should not start until they're closed.

**Report path:** `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/reviews/2026-05-19-plan-redteam-tests.md`
