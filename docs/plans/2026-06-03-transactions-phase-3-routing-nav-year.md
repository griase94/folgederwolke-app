# Transactions Phase 3 — Routing + Nav + Year + Shared Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`. Read the ROADMAP (esp. the **Parallelization map**) + spec (§3 routing, §6 year, §7/§9 list, §10 detail, §11 viewer, §13 visual). **Depends on Phase 1** (schema, kategorieSphere, seed corpus) **and Phase 2** (FilterBar, `parseFilterState`/`serializeFilterState`, `listAusgabenPage/listEinnahmenPage/listSpendenPage`, `selectYearOrAllFromUrl`/`ALL_YEARS`/`isStaleYear`, saved-views) **and the shared-primitives track A3** (`ui/popover`+combobox, `ui/tooltip`, `ui/pagination`, `ui/money-input`, `ui/multiselect-chip`). Branch: `feat/transactions-three-tabs-v2`.

**Goal:** Stand up the three flat routes + nav + global-year wiring, and build the **shared UI kit** every tab reuses — so Phases 4/5/6 (Ausgaben/Einnahmen/Spenden) can be implemented fully in parallel, each touching only its own route dir. This phase owns all cross-tab components; a tab track must never edit a shared file.

**Architecture:** Three thin tab routes that each call a per-tab `listXPage` (Phase 2) and render a shared `TransactionListScaffold`. The old `/app/transactions` route is redirected (not deleted) once the new routes work; its god-component `TransactionsList` is retired and its genuinely-reusable parts (SEPA modals, bulk bar, row/card) are **extracted** into standalone shared components. Year is consumed from the layout (`data.selectedYear`), extended to allow the `ALL_YEARS` sentinel on lists; a `StaleYearBanner` shows when viewing a non-current year. Shared **EntryFormShell**, **DetailModalShell**, and a unified **BelegViewer** (pdfjs on-screen canvas) are built here with locked prop contracts; the per-kind _content_ (fields, columns, KPIs, detail actions) lands in 4/5/6.

**Tech Stack:** SvelteKit (routes, `redirect`, `$types`), Drizzle, Vitest (fast lane for logic; reset lane for DB + component mount), `@testing-library/svelte`.

**Granularity note:** logic-heavy tasks (nav active-predicate, redirect, layout `ALL_YEARS` coercion, detail-query Beleg extension, pdfjs render) are full TDD. Shared **Svelte component** tasks are **contract-first**: define the exact props/exports + one component test asserting the contract + render; exhaustive per-line markup TDD is not required (the contract is what downstream parallel tracks bind to). Each component task names its file owner so Tier-C tabs stay conflict-free.

**Testing approach:** per-step single-file; pure → `pnpm test:fast`, DB/component → `pnpm test --run <file>`. Broad runs only at Task 11.

---

### Task 1: Nav — three desktop entries + single mobile "Transaktionen" + breadcrumbs `[model: opus]`

Cross-file (registry + two ICONS maps + Topbar labels + a custom mobile active-predicate). Verified facts: icon SVG paths are duplicated in `Sidebar.svelte` and `MobileTabBar.svelte` ICONS maps; `Topbar.svelte` has a `ROUTE_LABELS` map for breadcrumbs; active state uses `startsWith(href)`; the mobile bar is full (keep ONE Transaktionen entry).

**Files:** Modify `src/lib/components/admin/nav-registry.ts`, `Sidebar.svelte`, `MobileTabBar.svelte`, `Topbar.svelte`; Test `tests/unit/nav-registry.test.ts`

- [ ] **Step 1: Write the failing test** (pure — registry shape + a `mobileTransaktionenActive(path)` predicate).

```ts
// tests/unit/nav-registry.test.ts
import { describe, it, expect } from "vitest";
import {
  mainNavItems,
  mobileTransaktionenActive,
} from "$lib/components/admin/nav-registry.js";
describe("nav registry — three tabs", () => {
  it("has Ausgaben/Einnahmen/Spenden as main desktop entries", () => {
    const hrefs = mainNavItems.map((i) => i.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/app/ausgaben",
        "/app/einnahmen",
        "/app/spenden",
      ]),
    );
  });
  it("mobile Transaktionen tab is active on any of the three tab paths (+ their detail routes)", () => {
    expect(mobileTransaktionenActive("/app/ausgaben")).toBe(true);
    expect(mobileTransaktionenActive("/app/einnahmen/abc-123")).toBe(true);
    expect(mobileTransaktionenActive("/app/spenden")).toBe(true);
    expect(mobileTransaktionenActive("/app/mitglieder")).toBe(false);
  });
});
```

