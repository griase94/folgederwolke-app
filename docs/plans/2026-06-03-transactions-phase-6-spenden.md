# Transactions Phase 6 — Spenden tab (Tier C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`. Read the ROADMAP (Parallelization map — Tier C / C3) + spec **§9** (the Spenden tab) + **§4.3** (Sachspende Wertermittlung) + §4.5 (sphere derivation) + §6 (year scope) + §10 (detail page) + §11 (Beleg viewer) + §13 (visual). **Depends on Phases 1, 2, 3 + track A3 merged.** This is a **Tier-C parallel track** — it owns `routes/app/spenden/**` + `components/admin/transactions/spenden/**` + `components/admin/spenden/**` + `src/lib/server/domain/spenden.ts`, and MOVES the `zuwendungsbestaetigung` route under `spenden/`. It may run concurrently with Phase 4 (Ausgaben) and Phase 5 (Einnahmen). **Do not edit shared files** (the Phase-3 kit, `transactions.ts`, `FilterBar`, `transaction-filter-sql.ts`); if a shared change is needed, it goes back to Phase 3. Branch/worktree: a C3 worktree off the merged Phase-1-2-3 base.

**Goal:** The Spenden tab — the **most divergent** of the three tabs. List (KPI "N ohne Bescheinigung" pill that disappears at zero + "M Bescheinigungen versandt", **no fake Sammelbestätigungs-Fenster deadline**), the **3-picker derived-Kategorie** entry form (Spendenart / Zweckbindung / Spender, with the Sachspende-Wertermittlung reveal and a **read-only derived-Kategorie badge** — no Kategorie picker), the detail route with the **"Bescheinigung erstellen"** workflow action, the **MOVE** of the `zuwendungsbestaetigung` route under `spenden/`, and **retirement** of the old `/app/transactions/spenden` route + `AddSpendeDialog`/`EditSpendeDialog` + direct-`donations` load.

**Architecture:** Thin route files binding to the Phase-3 shared kit. `routes/app/spenden/+page.server.ts` calls `listSpendenPage` (Phase 2) + a new C3-owned `listSpendenKpi` (this phase) and renders `TransactionListScaffold` with a Spenden `kpi` snippet, `columns`, `detailHrefBase="/app/spenden"` (no `bulk`). The entry form uses `EntryFormShell` + a Spenden `fields` snippet (3 pickers + Sachspende reveal + derived-Kategorie badge); its create action calls **`createDonation`** (Phase 1 — which DERIVES kategorie name + id + `sphere='ideeller'` from `spendeKind`+`zweckbindungKind`). The form does **not** re-derive Kategorie. The detail route uses `DetailModalShell` + `BelegViewer` (via the `beleg` snippet, which can render `belegFileId` and/or the Sachspende `herkunftsbelegFileId`), with **"Bescheinigung erstellen"** routing to the moved `zuwendungsbestaetigung` route (`allocateBescheinigung`). `spenden.ts` is **C3-owned**: it is reconciled to delegate its insert path to `createDonation` (keeping its Zod validation) and remains the action layer for the Bescheinigung workflow.

**Tech Stack:** SvelteKit, Drizzle, Vitest (fast lane for pure KPI math + derivation/validation; reset lane for DB + component/route tests).

**Testing approach:** per-step single-file; pure → `pnpm test:fast --run <file>`; DB/route/component → `pnpm test --run <file>`. Broad runs only at the phase-boundary task (Task 8).

**Granularity note:** logic-heavy tasks (KPI math, the `createSpende→createDonation` reconciliation + derivation, the Bescheinigung workflow, the route MOVE) are full TDD. Per-tab **Svelte content** tasks (Spenden `fields` snippet, columns, detail fields) are **contract-bound**: they bind to the locked Phase-3 prop contracts (`TransactionListScaffold`/`EntryFormShell`/`DetailModalShell`/`BelegViewer`) with one component/route test asserting the binding + the conditional reveals — exhaustive per-line markup TDD is not required.

**Owned files (C3):**

- `routes/app/spenden/{+page.server.ts,+page.svelte,neu/+page.server.ts,neu/+page.svelte,[id]/+page.server.ts,[id]/+page.svelte}`
- `routes/app/spenden/[id]/zuwendungsbestaetigung/{+page.server.ts,+page.svelte,pdf/+server.ts}` (MOVED from `routes/app/transactions/[id]/zuwendungsbestaetigung/`)
- `components/admin/transactions/spenden/{SpendenKpi.svelte,columns.ts,SpendeFields.svelte,SpendeDetailFields.svelte,DerivedKategorieBadge.svelte}`
- `components/admin/spenden/**` (existing `SpendeDetailCard`, `BescheinigungsPreview`, `SpendeRow`, `SpendenList`; RETIRE `AddSpendeDialog`/`EditSpendeDialog`)
- `src/lib/server/domain/spenden.ts` + `src/lib/server/domain/spenden-kpi.ts` (new)

**Shared deps (read-only — bind, never edit):** `TransactionListScaffold`, `EntryFormShell`, `DetailModalShell`, `BelegViewer`, `FilterBar`, `listSpendenPage`, `createDonation`, `getTransactionDetail(id,"donation")`, `deriveDonationKategorieName` (`$lib/domain/spenden-kategorie.ts`, Phase 1), `parseFilterState`, `checkFestschreibungGate`, `listMemberOptions`, `selectYearOrAllFromUrl`/`ALL_YEARS`.

