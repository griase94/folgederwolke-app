# Transactions Phase 4 — Ausgaben tab (Tier C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`. Read the ROADMAP (Parallelization map) + spec §7 + §4.6 + §10/§11. **Depends on Phases 1, 2, 3 + track A3 merged.** This is a **Tier-C parallel track** — it owns `routes/app/ausgaben/**` + `components/admin/transactions/ausgaben/**` (incl. the bulk/SEPA components moved here in Phase 3 Task 6) and may run concurrently with Phase 5 (Einnahmen) and Phase 6 (Spenden). **Do not edit shared files** (the Phase-3 kit, `transactions.ts`, `FilterBar`); if a shared change is needed, it goes back to Phase 3. One exception is flagged in Task 6 (Belegprüfung). Branch/worktree: a C1 worktree off the merged Phase-1-2-3 base.

**Goal:** The Ausgaben tab — list (KPI "N offen" pill + sortable columns incl. Sphäre-left-rule + Status badge), bulk "Als bezahlt markieren" (+ SEPA), the entry form (Verein auto-paid / Mitglied / Extern + admin "Schon bezahlt?" toggle + beleg-or-Begründung), the detail page ("Als bezahlt markieren" + duplicate-as-template), and the Belegprüfung-assigns-Kategorie picker.

**Architecture:** Thin route files binding to the Phase-3 shared kit. `routes/app/ausgaben/+page.server.ts` calls `listAusgabenPage` (Phase 2) + a new `listAusgabenKpi` (this phase) and renders `TransactionListScaffold` with an Ausgaben `kpi` snippet, `columns`, and the `bulk` prop. The entry form uses `EntryFormShell` + an Ausgaben `fields` snippet; its create action calls `createExpense` (Phase 1, which resolves a non-null Kategorie + `kategorieSphere`). Verein (or admin "Schon bezahlt") → created already-`erstattet` (reuse `markExpenseAsPaid` semantics). The detail route uses `DetailModalShell` + `BelegViewer`, with "Als bezahlt markieren" (reuse `markExpenseAsPaid`) and duplicate-as-template (resets payment state).

**Tech Stack:** SvelteKit, Drizzle, Vitest (fast lane for pure KPI math; reset lane for DB + component/route tests).

**Testing approach:** per-step single-file; pure → `test:fast`; DB/route/component → `pnpm test --run <file>`. Broad runs at the boundary task.

**Owned files (C1):** `routes/app/ausgaben/{+page.server.ts,+page.svelte,neu/+page.server.ts,neu/+page.svelte,[id]/+page.server.ts,[id]/+page.svelte}`, `components/admin/transactions/ausgaben/{AusgabenKpi.svelte,columns.ts,AusgabeFields.svelte,AusgabeDetailFields.svelte}`, the moved `{BulkActionsBar,SepaCopyModal,PostSepaMarkErstattetModal}.svelte`. **Shared deps (read-only):** `TransactionListScaffold`, `EntryFormShell`+fields, `DetailModalShell`, `BelegViewer`, `FilterBar`, `listAusgabenPage`, `createExpense`, `markExpenseAsPaid`, `markExpenseErstattet`, `checkFestschreibungGate`, `listApprovedPendingErstattet`, `listKategorieOptions("expense")`.

