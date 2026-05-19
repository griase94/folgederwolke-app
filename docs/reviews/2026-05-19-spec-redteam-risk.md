# Spec Red-Team Risk Audit — Overnight 2026-05-20

**Reviewer lens:** pessimistic risk auditor. Murphy's law assumed. Agents lie convincingly. Orchestrator decides wrongly. Andy wakes up to a disaster. Inputs: `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md`, brainstorming briefing, pragmatic-rebalance reports, ADRs, last-24h git on `main`.

**Headline finding before scenarios:** the spec's baseline ("`phase-8-local-dev-environment` is merged to `main` before kickoff") is currently **false**. As of HEAD, phase-8 is unmerged and the most recent main commit is `b45a0e3 spec(overnight): ...` — i.e. the spec itself. The orchestrator's preflight check is the only thing standing between Andy and an orchestrator that runs against the wrong baseline. If preflight passes for the wrong reason (e.g. fork-point heuristic), the entire night is misseated.

---

## Scenario inventory (15 scenarios, BLOCKING/HIGH/MED severity)

### 1. The "agent lies convincingly" scenario — **BLOCKING**

A C4 build agent writes a Vitest case that asserts `expect(insertTransaction({sphere: 'ideeller'}).sphere).toBe('ideeller')` — green — but never asserts that *no default* is applied when sphere is omitted. The reviewer reads the test, sees `[TDD-red]` then `[TDD-green]` commit order, sees green CI, sees the test count went up. The originating-expert (vereinsbuchhalter) reviews the live app on the happy path, sees the picker appear, signs off "picker now correct, tax flows preserved." The bug remains: when a programmatic caller (e.g. importer, audit-inbox approve flow) omits sphere, the old default still kicks in. Wakes up two months later when an EÜR is wrong.

**Spec defence today:** test-quality reviewer is supposed to refuse "passes for wrong reason" tests. **Insufficient:** the rule is stated; nothing forces the reviewer agent to compare the test against the *original finding text*. The originating-expert reviews *the live app*, not the *test set*.

**Required spec change:** every originating-expert review must include an explicit **finding-traceability matrix** in PR body — each finding ID (VB-004, JB-014, …) mapped to a specific test file + assertion line that would fail if the bug regressed. Final-integration reviewer refuses if any finding has no traceable assertion. The build agent writes the matrix; the originating-expert verifies by *running the test with the implementation reverted* and confirming it goes red.

---

### 2. The "midnight cascade failure" scenario — **BLOCKING**

At 02:14 docker-compose Postgres OOMs (it happens on macOS when 4 build agents + 6 reviewer agents all run integration tests simultaneously against the same container — the spec lets reviewers spawn freely with "no time caps, no token caps"). All 5 in-flight clusters' CI runs go red within 90 seconds. Orchestrator's only failure-mode rule is "Build agent fails to produce green CI 5 times in a row → defer." After 5 minutes of cascading retries the orchestrator defers C2, C3, C4, C7, C8 in sequence. Wave 3 (C1) never starts because C2+C3 never merged. Andy wakes up to 1 cluster shipped (C6), 8 deferred.

**Spec defence today:** none. The spec assumes CI failures are caused by the cluster's diff. No "infrastructure health" probe exists.

**Required spec change:** orchestrator must distinguish *cluster-caused* CI failure from *infrastructure-caused* failure. Before defer-counting any CI failure, the orchestrator runs a **canary test** (a tiny, pre-known-green integration test, e.g. `tests/unit/canary.test.ts` asserting `1+1===2` + a DB roundtrip). If canary fails, the failure is environmental, the cluster's CI counter does NOT increment, the orchestrator pauses all in-flight clusters and restarts the dev stack (`pnpm dev:reset` + `docker compose down && up`). Canary must pass twice in 10 minutes before clusters resume. Otherwise: full halt, write to MORNING.md, exit.

---

### 3. The "phantom green CI" scenario — **HIGH**