- [ ] **Step 2: Run via fast lane → fails.** `pnpm test:fast --run tests/unit/nav-registry.test.ts`

- [ ] **Step 3: Implement.** In `nav-registry.ts`: replace the single Transaktionen entry with three `group:"main"` entries (`/app/ausgaben` icon `MinusCircle`, `/app/einnahmen` icon `PlusCircle`, `/app/spenden` icon `Gift`); give `/app/ausgaben` `mobileTab: 3` + `label: "Transaktionen"` (the mobile entry), leave the other two without `mobileTab`. Export `mobileTransaktionenActive(path)` = `["/app/ausgaben","/app/einnahmen","/app/spenden"].some((h)=>path===h||path.startsWith(h+"/"))`. Add the three icon SVG paths to BOTH `Sidebar.svelte` and `MobileTabBar.svelte` ICONS maps. In `MobileTabBar.svelte`, use `mobileTransaktionenActive($page.url.pathname)` for the Transaktionen cell's active state instead of `startsWith(item.href)`. In `Topbar.svelte` `ROUTE_LABELS`, add `ausgaben: "Ausgaben"`, `einnahmen: "Einnahmen"`, `spenden: "Spenden"`.

- [ ] **Step 4: Run via fast lane → passes.** Expected `2 passed`.

- [ ] **Step 5: Commit.** `git commit -m "feat(nav): three transaction tabs (desktop) + single mobile Transaktionen entry + breadcrumbs"`

---

### Task 2: Layout — allow `ALL_YEARS` through + expose year scope `[model: opus]`

The shipped layout clamps `?year=all`→current (NaN→fallback→clamp). Lists need the sentinel.

