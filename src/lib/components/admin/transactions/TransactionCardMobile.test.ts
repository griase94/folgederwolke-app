// TransactionCardMobile.test.ts
//
// The shared <md mobile card every tab list renders. Asserts the two
// shared-kit fixes (item 6):
//   - the bulk-select checkbox renders ONLY when `selectable` (Ausgaben);
//     Einnahmen/Spenden pass selectable=false → no no-op checkbox.
//   - the kind pill is dropped on a single-kind tab list (`showKindPill=false`),
//     since "Ausgabe/Einnahme/Spende" is redundant when the whole list is one
//     kind; it still renders by default (merged/unknown contexts).
//
// Reset lane (renders a Svelte component) → `pnpm test --run <file>`.
// fireEvent (project convention), not userEvent.
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import TransactionCardMobile from "./TransactionCardMobile.svelte";
import type { TransactionRow } from "$lib/server/domain/transactions.js";

afterEach(() => cleanup());

// The card accepts BaseTxRow + the optional per-tab display fields; extend the
// base row with them so the per-tab scan-signal tests can set them.
type TestRow = TransactionRow & {
  rechnungBusinessId?: string | null;
  bescheinigungNr?: string | null;
  spenderName?: string | null;
};

function makeRow(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id: "row-1",
    kind: "expense",
    businessId: "A-2026-001",
    bezeichnung: "Büromaterial",
    betragCents: 1250,
    currency: "EUR",
    gebuchtAm: "2026-05-01T00:00:00.000Z",
    relevanzDatum: null,
    rechnungsdatum: null,
    sphereSnapshot: "ideeller",
    sphereEffective: "ideeller",
    kategorieNameSnapshot: "Bürobedarf",
    status: "geprueft",
    erstattetAm: null,
    bezahltVonDisplay: "Verein",
    festgeschriebenAt: null,
    yearOfBuchung: 2026,
    ...overrides,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    row: makeRow(),
    selected: false,
    ontoggle: vi.fn(),
    detailHref: "/app/ausgaben/row-1",
    ...overrides,
  };
}

describe("TransactionCardMobile", () => {
  it("renders the bulk-select checkbox when selectable", () => {
    render(TransactionCardMobile, { props: baseProps({ selectable: true }) });
    expect(screen.queryByLabelText("Auswählen")).toBeTruthy();
  });

  it("does NOT render the checkbox when selectable is false (Einnahmen/Spenden)", () => {
    render(TransactionCardMobile, { props: baseProps({ selectable: false }) });
    expect(screen.queryByLabelText("Auswählen")).toBeNull();
  });

  it("defaults to no checkbox when selectable is omitted", () => {
    render(TransactionCardMobile, { props: baseProps() });
    expect(screen.queryByLabelText("Auswählen")).toBeNull();
  });

  it("drops the kind pill on a single-kind list (showKindPill=false)", () => {
    render(TransactionCardMobile, {
      props: baseProps({ showKindPill: false }),
    });
    expect(screen.queryByText("Ausgabe")).toBeNull();
  });

  it("renders the kind pill by default (showKindPill omitted)", () => {
    render(TransactionCardMobile, { props: baseProps() });
    expect(screen.getByText("Ausgabe")).toBeTruthy();
  });

  it("toggling the checkbox calls ontoggle with the row id", async () => {
    const ontoggle = vi.fn();
    render(TransactionCardMobile, {
      props: baseProps({ selectable: true, ontoggle }),
    });
    await fireEvent.click(screen.getByLabelText("Auswählen"));
    expect(ontoggle).toHaveBeenCalledWith("row-1");
  });

  // ── Per-tab scan signals (combined-review high #3) ────────────────────────

  it("Einnahmen card surfaces the aus-Rechnung link when linked", () => {
    render(TransactionCardMobile, {
      props: baseProps({
        row: makeRow({
          kind: "income",
          rechnungBusinessId: "FDW-2026-007",
        }),
        showKindPill: false,
      }),
    });
    const badge = screen.getByTestId("card-rechnung");
    expect(badge.textContent).toContain("FDW-2026-007");
  });

  it("Einnahmen card omits the aus-Rechnung badge when not invoice-linked", () => {
    render(TransactionCardMobile, {
      props: baseProps({
        row: makeRow({ kind: "income", rechnungBusinessId: null }),
        showKindPill: false,
      }),
    });
    expect(screen.queryByTestId("card-rechnung")).toBeNull();
  });

  it("Spenden card shows the issued Bescheinigung number", () => {
    render(TransactionCardMobile, {
      props: baseProps({
        row: makeRow({ kind: "donation", bescheinigungNr: "B-2026-003" }),
        showKindPill: false,
      }),
    });
    const badge = screen.getByTestId("card-bescheinigung");
    expect(badge.textContent).toContain("B-2026-003");
  });

  it("Spenden card shows 'ohne Bescheinigung' when none issued yet", () => {
    render(TransactionCardMobile, {
      props: baseProps({
        row: makeRow({ kind: "donation", bescheinigungNr: null }),
        showKindPill: false,
      }),
    });
    expect(screen.getByTestId("card-bescheinigung").textContent).toContain(
      "ohne Bescheinigung",
    );
  });
});
