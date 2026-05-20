/**
 * @phase-7 C7 — TransactionsList card variant on mobile (PM-009)
 *
 * Verifies the responsive split:
 *  - Below md: [data-testid=transactions-card-list] is rendered (no table)
 *  - At md+:   [data-testid=transactions-table] is rendered (no card list)
 * Both wrappers exist in the DOM; visibility is handled by Tailwind's
 * `hidden md:block` / `md:hidden`. We assert presence of both wrappers and
 * the class semantics that drive the breakpoint switch.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { readable } from "svelte/store";

vi.mock("$app/stores", () => ({
  page: readable({ url: new URL("http://localhost/app/transactions") }),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn(),
  goto: vi.fn(),
}));

import TransactionsListTest from "./TransactionsList.test.svelte";
import type { TransactionRow } from "$lib/server/domain/transactions.js";

afterEach(() => cleanup());

const sampleRow: TransactionRow = {
  id: "txn_1",
  kind: "expense",
  businessId: "EXP-2026-001",
  bezeichnung: "Druckerpapier",
  betragCents: 1250,
  currency: "EUR",
  gebuchtAm: "2026-01-15",
  rechnungsdatum: "2026-01-12",
  sphereSnapshot: "ideeller",
  sphereEffective: "ideeller",
  kategorieNameSnapshot: "Büromaterial",
  status: "geprueft",
  erstattetAm: null,
  bezahltVonDisplay: "Andy G.",
  festgeschriebenAt: null,
  yearOfBuchung: 2026,
};

describe("TransactionsList — card variant (PM-009)", () => {
  it("renders the mobile card-list wrapper", () => {
    const { container } = render(TransactionsListTest, {
      props: { rows: [sampleRow], total: 1 },
    });
    const cardList = container.querySelector(
      '[data-testid="transactions-card-list"]',
    );
    expect(cardList).toBeTruthy();
    // The wrapper opts-out at md+ (md:hidden)
    expect(cardList!.className).toMatch(/md:hidden/);
  });

  it("renders the desktop table wrapper", () => {
    const { container } = render(TransactionsListTest, {
      props: { rows: [sampleRow], total: 1 },
    });
    const table = container.querySelector(
      '[data-testid="transactions-table"]',
    );
    expect(table).toBeTruthy();
    // Hidden by default, shown at md+
    expect(table!.className).toMatch(/hidden/);
    expect(table!.className).toMatch(/md:block/);
  });

  it("renders one transaction-card per row in the mobile list", () => {
    const { container } = render(TransactionsListTest, {
      props: { rows: [sampleRow, { ...sampleRow, id: "txn_2" }], total: 2 },
    });
    const cards = container.querySelectorAll('[data-testid="transaction-card"]');
    expect(cards.length).toBe(2);
  });

  it("each card uses the Money primitive (data-testid=money)", () => {
    const { container } = render(TransactionsListTest, {
      props: { rows: [sampleRow], total: 1 },
    });
    const money = container.querySelector('[data-testid="money"]');
    expect(money).toBeTruthy();
  });

  it("empty state uses the EmptyState primitive", () => {
    const { container } = render(TransactionsListTest, {
      props: { rows: [], total: 0 },
    });
    const empty = container.querySelector('[data-slot="empty-state"]');
    expect(empty).toBeTruthy();
  });
});