> **⚠ Review amendments (verified against real code — apply when executing):**
> - **`markExpenseAsPaid` signature is positional and does NOT mail:** `markExpenseAsPaid(expenseId: string, { datum, zahlartId, actorUserId })` — emits `expense.updated` (audit only). The **"Schon bezahlt" + notify** path (Task 4 case c) must use **`markExpenseErstattet`** (`audit-inbox-actions.ts`): `{ expenseId, chosenDate, zahlungsartId, actorUserId }` — it fires the dedup'd ErstattungsMail via `expense.erstattet`, requires a non-null `zahlungsartId` + an existing `approvedAt`. So: **Verein → `markExpenseAsPaid` (no mail); Mitglied/Extern + Schon-bezahlt → `markExpenseErstattet` (mails).** There is no `notify` knob on `markExpenseAsPaid`.
> - **`createExpense` invariant:** it always creates `status='geprueft'`, `approvedAt=now()`, `erstattetAm=NULL` (no `status` input). So the Verein two-step `createExpense → markExpenseAsPaid` (guard `WHERE erstattet_am IS NULL`) is correct, single audit per step, no double-pay.
> - **Task 3 bulk is a behavior CHANGE, not a port:** the old actions return a single `fail(409, "a; b")` and `markExpenseErstattet` mails per row. Implement the new `{ results: {id,status}[] }` shape + decide member-row mailing explicitly.
> - **Task 5 `?/save`:** there is no exported `updateExpense` — port the inline `db.update(expenses)` from the old `[id]/+page.server.ts`, festschreibung-gated; add a test for it. Read `detail.belegFileId`/`belegMimeType`/`belegOriginalName` (Phase 3 Task 4), NOT `belegDriveFileId`.
> - **Task 6 `approveSubmission`:** adding a required `kategorieId` is a breaking signature change — update the inbox approve call site(s) in lockstep, update the stale "Phase 5" code comment, and have the test supersede Phase 1 Task 9's sentinel assertion (chosen Kategorie instead).
> - **Task 1 KPI aging basis:** measure oldest-open age from **`approvedAt`** (state it explicitly so the §4.7 corpus fixture asserts a deterministic number).

---

### Task 1: `listAusgabenKpi` — total + offen count + oldest-open age `[model: opus]`

Money aggregation; powers the "N offen · älteste X Tage" pill (spec §7.1).

**Files:** Modify `src/lib/server/domain/transactions.ts` **— NO.** Per parallel-safety, KPI aggregation for Ausgaben is C1-owned: create `src/lib/server/domain/ausgaben-kpi.ts`; Test `tests/integration/ausgaben-kpi.test.ts`

- [ ] **Step 1: Write the failing test** (DB; corpus seeds geprueft/erstattet/abgelehnt expenses incl. an aged-open one).

```ts
// tests/integration/ausgaben-kpi.test.ts
import { describe, it, expect } from "vitest";
import { listAusgabenKpi } from "$lib/server/domain/ausgaben-kpi.js";
import { ALL_YEARS } from "$lib/domain/year.js";
describe("listAusgabenKpi", () => {
  it("returns total sum + count + offen (approved-not-erstattet) count + oldest-open age in days", async () => {
    const kpi = await listAusgabenKpi(2026);
    expect(typeof kpi.totalCents).toBe("number");
    expect(typeof kpi.count).toBe("number");
    expect(typeof kpi.offenCount).toBe("number");
    expect(
      kpi.oldestOpenAgeDays === null ||
        typeof kpi.oldestOpenAgeDays === "number",
    ).toBe(true);
  });
  it("supports ALL_YEARS (omits the year predicate)", async () => {
    const kpi = await listAusgabenKpi(ALL_YEARS);
    expect(kpi.count).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/integration/ausgaben-kpi.test.ts`

- [ ] **Step 3: Implement** `listAusgabenKpi(year: YearScope): Promise<{ totalCents: number; count: number; offenCount: number; oldestOpenAgeDays: number | null }>`. One grouped query: `sum(betragCents)` + `count(*)` over `expenses` (year predicate unless `ALL_YEARS`); a second for offen = `approvedAt IS NOT NULL AND erstattetAm IS NULL AND rejectedAt IS NULL` → count + `min(approvedAt)` → age in days (Berlin). Mirror the dashboard aggregation pattern (`loadDashboardKpis`). BigInt→Number for cents.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(ausgaben): listAusgabenKpi (total + offen count + oldest-open age)"`

---

### Task 2: Ausgaben list page + KPI strip + columns `[model: opus]`

**Files:** Create `routes/app/ausgaben/+page.server.ts` (replace the Phase-3 placeholder), `+page.svelte`, `components/admin/transactions/ausgaben/{AusgabenKpi.svelte,columns.ts}`; Test `tests/unit/ausgaben-page.server.test.ts` (mocked) + `…/AusgabenKpi.test.ts`

- [ ] **Step 1: Write the failing tests** — (a) `load` parses filters + `selectedYear`/`yearScope`, calls `listAusgabenPage` + `listAusgabenKpi`, returns both + options + `approvedPending` for bulk; (b) `AusgabenKpi` renders the anchor + an "N offen · älteste X Tage" pill that is **absent when offenCount===0** (spec §7.1 delight).

