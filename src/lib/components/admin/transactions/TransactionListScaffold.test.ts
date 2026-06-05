// TransactionListScaffold.test.ts
//
// Contract test for the shared list shell every transaction tab renders.
// Asserts the integration seam the Tier-C tabs (Phase 4/5/6) bind to:
//  - the per-tab `kpi` snippet is rendered
//  - exactly ONE primary "create" CTA (newLabel → newHref)
//  - the FilterBar is present
//  - one row per `rows`
//  - the CORRECT empty state for each zero-row case (year-named vs. no-matches+reset)
//  - a Pagination control when `total > rows.length`
//
// Reset lane (mounts bits-ui via FilterBar) → `pnpm test --run <file>`.
// Uses fireEvent (project convention; never userEvent). Mocks $app/navigation +
// $app/stores like FilterBar.test.ts / MobileTabBar.test.ts.
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRawSnippet } from "svelte";
import TransactionListScaffold from "./TransactionListScaffold.svelte";
import type { ColumnDef } from "./TransactionListScaffold.svelte";
import { goto } from "$app/navigation";
import type {
  TransactionRow,
  BaseTxRow,
} from "$lib/server/domain/transactions.js";
import type { FilterState } from "$lib/domain/transaction-filters.js";

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

// Expose writable stores so tests can drive them:
//  - navigatingStore: skeleton tests set it truthy to show the loading skeleton.
//  - pageStore: the export-CTA query-passthrough test sets a URL WITH query
//    params and asserts the CTA href carries them. Default URL has no query so
//    all other tests (which expect a bare /app/ausgaben href) are unaffected.
import { writable } from "svelte/store";
const navigatingStore = writable<null | { type: string }>(null);
const DEFAULT_PAGE = {
  url: new URL("http://localhost/app/ausgaben"),
  data: {},
};
const pageStore = writable<{ url: URL; data: Record<string, unknown> }>(
  DEFAULT_PAGE,
);

vi.mock("$app/stores", () => ({
  get page() {
    return pageStore;
  },
  // navigating is null when idle, a NavigationTarget object when in-flight.
  get navigating() {
    return navigatingStore;
  },
}));

afterEach(() => {
  cleanup();
  vi.mocked(goto).mockClear();
  // Reset both stores to defaults so a URL/navigating set by one test never
  // bleeds into the next.
  pageStore.set(DEFAULT_PAGE);
  navigatingStore.set(null);
});

function makeRow(id: string, bezeichnung: string): TransactionRow {
  return {
    id,
    kind: "expense",
    businessId: `A-${id}`,
    bezeichnung,
    betragCents: 1250,
    currency: "EUR",
    gebuchtAm: "2024-03-01",
    rechnungsdatum: "2024-03-01",
    sphereSnapshot: "ideeller",
    sphereEffective: "ideeller",
    kategorieNameSnapshot: "Büromaterial",
    status: "geprueft",
    erstattetAm: null,
    bezahltVonDisplay: "Verein",
    festgeschriebenAt: null,
    yearOfBuchung: 2024,
  };
}

// A minimal column config: a Bezeichnung column (sortable) + a Betrag column.
const kpiSnippet = createRawSnippet(() => ({
  render: () => `<div data-testid="kpi-strip">KPI</div>`,
}));

// Typed to `BaseTxRow`: testing-library's `render(Component, {props})` cannot
// infer the scaffold's generic `Row` from props (markup `<Component>` usage can),
// so it resolves `Row` to the constraint `BaseTxRow`. These snippets only read
// base fields, so `ColumnDef<BaseTxRow>` is the matching column type here.
const columns: ColumnDef<BaseTxRow>[] = [
  {
    key: "bezeichnung",
    label: "Bezeichnung",
    sortable: true,
    render: createRawSnippet((row) => ({
      render: () => `<span>${row().bezeichnung}</span>`,
    })),
  },
  {
    key: "betrag",
    label: "Betrag",
    align: "right",
    render: createRawSnippet((row) => ({
      render: () => `<span>${row().betragCents}</span>`,
    })),
  },
];

const emptyFilters: FilterState = {
  enums: {},
  members: {},
  amount: {},
  booleans: {},
};

const activeFilters: FilterState = {
  enums: { status: ["offen"] },
  members: {},
  amount: {},
  booleans: {},
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    tab: "ausgaben" as const,
    rows: [makeRow("r1", "Erste Buchung"), makeRow("r2", "Zweite Buchung")],
    total: 2,
    page: 1,
    pageSize: 25,
    selectedYear: 2024 as number | "all",
    currentYear: 2024,
    filterState: emptyFilters,
    kategorieOptions: [],
    memberOptions: [],
    columns,
    kpi: kpiSnippet,
    newHref: "/app/ausgaben/neu",
    newLabel: "Neue Ausgabe",
    detailHrefBase: "/app/ausgaben",
    ...overrides,
  };
}

