# Overnight "Perfect Night" — Design Spec

**Goal**: ship 22 P0+P1 items from the 2026-05-19 deep-dive review in one
autonomous overnight, world-class craft on each. Wake-up state in the
morning: one PR against `main` carrying nine merged clusters, every change
test-driven, every cluster reviewed by the original deep-dive expert
that flagged the underlying issue, every reviewer cycle captured in the
PR history.

**Hard principles** (non-negotiable, repeated for emphasis):

1. **Never cut short on reviews or iterations to save tokens.** Spend
   whatever it takes.
2. **Test-driven development is mandatory** for every change. Tests are
   written first, fail first, then implementation follows. The git
   history must prove this.
3. **The originating deep-dive expert reviews their own findings**, both
   the code and a live-app verification. Their plain-English approval
   is captured in the PR.

## Inputs

- Briefing: `docs/reviews/2026-05-19-brainstorming-briefing.md`
- Six deep-dive reports + findings JSONs:
  `docs/reviews/2026-05-19-deepdive-julia-buchhaltung*`,
  `docs/reviews/2026-05-19-deepdive-auslagen*`,
  `docs/reviews/2026-05-19-deepdive-vereinsbuchhalter*`,
  `docs/reviews/2026-05-19-deepdive-ux-expert*`,
  `docs/reviews/2026-05-19-deepdive-ui-designer*`,
  `docs/reviews/2026-05-19-deepdive-pwa-mobile*`
- Logo sources for C5 favicon work:
  `/Users/andygriesbeck/Downloads/drive-download-20260519T203139Z-3-001/Kopie von StickerV2_1.jpg`
  (pink-marble + cloud + lightning sticker — used for large-canvas icons,
  text stripped); the three colored outline variants in the same folder
  for derivative material if needed.

## Baseline

`phase-8-local-dev-environment` is merged to `main` as of `3153a3c`
(PR #40). The orchestrator runs against this baseline. Phase 8 brings:

- **`scripts/dev-up.sh`** — docker-compose Postgres 17.8 + migrations + seed.
- **`scripts/db/reset-test-db.sh`** — drops + recreates `folgederwolke_test`,
  applies all 12 migrations, runs seed (reference data + fixtures), sets
  up `app_runtime` LOGIN with password. ~3-6s.
- **Vitest globalSetup** (`tests/vitest-global-setup.ts`) + **Playwright
  globalSetup** (`tests/playwright-global-setup.ts`) call the reset script
  before any test run. Tests get a known-clean DB.
- **`.env.test`** (committed, no secrets) is the canonical test env:
  - `DATABASE_URL=postgres://app_runtime:app_runtime@localhost:15432/folgederwolke_test`
    — tests connect as **`app_runtime`** (CRUD + INSERT-only on audit_log),
    so missing grants on new tables fail immediately rather than in prod.
  - `STORAGE_BACKEND=local-fs` + `FILE_STORAGE_ROOT=./.dev-data/drive-test`
    — file storage writes land in a wiped directory.
  - `MAIL_PROVIDER=no-op` — outbound mail goes into `sent_mails` table only
    (ADR-0005 idempotency); tests read from there directly. No SMTP, no
    file I/O.
  - Note: `.env.development` uses `MAIL_PROVIDER=dev-eml` for human
    inspection — but tests use `no-op`, not `dev-eml`.
- **Migration 0012** (`0012_default_privileges.sql`) — `ALTER DEFAULT
PRIVILEGES` so future tables auto-get grants for `app_runtime` + `app_export`.
- **`.github/workflows/migrate.yml`** — on push to `main`, runs
  `pnpm tsx scripts/migrate.ts` against Neon production (gated on
  `NEON_MIGRATE_DATABASE_URL` secret). This means the morning consolidation
  PR's merge to `main` will trigger Neon-side migrations automatically.
- **`.github/workflows/ci.yml`** uses `services: postgres:17` for unit + e2e.
  Note: currently triggers on `branches: [main, "phase-*"]` for push, ONLY
  `main` for pull_request — **night-branch sub-PRs need a workflow patch
  before any CI runs** (see §CI workflow patch).
- **`STORAGE_BACKEND` env var** (NOT `FILE_STORAGE`) — `drive` for prod,
  `local-fs` for dev + test.
- **Playwright `fullyParallel: false`** — tests share the seeded state
  within a run. Tests that mutate global state should be wrapped in
  `test.describe.serial()`.
- **`pnpm dev:up`, `pnpm dev:reset`** — package.json shortcuts.

The orchestrator's preflight verifies phase-8 is on `origin/main` via
`git merge-base --is-ancestor 3153a3c origin/main`.

## Scope — 9 clusters, 22 items

### C1 — EÜR redesign (Wave 3, solo)

Findings: VB-001, JB-007, UX-100, UI-002, UI-034.
Originating experts: vereinsbuchhalter, julia-buchhaltung, ux-expert,
ui-designer.

The `/app/jahresabschluss/[year]` page becomes a tabbed workspace:
**Übersicht / Buchungsliste / Spenden / Exports**. Overview tab shows
4-sphere table with YoY column, monthly trend strip, WGB-Freigrenze
status, pre-flight checklist before Festschreibung, prominent
"PDF drucken" + "CSV exportieren" at top. Buchungsliste tab is a
sortable + filterable transactions list scoped to the year. Spenden
tab includes a Bescheinigungs-status column. Exports tab consolidates
the existing ZIP bundle behaviors.

Layout sketches: `docs/reviews/2026-05-19-deepdive-ui-designer.md` §2.1
and `docs/reviews/2026-05-19-deepdive-ux-expert.md` §2.

### C2 — Global year switcher (Wave 2)

Findings: VB-002, JB-001/003/006/011/013, UX-010, UI-009/043.
Originating experts: vereinsbuchhalter, julia-buchhaltung, ux-expert,
ui-designer.

Sticky `<SegmentedControl>` in the topbar. URL convention: `?year=NNNN`
on every list/dashboard route. Persists last-selected in localStorage.
Lock icon on festgeschriebene years. Policy: the year switcher only
filters list/dashboard views; when entering a transaction, the
form's `gebucht_am` is authoritative (matches the existing
`year_for_booking` SQL function).

### C3 — Dashboard cashflow overview (Wave 2)

Findings: VB-003, JB-005, UI-008, UX-330, UX-300.
Originating experts: vereinsbuchhalter, julia-buchhaltung, ui-designer,
ux-expert.

Replace today's 4 identical KPI cards with: 2 large cards
(Einnahmen YTD, Ausgaben YTD) each with 12-month sparkline + LY delta;
4 link chips (Saldo, Offene Rechnungen, Inbox count, Mitglieder count).
Every card + chip links to the corresponding filtered view. Driven by
the year switcher from C2.

### C4 — Sphere + Kategorie tax-correctness fix (Wave 1)

Findings: VB-004, JB-014.
Originating experts: vereinsbuchhalter, julia-buchhaltung.

The form at `/app/transactions/neu` no longer hardcodes
`sphereSnapshot="ideeller"` and `kategorieNameSnapshot="(Unkategorisiert)"`.
Both become required pickers fed by the actual enum / categories.
Smart pre-selection: last-used per project + per kind (income/expense).
Existing rows untouched. EÜR aggregation tests verify the fix downstream.

### C5 — PWA icon + manifest pack + favicon (Wave 1)

Findings: PM-001, PM-002, PM-004, PM-005, PM-006, PM-007, PM-015,
PM-020.
Originating experts: pwa-mobile, ui-designer.

Two-tier favicon strategy:

- **Large-canvas variants** (apple-touch-180.png, pwa-192.png,
  pwa-512.png, maskable-192.png, maskable-512.png) — pink-marble
  sticker without text. Source: `Kopie von StickerV2_1.jpg`.
