# Transactions Phase 5 — Einnahmen tab (Tier C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`. Read the ROADMAP (Parallelization map) + spec §8 + §6 + §10/§11/§13. **Depends on Phases 1, 2, 3 merged.** This is a **Tier-C parallel track** — it owns `routes/app/einnahmen/**` + `components/admin/transactions/einnahmen/**` and may run concurrently with Phase 4 (Ausgaben) and Phase 6 (Spenden). **Do not edit shared files** (the Phase-3 kit, `transactions.ts`, `invoices.ts`, `FilterBar`, the Phase-2 filter/projection layer); if a shared change is needed, it goes back to the owning phase. There is **no shared-route exception** in this track (unlike Phase 4's inbox carve-out): Einnahmen is fully self-contained. Branch/worktree: a C2 worktree off the merged Phase-1-2-3 base.

**Goal:** The Einnahmen tab — list (KPI anchor + **Sphären-Split chips**, no "offen" pill, no status column), the freie-Einnahme entry form (Bezeichnung / Betrag / Geldeingang / Kategorie+Sphäre / Projekt optional / Beleg **optional** / Kommentar → `createIncome`, **no bezahlt-von, no auto-pay**), and the detail page (read-only-aware fields + `BelegViewer` + the read-only 🔗 "aus Rechnung FDW-…" context line when the row was created by the shipped `markInvoiceAsPaid` flow). The "Aus Rechnung" create flow is **NOT built here** — it ships on the Rechnungen detail route; Einnahmen only _surfaces_ its result.

**Architecture:** Thin route files binding to the Phase-3 shared kit. `routes/app/einnahmen/+page.server.ts` calls `listEinnahmenPage` (Phase 2, whose row projection already left-joins `invoices.paidByIncomeId = income.id` and carries `rechnungBusinessId: string | null`) + a new C2-owned `listEinnahmenKpi` (this phase) and renders `TransactionListScaffold` with an Einnahmen `kpi` snippet (anchor + Sphären-Split chips) and `columns` (no `bulk`, no status). The entry form uses `EntryFormShell` + an Einnahmen `fields` snippet; its create action calls `createIncome` (Phase 1, which resolves a non-null Kategorie + `kategorieSphere`, no project override). The detail route uses `DetailModalShell` + `BelegViewer`, and — **only when the row is `markInvoiceAsPaid`-linked** — surfaces a read-only "aus Rechnung FDW-…" context line as the `workflowAction` info slot. No write workflow lives on the Einnahmen detail beyond `?/save`.

**Tech Stack:** SvelteKit, Drizzle, Vitest (fast lane for pure KPI fold math; reset lane for DB + component/route tests).

**Testing approach:** per-step single-file; pure → `test:fast`; DB/route/component → `pnpm test --run <file>`. Broad runs at the boundary task.

**Owned files (C2):** `routes/app/einnahmen/{+page.server.ts,+page.svelte,neu/+page.server.ts,neu/+page.svelte,[id]/+page.server.ts,[id]/+page.svelte}`, `components/admin/transactions/einnahmen/{EinnahmenKpi.svelte,columns.ts,EinnahmeFields.svelte,EinnahmeDetailFields.svelte}`, and the C2-owned domain file `src/lib/server/domain/einnahmen-kpi.ts`. **Shared deps (read-only):** `TransactionListScaffold`, `EntryFormShell`+field primitives (`KategoriePicker`+`SphereBadge`, `BelegUpload`, `ui/money`, `ui/date-field`), `DetailModalShell`, `BelegViewer`, `FilterBar`, `listEinnahmenPage`, `parseFilterState`, `createIncome`, `getTransactionDetail`, `checkFestschreibungGate`, `listKategorieOptions("income")`, `listMemberOptions`, `allocateBusinessId`.

> **⚠ Cross-phase dependency to verify before starting:** the einnahmen row projection from `listEinnahmenPage` (Phase 2) MUST include `rechnungBusinessId: string | null` (the left-join on `invoices.paidByIncomeId = income.id`). This is the only data the 🔗 badge + detail context line consume. If Phase 2 has not landed that field, the 🔗 surfacing in Tasks 2 + 5 is blocked — do not add the join yourself (it is Phase-2-owned); raise it back to Phase 2. Flagged again in the Self-Review.

---

