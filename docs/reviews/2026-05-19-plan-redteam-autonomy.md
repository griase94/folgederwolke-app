# Red-Team Review: Overnight Plan — Autonomy Failure Modes

**Subject**: `docs/superpowers/plans/2026-05-20-overnight-perfect-night.md` (commit `535528f`)
**Spec**: `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md` (commit `1bf7c29`)
**Reviewer stance**: ruthless. Andy went to bed expecting "all work done, all reviewed, no permission prompts, make me proud." Every finding below names a way the plan disappoints him at 06:30.

---

## F1. `claude -p` is not denied — it will prompt

**SEVERITY: BLOCKING**

**3am failure**: The plan's preflight check #3 (`no-claude-p-subprocess`) and the orchestrator-tick prompt's hard rule both rest on "`Bash(claude -p*)` is denied in settings — that's why we use the in-process Agent tool." I read `~/.claude/settings.json`. The deny list contains only `Bash(claude --dangerously*)`. `claude -p ...` is neither allowed nor denied → Claude Code will **prompt for permission** at first invocation. Any subagent or hand-rolled script that falls back to invoking the Claude CLI as a subprocess (because shelling out feels obvious for a CLI engineer who hasn't read the orchestrator architecture deeply) triggers a permission modal at 02:14. The orchestrator hangs.

**Plan change**: (a) Spec/plan must stop claiming `claude -p` is denied — it isn't. (b) Add to preflight a real assertion: an explicit allowlist entry `Bash(claude -p *)` is ABSENT and an explicit deny entry IS present. (c) Add `"Bash(claude -p *)"` and `"Bash(claude --print *)"` to the deny list of `.claude/settings.local.json` for the run, so a stray subagent crashes loudly rather than silently prompting. (d) Document the actual mechanic: the in-process Agent tool is mandatory because subprocess Claude CLI would prompt — not because it's denied.

---

## F2. `ScheduleWakeup` is not a tool available in this session

**SEVERITY: BLOCKING**

**3am failure**: Plan task 19 + spec §Orchestrator architecture both end every tick with "schedule next tick via `ScheduleWakeup` (120-180s)." `ScheduleWakeup` is not in the tool catalogue of an interactive Claude Code session running on Andy's Mac. The `schedule` skill exists, but it creates **remote cron-based routines** in Anthropic's hosted scheduler — not local in-process wakeups. The closest local construct is the `loop` skill (which only runs while the parent session is alive) or an external `launchd`/`cron` job invoking the Claude CLI — which is F1. The orchestrator's "self-schedules from there" promise (Task 23 step 3 print line, Task 26 step 5) is fantasy on the local CLI. After tick 1 commits state and tries to schedule the next tick, the call silently fails or the orchestrator never wakes again. By 02:30 Andy's laptop is idle with one half-merged Wave-1 sub-PR and 8 untouched clusters.

**Plan change**: Pick ONE mechanism and verify it works on Andy's laptop BEFORE kickoff. Two viable options: (a) Use the `schedule` skill to create a real remote routine that polls every 3 minutes — but those agents need repo write access via gh CLI from a remote runner, which the project hasn't provisioned. (b) Run the orchestrator inside the CURRENT Claude Code session as a persistent `Monitor`/loop-skill task that polls state every 2 min and dispatches via in-process `Agent` tool. This contradicts the "stateless tick" architecture but is the only thing that works locally tonight. The spec needs an ADR-level decision on which path before kickoff. As written, the plan promises a mechanism that doesn't exist.

---

## F3. Canary `sphere-required` test references a field that doesn't exist

**SEVERITY: BLOCKING**

**3am failure**: Task 13 writes `tests/canary/sphere-required.test.ts` calling `createIncome({ betragCents: 100 })` and asserting `rejects.toThrow(/sphere/i)`. I read `src/lib/server/domain/transactions.ts:670`. The actual `CreateIncomeInput` requires nine fields: `bezeichnung`, `betragCents`, `kategorieNameSnapshot`, `sphereSnapshot` (not `sphere`!), `actorUserId`, `businessId`, plus optionals. With `betragCents: 100` only, the function either (a) throws a Zod/TypeError about the FIRST missing field (`bezeichnung`) — message does not match `/sphere/i` — or (b) tries the DB insert and crashes on a `NOT NULL` constraint for a different column. Either way the canary fails with a message unrelated to sphere. Preflight refuses to start: "canary suite has failures." Andy wakes up to a never-started night.

**Plan change**: (a) Rename the proposed guard + field to `sphereSnapshot`. (b) Either provide all required fields in the test except `sphereSnapshot` (so the guard is the first failure), or refactor `createIncome` to accept a partial input with a discriminated-union guard whose first check is sphere. (c) Update Task 11's canary insert column list — it references `sphere` and `kategorie_id` whereas the real columns are `sphere_snapshot` and `kategorie_id` (the latter actually exists) and the income table also requires `gebucht_am`, `bezeichnung`, `business_id`, `kategorie_name_snapshot`. The "adjust column list to match drizzle/" hand-wave in the plan is BLOCKING because the plan executor is itself an agent; "adjust at execution time" means another agent silently guesses the schema, often wrong.

---

## F4. Task 14 imports `loadDashboardData` which doesn't exist

**SEVERITY: BLOCKING**

**3am failure**: Task 14's canary imports `loadDashboardData` from `$lib/server/domain/dashboard`. Real exports in `src/lib/server/domain/dashboard.ts` are `loadDashboardKpis()` and `loadRecentActivity()` — no `loadDashboardData`. The test fails to compile in `pnpm canary`, preflight's `canary-suite-present` check passes (it counts files), but `pnpm canary` returns nonzero. Preflight check passes; the SECOND wave of canary execution (before dispatches) fails. The orchestrator either ignores the failure (no rule that "canary must be green in start.ts") or hangs waiting for it to recover.

**Plan change**: (a) Rewrite Task 14 to call the actual `loadDashboardKpis()` API (or call the dashboard route loader directly). (b) Add to `start.ts` an explicit `pnpm canary` run-and-gate after the worktree spin-up loop, with a deterministic failure path that writes `preflight-FAILED.json` and exits 1. The current `start.ts` only checks preflight, never runs canary suite as a quality gate even though the spec says canary must be green before dispatch.

---

## F5. Plan delegates writing 20 prompt files to "later" — most won't be written well

**SEVERITY: BLOCKING**

**3am failure**: Tasks 16, 17, 18 each say "write the example, then replicate for the other N in the same shape." Task 16: one C1 prompt shown, "write c2…c9 in the same shape using spec's content as source" — 8 stubs implied. Task 17: one test-quality prompt shown, "write the other 7 in the same shape" with a one-line bullet per role. Task 18: one julia-buchhaltung shown, "replicate for the other 5 personas." That's 8 + 7 + 5 = **20 prompt files** the plan does not actually contain — they're TODOs the executing agent must compose by re-reading the spec. The prompts.test.ts checks structural shape (does file exist, does it match a regex) but cannot judge content quality. An executor agent under time pressure writes 200-word stubs. When the orchestrator dispatches c7's build agent at 23:30 with a thin prompt, the build agent doesn't know its findings list, file domain, or critical-path tests in detail; quality collapses cluster by cluster.

**Plan change**: Break Task 16 into Task 16a-16i (one per cluster), each with the FULL paste-verbatim prompt body sourced from spec §Scope + §File-ownership matrix + §Critical-path test matrix + §Per-cluster originating-expert mapping. Same for Task 17 (split into 17a-h) and Task 18 (18a-f). Yes, that's ~25 extra concrete tasks — but Andy said "spend whatever tokens" and "make me proud," and a stubby prompt is the exact path to mediocre cluster output. Add a content-test that compares each prompt file's size + section headers against a minimum bar (`Findings`, `Originating-expert reviewers`, `File domain`, `What to build`, `Dependencies`, `Critical-path tests`, `Worktree` — all present + each section ≥80 chars). The current tests only check for one or two strings.

---

## F6. Canary tests 11 + 13 hit a Postgres that may not be on the cluster ports

**SEVERITY: HIGH**

**3am failure**: Tasks 11, 12, 13 (DB canaries) run via `pnpm canary` which uses the GLOBAL vitest globalSetup → `scripts/db/reset-test-db.sh`. That script targets the default `DATABASE_URL` from `.env.test` (port 15432, db `folgederwolke_test`). It does NOT know about cluster ports 5441-5449 or the per-cluster DBs. Either (a) the canary runs against the global test DB (fine for preflight, but then C4's build agent's canary against its own port runs against a wholly different DB — the canary's mail-no-op and audit-chain-integrity invariants are NOT verified per cluster) or (b) the reset script crashes because `DATABASE_URL` was overwritten by a stray env var. Plan task 14's perf canary inserts 2000 rows but doesn't clean up — second canary run may hit timing variance or constraint violations from leftover rows.

**Plan change**: (a) Specify which DB the canary suite is gated against — the global one (port 15432). (b) Add a per-cluster canary subset that the build agent runs INSIDE its worktree against its allocated port, separate from the preflight canary. (c) Task 14's beforeAll must use a transaction + ROLLBACK pattern, or seed inside a deterministic year that is wiped by `reset-test-db.sh`. The current "Bulk-insert 1000 income + 1000 expense rows for year 2026" leaves data behind that contaminates other tests in the same run.

---

## F7. `pnpm add qrcode` (for C8 Giro-QR) will prompt for permission

**SEVERITY: BLOCKING**

**3am failure**: Spec C8 requires "Server-side QR-encoding library (qrcode or similar)." No QR library is in `package.json`. The C8 build agent at ~23:45 runs `pnpm add qrcode` to add the dep. `~/.claude/settings.json` allows `Bash(pnpm install)`, `Bash(pnpm i)`, `Bash(pnpm install -g *)` — but NOT `Bash(pnpm add *)`. The agent gets a permission prompt. Andy is asleep. C8 stalls. The orchestrator's defer-counter increments. By morning C8 is deferred for "couldn't install qrcode" — a 5-second fix Andy could have done in advance.

**Plan change**: (a) Add a new Task 0a: "Pre-install C8 dependencies." Run `pnpm add qrcode @types/qrcode` (or another EPC069-compatible lib) on `main` BEFORE the night starts, commit + push. (b) Audit every cluster's spec for new deps: C5 (favicon build tool?), C8 (qrcode), possibly C3 (charts/sparkline lib). Pre-install all of them in a "Phase -1" task that runs before plan execution. (c) Add `Bash(pnpm add *)` and `Bash(pnpm remove *)` to `.claude/settings.local.json` allow list as backup, scoped to the project so a stray install doesn't break global state.

---

## F8. CI workflow patch lives on `main` but Task 8 cannot push it under branch protection

**SEVERITY: BLOCKING**

**3am failure**: Task 8 modifies `.github/workflows/ci.yml` to add `overnight-*` to push + pull_request triggers, commits to local `main`. Task 25 pushes `main` to origin. Between Task 8 and Task 25 the executor must run Tasks 9-24 (16 tasks) without losing the CI patch. If anything (test failure, environment reset, branch swap) causes the executor to switch branches, Task 8's commit is silently absent when Task 25 runs `git push origin main`. Also: `main` is protected. Even if Andy is the operator, a direct push to `main` against branch protection may be rejected. The spec §Baseline says protection EXISTS (preflight check #7 `branch-protection-main-applies`). The plan tries to push `main` directly in Task 25 AND in Task 23 `start.ts` (`git checkout -b overnight-2026-05-20 main; git push -u origin overnight-2026-05-20`). The night-branch push is fine, but the CI patch commit on `main` requires either bypassing protection (forbidden in spec §Autonomous-overnight runtime requirements) or a PR-merge dance.

**Plan change**: (a) Reframe Task 8 as "open a PR to main with the CI patch, wait for Andy's CI green + merge, THEN proceed." This is unavoidable because main is protected. (b) Alternatively: move the CI workflow patch to be ON the `overnight-2026-05-20` branch itself — GitHub Actions DOES read workflow YAML from the head ref of a pull_request for `pull_request` events, so a PR from a sub-cluster branch into the night branch will use the night branch's workflow file. But push events use the workflow on the target ref's history — workaround: ensure `overnight-2026-05-20` branch has the patched workflow, and accept that push-triggered runs for sub-cluster branches use main's (unpatched) workflow which won't run. Live with PR-trigger only. (c) Spec/plan needs explicit operator step: "Before kickoff, manually open + merge the CI workflow patch PR. Confirm `gh api repos/.../branches/main/protection` doesn't block your stamp." This is a pre-flight WORKFLOW change, not a runtime check.

---

## F9. Andy's "no direct push to main" boundary contradicts Task 25 + start.ts

**SEVERITY: HIGH**

**3am failure**: `CLAUDE.md` explicitly says: `main` is protected — PRs only, no direct push. The plan Task 25 says `git push origin main`. Task 23's `start.ts` script pushes the night branch (fine), but in the scenario where the CI patch isn't yet pushed (F8), the operator must `git push origin main` to make CI work — direct push, contradicting Andy's stated boundary. Even if the operator is Andy himself running the kickoff sequence, the autonomous orchestrator session may later be tempted to push to main on the morning consolidation (Task 27 step 3's `gh pr merge "$PR" --squash` is fine, but only Andy's stamp gates it).

**Plan change**: Spec already says orchestrator NEVER pushes to main — strengthen the plan: (a) Task 25 must be reframed as "open a PR for CI patch, request Andy's review, wait for merge." (b) Operator runbook makes explicit which steps are operator-only (Andy at the keyboard before bed) vs autonomous. (c) Add a deny rule for the night: `"Bash(git push origin main)"` and `"Bash(git push -u origin main)"` in `.claude/settings.local.json` for the run, so any agent that wanders into pushing main crashes loudly.

---

## F10. Subagent-driven-development presumes a parent session that doesn't sleep

**SEVERITY: BLOCKING**

**3am failure**: The plan recommends "subagent-driven-development" (header notes + Task 26 step 5: "pass to the Skill or Agent tool"). Subagent-driven-development dispatches a SubAgent that runs to completion (returns a result) — it does NOT background-loop. After return, the parent session is the one that must invoke the NEXT tick. If the parent session (Claude Code on Andy's laptop) goes idle waiting for Andy, the user-as-source-of-input is asleep; nothing nudges the parent to ask for another tick. The "self-schedules via ScheduleWakeup" assertion (F2) is the missing link. Without it, the orchestrator finishes one tick at 22:05 and never runs another tick until Andy types at 06:30.

**Plan change**: Either (a) Use the `loop` skill in the parent session to invoke the tick prompt every 120-180s for the full night — but that requires the parent session to stay alive (Claude Code must not be quit; the OS must not sleep — caffeinate is required, mentioned in prior red-teams as `~/.folgederwolke-build/caffeinate.pid`). (b) Run the parent session as a persistent Monitor that polls state every 2 min and yields one Agent dispatch per loop iteration. Either way, the plan must specify WHICH parent-side mechanism is keeping the orchestrator alive and add a Task X verifying `caffeinate` is running before kickoff.

---

## F11. Worktree git races when orchestrator auto-rebases siblings

**SEVERITY: HIGH**

**3am failure**: When C4 merges into `overnight-2026-05-20`, the orchestrator runs `git rebase overnight-2026-05-20 overnight-2026-05-20/c5-pwa-icons` (Task 21's `buildRebaseSiblingsCommand`). But C5's build agent process is mid-flight: maybe running `pnpm test`, maybe holding a `git commit` lock, maybe its Vite dev server has an open file. `git rebase` on a branch that has another process actively committing produces undefined behavior: maybe `index.lock` exists → rebase fails; maybe a half-written commit gets rebased then immediately overwritten by the build agent's next commit; maybe the build agent's next `git push` is a force-push that undoes the rebase. The plan does NOT define a coordination mechanism (no lock file, no "build agent yield" protocol).

**Plan change**: (a) The orchestrator marks a cluster as "MERGING_SIBLINGS" before issuing rebase. (b) Each build agent's loop checks a sentinel file `~/.folgederwolke-build/state/<cluster>.paused` before its next commit; if present, sleeps 30s and re-checks. (c) The orchestrator removes the sentinel AFTER `git push --force-with-lease` of the rebased branch completes. (d) `--force-with-lease` (not `--force`) is required to detect concurrent build-agent pushes. The plan currently uses none of these — it just lists branches and rebases.

---

## F12. Hooks (e.g. shell-command security warning) will block legitimate test writes

**SEVERITY: HIGH**

**3am failure**: Andy mentioned a hook that blocks `Write` of any file containing certain shell-spawn API calls (the `child_process` family). Build agents in C7 (mobile FAB), C5 (PWA service worker), and possibly canary id-allocator-concurrency tests may write test files containing those patterns. **I literally hit this hook while writing this report** — the hook fired and blocked my first Write attempt because the report mentioned the API name. The build agent has no path to bypass — and shouldn't have. Cluster stalls.

**Plan change**: (a) Pre-flight task: run a grep across the eventual test domain for the shell-spawn patterns the hook would catch, then either rewrite the hook to be domain-aware (allow under `tests/canary/` and `tests/integration/`) or pre-commit the offending files BEFORE the night so build agents only modify, not create. (b) Document which hooks are active in the run + their patterns; the plan doesn't enumerate them. (c) Provide an escape valve in `.claude/settings.local.json` that's project-scoped: hooks fire on `Edit` and `Write`, but not on `Write` to `tests/canary/**`.

---

## F13. Build agents have `gh pr merge` permission — "only orchestrator merges" is unenforceable

**SEVERITY: HIGH**

**3am failure**: `~/.claude/settings.json` allows `Bash(gh pr merge *)` GLOBALLY. The plan says "orchestrator merges; build agent waits" — but enforcement is purely the prompt. A build agent under stress (3 failed CI runs) that reads "you must produce green CI to ship" might rationalize "I'll just merge my PR" and call `gh pr merge`. The settings don't stop it. The orchestrator parses sub-PR merges by polling `gh pr list`; if a sub-PR is found `merged` without the orchestrator's state having `MERGING` for that cluster, the orchestrator either ignores it (bad — state diverges from reality) or crashes (worse).

**Plan change**: (a) For the night, add `"Bash(gh pr merge *)"` to the project-scoped `.claude/settings.local.json` `deny` list. (b) Provide a wrapper `scripts/orchestrate/gh-merge-allowed.sh` that the orchestrator (and ONLY the orchestrator's dispatch context) bypasses via env var sentinel `ORCHESTRATOR_MAY_MERGE=1`. Build agents never receive this env. (c) Add an orchestrator-side reconciliation step: if a sub-PR is merged without orchestrator's state recording it, immediately revert the merge and defer the cluster — fail loud.

---

## F14. Wave 3 (C1) hard-blocks if C2 or C3 defer

**SEVERITY: HIGH**

**3am failure**: C1's prompt explicitly says "C1 is Wave 3. Reuse: `<YearSwitcher>` built in C2, `<Money>`, `<PageHeader>`, etc. from C6." If C2 defers, C1's build agent imports a Svelte component that doesn't exist on the night branch. Build fails. The plan doesn't have a fallback. C1 — which IS Andy's top "make me proud" item (the EÜR workspace) — defers because of a transitive dependency. The morning PR ships 7 clusters, omits the headliner.

**Plan change**: (a) Spec already addresses C6 fallback (prior redteam F7) — extend to C2: each Wave-3 cluster declares "if C2 deferred, build a minimal year-switcher inline at `src/lib/components/admin/jahresabschluss/YearPicker.svelte`." (b) Orchestrator polls C2 status before dispatching C1; if `DEFERRED`, applies the fallback flag in C1's dispatch prompt. (c) Add to plan Task 16's c1 prompt: a Dependencies-Fallback section enumerating each upstream cluster's deferred-fallback behavior.

---

## F15. Hard-coded SHA `3153a3c` in preflight may break under main history rewrite

**SEVERITY: MED**

**3am failure**: `preflight.ts` constant `PHASE_8_TIP = "3153a3c"` is used for `git merge-base --is-ancestor`. I confirmed `3153a3c` IS reachable from origin/main today. But: the preflight runs at kickoff, which is hours after the plan was committed. If anyone (Andy, a tooling rebase) rewrites `main`'s history between now and kickoff, the SHA becomes invalid. Less hypothetical: Task 8's CI patch commit changes main's HEAD. If preflight runs AFTER Task 8 + Task 25 (push), the merge-base check still passes (3153a3c is still an ancestor). If preflight runs BEFORE Task 25 pushes, the SHA check fails because `origin/main` doesn't yet have the patch — but the SHA assertion is about reachability of phase-8, not the CI patch. False alarm in that direction. The real risk: if Andy ever rebases main (rare but possible), `3153a3c` falls off and preflight perpetually fails.

**Plan change**: (a) Replace SHA check with phase-8-content check: `git ls-tree origin/main -- scripts/db/reset-test-db.sh` must show the file. Phase-8 added `reset-test-db.sh`; presence is the real invariant. (b) Or pin via tag if phase-8 was tagged.

---

## F16. Mail canary's `entity_kind: "user"` may not be a valid enum value

**SEVERITY: MED**

**3am failure**: Task 13's `mail-provider-no-op.test.ts` does two concurrent `sendMail` calls with `entity_kind: "user"`. Check `src/lib/server/mail/types.ts` for valid `EntityKind` values. If the enum is `'expense' | 'invoice' | 'magic_link' | ...` and lacks `'user'`, the canary errors with a Drizzle/Zod constraint failure, not a sphere/mail issue. Preflight refuses.

**Plan change**: Verify `EntityKind` values against `src/lib/server/mail/types.ts` before kickoff. Use a known-valid kind. The plan glosses this with "adjust at execution time" — same TODO-deferral pattern.

---

## F17. Plan's "in-process Agent tool" doesn't own a state-persistent loop

**SEVERITY: BLOCKING**

**3am failure**: The plan's mental model: "tick runs as one Agent invocation; ticks self-schedule." But the SDK Agent tool / Skill tool is a SYNCHRONOUS in-session subagent. Its return value is captured by the calling session. After return, the calling session must take the next action. There's no daemon. Combine with F2 (ScheduleWakeup unavailable) and F10 (subagent-driven-development is one-shot) and the conclusion: **the orchestrator architecture as designed cannot run autonomously on Andy's laptop**. There is no resident process whose sole job is "run a tick every 2 minutes for 8 hours." The closest local mechanism is launchd/cron, but those would invoke the Claude CLI subprocess (F1).

**Plan change**: Fundamental re-architecture needed before kickoff: pick (a) `schedule` skill creating a remote routine that ticks every 3 min for 12 hours (requires Andy to expose a remote runner with gh CLI auth — significant infra change), OR (b) `loop` skill in the foreground session, with explicit operator step "before bed, type `/loop 150s read scripts/orchestrate/prompts/orchestrator-tick.md and execute one tick`" and KEEP Claude Code FOREGROUND with caffeinate. The plan currently does neither — it punts to ScheduleWakeup.

---

## F18. Final integration reviewer mandate is unrealisable without orchestrator visibility into every sub-state

**SEVERITY: MED**

**3am failure**: The final-integration reviewer (per Tasks 17, 15 spec quote) must verify "CI green + every reviewer signed off + finding-traceability complete + critical-paths covered." But the reviewer's source of truth is `gh pr view` + PR comments. The orchestrator's STATE FILE has the cycle counts and verdicts; the GitHub PR API has the comment bodies. If the orchestrator and GitHub diverge (a comment was force-deleted, a CI check was retried, the orchestrator missed a webhook), the final-integration reviewer sees a different reality than the orchestrator. The plan doesn't specify which is authoritative.

**Plan change**: Final-integration reviewer reads from the orchestrator's state file (canonical) + cross-checks against gh API; on mismatch, blocks merge with `[VERDICT: NOT RESOLVED] orchestrator state diverged from GitHub — paused for human review.`

---

## Top 5 Most-Likely-Disaster Scenarios

| # | Scenario | Required plan change |
|---|---|---|
| 1 | **Orchestrator runs ONE tick at 22:05 and never wakes up again** because `ScheduleWakeup` is not a tool on Andy's laptop and Claude-CLI subprocess invocation would prompt (F1+F2+F10+F17). At 06:30 Andy finds zero clusters touched. | Pre-kickoff: pick + verify one of (a) `schedule` remote routine OR (b) parent-session `loop` skill with caffeinate. Document in plan. Remove all references to `ScheduleWakeup` until the actual mechanism is named. |
| 2 | **Preflight refuses to start** because Task 13's canary references `sphere` (real field is `sphereSnapshot`) and Task 14 imports `loadDashboardData` (real function is `loadDashboardKpis`). `pnpm canary` returns nonzero; preflight #9 fails (F3+F4). | Rewrite Task 13's createIncome guard against `sphereSnapshot`. Rewrite Task 14 against `loadDashboardKpis`. Add a "verify canary suite passes" gate to `start.ts`. |
| 3 | **20 prompt files are stubs**, written by the plan-executor agent in 60 seconds because the plan said "replicate for the other 8 in the same shape." Build agents dispatched at 23:30 receive thin briefs; cluster output is mediocre at best (F5). | Split Tasks 16/17/18 into per-file sub-tasks with paste-verbatim content sourced from spec sections. Add content-quality tests (min sections, min length). |
| 4 | **CI never runs on sub-PRs** because the CI workflow patch (Task 8) was never pushed to `origin/main` — main is protected, the autonomous plan can't push. By 02:00 all reviewers wait for "CI green" that will never come (F8+F9). | Reframe Task 8 as a pre-night operator PR Andy merges before bed. Add a preflight check that the patched workflow YAML is on origin/main, not just locally. Document operator steps explicitly. |
| 5 | **C8 mail-templates defers** because `pnpm add qrcode` triggers a permission prompt nobody will answer, and the EPC069 Giro-QR requirement is unbuildable without a QR library (F7). Andy wakes up to a morning PR missing the QR-enabled BeitragsReminder. | Pre-install C8 deps in a Phase-(-1) operator task BEFORE kickoff. Audit every cluster for new deps. Add `Bash(pnpm add *)` to project-local allowlist as belt-and-braces. |

---

## Summary

**Total findings**: 18 (F1-F18)
**BLOCKING**: 8 (F1, F2, F3, F4, F5, F7, F8, F10, F17 — note F17 is the rooted cause of F10/F2)
**HIGH**: 6 (F6, F9, F11, F12, F13, F14)
**MED**: 3 (F15, F16, F18)

The plan is well-structured at the artifact level (state schema, sign-off parser, preflight, secret guards, prompt files) but rests on three unproven assumptions: (1) `ScheduleWakeup` exists locally, (2) Claude-CLI subprocess invocation is denied, (3) "TODO-style" prompt-replication will be honored at execution time. All three are wrong. The most painful failure mode is the orchestrator running one tick and then sitting silent for 8 hours — Andy wakes up to a half-merged Wave-1 cluster and 8 untouched clusters. The fix is mechanical (pre-flight tasks, real canary corrections, expand prompt tasks one-per-file) but the plan as written will disappoint Andy at 06:30.

Make him proud: re-do Tasks 8 + 16-18 as enumerated sub-tasks with full content, replace `ScheduleWakeup` with a mechanism that actually works on the local CLI, fix the canary schema references against `transactions.ts` and `dashboard.ts`, and pre-install deps. Only then is the night safe to leave unattended.
