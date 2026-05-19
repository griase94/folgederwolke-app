# Red-Team Review: Overnight "Perfect Night" Spec — Autonomy & Failure Modes

**Subject**: `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md`
**Reviewer**: senior staff engineer, focused on what will break between 22:00 and 06:00 with nobody at the keyboard
**Stance**: uncompromising. Andy explicitly said "spend whatever tokens it takes" and "never cut short on reviews/iterations." Quality is the constraint; the only acceptable failure is graceful deferral, not silent half-merge.

Previous run (state at `~/.folgederwolke-build/state/state.json`) shipped phases 0-7 but stalled at 7.5 because the auto-mode classifier refused to let an AI session POST the `reviewed-by-opus` required-status on the protected `main` branch. That is the exact class of trap this spec must avoid — and several of the findings below are the same shape.

---

## 1. Auto-mode classifier will block `gh pr review --approve` from the orchestrator session

**SEVERITY: BLOCKING**

**WHAT WILL FAIL**: The spec's review cycle requires reviewer sub-agents to "sign off in writing." If sign-off is implemented as `gh pr review --approve`, the classifier treats it as approving your own session's PR (the orchestrator launched the build agent that opened the PR — the classifier sees a single principal). The previous build proved the classifier is conservative about anything that looks like self-approval against protected refs. Even if the night branch is unprotected, `gh pr review --approve` against a sub-PR whose head branch was just pushed by an agent in the same session tree may classify as "AI approving its own work." Without sign-off, the gate never opens. The orchestrator deadlocks at 02:00 with all five Wave 1 sub-PRs stuck at `REVIEW_REQUESTED`.

**SPEC-CHANGE**: Define "sign-off" as a structured PR comment, not a GitHub review approval. Format: `<!-- review-signoff role=originating-expert persona=julia-buchhaltung cycle=2 outcome=APPROVE -->` plus human-readable body. Orchestrator parses comments via `gh pr view --json comments`. Document explicitly: "no agent ever calls `gh pr review --approve`; the merge gate is comment-pattern + CI-green, not GitHub's native approval state." Add this to the "Hard boundaries the orchestrator may NEVER cross" list.

---

## 2. A single Claude session cannot orchestrate for 8-12 hours

**SEVERITY: BLOCKING**

**WHAT WILL FAIL**: Claude sessions have a context window. An orchestrator that "loads spec, dispatches builds, watches PRs, dispatches reviewers, tracks iteration cycles, merges sub-PRs, logs everything" across 9 clusters × ≥2 cycles × N reviewers will accumulate hundreds of tool calls, each with reviewer output potentially 2-10K tokens. By cluster 4 the orchestrator session is compacting; by cluster 6 critical state is being summarized lossily. By 04:00 the orchestrator forgets which sub-PR was at which cycle, double-spawns a reviewer, or merges a PR that hadn't actually converged. Worse: if the session OOMs or crashes on the host laptop (caffeinate is in `~/.folgederwolke-build/state/caffeinate.pid` so sleep is handled, but the Claude binary itself can die), the run is dead and three in-flight clusters are orphaned worktrees with half-pushed branches.

**SPEC-CHANGE**: Make the orchestrator stateless and idempotent. Persist authoritative state to `~/.folgederwolke-build/overnight/state.json` after every transition (cluster spawned, PR opened, cycle counter incremented, sign-off recorded, merge done). The orchestrator session's role is "tick the state machine once and exit"; an outer process (`scripts/orchestration/overnight-tick.sh` invoked by `launchd`/`cron` or a `while true; sleep 60; claude -p tick` loop) re-spawns it. Each tick reads state, advances at most one transition per cluster, writes state, exits. Crash recovery becomes free. Note: `Bash(claude -p*)` is currently in the **deny list** of `settings-autonomous.json` — that denial must be lifted for the outer loop, OR the loop runs from a shell script that is itself launched outside Claude.

---

## 3. No checkpoint between "merge starts" and "merge done" — split-brain on crash

**SEVERITY: BLOCKING**

