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

This spec assumes `phase-8-local-dev-environment` is merged to `main`
before the orchestrator kicks off. Phase 8 brings:

- `scripts/dev-up.sh` (docker-compose Postgres + migrations + seed in one command)
- Local-FS file storage (`FILE_STORAGE=local-fs`) — no Drive needed in tests
- `MAIL_PROVIDER=dev-eml` — outbound mail written to `.eml` files we can
  grep for content assertions
- `MAIL_PROVIDER=no-op` for tests indifferent to mail
- New Playwright global setup (`tests/playwright-global-setup.ts`) that
  resets the test DB per run
- New Vitest global setup (`tests/vitest-global-setup.ts`)

The orchestrator refuses to start if `phase-8-local-dev-environment`
isn't reachable from `main`.

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

Mail content tests use the new `MAIL_PROVIDER=dev-eml` so assertions
read the actual `.eml` file rather than mocking `sendMail`.

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

| Role                         | Count per cluster         | Responsibility                                                                                                                                          |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestrator                 | 1 total                   | Loads spec, dispatches builds, watches PRs, dispatches reviewers, tracks iteration cycles, merges sub-PRs, logs everything                              |
| Build agent                  | 1                         | TDD-first implementation; opens sub-PR against `overnight-2026-05-20`                                                                                   |
| Generic code reviewer        | 1 per cycle               | Correctness, patterns, security, TDD discipline (verifies via `git log -p` that tests came before impl)                                                 |
| Originating-expert reviewers | 1-4 (cluster-dependent)   | Re-spawned with the same persona prompt used in the 2026-05-19 deep-dive; reviews code AND runs the live app to verify the original finding is resolved |
| Visual diff reviewer         | 1 per UI-touching PR      | Playwright screenshot diff against pre-change baseline at desktop + mobile + tablet viewports                                                           |
| Test-quality reviewer        | 1 per PR                  | Reads tests; refuses ones that mock the thing under test or assert only HTTP status                                                                     |
| Final integration reviewer   | 1 per cluster (last gate) | Verifies full CI green, every reviewer thread resolved, no MUST-FIX open, originating expert signed off in writing                                      |

**Hard rules**:

1. No agent merges their own work.
2. No reviewer reviews a cluster they were build agent for.
3. Originating-expert sign-off is mandatory and captured in writing in the PR.
4. CI must be 100% green before final integration review opens.
5. TDD git-history check: code reviewer rejects PRs that committed tests + implementation together.

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

Orchestrator polls every 60s for wave-completion. Time-box: 3h per wave,
hard cap 10h total.

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
each step via `git log` before allowing the next.

1. **Spec → tests (failing).** Tests reflect the spec + originating
   findings. Run. They MUST fail. Commit: `test(c<N>): tests for <issue> [TDD-red]`.
2. **Minimal implementation.** Smallest change that makes tests pass.
   Commit: `feat(c<N>): <change> [TDD-green]`.
3. **Refactor.** Improve impl without breaking tests. Optional.
   Commit: `refactor(c<N>): <improvement>`.
4. **Coverage check.** Run test-quality reviewer locally; address
   "passes for wrong reason" findings before opening the PR.

## Required test categories per cluster

| Kind                                                   | Required for                                  | Asserts                                                                          |
| ------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------- |
| Unit (Vitest)                                          | every cluster                                 | Pure logic — year math, sphere derivation, EÜR aggregation, QR encoding          |
| Component (Svelte testing-library)                     | every UI cluster                              | Component renders right thing for given props; emits right events                |
| Integration (Vitest + local Postgres via dev-up)       | C1, C2, C3, C4                                | End-to-end domain — insert transaction → assert dashboard/EÜR/filter reflects it |
| E2E (Playwright via new global setup)                  | every cluster                                 | Full browser flow through the actual UI                                          |
| Mail content (`MAIL_PROVIDER=dev-eml` assertions)      | C8                                            | `.eml` file subject + body + QR payload bytes                                    |
| Visual snapshot (Playwright + diff)                    | every UI cluster                              | Diff against pre-change baseline; fails on layout shift                          |
| Mobile + tablet variants (Playwright device emulation) | C5, C7 + clusters with mobile-visible changes | Same behavior repeated at iPhone 12 + Pixel 5 + iPad Mini viewports              |
| Accessibility (axe-core via Playwright)                | every UI cluster                              | Zero serious/critical findings on touched routes                                 |

## Quality gates

A sub-PR cannot merge to the overnight branch unless ALL of these hold:

- ✅ All required tests for cluster's kind exist + pass locally
- ✅ Full CI suite green (unit + e2e + lint + typecheck + schema-drift + axe-core + mail-content + visual snapshots)
- ✅ Generic code reviewer signed off
- ✅ Test-quality reviewer signed off (no "passes for wrong reason" findings)
- ✅ All originating-expert reviewers explicitly signed off in writing
- ✅ Visual diff reviewer signed off (if UI changes)
- ✅ At least 2 full review cycles completed (more if findings remained)
- ✅ Final integration reviewer signed off
- ✅ Changelog entry written in the PR body for the morning consolidation

## Escalation playbook

| Trigger                                                  | Orchestrator action                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Build agent fails to produce green CI after 3 attempts   | Restart with fresh build agent + prior diff + reviewer feedback. 2 restarts → defer cluster, log to morning report.        |
| Reviewers keep finding MUST-FIX items past cycle 4       | Spawn scope-reviewer agent to judge if PR is too big. If yes, split into smaller sub-PRs.                                  |
| Sub-PR can't rebase cleanly after another cluster merges | Build agent attempts. If file-ownership violated, orchestrator picks one cluster to wait, the other proceeds.              |
| Overnight-branch CI red after a merge                    | Pause all sub-PRs. Open emergency repair PR with reduced quorum (2 reviewers, 1 cycle). Resume sub-PRs once green.         |
| Wave time-box exceeded (3h/wave, hard cap 10h)           | Cluster deferred — reverted from overnight branch, filed as issue with `state:overnight-deferred`. Others ship.            |
| Build agent hits a P0 bug outside cluster scope          | File separate emergency-fix issue. Orchestrator may dispatch side-channel agent. Original cluster pauses if blocked by it. |

## Morning consolidation

When all waves complete (or hard cap hit):

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

- 8 of 9 clusters merge to `main` in the morning PR (1 deferred max,
  filed as issue)
- Zero P0/P1 originating findings remain open in the deep-dive review
  scope
- Andy's three explicit gaps (EÜR, year switcher, dashboard cashflow)
  are visibly resolved and reviewed by their originating experts
- The favicon is rendered correctly across iOS home screen, Android home
  screen, macOS Safari tab, and Chrome desktop tab — Andy sees the pink
  sticker on his phone after install
- Test count grows by ≥ 60 (each cluster adds at least 5 new tests on
  average)
- CI total runtime ≤ 5 minutes per sub-PR (no test bloat regressions)

## Next step

Invoke the `writing-plans` skill to turn this design into an executable
implementation plan (the file the orchestrator will read at T=0). The
plan will instantiate concrete agent invocations, named sub-PR titles,
detailed acceptance criteria per cluster, and the orchestrator's
state machine.
