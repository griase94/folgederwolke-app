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

function makeRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "row-1",
    kind: "expense",
    businessId: "A-2026-001",
    bezeichnung: "Büromaterial",
    betragCents: 1250,
    currency: "EUR",
    gebuchtAm: "2026-05-01T00:00:00.000Z",
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
});