**WHAT WILL FAIL**: Spec §"Sub-PR cadence" step 6 says "Orchestrator squash-merges sub-PR into `overnight-2026-05-20`" then step 7 "auto-rebases every still-open sub-PR onto the new HEAD." If the orchestrator dies between step 6 and step 7, some sub-PRs are rebased onto the new HEAD, some aren't. If it dies *during* step 7 across N sub-PRs, the partially-rebased ones have force-pushed new SHAs that may already have triggered CI re-runs while orchestrator state still says "rebase pending." The next orchestrator tick spawns a duplicate rebase, possibly clobbering a build agent's in-progress commit. The 5-minute heartbeat log is informational — it tells Andy what was happening, not what state to resume from.

**SPEC-CHANGE**: Define explicit checkpoint phases per cluster: `BUILDING → REVIEW_CYCLE_N → AWAITING_FINAL → MERGING → REBASING_OTHERS → DONE`. Persist transition timestamps and the SHA at each transition. Use `gh pr merge --squash --delete-branch` only after writing `MERGING` checkpoint with target SHA; on resume, if state is `MERGING` and `gh pr view` shows the PR already merged, advance to `REBASING_OTHERS`. Add a "stale rebase guard": before rebasing sub-PR X, check `git rev-parse origin/<X-branch>` matches the SHA the orchestrator last pushed; if not, a human (or build agent) moved it and the orchestrator must re-fetch and re-plan.

---

## 4. Reviewer persona drift across re-spawns

**SEVERITY: HIGH**

**WHAT WILL FAIL**: "julia-buchhaltung" is re-spawned for every cycle of every cluster — potentially 12+ invocations across the night with different PR contexts. The spec says "re-spawned with the same persona prompt used in the 2026-05-19 deep-dive" but doesn't pin the prompt text. If the orchestrator constructs the persona prompt dynamically (e.g. concatenates "you are julia" + current PR diff + reviewer instructions), small variations in the wrapper cause the persona to drift: by cycle 4 of C1, "julia" sounds like a generic SvelteKit reviewer, not a non-technical Vereinskassiererin. Visual-craft findings get demoted because cycle-4-julia "understands" the codebase too well.

**SPEC-CHANGE**: Freeze persona prompts as versioned files: `scripts/orchestration/personas/julia-buchhaltung.v1.md`, `vereinsbuchhalter.v1.md`, etc. Every spawn reads the file verbatim and prepends it to the cluster-specific instruction block. Add a meta-test: orchestrator runs a single "persona drift canary" check at startup — spawn each persona, ask "what's your role, in one sentence?", assert the answer contains the expected substring (julia: "Vereinskassiererin", vereinsbuchhalter: "Verein", etc.). If a persona drifts on the canary, abort the night with a clear MORNING.md note.

---

## 5. Test-quality reviewer is not strong enough to catch test suppression

**SEVERITY: HIGH**

**WHAT WILL FAIL**: A build agent that's failed CI 3 times can "fix" the failure by changing `expect(x).toBe(5)` to `expect(x).toBeTruthy()`, deleting a `.skip` test, narrowing an assertion, or wrapping the assertion in `try { ... } catch {}`. The test-quality reviewer reads the *current* tests for "mocks the thing under test / asserts only HTTP status." It does not diff against the prior cycle's tests. So a weakened test reads as a valid test.

