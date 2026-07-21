// AusgabeFields.test.ts
//
// UX-07 §7.2: the Extern recipient text inputs are backed by local $state +
// bind:value so typed data SURVIVES a bezahlt-von mode toggle. The inputs live
// inside an {#if} that re-mounts on toggle — without the $state backing they
// would reset to their seed value. This asserts an entered Extern Name persists
// across an Extern → Mitglied → Extern toggle.
//
// Reset lane (renders a Svelte component) → `pnpm test --run <file>`.
// fireEvent (project convention), not userEvent.
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import AusgabeFields from "./AusgabeFields.svelte";

afterEach(() => cleanup());

function baseValues() {
  return {
    bezeichnung: "",
    betrag: "",
    kategorieId: "",
    kommentar: "",
    projectId: "",
    bezahltVonKind: "extern" as const,
    bezahltVonMemberId: "",
    externName: "",
    externIban: "",
    externEmail: "",
    rechnungsdatum: "",
    abflussDatum: "",
    zahlungsartId: "",
    schonBezahlt: false,
    erstattetAm: "",
    keinBeleg: false,
    begruendung: "",
  };
}

function baseProps() {
  return {
    members: [
      {
        id: "m1",
        vorname: "Anna",
        nachname: "Beispiel",
        email: null,
        iban: null,
      },
    ],
    expenseKategorien: [
      { id: "k1", name: "Bürobedarf", sphere: "ideeller" as const },
    ],
    zahlungsarten: [{ id: "z1", label: "Überweisung" }],
    projects: [],
    values: baseValues(),
  };
}

describe("AusgabeFields — B2 entry-modal-v4 section layout", () => {
  it("Betrag is the hero AmountField: text+inputmode=decimal display + hidden cents", () => {
    render(AusgabeFields, { props: baseProps() });
    // The hero AmountField submits integer cents via a hidden name=betragCents…
    const betragInput = document.querySelector('input[name="betragCents"]');
    expect(betragInput).not.toBeNull();
    expect((betragInput as HTMLInputElement).type).toBe("hidden");
    // …and its visible display input is text + inputmode=decimal (never type=number).
    const displayInput = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement | null;
    expect(displayInput).not.toBeNull();
    expect(displayInput?.type).toBe("text");
  });

  it("renders the Buchung + Zuordnung sections (data-slot=ausgabe-section)", () => {
    render(AusgabeFields, { props: baseProps() });
    const sections = document.querySelectorAll('[data-slot="ausgabe-section"]');
    expect(sections.length).toBe(2);
  });

  it("Buchung comes first (Betrag/Beleg gate) and Zuordnung (Bezahlt-von) second", () => {
    render(AusgabeFields, { props: baseProps() });
    const sections = Array.from(
      document.querySelectorAll('[data-slot="ausgabe-section"]'),
    );
    const headings = sections.map(
      (s) => s.querySelector("h3")?.textContent?.trim() ?? "",
    );
    expect(headings[0]).toMatch(/Buchung/);
    expect(headings[1]).toMatch(/Zuordnung/);
    // The Beleg-oder-Verzicht gate lives in the Buchung section.
    expect(
      sections[0]?.querySelector('[data-testid="beleg-gate"]'),
    ).not.toBeNull();
    // The Bezahlt-von union lives in the Zuordnung section.
    expect(
      sections[1]?.querySelector('[data-slot="bezahlt-von-grid"]'),
    ).not.toBeNull();
  });

  it("Sphäre is a read-only locked field, shown once a Kategorie is chosen (never a select)", () => {
    // Fresh form (no Kategorie) → no misleading default sphere is shown.
    render(AusgabeFields, { props: baseProps() });
    expect(
      document.querySelector('[data-slot="locked-sphere-field"]'),
    ).toBeNull();
    cleanup();
    // With a Kategorie seeded (by id), the derived Sphäre appears as read-only.
    const props = baseProps();
    props.values = { ...props.values, kategorieId: "k1" };
    render(AusgabeFields, { props });
    expect(
      document.querySelector('[data-slot="locked-sphere-field"]'),
    ).not.toBeNull();
  });

  it("bezahlt-von is a neutral segmented toggle (data-slot=bezahlt-von-grid)", () => {
    render(AusgabeFields, { props: baseProps() });
    const grid = document.querySelector('[data-slot="bezahlt-von-grid"]');
    expect(grid).not.toBeNull();
  });
});

describe("AusgabeFields — Extern data survives a recipient-mode toggle (UX-07)", () => {
  it("keeps a typed Extern Name across Extern → Mitglied → Extern", async () => {
    render(AusgabeFields, { props: baseProps() });

    // Type into the Extern Name input (we start in extern mode).
    const nameInput = screen.getByTestId(
      "extern-name-input",
    ) as HTMLInputElement;
    await fireEvent.input(nameInput, {
      target: { value: "Max Mustermann GmbH" },
    });
    expect(nameInput.value).toBe("Max Mustermann GmbH");

    // Toggle away to Mitglied (unmounts the Extern panel) and back to Extern.
    await fireEvent.click(screen.getByTestId("bezahlt-von-member"));
    await fireEvent.click(screen.getByTestId("bezahlt-von-extern"));

    // The freshly re-mounted Extern Name input must still hold the typed value.
    const reMounted = screen.getByTestId(
      "extern-name-input",
    ) as HTMLInputElement;
    expect(reMounted.value).toBe("Max Mustermann GmbH");
  });
});