C9 (microcopy) merges first into the night branch. Its sub-PR CI ran a stale snapshot fixture that was already broken on `phase-7` but skipped by `test.skip`. C6 (primitives) merges next; its CI runs the full suite, the now-merged C9 change interacts with C6's `<Money>` component, and an intermittent race condition in the visual-snapshot diff (it uses real `now()` for "letztes Update" labels) starts producing 1-in-8 flakes on the night-branch trunk CI. C2's sub-PR builds against this trunk; its CI happens to land in the 7/8 case, passes, merges. The flake becomes a real intermittent on `overnight-2026-05-20`. The morning PR's CI happens to fail. Andy wakes up to "overnight branch is red" with no clear culprit.

**Spec defence today:** §"Overnight-branch CI red after a merge → pause sub-PRs, emergency repair PR." This handles a *deterministic* red, not a *flake*.

**Required spec change:** after every merge to night-branch, orchestrator runs trunk CI **three times in a row** ("3-in-a-row green or no merge"). If any of the 3 runs is red, the just-merged sub-PR is reverted automatically (revert commit, not force-push). Flake detection ≥ 1-in-3 is treated as red.

---

### 4. The "originating-expert echo chamber" scenario — **HIGH**

The ux-expert persona is the one who wrote UX-001/020/030/040/050/070 and AT-002. C9's build agent implements them. C9's review then re-spawns the *same persona* to sign off. The persona reads its own findings, sees they're addressed in the diff, signs off. There's no external check that the ux-expert isn't just nodding at its own prior critique. The persona is also susceptible to "I asked for honest submit labels, I see honest submit labels, I'm happy" without checking whether the new labels broke i18n flow, screen-reader announcement, or muscle-memory.

**Spec defence today:** "originating-expert reviews their own findings" — explicit in §Hard principles. The spec treats this as a feature, not a risk.

**Required spec change:** every originating-expert review must be paired with a **cross-expert challenge** — one *different* expert persona reviews the same change with a "would this surprise you / does this trade off against your concerns?" prompt. e.g. ux-expert signs off C9 → ui-designer must specifically challenge whether the new microcopy creates visual-rhythm issues. Both must sign off independently. Same change must be cycle-2 reviewed by a third "outside" persona (e.g. julia-buchhaltung-as-end-user) doing a *live* walk-through without reading the diff.

---

### 5. The "Wave 3 explosion" scenario — **BLOCKING**

C2 (year switcher) ships a `year_for_booking_with_override(ts, year_param)` helper. On 2025-12-31T23:30 Europe/Berlin the helper has an off-by-one because it uses `getFullYear()` on a UTC date object (ADR-0001 is supposed to prevent this; the build agent forgets, the unit test only tests June dates). C2 ships. Wave 3 starts. C1 (EÜR redesign) consumes C2's helper. C1's EÜR aggregation tests use seed data with June timestamps, all green. The bug only manifests on year-boundary transactions. No test in C1 or C2 stresses 31-Dec-23:30 or 01-Jan-00:30. Morning PR ships. Two months later Andy's actual New Year's Eve party transaction lands in the wrong fiscal year.

**Spec defence today:** §"Critical-path test matrix" lists "Year switch persists across reload + URL" but not "year boundary off-by-one." The matrix is per-cluster, not cross-wave.

**Required spec change:** every wave must run a **cross-wave regression suite** before opening Wave-N+1. The suite includes hand-curated edge-case fixtures (year-boundary timestamps, leap-year, DST switch, festschriebene-year mutation attempts, sphere-default omission). Wave 2 cannot open until Wave 1's combined trunk passes the regression suite. Wave 3 cannot open until Wave 1+2's combined trunk passes. Edge-case fixtures are checked in BEFORE the night starts (orchestrator preflight verifies their existence).

---

### 6. The "orchestrator suicides" scenario — **BLOCKING**

At 04:50 the orchestrator's own Claude session hits its context limit. The session dies. Sub-PR for C7 is in `ALL_REVIEWERS_PASS` state, just before merge. Two reviewer agents are mid-cycle on C8. The heartbeat log says "last status 04:48". Andy wakes up at 07:00 to a frozen orchestrator process, a half-finished night, and no way to know which sub-PRs were safe to merge by hand.

