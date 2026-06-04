/**
 * @phase-2 Task 2.3 — MarkPaidPopover two-mode transform + required Grund.
 *
 * Component-level coverage of the popover content: mark-paid submit, the
 * Befreien transform, the required-reason gate (submit disabled until
 * non-empty + inline error on forced submit), and the overdue reminder button.
 * The full browser flow is covered by the @phase-2 e2e spec.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
import MarkPaidPopover from "./MarkPaidPopover.svelte";

afterEach(() => cleanup());

const base = {
  memberId: "m1",
  year: 2025,
  memberName: "Erika Mustermann",
  betragCents: 6969,
};

describe("MarkPaidPopover — mark-paid mode", () => {
  it("renders the header with member, year, and formatted Betrag", () => {
    render(MarkPaidPopover, { props: base });
    expect(screen.getByText(/Erika Mustermann · 2025 · 69,69/)).toBeTruthy();
  });

  it("shows the live EÜR-Buchung line", () => {
    render(MarkPaidPopover, { props: base });
    expect(
      screen.getByText(/Wird in der EÜR .* als Einnahme verbucht/),
    ).toBeTruthy();
  });

  it("fires onPaid with the chosen date when Bezahlt clicked", async () => {
    const onPaid = vi.fn();
    render(MarkPaidPopover, { props: { ...base, onPaid } });
    const dateInput = screen.getByLabelText("Bezahlt am") as HTMLInputElement;
    await fireEvent.input(dateInput, { target: { value: "2026-05-15" } });
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));
    expect(onPaid).toHaveBeenCalledWith({
      memberId: "m1",
      year: 2025,
      gezahltAm: "2026-05-15",
    });
  });

  it("shows the reminder button only for overdue cells", () => {
    const { rerender } = render(MarkPaidPopover, { props: base });
    expect(
      screen.queryByRole("button", { name: /Erinnerung senden/ }),
    ).toBeNull();
    rerender({ ...base, isOverdue: true });
    expect(
      screen.getByRole("button", { name: /Erinnerung senden/ }),
    ).toBeTruthy();
  });

  it("disables submit + shows alert when locked", () => {
    render(MarkPaidPopover, { props: { ...base, isLocked: true } });
    expect(screen.getByText(/festgeschrieben/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Bezahlt/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("MarkPaidPopover — befreien transform", () => {
  it("transforms to befreien-mode when Befreien clicked", async () => {
    render(MarkPaidPopover, { props: base });
    await fireEvent.click(screen.getByRole("button", { name: "Befreien" }));
    expect(screen.getByText(/Erika Mustermann · 2025 · Befreien/)).toBeTruthy();
    expect(screen.getByLabelText("Grund (erforderlich)")).toBeTruthy();
  });

  it("keeps Befreien-submit disabled until reason non-empty", async () => {
    render(MarkPaidPopover, { props: base });
    await fireEvent.click(screen.getByRole("button", { name: "Befreien" }));
    const submit = screen.getByRole("button", {
      name: /Befreien ↵/,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await fireEvent.input(screen.getByLabelText("Grund (erforderlich)"), {
      target: { value: "Härtefall" },
    });
    expect(submit.disabled).toBe(false);
  });

  it("fires onExempt with the trimmed reason", async () => {
    const onExempt = vi.fn();
    render(MarkPaidPopover, { props: { ...base, onExempt } });
    await fireEvent.click(screen.getByRole("button", { name: "Befreien" }));
    await fireEvent.input(screen.getByLabelText("Grund (erforderlich)"), {
      target: { value: "  Härtefall  " },
    });
    await fireEvent.click(screen.getByRole("button", { name: /Befreien ↵/ }));
    expect(onExempt).toHaveBeenCalledWith({
      memberId: "m1",
      year: 2025,
      reason: "Härtefall",
    });
  });

  it("← Zurück returns to mark-paid mode", async () => {
    render(MarkPaidPopover, { props: base });
    await fireEvent.click(screen.getByRole("button", { name: "Befreien" }));
    await fireEvent.click(screen.getByRole("button", { name: /Zurück/ }));
    expect(screen.getByLabelText("Bezahlt am")).toBeTruthy();
  });

  it("can open directly in befreien-mode via initialMode", () => {
    render(MarkPaidPopover, { props: { ...base, initialMode: "befreien" } });
    expect(screen.getByLabelText("Grund (erforderlich)")).toBeTruthy();
  });
});
