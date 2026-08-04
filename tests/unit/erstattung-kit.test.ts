/**
 * S3.1 Erstattung kit — the pieces that carry money-facing meaning.
 *
 * CopyField and the bulk tally are the two places where a wrong detail costs
 * real time: a copy button that silently copies nothing, or a batch result that
 * reads "done" when three claims are still unpaid.
 *
 * @phase-2
 */

import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, afterEach, vi } from "vitest";
import CopyField from "$lib/components/ui/copy-field/CopyField.svelte";
import ProblemFlag from "$lib/components/ui/ProblemFlag.svelte";
import MoneyStrip from "$lib/components/ui/MoneyStrip.svelte";
import {
  buildBulkResult,
  type BulkErstattungSummary,
} from "$lib/components/admin/erstattung/bulk-result.js";

afterEach(() => cleanup());

const emptySummary: BulkErstattungSummary = {
  erstattet: [],
  ibanFehlt: [],
  festgeschrieben: [],
  bereitsBezahlt: [],
  notFound: [],
  fehler: [],
};

describe("CopyField", () => {
  function stubClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    return writeText;
  }

  it("copies the VALUE, not the label", async () => {
    const writeText = stubClipboard();
    render(CopyField, {
      props: {
        field: "iban",
        // The Werkstatt shows a grouped IBAN but must copy something the bank
        // form accepts — label and value are deliberately different.
        label: "DE89 3704 0044 0532 0130 00",
        value: "DE89370400440532013000",
      },
    });

    await fireEvent.click(screen.getByTestId("copy-iban"));
    expect(writeText).toHaveBeenCalledWith("DE89370400440532013000");
  });

  it("reports the copy so the page can announce it once", async () => {
    stubClipboard();
    const copied: string[] = [];
    render(CopyField, {
      props: {
        field: "empfaenger",
        label: "Empfängername",
        value: "Anna Müller",
        onCopied: (l: string) => copied.push(l),
      },
    });

    await fireEvent.click(screen.getByTestId("copy-empfaenger"));
    expect(copied).toEqual(["Empfängername"]);
  });

  it("does not copy — or claim to — when there is nothing to copy", async () => {
    const writeText = stubClipboard();
    const copied: string[] = [];
    render(CopyField, {
      props: {
        field: "iban",
        label: "IBAN fehlt",
        value: "",
        disabled: true,
        onCopied: (l: string) => copied.push(l),
      },
    });

    const btn = screen.getByTestId("copy-iban-disabled") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await fireEvent.click(btn);
    expect(writeText).not.toHaveBeenCalled();
    expect(copied).toEqual([]);
  });

  it("says what a disabled field means, not just that it is dead", () => {
    render(CopyField, {
      props: { field: "iban", label: "IBAN fehlt", value: "", disabled: true },
    });
    expect(
      screen.getByTestId("copy-iban-disabled").getAttribute("aria-label"),
    ).toMatch(/nichts zu kopieren/);
  });

  it("surfaces a clipboard refusal instead of pretending it worked", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const copied: string[] = [];
    const errored: string[] = [];
    render(CopyField, {
      props: {
        field: "betrag",
        label: "24,90",
        value: "24,90",
        onCopied: (l: string) => copied.push(l),
        onError: (l: string) => errored.push(l),
      },
    });

    await fireEvent.click(screen.getByTestId("copy-betrag"));
    expect(copied).toEqual([]);
    expect(errored).toEqual(["24,90"]);
  });
});

describe("ProblemFlag", () => {
  it("links to where the gap can be closed", () => {
    const { container } = render(ProblemFlag, {
      props: { href: "/app/mitglieder/m-1" },
    });
    const el = container.querySelector('[data-testid="problem-flag"]');
    expect(el?.tagName.toLowerCase()).toBe("a");
    expect(el?.getAttribute("href")).toBe("/app/mitglieder/m-1");
  });

  it("stays a plain statement when there is nowhere to send the admin", () => {
    const { container } = render(ProblemFlag, { props: {} });
    expect(
      container
        .querySelector('[data-testid="problem-flag"]')
        ?.tagName.toLowerCase(),
    ).toBe("span");
  });

  it("is never neutral grey — a blocker reads as one (Abnahme #6/#11)", () => {
    const { container } = render(ProblemFlag, { props: {} });
    const cls =
      container.querySelector('[data-testid="problem-flag"]')?.className ?? "";
    expect(cls).toMatch(/severity-critical/);
  });
});

describe("MoneyStrip", () => {
  it("shows the sum in plum and gives every chip the same width", () => {
    const { container } = render(MoneyStrip, {
      props: {
        eyebrow: "Offen · wartet auf Überweisung",
        totalCents: 27370,
        chips: [
          { label: "Erstattungen", count: 4, testId: "chip-count" },
          { label: "IBAN fehlt", count: 1, tone: "crit", testId: "chip-iban" },
        ],
      },
    });

    const total = screen.getByTestId("money-strip-total");
    expect(total.textContent).toContain("273,70");
    // An Auslage is an Ausgabe in every state — the amount stays plum.
    expect(total.className).toMatch(/text-type-ausgabe/);
    // Equal columns: neither count may look like the lesser one (Abnahme #6).
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid?.getAttribute("style")).toContain("repeat(2, minmax(0, 1fr))");
  });
});

describe("bulk result tally", () => {
  it("reads as a clean success only when everything went through", () => {
    const r = buildBulkResult({ ...emptySummary, erstattet: ["a", "b"] });
    expect(r.tone).toBe("ok");
    expect(r.headline).toBe("2 von 2 erstattet");
  });

  it("never reports a half-done batch as success", () => {
    const r = buildBulkResult({
      ...emptySummary,
      erstattet: ["a"],
      ibanFehlt: ["b", "c"],
    });
    expect(r.tone).toBe("warn");
    expect(r.headline).toContain("1 von 3");
  });

  it("names the skipped-for-IBAN claims as their own outcome, before failures", () => {
    const r = buildBulkResult({
      ...emptySummary,
      erstattet: ["a"],
      ibanFehlt: ["b"],
      fehler: [{ id: "c", error: "boom" }],
    });
    const ibanIdx = r.tally.findIndex((t) => t.includes("IBAN fehlt"));
    const errIdx = r.tally.findIndex((t) => t.includes("Fehler"));
    expect(ibanIdx).toBeGreaterThanOrEqual(0);
    // The actionable bucket comes first — it is the one the admin can fix.
    expect(ibanIdx).toBeLessThan(errIdx);
    expect(r.tally.some((t) => t.includes("übersprungen"))).toBe(true);
  });

  it("keeps closed-year and already-paid claims visible in the tally", () => {
    const r = buildBulkResult({
      ...emptySummary,
      erstattet: ["a"],
      festgeschrieben: ["b"],
      bereitsBezahlt: ["c"],
    });
    expect(r.tally.some((t) => t.includes("festgeschrieben"))).toBe(true);
    expect(r.tally.some((t) => t.includes("bereits erstattet"))).toBe(true);
  });

  it("says so plainly when nothing was processed", () => {
    const r = buildBulkResult(emptySummary);
    expect(r.headline).toBe("Keine Auslagen verarbeitet");
    expect(r.tone).toBe("warn");
  });
});