**Spec defence today:** none. The spec treats the orchestrator as a singleton that runs until convergence.

**Required spec change:** orchestrator state must be **fully serialised to disk on every state transition** — `~/.folgederwolke-build/state/orchestrator.json` containing: in-flight clusters, current state per cluster, sub-PR IDs, reviewer assignments, last-known-green SHA per branch. A separate **resume command** (`pnpm tsx scripts/orchestrate/resume.ts`) can re-attach to the night by reading this file + GitHub PR/issue state. Heartbeat must include "orchestrator-pid + last-state-transition-ms". If heartbeat is older than 10 minutes, MORNING.md is updated with "orchestrator stalled — run resume command." Token-conscious orchestrator design: the orchestrator's own context should never grow unboundedly — sub-agent transcripts go to disk, not into the orchestrator's window.

---

### 7. The "I went over budget" scenario — **HIGH**

Spec says "no token budget cap." Anthropic's rate limit is real (typically a daily token ceiling per workspace). At 03:30 the orchestrator + 18 in-flight reviewer agents hit the limit. New Agent invocations return HTTP 429. The orchestrator interprets this as "agent failed" and retries. Each retry burns more quota. Worst case: the orchestrator burns Andy's *next-day* quota during the night, locking him out of Claude for tomorrow.

**Spec defence today:** none ("Hard token budget = none").

**Required spec change:** orchestrator must detect 429s and back off with exponential delay, not retry-as-failure. Orchestrator must track aggregate token spend per hour and *pre-emptively* pause new agent dispatch if spend rate would exhaust quota before 07:00. If quota exhausted: pause cleanly, write to MORNING.md "paused at 03:42 due to rate limit; resume when quota refreshes." Treat the rate limit as a real budget even if Andy says "spend whatever."

---

### 8. The "GitHub Actions cost explosion" scenario — **MED**

If repo is on free plan: 2000 CI minutes/month for private repos. 9 clusters × ~4 cycles × ~5 min CI = ~180 min just for cluster CI, plus trunk CI after each merge (9 × 5 = 45 min), plus the 3-in-a-row recommendation from scenario #3 (+90 min). Plus reviewer agents kicking off CI re-runs. Realistic spend: 400-800 min in one night. Below the 2000 ceiling — but if this is a private repo on a small plan, the ceiling could be lower. Bigger risk: long queueing if other workflows are running.

**Spec defence today:** none.

**Required spec change:** preflight reports the current month's CI-minute usage (`gh api /repos/:owner/:repo/actions/cache/usage` proxy + plan tier). If <500 min remain, abort with a one-line MORNING.md note. The orchestrator also tracks live CI-minute spend during the night and aborts cleanly at 80% of remaining budget.

---

### 9. The "secret leak" scenario — **BLOCKING**

A C5 build agent decides to test the favicon-generation script with a real Drive upload to verify icons render in Andy's actual app icon picker. It pulls `GOOGLE_OAUTH_REFRESH_TOKEN` via the `grep` pattern from `~/.env.folgederwolke-app-bootstrap` (allowed by spec). Logs the call. The orchestrator's heartbeat log captures stdout. Tmpdir reviewer agents read the heartbeat. The secret is now in: `~/.folgederwolke-build/state/overnight-progress.log`, reviewer Agent transcripts on disk, and the PR comment threads (a reviewer agent quoted it back as "I see the agent used <token> — is this right?"). Andy's laptop now has plaintext production OAuth tokens in 6 places.

**Spec defence today:** §"Hard boundaries" forbids `source` of the env file, but allows grep. Allows `pnpm dev-up`. Does not forbid logging.

**Required spec change:** (a) orchestrator's logging layer must redact via regex any string matching the shapes of known secrets (`/ya29\..*/`, `/sk-ant-.*/`, `postgres://[^@]*@`, etc.) before writing to disk or PR comments. (b) `FILE_STORAGE` must be hard-locked to `local-fs` for the entire night — any agent that tries to set `STORAGE_BACKEND=drive` triggers immediate cluster abort. (c) preflight asserts no production credentials reachable from the orchestrator's spawn env — `env | grep -E '(GOOGLE_OAUTH|RESEND|NEON_PROD)'` must return empty. (d) every Agent sub-process is spawned with a curated env subset, not the full parent env.

