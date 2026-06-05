/**
 * TransactionRow component tests.
 *
 * Covers:
 *  - rendering a detail link from the `detailHref` prop (Task 6 / P3-03)
 */

import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("$app/forms", () => ({
  enhance: vi.fn(() => () => {}),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn(),
}));

import TransactionRow from "./TransactionRow.svelte";
import type { TransactionRow as TransactionRowType } from "$lib/server/domain/transactions.js";

afterEach(() => cleanup());

function fakeRow(
  overrides: Partial<TransactionRowType> = {},
): TransactionRowType {
  return {
    id: "txn_abc",
    kind: "expense",
    businessId: "EXP-2026-001",
    bezeichnung: "Test Ausgabe",
    betragCents: 1000,
    currency: "EUR",
    gebuchtAm: "2026-01-01",
    rechnungsdatum: null,
    sphereSnapshot: "ideeller",
    sphereEffective: "ideeller",
    kategorieNameSnapshot: "Sonstiges",
    status: "zu_pruefen",
    erstattetAm: null,
    bezahltVonDisplay: null,
    festgeschriebenAt: null,
    yearOfBuchung: 2026,
    ...overrides,
  };
}

describe("TransactionRow", () => {
  it("links to the provided detailHref", () => {
    render(TransactionRow, {
      props: {
        row: fakeRow(),
        selected: false,
        ontoggle: () => {},
        detailHref: "/app/ausgaben/abc",
      },
    });
    // The row renders two links (Bezeichnung + "Details →") — both use detailHref.
    // Target the "Details →" anchor by its aria-label to avoid getByRole ambiguity.
    expect(
      (
        screen.getByRole("link", {
          name: /Details/i,
        }) as HTMLAnchorElement
      ).getAttribute("href"),
    ).toBe("/app/ausgaben/abc");
  });
});