- **Small-canvas variants** (favicon.svg, favicon-16.png, favicon-32.png,
  favicon.ico) — solid pink background + white cloud + yellow lightning,
  marble removed (illegible at <32px).

Add a `scripts/build-favicons.sh` so the icon set can be regenerated.
Tests assert each file exists at the declared dimensions.

Also in this cluster: manifest `shortcuts` (Audit Inbox / Neue Spende /
EÜR aktuelles Jahr / Auslage einreichen), `share_target` so Android can
share a PDF Beleg INTO the public form, background-sync queue for the
public form POST, install-prompt component now persists dismissal,
`start_url` redirect handling so PWA installers don't strand on
`/sign-in`.

### C6 — Design-system primitives (Wave 1, blocks Wave 2/3)

Findings: UI-005 through UI-014 (selected).
Originating experts: ui-designer, ux-expert.

Build five primitives in `src/lib/components/ui/`:

- `Card.svelte` — radius/shadow/border standard
- `PageHeader.svelte` — eyebrow + H1 + actions slot
- `EmptyState.svelte` — illustration / message / CTA slot
- `Money.svelte` — `tabular-nums`, color-by-sign, locale-aware
- `SegmentedControl.svelte` — needed by C2's year switcher

C6 only ships the primitives. Consumers swap over in Wave 2/3 as part
of their own clusters. Each primitive includes Vitest component tests
(shadow/border classes applied, slot rendering, prop variants) and a
Storybook-less inline example file in the component.

### C7 — Mobile polish (Wave 2)

Findings: PM-003, PM-008, PM-009, PM-010, UX-FAB.
Originating experts: pwa-mobile, ux-expert, ui-designer.

The currently-disabled mobile FAB becomes a real bottom-sheet menu
("Neu" → Neue Ausgabe / Neue Einnahme / Neue Spende / Auslage einreichen).
`MitgliederList`, `RechnungenList`, `TransactionsList` get a card variant
below the `md` breakpoint. Filter chips in `/app/transactions` no longer
overflow the viewport at 390px. Safe-area-inset audit pass on the bottom
tab bar against iPhone 14 Pro emulation.

### C8 — Mail templates re-skin + Giro-QR (Wave 1)

Findings: UI-031, plus all 5 templates that didn't get the MagicLink
brand-strip treatment, plus PM-024 (Giro-QR).
Originating experts: ui-designer, pwa-mobile (QR), vereinsbuchhalter
(Giro field correctness).

Rewrite EingangsMail, ErstattungsMail, RejectionMail, BeitragsReminder,
InvoiceVersendetMail to match MagicLink's brand-strip pattern.

Add EPC 069 Giro-QR codes to BeitragsReminder and InvoiceVersendetMail
so members can scan with their banking app to auto-fill the
SEPA-Lastschrift. Server-side QR-encoding library (qrcode or similar);
the mail body embeds the QR as a `data:image/png` so no external
resources are required.

Mail content tests for C8 take two layers: (a) Svelte component-level
tests render each template directly via `renderMailTemplate("Foo", props)`
and assert on the rendered HTML — fast, deterministic; (b) integration
tests run with `MAIL_PROVIDER=no-op` and assert on `sent_mails` table
rows (subject, template, provider_response). Per phase-8's `.env.test`,
the test mail provider writes to DB only — no SMTP, no `.eml` files.
The `dev-eml` provider exists only for human inspection during dev.

### C9 — Microcopy + IA polish (Wave 1)

Findings: UX-001, UX-020, UX-021, UX-030, UX-040, UX-050, UX-070,
AT-002.
Originating experts: ux-expert, ui-designer, auslagen-tester (AT-002).

Sidebar diet (9 → 5 entries; drop `/app/sheet-resync` from the
navigation, it stays reachable by URL for one-time importer use). Rename
"Heute" → "Übersicht". Honest submit-button labels everywhere
("Mitglied anlegen", "Rechnung speichern", "Spende erfassen" etc.).
Every empty list gets a CTA in its empty state. All date inputs use
`dd.MM.yyyy` formatting + German lang attr — no more `mm/dd/yyyy`
placeholders. Soft-undo toast on every destructive action. AT-002 fix:
public-form layout now passes the project list correctly, so the
project dropdown isn't permanently empty.

## Roles