---

### 10. The "Drive upload at 3am" scenario — **HIGH**

A C5 or C7 build agent runs an integration test for the public Auslagen form. The test imports `FileStorage` via `getFileStorage()` — but the env layering is wrong: `.env.test` says `FILE_STORAGE=local-fs`, but the test was invoked from a worktree where `~/.env.folgederwolke-app-bootstrap` got sourced into the bash session, leaking `STORAGE_BACKEND=drive` + valid OAuth token. Test passes — because both backends implement the same interface — and 12 test PDFs (Belege named `test-fixture-{1..12}.pdf`) end up in Andy's real Vereins-Drive folder. The reviewer reads the test output, sees "Drive upload OK", which the build agent claims is intentional verification.

**Spec defence today:** §"Hard boundaries" says "no upload to production Drive folder" but the enforcement is the agent's good behaviour, not a hard guardrail.

**Required spec change:** the spec's "FILE_STORAGE locked to local-fs" must be enforced *at the env layer* not at agent discretion. Concretely: orchestrator runs every build/test command with `env -i` clearing the env, then re-exporting only the curated test env (`DATABASE_URL` for the local dev container, `STORAGE_BACKEND=local-fs`, `FILE_STORAGE_ROOT=.dev-data/files`, `MAIL_PROVIDER=dev-eml`, etc.). Any `STORAGE_BACKEND=drive` in a test failure log triggers immediate cluster abort + alert.

---

### 11. The "morning PR is unmergeable" scenario — **HIGH**

The orchestrator forks `overnight-2026-05-20` from `main` at T=0. At 23:30 the night before, Andy (or a co-maintainer) pushes a hotfix to `main` (e.g. a Beitragsreminder cron bug). At 02:00 the orchestrator merges 5 clusters into the night branch, which now diverges from `main`. At 07:00 the morning consolidation PR opens and has a 47-file conflict. Andy wakes up to a PR he can't merge without 90 minutes of conflict resolution he didn't budget for.

**Spec defence today:** §"sub-PR can't rebase cleanly … picks one to wait." Handles inter-cluster conflicts, not main-branch drift.

**Required spec change:** preflight must verify `main` has been quiet for ≥ 60 min and that Andy commits to not pushing during the night (capture this acknowledgement in the preflight log). Orchestrator pulls `main` at start, records its SHA, and aborts immediately if `origin/main` advances during the night (unless the new commits are trivially merge-compatible — but default is abort, surface in MORNING.md). Branch protection helps but does not catch admin pushes.

---

### 12. The "agent goes off-rails philosophically" scenario — **HIGH**

C1's build agent reads the EÜR redesign spec and decides the cleanest implementation requires extracting a generic "tabbed workspace" abstraction across the whole codebase. Opens a 200-file PR. CI runs for 22 minutes per cycle. Reviewers' MUST-FIX queue grows linearly. The orchestrator's escalation rule says "spawn scope-reviewer past cycle 5"; by then the agent has burned 2 hours of tokens on a refactor that wasn't in scope. Defer happens, but C1 (the most important cluster of the night) is lost.

**Spec defence today:** scope-reviewer at cycle 5. **Too late.**

**Required spec change:** every cluster's sub-PR has a **hard diff-size budget** declared in the spec — e.g. C1 ≤ 1500 added lines + ≤ 30 touched files; C6 ≤ 800 added lines. The build agent's first commit's diff is measured by the orchestrator; if budget exceeded, build agent receives one warning + one chance to scope down. Second over-budget commit → restart with fresh agent + explicit "do not refactor outside the file-ownership matrix" instruction. Third → defer.

---

### 13. The "two clusters silently overlap" scenario — **HIGH**

