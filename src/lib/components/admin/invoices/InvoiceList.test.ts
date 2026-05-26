/**
 * @phase-7 C7 — InvoiceList mobile card variant (PM-009)
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import InvoiceListTest from "./InvoiceList.test.svelte";
import type { InvoiceRow } from "$lib/domain/invoices.js";

afterEach(() => cleanup());

const sampleInvoice: InvoiceRow = {
  id: "inv_1",
  businessId: "INV-2026-001",
  rechnungsdatum: "2026-03-04",
  customerId: "cus_1",
  customerName: "Beispielkundin GmbH",
  bezeichnung: "Beratungsleistung März",
  nettoCents: 100000,
  bruttoCents: 119000,
  currency: "EUR",
  pdfStatus: "generated",
  pdfFileId: "fil_1",
  festgeschriebenAt: null,
  supersedesId: null,
  supersededByBusinessId: null,
  bezahltAm: null,
  paidByIncomeId: null,
  createdAt: "2026-03-04",
};

describe("InvoiceList — mobile card variant (PM-009)", () => {
  it("renders the mobile card-list wrapper at md-hidden", () => {
    const { container } = render(InvoiceListTest, {
      props: { invoices: [sampleInvoice] },
    });
    const cardList = container.querySelector(
      '[data-testid="invoice-card-list"]',
    );
    expect(cardList).toBeTruthy();
    expect(cardList!.className).toMatch(/md:hidden/);
  });

  it("renders the desktop row-list wrapper as hidden md:block", () => {
    const { container } = render(InvoiceListTest, {
      props: { invoices: [sampleInvoice] },
    });
    const rowList = container.querySelector('[data-testid="invoice-row-list"]');
    expect(rowList).toBeTruthy();
    expect(rowList!.className).toMatch(/hidden/);
    expect(rowList!.className).toMatch(/md:block/);
  });

  it("renders one invoice-card per row in the mobile list", () => {
    const { container } = render(InvoiceListTest, {
      props: {
        invoices: [sampleInvoice, { ...sampleInvoice, id: "inv_2" }],
      },
    });
    const cards = container.querySelectorAll('[data-testid="invoice-card"]');
    expect(cards.length).toBe(2);
  });
});
