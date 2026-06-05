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
    kategorieNameSnapshot: "",
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