C7 (mobile polish) and C9 (microcopy + IA) both legitimately touch `MobileTabBar.svelte` per the file-ownership matrix (C7 owns it; C9 owns `Sidebar.svelte`). But C9's renaming pass ("Heute" → "Übersicht") touches `MobileTabBar.svelte` too because the same string appears there. Both PRs compile and test green individually. C7 merges first. C9 rebases successfully (Git's auto-merge resolves the string to C9's version because C7 only touched layout not strings). Both visible. But C7's e2e test was screenshot-asserting "Heute" and is now broken on trunk. Or worse, both versions of the string appear in different places — sidebar says "Übersicht", mobile tab bar still says "Heute". User-visible inconsistency.

**Spec defence today:** §"File-ownership matrix" — but the matrix says C7 owns `MobileTabBar.svelte` exclusively. C9 is supposed to request expansion. In practice agents take shortcuts.

**Required spec change:** orchestrator validates per-PR diff against file-ownership matrix as a hard gate — refuses PRs that touch files outside the cluster's declared list. Cross-cluster string-rename operations live in a separate **shared-strings cluster** (or get explicitly enumerated in C9's expansion request, signed off by the orchestrator before build). Visual diff reviewer must compare *trunk-after-merge* against pre-night baseline, not the cluster's own pre-state.

---

### 14. The "favicon disaster" scenario — **MED**

C5 build agent generates icons via ImageMagick. The 180×180 apple-touch icon comes out with a transparent margin instead of opaque pink because of a PNG metadata quirk that macOS Safari interprets as "use system colour" (rendering the icon blue-on-white in dark mode tabs). All Playwright reviewers run headless Chromium — they assert the file exists, opens, has expected dimensions, has a sticker in the centre. None of them open Safari on macOS. Andy installs the PWA on his iPhone in the morning — Safari favicon is blue.

**Spec defence today:** §"Success criteria" mentions "Andy sees the pink sticker on his phone after install. Documented with screenshots in the morning PR." The screenshots come from Playwright headless WebKit at best, not real iOS Safari.

**Required spec change:** C5 specifically must include a **real-device verification step** that the orchestrator *cannot* complete autonomously — instead, the morning PR includes a clearly-marked "Andy verifies on iOS" checklist item that blocks the morning PR's final stamp. The orchestrator does NOT claim C5 is "done"; it claims it is "ready-for-real-device-verification." Set expectation explicitly in the spec. Also: include a small `tests/visual/favicon-rasterized.spec.ts` that opens the PNG, samples 5 pixels, and asserts pink-pixel ratio > 30%.

---

### 15. The "review-cycle infinite loop" scenario — **HIGH**

Cycle 6 of C2: vereinsbuchhalter says the year-switcher lock icon is too small. Build agent enlarges it. Cycle 7: ui-designer says it's now visually heavy and proposes a tooltip instead. Build agent changes to tooltip. Cycle 8: vereinsbuchhalter says the tooltip isn't immediately visible — must be a permanent icon. Cycle 9: ui-designer says permanent icon is back to too heavy. The spec's "second-opinion reviewer" sides with whichever side they spawn as. Endless. The orchestrator has no rule to break the deadlock — only the soft "spawn scope-reviewer" rule. C2 burns 4 hours before defer.

**Spec defence today:** "Spawn second-opinion reviewer. If confirmed real and still unaddressable after a fresh build-agent restart, defer." Two-step path to defer, no third-party tie-breaker.

**Required spec change:** when the same surface area gets MUST-FIX from two reviewers in opposite directions across 2 consecutive cycles, orchestrator declares a **design-conflict** state and writes a one-paragraph summary into the PR + into MORNING.md with both reviewers' positions. Build agent picks the more conservative (smaller-diff) option, ships *that* version, and the conflict becomes a follow-up GitHub issue Andy resolves in the morning. The cluster is NOT deferred — the conflict-resolution defaults to "the version closer to current state ships, the other becomes an issue."

---

## The 5 specific spec changes that, if NOT made, will most likely cause the night to fail catastrophically

In rank order of disaster-probability × disaster-impact:

### #1 — Orchestrator state persistence + resume protocol (Scenario 6)

