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
    // DateField renders a de-DE (TT.MM.JJJJ) text input and commits the
    // canonical ISO value on blur — type German, blur, then submit.
    const dateInput = screen.getByLabelText("Bezahlt am") as HTMLInputElement;
    await fireEvent.input(dateInput, { target: { value: "15.05.2026" } });
    await fireEvent.blur(dateInput);
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "m1",
        year: 2025,
        gezahltAm: "2026-05-15",
      }),
    );
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

// ── Package E: Betrag field + Notiz + edit mode ────────────────────────────

describe("MarkPaidPopover — Betrag field (Package E)", () => {
  it("renders a Betrag input prefilled to the open remainder (betrag - paid)", () => {
    // betragCents=6900, paidCents=3000 → remainder = 3900 → "39,00"
    render(MarkPaidPopover, {
      props: { ...base, betragCents: 6900, paidCents: 3000 },
    });
    const betragInput = screen.getByLabelText("Betrag (€)") as HTMLInputElement;
    expect(betragInput.value).toBe("39,00");
  });

  it("renders Betrag prefilled to full betrag when paidCents = 0", () => {
    render(MarkPaidPopover, {
      props: { ...base, betragCents: 6969, paidCents: 0 },
    });
    const betragInput = screen.getByLabelText("Betrag (€)") as HTMLInputElement;
    expect(betragInput.value).toBe("69,69");
  });

  it("renders the 'Voller Betrag' chip showing the full betrag", () => {
    render(MarkPaidPopover, {
      props: { ...base, betragCents: 6969, paidCents: 0 },
    });
    expect(screen.getByRole("button", { name: /Voller Betrag/ })).toBeTruthy();
  });

  it("clicking 'Voller Betrag' chip fills Betrag input with the full betrag", async () => {
    render(MarkPaidPopover, {
      props: { ...base, betragCents: 6969, paidCents: 3000 },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: /Voller Betrag/ }),
    );
    const betragInput = screen.getByLabelText("Betrag (€)") as HTMLInputElement;
    expect(betragInput.value).toBe("69,69");
  });

  it("fires onPaid with parsed paidCents from the Betrag input", async () => {
    const onPaid = vi.fn();
    render(MarkPaidPopover, {
      props: { ...base, betragCents: 6969, paidCents: 0, onPaid },
    });
    const betragInput = screen.getByLabelText("Betrag (€)") as HTMLInputElement;
    // Simulate user typing a partial amount
    await fireEvent.input(betragInput, { target: { value: "30,00" } });
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: "m1", year: 2025, paidCents: 3000 }),
    );
  });

  it("includes notes in the onPaid payload when a Notiz is entered", async () => {
    const onPaid = vi.fn();
    render(MarkPaidPopover, {
      props: { ...base, betragCents: 6969, paidCents: 0, onPaid },
    });
    const notizInput = screen.getByLabelText(
      "Notiz (optional)",
    ) as HTMLInputElement;
    await fireEvent.input(notizInput, { target: { value: "Bar bezahlt" } });
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Bar bezahlt" }),
    );
  });

  it("passes notes: null when Notiz is empty", async () => {
    const onPaid = vi.fn();
    render(MarkPaidPopover, {
      props: { ...base, betragCents: 6969, paidCents: 0, onPaid },
    });
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });
});

describe("MarkPaidPopover — edit mode (Package E)", () => {
  const editBase = {
    ...base,
    betragCents: 6969,
    paidCents: 6969,
    initialMode: "edit" as const,
    initialGezahltAm: "2026-03-15",
    initialNotes: "Überweisung",
  };

  it("renders in edit mode with Speichern button", () => {
    render(MarkPaidPopover, { props: editBase });
    expect(screen.getByRole("button", { name: /Speichern/ })).toBeTruthy();
  });

  it("prefills Betrag input with the full betragCents in edit mode", () => {
    render(MarkPaidPopover, { props: editBase });
    const betragInput = screen.getByLabelText("Betrag (€)") as HTMLInputElement;
    expect(betragInput.value).toBe("69,69");
  });

  it("prefills gezahltAm from initialGezahltAm in edit mode", () => {
    render(MarkPaidPopover, { props: editBase });
    // DateField shows the de-DE display value; the ISO mirror lives in the
    // sibling hidden input that carries the canonical YYYY-MM-DD.
    const dateInput = screen.getByLabelText("Bezahlt am") as HTMLInputElement;
    expect(dateInput.value).toBe("15.03.2026");
  });

  it("prefills Notiz from initialNotes in edit mode", () => {
    render(MarkPaidPopover, { props: editBase });
    const notizInput = screen.getByLabelText(
      "Notiz (optional)",
    ) as HTMLInputElement;
    expect(notizInput.value).toBe("Überweisung");
  });

  it("fires onPaid with updated values from edit mode", async () => {
    const onPaid = vi.fn();
    render(MarkPaidPopover, { props: { ...editBase, onPaid } });
    const notizInput = screen.getByLabelText(
      "Notiz (optional)",
    ) as HTMLInputElement;
    await fireEvent.input(notizInput, { target: { value: "Karte" } });
    await fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Karte", paidCents: 6969 }),
    );
  });
});