### Task 1: `listEinnahmenKpi` — total + count + Sphären-Split buckets `[model: opus]`

Money aggregation; powers the KPI anchor + the four Sphären-Split chips (spec §8.1). Mirrors the dashboard income-by-sphere aggregation (`loadDashboardKpis` queries #16/#7-style: `select({ sphere: income.sphereSnapshot, sumCents: sum(income.betragCents) }).from(income).where(and(eq(income.yearOfBuchung, year), isNull(income.supersedesId))).groupBy(income.sphereSnapshot)`).

**Files:** Create `src/lib/server/domain/einnahmen-kpi.ts`; Test `tests/integration/einnahmen-kpi.test.ts`

- [ ] **Step 1: Write the failing test** (DB; corpus seeds income rows across all four spheres in `2026`, plus a superseded row that must be excluded, plus at least one row in another year to prove year-scoping).

```ts
// tests/integration/einnahmen-kpi.test.ts
import { describe, it, expect } from "vitest";
import { listEinnahmenKpi } from "$lib/server/domain/einnahmen-kpi.js";
import { ALL_YEARS } from "$lib/domain/year.js";

describe("listEinnahmenKpi", () => {
  it("returns total sum + count + per-sphere split buckets", async () => {
    const kpi = await listEinnahmenKpi(2026);
    expect(typeof kpi.totalCents).toBe("number");
    expect(typeof kpi.count).toBe("number");
    // four named sphere buckets, each a cents integer (0 when empty)
    expect(typeof kpi.bySphere.ideeller).toBe("number");
    expect(typeof kpi.bySphere.vermoegen).toBe("number");
    expect(typeof kpi.bySphere.zweckbetrieb).toBe("number");
    expect(typeof kpi.bySphere.wirtschaftlich).toBe("number");
    // the buckets sum to the total (cents-exact)
    const sum =
      kpi.bySphere.ideeller +
      kpi.bySphere.vermoegen +
      kpi.bySphere.zweckbetrieb +
      kpi.bySphere.wirtschaftlich;
    expect(sum).toBe(kpi.totalCents);
  });

  it("excludes superseded rows (isNull(supersedesId))", async () => {
    /* seed a superseded income row; assert it is not counted in totalCents/count */
  });

  it("supports ALL_YEARS (omits the year predicate)", async () => {
    const kpi = await listEinnahmenKpi(ALL_YEARS);
    expect(kpi.count).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/integration/einnahmen-kpi.test.ts`

- [ ] **Step 3: Implement** `listEinnahmenKpi(year: YearScope): Promise<{ totalCents: number; count: number; bySphere: { ideeller: number; vermoegen: number; zweckbetrieb: number; wirtschaftlich: number } }>`. One grouped query over `income`: `select({ sphere: income.sphereSnapshot, sumCents: sum(income.betragCents), n: count() })` with `where(and(<year predicate unless ALL_YEARS>, isNull(income.supersedesId)))` and `groupBy(income.sphereSnapshot)`. Year predicate = `eq(income.yearOfBuchung, year)` (mirror the dashboard which scopes by `yearOfBuchung`); when `year === ALL_YEARS`, drop it. Fold the grouped rows into the four-key `bySphere` record (default each to `0` so empty spheres are present), `totalCents` = sum of buckets, `count` = sum of `n`. `BigInt`/`sum()`-string → `Number(...)` per the dashboard convention (`Number(r.betragCents)`). Keep the fold logic in a pure exported helper (`foldSphereBuckets(rows)`) so it can be unit-tested on the fast lane if desired.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(einnahmen): listEinnahmenKpi (total + count + Sphären-Split buckets)"`

---

### Task 2: Einnahmen list page + KPI strip + columns `[model: opus]`

**Files:** Create `routes/app/einnahmen/+page.server.ts` (replace the Phase-3 placeholder), `+page.svelte`, `components/admin/transactions/einnahmen/{EinnahmenKpi.svelte,columns.ts}`; Test `tests/unit/einnahmen-page.server.test.ts` (mocked) + `…/EinnahmenKpi.test.ts`

- [ ] **Step 1: Write the failing tests** — (a) `load` parses filters via `parseFilterState("einnahmen", url.searchParams)` + reads `selectedYear`/`yearScope` from `await parent()`, calls `listEinnahmenPage({ state, year, limit, offset })` + `listEinnahmenKpi(year)`, returns `{ rows, total, page, pageSize, kpi, kategorieOptions, memberOptions }` (no `approvedPending`, no `bulk` payload — Einnahmen has no bulk); (b) `EinnahmenKpi` renders the quiet anchor (`<Jahr|Alle> · Summe · N`) **plus all four Sphären-Split chips** (Ideeller / Vermögen / Zweckbetrieb / Wirtschaftlich, each with its formatted total), and renders a chip with a `0,00 €` value rather than hiding it when a sphere is empty (the split must always show all four for the gemeinnützigkeit reading); (c) the 🔗 column render returns the badge only when `rechnungBusinessId` is set.

```ts
// EinnahmenKpi.test.ts
const kpi = {
  totalCents: 1_250_00,
  count: 12,
  bySphere: {
    ideeller: 800_00,
    vermoegen: 0,
    zweckbetrieb: 300_00,
    wirtschaftlich: 150_00,
  },
};

it("renders the anchor (Jahr · Summe · N)", () => {
  render(EinnahmenKpi, { props: { ...kpi, year: 2026 } });
  expect(screen.getByText(/2026/)).toBeTruthy();
  expect(screen.getByText(/12/)).toBeTruthy();
});

it("renders all four Sphären-Split chips, incl. an empty (0,00 €) one", () => {
  render(EinnahmenKpi, { props: { ...kpi, year: 2026 } });
  expect(screen.getByText(/Ideeller/i)).toBeTruthy();
  expect(screen.getByText(/Vermögen/i)).toBeTruthy();
  expect(screen.getByText(/Zweckbetrieb/i)).toBeTruthy();
  expect(screen.getByText(/Wirtschaftlich/i)).toBeTruthy();
  // empty sphere is shown as 0,00 €, not omitted
  expect(screen.getByText(/0,00\s*€/)).toBeTruthy();
});
```

```ts
// columns.test.ts (or inline in EinnahmenKpi.test.ts) — the 🔗 render rule
it("Bezeichnung column shows the 🔗 badge only when rechnungBusinessId is set", () => {
  const linked = { rechnungBusinessId: "FDW-2026-014", bezeichnung: "Beitrag" };
  const free = { rechnungBusinessId: null, bezeichnung: "Spende bar" };
  // render the Bezeichnung ColumnDef snippet for each row; assert badge presence
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/einnahmen-page.server.test.ts` then `pnpm test --run src/lib/components/admin/transactions/einnahmen/EinnahmenKpi.test.ts`

- [ ] **Step 3: Implement.** `+page.server.ts` `load` (mirrors the Phase-3 shell shape, Einnahmen-specific): `parseFilterState("einnahmen", url.searchParams)` (the Phase-2 registry already includes the **Kategorie** filter and the **"nur mit Rechnung"** boolean filter — bind to them, do not add new filters), year from `await parent()` (`yearScope`/`selectedYear`), `listEinnahmenPage({ state, year, limit, offset })`, `listEinnahmenKpi(year)`, `listKategorieOptions("income")` → `kategorieOptions`, `listMemberOptions()` → `memberOptions`. No preset is required for this tab. `columns.ts` exports the `ColumnDef[]`: **Datum** (Geldeingang), **ID** (mono, the `E`-prefixed businessId), **Bezeichnung** (+ a **🔗 badge render snippet** shown when `row.rechnungBusinessId` is non-null — a `ColumnDef.render` snippet, with `title`/`aria-label` "aus Rechnung {rechnungBusinessId}"), **Kategorie**, **Sphäre as a left color-rule** (render snippet, not a filled badge — §13), **Betrag** (right, `Money`). **No status column, no chevron-as-action-bulk, no bulk checkbox.** `EinnahmenKpi.svelte` renders the quiet anchor + a **horizontal-scroll chip strip** of the four Sphären-Split totals (mobile → `overflow-x-auto` strip per §8.1; all four always shown). `+page.svelte` renders `<TransactionListScaffold tab="einnahmen" {rows} {total} {page} {pageSize} {yearScope} {currentYear} {filterState} {kategorieOptions} {memberOptions} columns={einnahmenColumns} kpi={kpiSnippet} detailHrefBase="/app/einnahmen">` — **no `bulk` prop**, optional `emptyState` snippet for the no-rows case.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(einnahmen): list page + KPI Sphären-Split chips + columns (🔗 badge, Sphäre left-rule, no status)"`

---

### Task 3: Einnahme entry form — freie Einnahme → `createIncome` `[model: opus]`

The simplest of the three create paths: **no bezahlt-von, no auto-pay, no member-mail.** Beleg is OPTIONAL (contrast with Ausgaben's beleg-or-Begründung).

**Files:** Create `routes/app/einnahmen/neu/{+page.server.ts,+page.svelte}` + `components/admin/transactions/einnahmen/EinnahmeFields.svelte`; Test `tests/unit/einnahmen-create.server.test.ts` (mocked, mirrors `transactions/neu/page.server.test.ts`)

- [ ] **Step 1: Write the failing test** — (a) `?/create` with valid input calls `createIncome` exactly once with the derived non-null Kategorie + `kategorieSphere` snapshot (no project-sphere override), an `E`-prefixed `businessId` from `allocateBusinessId("E", year)`, then `redirect(303, "/app/einnahmen/" + id)`; (b) **no bezahlt-von branching** — assert no `markExpenseAsPaid`/notify-style call exists and the schema has no `bezahltVonKind`; (c) Beleg is optional — a submission with no `belegFileId` succeeds (contrast: must NOT require a Begründung); (d) festschreibung gate: `checkFestschreibungGate(year)` failure → `fail(gate.status)` and `createIncome` not called.

```ts
// einnahmen-create.server.test.ts (mock transactions.ts createIncome + id-allocator + festschreibung gate)
it("creates a freie Einnahme via createIncome (derived sphere, E-prefixed id), then redirects", async () => {
  /* invoke ?/create with bezeichnung, betrag, geldEingangDatum, kategorieNameSnapshot …
     expect createIncome called once with sphereSnapshot derived from the income kategorie,
     businessId from allocateBusinessId("E", year); expect redirect(303, /app/einnahmen/<id>) */
});
it("succeeds with NO Beleg (Beleg is optional for Einnahmen)", async () => {
  /* … no belegFileId; expect ok, no Begründung required */
});
it("never branches on bezahlt-von and never auto-pays", async () => {
  /* assert the schema rejects/ignores bezahltVonKind; no mark-paid call */
});
it("respects festschreibung gate", async () => {
  /* gate.ok=false → fail(gate.status); createIncome NOT called */
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/einnahmen-create.server.test.ts`

- [ ] **Step 3: Implement.** `EinnahmeFields.svelte` (the `fields` snippet for `EntryFormShell`): **Bezeichnung**, **Betrag** (existing `ui/money` + native number → hidden-cents), **Geldeingang** date (`ui/date-field` → `geldEingangDatum`), `KategoriePicker`+`SphereBadge` (income kategorien; the picker drives the displayed sphere — no project override), **Projekt** (optional), `BelegUpload` (**OPTIONAL** — no "Kein Beleg" → Begründung reveal; it is simply omissible), **Kommentar**. `+page.server.ts` `?/create`: Zod schema (Einnahmen-shaped: `bezeichnung`, `betragCents`, `geldEingangDatum`, `kategorieNameSnapshot` + `kategorieId`, `projectId?`, `belegFileId?`, `kommentar?` — **no** `bezahltVonKind`/`extern_*`); derive `sphereSnapshot` from the chosen income Kategorie (reuse the income-kategorie sphere resolution — no `projectSphereOverride`, per the Phase-1 `createIncome` contract); `checkFestschreibungGate(year)` (`fail` on gate); `allocateBusinessId("E", year)`; `createIncome({ ...parsed.data, sphereSnapshot, businessId, actorUserId: user.id })`; `redirect(303, "/app/einnahmen/" + result.id)`. `+page.svelte` renders `<EntryFormShell title="Neue Einnahme" action="?/create" submitLabel="Speichern" {submitting} {dirty} fields={einnahmeFields} {onClose}>`. Route conventions follow `spenden/+page.server.ts` (`fail`, `locals.session?.user.id`, formData→raw).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(einnahmen): entry form — freie Einnahme → createIncome (Beleg optional, no bezahlt-von, no auto-pay)"`

---

### Task 4: "Aus Rechnung" is NOT built here — surface-only note (no code) `[model: sonnet]`

> **No implementation task.** This is a deliberate scope-fence, recorded so a downstream worker does not "fill the gap."

- The Rechnung → Einnahme flow is the **shipped `markInvoiceAsPaid` on the Rechnung detail** (Rechnungen route): marking a Rechnung paid creates the linked income row and sets `invoices.paidByIncomeId`. **Do NOT** build a create-from-Rechnung flow, a Rechnung picker, or partial-payment handling on the Einnahmen tab.
- The Einnahmen tab's only responsibility toward that flow is **read-only surfacing**: the 🔗 badge in the list (Task 2, driven by `rechnungBusinessId`) and the "aus Rechnung FDW-…" context line on the detail (Task 5). Both consume the Phase-2 projection field — no Einnahmen-owned query joins `invoices`.
- **Action:** confirm no `?/create-from-rechnung` action, no invoice import, and no `invoices` import lands in any einnahmen-owned file. This is asserted in the Self-Review parallel-safety check (einnahmen owns no invoice write path).

_(No commit — this task only constrains Tasks 2 + 5.)_

---

### Task 5: Einnahme detail route — fields + Beleg + read-only 🔗 Rechnung context `[model: opus]`

**Files:** Create `routes/app/einnahmen/[id]/{+page.server.ts,+page.svelte}` + `components/admin/transactions/einnahmen/EinnahmeDetailFields.svelte`; Test `tests/unit/einnahme-detail.server.test.ts`

- [ ] **Step 1: Write the failing tests** — (a) `load` calls `getTransactionDetail(params.id, "income")`, 404s when missing, exposes `isFestgeschrieben`, and (when the row is Rechnung-linked) exposes the `rechnungBusinessId` so the detail can render the read-only context line; (b) `?/save` is festschreibung-gated (gate failure → `fail`); (c) when `isFestgeschrieben`, the load result marks the detail read-only (shell handles the disabling) and `?/save` rejects; (d) **no `?/mark-paid`, no `?/duplicate`, no write workflow** beyond `?/save` — assert those actions are absent (Einnahmen has no payment workflow on its own detail).

```ts
// einnahme-detail.server.test.ts (mock getTransactionDetail + festschreibung gate)
it("load fetches income detail, 404s when missing, exposes isFestgeschrieben", async () => {
  /* getTransactionDetail(id, "income") → detail incl. belegFileId/belegMimeType (Phase 3 Task 4) */
});
it("exposes rechnungBusinessId for the read-only 'aus Rechnung FDW-…' line when linked", async () => {
  /* detail.rechnungBusinessId set → load returns it; null → no context line */
});
it("?/save is festschreibung-gated", async () => {
  /* gate.ok=false → fail(gate.status) */
});
it("exposes no mark-paid and no duplicate action (Einnahmen has no payment workflow)", async () => {
  /* assert actions object has only `save` */
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/einnahme-detail.server.test.ts`

- [ ] **Step 3: Implement.** `[id]/+page.server.ts`: `load` → `getTransactionDetail(params.id, "income")` (now carries `belegFileId`/`belegMimeType` from Phase 3 Task 4); 404 via `error(404)` when missing; expose `isFestgeschrieben` (festschreibung check on the row's Buchungsjahr) + `rechnungBusinessId` (read straight off the detail / Phase-2 projection — do **not** join `invoices` here). Actions: **only** `?/save` (festschreibung-gated update of the editable income fields). `EinnahmeDetailFields.svelte` = the editable fields (Bezeichnung, Betrag, Geldeingang, Kategorie+Sphäre, Projekt, Kommentar). `+page.svelte` renders `<DetailModalShell {detail} {isFestgeschrieben} fields={einnahmeDetailFields} beleg={belegSnippet} workflowAction={rechnungContextSnippet} {saving} {dirty}>` where `beleg` renders `<BelegViewer fileId={detail.belegFileId} mimeType={detail.belegMimeType} originalFilename={detail.belegOriginalFilename} mode="inline" />` (or `mode="fold"` on mobile) **only when `belegFileId` is set**, and `workflowAction` is a **read-only info slot** (not an action button): when `rechnungBusinessId` is set it renders the line "aus Rechnung {rechnungBusinessId}" (optionally a link to `/app/rechnungen/<…>` if the detail also carries the invoice id), and renders nothing when null. Festgeschrieben → fields read-only (shell handles via `isFestgeschrieben`).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(einnahmen): detail route — fields + BelegViewer + read-only 'aus Rechnung FDW-…' context"`

---

### Task 6: Phase-boundary verification + milestone `[model: opus]`

- [ ] **Step 1: Pure.** `pnpm test:fast --run $(git ls-files 'tests/unit/*einnahmen*' 'src/lib/server/domain/einnahmen-kpi*' | tr '\n' ' ')` (the pure ones — e.g. the `foldSphereBuckets` helper test, if extracted).
- [ ] **Step 2: DB/route/component.** `pnpm test --run tests/integration/einnahmen-kpi.test.ts tests/unit/einnahmen-page.server.test.ts tests/unit/einnahmen-create.server.test.ts tests/unit/einnahme-detail.server.test.ts src/lib/components/admin/transactions/einnahmen/EinnahmenKpi.test.ts`
- [ ] **Step 3: e2e.** `pnpm test:e2e --grep @phase-5-einnahmen` (create freie Einnahme → appears in list with derived sphere + no 🔗; KPI shows four Sphären-Split chips incl. an empty one; a `markInvoiceAsPaid`-seeded income shows the 🔗 badge in the list + the "aus Rechnung FDW-…" line on the detail; festgeschriebenes Jahr → detail read-only).
- [ ] **Step 4: Typecheck + lint.** `pnpm check && pnpm lint`
- [ ] **Step 5: Tag.** `git tag -f phase-5-einnahmen-complete`

---

## Self-Review

1. **Spec §8 coverage:** KPI anchor + Sphären-Split chips (mobile horizontal-scroll strip), no offen-pill (T1/T2) ✓; columns Datum/ID/Bezeichnung(+🔗)/Kategorie/Sphäre-left-rule/Betrag, **no status** (T2) ✓; freie-Einnahme entry form → `createIncome`, Beleg optional, no bezahlt-von, no auto-pay (T3) ✓; "Aus Rechnung" explicitly **not built here** — surface-only via 🔗 (T4 fence) ✓; detail route with `BelegViewer` + read-only "aus Rechnung FDW-…" context, festschreibung read-only, no mark-paid/duplicate (T5) ✓. Cross-refs §6 (filter backbone — bind `parseFilterState("einnahmen", …)`, Kategorie + "nur mit Rechnung"), §10/§11 (kit + year scope), §13 (Sphäre left color-rule, not filled badge) ✓.
2. **Parallel-safety:** every owned file is under `routes/app/einnahmen/**` + `components/admin/transactions/einnahmen/**`, plus the C2-owned `src/lib/server/domain/einnahmen-kpi.ts` (KPI aggregation in its **own** file, not `transactions.ts` — mirrors Phase 4's `ausgaben-kpi.ts` discipline). **No shared-file edits**, **no shared-route exception** (Einnahmen, unlike Phase 4's inbox, is fully self-contained), **no `invoices` import / no invoice write path** anywhere in einnahmen-owned files (T4). Binds to Phase-1/2/3 contracts read-only. Safe to run concurrently with Phase 4 (Ausgaben) and Phase 6 (Spenden).
3. **No placeholders:** logic tasks (KPI sphere-fold T1, the `createIncome` action T3, the read-only 🔗 surfacing in load/columns T2+T5) are full TDD; UI wiring (KPI strip, scaffold/shell binding, BelegViewer slot) is contract-bound with a component/route test.
4. **⚠ Cross-phase dependency (must verify before T2/T5):** the 🔗 badge + the "aus Rechnung FDW-…" context line depend on `listEinnahmenPage` projecting **`rechnungBusinessId: string | null`** via the Phase-2 left-join `invoices.paidByIncomeId = income.id`. This field is **Phase-2-owned**; do not add the join in any einnahmen file. If Phase 2 has not shipped it, T2's 🔗 column render and T5's context line are blocked — raise it back to Phase 2 rather than working around it. Likewise the detail's `belegFileId`/`belegMimeType` come from `getTransactionDetail(id, "income")` (Phase 3 Task 4) — read-only.
5. **Old-route cleanup** (deleting the shared `transactions/[id]`, `transactions/neu`, the legacy `TransactionsList.svelte`) is **NOT here** — it is a Tier-D (Phase 8) cleanup once all three tabs ship, to keep C-tracks conflict-free.