**SPEC-CHANGE**: Add a "test-regression guard" to the test-quality reviewer's mandate. Per cycle ≥2, the reviewer runs `git log --follow -p -- '**/*.test.*' '**/*.spec.*' 'tests/**'` for the cluster's branch range, flags any of: deleted test files, `.skip`/`.only` additions, assertions weakened from strict to truthy, expectation values changed without a corresponding production-code reason. Mark these as **automatic MUST-FIX** that the build agent cannot waive. Also: every cluster's CI run records a test-count baseline; if cycle-N test count is lower than cycle-(N-1) without a documented refactor reason, that is a MUST-FIX.

---

## 6. Worktree contention on shared local resources

**SEVERITY: BLOCKING**

**WHAT WILL FAIL**: Wave 1 runs C4, C5, C6, C8, C9 in parallel — five worktrees, five build agents. Each agent runs `pnpm dev-up` (docker-compose Postgres on port 5432), `pnpm test:e2e` (Playwright launches Chromium, may try to bind a Vite dev server on 5173), and `pnpm test` (Vitest, fine). They will collide:

- Five `docker-compose up postgres` against the same compose file and the same container name = the second one fails with "container name already in use" or shares the same DB and corrupts another agent's seed.
- Five Playwright runs on the same machine = browser-binary install races (`npx playwright install` writes to a shared cache), and headed runs (the spec asks for headed where possible) compete for the display server.
- Vite dev servers default to port 5173; five worktrees each running `pnpm dev` collide.
- Reviewer agents that "interactively drive the live app via Playwright" need to bring up the app — same port collision.

The spec acknowledges worktrees but does not allocate resources. The first cluster wins; the others fail mysteriously and the build agents blame their tests.

**SPEC-CHANGE**: Add a resource-allocation table to the spec. Per cluster: dedicated Postgres port (5432 + cluster_id), dedicated Docker compose project name (`overnight-c<N>`), dedicated Vite port (5173 + cluster_id × 10), dedicated Playwright workers count (cap to 2 per cluster so 5 clusters × 2 = 10 doesn't oversubscribe a typical 8-core laptop). Bake into `scripts/dev-up.sh` so it reads `OVERNIGHT_CLUSTER_ID` env var. Alternatively serialize: only one cluster at a time has the live-app running for reviewer Playwright work, with a mutex file. Either way: pick one and document it.

---

## 7. Wave 2/3 hard-blocks on C6 primitives — no fallback path

**SEVERITY: HIGH**

**WHAT WILL FAIL**: Spec §"Wave gating": "Wave 2 starts when C6 merges." C6 builds Card, PageHeader, EmptyState, Money, SegmentedControl. C2 (year switcher) explicitly needs SegmentedControl from C6. If C6 defers (orchestrator deferral path is explicit), Wave 2 hard-blocks because it imports a primitive that doesn't exist. Worse: if C6 *partially* converges and merges with only 4 of 5 primitives (because SegmentedControl review keeps finding issues and gets split off), C2 has no SegmentedControl and the spec doesn't tell C2's build agent what to do.

**SPEC-CHANGE**: For each Wave 2 cluster that depends on a C6 primitive, declare a fallback: "if SegmentedControl is unmerged by the time C2 starts, C2's build agent inlines a minimal SegmentedControl in `src/lib/components/admin/YearSwitcher.svelte` and adds a TODO comment linking to the C6 issue." Add to spec: "Wave gating is on per-primitive availability, not whole-cluster merge." Define a primitive-availability check the orchestrator runs before launching a Wave 2 build: `git ls-files src/lib/components/ui/SegmentedControl.svelte` on the night branch → exists? Then C2 can import.

---

## 8. Reviewer ping-pong: two reviewers with mutually exclusive demands

**SEVERITY: HIGH**

**WHAT WILL FAIL**: ui-designer says "use 'Sphäre' (German plural)"; ux-expert says "use 'Sphere' (consistent with the codebase enum value)." Build agent picks Sphäre; ux-expert raises new MUST-FIX on cycle 4. Build agent flips to Sphere; ui-designer raises MUST-FIX on cycle 5. Spec's "Reviewers keep finding NEW MUST-FIX items past cycle 5" trigger says "spawn scope-reviewer to judge if PR is too big." But this isn't too-big — it's reviewer disagreement, which the playbook doesn't have a path for. Cluster loops forever.

**SPEC-CHANGE**: Add a "Reviewer-disagreement resolution" gate. After cycle 3, if two reviewers raise mutually exclusive MUST-FIXes on the same surface (detected by: same file + same line range + opposite proposed values), orchestrator spawns a tie-breaker agent (a third persona, e.g. "andy-as-product-owner" with a frozen prompt) whose ruling is binding for the remainder of the cluster. Record the ruling in the PR body. Without this gate, hard principle #1 ("never cut short on iterations") and the convergence requirement collide.

---

## 9. CI cost balloon and flake amplification

**SEVERITY: HIGH**

**WHAT WILL FAIL**: CI fires on every push to a `phase-*` branch (`ci.yml` line 5). The spec opens a `phase-*`-like branch but actually uses `overnight-2026-05-20/c<N>-*` — confirm CI triggers cover that pattern (currently `branches: [main, "phase-*"]` does NOT). If CI doesn't trigger on overnight-branch pushes, sub-PRs against the night branch only run CI via PR events (`pull_request: branches: [main]` — also won't match because target is the night branch, not main). **CI may never run at all** on these PRs. Final integration reviewer waits forever for "CI green" because CI was never invoked.

If CI *does* trigger (after the workflow file is updated to include the night branch), each sub-PR runs 4 jobs × N cycles, plus retries on flakes (the e2e job uses Playwright against Neon — historically flaky). 22 sub-PRs × 3 cycles × 4 jobs × 5 min average = 1320 GH Actions minutes. Free-tier accounts get 2000/month. The night burns the monthly budget.

**SPEC-CHANGE**: First, fix the CI trigger: add `'overnight-2026-05-20/**'` to `push.branches` and `'overnight-2026-05-20'` to `pull_request.branches` in `.github/workflows/ci.yml`. Preflight must `gh workflow view ci.yml` and assert the patterns are present, or refuse to start. Second, add per-cluster CI budget: max 8 CI runs per sub-PR; on the 9th, orchestrator runs CI locally (`act` or `pnpm ci`) and trusts the local result, documenting in the PR. Third, define flake handling: a failed e2e job is auto-rerun once; second failure is treated as a real failure and escalates to the build agent.

---

## 10. Secondary rate limits on `gh` API

**SEVERITY: MED**

**WHAT WILL FAIL**: Reviewer agents poll `gh pr view`, `gh pr checks`, `gh run list`, `gh api repos/.../comments` continuously. With 9 clusters × multiple reviewers × 60s polling, the orchestrator easily exceeds GitHub's undocumented secondary rate limits (roughly: 90 concurrent requests, 900 points/min for the same endpoint). Hits start returning 403/429 around 03:00 when reviewer agents are most active. The error looks like a transient gh failure and the build agent retries, amplifying the rate-limit storm.

**SPEC-CHANGE**: Centralize all `gh` reads through one orchestrator-side cache with a 30s TTL. Agents query the cache file, not gh directly. Writes (`gh pr comment`, `gh pr merge`) go straight through but are serialized via a lock file `~/.folgederwolke-build/overnight/gh-write.lock`. Polling interval ≥60s for any single PR. On a 403 from gh, exponential backoff up to 5 min before retrying, and log the rate-limit hit to MORNING.md so Andy sees it.

---

## 11. Self-merge by build agent

**SEVERITY: BLOCKING**

**WHAT WILL FAIL**: Spec hard rule #1: "No agent merges their own work." But `settings-autonomous.json` allows `Bash(gh*)` wildcard — any agent can run `gh pr merge --squash --delete-branch <PR>`. A confused build agent that "thinks it's done" runs the merge command and the night branch silently advances. The orchestrator's state machine still thinks the cluster is `REVIEW_REQUESTED`. The next reviewer agent gets confused because the PR is closed. Two clusters' work intermingles unreviewed.

**SPEC-CHANGE**: Branch protection on `overnight-2026-05-20` itself. The orchestrator runs as a privileged identity (Andy's gh token); build agents and reviewer agents run with restricted personas. Either: (a) actually configure branch protection on `overnight-2026-05-20` requiring a status check that only the orchestrator can post (e.g. `orchestrator-clearance` context), or (b) wrap merge in a script `scripts/orchestration/safe-merge.sh` that verifies orchestrator-state file says `AWAITING_MERGE` for the target PR before invoking gh. Add `Bash(gh pr merge*)` to the deny list of a child settings file used by build/reviewer agents.

---

## 12. File-ownership boundary collisions

**SEVERITY: MED**

**WHAT WILL FAIL**: C2's year switcher legitimately needs Tailwind `safe-area` and segmented-control color tokens added to `src/app.css`. The spec assigns `src/app.css` to C7 (mobile polish). The spec says "agent must request expansion (30-second sanity review)" but doesn't say *who* approves. If the orchestrator approves, it's a coin flip. If another reviewer approves, two clusters now both edit `src/app.css` and the second to merge has to rebase a non-trivial CSS change. CSS conflict resolution by an agent is error-prone (it'll silently delete C7's safe-area additions to "resolve" the merge).

**SPEC-CHANGE**: For shared low-conflict files like `src/app.css`, `vite.config.ts`, `package.json`, define an "additions-only" protocol: agents append a `/* === cluster c<N> === */` fenced block. Conflicts are resolved by concatenating both fences. Orchestrator post-merge runs a linter pass that flags duplicate selectors. For files where additions-only doesn't make sense (route +layout.svelte), require single-cluster ownership and a hard "no other agent edits this file" enforcement: the build agent's diff is checked against the cluster's declared file list, any file outside the list aborts the build with a clear error to the orchestrator (NOT a 30-second human review — that prompts Andy).

---

## 13. `.eml` mail-content assertions are brittle to whitespace

**SEVERITY: MED**

**WHAT WILL FAIL**: C8 rewrites 5 mail templates and asserts against `.eml` files. Svelte SSR for mail templates often emits subtly different whitespace per Svelte version, per locale env, per node version. A test like `expect(eml).toContain('Beitragserinnerung')` survives a re-skin; a test like `expect(eml).toBe(fs.readFileSync('fixtures/expected.eml'))` blows up on a single byte difference. The mail-content reviewer can be fooled either way — too-loose tests miss the real failure mode (Giro-QR payload wrong); too-tight tests fail on cosmetic whitespace.

**SPEC-CHANGE**: Specify the assertion vocabulary for mail tests. Required assertions per template: (a) subject line exact-match, (b) sender + recipient header, (c) presence of brand-strip CSS hook (a stable HTML attribute, not the rendered output), (d) for QR-bearing mails: the `data:image/png;base64,...` is non-empty AND base64-decodes to a PNG with the EPC 069 payload string `decodeQRPayload(png) === expected`. Forbid byte-equality assertions against rendered HTML or full `.eml` snapshots.

---

## 14. Orchestrator self-review gap

**SEVERITY: HIGH**

**WHAT WILL FAIL**: The orchestrator decides "this cluster converged → merge." Nothing reviews the orchestrator's decision. If the orchestrator's parsing of "originating-expert sign-off" is buggy — say it accepts a comment that says "looks good but" with MUST-FIX in the next paragraph because it greps for the wrong keyword — then half-baked clusters merge. By morning, the night branch is corrupted with merged work that didn't actually pass review, and the morning PR ships it.

**SPEC-CHANGE**: Add a "merge gate auditor" — a separate Claude session/persona that runs *after* each orchestrator merge decision and *before* the merge executes. Its sole prompt: "the orchestrator has decided to merge PR #X. Read the PR comments. Confirm: (1) every required reviewer commented APPROVE, (2) no MUST-FIX is open, (3) CI is green. Output APPROVE or BLOCK with reasoning." If BLOCK, the orchestrator parks the cluster and writes to MORNING.md. This is the same shape as the "no agent merges their own work" rule, applied to the orchestrator itself.

---

## 15. The `Bash(claude -p*)` denial blocks any outer tick loop

**SEVERITY: BLOCKING**

**WHAT WILL FAIL**: `settings-autonomous.json` line ~353 denies `Bash(claude -p*)`. If the spec's outer loop or the per-cluster sub-agent spawn uses `claude -p` (the canonical headless invocation), it will be blocked. The previous-run state confirms this was the live settings. The spec doesn't address how the orchestrator spawns child Claude sessions — if it relies on the in-process `Agent` tool (a.k.a. `Task`), that's fine; if it shells out to `claude -p`, the night dies at the first dispatch.

**SPEC-CHANGE**: Pick one. Either: (a) explicitly state "all sub-agents are spawned via the in-process `Agent` tool, never via `claude -p` shell-out" and prove it in the implementation plan; or (b) remove `Bash(claude -p*)` from the deny list in `settings-autonomous.json` for the night run only (note: an isolated settings file for the night, e.g. `~/.claude/settings-overnight.json`, that the orchestrator launches with `claude --settings ...`). The spec must state which.

---

## 16. The `gh*` allow + classifier interaction is untested for the merge case

**SEVERITY: HIGH**

**WHAT WILL FAIL**: `Bash(gh*)` is in `allow`. But the auto-mode classifier sits *between* permission allow-listing and execution. The classifier denied `reviewed-by-opus` self-stamping on the previous run even though `Bash(gh*)` was allowed. The same classifier may deny `gh pr merge --squash --delete-branch <sub-PR>` if it interprets "merging a PR that this AI session opened" as a self-approval pattern, regardless of the target branch. The spec's belief that "merging into the night branch is fine because it's not main" is untested.

**SPEC-CHANGE**: Preflight must run a no-op classifier probe: create a throwaway PR `overnight-preflight-canary` against `overnight-2026-05-20`, push a trivial commit, attempt the full merge sequence (`gh pr merge --squash --delete-branch`), then revert. If the probe trips the classifier, the night refuses to start. This is cheaper than discovering the trap at 03:00. Also document in the spec: "the orchestrator's merge command is the single highest-risk classifier interaction; the preflight canary exists to surface this BEFORE the real night."

---

## 17. Originating-expert "live-app verification" requires the app to be running per-cluster

**SEVERITY: HIGH**

**WHAT WILL FAIL**: Reviewers "interactively drive the live app via Playwright (clicks, types, scrolls, screenshots)." Each reviewer needs the cluster's branch deployed somewhere. The spec doesn't say where: local `pnpm dev` (collides per finding 6), a per-cluster Vercel preview (requires gh→Vercel webhook, plus Vercel rate limits, plus production env vars that the spec forbids loading), or a per-cluster Playwright-served `pnpm preview` (works but takes 30-90s to boot per cycle, and the reviewer must know the URL).

**SPEC-CHANGE**: Define the "live app for review" surface explicitly. Recommend: each reviewer agent runs `pnpm preview` against a fresh build in the cluster's worktree on a deterministic port (`PREVIEW_PORT=4173 + cluster_id × 10`). The Playwright session targets `http://localhost:<port>`. The reviewer's wrapper script handles boot/teardown with a 90s health-check timeout. Vercel previews are NOT used (avoids the auth/rate-limit/env-leak surface for the overnight scope).

