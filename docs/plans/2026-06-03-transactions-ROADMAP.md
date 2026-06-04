# Transactions Three-Tab Redesign — Implementation ROADMAP

> **For agentic workers:** This is the master roadmap for an XL feature delivered as a sequence of phase plans. Each phase plan is a self-contained `superpowers:writing-plans`-style document under `docs/plans/`. Execute phases **in order**; each ends in working, tested, committed software. Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` per phase.

**Spec:** `docs/specs/2026-06-03-transactions-three-tabs-design.md` (rev 3). Read it before any phase.

**Goal:** Split `/app/transactions` into three first-class tabs (Ausgaben / Einnahmen / Spenden) with mandatory categories, derived sphere, a composable server-side filter backbone, elegant entry/detail UX, a unified Beleg viewer, and a valuable seed corpus — building on already-shipped Phase-12 infrastructure.

---

## Phase 0 — Rebase (prerequisite, do first)

This branch (`feat/transactions-three-tabs`) was cut from Phase 8; `origin/main` is at Phase 12. **Rebase onto `origin/main` before Phase 1.** Expect conflicts in `transactions.ts`, `transactions/neu/`, `nav-registry.ts`, `files/`, `pdf/`. After rebase, re-confirm the highest `drizzle/NNNN_*.sql` index (expected ≥ `0028`, so new migrations start at `0029`) and that the file paths/line refs in the phase plans still resolve (the plans reference symbols/functions, not just line numbers, to survive drift).

```bash
git fetch origin
git rebase origin/main           # resolve conflicts, keep shipped code
pnpm install                     # in case deps moved
pnpm test --run tests/unit/smoke # or the smallest sanity check; confirm green baseline
```

---

## Phase sequence (dependency order)

| #   | Plan file                      | Ships                                                                                                                                                                                                      | Depends on |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `…phase-1-foundation.md`       | Schema (cols/enum/CHECKs), `kategorie_id` NOT NULL across all write paths, kategorien reseed + donation-derivation lookup + Import sentinel, `kategorieSphere()` helper, showcase seed corpus              | Phase 0    |
| 2   | `…phase-2-filter-backbone.md`  | Typed filter registry + URL/Zod + server-side WHERE + saved views (shared component, no UI tabs yet)                                                                                                       | 1          |
| 3   | `…phase-3-routing-nav-year.md` | Flat routes `/app/{ausgaben,einnahmen,spenden}` + `[id]`, nav-registry (3 desktop + 1 mobile segmented), redirects from `/app/transactions`, `selectedYear` consumption + "Alle Jahre" + stale-year banner | 1, 2       |
| 4   | `…phase-4-ausgaben.md`         | Ausgaben list (KPI/columns/filters/bulk/cards) + entry form (Verein/Mitglied/Extern, beleg-or-Begründung, duplicate-as-template) + Belegprüfung-assigns-Kategorie                                          | 1–3        |
| 5   | `…phase-5-einnahmen.md`        | Einnahmen list (Sphären-split, 🔗) + entry form + Rechnung-link surfacing                                                                                                                                  | 1–3        |
| 6   | `…phase-6-spenden.md`          | Spenden list (Bescheinigung pill) + 3-picker form + Sachspende Wertermittlung + derived badge                                                                                                              | 1–3        |
| 7   | `…phase-7-detail-viewer.md`    | Shared detail modal surface + unified pdfjs Beleg viewer + mobile fold + Festschreibung read-only                                                                                                          | 4–6        |
| 8   | `…phase-8-exports-polish.md`   | CSV export of filtered list + empty/error/loading states + a11y pass                                                                                                                                       | 4–7        |

Phases 4/5/6 are independent of each other (parallelizable once 1–3 land). Each phase plan is written **just before** it's executed, pinned to the real signatures produced by earlier phases — except Phases 1–3 (+ the shared-primitives track), written ahead in full to unlock the parallel tab tier.

---

## Parallelization map (maximize concurrent implementation)

The 8 phases above are the _dependency_ view. For **execution**, the work factors into tiers; everything inside a tier runs concurrently (separate worktrees, disjoint file ownership → no merge conflicts). The single biggest win is the **tab tier (4∥5∥6)**, which only becomes conflict-free once the shared kit (Phase 3) owns every cross-tab component.

```
TIER A  (no deps — start immediately, fully concurrent)
  ├─ A1  Phase 1  Foundation (data/schema/seed)            owns: drizzle/*, schema/*, seed*.ts, import/*, audit-inbox-actions.ts
  ├─ A2  Phase 2 pure engine (registry, URL/Zod, SQL       owns: src/lib/domain/transaction-filters.ts, year.ts,
  │      builders, year helpers, saved-views)                     src/lib/server/domain/transaction-filter-sql.ts, src/lib/client/saved-views.ts
  └─ A3  Shared primitives  (NEW track, see below)         owns: src/lib/components/ui/{popover,combobox,tooltip,pagination,money-input,multiselect-chip}/
        popover/combobox, tooltip, pagination,
        money-input, multiselect-chip
  ── sync: A1 must merge before A2's DB-query task (Phase 2 Task 5/6) and before A3 is consumed by tab tests that hit the DB.

TIER B  (after A — the shared kit; can split into B1∥B2∥B3)
  ├─ B1  Phase 2 FilterBar component  (needs A3 popover/combobox/chips)   owns: components/admin/transactions/FilterBar.svelte
  ├─ B2  Phase 3 routing+nav+year     (needs A2 year helpers)             owns: nav-registry.ts, Sidebar/MobileTabBar/Topbar edits,
  │                                                                              routes/app/{ausgaben,einnahmen,spenden}/ shells, redirect, +layout clamp
  └─ B3  Phase 3 shared kit           (needs A2 listXPage shape, A3)      owns: components/admin/transactions/{TransactionListScaffold,
        list scaffold · entry-modal shell + field                              EntryFormShell, fields/*, DetailModalShell, StaleYearBanner}.svelte
        primitives · detail-modal shell · Beleg viewer                          + components/files/BelegViewer.svelte
  ── Beleg viewer (BelegViewer.svelte) is itself parallel-safe (depends only on A1 files + pdfjs) — can run in A or B.

TIER C  (after B — THE parallel tab tier; 3 concurrent worktrees, zero shared files)
  ├─ C1  Phase 4 Ausgaben     owns ONLY: routes/app/ausgaben/**  + components/admin/transactions/ausgaben/*
  ├─ C2  Phase 5 Einnahmen    owns ONLY: routes/app/einnahmen/** + components/admin/transactions/einnahmen/*
  └─ C3  Phase 6 Spenden      owns ONLY: routes/app/spenden/**   + components/admin/transactions/spenden/* (+ keep zuwendungsbestaetigung)

TIER D  (after C)
  └─ D1  Phase 8 exports + cross-cutting polish (CSV per tab, empty/error/loading states, a11y sweep)
```

**Rules that keep tiers conflict-free**

- **One file = one owner per tier.** The tab tier (C) is only safe because Phase 3 (B) extracts every shared component first; a C-track must never edit a shared file. If a tab needs a shared change, it goes back to B (do not fork).
- **`transactions.ts` is a contention point** (Phase 1 adds `createX`/sentinel resolves; Phase 2 adds `listXPage`). Sequence those two within Tier A→B or use a worktree + a single rebasing merge; do not edit it from two tracks simultaneously.
- **Shared primitives (A3) front-loaded:** Phase 2's `FilterBar` (B1) and Phase 3's forms (B3) both need popover/combobox/multiselect-chip/money-input. Building them once in A3 prevents three half-built copies. (Spec §13 lists these as "to add.")
- **Old god-component (`TransactionsList.svelte`) stays live until Tier C retires it per-tab.** Phase 3 (B) leaves the old `/app/transactions` route working behind a redirect only after the three new routes exist; the SEPA/Bulk/Row/Card components are extracted (not deleted) in B3 so all three tabs reuse them.

**Just-in-time vs ahead-of-time:** Phases 1, 2, 3 and the A3 primitives track are planned **now** (their inputs exist). Tabs 4/5/6 are planned **against Phase 3's locked exports** (written immediately after Phase 3 review passes — same author, cross-checked for contract consistency, so no drift). Phase 8 is planned last.

---

## Per-phase protocol (every phase)

1. **Write** the phase plan (bite-sized TDD steps, real code, exact paths, model tags).
2. **Self-review** (the writing-plans checklist: spec coverage, placeholder scan, type/signature consistency).
3. **Independent review** — dispatch ≥2 fresh subagents to review the plan adversarially: (a) technical correctness + completeness vs spec + integration with shipped code; (b) TDD granularity + executability + test-efficiency. **Iterate until both pass with no material findings.** ("Review more than less" — the bar is _solid_, not _good enough_.)
4. **Execute** task-by-task (subagent-driven; review between tasks).
5. **Phase-boundary verification** (see Testing approach) + **commit**.
6. **Continue** to the next phase autonomously: write its plan, repeat.

---

## Testing approach (cost-aware — applies to every step in every phase)

The test kit is large; **run the minimum that proves each step.** Order verifications cheapest → most expensive so failures surface before slow runs.

- **Per TDD step:** run the single file or single test only — `pnpm test --run path/to/file.test.ts` or `vitest run -t "exact test name"`. **Never** bare `pnpm test` mid-step.
- **Prefer hermetic unit tests** over DB/E2E when they give the same signal. The DB reset (`reset-test-db.sh`) costs ~3-6s; E2E is the most expensive — use it only for the specific new `@phase-N` spec.
- **Migration/schema steps:** validate with a targeted migration test or a single `psql`/drizzle query, not the whole integration suite.
- **Phase-boundary only** (before the milestone commit): run the phase's full unit subset + `pnpm lint` + `pnpm check` (typecheck) + the phase's E2E spec. Not after every task.
- A step's "Expected" must state the tightest passing signal (e.g. "1 passed"), not a full-suite summary.

---

## Model assignment (per task; honor the tags in each plan)

Tag every task **`[model: opus]`** or **`[model: sonnet]`**:

- **Opus** — tasks where reasoning/judgment/cross-cutting correctness earns it: migration ordering + constraint/trigger interactions, the NOT-NULL-across-all-write-paths change, the filter registry → SQL predicate design, the deep-linkable-modal route pattern, the pdfjs viewer, anything touching Festschreibung/audit/money correctness, and every **plan-writing + plan-review** step.
- **Sonnet** — mechanical, well-specified, low-ambiguity tasks: adding a column with a given definition, writing a seed-corpus array, a single component's markup from a locked mockup, route-file boilerplate, copy/label changes, straightforward unit tests with the assertion spelled out.

When unsure, default to Opus for correctness-critical paths and Sonnet for clearly-bounded mechanical edits.

---

## Conventions (all phases)

- TDD, DRY, YAGNI, frequent commits. One logical change per commit; Conventional Commits style.
- `main` is protected — work on `feat/transactions-three-tabs` (or per-phase sub-branches), PR with the reviewed-by-opus stamp.
- Honor CLAUDE.md: event bus for side effects, `year_for_booking`, sphere snapshot, cents, Festschreibung gate, `getFileStorage()`, append-only audit, env via `env.ts`.
- Migrations: hand-written SQL after `drizzle-kit generate`; `--> statement-breakpoint` separators; append the `_journal.json` entry; preserve generated-column tails.
- All data is disposable test data pre-launch (full wipe + clean constraints OK).