| Role                                 | Count per cluster                          | Responsibility                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------- |
| Orchestrator (tick model)            | 1 total, stateless per tick                | See §Orchestrator architecture below. Reads checkpoint, advances one step, writes checkpoint, schedules next tick via `ScheduleWakeup`. Survives crashes / context resets via the checkpoint file. Never holds in-memory state across ticks.                                                                       |
| Build agent                          | 1 per cluster                              | TDD-first implementation; opens sub-PR against `overnight-2026-05-20`. **Does NOT have `gh pr merge` permission** — that's the orchestrator's job exclusively.                                                                                                                                                     |
| Generic code reviewer                | 1 per cycle                                | Correctness, patterns, security, TDD discipline (verifies via `git log -p` that tests came first AND that red-commit test bodies are a superset of green-commit's).                                                                                                                                                |
| Originating-expert reviewers         | 1-4 (cluster-dependent)                    | Re-spawned with the same persona prompt used in the 2026-05-19 deep-dive **plus an anchor**: the original finding narrative + findings JSON. **Drives the live app via Playwright using the 5-path walkthrough protocol** (§Walkthrough protocol below). Posts structured sign-off comment with `VERDICT: RESOLVED | PARTIALLY | NOT RESOLVED` header. |
| UX-flow reviewer                     | 1 per UI-touching PR                       | Distinct from visual-diff. Walks the cluster's user-facing flows END-TO-END in headed Playwright with traces saved. Writes the report in Julia-voice (German plain-language friction log). Produces `docs/reviews/overnight-walkthroughs/c<N>-<reviewer>-<cycle>.md`.                                              |
| Visual diff reviewer                 | 1 per UI-touching PR                       | Playwright screenshot diff against pre-change baseline at the device matrix (§Device matrix). Visual-diff threshold + baseline-OS pinned in the spec.                                                                                                                                                              |
| Vereinsmitglied-Native (DE) reviewer | 1 for C8 + C9, optional otherwise          | Native-German microcopy + tone reviewer. Required sign-off for clusters touching user-facing German strings. Refuses cold-but-correct strings; flags Anglicism, awkward phrasing, missing warmth.                                                                                                                  |
| Delight reviewer                     | 1 blocking for C5 + C9, advisory otherwise | Asks the question no other reviewer asks: "would this make a user smile?". Required sign-off for the PWA installation experience + microcopy clusters. Non-blocking elsewhere.                                                                                                                                     |
| Test-quality reviewer                | 1 per PR                                   | Refuses tests that mock the thing under test, assert only HTTP status, or duplicate production logic. Enforces the 3 refusal patterns in §Test-quality refusal patterns. **Also asserts critical-path tests are present.**                                                                                         |
| Critical-path coverage reviewer      | 1 per cluster                              | Reads the §Critical-path test matrix and verifies the cluster covers every critical path it touches. Refuses PRs that touch a critical path without an integration- or e2e-test for it.                                                                                                                            |
| Second-opinion reviewer (challenge)  | 1 every 3rd cycle (cluster-wide)           | Fresh persona spawn with NO memory of prior cycles. Mitigates reviewer-fatigue + echo-chamber. If the second-opinion reviewer raises a finding that prior cycles cleared, that's a flag — re-open prior reviews.                                                                                                   |
| Final integration reviewer           | 1 per cluster (last gate)                  | Verifies CI green, every reviewer thread resolved with a parseable `VERDICT: RESOLVED` line, no MUST-FIX open, every critical path tested, finding-traceability matrix present in PR body.                                                                                                                         |

**Hard rules**:

1. **Only the orchestrator merges sub-PRs.** Build agents do NOT have merge permission (settings + wrapper script enforced).
2. **No reviewer reviews a cluster they were build agent for.**
3. **Sign-off is a structured PR comment**, not `gh pr review --approve` (classifier-blocked). Format: `[REVIEWER: <name>] [VERDICT: RESOLVED|PARTIALLY|NOT RESOLVED] <body>`. Orchestrator parses these.
4. **CI must be 100% green** before final integration review opens.
5. **TDD git-history is machine-verified**: red-commit's test bodies are a strict superset of green-commit's; `.tdd-red/c<N>.txt` is committed at red time, contents must match the test contents in the next green commit.
6. **Every PR body includes a finding-traceability matrix**: each finding ID → exact test file + assertion line that proves it's resolved. Originating expert verifies one entry by reverting the impl and watching the named test go red.
7. **Reviewer fatigue mitigation**: every 3rd cycle on a cluster spawns a "second-opinion" reviewer with no prior-cycle context.

## Orchestrator architecture — stateless tick model

A single Claude session running for 8-12 hours holding cluster state in
its conversation context **does not work** — autonomy + risk red-teams
agreed: context will fill, state will be lossily summarized, and by 4am
the orchestrator forgets which reviewers signed off. Instead:

### Persistent state file

Path: `~/.folgederwolke-build/state/overnight-2026-05-20.json`

Schema (sketch — final shape determined by writing-plans):

```jsonc
{
  "version": 1,
  "started_at": "2026-05-20T22:00:00Z",
  "preflight": { "passed": true, "checks": [...] },
  "wave": 1,
  "clusters": {
    "c1": { "state": "WAITING_WAVE_3", "branch": "...", "sub_pr": null, "cycles": [] },
    "c4": { "state": "REVIEWING", "branch": "overnight-2026-05-20/c4-sphere-bug", "sub_pr": 42, "cycles": [
      { "n": 1, "build_agent": "abc...", "reviewers": [...], "verdicts": {"vereinsbuchhalter": "PARTIALLY", "julia-buchhaltung": "RESOLVED"}, "must_fix_remaining": 2 }
    ]},
    ...
  },
  "infra_health": { "docker_ok": true, "ci_workflow_patched": true, "last_postgres_ping": "..." },
  "log_tail": [ /* last 50 status lines for fast wake-grep */ ]
}
```

### The tick

Every tick the orchestrator agent:

1. Loads state file (single source of truth)
2. **Runs infra health check**: `docker ps` for the dev Postgres, ping
   localhost:5432+offset for each active cluster, check
   `gh auth status`. If unhealthy → log + pause new dispatches + schedule
   the next tick to retry health (does NOT increment cluster defer
   counters; infra failures are categorically separate from cluster
   failures).
3. For each cluster in `WAITING_DISPATCH`: spawn its build agent via
   in-process `Agent` tool (NOT `Bash(claude -p)` — that's blocked).
4. For each cluster in `REVIEWING`: check GitHub for completed reviewer
   PR comments. Parse `[VERDICT: ...]` headers. Update state.
5. If a cluster has all required `VERDICT: RESOLVED` votes + CI green +
   finding-traceability complete → orchestrator merges sub-PR into night
   branch + auto-rebases other open sub-PRs.
6. If a cluster has any `VERDICT: NOT RESOLVED` → spawn build agent for
   another iteration cycle (with all reviewer feedback as input).
7. If second-opinion needed (every 3rd cycle) → spawn fresh reviewer
   with no prior-cycle context.
8. Check wave-gating: if Wave 2 deps merged + Wave 1 fixtures pass,
   transition wave + dispatch Wave 2 clusters.
9. Write state file (atomic — `write tmp + rename`).
10. Append a one-line status to
    `~/.folgederwolke-build/state/overnight-progress.log` (for
    `tail -f` insight at 3am).
11. Call `ScheduleWakeup` with delay 120-180s + same prompt as this
    tick. The orchestrator does NOT loop in-memory; each tick is a
    fresh agent invocation that reads state from disk.

The tick is **idempotent** — running it twice in a row from the same
state produces the same advance + the same next-state. If a tick
crashes mid-write, the prior state is intact (atomic rename) and the
next tick simply retries.

### Resume

If the orchestrator session dies (context reset, network drop, manual
interrupt), Andy can resume by re-invoking the orchestrator prompt — it
reads state from disk and advances. The morning-consolidation step is
only triggered when all clusters are in a terminal state, regardless of
how many tick-sessions executed.

### What the orchestrator NEVER does in-memory

- Hold reviewer feedback across ticks (re-parse from PR comments)
- Hold cycle counts in memory (read from state)
- Loop in a single Claude session waiting for sub-agents to complete
  (each tick checks status + reschedules)
- Spawn sub-agents in fire-and-forget mode without a state hook

### Sign-off protocol (the structured PR-comment pattern)

Every reviewer agent posts a SINGLE PR comment in this exact format:

```
[REVIEWER: <persona-name>] [CYCLE: <n>] [VERDICT: RESOLVED|PARTIALLY|NOT RESOLVED]

## Findings addressed
- <FINDING-ID>: ✅ resolved at <test-file>:<assertion-line> | ❌ still broken
- ...

## What I tried in the live app
<walkthrough log — see §Walkthrough protocol>

## Free-text feedback
<the human-voice review>
```

The orchestrator parses the first line via regex. Required for ALL
reviewer types. `gh pr review --approve` (classifier-blocked) is never
used. Verdict values:

- **RESOLVED** — every claimed finding is genuinely fixed AND tested
- **PARTIALLY** — some findings fixed, others still broken (named in
  body); cluster goes to another iteration
- **NOT RESOLVED** — no progress / regression / something worse

A PR has the "all reviewers approved" state only when every required
reviewer (per the §Per-cluster originating-expert mapping) has posted
a comment with `VERDICT: RESOLVED`.

## Walkthrough protocol (originating-expert + UX-flow reviewer)

Every originating-expert + UX-flow reviewer **drives the live app**.
Headless Playwright is the default; headed Playwright with trace
captures saved for the morning report when feasible.

A reviewer's walkthrough writes a markdown artifact to
`docs/reviews/overnight-walkthroughs/c<N>-<reviewer>-<cycle>.md`. The
file's structure:

```markdown
# Walkthrough — C<N> <cluster> — <reviewer> — cycle <n>

## Setup

- branch: <sha>
- viewport: <desktop | iphone-12 | pixel-5 | ipad-mini>
- preconditions: <db state, login session>

## 5-path walkthrough

### Path 1 — Happy path

1. step
2. step
   …
   Result: ✅ / ❌
   Screenshot: <relative path>

### Path 2 — Wrong-button (clicked the obvious-but-wrong affordance)

…

### Path 3 — Mistyped input (e.g. invalid IBAN, amount with comma vs dot)

…

### Path 4 — Interrupted flow (navigated away mid-form, came back)

…

### Path 5 — Mobile thumb-zone (one-thumb operation on 390x844)

…

## Comparison to original finding

The 2026-05-19 deep-dive raised finding <ID>: "<quoted>".

- Is it resolved? <yes/no/partially>
- Specific evidence: <test file:line, screenshot, video>

## Friction log

- micro-friction: <thing that wasn't broken but didn't feel right>
- delight moment: <thing that felt nice>

## Verdict

[VERDICT: RESOLVED | PARTIALLY | NOT RESOLVED]
```

The 5-path requirement is **mandatory** for every UI-touching cluster
review. Reviewers that produce only a happy-path walkthrough are
rejected by the orchestrator (regex check for all 5 path-N headings).

## Worktree resource allocation

Five parallel build agents each running their own docker-compose
Postgres, Vite dev server, and Playwright browsers would collide on
default ports + DB names. Allocation:

| Cluster | Worktree path                                   | Postgres port | Vite port | DB name            | docker-compose project |
| ------- | ----------------------------------------------- | ------------- | --------- | ------------------ | ---------------------- |
| C1      | `.claude/worktrees/overnight-c1-eur-redesign`   | 5441          | 5181      | `folgederwolke_c1` | `fdw-overnight-c1`     |
| C2      | `.claude/worktrees/overnight-c2-year-switcher`  | 5442          | 5182      | `folgederwolke_c2` | `fdw-overnight-c2`     |
| C3      | `.claude/worktrees/overnight-c3-dashboard`      | 5443          | 5183      | `folgederwolke_c3` | `fdw-overnight-c3`     |
| C4      | `.claude/worktrees/overnight-c4-sphere-bug`     | 5444          | 5184      | `folgederwolke_c4` | `fdw-overnight-c4`     |
| C5      | `.claude/worktrees/overnight-c5-pwa-icons`      | 5445          | 5185      | `folgederwolke_c5` | `fdw-overnight-c5`     |
| C6      | `.claude/worktrees/overnight-c6-primitives`     | 5446          | 5186      | `folgederwolke_c6` | `fdw-overnight-c6`     |
| C7      | `.claude/worktrees/overnight-c7-mobile-polish`  | 5447          | 5187      | `folgederwolke_c7` | `fdw-overnight-c7`     |
| C8      | `.claude/worktrees/overnight-c8-mail-templates` | 5448          | 5188      | `folgederwolke_c8` | `fdw-overnight-c8`     |
| C9      | `.claude/worktrees/overnight-c9-microcopy-ia`   | 5449          | 5189      | `folgederwolke_c9` | `fdw-overnight-c9`     |

Each cluster's build agent receives its allocation in the dispatch
prompt. The `dev-up.sh` invocation is parameterized to honor these.
Build agents are explicitly told NEVER to bind to default ports.

Playwright browsers per cluster don't collide (separate processes,
random ephemeral debugging ports). But test-timeout budgets are
generous because Playwright cold-start on a CI box is ~10s.

## CI workflow patch (preflight required)

The current `.github/workflows/ci.yml` triggers on
`branches: [main, "phase-*"]` for push and only `main` for pull_request.
**Sub-PRs against `overnight-2026-05-20` would not trigger CI** — quality
gates would collapse.

Preflight applies a patch that adds the night branch to both triggers
**before any sub-PR opens**:

```yaml
on:
  push:
    branches: [main, "phase-*", "overnight-*"]
  pull_request:
    branches: [main, "overnight-*"]
```

The patch is committed to `main` as part of preflight, NOT as part of
any cluster. Preflight refuses to start if the commit can't be made
(e.g. `main` is protected and refuses direct push — in which case
preflight surfaces the error so Andy can pre-stage the workflow patch
manually before kickoff).

## Cross-wave regression fixtures (canary suite)

Before Wave 1 dispatches, the orchestrator commits a hand-curated set
of regression fixtures to the overnight branch. These act as the canary
for every cluster: if they go red, infra (not code) is broken. Each
fixture exercises a single critical invariant:

| Fixture                                         | What it asserts                                                                                                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/canary/year-boundary.test.ts`            | Inserting a transaction at `2026-12-31T23:59:59+01:00` (Berlin) → `year_of_buchung = 2026`. Inserting at `2027-01-01T00:00:01+01:00` → 2027. Adjusts for DST.                                                                                 |
| `tests/canary/dst-spring-fall.test.ts`          | Buchungen on 2026-03-29T02:30+02:00 (spring-forward gap) and 2026-10-25T02:30+02:00 (fall-back ambiguity) both resolve to 2026.                                                                                                               |
| `tests/canary/leap-year.test.ts`                | Bescheinigung on 2028-02-29 produces a Bescheinigungs-Nr `B-2028-NNN` and the PDF renders the date.                                                                                                                                           |
| `tests/canary/festschreibung-trigger.test.ts`   | After setting `settings.festgeschrieben_bis = 2025` and inserting a 2025 row, an UPDATE attempt raises SQLSTATE 23514 (check_violation) AT THE DATABASE LEVEL via direct psql connection.                                                     |
| `tests/canary/audit-log-revoke.test.ts`         | A connection logged in as `app_runtime` attempting `UPDATE audit_log SET payload = '{}'::jsonb WHERE chain_seq = 1` raises 42501 (insufficient privilege).                                                                                    |
| `tests/canary/sphere-required.test.ts`          | Calling `createIncome` / `createExpense` with no sphere argument throws a typed error BEFORE the DB INSERT. (Defends C4's bug from regressing.)                                                                                               |
| `tests/canary/audit-chain-integrity.test.ts`    | After inserting 100 audit_log rows in a transaction, `verifyAuditChain()` returns ok=true and head=100, persisted_head=100.                                                                                                                   |
| `tests/canary/id-allocator-concurrency.test.ts` | 20 concurrent calls to allocate an AUS-ID produce 20 unique, gapless IDs.                                                                                                                                                                     |
| `tests/canary/mail-provider-no-op.test.ts`      | With `MAIL_PROVIDER=no-op`, calling `sendMail` writes a row to `sent_mails` with `status='sent'` and no I/O. Two concurrent sends produce two distinct rows. (Replaces the earlier dev-eml-isolation canary now that .env.test uses `no-op`.) |
| `tests/canary/dashboard-1000-rows-perf.test.ts` | Dashboard server-side load with 1000 income + 1000 expense rows in DB completes in < 200ms (median over 5 runs).                                                                                                                              |

The canary suite **must be green** before any cluster dispatches.
Once it's green, infra is verified. During the night, if a cluster's CI
fails AND the canary suite also went red on the same commit, the
failure is categorized as infra (not cluster) and the cluster's
defer-counter does NOT increment — the orchestrator instead pauses,
resets the dev stack, and re-runs the canary before resuming.

## Per-cluster originating-expert mapping

| Cluster           | Reviewers (re-spawned per cycle)                                            | What they specifically check                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 EÜR            | vereinsbuchhalter, julia-buchhaltung, ux-expert, ui-designer                | Tax-correctness of sphere/USt math; Steuerberater-handoff usability; layout craft; YoY sanity                                                                 |
| C2 Year switcher  | vereinsbuchhalter, julia-buchhaltung, ux-expert, ui-designer                | Festschreibung lock-icon correctness; URL persistence; Datum-vs-year-context policy holds                                                                     |
| C3 Dashboard      | vereinsbuchhalter, julia-buchhaltung, ui-designer, ux-expert                | KPI cards link to right filtered views; sparkline math; one-glance "wie geht's uns"                                                                           |
| C4 Sphere bug     | vereinsbuchhalter, julia-buchhaltung                                        | Picker default behavior; existing rows untouched; EÜR downstream correctness                                                                                  |
| C5 PWA + favicon  | pwa-mobile, ui-designer                                                     | Icons render correctly on iOS 17 home screen + Android Chrome + macOS Safari tab; manifest validates; share_target intent works; background sync queue drains |
| C6 Primitives     | ui-designer, ux-expert                                                      | Drop-in compat with existing usage sites; visual snapshot zero-regression; tight props                                                                        |
| C7 Mobile polish  | pwa-mobile, ux-expert, ui-designer                                          | FAB bottom-sheet reachable one-thumb; table-to-card transition snappy; safe-area on notched device                                                            |
| C8 Mail + Giro-QR | ui-designer, pwa-mobile (QR), vereinsbuchhalter (QR Giro field correctness) | All 6 templates render in Gmail/Apple Mail/Outlook web; QR scans cleanly with N26/DKB/Sparkasse apps                                                          |
| C9 Microcopy + IA | ux-expert, ui-designer, auslagen-tester (AT-002)                            | German strings honest; empty-state CTAs; dd.MM.yyyy enforced; AT-002 project list fixed                                                                       |

## Review cycle protocol

Every PR runs **minimum 2 full reviewer cycles**, more if MUST-FIX items
remain after cycle 2. No upper cap. C1 (EÜR) additionally gets a final
"polish pass" by ui-designer + ux-expert after all correctness reviewers
sign off.

Per-PR state machine:

```
DRAFT  →  REVIEW_REQUESTED  →  FEEDBACK_ON_PR  →  ITERATING  ←┐
                                                              │
                                                  RE_REVIEW   │
                                                  REQUESTED ──┤
                                                              │
                                                ┌── CLEAN? ───┘
                                                │
                              ▼
                       ALL_REVIEWERS_PASS
                              │
                              ▼
                   FINAL_INTEGRATION_REVIEW
                              │
                              ▼
                   MERGE_TO_OVERNIGHT_BRANCH
```

## Branching + merge flow

```
main (with phase-8 merged)
  │
  └── overnight-2026-05-20 (long-lived night branch)
        │
        ├── overnight-2026-05-20/c4-sphere-bug        ─┐
        ├── overnight-2026-05-20/c5-pwa-icons           │
        ├── overnight-2026-05-20/c6-primitives          │  Wave 1
        ├── overnight-2026-05-20/c8-mail-templates      │
        ├── overnight-2026-05-20/c9-microcopy-ia       ─┘
        │
        ├── overnight-2026-05-20/c2-year-switcher       ─┐  Wave 2
        ├── overnight-2026-05-20/c7-mobile-polish        │
        ├── overnight-2026-05-20/c3-dashboard           ─┘
        │
        └── overnight-2026-05-20/c1-eur-redesign  ─── Wave 3 (solo)
```

Each build agent works in an **isolated git worktree** at
`.claude/worktrees/overnight-c<N>-<name>`.

**Wave gating**:

- Wave 1 starts at T=0 (after phase-8 reaches main + overnight branch
  created).
- Wave 2 starts when C6 merges.
- Wave 3 starts when C2 + C3 merge.

Orchestrator polls every 60s for wave-completion. **No time caps.** A
cluster runs until it converges (all reviewers approved with no MUST-FIX
findings) or until convergence becomes impossible per the escalation
playbook (see §"Convergence gates" below). Striving for greatness > saving
hours.

**Sub-PR cadence**:

1. Build agent opens sub-PR targeting `overnight-2026-05-20`
2. CI runs (unit + e2e + lint + typecheck + schema-drift + axe-core +
   mail-content + visual snapshots)
3. All reviewers per Section B run their cycles (minimum 2, no max)
4. Originating-expert sign-off captured in PR comment
5. Final integration reviewer opens its review only after every other
   reviewer signed off and CI is fully green
6. Orchestrator squash-merges sub-PR into `overnight-2026-05-20`
7. Orchestrator auto-rebases every still-open sub-PR onto the new HEAD

## File-ownership matrix

The orchestrator enforces. Any agent that wants to touch a file outside
its cluster's declared list must request expansion (30-second sanity
review).

| Cluster           | Declared file domains                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 EÜR            | `src/routes/app/jahresabschluss/**`, `src/lib/components/admin/jahresabschluss/**`, `src/lib/server/eur/**`                                                                                                                                                           |
| C2 Year switcher  | `src/lib/components/admin/Topbar.svelte`, `src/lib/components/admin/YearSwitcher.svelte` (new), `src/routes/app/+layout.{server.ts,svelte}`, `src/lib/domain/year.ts` (new), filter-wiring inside `src/routes/app/transactions/**` and `src/routes/app/rechnungen/**` |
| C3 Dashboard      | `src/routes/app/+page.{svelte,server.ts}`, `src/lib/components/admin/dashboard/**`, `src/lib/server/domain/dashboard.ts`                                                                                                                                              |
| C4 Sphere bug     | `src/routes/app/transactions/neu/**`, `src/lib/server/domain/transactions.ts`                                                                                                                                                                                         |
| C5 PWA icons      | `static/manifest.webmanifest`, `static/icons/**` (new), `src/app.html`, `scripts/build-favicons.sh` (new), `vite.config.ts` (service-worker section only)                                                                                                             |
| C6 Primitives     | `src/lib/components/ui/{Card,PageHeader,EmptyState,Money,SegmentedControl}.svelte` (all new), their colocated tests                                                                                                                                                   |
| C7 Mobile polish  | `src/lib/components/admin/MobileTabBar.svelte`, `src/lib/components/admin/FabBottomSheet.svelte` (new), `src/lib/components/admin/mitglieder/**` (mobile card variant), `src/app.css` (safe-area additions only)                                                      |
| C8 Mail + Giro-QR | `src/lib/server/mail/templates/**`, `src/lib/server/giro-qr.ts` (new), `src/lib/server/mail/*.test.ts`                                                                                                                                                                |
| C9 Microcopy + IA | `src/lib/components/admin/Sidebar.svelte`, `src/routes/app/+page.svelte` (rename only), `src/lib/components/forms/**`, `docs/de-i18n.md` (new), `src/routes/auslage-einreichen/+layout.server.ts` (AT-002 fix)                                                        |

## TDD protocol

Each build agent runs the same 4-step rhythm. Orchestrator verifies
each step via `git log` AND content checks before allowing the next.

1. **Spec → tests (failing).** Tests reflect the spec + originating
   findings. Run. They MUST fail. Commit: `test(c<N>): tests for <issue> [TDD-red]`.
   **At red-commit time, the build agent also writes the exact test
   bodies into `tests/.tdd-red/c<N>-cycle<k>.txt`.** This is a
   tamper-evidence anchor.
2. **Minimal implementation.** Smallest change that makes tests pass.
   Commit: `feat(c<N>): <change> [TDD-green]`.
3. **Refactor.** Improve impl without breaking tests. Optional.
   Commit: `refactor(c<N>): <improvement>`.
4. **Coverage check.** Run test-quality reviewer locally; address
   "passes for wrong reason" findings before opening the PR.

**Machine-verified TDD discipline** (the code reviewer enforces):

- Red commit `[TDD-red]` exists; running its tests at that commit
  produces a non-zero exit code (test failures).
- Green commit `[TDD-green]` exists later in history; the test bodies
  in the green commit are a SUPERSET of the bodies in the
  `tests/.tdd-red/c<N>-cycle<k>.txt` anchor file (no tests removed,
  no assertions weakened).
- Placebo-TDD ("`expect(true).toBe(false)`" in red, real assertions
  only in green) is rejected: the red-commit's test bodies must
  contain at least one assertion that references a symbol from the
  production change being made.

## Test-quality refusal patterns (the test-quality reviewer enforces)

The test-quality reviewer rejects any sub-PR whose tests contain these
patterns:

- **Pattern A — mocking the thing under test.** Any `tests/integration/**`
  or `tests/e2e/**` file that calls `vi.mock(/.+(db|storage|mail)/)` or
  the equivalent. Integration tests by definition exercise the real
  boundary; mocking the boundary turns them into unit tests in disguise.
- **Pattern B — re-implementing production logic in the test.** Test
  files that contain the same algorithm as the production module
  (e.g. `dashboard.test.ts` re-deriving `buildActivityLabel` from
  `src/lib/server/domain/dashboard.ts`). The fix is to import the real
  function and assert on its output, OR to assert on observable side
  effects (the rendered HTML, the persisted row).
- **Pattern C — placebo TDD.** Red-commit test bodies don't match
  green-commit test bodies. Or red-commit test bodies are obviously
  unable to fail (e.g. `expect(true).toBe(false)` placeholder).

## Definition of "integration test" (binding for this overnight)

When the spec says "integration test", it means: a Vitest test that:

- Connects to a REAL Postgres (the docker-compose dev DB started by
  `pnpm dev-up`, on the cluster's allocated port from §Worktree
  resource allocation)
- Runs against the REAL Drizzle ORM (no mocks of `getDb`)
- Uses the REAL `MAIL_PROVIDER=no-op` (the canonical `.env.test`
  provider — writes `sent_mails` row, no I/O). NO mocks of `sendMail`.
- Uses the REAL `STORAGE_BACKEND=local-fs` (no mocks of file storage)
- Asserts on observable side effects (DB row state including
  `sent_mails` rows, file contents in `FILE_STORAGE_ROOT`, HTTP response
  shape) — not on whether a mocked function was called

Anything that mocks one of `getDb` / `sendMail` / file-storage is a
unit test, not an integration test. The critical-path-coverage
reviewer rejects mis-categorized tests.

## Required test categories per cluster

| Kind                                                   | Required for                                  | Asserts                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)                                          | every cluster                                 | Pure logic — year math, sphere derivation, EÜR aggregation, QR encoding                                                                                                                                                                                                   |
| Component (Svelte testing-library)                     | every UI cluster                              | Component renders right thing for given props; emits right events                                                                                                                                                                                                         |
| Integration (see §Definition above)                    | C1, C2, C3, C4, C8                            | End-to-end domain — insert transaction → assert dashboard/EÜR/filter reflects it                                                                                                                                                                                          |
| E2E (Playwright via new global setup)                  | every cluster                                 | Full browser flow through the actual UI                                                                                                                                                                                                                                   |
| Mail content (`renderMailTemplate` + `sent_mails` row) | C8                                            | (a) Component-level: render template directly, assert on HTML (incl. QR-payload `data:image/png` bytes for Beitragsreminder + Rechnungen). (b) Integration: `MAIL_PROVIDER=no-op`, assert on `sent_mails.subject`, `sent_mails.template`, `sent_mails.provider_response`. |
| Mail-client render (HTML preview screenshots)          | C8                                            | All 6 templates rendered as PNG in 6 mock clients (Gmail web light/dark, Apple Mail macOS/iOS, Outlook web/desktop) and diffed against a checked-in baseline                                                                                                              |
| Visual snapshot (Playwright + diff)                    | every UI cluster                              | Diff against pre-change baseline; threshold ≤ 0.1% pixel-difference; baseline OS = ubuntu-24.04 (CI runner image)                                                                                                                                                         |
| Mobile + tablet variants (Playwright device emulation) | C5, C7 + clusters with mobile-visible changes | iPhone 12 + iPhone SE + Pixel 5 + Galaxy Fold + iPad Mini                                                                                                                                                                                                                 |
| Accessibility (axe-core + keyboard-only e2e)           | every UI cluster                              | Zero serious/critical axe findings + keyboard-only navigation succeeds + focus ring visible on every interactive element + modal focus-return works                                                                                                                       |
| Performance (server-side load time)                    | C1, C3                                        | Page server-load + first render with 1000 fixture rows < 200ms (median over 5 runs)                                                                                                                                                                                       |
| Physical-device PWA install                            | C5 (blocking)                                 | pwa-mobile reviewer installs PWA on physical iPhone + Android + macOS; home-screen screenshot captured + attached to PR. Absence = cluster defers.                                                                                                                        |

## Critical-path test matrix

These are the paths whose breakage is most painful to a real user. Every
cluster that touches one of these MUST add or extend the corresponding
test. The critical-path-coverage reviewer enforces.

| Critical path                                                            | Where it lives                                                                                                    | Test kind required                                                                                          | Touched by clusters             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Magic-link sign-in (issue → consume → session → admin shell)             | `src/lib/server/auth/**`, `src/routes/sign-in/**`                                                                 | E2E + integration                                                                                           | (no-touch — regression only)    |
| Public Auslagen form submit (happy path + invalid IBAN + missing fields) | `src/routes/auslage-einreichen/**`, `src/lib/components/forms/AuslagenForm.svelte`                                | E2E covering both successful + each fail-mode                                                               | C9 (AT-002 fix)                 |
| Audit-Inbox approve → create expense                                     | `src/routes/app/inbox/**`, `src/lib/server/domain/auslagen.ts`                                                    | Integration + e2e                                                                                           | C4 (sphere fix indirectly)      |
| Audit-Inbox reject → rejection mail                                      | `src/routes/app/inbox/[ausId]/+page.server.ts`, `src/lib/server/mail/templates/RejectionMail.svelte`              | Integration + `.eml` content                                                                                | C8                              |
| Add transaction → sphere/kategorie picker → EÜR aggregation              | `src/routes/app/transactions/neu/**`, `src/lib/server/eur/**`                                                     | Integration + e2e — assert EÜR shows the new tx                                                             | C4, C1                          |
| Year switch persists across reload + URL                                 | `src/routes/app/+layout.{server.ts,svelte}`, year-switcher component                                              | E2E with hard reload                                                                                        | C2                              |
| Festschreibung lock + DB trigger refuses mutation                        | `drizzle/0010_post_review_hardening.sql` (trigger), `src/routes/app/jahresabschluss/[year]/close/+page.server.ts` | Integration with raw SQL UPDATE attempt asserting 23514 raise                                               | C1, C2                          |
| Bescheinigung PDF generation + §50 EStDV hint + signature line           | `src/lib/server/pdf/templates/bescheinigung-template.ts`                                                          | Unit (golden PDF byte-comparison or text-extract assertion)                                                 | C1                              |
| SEPA pain.001 XML for approved-not-erstattet Auslagen                    | `src/lib/server/sepa/**`                                                                                          | Unit (XML schema-validate generated file)                                                                   | (no-touch — regression only)    |
| Beitragsreminder mail with Giro-QR                                       | `src/lib/server/mail/templates/BeitragsReminder.svelte`, `src/lib/server/giro-qr.ts`                              | Component-render assertion on QR-payload `data:image/png` bytes + integration assertion on `sent_mails` row | C8                              |
| Audit-log hash chain stays valid after each new write                    | `drizzle/0010_post_review_hardening.sql` (chain trigger), `src/lib/server/audit-log/verifier.ts`                  | Integration: insert N rows, verifier returns ok                                                             | every cluster that inserts rows |
| Mobile FAB → bottom-sheet → first action reaches its destination         | `src/lib/components/admin/MobileTabBar.svelte`, FabBottomSheet (new)                                              | E2E on Playwright iPhone-12 emulation                                                                       | C7                              |
| Drive-tolerant Auslagen submit (Drive uploads succeeds, fails, retries)  | `src/lib/server/files/**`, public form action                                                                     | Integration with local-FS storage + simulated Drive failure                                                 | (no-touch — regression only)    |

**Note**: invariants like `audit_log` REVOKE policy, ID-allocator
concurrency, `year_for_booking` DST edges, and `MAIL_PROVIDER=no-op`
correctness are covered by the canary suite (§Cross-wave regression
fixtures) which runs as a regression net before every wave and on every
sub-PR. Individual clusters don't re-test these; they inherit the
canary's coverage and any cluster whose changes break a canary is
auto-failed.

## Finding-traceability matrix (required in every sub-PR body)

Each sub-PR body MUST contain a table mapping every finding from the
2026-05-19 deep-dive that the cluster claims to resolve, to the exact
test file + assertion line that proves it. Without this table the
final integration reviewer rejects the PR.

```markdown
## Finding-traceability matrix

| Finding ID | Title (one-line)            | Proven resolved at                                   | Reverse-revert verified by  |
| ---------- | --------------------------- | ---------------------------------------------------- | --------------------------- |
| VB-001     | EÜR page is a 4-row summary | `tests/e2e/eur-workspace.spec.ts:42` (tab-rendering) | vereinsbuchhalter (cycle 3) |
| VB-001     | EÜR YoY column missing      | `tests/integration/eur-yoy.test.ts:18`               | vereinsbuchhalter (cycle 3) |
| UX-100     | EÜR no project filter       | `tests/e2e/eur-workspace.spec.ts:71`                 | ux-expert (cycle 2)         |
| ...        | ...                         | ...                                                  | ...                         |
```

The "Reverse-revert verified by" column means: that originating expert
checked out the PR locally, ran `git revert <impl-commit>`, re-ran the
named test, and confirmed it goes red. This catches the "tests passed
for the wrong reason" failure mode that the autonomy + risk red-teams
both flagged.

## Secret + production guard (prevents 3am phantom Drive uploads)

Every build agent + reviewer agent subprocess runs with these guards:

1. **`env -i`-style env scrubbing**: subprocesses receive only a
   whitelisted env subset (`PATH`, `HOME`, `NODE_ENV=test` or
   `=development`, `DATABASE_URL=<cluster-local>`,
   `DIRECT_DATABASE_URL=<cluster-local>`, `MAIL_PROVIDER=no-op`,
   `STORAGE_BACKEND=local-fs`, `FILE_STORAGE_ROOT=<per-cluster>`,
   the cluster's port offset). Production envs (Neon production URL,
   Drive OAuth token, real SMTP creds) are NEVER reachable.
2. **Trip-wire env values**: any subprocess that sees
   `STORAGE_BACKEND=drive`, `MAIL_PROVIDER=smtp`, `MAIL_PROVIDER=resend`,
   or a `DATABASE_URL=...neon.tech...` in its env aborts immediately
   with a loud error. This is the last-resort defense against env
   leakage.
3. **Logging redaction layer**: before any log line is written to
   `~/.folgederwolke-build/state/overnight-progress.log` or any PR
   comment, it's passed through a regex redactor that masks values
   matching common secret shapes (`Bearer [A-Za-z0-9_\-]+`,
   `DE\d{20}` IBANs from real members, age-recipient strings,
   `ya29\.` Google OAuth tokens, `glpat-`, `github_pat_`).
4. **No real-mail flag**: every test command sets `MAIL_PROVIDER=no-op`
   explicitly via env, not via `.env` fallback. A typo in `.env`
   shouldn't be the only thing between us and 22 production emails sent
   to real recipients at 3am.

## Device matrix (one place for all reviewers)

| Device      | Viewport | Used by                                        |
| ----------- | -------- | ---------------------------------------------- |
| iPhone 12   | 390×844  | every UI cluster mobile e2e                    |
| iPhone SE   | 375×667  | C7 mobile-polish + C9 microcopy (small-screen) |
| Pixel 5     | 393×851  | every UI cluster mobile e2e                    |
| Galaxy Fold | 280×653  | C7 mobile-polish (worst-case responsive)       |
| iPad Mini   | 768×1024 | C1 EÜR + C3 dashboard (tablet)                 |
| Desktop     | 1440×900 | every UI cluster default                       |

Visual-snapshot baselines are pinned to ubuntu-24.04 + Chromium
v140-stable (matching the CI runner image). Diff threshold ≤ 0.1%
pixel-difference; subpixel antialiasing tolerated via `maxDiffPixelRatio`.

## Quality gates

A sub-PR cannot merge to the overnight branch unless ALL of these hold:

- ✅ All required tests for cluster's kind exist + pass locally
- ✅ Full CI suite green (unit + e2e + lint + typecheck + schema-drift + axe-core + mail-content + visual snapshots + canary suite)
- ✅ Generic code reviewer signed off (`VERDICT: RESOLVED`)
- ✅ Test-quality reviewer signed off (no Pattern-A/B/C violations)
- ✅ Critical-path-coverage reviewer signed off
- ✅ All originating-expert reviewers posted `VERDICT: RESOLVED` PR comments
- ✅ Visual diff reviewer signed off (if UI changes)
- ✅ UX-flow reviewer signed off with 5-path walkthrough markdown attached (if UI changes)
- ✅ Vereinsmitglied-Native reviewer signed off (if German microcopy touched)
- ✅ Delight reviewer signed off (if C5 or C9; advisory otherwise)
- ✅ Finding-traceability matrix in PR body, every row reverse-revert verified by its named expert
- ✅ At least 2 full review cycles completed (more if findings remained, no max)
- ✅ Every 3rd cycle has had a second-opinion review (anti-fatigue)
- ✅ Final integration reviewer signed off
- ✅ Changelog entry written in the PR body for the morning consolidation

## Convergence gates & escalation playbook

Time is NOT a gate. Convergence is. A cluster is "done" when all
reviewers (including the originating-expert + final-integration) sign
off on the same PR head with zero MUST-FIX findings. A cluster only
defers when convergence is genuinely impossible per these gates:

| Trigger                                                                                            | Orchestrator action                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build agent fails to produce green CI 5 times in a row with no net new fixes between attempts      | Restart with a fresh build agent receiving the full reviewer feedback + previous diff. If 3 restarts in a row make zero net progress, defer cluster.                                 |
| Same MUST-FIX finding raised by the same reviewer twice in a row, build agent unable to address it | Spawn a "second-opinion" reviewer (different persona) to confirm the finding is real. If confirmed real and still unaddressable after a fresh build-agent restart, defer cluster.    |
| Reviewers keep finding NEW MUST-FIX items past cycle 5                                             | Spawn scope-reviewer agent to judge if the PR is too big. If yes, split into smaller sub-PRs. If no, just keep iterating — there's just a lot to get right and quality > token cost. |
| Sub-PR can't rebase cleanly after another cluster merges                                           | Build agent attempts. If file-ownership violated, orchestrator picks one cluster to wait, the other proceeds.                                                                        |
| Overnight-branch CI red after a merge                                                              | Pause all sub-PRs. Open emergency repair PR. **Same review cascade — quality stays high even under pressure** (no reduced-quorum shortcuts). Resume sub-PRs once green.              |
| Build agent hits a P0 bug outside cluster scope                                                    | File separate emergency-fix issue. Orchestrator may dispatch side-channel agent. Original cluster pauses if blocked by it.                                                           |
| Cluster legitimately deferred                                                                      | Reverted from overnight branch, filed as labelled GitHub issue with full review history attached as comments. The other 8 clusters still ship.                                       |

**No time caps anywhere.** A cluster runs until convergence. A wave starts when its dependencies merge. The morning consolidation opens when all clusters reach a terminal state (merged or deferred), regardless of wall-clock time.

## Morning consolidation

When all clusters have reached a terminal state (merged or deferred):

1. Orchestrator runs final full-suite CI against `overnight-2026-05-20`
2. Opens **ONE PR** from `overnight-2026-05-20` → `main`, titled
   `overnight 2026-05-20: 22 P0+P1 items, 9 clusters, X review cycles`
3. PR body contains:
   - Cluster status table (Merged ✅ / Deferred 🟡, cycle counts)
   - Reviewer roster (who signed off on what)
   - Before/after gallery (screenshots for every UI cluster)
   - Token + wall-clock summary
   - "What didn't make it" section if any cluster deferred
   - "Surprising findings" — anything an agent discovered we didn't know going in

Andy reviews the morning PR, stamps `reviewed-by-opus`, squash-merges,
tags `overnight-2026-05-20-green`.

## Hard token budget = none

Spend whatever it takes per reviewer/cycle. Token spend is logged for
transparency but is never a gate. Quality wins over cost.

## Autonomous-overnight runtime requirements

The orchestrator runs unattended for 8+ hours. Andy is asleep. Nothing
the orchestrator does may prompt for human permission — every operation
must either be pre-authorized or follow an alternative path that doesn't
prompt.

**Hard boundaries the orchestrator may NEVER cross** (would prompt or get
classifier-blocked, defeating autonomy):

- ❌ Push to `main` (only the morning consolidation PR touches main, and
  it requires Andy's stamp + merge — done after wake-up)
- ❌ Stamp `reviewed-by-opus` on any branch (classifier-blocked; Andy
  does this in the morning)
- ❌ Use `--admin` flags to bypass branch protection
- ❌ Use `--no-verify` to skip hooks
- ❌ Force-push to any branch other than the cluster's own working branch
- ❌ Touch Vercel production envs / GitHub repo settings / Neon production DB
- ❌ Read `~/.env.folgederwolke-app-bootstrap` via `source` (use the
  documented grep pattern instead)
- ❌ Trigger production-affecting workflows
- ❌ Send mail to real addresses (test runs use `MAIL_PROVIDER=no-op`
  per `.env.test` — writes `sent_mails` row only, no I/O; never SMTP)
- ❌ Upload files to the production Drive folder (use
  `STORAGE_BACKEND=local-fs` with per-cluster `FILE_STORAGE_ROOT` for
  tests)

**What the orchestrator IS allowed to do without prompting**:

- ✅ Merge sub-PRs into `overnight-2026-05-20` (the night branch, NOT
  main; no `reviewed-by-opus` requirement)
- ✅ Create + push branches under `overnight-2026-05-20/*`
- ✅ Create + comment on + close GitHub issues
- ✅ Run `pnpm install`, `pnpm test`, `pnpm exec playwright test`,
  `pnpm dev-up`, `pnpm tsx scripts/migrate.ts` (against the local test
  DB, not production)
- ✅ Spawn sub-agents (`Agent` tool) for every reviewer cycle
- ✅ Apply migrations to the docker-compose dev/test Postgres
- ✅ Read `~/.env.folgederwolke-app-bootstrap` via the documented `grep`
  pattern when individual env values are needed
- ✅ Use `gh pr create / gh pr merge --squash --delete-branch / gh pr review`
  against the night branch
- ✅ Use `gh issue create / gh issue comment / gh issue close`

**Preflight checklist** (orchestrator's very first action — fails fast):

1. **phase-8 reachable from main**: `git fetch origin && git merge-base --is-ancestor <phase-8-tip-sha> origin/main`. Refuse to start if false (writes a clear MORNING.md note).
2. **`.claude/settings-autonomous.json` permits required operations**: probe-call each operation type (gh issue create, gh pr create, gh pr merge on a scratch branch, gh api .../statuses on a scratch sha). Any classifier-block surfaces immediately.
3. **`Bash(claude -p*)` denial confirmed** (the previously-known restriction). Orchestrator MUST use the in-process `Agent` tool exclusively for sub-agent dispatch, never `claude -p`. Preflight asserts the orchestrator's dispatch helper uses `Agent` and not subprocess spawning.
4. **CI workflow patch applied**: ensure `.github/workflows/ci.yml` triggers on `overnight-*` branches for both push and pull_request. If not yet patched, commit the patch to `main` as the first orchestrator action.
5. **Docker compose Postgres healthy**: `docker ps` shows the postgres container running, `pg_isready` succeeds. If not, run `pnpm dev-up` and re-check.
6. **gh CLI authenticated**: `gh auth status` succeeds.
7. **Branch protection on main DOES apply** (we want it): orchestrator confirms by checking the API. The night branch is verified to NOT inherit this protection.
8. **Production envs are NOT loaded**: orchestrator's process env must NOT contain `*.neon.tech` in `DATABASE_URL`, must NOT contain a real Drive token, must NOT contain SMTP creds. The trip-wire check rejects the night.
9. **Canary suite committed to overnight branch**: orchestrator's first commit after creating `overnight-2026-05-20` is the cross-wave regression fixtures. Canary tests RUN and PASS before any cluster dispatches.
10. **9 worktrees pre-created**: orchestrator creates `.claude/worktrees/overnight-c<N>-<name>` for each cluster, allocates the port set, writes the per-cluster env files.
11. **Port collision sanity**: `lsof -i :5441-5449` shows nothing else listening. `lsof -i :5181-5189` shows nothing else listening.
12. **Rate-limit headroom check**: `gh api rate_limit` shows ≥ 4000 calls remaining for the next 60 minutes. If lower, orchestrator pauses with a clear MORNING.md note.

If ANY preflight item fails, the orchestrator refuses to start, writes
the full preflight log to `~/.folgederwolke-build/state/preflight-FAILED.json`
and to MORNING.md, and exits cleanly. No half-started night.

**Heartbeat + visibility**: the orchestrator writes a one-line status
update every 5 minutes to `~/.folgederwolke-build/state/overnight-progress.log`
so Andy can wake up at 3am and grep what's happening if curious. The
log is regex-redacted (see §Secret + production guard).

**Failure-mode bias**: when in doubt, the orchestrator chooses the
quality-preserving path over the speed-preserving path. If a cluster
can't converge, it defers (cleanly reverted, filed as issue). It does
NOT half-ship.

**Self-checkpoint**: the state file (§Orchestrator architecture) is the
canonical orchestrator memory. If the orchestrator's own Claude session
ever dies or hits a context limit, Andy (or the next tick triggered by
ScheduleWakeup) re-invokes from disk. Recovery is automatic.

## Out-of-scope (this overnight)

- All findings labeled P2 or P3 in the deep-dive
- Sammelbestätigung (issue #33), Z3 export (#35), pain.001.001.09 (#34),
  Sentry (#36), DSE-v2 (#37), Externe-lit-f alignment (#38) — these stay
  deferred per the pragmatic-rebalance
- Bank CSV import — deferred to a future cluster
- Real Storno UI for festgeschriebene rows — deferred to a future cluster
  (the C1 pre-flight checklist surfaces them but doesn't fix them)
- Recurring transactions — anti-list confirmed
- Web Push + Passkeys — anti-list confirmed

## Success criteria

- Every cluster that converges is in the morning PR. Up to 2 clusters
  may legitimately defer (with full review-history written to a labelled
  issue) without compromising "the night was a success" — the other 7+
  ship at world-class craft.
- Zero P0/P1 originating findings remain open in the deep-dive review
  scope (the deferred ones move to issues but are no longer in the
  "Andy must triage" view).
- Andy's three explicit gaps (EÜR workspace, global year switcher,
  dashboard cashflow overview) are visibly resolved, each reviewed by
  ≥ 3 originating experts who all interacted with the live app.
- The favicon is rendered correctly across iOS home screen, Android home
  screen, macOS Safari tab, and Chrome desktop tab — Andy sees the pink
  sticker on his phone after install. Documented with **physical-device
  screenshots** in the morning PR (the C5 pwa-mobile reviewer's required
  artifacts).
- Every entry in §Critical-path test matrix has a passing integration-
  or e2e-test on the morning branch.
- Every entry in §Cross-wave regression fixtures (canary suite) is
  passing on the morning branch.
- Test count grows by ≥ 100 (the broader test matrix — canary + critical-
  path + per-cluster integration + mail-client renders + a11y + perf —
  produces meaningful coverage growth).
- Every UI-touching sub-PR has at least one Julia-voice walkthrough
  markdown attached (the §Walkthrough protocol artifacts).
- Every cluster sub-PR body has a finding-traceability matrix with
  every row reverse-revert verified by its originating expert.
- Zero secrets / production-data leakage in any log or PR comment
  (the regex redactor's effectiveness is verified by a sample audit
  in the morning report).
- Andy wakes up to: one PR to read, a short morning report, and zero
  permission prompts in his terminal history.

## Next step

Invoke the `writing-plans` skill to turn this design into an executable
implementation plan (the file the orchestrator will read at T=0). The
plan will instantiate concrete agent invocations, named sub-PR titles,
detailed acceptance criteria per cluster, and the orchestrator's
state machine.