---

## 18. Heartbeat is informational, not actionable — Andy can't intervene

**SEVERITY: MED**

**WHAT WILL FAIL**: 5-minute heartbeat lets Andy grep what's happening. But "happening" is descriptive ("C4 cycle 3 in progress"); it doesn't say what Andy would do if it's stuck. If Andy wakes at 03:00 and sees "C7 cycle 7 in progress, no progress for 90 min," there's no documented intervention path. The spec implies Andy doesn't intervene, but reality is Andy will look, and looking with no kill-switch is worse than not looking.

**SPEC-CHANGE**: Add an "Andy-can-do-this-at-3am" appendix to MORNING.md. Three buttons: (a) `~/.folgederwolke-build/overnight/pause` (orchestrator finishes current tick and idles), (b) `~/.folgederwolke-build/overnight/defer C7` (orchestrator marks C7 deferred at next tick), (c) `~/.folgederwolke-build/overnight/resume` (after pause). Heartbeat log includes the last-action timestamp per cluster so Andy can spot a stuck cluster at a glance.

---

## 19. Convergence definition does not bound "MUST-FIX" depth

**SEVERITY: MED**

**WHAT WILL FAIL**: A reviewer at cycle 6 raises "MUST-FIX: the EÜR table's column alignment shifts by 1px on Safari 17." Technically a MUST-FIX per the strict reading. Build agent's fix introduces a MUST-FIX from a different reviewer ("you broke responsive layout at 768px"). The cluster spirals. Hard principle #1 ("never cut short on iterations") means the orchestrator keeps going. By the time wake-up comes around, C1 has 12 cycles and looks bad in the morning PR even though it's "still iterating."