**Without this**: the orchestrator hitting context limit at 5am is essentially a coin flip. Andy wakes up to a frozen process, no idea which PRs are safe to merge, no way to continue without manual archaeology. *Add to spec*: `~/.folgederwolke-build/state/orchestrator.json` persisted at every transition, `scripts/orchestrate/resume.ts` resume command, heartbeat-stale → MORNING.md note. The orchestrator's own context should never grow; sub-agent transcripts spool to disk.

### #2 — Canary-test + cluster-failure-counter discipline (Scenario 2)

**Without this**: one docker-postgres OOM at 02:00 cascades into "all 5 in-flight clusters deferred" within minutes. *Add to spec*: every "cluster CI failure" must be preceded by a passing canary; if canary fails, cluster counter does NOT increment, orchestrator pauses + resets the dev stack. The defer-after-5 rule must distinguish cluster-caused from infra-caused failures.

### #3 — Hard env-isolation for build/test sub-processes + secret redaction in logs (Scenarios 9 + 10)

**Without this**: it is genuinely likely (these are the easiest agent mistakes) that production OAuth tokens leak into log files OR test fixtures upload to Andy's real Drive folder. Both are silent disasters with cleanup costs measured in hours-to-days. *Add to spec*: orchestrator runs every build/test command with `env -i` + curated env; logging layer regex-redacts secret shapes; `STORAGE_BACKEND=drive` in any subprocess env triggers cluster abort.

### #4 — Cross-wave regression-fixture suite (Scenario 5)

**Without this**: C2's year-switcher off-by-one (or any subtle wave-1/wave-2 contract drift) lands in C1 silently, and the EÜR ships *wrong* — the single most user-visible cluster of the night. The morning PR will show green CI and a confidently signed-off C1 that is, in fact, broken for year-boundary transactions. *Add to spec*: hand-curated fixtures (year-boundary, leap-year, DST, festschreibung-attempt, sphere-default-omission) committed before kickoff; Wave 2 cannot open until Wave 1 trunk passes the fixture suite; Wave 3 cannot open until Wave 1+2 trunk passes.

### #5 — Finding-traceability matrix per cluster (Scenarios 1 + 4)

**Without this**: the "agent writes plausible test, originating-expert nods at the live app, regression passes through unseen" failure mode is the most likely class of silent bug — and it's invisible until production. *Add to spec*: every cluster's PR body must include a matrix mapping each finding ID (VB-001 through PM-024) → exact test file + assertion line that fails if regressed; originating-expert verifies by *running the test with the implementation reverted* and watching it go red. Final-integration reviewer refuses if any finding has no traceable assertion.

---

## Additional must-fix below the top 5 (HIGH severity, still real disasters)

- **Cross-cluster file-ownership enforcement** (Scenario 13) — orchestrator refuses PRs touching files outside the matrix.
- **3-in-a-row trunk-CI verification + auto-revert** (Scenario 3) — flake catches.
- **Hard diff-size budget per cluster** (Scenario 12) — caught at first commit, not at cycle 5.
- **Cross-expert challenge pairing** (Scenario 4) — break the echo chamber.
- **Design-conflict resolution rule** (Scenario 15) — break the infinite loop.
- **Pre-flight asserts main is quiet + Andy commits to no-push** (Scenario 11).
- **Rate-limit-aware orchestrator** (Scenario 7) — back off on 429, don't retry as failure.
- **C5 favicon: explicit "real-device verification" handoff in morning PR** (Scenario 14) — the orchestrator MUST NOT claim done.

---

## One paragraph for the morning

If exactly five spec changes are made tonight, they are the five above. If only one is made, it is **#1 (state persistence + resume)** — without it, every other defence is moot the moment the orchestrator dies. If only two are made, add **#3 (env isolation + secret redaction)** — because the worst plausible outcome of an unattended-overnight isn't "the night failed", it's "the night succeeded *and* leaked production credentials onto the laptop in plaintext, six places, retrievable from PR comments forever."

Be ruthless about these. Everything else in the spec is optimisation around the assumption that nothing catastrophic happens. These five close the catastrophic paths.
