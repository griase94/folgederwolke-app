// portal-kit.test.ts
//
// Contract tests for the member-portal kit (Aurora A-flow S2b): the pieces
// that carry ratified copy and privacy rules, so a later refactor cannot
// quietly change what a member is told or shown.
//
// The load-bearing invariants under test:
//  - the stored IBAN appears ONLY masked, and "change it" means typing a NEW
//    one into an EMPTY field (replace semantics, portal-onboarding-iban §1a),
//  - the A/B/C payout matrix derives its case from the data, never from a prop,
//  - "save to my profile" is pre-checked in Fall B (no IBAN yet) and NOT
//    pre-selected in Fall C (overwriting stored data stays deliberate),
//  - the welcome card is an invitation: no amber, no gate, "Später" always wins.
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import LockedIdentity from "./LockedIdentity.svelte";
import PayoutBlock from "./PayoutBlock.svelte";
import IbanInlineEdit from "./IbanInlineEdit.svelte";
import WelcomeCard from "./WelcomeCard.svelte";
import SubmitHandoff from "./SubmitHandoff.svelte";

afterEach(() => cleanup());

const MASKED = "DE12 •••• 4321";
const VALID_IBAN = "DE89 3704 0044 0532 0130 00";
const INVALID_IBAN = "DE44 5001 0517 5407 3249 9";

describe("LockedIdentity", () => {
  it("confirms the identity instead of offering editable fields", () => {
    const { container } = render(LockedIdentity, {
      props: {
        vorname: "Anna",
        nachname: "Müller",
        email: "anna.mueller@web.de",
        confirm: true,
      },
    });
    expect(screen.getByText(/Du reichst als/)).toBeTruthy();
    // Name + e-mail on the label ruler (the confirm sentence names them too).
    const facts = screen.getByTestId("locked-identity-facts");
    expect(facts.textContent).toContain("Anna Müller");
    expect(facts.textContent).toContain("anna.mueller@web.de");
    // Never disabled inputs — "editable but tedious" is forbidden.
    expect(container.querySelectorAll("input").length).toBe(0);
    expect(
      container.querySelector('[data-testid="locked-identity-profil"]'),
    ).toBeTruthy();
  });

  it("hides the Profil link when there is nowhere to go", () => {
    render(LockedIdentity, {
      props: {
        vorname: "Anna",
        nachname: "Müller",
        email: null,
        profilHref: null,
      },
    });
    expect(screen.queryByTestId("locked-identity-profil")).toBeNull();
  });
});

describe("PayoutBlock — the A/B/C matrix", () => {
  it("Fall A: confirms the stored account, masked, with nothing to type", () => {
    const { container } = render(PayoutBlock, {
      props: { maskedIban: MASKED },
    });
    expect(
      container
        .querySelector('[data-slot="payout-block"]')
        ?.getAttribute("data-mode"),
    ).toBe("confirmed");
    expect(screen.getByTestId("payout-masked-iban").textContent?.trim()).toBe(
      MASKED,
    );
    expect(screen.getByText("Erstattung an dein Konto")).toBeTruthy();
    expect(screen.getByText("hinterlegt")).toBeTruthy();
    // No input at all in the default case.
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(screen.getByTestId("payout-toggle")).toBeTruthy();
  });

  it("Fall A → C: the toggle opens an EMPTY field (replace, never edit)", async () => {
    render(PayoutBlock, { props: { maskedIban: MASKED } });
    await fireEvent.click(screen.getByTestId("payout-toggle"));

    const input = screen.getByTestId("payout-iban-input") as HTMLInputElement;
    // The stored IBAN is NOT seeded into the field — it never left the server.
    expect(input.value).toBe("");
    expect(screen.getByText("IBAN für diese Einreichung")).toBeTruthy();
    expect(screen.getByTestId("payout-back")).toBeTruthy();
  });

  it("Fall C: 'nur für diese Einreichung' is the default, profile update is not", async () => {
    render(PayoutBlock, { props: { maskedIban: MASKED, override: true } });
    const once = screen.getByTestId("payout-scope-once") as HTMLInputElement;
    const profile = screen.getByTestId(
      "payout-scope-profile",
    ) as HTMLInputElement;
    expect(once.checked).toBe(true);
    expect(profile.checked).toBe(false);
  });

  it("Fall C: the clarity line names both accounts once the new IBAN is valid", async () => {
    render(PayoutBlock, {
      props: { maskedIban: MASKED, override: true, iban: VALID_IBAN },
    });
    const clarity = screen.getByTestId("payout-clarity");
    expect(clarity.textContent).toMatch(/Diese Erstattung geht an/);
    expect(clarity.textContent).toContain("DE89 •••• 3000");
    // …and it still names the account that stays untouched.
    expect(clarity.textContent).toContain(MASKED);
  });

  it("Fall C: choosing 'auch im Profil' drops the now-false clarity line", async () => {
    render(PayoutBlock, {
      props: { maskedIban: MASKED, override: true, iban: VALID_IBAN },
    });
    expect(screen.queryByTestId("payout-clarity")).toBeTruthy();
    await fireEvent.change(screen.getByTestId("payout-scope-profile"));
    expect(screen.queryByTestId("payout-clarity")).toBeNull();
  });

  it("Fall B: the IBAN is captured in the form, save-to-profile pre-checked", () => {
    const { container } = render(PayoutBlock, { props: { maskedIban: null } });
    expect(
      container
        .querySelector('[data-slot="payout-block"]')
        ?.getAttribute("data-mode"),
    ).toBe("entry");
    expect(screen.getByText("IBAN fürs Zurücküberweisen")).toBeTruthy();
    const save = screen.getByTestId(
      "payout-save-to-profile",
    ) as HTMLInputElement;
    expect(save.checked).toBe(true);
    expect(
      screen.getByText(/geht verschlüsselt direkt an den Vorstand/),
    ).toBeTruthy();
  });

  it("scolds only once the input is long enough to plausibly be complete", async () => {
    const { rerender } = render(PayoutBlock, {
      props: { maskedIban: null, iban: "DE89 37" },
    });
    // Half-typed is "not done yet", not "wrong".
    expect(screen.queryByTestId("payout-iban-error")).toBeNull();

    await rerender({ maskedIban: null, iban: INVALID_IBAN });
    expect(screen.getByTestId("payout-iban-error").textContent).toMatch(
      /Das ist keine gültige IBAN — prüf Ländercode und Länge\./,
    );
  });

  it("surfaces a server error over the client wording", () => {
    render(PayoutBlock, {
      props: { maskedIban: null, error: "Diese IBAN kennt der Verein schon." },
    });
    expect(screen.getByTestId("payout-iban-error").textContent).toMatch(
      /Diese IBAN kennt der Verein schon\./,
    );
  });
});