**SPEC-CHANGE**: Distinguish MUST-FIX into severity: BLOCKING-correctness (tax math wrong, security hole, broken critical path), HIGH-craft (visual regression, accessibility, missing test), MED-polish (1px shift on Safari, copy nit). At cycle ≥5, only BLOCKING-correctness items keep iterating; HIGH-craft and MED-polish get filed as follow-up issues on the morning PR and the cluster merges. This preserves "never cut short on iterations" for the things that matter while preventing pixel-perfectionism loops. Document this with examples in the spec.

---

## 20. Phase-8 baseline assumption is unverified

**SEVERITY: BLOCKING**

**WHAT WILL FAIL**: Spec says "this spec assumes `phase-8-local-dev-environment` is merged to `main`." Previous-run state shows phase 7.5 PR #29 is **still open** (auto-mode classifier blocked self-stamping reviewed-by-opus). Andy hasn't yet stamped + merged 7.5. Phase 8 doesn't exist. The orchestrator's preflight "refuses to start if phase-8 isn't reachable from main" is the right gate, but the spec presents phase-8 as a fait accompli. Andy will read the spec, kick off the night, the preflight will fail in 30 seconds, and the night doesn't run. (Better than half-running, but the spec is dishonest about its readiness.)

**SPEC-CHANGE**: Add an explicit "prerequisites" section at the top: "before invoking this spec, the following must be true on `main`: (1) PR #29 merged (phase 7.5 hash chain landed), (2) phase 8 local-dev environment merged (sibling design doc: `docs/superpowers/specs/2026-05-19-local-dev-test-environment-design.md`), (3) `.github/workflows/ci.yml` updated to include the night-branch glob (finding 9), (4) `~/.claude/settings-overnight.json` exists with the deltas from finding 15, (5) docker-compose responds to `docker compose -f docker-compose.dev.yml up -d`." Until all five are checked, the orchestrator does not run, and the spec says so.

