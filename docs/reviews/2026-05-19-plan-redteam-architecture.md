# Red-team review — overnight "Perfect Night" plan, architectural-reality angle

**Date:** 2026-05-19
**Plan under review:** `docs/superpowers/plans/2026-05-20-overnight-perfect-night.md`
**Spec under review:** `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md`
**Settings under review:** `~/.claude/settings-autonomous.json`
**Verdict:** **DEGRADED** — feasible only under a tighter operating model than the plan describes; the "stateless tick + ScheduleWakeup" mental model as written contains at least one architectural illusion and the morning consolidation step needs a wiring change.

---

## TL;DR

The plan's runtime model assumes a property `ScheduleWakeup` does **not** have: that calling it from an in-process sub-agent durably re-arms an autonomous loop independent of Andy's REPL. That is not how Claude Code's scheduler works. Per the official docs, scheduled tasks are **session-scoped**, fire **only while the REPL is running and idle**, and **stop when the session exits**. They also do not catch up missed fires.

Operationally, "Andy goes to bed, ScheduleWakeup carries the run through the night" is the same operating posture as the previous overnight (Phase 0–7.5): a long-lived REPL in a wakeful terminal under `caffeinate -dimsu`. That actually worked for ~13 hours — the prior `conductor.log` proves it. What the plan calls "stateless tick + wakeup" is, mechanically, a polling loop *inside* a long-lived parent session. That is fine, but the plan should be honest about it, and several plan invariants need to be adjusted to match that reality.

Three architectural blockers, ranked:

1. **ScheduleWakeup from a sub-agent does not survive the sub-agent's return** — the cron registry is owned by the host REPL session, not by transient `Agent`-tool turns. Scheduling the next tick "from within the tick agent" is at best redundant (Claude Code's CronCreate runs at the host level), and at worst silently dropped depending on how the in-process Agent surfaces tool calls. The plan's tick prompt (Task 19) builds in this assumption explicitly.
2. **The parent REPL must stay alive for the entire night.** The plan's "Walk away" instruction (Task 26 Step 6) reads as if the night is handed off to a daemon. It is not. If Andy closes the terminal at 11pm, every pending wakeup is gone, every sub-agent that was running ends, and the state file is the only thing left. There is no automatic resume.
3. **The morning consolidation depends on the same fragile session.** The orchestrator opens the night→main PR from the same long-lived session. If the session died at 4am, no PR gets opened and the morning report never gets written.

What needs to change is small but consequential: re-frame the "tick" as a polling iteration within a long-lived host REPL (or move scheduling to Routines / GitHub Actions for durability), and treat morning consolidation as a separately-triggerable command.

---

## Detailed findings

### F-1. ScheduleWakeup is session-scoped, not durable

From Claude Code's documentation (`code.claude.com/docs/en/scheduled-tasks.md`):

> Tasks only fire while Claude Code is running and idle. Closing the terminal or letting the session exit stops them firing.
> Tasks are session-scoped: they live in the current conversation and stop when you start a new one.
> No catch-up for missed fires. If a task's scheduled time passes while Claude is busy on a long-running request, it fires once when Claude becomes idle, not once per missed interval.

The plan's tick prompt (Task 19 in the plan, §Orchestrator architecture step 11 in the spec) tells the tick agent:

> "Call `ScheduleWakeup` with delay 120-180s + same prompt as this tick."

Three problems compound:

- **The tick agent is a sub-agent**, spawned via the in-process `Agent` tool from the REPL host. Sub-agent tool calls execute within the parent's turn. Whether `ScheduleWakeup` invoked here registers a host-session cron entry, errors out, or silently no-ops is **not specified anywhere** and is the worst kind of ambiguity for an unattended overnight. Anthropic's published cron primitive is `CronCreate`, called by the host model. The plan does not say which underlying tool name the sub-agent is meant to invoke.
- **Even if the schedule sticks**, it only fires "between turns" on the host session, while the REPL is idle. If at 02:13 the orchestrator's prior tick is still merging a sub-PR and the host REPL is busy, the 02:15 wakeup is **collapsed**, not queued. Multiple collapsed ticks during a slow merge cycle are not the same as multiple ticks happening — important if you assumed each cluster's state transitions are 1-tick-each.
- **Recurring tasks expire after 7 days** (irrelevant for one night) **and have ±30-minute jitter** (relevant: a "120-180s" delay will not actually be a 120-180s delay; the scheduler adds a deterministic offset of up to half the interval for sub-hourly tasks). The plan's 5-minute heartbeat-log expectation is unrealistic.

### F-2. The orchestrator's "daemon" is just a long-lived REPL