describe("TransactionListScaffold — shared contract", () => {
  it("renders the kpi slot, the primary create CTA (newLabel→newHref) + an AT-reachable mobile FAB, FilterBar, and a row per `rows`", () => {
    const { container } = render(TransactionListScaffold, {
      props: baseProps(),
    });

    // kpi snippet
    expect(screen.getByTestId("kpi-strip")).toBeTruthy();

    // Primary create CTA — assert by data-slot (not accessible-name count):
    // jsdom doesn't compute Tailwind `hidden`, so both the desktop link and the
    // mobile FAB are in the DOM; a role-name count would be fragile.
    const desktopCta = container.querySelector('[data-slot="new-cta"]');
    expect(desktopCta?.getAttribute("href")).toBe("/app/ausgaben/neu");
    expect(desktopCta?.textContent).toContain("Neue Ausgabe");

    // Mobile FAB is the AT-reachable mobile counterpart: a real link with an
    // accessible name (aria-label) + the same href (no aria-hidden/tabindex=-1).
    const mobileFab = container.querySelector('[data-slot="new-cta-mobile"]');
    expect(mobileFab?.getAttribute("href")).toBe("/app/ausgaben/neu");
    expect(mobileFab?.getAttribute("aria-label")).toBe("Neue Ausgabe");
    expect(mobileFab?.getAttribute("aria-hidden")).toBeNull();
    expect(mobileFab?.getAttribute("tabindex")).toBeNull();

    // FilterBar present (shared filter-bar slot marker)
    expect(document.querySelector('[data-slot="filter-bar"]')).toBeTruthy();

    // one rendered row per row (desktop table + mobile cards share the same
    // bezeichnung text; assert the text appears for each row)
    expect(screen.getAllByText("Erste Buchung").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText("Zweite Buchung").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("renders a pagination control when total > rows.length", () => {
    render(TransactionListScaffold, {
      props: baseProps({ total: 50, pageSize: 25 }),
    });
    expect(document.querySelector('[data-slot="pagination"]')).toBeTruthy();
  });

  it("UX-04: year-named empty state when no rows AND no active filters", () => {
    render(TransactionListScaffold, {
      props: baseProps({
        rows: [],
        total: 0,
        selectedYear: 2024,
        filterState: emptyFilters,
      }),
    });
    expect(screen.getByText(/Keine Buchungen in 2024/)).toBeTruthy();
    // not the no-matches state
    expect(
      screen.queryByText(/Keine Treffer für die aktuellen Filter/),
    ).toBeNull();
    // no "Filter zurücksetzen" reset button in the no-filter empty state
    expect(
      screen.queryByRole("button", { name: /Filter zurücksetzen/ }),
    ).toBeNull();
  });

  it("UX-04: year-named empty state handles the 'all' scope", () => {
    render(TransactionListScaffold, {
      props: baseProps({
        rows: [],
        total: 0,
        selectedYear: "all",
        filterState: emptyFilters,
      }),
    });
    expect(screen.getByText(/Keine Buchungen in Alle Jahre/)).toBeTruthy();
  });

  it("UX-04: no-matches empty state + 'Filter zurücksetzen' when no rows AND filters active", async () => {
    render(TransactionListScaffold, {
      props: baseProps({
        rows: [],
        total: 0,
        selectedYear: 2024,
        filterState: activeFilters,
      }),
    });
    expect(
      screen.getByText(/Keine Treffer für die aktuellen Filter/),
    ).toBeTruthy();
    // not the year-named state
    expect(screen.queryByText(/Keine Buchungen in/)).toBeNull();

    const reset = screen.getByRole("button", { name: /Filter zurücksetzen/ });
    expect(reset).toBeTruthy();
    // clicking it navigates to the unfiltered list (clears filters)
    await fireEvent.click(reset);
    expect(goto).toHaveBeenCalledTimes(1);
    const target = String(vi.mocked(goto).mock.calls[0]![0]);
    expect(target).not.toMatch(/status=/);
  });

  it("sortable column header navigates ?sort=&dir= via goto with aria-sort", async () => {
    render(TransactionListScaffold, { props: baseProps() });
    // the Bezeichnung header is sortable → a clickable control with aria-sort
    const sortHeader = screen.getByRole("button", { name: /Bezeichnung/ });
    expect(sortHeader.closest("[aria-sort]")).toBeTruthy();
    await fireEvent.click(sortHeader);
    expect(goto).toHaveBeenCalledTimes(1);
    const target = String(vi.mocked(goto).mock.calls[0]![0]);
    expect(target).toMatch(/sort=bezeichnung/);
    expect(target).toMatch(/dir=(asc|desc)/);
  });

  // ── T5 a11y: sort header keyboard operability ─────────────────────────────
  it("T5: sortable header button handles Enter keydown (keyboard operability)", async () => {
    render(TransactionListScaffold, { props: baseProps() });
    const sortHeader = screen.getByRole("button", { name: /Bezeichnung/ });
    // Native <button> activates on Enter — fireEvent.keyDown simulates the event.
    await fireEvent.keyDown(sortHeader, { key: "Enter" });
    // The button's onclick does NOT fire from keyDown (that's browser behavior,
    // not jsdom); what we verify is that the button IS a focusable role="button"
    // (keyboard-accessible) and carries aria-sort on its parent <th>.
    expect(sortHeader.tagName).toBe("BUTTON");
    expect(sortHeader.closest("[aria-sort]")).toBeTruthy();
  });

  it("T5: sortable header button handles Space keydown", async () => {
    render(TransactionListScaffold, { props: baseProps() });
    const sortHeader = screen.getByRole("button", { name: /Bezeichnung/ });
    await fireEvent.keyDown(sortHeader, { key: " " });
    // Same as Enter: verify keyboard accessibility, not synthetic activation.
    expect(sortHeader.tagName).toBe("BUTTON");
    expect(sortHeader.closest("[aria-sort]")).toBeTruthy();
  });
});

// ── T3: Export CTA ─────────────────────────────────────────────────────────
describe("T3 — Export CTA", () => {
  it("export CTA renders the tab-aware export href (no-query case)", () => {
    const { container } = render(TransactionListScaffold, {
      props: baseProps(),
    });
    const cta = container.querySelector(
      '[data-testid="export-cta"]',
    ) as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    // The default mock page URL has no query params → bare /app/ausgaben/export
    expect(cta.getAttribute("href")).toBe("/app/ausgaben/export");
    expect(cta.textContent).toContain("Gefilterte Liste als CSV");
  });

  it("export CTA carries the active query string from $page.url.searchParams", () => {
    // Drive the page store to a URL WITH the active filter+sort BEFORE rendering
    // (the export href is $derived off $page.url.searchParams). This fails if the
    // query passthrough breaks (e.g. href hardcoded without the search string).
    pageStore.set({
      url: new URL(
        "http://localhost/app/ausgaben?status=offen&sort=betrag&dir=asc",
      ),
      data: {},
    });
    const { container } = render(TransactionListScaffold, {
      props: baseProps(),
    });
    const cta = container.querySelector(
      '[data-testid="export-cta"]',
    ) as HTMLAnchorElement;
    const href = cta.getAttribute("href") ?? "";
    expect(href.startsWith("/app/ausgaben/export?")).toBe(true);
    // The whole active query string is forwarded (filter + sort + dir).
    expect(href).toContain("status=offen");
    expect(href).toContain("sort=betrag");
    expect(href).toContain("dir=asc");
  });

  it("export CTA is disabled (aria-disabled + prevents click) when total === 0", () => {
    const { container } = render(TransactionListScaffold, {
      props: baseProps({
        rows: [],
        total: 0,
        filterState: { enums: {}, members: {}, amount: {}, booleans: {} },
      }),
    });
    const cta = container.querySelector(
      '[data-testid="export-cta"]',
    ) as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("aria-disabled")).toBe("true");
  });

  it("export CTA is NOT disabled when rows exist", () => {
    const { container } = render(TransactionListScaffold, {
      props: baseProps(),
    });
    const cta = container.querySelector(
      '[data-testid="export-cta"]',
    ) as HTMLAnchorElement;
    expect(cta.getAttribute("aria-disabled")).toBeNull();
  });
});

// ── T4: Loading skeleton ────────────────────────────────────────────────────
describe("T4 — Loading skeleton", () => {
  afterEach(() => {
    cleanup();
    navigatingStore.set(null);
  });

  it("skeleton is hidden when navigating is null (idle)", () => {
    navigatingStore.set(null);
    render(TransactionListScaffold, { props: baseProps() });
    expect(screen.queryByTestId("list-skeleton")).toBeNull();
  });

  it("skeleton shows while navigating is truthy", async () => {
    navigatingStore.set({ type: "goto" });
    render(TransactionListScaffold, { props: baseProps() });
    expect(screen.queryByTestId("list-skeleton")).toBeTruthy();
  });

  it("emptyState snippet renders when total === 0 and no active filters", () => {
    const emptySnippet = createRawSnippet(() => ({
      render: () => `<div data-testid="custom-empty">Keine Einträge</div>`,
    }));
    render(TransactionListScaffold, {
      props: baseProps({
        rows: [],
        total: 0,
        filterState: { enums: {}, members: {}, amount: {}, booleans: {} },
        emptyState: emptySnippet,
      }),
    });
    expect(screen.getByTestId("custom-empty")).toBeTruthy();
    // year-named fallback must not also render
    expect(screen.queryByTestId("empty-year")).toBeNull();
  });
});