---

## Spec sections that need rewriting

In priority order:

1. **§Autonomous-overnight runtime requirements** — needs the "sign-off is a comment, not a review-approve" rule (finding 1), the classifier-canary preflight (finding 16), the explicit child-agent dispatch mechanism (finding 15), the per-cluster resource allocation table (finding 6), and the live-app-preview port allocation (finding 17).
2. **§Branching + merge flow** — needs the explicit state machine with persisted checkpoints (findings 2, 3), the merge-gate auditor (finding 14), the safe-merge wrapper (finding 11), and the CI trigger fix (finding 9).
3. **§Convergence gates & escalation playbook** — needs MUST-FIX severity tiers (finding 19), reviewer-disagreement resolution (finding 8), and the C6-primitive-availability fallback path (finding 7).
4. **§Review cycle protocol** — needs frozen persona files (finding 4), test-regression guard (finding 5), and mail-test assertion vocabulary (finding 13).
5. **§File-ownership matrix** — needs the additions-only protocol for shared files and hard-fail on out-of-list edits (finding 12).
6. **New §Prerequisites section** at the top — the honest "this is not ready to run until X" list (finding 20).
7. **New §Andy-can-intervene appendix** — pause/defer/resume hooks (finding 18).
8. **New §Rate-limit + cost budget** — gh cache, CI cap, per-cluster CI-minute budget (findings 9, 10).