```ts
// AusgabenKpi.test.ts
it("hides the offen pill when zero", () => {
  render(AusgabenKpi, {
    props: {
      totalCents: 842000,
      count: 47,
      offenCount: 0,
      oldestOpenAgeDays: null,
      year: 2026,
    },
  });
  expect(screen.queryByText(/offen/i)).toBeNull();
});
it("shows 'N offen · älteste X Tage' when > 0", () => {
  render(AusgabenKpi, {
    props: {
      totalCents: 842000,
      count: 47,
      offenCount: 3,
      oldestOpenAgeDays: 18,
      year: 2026,
    },
  });
  expect(screen.getByText(/3 offen/)).toBeTruthy();
  expect(screen.getByText(/18/)).toBeTruthy();
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/ausgaben-page.server.test.ts` then `pnpm test --run src/lib/components/admin/transactions/ausgaben/AusgabenKpi.test.ts`

- [ ] **Step 3: Implement.** `+page.server.ts` `load` (mirrors the Phase-3 shell shape, but Ausgaben-specific): `parseFilterState("ausgaben", url.searchParams)`, year from `await parent()` (`yearScope`), `listAusgabenPage({ state, year, limit, offset })`, `listAusgabenKpi(year)`, `listKategorieOptions("expense")` → options, `listMemberOptions()`, `listApprovedPendingErstattet()` (bulk). `columns.ts` exports the `ColumnDef[]`: Datum, ID (mono), Bezeichnung (+ Bezahlt-von subtitle), Bezahlt von, Kategorie, **Sphäre as a left color-rule** (render snippet, not a filled badge — §13), Betrag (right, `Money`), Status (badge), chevron. `AusgabenKpi.svelte` renders the quiet anchor + the disappearing "N offen" pill. `+page.svelte` renders `<TransactionListScaffold tab="ausgaben" {rows} {total} … kpi={kpiSnippet} columns={ausgabenColumns} bulk={…} detailHrefBase="/app/ausgaben">`.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(ausgaben): list page + KPI strip + columns (Sphäre left-rule, disappearing offen pill)"`

---

### Task 3: Move bulk/SEPA components into ausgaben/ + wire bulk mark-paid `[model: sonnet]`

**Files:** Move `components/admin/transactions/{BulkActionsBar,SepaCopyModal,PostSepaMarkErstattetModal}.svelte` → `…/ausgaben/`; wire them via the scaffold `bulk` prop in `+page.svelte` + a `?/bulk-mark-erstattet` / `?/sepa-mark-erstattet` action set on `routes/app/ausgaben/+page.server.ts` (port the existing actions from the old `transactions/+page.server.ts`, reusing `markExpenseErstattet`/`markExpenseAsPaid`). Test: extend `tests/unit/ausgaben-page.server.test.ts` with the bulk action (mocked) incl. **partial-failure per-row result** (spec §7.1: "9 erstattet, 1 festgeschrieben").