**Files:** Modify `src/routes/app/+layout.server.ts`; Test `tests/unit/layout-year-scope.test.ts` (extract the resolver to a pure fn to test without a full layout harness)

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/layout-year-scope.test.ts
import { describe, it, expect } from "vitest";
import { resolveLayoutYear } from "$lib/server/domain/years.js"; // new pure helper
import { ALL_YEARS } from "$lib/domain/year.js";
describe("resolveLayoutYear", () => {
  const avail = [2026, 2025, 2024];
  it("passes ALL_YEARS through untouched", () => {
    expect(
      resolveLayoutYear(new URLSearchParams("year=all"), 2026, avail),
    ).toBe(ALL_YEARS);
  });
  it("clamps a concrete out-of-range year to nearest available", () => {
    expect(
      resolveLayoutYear(new URLSearchParams("year=2099"), 2026, avail),
    ).toBe(2026);
  });
  it("defaults missing to current", () => {
    expect(resolveLayoutYear(new URLSearchParams(""), 2026, avail)).toBe(2026);
  });
});
```

- [ ] **Step 2: Run via fast lane → fails.** `pnpm test:fast --run tests/unit/layout-year-scope.test.ts`

- [ ] **Step 3: Implement** `resolveLayoutYear(params, currentYear, availableYearNumbers)` in `years.ts`: if `?year=all` → `ALL_YEARS`; else `clampYearToAvailable(selectYearFromUrl(params, currentYear), availableYearNumbers)`. Use it in `+layout.server.ts` so `selectedYear: number | "all"`. (Downstream `data.selectedYear` type widens to `YearScope`; the year-switcher gets an "Alle Jahre" option in Task 3.)

- [ ] **Step 4: Run via fast lane → passes.** Expected `3 passed`.

- [ ] **Step 5: Commit.** `git commit -m "feat(year): layout resolves ALL_YEARS scope (lists) without clamping it away"`

---

### Task 3: `StaleYearBanner` + "Alle Jahre" switcher option `[model: sonnet]`

**Files:** Create `src/lib/components/admin/StaleYearBanner.svelte`; Modify `YearSwitcher.svelte` + `MobileYearPicker.svelte` (append an "Alle" option, **lists only** — gated by a prop); Test `src/lib/components/admin/StaleYearBanner.test.ts`

- [ ] **Step 1: Write the failing component test.**

```ts
// StaleYearBanner.test.ts
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import StaleYearBanner from "./StaleYearBanner.svelte";
describe("StaleYearBanner", () => {
  it("renders a loud banner naming the year when stale", () => {
    render(StaleYearBanner, {
      props: { selectedYear: 2024, currentYear: 2026 },
    });
    expect(screen.getByRole("status").textContent).toContain("2024");
  });
  it("renders nothing for the current year or Alle Jahre", () => {
    const { container } = render(StaleYearBanner, {
      props: { selectedYear: 2026, currentYear: 2026 },
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run src/lib/components/admin/StaleYearBanner.test.ts` (reset lane — component mount needs setupFiles).

- [ ] **Step 3: Implement** `StaleYearBanner` using `isStaleYear(selectedYear, currentYear)` (Phase 2) — non-dismissible amber `role="status"` "Ansicht: {year} — nicht das laufende Jahr". Add an `allowAllYears` prop path to `YearSwitcher`/`MobileYearPicker` that appends an `{ value: "all", label: "Alle Jahre" }` option (only the three list pages pass it; dashboard/EÜR do not). The switchers already use `SegmentedControl` (string values) — "all" flows through `handleYearChange` → `?year=all`.

- [ ] **Step 4: Run → passes.** Expected `2 passed`.

- [ ] **Step 5: Commit.** `git commit -m "feat(year): StaleYearBanner + Alle Jahre switcher option (lists only)"`

---

### Task 4: Detail query — thread `belegFileId` + `mimeType` `[model: opus]`

`TransactionDetail` exposes only `belegDriveFileId`/`belegOriginalName` — the §11 viewer needs the Blob `belegFileId` + mime. (Pure-data prerequisite for the shared DetailModalShell + BelegViewer.)

**Files:** Modify `src/lib/server/domain/transactions.ts` (`TransactionDetail` + `getTransactionDetail` join to `files`); Test `tests/integration/detail-beleg.test.ts`

- [ ] **Step 1: Write the failing test** (DB; corpus seeds an expense with a Beleg — or seed one in the test).

```ts
// tests/integration/detail-beleg.test.ts
import { describe, it, expect } from "vitest";
import { getTransactionDetail } from "$lib/server/domain/transactions.js";
// arrange: pick a seeded expense id that has belegFileId (corpus) ...
describe("getTransactionDetail beleg", () => {
  it("returns belegFileId + belegMimeType when a Beleg file is attached", async () => {
    const detail = await getTransactionDetail(
      SEEDED_EXPENSE_WITH_BELEG_ID,
      "expense",
    );
    expect(detail).toBeTruthy();
    expect(detail!).toHaveProperty("belegFileId");
    expect(detail!).toHaveProperty("belegMimeType");
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/integration/detail-beleg.test.ts`

- [ ] **Step 3: Implement.** Add `belegFileId: string | null` + `belegMimeType: string | null` to `TransactionDetail`; in `getTransactionDetail`, left-join `files` on the kind's `belegFileId` and select `files.mimeType`. (Phase 1's seed corpus must attach a Beleg file to ≥1 expense — if not, add a file fixture; note this back to Phase 1's corpus task if missing.)

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(tx): thread belegFileId + mimeType through getTransactionDetail (for §11 viewer)"`

---

### Task 5: `BelegViewer.svelte` — unified pdfjs canvas + image + fold `[model: opus]`

Parallel-safe (depends only on Phase 1 `files` + pdfjs). Spec §11.

**Files:** Create `src/lib/components/files/BelegViewer.svelte`; Test `src/lib/components/files/BelegViewer.test.ts`

- [ ] **Step 1: Write the failing component test** (mock pdfjs; assert image path renders `<img>`, pdf path renders a `<canvas>` + controls, and the "Original öffnen" link uses `fileViewUrl`).

```ts
// BelegViewer.test.ts
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import BelegViewer from "./BelegViewer.svelte";
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 100, height: 141 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
    }),
  }),
}));
describe("BelegViewer", () => {
  it("renders an <img> for image belege", () => {
    render(BelegViewer, {
      props: {
        fileId: "f1",
        mimeType: "image/jpeg",
        originalFilename: "b.jpg",
      },
    });
    expect((screen.getByRole("img") as HTMLImageElement).src).toContain(
      "/api/files/f1/blob",
    );
  });
  it("renders zoom + page controls + Original öffnen for PDFs", async () => {
    render(BelegViewer, {
      props: {
        fileId: "f2",
        mimeType: "application/pdf",
        originalFilename: "b.pdf",
      },
    });
    expect(
      await screen.findByRole("link", { name: /Original öffnen/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /vergrößern|\+|zoom in/i }),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run src/lib/components/files/BelegViewer.test.ts`

- [ ] **Step 3: Implement** per spec §11: props `{ fileId, mimeType, originalFilename, mode?: "fold"|"inline" }`. Images → `<img src={fileViewUrl(fileId)}>`. PDFs → render page-N to an on-screen `<canvas>` via `pdfjs-dist` (reuse the `?url` worker wiring from `file-compress.ts`: `import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"`), lazy one page at a time; explicit controls **× / ↗ Original öffnen (`fileViewUrl`) / ↓ / +/− zoom / ‹ › page + dots**; gestures are progressive enhancement. On render failure → fall back to the "Original öffnen" link. `mode="fold"` = mobile peek card → tap opens full-screen; `mode="inline"` = desktop left-column permanent. CSP already allows `img-src blob: data:` + same-origin worker (no change).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(beleg): unified pdfjs on-screen-canvas BelegViewer (image + PDF, fold + inline)"`

---

### Task 6: Extract reusable list pieces from the god-component `[model: sonnet]`

Make SEPA modals, bulk bar, row, card standalone + path-agnostic (detail href via prop, not hardcoded `/app/transactions/...`). Do NOT delete `TransactionsList.svelte` yet.

**Files:** Modify `TransactionRow.svelte`, `TransactionCardMobile.svelte` (detail href via `detailHref` prop), keep `BulkActionsBar`/`SepaCopyModal`/`PostSepaMarkErstattetModal` as-is (already standalone); Test: update `TransactionRow` test for the new prop

- [ ] **Step 1: Write/adjust the failing test** — `TransactionRow` renders the link from a `detailHref` prop (not the hardcoded path).

```ts
// in TransactionRow.test.ts
it("links to the provided detailHref", () => {
  render(TransactionRow, {
    props: {
      row: fakeRow(),
      selected: false,
      ontoggle: () => {},
      detailHref: "/app/ausgaben/abc",
    },
  });
  expect(
    (screen.getByRole("link") as HTMLAnchorElement).getAttribute("href"),
  ).toBe("/app/ausgaben/abc");
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run src/lib/components/admin/transactions/TransactionRow.test.ts`

- [ ] **Step 3: Implement** the `detailHref` prop on `TransactionRow` + `TransactionCardMobile` (default keeps old behavior for the still-live route). Confirm `BulkActionsBar`/`SepaCopyModal`/`PostSepaMarkErstattetModal` need no change (props already standalone).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "refactor(tx): row/card take detailHref prop (path-agnostic, for per-tab routes)"`

---

### Task 7: `TransactionListScaffold.svelte` (shared list shell) — contract-first `[model: opus]`

The shell every tab list renders: year pill + `StaleYearBanner` + KPI slot + `FilterBar` + sortable table (desktop) / cards (mobile) + sort control + pagination + empty/zero-result states.

**Files:** Create `src/lib/components/admin/transactions/TransactionListScaffold.svelte`; Test `…/TransactionListScaffold.test.ts`

- [ ] **Step 1: Write the failing component test** asserting the **contract**: renders the `kpi` snippet, the `FilterBar`, a row per `rows`, a year-named empty state when `rows=[]`, and a pagination control when `total > rows.length`.

```ts
// TransactionListScaffold.test.ts  (mock $app/navigation + $app/stores)
it("renders kpi slot + rows + pagination, and a year-named empty state when no rows", () => {
  // render with rows=[] and selectedYear=2024 → expect "Keine Buchungen in 2024"
  // render with rows=[r1,r2], total=50 → expect 2 rows + a pagination control
});
```

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Implement** with this locked prop contract (Tier-C tabs bind to it):

```ts
interface TransactionListScaffoldProps {
  tab: "ausgaben" | "einnahmen" | "spenden";
  rows: TransactionRow[]; // already server-filtered+paginated (listXPage)
  total: number;
  page: number;
  pageSize: number;
  selectedYear: number | "all";
  currentYear: number;
  filterState: FilterState; // from parseFilterState
  kategorieOptions: { value: string; label: string }[];
  memberOptions: { id: string; label: string }[];
  columns: ColumnDef[]; // per-tab column config (label, key, sortable, align, render snippet)
  kpi: Snippet; // per-tab KPI strip (Ausgaben pill / Einnahmen split / Spenden bescheinigung)
  detailHrefBase: string; // e.g. "/app/ausgaben"
  bulk?: {
    selectedIds: string[];
    onToggle: (id: string) => void;
    bar: Snippet;
  }; // Ausgaben only
  emptyState?: Snippet;
}
```

Renders: `{@render kpi()}` → `<FilterBar tab … state=filterState …>` → `StaleYearBanner` → sortable header (click → `?sort=&dir=` via goto; `aria-sort`) / mobile "Sortieren ▾" → `{#each rows}` `TransactionRow`/`TransactionCardMobile` (href = `${detailHrefBase}/${row.id}`) → `Pagination` (Phase A3 primitive) → year-named empty state ("Keine Buchungen in {year}" / "…für die aktuellen Filter") when `rows.length===0`.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(tx): shared TransactionListScaffold (KPI slot + FilterBar + sort + pagination + empty states)"`

---

### Task 8: `EntryFormShell.svelte` + shared field primitives — contract-first `[model: opus]`

The sticky-footer modal shell + reusable fields (Bezeichnung, MoneyInput, DateField, KategoriePicker+SphereBadge, BelegUpload, Kommentar). Per-tab fields (bezahlt-von, Sachspende block, etc.) are injected by 4/5/6 via a snippet.

**Files:** Create `src/lib/components/admin/transactions/EntryFormShell.svelte` + `fields/{KategoriePicker,SphereBadge,BelegUpload}.svelte`; Test the shell + KategoriePicker

- [ ] **Step 1: Write the failing tests** — shell renders header/scroll-body/sticky-footer with a disabled-until-dirty Speichern; `KategoriePicker` emits the derived sphere via `kategorieSphere` (no project override) and shows the SphereBadge + EÜR-Zeile hint.

```ts
// KategoriePicker.test.ts
it("derives sphere strictly from the chosen kategorie (no project override)", async () => {
  // select "Eintritt" → onSphere("zweckbetrieb") called; badge shows Zweckbetrieb
});
```

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Implement.** `EntryFormShell` contract:

```ts
interface EntryFormShellProps {
  title: string;
  statusHint?: string;
  action: string; // form action, e.g. "?/create"
  submitLabel: string;
  submitting: boolean;
  dirty: boolean;
  fields: Snippet; // per-tab fields injected here
  onClose: () => void; // × / backdrop; guarded if dirty
}
```

Sticky header + scrollable body (`{@render fields()}`) + unified sticky footer (Speichern disabled unless `dirty`; no Verwerfen); `beforeNavigate` dirty-guard. `KategoriePicker` props `{ options, value, onChange, onSphere }` → calls `kategorieSphere(options, name)` (Phase 1) and renders `SphereBadge` (palette §13) + "Anlage EÜR Zeile X" hint. `BelegUpload` wraps the native file input + the "Kein Beleg vorhanden" → Begründung reveal (Ausgaben).

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(tx): EntryFormShell + KategoriePicker/SphereBadge/BelegUpload field primitives"`

---

### Task 9: `DetailModalShell.svelte` (shared detail surface) — contract-first `[model: opus]`

Beleg-left (BelegViewer) + fields-right + unified footer; festschreibung read-only; mobile fold; `beforeNavigate` guard. Per-kind fields + context action injected by 4/5/6.

**Files:** Create `src/lib/components/admin/transactions/DetailModalShell.svelte`; Test `…/DetailModalShell.test.ts`

- [ ] **Step 1: Write the failing test** — renders `BelegViewer` on the left when `belegFileId` set, the `fields` snippet on the right, a unified footer with the `workflowAction` snippet + Speichern, and a read-only lock notice when `isFestgeschrieben`.

- [ ] **Step 2: Run → fails.**

- [ ] **Step 3: Implement** contract:

```ts
interface DetailModalShellProps {
  detail: TransactionDetail; // incl. belegFileId + belegMimeType (Task 4)
  isFestgeschrieben: boolean;
  fields: Snippet; // per-kind editable fields
  workflowAction?: Snippet; // per-kind footer action (Als bezahlt / Bescheinigung / Rechnung-link)
  saving: boolean;
  dirty: boolean;
}
```

Desktop: 2-col (BelegViewer `mode="inline"` left | fields+Verlauf right) + unified sticky footer. Mobile: stacked, BelegViewer `mode="fold"`, sticky bottom action bar. Festgeschrieben → fields read-only, footer save hidden, amber notice "Korrektur nur über Storno (Phase 2)". Audit `detail.timeline` rendered as the Verlauf.

- [ ] **Step 4: Run → passes.**

- [ ] **Step 5: Commit.** `git commit -m "feat(tx): DetailModalShell (Beleg-left + fields-right + unified footer + festschreibung read-only)"`

---

### Task 10: Route shells + redirect `[model: opus]`

The three flat list routes (thin — consume `listXPage` + render scaffold) + redirect the old path. Detail routes (`/app/<tab>/[id]`) are created per-tab in Phases 4/5/6 (they need per-kind content); Phase 3 provides only the shells/components.

**Files:** Create `src/routes/app/ausgaben/+page.server.ts` + `+page.svelte`, same for `einnahmen` + `spenden`; Modify/redirect `src/routes/app/transactions/+page.server.ts`; Test `tests/unit/ausgaben-route.server.test.ts` (mocked action/load pattern) + an e2e smoke

- [ ] **Step 1: Write the failing test** — the Ausgaben `load` parses filters + year and calls `listAusgabenPage`, returning `{ rows, total, ... }`; and `/app/transactions` redirects to `/app/ausgaben`.

```ts
// tests/unit/ausgaben-route.server.test.ts  (@vitest-environment node, mock the domain)
vi.mock("$lib/server/domain/transactions.js", () => ({
  listAusgabenPage: vi.fn(async () => ({ rows: [], total: 0 })) /* … */,
}));
it("load parses filters + selectedYear and calls listAusgabenPage", async () => {
  /* invoke load({url, parent}) … expect listAusgabenPage called with the parsed state+year */
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/unit/ausgaben-route.server.test.ts`

- [ ] **Step 3: Implement** each list `+page.server.ts`:

```ts
export const load: PageServerLoad = async ({ url, parent }) => {
  const { selectedYear, currentYear } = await parent(); // YearScope from layout (Task 2)
  const state = parseFilterState("ausgaben", url.searchParams); // Phase 2
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = 50;
  const { rows, total } = await listAusgabenPage({
    state,
    year: selectedYear,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const [kategorieOptions, memberOptions] = await Promise.all([
    listKategorieOptions("expense"),
    listMemberOptions(),
  ]);
  return {
    rows,
    total,
    page,
    pageSize,
    state,
    selectedYear,
    currentYear,
    kategorieOptions,
    memberOptions,
  };
};
```

`+page.svelte` renders `<TransactionListScaffold tab="ausgaben" … >` with the per-tab `kpi`/`columns` (those land in Phase 4; in Phase 3 ship a minimal KPI + default columns so the route works + the e2e smoke passes). `einnahmen`/`spenden` analogous (`listEinnahmenPage`/`listSpendenPage`, kind `income`; spenden has no kategorie filter-options call). Redirect old route: in `transactions/+page.server.ts` `load`, `redirect(308, "/app/ausgaben")` (preserve any `?year=`/query). Keep the old actions reachable only if still referenced; otherwise the redirect supersedes.

- [ ] **Step 4: Run → passes.** Plus an e2e smoke: `pnpm test:e2e --grep @phase-3-routing` (a tiny spec: visiting `/app/ausgaben` 200s, `/app/transactions` 308→`/app/ausgaben`).

- [ ] **Step 5: Commit.** `git commit -m "feat(routes): flat /app/{ausgaben,einnahmen,spenden} list routes + 308 redirect from /app/transactions"`

---

### Task 11: Phase-boundary verification + milestone `[model: opus]`

- [ ] **Step 1: Pure tests (fast lane).** `pnpm test:fast --run tests/unit/nav-registry.test.ts tests/unit/layout-year-scope.test.ts`
- [ ] **Step 2: Component + DB + route tests.** `pnpm test --run src/lib/components/admin/StaleYearBanner.test.ts src/lib/components/files/BelegViewer.test.ts src/lib/components/admin/transactions/TransactionListScaffold.test.ts src/lib/components/admin/transactions/EntryFormShell.test.ts src/lib/components/admin/transactions/DetailModalShell.test.ts src/lib/components/admin/transactions/TransactionRow.test.ts tests/integration/detail-beleg.test.ts tests/unit/ausgaben-route.server.test.ts`
- [ ] **Step 3: Regression — old transactions tests + nav.** `pnpm test --run src/lib/components/admin/MobileTabBar.test.ts src/lib/components/admin/Topbar.test.ts` (update for the new nav entries). The old `TransactionsList` test may be deleted only once Tier C retires the component — keep it green or skip with a `// retired in Phase 4-6` note.
- [ ] **Step 4: e2e routing smoke.** `pnpm test:e2e --grep @phase-3-routing`
- [ ] **Step 5: Typecheck + lint.** `pnpm check && pnpm lint`
- [ ] **Step 6: Tag.** `git tag -f phase-3-shared-kit-complete`

Shared kit + routing + year are in place. **Tier C unlocks:** Phases 4/5/6 can now be implemented in three parallel worktrees, each owning only `routes/app/<tab>/**` + `components/admin/transactions/<tab>/*`, binding to the locked contracts: `TransactionListScaffold`, `EntryFormShell`+fields, `DetailModalShell`, `BelegViewer`, `listXPage`, `parseFilterState`, `FilterBar`, saved-views.

---

## Self-Review (run after writing; fixed inline)

1. **Spec coverage:** §3 flat routes + mobile segmented (T1/T10) ✓; §6 ALL_YEARS + stale banner (T2/T3) ✓; §7/§9 list scaffold + KPI slot + sort + pagination + empty states (T7) ✓; §10 detail shell + festschreibung + fold + guard (T9) ✓; §11 unified pdfjs viewer (T4/T5) ✓; §13 SphereBadge palette + primitives (T8 + A3 track) ✓.
2. **Placeholder scan:** component tasks are intentionally contract-first (props + one contract test) per the granularity note — not placeholders; T4/T10 flag a Phase-1-corpus dependency (a Beleg-attached expense) with a concrete "note back to Phase 1" — bounded. No TBD.
3. **Type/signature consistency:** `TransactionListScaffold`/`EntryFormShell`/`DetailModalShell`/`BelegViewer` prop contracts are the Tier-C binding surface and are referenced consistently; `resolveLayoutYear`/`YearScope`/`ALL_YEARS` (T2) align with Phase 2; `listXPage` shape matches Phase 2 Task 5.
4. **Parallel-safety:** every shared component is created here and owned by Phase 3; Tier-C tabs touch only their own dirs (stated in T11). `TransactionRow` gains `detailHref` so per-tab routes reuse it without forking.
5. **Open dependency for Phases 4/5/6:** per-tab KPI snippet, column config, per-kind entry fields, per-kind detail fields + workflow action, and the per-tab detail route `/app/<tab>/[id]/+page.server.ts`. A3 primitives (popover/combobox/tooltip/pagination/money-input/multiselect-chip) must be merged before T7/T8 and before Phase 2's FilterBar.