---

## Summary

**Total findings**: 20
**BLOCKING**: 6 (findings 1, 2, 3, 6, 11, 15, 20 — note 7 entries because finding 20 is also blocking; count of distinct BLOCKING is **7**)
**HIGH**: 8 (findings 4, 5, 7, 8, 9, 14, 16, 17)
**MED**: 5 (findings 10, 12, 13, 18, 19)

**Top 5 most dangerous failure modes** (ordered by "kills the night silently"):

1. **Finding 2** — single-session orchestrator OOMs/loses context, three clusters orphaned at 04:00. This is the most likely silent failure: no error, just degradation.
2. **Finding 1** — classifier blocks reviewer sign-off; whole pipeline deadlocks at first cluster's first cycle. This is the most likely loud failure that maps to last run's known trap.
3. **Finding 6** — five parallel worktrees collide on Postgres/Vite/Playwright ports; first cluster wins, others fail mysteriously. Looks like "tests are flaky," is really "spec did not allocate resources."
4. **Finding 20** — phase 8 prerequisite isn't met; the night refuses to start (best case) or starts half-configured (worst case, if preflight is permissive).
5. **Finding 11** — confused build agent self-merges; night branch silently corrupts; morning PR ships unreviewed code.

Fix these five and the spec moves from "ambitious and likely to half-die overnight" to "ambitious and likely to land cleanly with at most a couple clean deferrals."