The plan and spec both say "Andy walks away. State persists on disk." The previous overnight's `LAUNCH-MANUAL.md` is more honest:

> "Close the terminal window? **NO** — closing the terminal kills the Claude process. Minimize it or leave it visible."

That is the actual operating model. There is no out-of-process daemon, because:

- `Bash(claude -p*)` is denied (`settings-autonomous.json` line 353).
- `Bash(crontab*)` is denied (line 284).
- `Bash(launchctl load*)`, `launchctl bootstrap*`, `launchctl submit*` are denied (lines 247–251).
- `Bash(nohup*)`, `Bash(disown*)` are denied (lines 286, 287).
- `Bash(at *)` is denied (line 282).

The previous overnight survived because Andy started `caffeinate -dimsu &` (the one launch primitive that *is* permitted, line 179) **and** left the terminal foregrounded with the REPL holding context. That is exactly the operating model this plan implicitly inherits, but does not state.

**Implication for the plan:** the assertion "the orchestrator does NOT loop in-memory; each tick is a fresh agent invocation that reads state from disk" (spec line 318) is technically true at the **sub-agent** boundary, but the **host REPL** is in-memory and long-lived for the whole night. The "stateless" claim is a marketing description of a sub-agent worker pattern, not a property of the system as a whole.

### F-3. Sub-agent lifetime ≠ orchestrator lifetime

The plan dispatches build agents via the in-process `Agent` tool (correct, given `claude -p*` is denied). The implicit lifecycle is:

1. Host turn N → tick sub-agent → reads state → spawns C cluster build agents in parallel via `Agent` tool calls → **awaits all to return** → writes state → schedules next tick → returns.
2. Host idle. Wakeup at N+1 fires → host turn N+1 → same loop.

This means **each tick blocks on its dispatched sub-agents**. A build agent doing a real TDD cycle on a cluster takes hours. With 9 clusters and 2-cycle iterations per cluster, that is potentially 18 long-running sub-agent turns. While the host is in turn N waiting for sub-agents, ScheduleWakeup for N+1 collapses (per F-1). The plan's "120-180s tick interval" only makes sense if ticks are cheap status-poll operations and *all build/review work is fire-and-forget*. The §Orchestrator architecture step 3 in the spec is more honest about this: "spawn its build agent via in-process `Agent` tool." Spawn here means **block on**; Claude Code does not have async sub-agent return.

A non-blocking dispatch would require a `claude -p` subprocess (denied) or external job runner (none configured). Without that, **the orchestrator does not actually have parallelism** — it has a single host session running sub-agents one tick-batch at a time.

### F-4. Each `Agent` call inherits the host's token budget

Sub-agents launched via the `Agent` tool draw against the host session's context budget and consume host-side tool-call quota. The plan budgets nothing for this. The previous overnight's `state.json` reports `estimated_cost_eur: 150` after 13 hours of phase 0–7.5 — at €150 for a single linear phase pipeline, a 9-cluster × 2-cycle × 8-reviewer matrix is materially more expensive and materially more context-pressuring. The host session will hit auto-compaction territory mid-night.

The plan acknowledges this only obliquely ("if the orchestrator's own Claude session ever dies or hits a context limit, Andy [...] re-invokes from disk"). But "Andy re-invokes from disk" requires Andy to be awake; the plan's whole premise is that he is asleep.

### F-5. The morning consolidation is on the same fragile session

Task 22 / spec step 9 has the orchestrator open the night→main PR when all clusters reach a terminal state. That's still inside the same host REPL. If the session crashed at 4am, the morning PR never gets opened, and Andy wakes up to a half-complete night branch with sub-PRs merged but no consolidation.

The plan's Task 27 ("Morning") describes Andy reviewing + stamping the PR manually. That part is fine — but it assumes Task 22 actually fired. There is no fallback ("if no morning PR exists, here is the command that builds it from state").

### F-6. The "tick" prompt's instruction to call ScheduleWakeup is at best redundant

In Claude Code, scheduled tasks are created by the host model via `CronCreate` (sometimes surfaced as `ScheduleWakeup`). The doc explicitly says the scheduler fires the prompt **between turns**, not from within them. If a sub-agent thinks it is "scheduling the next tick" but is actually a child of the host's current turn, two scenarios are possible and neither is documented:

- **Scenario A (likely):** the sub-agent's `ScheduleWakeup` call routes up to the host's cron registry. Then the host *will* fire the next tick when idle. This is the happy path the plan assumes — but I've not seen this verified.
- **Scenario B (also likely):** the sub-agent doesn't have a real `ScheduleWakeup` tool at all and the call errors silently or hallucinates. The host *won't* fire the next tick. The night halts after the first tick.

