/**
 * @phase-3 BeitragCellDialog — the consolidated seven-variant Beitrag cell
 * dialog (modal-member-popovers §1–§7). Replaces MarkPaidPopover +
 * PaidCellPopover + ExemptCellPopover + PermanentExemptPopover.
 *
 * Covers the acceptance criteria: variant routing, partial-remainder prefill +
 * onPaid intent, the live EÜR-Buchungsjahr line across a year boundary, the
 * befreien transition + required Grund, the paid-review → edit transition, the
 * two-step Storno/Aufheben (InlineConfirm) intents, the read-only perm-exempt +
 * readonly-mini surfaces, the Festschreibung lock backstop, and the C3a colour
 * ruling ("Bezahlt" is calm-green safe, never rosa).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import BeitragCellDialog from "./BeitragCellDialog.svelte";

afterEach(() => cleanup());

const base = {
  memberId: "m1",
  year: 2026,
  memberName: "Erika Mustermann",
  betragCents: 6969,
};

describe("BeitragCellDialog — mark-paid (§1)", () => {
  it("prefills Betrag with the FULL total for a partial member + seeds the note (B1)", () => {
    // Submit is SET-semantics: the server SETS paid_cents to this value. Prefilling
    // the remainder (30,00) would erase the 30,00 already paid — the new total
    // (60,00) is the money-truthful default. The existing note is seeded so the
    // submit preserves it instead of clobbering it to null.
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        paidCents: 3000,
        notes: "Ratenzahlung",
      },
    });
    const betrag = screen.getByTestId(
      "beitrag-dialog-betrag",
    ) as HTMLInputElement;
    expect(betrag.value).toBe("60,00");
    expect(
      (screen.getByLabelText("Notiz (optional)") as HTMLInputElement).value,
    ).toBe("Ratenzahlung");
  });

  it("submitting the partial→full default emits the full total + preserves the note (B1)", async () => {
    const onPaid = vi.fn();
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6969,
        paidCents: 3000,
        notes: "Ratenzahlung",
        onPaid,
      },
    });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-submit"));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({ paidCents: 6969, notes: "Ratenzahlung" }),
    );
  });

  it("'Voller Betrag' chip fills the full Soll", async () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        paidCents: 3000,
      },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: /Voller Betrag/ }),
    );
    const betrag = screen.getByTestId(
      "beitrag-dialog-betrag",
    ) as HTMLInputElement;
    expect(betrag.value).toBe("60,00");
  });

  it("emits onPaid with parsed cents + notes on submit", async () => {
    const onPaid = vi.fn();
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        onPaid,
      },
    });
    await fireEvent.input(screen.getByTestId("beitrag-dialog-betrag"), {
      target: { value: "30,00" },
    });
    await fireEvent.input(screen.getByLabelText("Notiz (optional)"), {
      target: { value: "Bar" },
    });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-submit"));
    expect(onPaid).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "m1",
        year: 2026,
        paidCents: 3000,
        notes: "Bar",
      }),
    );
  });

  it("'Bezahlt' CTA is calm-green safe (emerald), NEVER rosa/pink (C3a)", () => {
    render(BeitragCellDialog, {
      props: { ...base, initialVariant: "mark-paid", betragCents: 6000 },
    });
    const submit = screen.getByTestId("beitrag-dialog-submit");
    expect(submit.className).toMatch(/emerald/);
    expect(submit.className).not.toMatch(/rose|pink|rosa/);
    expect(submit.textContent).toMatch(/Bezahlt/);
  });

  // FormFooter doctrine (§4): an out-of-range Betrag must not mute the button.
  // The click is refused, but it says WHY and puts the caret in the field.
  it("an out-of-range Betrag (> Soll) explains instead of refusing silently", async () => {
    const onPaid = vi.fn();
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        onPaid,
      },
    });
    const betrag = screen.getByTestId(
      "beitrag-dialog-betrag",
    ) as HTMLInputElement;
    await fireEvent.input(betrag, { target: { value: "99,99" } });

    const submit = screen.getByTestId(
      "beitrag-dialog-submit",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(screen.queryByTestId("beitrag-dialog-betrag-error")).toBeNull();

    await fireEvent.click(submit);
    expect(onPaid).not.toHaveBeenCalled();
    const err = screen.getByTestId("beitrag-dialog-betrag-error");
    expect(err.getAttribute("role")).toBe("alert");
    expect(err.textContent).toMatch(/60,00/); // names the Soll as the ceiling
    expect(document.activeElement).toBe(betrag);
    expect(betrag.getAttribute("aria-describedby")).toBe(err.id);

    // Typing clears the message again.
    await fireEvent.input(betrag, { target: { value: "30,00" } });
    expect(screen.queryByTestId("beitrag-dialog-betrag-error")).toBeNull();
  });

  it("hides Befreien when allowExempt=false (list/card/detail surfaces)", () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        allowExempt: false,
      },
    });
    expect(screen.queryByTestId("beitrag-dialog-befreien")).toBeNull();
  });

  it("shows the Erinnerung ghost only when canRemind, and emits onReminder", async () => {
    const onReminder = vi.fn();
    const { rerender } = render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        canRemind: false,
        onReminder,
      },
    });
    expect(screen.queryByTestId("beitrag-dialog-remind")).toBeNull();
    await rerender({
      ...base,
      initialVariant: "mark-paid",
      betragCents: 6000,
      canRemind: true,
      onReminder,
    });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-remind"));
    expect(onReminder).toHaveBeenCalledWith({ memberId: "m1", year: 2026 });
  });
});

describe("BeitragCellDialog — live EÜR-Buchungsjahr (§3 AC3)", () => {
  it("names 2026 for a 30.12.2026 payment date (aria-live)", () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        gezahltAm: "2026-12-30",
      },
    });
    const line = screen.getByTestId("beitrag-dialog-euer");
    expect(line.textContent).toMatch(/EÜR 2026/);
    expect(line.getAttribute("aria-live")).toBe("polite");
  });

  it("names 2027 for a 02.01.2027 payment date (year boundary)", () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        gezahltAm: "2027-01-02",
      },
    });
    expect(screen.getByTestId("beitrag-dialog-euer").textContent).toMatch(
      /EÜR 2027/,
    );
  });
});

describe("BeitragCellDialog — befreien transition (§1.3 / §5)", () => {
  // FormFooter doctrine (§4): the commit stays clickable with an empty Grund —
  // the component ALREADY had the explain path (showReasonError + focus), the
  // disabled attribute just made it unreachable by mouse.
  it("Befreien opens the Grund form; an empty Grund is named, not muted", async () => {
    const onExempt = vi.fn();
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        onExempt,
      },
    });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-befreien"));
    const commit = screen.getByTestId(
      "beitrag-dialog-befreien-commit",
    ) as HTMLButtonElement;
    expect(commit.disabled).toBe(false);

    await fireEvent.click(commit);
    expect(onExempt).not.toHaveBeenCalled();
    const grund = screen.getByTestId(
      "beitrag-dialog-grund",
    ) as HTMLInputElement;
    expect(screen.getByRole("alert").textContent).toMatch(/Grund/);
    expect(document.activeElement).toBe(grund);

    await fireEvent.input(grund, { target: { value: "Härtefall" } });
    await fireEvent.click(commit);
    expect(onExempt).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Härtefall" }),
    );
  });

  it("emits onExempt with the trimmed reason", async () => {
    const onExempt = vi.fn();
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        onExempt,
      },
    });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-befreien"));
    await fireEvent.input(screen.getByTestId("beitrag-dialog-grund"), {
      target: { value: "  Elternzeit  " },
    });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-befreien-commit"));
    expect(onExempt).toHaveBeenCalledWith({
      memberId: "m1",
      year: 2026,
      reason: "Elternzeit",
    });
  });

  it("← Zurück returns to mark-paid", async () => {
    const { container } = render(BeitragCellDialog, {
      props: { ...base, initialVariant: "mark-paid", betragCents: 6000 },
    });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-befreien"));
    expect(container.querySelector("[data-variant='befreien']")).toBeTruthy();
    await fireEvent.click(screen.getByTestId("beitrag-dialog-back"));
    expect(container.querySelector("[data-variant='mark-paid']")).toBeTruthy();
  });
});

describe("BeitragCellDialog — paid-review + edit (§1.2 / §1.4)", () => {
  const paidBase = {
    ...base,
    initialVariant: "paid-review" as const,
    paidCents: 6969,
    gezahltAm: "2026-03-15",
  };

  it("shows the Bezahlt-am date (de-DE) and the EÜR booking year", () => {
    render(BeitragCellDialog, { props: paidBase });
    expect(screen.getByText(/Bezahlt am 15\.03\.2026/)).toBeTruthy();
    expect(screen.getByTestId("beitrag-dialog-euer").textContent).toMatch(
      /EÜR-Buchung 2026/,
    );
  });

  it("Bearbeiten switches to the edit form seeded with the recorded amount", async () => {
    const { container } = render(BeitragCellDialog, { props: paidBase });
    await fireEvent.click(screen.getByTestId("beitrag-dialog-edit"));
    expect(container.querySelector("[data-variant='edit']")).toBeTruthy();
    expect(
      (screen.getByTestId("beitrag-dialog-betrag") as HTMLInputElement).value,
    ).toBe("69,69");
    expect(screen.getByTestId("beitrag-dialog-submit").textContent).toMatch(
      /Speichern/,
    );
  });

  it("Stornieren requires a two-step confirm before firing onStorno", async () => {
    const onStorno = vi.fn();
    render(BeitragCellDialog, { props: { ...paidBase, onStorno } });
    const storno = screen.getByTestId("beitrag-dialog-storno");
    await fireEvent.click(storno);
    expect(onStorno).not.toHaveBeenCalled();
    expect(storno.textContent).toMatch(/Wirklich stornieren/);
    await fireEvent.click(storno);
    expect(onStorno).toHaveBeenCalledWith({ memberId: "m1", year: 2026 });
  });
});

describe("BeitragCellDialog — exempt-review (§1.5)", () => {
  const exemptBase = {
    ...base,
    initialVariant: "exempt-review" as const,
    exemptReason: "Härtefall",
  };

  it("shows the stored Grund and the reassurance that it stays in the Verlauf", () => {
    render(BeitragCellDialog, { props: exemptBase });
    expect(screen.getByText(/Grund: Härtefall/)).toBeTruthy();
    expect(screen.getByText(/bleibt im Verlauf/)).toBeTruthy();
  });

  it("Aufheben requires a two-step confirm before firing onAufheben", async () => {
    const onAufheben = vi.fn();
    render(BeitragCellDialog, { props: { ...exemptBase, onAufheben } });
    const aufheben = screen.getByTestId("beitrag-dialog-aufheben");
    await fireEvent.click(aufheben);
    expect(onAufheben).not.toHaveBeenCalled();
    await fireEvent.click(aufheben);
    expect(onAufheben).toHaveBeenCalledWith({ memberId: "m1", year: 2026 });
  });
});

describe("BeitragCellDialog — read-only surfaces (§1.6 / §1.7)", () => {
  it("perm-exempt: shows Grund + a 'Mitglied öffnen' link to the detail page", () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "perm-exempt",
        exemptReason: "Ehrenmitglied seit 2018",
      },
    });
    expect(screen.getByText(/Ehrenmitglied seit 2018/)).toBeTruthy();
    expect(
      screen.getByTestId("beitrag-dialog-open-member").getAttribute("href"),
    ).toBe("/app/mitglieder/m1");
  });

  it("readonly-mini: shows the plain-text reason and an optional link (no dead end)", () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "readonly-mini",
        miniReason: "Beitragssatz 2027 fehlt.",
        miniHref: "/app/einstellungen/beitraege",
        miniLinkLabel: "Einstellungen",
      },
    });
    expect(screen.getByTestId("beitrag-dialog-mini").textContent).toMatch(
      /Beitragssatz 2027 fehlt/,
    );
    expect(
      screen.getByTestId("beitrag-dialog-mini-link").getAttribute("href"),
    ).toBe("/app/einstellungen/beitraege");
  });
});

describe("BeitragCellDialog — Festschreibung lock (§2 / AC6)", () => {
  it("mark-paid: shows the alert and disables the submit when isLocked", () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "mark-paid",
        betragCents: 6000,
        isLocked: true,
      },
    });
    expect(screen.getByTestId("beitrag-dialog-locked").textContent).toMatch(
      /festgeschrieben/,
    );
    expect(
      (screen.getByTestId("beitrag-dialog-submit") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("paid-review: disables the Storno control when isLocked", () => {
    render(BeitragCellDialog, {
      props: {
        ...base,
        initialVariant: "paid-review",
        paidCents: 6969,
        gezahltAm: "2024-03-15",
        isLocked: true,
      },
    });
    expect(
      (screen.getByTestId("beitrag-dialog-storno") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