- [ ] **Step 1: Write the failing test** — bulk action marks N expenses paid and returns a per-row result array (ok/festgeschrieben/already-paid), not a single boolean.
- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement** the move + the bulk actions returning `{ results: { id, status }[] }`; the BulkActionsBar/PostSepa modals surface the per-row summary toast.
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "feat(ausgaben): bulk Als-bezahlt + SEPA (moved into ausgaben/, per-row failure summary)"`

---

### Task 4: Ausgabe entry form — Verein auto-paid / Mitglied / Extern + Schon-bezahlt `[model: opus]`

The bezahlt-von branching + auto-paid is the trickiest tab logic.

**Files:** Create `routes/app/ausgaben/neu/{+page.server.ts,+page.svelte}` + `components/admin/transactions/ausgaben/AusgabeFields.svelte`; Test `tests/unit/ausgaben-create.server.test.ts` (mocked, mirrors `neu/page.server.test.ts`)

- [ ] **Step 1: Write the failing test** — three cases: (a) `bezahltVonKind=verein` → `createExpense` called then `markExpenseAsPaid` (status erstattet), no member mail; (b) `bezahltVonKind=member` default → status geprueft (Auslagenflow), no auto-pay; (c) `bezahltVonKind=member` + `schonBezahlt=true` (admin) → `markExpenseAsPaid` + optional notify. All assert `kategorieSphere` derivation (no project override) + beleg-or-Begründung validation.

```ts
// ausgaben-create.server.test.ts (mock transactions.ts createExpense/markExpenseAsPaid)
it("Verein → creates then marks paid (erstattet), no member notify", async () => {
  /* invoke ?/create with bezahltVonKind=verein, zahlungsart, datum … expect markExpenseAsPaid called, notify=false */
});
it("Mitglied default → geprueft, no auto-pay", async () => {
  /* … expect markExpenseAsPaid NOT called */
});
it("Mitglied + schonBezahlt → marks paid + optional notify", async () => {
  /* … */
});
it("rejects: neither Beleg nor Begründung", async () => {
  /* expect fail(422) */
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/ausgaben-create.server.test.ts`

- [ ] **Step 3: Implement.** `AusgabeFields.svelte`: Bezeichnung, Betrag (native number→hidden cents), Rechnungsdatum + Abfluss (`ui/date-field`), `KategoriePicker`+`SphereBadge`, Projekt, the bezahlt-von segmented (Verein/Mitglied/Extern → reveals member-select or Extern Name/IBAN/Email), the **admin-only "Schon bezahlt?" toggle** (revealed for member/extern; reveals Zahlungsart + Datum + notify) — visually distinct from the Verein auto-paid panel (spec §7.2, avoid mode-error), and `BelegUpload` with the "Kein Beleg vorhanden" → Begründung reveal. `+page.server.ts` `?/create`: Zod schema (extend the existing `expenseSchema`); `checkFestschreibungGate`; `allocateBusinessId("A", year)`; `createExpense({ …, kategorieNameSnapshot, /* sphere derived in createExpense via kategorieSphere */ })`; if Verein OR (`schonBezahlt` && admin) → `markExpenseAsPaid({ expenseId, datum, zahlartId, notify })`; `redirect(303, "/app/ausgaben/" + id)`. Renders inside `EntryFormShell`.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(ausgaben): entry form — Verein auto-paid / Mitglied(+Schon-bezahlt) / Extern + beleg-or-Begründung"`

---

### Task 5: Ausgabe detail route — mark-paid + duplicate-as-template `[model: opus]`

**Files:** Create `routes/app/ausgaben/[id]/{+page.server.ts,+page.svelte}` + `components/admin/transactions/ausgaben/AusgabeDetailFields.svelte`; Test `tests/unit/ausgabe-detail.server.test.ts`

- [ ] **Step 1: Write the failing tests** — (a) `load` calls `getTransactionDetail(id, "expense")`, 404s when missing, exposes `isFestgeschrieben`; (b) `?/mark-paid` reuses `markExpenseAsPaid` + festschreibung gate; (c) `?/duplicate` returns a prefill object that **resets payment state** (no `erstattetAm`/`zahlungsartId`/`status` carried; never a Beleg) — the critical recurring-Miete safety (spec §7.2).

```ts
it("duplicate resets payment state (no erstattetAm/zahlungsart/status, no beleg)", async () => {
  const prefill = await invokeDuplicate(erstatteteExpenseId);
  expect(prefill.erstattetAm).toBeUndefined();
  expect(prefill.zahlungsartId).toBeUndefined();
  expect(prefill.status).toBeUndefined();
  expect(prefill.belegFileId).toBeUndefined();
  expect(prefill.bezeichnung).toBeTruthy(); // carries the descriptive fields
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/ausgabe-detail.server.test.ts`

- [ ] **Step 3: Implement.** `[id]/+page.server.ts`: `load` → `getTransactionDetail(params.id, "expense")` (now carries `belegFileId`/`belegMimeType` from Phase 3 Task 4); actions `?/save` (festschreibung-gated update), `?/mark-paid` (`markExpenseAsPaid` + ErstattungsMail), `?/duplicate` (build a prefill from the descriptive fields only → redirect to `/app/ausgaben/neu?prefill=…` or return for client prefill). `AusgabeDetailFields.svelte` = the editable fields. `+page.svelte` renders `<DetailModalShell {detail} {isFestgeschrieben} fields={…} workflowAction={markPaidSnippet} beleg={belegViewerSnippet}>` where `beleg` renders `<BelegViewer fileId={detail.belegFileId} mimeType={detail.belegMimeType} … mode="inline"/>` (or fold on mobile). Festgeschrieben → read-only (shell handles).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(ausgaben): detail route — Als bezahlt markieren + duplicate-as-template (payment-state reset)"`

---

### Task 6: Belegprüfung — require a Kategorie on approval `[model: opus]`

Spec §4.6: the real Kategorie picker on the inbox approval UI (replaces Phase 1's interim sentinel). **⚠ Touches a SHARED route `routes/app/inbox/**`+`audit-inbox-actions.ts` — NOT a C1-owned file.** Safe because no other Tier-C track touches inbox, but **sequence this so it doesn't run concurrently with any other inbox edit\*\*; ideally land it as a small standalone PR before/after the parallel tab work, not inside a racing C1 worktree. Flagged in the ROADMAP.

**Files:** Modify `routes/app/inbox/+page.svelte` (+ its approve action) + `src/lib/server/domain/audit-inbox-actions.ts` (`approveSubmission` takes a `kategorieId`); Test `tests/unit/audit-inbox-actions.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — `approveSubmission` now requires a real `kategorieId` (rejects/needs it instead of the sentinel); the approved expense carries the chosen Kategorie + derived sphere.
- [ ] **Step 2: Run → fails.**
- [ ] **Step 3: Implement** — add a mandatory Kategorie picker (`listKategorieOptions("expense")`) to the inbox approve UI; `approveSubmission({ …, kategorieId })` sets it + `kategorieSphere` sphere; drop the interim sentinel fallback for the interactive path (keep it only for any non-interactive path).
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "feat(inbox): require Kategorie on Auslage approval (replaces interim sentinel, spec §4.6)"`

---

### Task 7: Phase-boundary verification + milestone `[model: opus]`

- [ ] **Step 1: Pure.** `pnpm test:fast --run $(git ls-files 'tests/unit/*ausgaben*' | tr '\n' ' ')` (the pure ones, if any).
- [ ] **Step 2: DB/route/component.** `pnpm test --run tests/integration/ausgaben-kpi.test.ts tests/unit/ausgaben-page.server.test.ts tests/unit/ausgaben-create.server.test.ts tests/unit/ausgabe-detail.server.test.ts tests/unit/audit-inbox-actions.test.ts src/lib/components/admin/transactions/ausgaben/AusgabenKpi.test.ts`
- [ ] **Step 3: e2e.** `pnpm test:e2e --grep @phase-4-ausgaben` (create Verein-paid → erstattet; create member → geprueft; bulk mark-paid; duplicate resets; detail mark-paid).
- [ ] **Step 4: Typecheck + lint.** `pnpm check && pnpm lint`
- [ ] **Step 5: Tag.** `git tag -f phase-4-ausgaben-complete`

---

## Self-Review

1. **Spec §7 coverage:** KPI offen-pill + aging (T1/T2) ✓; sortable columns + Sphäre left-rule + status badge (T2) ✓; bulk Als-bezahlt + per-row failure (T3) ✓; entry Verein/Mitglied/Extern + Schon-bezahlt + beleg-or-Begründung (T4) ✓; detail mark-paid + duplicate-reset (T5) ✓; §4.6 Belegprüfung Kategorie (T6) ✓.
2. **Parallel-safety:** all files in `routes/app/ausgaben/**` + `components/admin/transactions/ausgaben/**` except T6 (inbox), explicitly flagged + sequenced. KPI in its own `ausgaben-kpi.ts` (not `transactions.ts`). Binds to Phase-3 contracts read-only.
3. **No placeholders:** logic tasks (KPI, auto-paid, duplicate-reset, approval) are full TDD; UI wiring is contract-bound with a component/route test. `listAusgabenPage` row carries `status`/`bezahltVonKind`/`approvedAt` per the Phase-2 projection amendment.
4. **Old-route cleanup** (deleting the shared `transactions/[id]`, `transactions/neu`, `TransactionsList.svelte`) is **NOT here** — it's a Tier-D (Phase 8) cleanup once all three tabs ship, to keep C-tracks conflict-free.
