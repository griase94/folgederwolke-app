/**
 * @phase-2 Tasks 2.4/2.5/2.6 — Paid / Exempt / PermanentExempt popover content.
 *
 * Covers the read-mostly popovers: storno (two-step confirm + festschr. gate),
 * aufheben (two-step confirm + festschr. gate), and the read-only
 * permanent-exempt popover's edit link.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
import PaidCellPopover from "./PaidCellPopover.svelte";
import ExemptCellPopover from "./ExemptCellPopover.svelte";
import PermanentExemptPopover from "./PermanentExemptPopover.svelte";

afterEach(() => cleanup());

describe("PaidCellPopover — storno (§7.5)", () => {
  const base = {
    memberId: "m1",
    year: 2025,
    memberName: "Erika Mustermann",
    betragCents: 6969,
    gezahltAm: "2026-03-15",
  };

  it("shows the gezahltAm date in de-DE format", () => {
    render(PaidCellPopover, { props: base });
    expect(screen.getByText(/Bezahlt am 15\.03\.2026/)).toBeTruthy();
  });

  it("requires a two-step confirm before firing onStorno", async () => {
    const onStorno = vi.fn();
    render(PaidCellPopover, { props: { ...base, onStorno } });
    const btn = screen.getByRole("button", { name: /stornieren/i });
    await fireEvent.click(btn);
    // first click only arms the confirm
    expect(onStorno).not.toHaveBeenCalled();
    expect(screen.getByText(/Wirklich stornieren/)).toBeTruthy();
    await fireEvent.click(
      screen.getByRole("button", { name: /Storno bestätigen/i }),
    );
    expect(onStorno).toHaveBeenCalledWith({ memberId: "m1", year: 2025 });
  });

  it("disables storno + shows alert when festgeschrieben", () => {
    render(PaidCellPopover, { props: { ...base, isLocked: true } });
    expect(screen.getByText(/festgeschrieben/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /stornieren/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("ExemptCellPopover — aufheben (§7.8)", () => {
  const base = {
    memberId: "m1",
    year: 2025,
    memberName: "Klaus Klein",
    exemptReason: "Härtefall",
  };

  it("shows the stored Grund", () => {
    render(ExemptCellPopover, { props: base });
    expect(screen.getByText(/Grund: Härtefall/)).toBeTruthy();
  });

  it("requires a two-step confirm before firing onAufheben", async () => {
    const onAufheben = vi.fn();
    render(ExemptCellPopover, { props: { ...base, onAufheben } });
    await fireEvent.click(screen.getByRole("button", { name: /aufheben/i }));
    expect(onAufheben).not.toHaveBeenCalled();
    await fireEvent.click(
      screen.getByRole("button", { name: /Aufheben bestätigen/i }),
    );
    expect(onAufheben).toHaveBeenCalledWith({ memberId: "m1", year: 2025 });
  });

  it("disables aufheben when festgeschrieben", () => {
    render(ExemptCellPopover, { props: { ...base, isLocked: true } });
    expect(
      (screen.getByRole("button", { name: /aufheben/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("PermanentExemptPopover — read-only (§7.8a)", () => {
  const base = {
    memberId: "m1",
    year: 2025,
    memberName: "Ada Lovelace",
    exemptReason: "Ehrenmitglied seit 2018",
  };

  it("shows the permanent Grund and an edit link to the member page", () => {
    render(PermanentExemptPopover, { props: base });
    expect(screen.getByText(/Ehrenmitglied seit 2018/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Mitglied bearbeiten/ });
    expect(link.getAttribute("href")).toBe("/app/mitglieder/m1/bearbeiten");
  });
});