describe("IbanInlineEdit", () => {
  it("shows the stored IBAN masked and starts editing from an EMPTY field", async () => {
    render(IbanInlineEdit, { props: { maskedIban: MASKED, action: "?/iban" } });
    expect(screen.getByTestId("iban-inline-value").textContent?.trim()).toBe(
      MASKED,
    );

    await fireEvent.click(screen.getByTestId("iban-inline-edit-start"));
    const input = screen.getByTestId("iban-inline-input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toMatch(/ersetzt die hinterlegte/);
  });

  it("invites a first IBAN when none is on file", () => {
    render(IbanInlineEdit, { props: { maskedIban: null, action: "?/iban" } });
    expect(screen.getByTestId("iban-inline-value").textContent).toMatch(
      /Noch keine hinterlegt/,
    );
    expect(screen.getByTestId("iban-inline-edit-start").textContent).toMatch(
      /Eintragen/,
    );
  });
});

describe("WelcomeCard", () => {
  it("W1: asks for the IBAN and keeps 'Später' a first-class answer", () => {
    render(WelcomeCard, { props: { vorname: "Anna", maskedIban: null } });
    expect(
      screen.getByText(/Magst du gleich deine IBAN dalassen, Anna\?/),
    ).toBeTruthy();
    expect(screen.getByTestId("welcome-iban-input")).toBeTruthy();
    expect(screen.getByTestId("welcome-skip")).toBeTruthy();
  });

  it("W2: confirms the stored account instead of asking again (derive-don't-ask)", async () => {
    render(WelcomeCard, { props: { vorname: "Anna", maskedIban: MASKED } });
    expect(screen.getByText(/Passt dein Konto noch, Anna\?/)).toBeTruthy();
    expect(screen.getByTestId("welcome-masked-iban").textContent?.trim()).toBe(
      MASKED,
    );
    // No field until the member says the account is wrong.
    expect(screen.queryByTestId("welcome-iban-input")).toBeNull();

    await fireEvent.click(screen.getByTestId("welcome-replace"));
    const input = screen.getByTestId("welcome-iban-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("is an invitation, not a warning — no amber anywhere in the card", () => {
    const { container } = render(WelcomeCard, {
      props: { vorname: "Anna", maskedIban: null },
    });
    expect(container.innerHTML).not.toMatch(/severity-warn|amber|flag-warn/);
  });

  it("never disables its primary — it explains itself instead", () => {
    render(WelcomeCard, { props: { vorname: "Anna", maskedIban: null } });
    const save = screen.getByTestId("welcome-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });
});

describe("SubmitHandoff", () => {
  const single = [
    {
      ausId: "AUS-2026-0071",
      bezeichnung: "Getränke",
      betragCents: 2490,
      belegOk: true,
      belegName: "bon.jpg",
    },
  ];

  it("greets by name and shows the single receipt card", () => {
    render(SubmitHandoff, {
      props: {
        vorname: "Anna",
        items: single,
        gesamtCents: 2490,
        statusHref: "/portal/auslagen/AUS-2026-0071",
      },
    });
    expect(screen.getByText(/Hat geklappt, Anna!/)).toBeTruthy();
    expect(screen.getByTestId("aus-id-card")).toBeTruthy();
    expect(screen.queryByTestId("batch-confirm-group")).toBeNull();
    expect(screen.getByTestId("handoff-timeline")).toBeTruthy();
  });

  it("promises every Auslage its own number in a batch", () => {
    render(SubmitHandoff, {
      props: {
        vorname: "Anna",
        items: [
          ...single,
          {
            ausId: "AUS-2026-0072",
            bezeichnung: "Standmiete",
            betragCents: 1490,
          },
        ],
        gesamtCents: 3980,
        statusHref: "/portal/auslagen/AUS-2026-0071",
      },
    });
    expect(screen.getByText(/jede mit ihrer eigenen Nummer/)).toBeTruthy();
    expect(screen.getByTestId("batch-confirm-group")).toBeTruthy();
    expect(screen.queryByTestId("aus-id-card")).toBeNull();
  });
});