> **⚠ Reconciliation flag (decide in Task 4, asserted in Self-Review):** the shipped `spenden.ts` `createSpende`/`editSpende` are the **pre-Phase-1** path: they take a `kategorie_id` from the UI, apply the **project sphere override** (ADR-0008), and pack Sachspende facts (`sache_beschreibung`/`sache_wertermittlung`) into a `"Sache: …"` string inside `zweckbindungText`. Phase 1's `createDonation` instead **derives** kategorie+`sphere='ideeller'` and §4.3 adds dedicated `wertermittlungMethode`/`zustandBeschreibung`/`herkunftsbelegFileId` columns + a `zweckbindungText`-when-zweckgebunden CHECK. C3 reconciles this (Task 4): keep the valuable Zod validation, drop the Kategorie picker + project-override branch, delegate the insert to `createDonation`, and write Sachspende facts to the real columns instead of the `"Sache:"` string hack.

> **⚠ Review amendments (verified against real code — apply when executing):**
> - **B1 (the fatal one) is resolved upstream:** Phase 1's `createDonation` is review-amended to accept & persist `wertermittlungMethode`/`zustandBeschreibung`/`herkunftsbelegFileId`/`belegFileId`. So routing the Sachspende create through `createDonation` now satisfies the `donations_sachspende_wertermittlung_ck` CHECK. **Confirm Phase 1's amended Task 6 merged before starting Task 4.** C3 still must NOT edit `transactions.ts`/`createDonation` itself.
> - **Dangling tests (Task 3 grep MUST include `tests/`):** deleting `AddSpendeDialog`/`EditSpendeDialog` and rewriting `spendeInputSchema` breaks **`tests/unit/c6-form-consumers.test.ts`**, **`tests/unit/c9-date-input-lang.test.ts`**, **`tests/unit/c9-submit-labels.test.ts`** (they `read()` the dialog files) and **`tests/unit/spenden.test.ts`** (`validateSpendeInput` asserts the legacy `kategorie_id`/`sache_*` shape). Add explicit Task 3/Task 4 steps to remove the dialog entries from those file-lists + rewrite/retire the `spenden.test.ts` block. Task 8's boundary run must include these suites (else they fail silently at CI, post-merge).
> - **Double-audit decision (decide now, not at impl):** after delegating to `createDonation`, **drop the `spende.created` emit** from `createSpende` and let `donation.created` be the single audit event (ADR-0004 append-only — can't clean up later).
> - **Two legacy `"Sache:"` parse sites:** update BOTH `extractBmfPflichtfelder` AND `allocateBescheinigung` in `spenden.ts` to read `zustandBeschreibung` (not `zweckbindungText.split("Sache:")`) — the plan's Task 4 named only one; the Bescheinigung PDF reads the other.
> - **Detail fields** (`wertermittlungMethode`/`zustandBeschreibung`/`herkunftsbelegFileId`/`zweckbindungText`/`spenderAdresse`) come from `getTransactionDetail(id,"donation")` per Phase 3 Task 4 (review-amended) — pin that dependency.

---

### Task 1: `listSpendenKpi` — total + ohne-Bescheinigung count + versandt count `[model: opus]`

Money aggregation + two Bescheinigung counts; powers the KPI anchor + the disappearing "N ohne Bescheinigung" pill + "M Bescheinigungen versandt" (spec §9.1). **No** Sammelbestätigungs-Fenster / deadline field — spec §9.1 explicitly removes it (no statutory cutoff → no false signal).

**Files:** Create `src/lib/server/domain/spenden-kpi.ts` (C3-owned — KPI aggregation must NOT live in the shared `transactions.ts`); Test `tests/integration/spenden-kpi.test.ts`

- [ ] **Step 1: Write the failing test** (DB; the Phase-1 §4.7 corpus seeds an issued Geldspende, an ausstehende Geldspende, and an ausstehende Sachspende — so `ohneBescheinigungCount ≥ 2` and `versandtCount ≥ 1`).

```ts
// tests/integration/spenden-kpi.test.ts
import { describe, it, expect } from "vitest";
import { listSpendenKpi } from "$lib/server/domain/spenden-kpi.js";
import { ALL_YEARS } from "$lib/domain/year.js";

describe("listSpendenKpi", () => {
  it("returns total sum + count + ohne-Bescheinigung + versandt counts", async () => {
    const kpi = await listSpendenKpi(2026);
    expect(typeof kpi.totalCents).toBe("number");
    expect(typeof kpi.count).toBe("number");
    expect(typeof kpi.ohneBescheinigungCount).toBe("number");
    expect(typeof kpi.versandtCount).toBe("number");
    // corpus (§4.7): ≥1 ausstehend + ≥1 issued in 2026
    expect(kpi.ohneBescheinigungCount).toBeGreaterThanOrEqual(1);
    expect(kpi.versandtCount).toBeGreaterThanOrEqual(1);
    // No deadline/Fenster field exists (spec §9.1).
    expect("sammelfensterDeadline" in kpi).toBe(false);
  });
  it("supports ALL_YEARS (omits the year predicate)", async () => {
    const kpi = await listSpendenKpi(ALL_YEARS);
    expect(kpi.count).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/integration/spenden-kpi.test.ts`

- [ ] **Step 3: Implement** `listSpendenKpi(year: YearScope): Promise<{ totalCents: number; count: number; ohneBescheinigungCount: number; versandtCount: number }>`. One grouped query over `donations` (year predicate `eq(donations.yearOfBuchung, year)` unless `ALL_YEARS`): `sum(betragCents)` + `count(*)`; `ohneBescheinigungCount` = `count(*) FILTER (WHERE bescheinigung_nr IS NULL)`; `versandtCount` = `count(*) FILTER (WHERE bescheinigung_nr IS NOT NULL)`. Mirror the dashboard aggregation pattern (`loadDashboardKpis`). `BigInt → Number` for cents. **Do not** compute any deadline/window.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(spenden): listSpendenKpi (total + ohne-Bescheinigung + versandt counts, no fake Fenster)"`

---

### Task 2: Spenden list page + KPI strip + columns `[model: opus]`

Spec §9.1: list + KPI + Bescheinigung column. No bulk, no status column.

**Files:** Create `routes/app/spenden/+page.server.ts` (replace the Phase-3 placeholder), `+page.svelte`, `components/admin/transactions/spenden/{SpendenKpi.svelte,columns.ts}`; Test `tests/unit/spenden-page.server.test.ts` (mocked) + `…/spenden/SpendenKpi.test.ts`

- [ ] **Step 1: Write the failing tests** — (a) `load` parses filters + year (`selectYearOrAllFromUrl` via layout `yearScope`), calls `listSpendenPage` + `listSpendenKpi`, returns both + `memberOptions` (the Spender filter) — and **does NOT** call `listKategorieOptions` (Spenden has no Kategorie filter — §9.1); (b) `SpendenKpi` renders the anchor + a "N ohne Bescheinigung" pill that is **absent when ohneBescheinigungCount===0** (spec §9.1 delight) + "M Bescheinigungen versandt".

```ts
// SpendenKpi.test.ts
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import SpendenKpi from "./SpendenKpi.svelte";

it("hides the ohne-Bescheinigung pill when zero", () => {
  render(SpendenKpi, {
    props: {
      totalCents: 250000,
      count: 12,
      ohneBescheinigungCount: 0,
      versandtCount: 12,
      year: 2026,
    },
  });
  expect(screen.queryByText(/ohne Bescheinigung/i)).toBeNull();
});
it("shows 'N ohne Bescheinigung' + 'M versandt' when > 0", () => {
  render(SpendenKpi, {
    props: {
      totalCents: 250000,
      count: 12,
      ohneBescheinigungCount: 3,
      versandtCount: 9,
      year: 2026,
    },
  });
  expect(screen.getByText(/3 ohne Bescheinigung/)).toBeTruthy();
  expect(screen.getByText(/9 .*versandt/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/spenden-page.server.test.ts` then `pnpm test --run src/lib/components/admin/transactions/spenden/SpendenKpi.test.ts`

- [ ] **Step 3: Implement.** `+page.server.ts` `load`: `parseFilterState("spenden", url.searchParams)`, year from `await parent()` (`yearScope`), `listSpendenPage({ state, year, limit, offset })`, `listSpendenKpi(year)`, `listMemberOptions()` (Spender filter). `columns.ts` exports the `ColumnDef[]` per §9.1: **Datum, ID (mono), Spender, Art (Spendenart badge — Geldspende/Sachspende), Zweckbindung (zweckfrei/zweckgebunden), Betrag (right, `Money`), Bescheinigung** (render snippet: the B-Nummer when `bescheinigungNr` set, else a quiet "ausstehend"), chevron. No Status column; no Sphäre rule (Spenden are always ideeller — a constant, so omit the per-row rule to avoid noise). `SpendenKpi.svelte`: quiet anchor `<Jahr|Alle> · <Summe> · <N> Spenden` + the disappearing "N ohne Bescheinigung" pill + "M Bescheinigungen versandt". `+page.svelte` renders `<TransactionListScaffold tab="spenden" {rows} {total} {page} {pageSize} selectedYear={yearScope} {currentYear} filterState={state} kategorieOptions={[]} memberOptions={memberOptions} columns={spendenColumns} kpi={kpiSnippet} detailHrefBase="/app/spenden">` (no `bulk` prop).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(spenden): list page + KPI strip + columns (Bescheinigung column, disappearing ohne-Bescheinigung pill)"`

---

### Task 3: Retire old `/app/transactions/spenden` route + `Add`/`Edit` dialogs `[model: sonnet]`

Spec §15 + ROADMAP C3: migrate the old client-side direct-`donations` load to `listSpendenPage` + `EntryFormShell`. The old route at `routes/app/transactions/spenden/` did a full-table `db.select().from(donations)` load and posted to `?/add`/`?/edit`/`?/delete` from `AddSpendeDialog`/`EditSpendeDialog`. Phase 3 already 308-redirects `/app/transactions` → `/app/ausgaben`, but the nested `transactions/spenden` route still resolves until removed here.

**Files:** Delete `routes/app/transactions/spenden/{+page.server.ts,+page.svelte}`; delete `components/admin/spenden/{AddSpendeDialog.svelte,EditSpendeDialog.svelte}`; Test: update `tests/e2e/spenden.spec.ts` (currently `@phase-5`, navigates `/app/transactions/spenden`) → point at `/app/spenden`, retag `@phase-6-spenden`

- [ ] **Step 1: Write/adjust the failing test** — the e2e nav test visits `/app/spenden` (200) and the old `/app/transactions/spenden` no longer resolves to the legacy page (it redirects or 404s, per Phase-3 redirect). Keep this as the one e2e touched here; the deep create/Bescheinigung e2e lands in Task 8.
- [ ] **Step 2: Run → fails.** `pnpm test:e2e --grep @phase-6-spenden` (the nav case).
- [ ] **Step 3: Implement** the deletions. Confirm no remaining import references `AddSpendeDialog`/`EditSpendeDialog` (`grep -rn "AddSpendeDialog\|EditSpendeDialog" src`) — the only consumer was the old route. Remove the now-dead `?/add`/`?/edit`/`?/delete` actions with the route. (The `delete`/hard-delete-pre-Bescheinigung rule moves to the detail route in Task 6.)
- [ ] **Step 4: Run → passes.**
- [ ] **Step 5: Commit.** `git commit -m "refactor(spenden): retire /app/transactions/spenden route + Add/EditSpendeDialog (migrated to listSpendenPage + EntryFormShell)"`

---

### Task 4: Reconcile `spenden.ts` create/edit → delegate to `createDonation` (derived) `[model: opus]`

**The hardest task — the dual-path reconciliation (flagged above).** Keep the rich Zod validation in `spenden.ts` (spender member-XOR-name+address; Sachspende requires Beschreibung + Wertermittlung; `zweckbindung_text` required when zweckgebunden; Aufwandsspende rejected with a clear message), but **drop** the UI-supplied `kategorie_id` and the **project sphere-override branch** (§4.5: donation sphere is always `ideeller`, never the project default), and **delegate the insert to `createDonation`** (Phase 1, which derives kategorie name+id via `deriveDonationKategorieName(spendeKind, zweckbindungKind)` and sets `sphere='ideeller'`). Write Sachspende facts to the real §4.3 columns (`wertermittlungMethode`, `zustandBeschreibung`, `herkunftsbelegFileId`) **instead of** the legacy `"Sache: …"` string packed into `zweckbindungText`.

**Files:** Modify `src/lib/server/domain/spenden.ts` (C3-owned); Test `tests/integration/spenden-create-reconcile.test.ts`

- [ ] **Step 1: Write the failing test** — drive `createSpende` end to end and assert it routes through the derived path:

```ts
// tests/integration/spenden-create-reconcile.test.ts  (DB, app_runtime identity)
import { describe, it, expect } from "vitest";
import { createSpende } from "$lib/server/domain/spenden.js";
import { getTransactionDetail } from "$lib/server/domain/transactions.js";

describe("createSpende delegates to createDonation (derived kategorie + sphere)", () => {
  it("Geldspende zweckfrei → sphere ideeller + derived Kategorie, no UI kategorie_id needed", async () => {
    const r = await createSpende(
      {
        spende_kind: "geldspende",
        zweckbindung_kind: "zweckfrei",
        zugewendet_am: "2026-03-01",
        betragCents: "5000",
        spender_name: "Erika Externe",
        spender_adresse: "Hauptstr. 1, 10115 Berlin",
        // NOTE: no kategorie_id supplied — it is derived server-side now
      },
      "user-1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = await getTransactionDetail(r.donationId, "donation");
    expect(d!.sphereSnapshot).toBe("ideeller");
    expect(d!.kategorieNameSnapshot).toBe(
      // matches deriveDonationKategorieName("geldspende","zweckfrei")
      "Geldspende zweckfrei",
    );
  });
  it("project with a non-ideeller sphere_default does NOT change the booking sphere (§4.5)", async () => {
    const r = await createSpende(
      {
        spende_kind: "geldspende",
        zweckbindung_kind: "zweckgebunden",
        zweckbindung_text: "Festival 2026",
        zugewendet_am: "2026-03-02",
        betragCents: "9000",
        spender_name: "Max Mustermann",
        spender_adresse: "Weg 2, 10117 Berlin",
        project_id: SEEDED_WIRTSCHAFTLICH_PROJECT_ID, // sphere_default = wirtschaftlich
      },
      "user-1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = await getTransactionDetail(r.donationId, "donation");
    expect(d!.sphereSnapshot).toBe("ideeller"); // NOT wirtschaftlich
  });
  it("Sachspende writes Wertermittlung to the real columns, not the 'Sache:' string", async () => {
    const r = await createSpende(
      {
        spende_kind: "sachspende",
        zweckbindung_kind: "zweckfrei",
        zugewendet_am: "2026-03-03",
        betragCents: "12000", // gemeiner Wert (§9 BewG)
        spender_name: "Sach Spender",
        spender_adresse: "Gasse 3, 10119 Berlin",
        wertermittlung_methode: "marktpreis",
        zustand_beschreibung: "Gebraucht, gut erhalten",
      },
      "user-1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = await getTransactionDetail(r.donationId, "donation");
    expect(d!.wertermittlungMethode).toBe("marktpreis");
    expect(d!.zustandBeschreibung).toBe("Gebraucht, gut erhalten");
    expect(d!.zweckbindungText ?? "").not.toContain("Sache:");
  });
  it("still rejects Aufwandsspende + missing spender identity (validation kept)", async () => {
    const a = await createSpende({ spende_kind: "aufwandsspende" }, "user-1");
    expect(a.ok).toBe(false);
    const b = await createSpende(
      {
        spende_kind: "geldspende",
        zweckbindung_kind: "zweckfrei",
        betragCents: "100",
        zugewendet_am: "2026-01-01",
      },
      "user-1",
    );
    expect(b.ok).toBe(false); // no member_id and no name+adresse
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/integration/spenden-create-reconcile.test.ts`

- [ ] **Step 3: Implement.** In `spenden.ts`:
  - Extend `spendeInputSchema`: replace the legacy `sache_wertermittlung` enum + `sache_beschreibung` with the §4.3 fields — `wertermittlung_methode: z.enum(["marktpreis","kaufbeleg","schaetzung","buchwert"])` (required when `spende_kind==='sachspende'`), `zustand_beschreibung: z.string().min(3)` (required when sachspende), optional `herkunftsbeleg_file_id: z.string().uuid()`, optional main `beleg_file_id: z.string().uuid()`. **Remove** `kategorie_id` from the schema (no longer UI-supplied). Keep the spender XOR + zweckbindung_text superRefine.
  - In `createSpende`: after validation + member-snapshot resolution, **call `createDonation(...)`** (Phase 1) with `{ betragCents, currency, zugewendetAm, memberId, spenderName, spenderAdresse, spenderEmail, spendeKind, zweckbindungKind, zweckbindungText, wertermittlungMethode, zustandBeschreibung, herkunftsbelegFileId, belegFileId, projectId, actorUserId, businessId }` — and let `createDonation` derive `kategorieId`/`kategorieNameSnapshot`/`sphere='ideeller'` (do **not** pass them). Drop the `kategorien` lookup + the `projects.sphereDefault` override block entirely. Keep the `allocateBusinessId("S", year)` call. The `bus.emit("spende.created", …)` already fires inside `createDonation` (`donation.created`); remove the duplicate `spende.created` emit OR keep it as the spenden-specific event — pick one and note it (avoid double audit rows).
  - In `editSpende`: same schema; keep the "bereits bescheinigt → 409" + festschreibung 409 guards; update the §4.3 columns directly (no `kategorie_id`/sphere mutation — Kategorie is derived and re-derived only if spendeKind/zweckbindung change → re-run `deriveDonationKategorieName`).
  - `allocateBescheinigung`/`extractBmfPflichtfelder`/`betragInWorten`/`isBescheinigungEnabled`/`bescheidTypOrNull` are **unchanged** (the Bescheinigung workflow is correct and reused). Update `extractBmfPflichtfelder`'s `sacheBeschreibung` to read `zustandBeschreibung` (the real column) instead of splitting the `"Sache:"` string.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "refactor(spenden): createSpende/editSpende delegate to createDonation (derived kategorie+ideeller sphere), Wertermittlung to real columns (§4.3/§4.5)"`

---

### Task 5: Spende entry form — 3 pickers + Sachspende reveal + derived badge `[model: opus]`

The 3-picker derived form is the trickiest tab UI (spec §9.2). `EntryFormShell` + a Spenden `fields` snippet. **No Kategorie picker** — a read-only derived badge instead.

**Files:** Create `routes/app/spenden/neu/{+page.server.ts,+page.svelte}` + `components/admin/transactions/spenden/{SpendeFields.svelte,DerivedKategorieBadge.svelte}`; Test `tests/unit/spenden-create.server.test.ts` (mocked) + `…/spenden/DerivedKategorieBadge.test.ts`

- [ ] **Step 1: Write the failing tests** — (a) the route `?/create` action posts the 3-picker fields and calls `createSpende` (the reconciled Task-4 path) — **not** a re-derivation in the form; asserts a zweckgebunden post without `zweckbindung_text` fails (422), a Sachspende post without `wertermittlung_methode`/`zustand_beschreibung` fails (422); (b) `DerivedKategorieBadge` renders "Wird gebucht als Ideeller · Kategorie {name}" from `(spendeKind, zweckbindungKind)` via `deriveDonationKategorieName`, degrading to "Sphäre · Kategorie" when no Anlage-Zeile (spec §4.7 note + §9.2).

```ts
// DerivedKategorieBadge.test.ts
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import DerivedKategorieBadge from "./DerivedKategorieBadge.svelte";

it("shows the derived Ideeller + Kategorie for the chosen pickers (no Zeile)", () => {
  render(DerivedKategorieBadge, {
    props: {
      spendeKind: "geldspende",
      zweckbindungKind: "zweckgebunden",
      anlageGemZeile: null,
    },
  });
  expect(screen.getByText(/Ideeller/)).toBeTruthy();
  expect(screen.getByText(/Geldspende zweckgebunden/)).toBeTruthy();
  expect(screen.queryByText(/Anlage Gem Zeile/)).toBeNull(); // degrades gracefully
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/spenden-create.server.test.ts` then `pnpm test --run src/lib/components/admin/transactions/spenden/DerivedKategorieBadge.test.ts`

- [ ] **Step 3: Implement.**
  - `SpendeFields.svelte` (the `fields` snippet content): **Spendenart\*** segmented (Geldspende / Sachspende / **Aufwand — disabled**, with a "Phase 2" tooltip); **Zweckbindung\*** (zweckfrei / zweckgebunden → reveals the **required** Zweckbindungs-Text, § 55 AO); **Projekt** (optional combobox, for Mittelverwendung); the **Sachspende reveal block** (shown only when `spendeKind==='sachspende'`): Gemeiner Wert\* (= the Betrag field, label clarifies "§ 9 BewG"), Wertermittlungsmethode\* (`marktpreis`/`kaufbeleg`/`schaetzung`/`buchwert`), Zustandsbeschreibung\*, optional Herkunftsbeleg (`BelegUpload`); **Spender\*** segmented (Mitglied → member combobox with **address autofill**, or Externe Person → Name\* + Adresse\* + Email); optional main Beleg/Kontoauszug (Geldspende, §4.3 — encouraged not enforced); and the **`<DerivedKategorieBadge spendeKind zweckbindungKind/>`** (read-only). Betrag via native `number step=0.01` → hidden cents (the established `neu` pattern); date via `ui/date-field`. The conditional reveals animate without layout jank; the modal body scrolls with the footer pinned (handled by `EntryFormShell`).
  - `DerivedKategorieBadge.svelte`: pure presentational; calls `deriveDonationKategorieName(spendeKind, zweckbindungKind)` (Phase 1) for the name, hard-codes "Ideeller" (§4.5), shows "· Anlage Gem Zeile X" only when a Zeile is known. The styled hint component per §13 (three facts: Sphäre / Kategorie / Anlage-Zeile), not debug text.
  - `+page.server.ts` `?/create`: read FormData → `createSpende(raw, locals.session?.user.id ?? null)` (Task-4 reconciled). On `!ok` → `fail(result.status, { errors, values })`; on ok → `redirect(303, "/app/spenden/" + result.donationId)`. `+page.svelte` renders `<EntryFormShell title="Neue Spende" action="?/create" submitLabel="Speichern" {submitting} {dirty} fields={spendeFields} onClose={…}>`.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(spenden): 3-picker entry form (Sachspende Wertermittlung reveal + read-only derived-Kategorie badge, createDonation)"`

---

### Task 6: Spende detail route — fields + Wertermittlung + Bescheinigung action `[model: opus]`

Spec §10 + §9: `DetailModalShell` + Spenden detail fields (incl. Sachspende Wertermittlung threaded by Phase 3 Task 4) + **"Bescheinigung erstellen" workflowAction** + `BelegViewer` via the `beleg` snippet (can show `belegFileId` and/or the Sachspende `herkunftsbelegFileId`). Festschreibung + **bescheinigte-Spende** read-only (deletion blocked once bescheinigt — the existing rule, moved here from the retired route).

**Files:** Create `routes/app/spenden/[id]/{+page.server.ts,+page.svelte}` + `components/admin/transactions/spenden/SpendeDetailFields.svelte`; Test `tests/unit/spende-detail.server.test.ts`

- [ ] **Step 1: Write the failing tests** — (a) `load` calls `getTransactionDetail(id, "donation")`, 404s when missing, exposes `isFestgeschrieben` + the threaded donation fields (`zweckbindungText`, `spenderAdresse`, `wertermittlungMethode`, `zustandBeschreibung`, `herkunftsbelegFileId`); (b) `?/save` reuses `editSpende` + festschreibung gate + **rejects edit when `bescheinigungNr` is set** (409, existing rule); (c) `?/delete` blocks once `bescheinigungNr` set (409) — the rule moved from the retired route; (d) the "Bescheinigung erstellen" action navigates to `/app/spenden/{id}/zuwendungsbestaetigung` (asserted in the page test, Step 3, or as an href in the detail render).

```ts
// spende-detail.server.test.ts (mock getTransactionDetail + editSpende)
it("load exposes the threaded Sachspende Wertermittlung fields", async () => {
  /* getTransactionDetail mock returns wertermittlungMethode/zustandBeschreibung/herkunftsbelegFileId → assert passed through */
});
it("save rejects a bescheinigte Spende (409)", async () => {
  /* editSpende mock returns {ok:false,status:409} → expect fail(409) */
});
it("delete blocks once bescheinigt (409)", async () => {
  /* … */
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/spende-detail.server.test.ts`

- [ ] **Step 3: Implement.** `[id]/+page.server.ts`: `load` → `getTransactionDetail(params.id, "donation")` (carries the donation fields from Phase 3 Task 4) + `isFestgeschrieben` via the detail's festschreibung field. Actions: `?/save` (festschreibung + bescheinigt gate → `editSpende`), `?/delete` (hard-delete pre-Bescheinigung, blocked once `bescheinigungNr` set or festgeschrieben — port the guard from the retired route). `SpendeDetailFields.svelte` = the editable fields (Spendenart, Zweckbindung+Text, Spender, Projekt) **plus a read-only Sachspende Wertermittlung block** (gemeiner Wert, Methode, Zustand) when `spendeKind==='sachspende'`, reusing `SpendeDetailCard` where it already renders these. `+page.svelte` renders `<DetailModalShell {detail} {isFestgeschrieben} fields={detailFields} workflowAction={bescheinigungSnippet} beleg={belegSnippet} {saving} {dirty}>` where:
  - `bescheinigungSnippet` = a "Bescheinigung erstellen" link/button → `href="/app/spenden/{detail.id}/zuwendungsbestaetigung"` (disabled with a hint when `!bescheinigungEnabled` — `isBescheinigungEnabled()`; shows the B-Nummer when already issued).
  - `belegSnippet` = `<BelegViewer fileId={detail.belegFileId} …/>` and/or, for Sachspenden, `<BelegViewer fileId={detail.herkunftsbelegFileId} …/>` (render both when both present; the shell takes the snippet, not `detail.belegFileId`, exactly so Spenden can do this — Phase 3 Task 9 review note S2). Festgeschrieben OR bescheinigt → read-only (shell hides save; show the amber lock notice "Korrektur nur über Storno (Phase 2)" for festgeschrieben, "Bescheinigt — Storno + Neu-Erfassung (Phase 2)" for bescheinigt).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(spenden): detail route — Wertermittlung view + Bescheinigung-erstellen action + Beleg/Herkunftsbeleg viewer + bescheinigt/festschreibung read-only"`

---

### Task 7: MOVE `zuwendungsbestaetigung` route under `spenden/[id]/` `[model: opus]`

ROADMAP C3 + spec §10/§15: move the 3-file Bescheinigung route from `routes/app/transactions/[id]/zuwendungsbestaetigung/` → `routes/app/spenden/[id]/zuwendungsbestaetigung/`, reusing `BescheinigungsPreview` and `allocateBescheinigung`. Update internal links/paths. Phase 3 deliberately left this route in place (the 308 was on the list page only) so it stays resolvable until this move.

**Files:** Git-move `routes/app/transactions/[id]/zuwendungsbestaetigung/{+page.server.ts,+page.svelte,pdf/+server.ts}` → `routes/app/spenden/[id]/zuwendungsbestaetigung/`; Test `tests/unit/zuwendungsbestaetigung.server.test.ts` (mocked) + extend the Task-8 e2e

- [ ] **Step 1: Write the failing test** — the moved `load` resolves at the new path, `?/generate` calls `allocateBescheinigung(params.id, …)` and returns `{ success, bescheinigungNr }`, and the PDF endpoint streams `application/pdf` for a bescheinigte Spende (409 otherwise). Assert the internal `pdfUrl()` + "Zurück" link point at the new `/app/spenden/...` paths (not `/app/transactions/...`).

```ts
// zuwendungsbestaetigung.server.test.ts (mock allocateBescheinigung/extractBmfPflichtfelder)
it("generate action allocates a B-Nummer via allocateBescheinigung", async () => {
  /* invoke actions.generate({params:{id},locals}) → expect allocateBescheinigung called with params.id */
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/zuwendungsbestaetigung.server.test.ts`

- [ ] **Step 3: Implement** the move with `git mv` (preserve history). In the moved files update the hardcoded paths:
  - `+page.svelte` `pdfUrl()` → `` `/app/spenden/${data.spende.id}/zuwendungsbestaetigung/pdf` `` (was `/app/transactions/...`); the "Zurück" button `href` → `/app/spenden/{id}` (the new detail route — was `/app/transactions/spenden`).
  - `pdf/+server.ts` header comment path → `/app/spenden/[id]/zuwendungsbestaetigung/pdf`.
  - `+page.server.ts` header comment path → new route; logic unchanged (still imports `allocateBescheinigung`/`extractBmfPflichtfelder`/`isBescheinigungEnabled` from `spenden.ts`, `BescheinigungsPreview` unchanged).
    Then `grep -rn "transactions/\[id\]/zuwendungsbestaetigung\|transactions/${.*}/zuwendungsbestaetigung" src tests` and update any remaining references (per §15: the `[id]/zuwendungsbestaetigung` PDF route is in the ~14 `/app/transactions` references to migrate — the Spenden detail "Bescheinigung erstellen" link from Task 6 already targets the new path).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(spenden): move zuwendungsbestaetigung route under /app/spenden/[id]/ (reuse BescheinigungsPreview, update internal links)"`

---

### Task 8: Phase-boundary verification + milestone `[model: opus]`

- [ ] **Step 1: Pure (fast lane).** `pnpm test:fast --run $(git ls-files 'tests/unit/*spenden*' 'tests/unit/*zuwendung*' | tr '\n' ' ')` (the pure ones, if any — most Spenden unit tests are mocked-route or DB and run in the reset lane).
- [ ] **Step 2: DB/route/component.** `pnpm test --run tests/integration/spenden-kpi.test.ts tests/integration/spenden-create-reconcile.test.ts tests/unit/spenden-page.server.test.ts tests/unit/spenden-create.server.test.ts tests/unit/spende-detail.server.test.ts tests/unit/zuwendungsbestaetigung.server.test.ts src/lib/components/admin/transactions/spenden/SpendenKpi.test.ts src/lib/components/admin/transactions/spenden/DerivedKategorieBadge.test.ts`
- [ ] **Step 3: e2e.** `pnpm test:e2e --grep @phase-6-spenden` (create Geldspende zweckfrei → ideeller + derived Kategorie; create zweckgebunden → required Zweckbindungs-Text; create Sachspende → Wertermittlung reveal + real columns; filter "Ohne Bescheinigung" preset; detail "Bescheinigung erstellen" → moved route → B-Nummer issued → list pill decrements; bescheinigte Spende read-only; old `/app/transactions/spenden` no longer the legacy page).
- [ ] **Step 4: Typecheck + lint.** `pnpm check && pnpm lint`
- [ ] **Step 5: Tag.** `git tag -f phase-6-spenden-complete`

---

## Self-Review

1. **Spec §9 coverage:**
   - §9.1 List — KPI anchor + disappearing "N ohne Bescheinigung" pill + "M versandt", **no Sammelbestätigungs-Fenster** (T1/T2) ✓; columns Datum/ID/Spender/Art/Zweckbindung/Betrag/Bescheinigung (T2) ✓; filters Spendenart/Zweckbindung/Bescheinigung-Status/Spender already in the Phase-2 registry, "Ohne Bescheinigung" preset is a Phase-2 saved-views built-in (`bescheinigung=ausstehend`) — surfaced via `FilterBar`, no C3 work ✓.
   - §9.2 Entry form — 3 pickers (Spendenart incl. **Aufwand disabled**, Zweckbindung→required Text, Spender member-autofill/Extern), Sachspende Wertermittlung reveal (gemeiner Wert/Methode/Zustand/Herkunftsbeleg), read-only **derived-Kategorie badge** (no picker), create→`createDonation` (T4/T5) ✓.
   - §4.3 Sachspende Wertermittlung to **real columns** (T4) ✓; §4.5 sphere always ideeller, project override **not** applied + unit-tested (T4) ✓.
   - §10 detail — DetailModalShell + Wertermittlung view + Bescheinigung action + Beleg/Herkunftsbeleg viewer + festschreibung/bescheinigt read-only (T6) ✓; §11 viewer via the `beleg` snippet (T6) ✓.
   - Bescheinigung MOVE + reuse `BescheinigungsPreview`/`allocateBescheinigung` (T7) ✓; old-route + dialogs retired (T3) ✓.
   - Mitgliedsbeiträge are NOT donations (separate beitrag workflow) — explicitly **out of scope**; no member_beitrags work here ✓.
2. **createSpende/createDonation reconciliation decision (flagged):** RESOLVED in Task 4 — keep `spenden.ts` as the validation + action layer, **delegate the insert to `createDonation`** (derive kategorie+ideeller sphere), drop the UI `kategorie_id` + the ADR-0008 project-override branch, move Sachspende facts from the `"Sache:"`-string hack to the §4.3 columns. The duplicate `spende.created` vs `donation.created` event emit is called out (pick one to avoid double audit rows). This is the single biggest divergence from Ausgaben/Einnahmen and is full TDD.
3. **Parallel-safety (all C3-owned files listed):** every created/edited file is under `routes/app/spenden/**`, `components/admin/transactions/spenden/**`, `components/admin/spenden/**`, `src/lib/server/domain/spenden.ts`, or `src/lib/server/domain/spenden-kpi.ts` (new) — plus the `git mv` of `zuwendungsbestaetigung` into `routes/app/spenden/[id]/`. KPI lives in its own `spenden-kpi.ts`, **never** in shared `transactions.ts`. The plan binds to Phase-3 contracts (`TransactionListScaffold`/`EntryFormShell`/`DetailModalShell`/`BelegViewer`) + Phase-2 (`listSpendenPage`/`parseFilterState`) + Phase-1 (`createDonation`/`deriveDonationKategorieName`) **read-only**. No edits to `FilterBar`, `transaction-filter-sql.ts`, or `transactions.ts`. Conflict-free with C1 (Ausgaben) and C2 (Einnahmen). The retired e2e `spenden.spec.ts` is retagged `@phase-5`→`@phase-6-spenden`.
4. **No placeholders:** logic tasks (KPI, the create reconciliation + derivation + §4.5 override test, the detail gates, the route MOVE + link rewrites) are full TDD with concrete assertions; the per-tab UI content (fields/columns/detail-fields/badge) is contract-bound to the locked Phase-3 props with a component/route test. The `listSpendenPage` row carries `spenderName`/`spendeKind`/`zweckbindungKind`/`bescheinigungNr` per the Phase-2 projection — consumed by `columns.ts` directly.
5. **Open dependency note:** Task 4's reconciliation requires Phase 1 to have (a) widened `createDonation` to derive kategorie+sphere and accept `wertermittlungMethode`/`zustandBeschreibung`/`herkunftsbelegFileId`/`belegFileId`, and (b) shipped `deriveDonationKategorieName` in `$lib/domain/spenden-kategorie.ts` + the §4.3 migration (CHECK `zweckbindung_text` when zweckgebunden; Wertermittlung columns). If a Phase-1 signature differs at execution time, pin Task 4/5 to the real signature (do not edit `transactions.ts` — escalate to Phase 1). The current shipped `createDonation` still takes `sphereSnapshot`/`kategorieNameSnapshot` as inputs (pre-Phase-1); this plan targets the post-Phase-1 derived contract per the locked-contracts brief.