The plan's prompts test (Task 19 step 1) only asserts that the string `"ScheduleWakeup"` appears in the tick markdown — it doesn't verify the tool resolves at runtime. **A preflight item that calls `ScheduleWakeup` from a probe sub-agent and confirms a wakeup actually fires** is missing. Without it, the very first tick on launch night could be the last one.

### F-7. The previous overnight's success doesn't generalize

The phase 0–7.5 build (`~/.folgederwolke-build/state/conductor.log`) succeeded with a different orchestration shape: a single linear "conductor" inside the host REPL that ran phases sequentially, with each phase's sub-agents returning before the next phase began. The host REPL stayed busy for 13 hours straight, never idle, never relying on ScheduleWakeup.

This new plan is structurally different: 9 parallel clusters, polling-style state machine, multi-cycle iteration. The wakeup loop is the new bit, and it's the part that has the least evidence behind it.

### F-8. Permitted-operation surface looks adequate, with one gap

`settings-autonomous.json` permits the bash, `gh`, `pnpm`, `git worktree`, `caffeinate`, `kill`, `tar`, `psql`, `pg_isready`, `playwright`, `vitest`, `drizzle-kit`, `gitleaks`, and `trufflehog` operations the plan needs. Three things are absent or marginal:

- **No `docker` permission.** The plan's preflight (`docker ps`) and the spec's infra-health check both shell out to `docker`. There is no `Bash(docker*)` allow rule. Either auto-mode lets it through implicitly (depends on classifier behavior, not on this settings file), or the preflight blocks at item 5.
- **No `lsof` permission.** Preflight item 11 ("Port collision sanity: `lsof -i :5441-5449`") will require it.
- **No `psql -c "<query>"` confirmation.** `Bash(psql*)` is permitted in general, but classifier behavior on inline SQL may flag it; worth a preflight probe.

### F-9. The 7-day expiry is a non-issue, but jitter changes the heartbeat math

The doc's 7-day recurring-task expiry is irrelevant for a one-night run. Jitter is not:

- For sub-hourly recurring tasks, the scheduler fires up to **half the interval** late. A 180s tick gets up to 90s of jitter. So "tick every 2-3 minutes" is actually "tick every 2-4.5 minutes." The plan's 5-minute heartbeat ("a one-line status update every 5 minutes," spec line 929) is a *target* not a guarantee.
- One-shot wakeups have ≤90s of slack near round-hour minute marks. Not a problem unless the orchestrator pins ticks to `:00` / `:30`.

---

## What works as designed

To be fair: a lot of the plan is solid.

- **The state file pattern** is correct. Atomic write+rename, idempotent ticks, schema-versioned. Recoverable if Andy intervenes.
- **The sub-PR sign-off comment protocol** (`[REVIEWER: …] [VERDICT: …]`) is well-suited to a polling orchestrator and works around the classifier block on `gh pr review --approve`. Solid.
- **Wave gating + cluster file-ownership matrix** mitigates merge-conflict risk between parallel cluster build agents — a credible answer to the "parallel TDD" problem.
- **Branch-protection bypass for the night branch** (sub-PRs merge into `overnight-2026-05-20` without admin override) is correctly configured: only `main` is protected; the night branch gets no inherited protections.
- **The 12 preflight checks** are the right shape, even if `docker`/`lsof` permissions need verification.
- **TDD machine-verification via `.tdd-red/c<N>.txt`** is a clever way to enforce the "tests first" discipline against an AI build agent.

---

## Proposed alternative architecture

The fix is small. **Stop pretending the runtime is daemon-like and design around the host-REPL constraint explicitly.** Two viable shapes:

### Option A — "Polling host REPL" (closest to current plan, recommended)

Reframe the orchestrator as **one long-lived host turn**, not a sequence of wakeup-fired ticks:

