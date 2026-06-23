/**
 * F24 (review F3) — InvoiceForm.parseEur live-preview parse wiring.
 *
 * InvoiceForm derives the live-preview nettoCents via parseEur(nettoEur), which
 * now delegates to the canonical parseBetragCents. The old version stripped
 * every dot, so "12.34" became 123400 cents. This renders the form (with the
 * heavy InvoicePdfPreview swapped for a prop-capturing stub) and asserts the
 * preview input carries the correctly-parsed cents — a revert to dot-stripping
 * fails this.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

// Swap the real preview (iframe + debounced /api fetch) for a stub that records
// the `input` prop it receives.
vi.mock("./InvoicePdfPreview.svelte", async () => {
  const stub = await import("./__InvoicePdfPreviewStub.svelte");
  return { default: stub.default };
});

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {} }));

import InvoiceForm from "./InvoiceForm.svelte";
import { capturedPreviewInput } from "./__InvoicePdfPreviewStub.svelte";

afterEach(() => {
  cleanup();
  capturedPreviewInput.value = null;
});

function baseProps(nettoEur: string) {
  return {
    customers: [{ id: "c1", name: "Kunde", addressBlock: null, country: "DE" }],
    kategorien: [{ id: "k1", name: "Beratung" }],
    projects: [] as { id: string; name: string }[],
    invoiceNumberPreview: "FDW-2026-001",
    initial: {
      customerId: "c1",
      kategorieId: "k1",
      projectId: "",
      rechnungsdatum: "2026-06-01",
      leistungsDatum: "",
      faelligkeitsDatum: "",
      leistungszeitraum: "Juni 2026",
      bezeichnung: "Beratung",
      leistungsBeschreibung: "",
      nettoEur,
    },
  };
}

function previewCents(): number {
  const inp = capturedPreviewInput.value as { nettoCents?: number } | null;
  return inp?.nettoCents ?? -1;
}

describe("InvoiceForm.parseEur preview wiring (F24)", () => {
  it("dot-decimal '12.34' → 1234 cents (NOT 123400 — the old bug)", async () => {
    render(InvoiceForm, { props: baseProps("12.34") });
    expect(previewCents()).toBe(1234);
  });

  it("German thousands '1.234,56' → 123456 cents", async () => {
    render(InvoiceForm, { props: baseProps("1.234,56") });
    expect(previewCents()).toBe(123456);
  });

  it("comma-decimal '12,50' → 1250 cents", async () => {
    render(InvoiceForm, { props: baseProps("12,50") });
    expect(previewCents()).toBe(1250);
  });
});