- Andy starts the run with a kickoff prompt (same as today's plan).
- The orchestrator runs as a single in-context loop: read state → advance → save → spawn next batch of sub-agents → **block on their return** → loop.
- **No `ScheduleWakeup` calls at all.** Eliminate the entire wakeup mechanism. The "tick" becomes one iteration of the host's main loop.
- The host's `caffeinate -dimsu` keeps the laptop awake, the terminal stays open, the REPL stays in a single turn for the night.
- Sub-agents are dispatched via `Agent` tool, blocking. State is atomic-saved between iterations as a recovery aid for the **next** night, not for mid-night ticks.

**Tradeoff:** loses the "context resets between ticks" property the plan invented to dodge context-bloat. But the host's context grows whether or not you label it "tick-stateless" — every dispatched sub-agent's prompt + return summary lives in host context. The wakeup-pattern doesn't actually solve this; it just moves the bloat into the host's *cumulative* prompt history because each new tick is itself a long sub-agent.

To genuinely cap host context: have each tick **explicitly summarize state at the end and dispose of detail** — the orchestrator's job is to keep the state JSON as its memory, not the chat history.

### Option B — "GitHub-Actions-driven orchestrator" (more reliable but bigger lift)

Move the tick loop to GitHub Actions:

- One workflow runs every 5 minutes, scheduled via cron in `.github/workflows/overnight-tick.yml`.
- The tick body is a Node script (`scripts/orchestrate/tick.ts`) that reads state from a GitHub-cached artifact, advances, and commits state back.
- Sub-agent dispatch happens by **invoking a separate Claude Code agent via the Claude API** (NOT the in-process `Agent` tool — different mechanism, requires an API key in Actions secrets).
- Andy's laptop can be closed, off, or in another country.

**Tradeoff:** requires implementing a separate API-key-based agent runner; out of scope for one night of plan-execution; sub-agents lose the local-Postgres docker-compose stack the plan depends on (CI services replicate that, but the orchestrator-to-sub-agent shape changes).

### Option C — "Anthropic Routines" (durable cloud scheduler)

The Claude Code docs explicitly recommend [Routines](https://code.claude.com/docs/en/routines) for scheduling that survives independently of any session. Routines run on Anthropic-managed infrastructure. Andy creates one routine, set to fire every 5 minutes, body = "read overnight-2026-05-20.json from the repo and advance one tick." This requires committing state to the repo (or a Drive file the routine can read) instead of `~/.folgederwolke-build/`.

**Tradeoff:** new mechanism Andy hasn't used; doesn't have local-Postgres access; same orchestrator-to-sub-agent issue as Option B.

### Recommendation

**Option A.** It's the smallest change, matches Andy's previous overnight's actual working shape, and makes the plan's assumptions visible instead of hiding them in a "stateless tick" metaphor. Two concrete edits:

1. Replace `ScheduleWakeup` references in `prompts/orchestrator-tick.md` and the spec §Orchestrator architecture with: "after one iteration, do the next iteration in the same turn." Drop Task 19's `ScheduleWakeup` assertion.
2. Add to LAUNCH-MANUAL-style runbook: **"Do NOT close the terminal. Run `caffeinate -dimsu &` before kickoff. If the session dies, paste the resume prompt to restart from disk state."**

Add a preflight item: **probe that ScheduleWakeup actually works from a sub-agent** before relying on it. Even with Option A this is useful for future plans.

---

## Top 3 architectural blockers (final ranking)

1. **ScheduleWakeup-from-sub-agent semantics are unverified.** The plan's runtime depends on a property of the `Agent` tool that is not documented and not tested. Without an explicit preflight probe, the very first tick could be the only tick.
2. **The "walk away" framing is false.** The host REPL must stay open and idle-between-turns for the entire night. The plan and spec should say so, and the runbook should require `caffeinate -dimsu` and an unmolested terminal — the same way the prior overnight did.
3. **The morning consolidation has no fallback path.** If the host session dies mid-night, no night→main PR ever gets opened. Add a manual fallback: `pnpm orchestrate:morning` that reads state and opens the PR regardless of whether the orchestrator is running.

---

## Feasibility verdict

**DEGRADED.** The plan can ship, but only if:

- The wakeup mechanism is replaced with a same-turn loop (Option A) **or** verified to work via a real preflight probe.
- The runbook explicitly states the host REPL must stay alive for the entire night.
- A morning-consolidation-from-state fallback is added.
- `docker` and `lsof` permissions are verified working under `settings-autonomous.json`.

Without those four changes, the plan is **INFEASIBLE for true unattended overnight operation**. The orchestrator would likely complete its first tick, fail to fire a second tick, and Andy would wake up to a single-cluster night branch.

With them, it converges to the same operating posture as the previous phase 0–7.5 build, which is known to work for ~13 hours of continuous orchestration.

---

## Sources

- [Claude Code: Schedule recurring tasks](https://code.claude.com/docs/en/scheduled-tasks.md)
- [GitHub issue #58235 — ScheduleWakeup has no cancellation mechanism](https://github.com/anthropics/claude-code/issues/58235)
- [GitHub issue #51304 — ScheduleWakeup re-enters slash commands](https://github.com/anthropics/claude-code/issues/51304)
- Prior overnight artifacts: `~/.folgederwolke-build/state/state.json`, `~/.folgederwolke-build/state/conductor.log`, `~/.folgederwolke-build/LAUNCH-MANUAL.md`
- `~/.claude/settings-autonomous.json` (deny list lines 282–289, 352–354)
