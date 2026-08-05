/**
 * RejectDialog — reason picker + the frictions that protect a typed reason
 * (modal-reject.md §2/§3).
 *
 * The three behaviours worth a test are the ones a careless refactor breaks
 * silently: the template↔textarea contract (including the dirty guard), the
 * 3-character gate that mirrors the server, and the sub-line that must not
 * promise a mail when no address is on file.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";

// enhance is a no-op passthrough here; the submit path itself is e2e territory.
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));

import RejectDialog, {
  REJECT_TEMPLATES,
  GRUND_MIN,
} from "./RejectDialog.svelte";

const baseProps = {
  open: true,
  submissionId: "sub-1",
  ausId: "AUS-2026-0040",
  empfaengerDisplay: "Lena Huber",
  hasEmail: true,
};

afterEach(() => cleanup());

function grundField(): HTMLTextAreaElement {
  return screen.getByTestId("reject-grund") as HTMLTextAreaElement;
}

describe("RejectDialog", () => {
  it("opens on the first template with its text prefilled", () => {
    render(RejectDialog, { props: baseProps });
    expect(screen.getByText("Einreichung AUS-2026-0040 ablehnen")).toBeTruthy();
    expect(grundField().value).toBe(REJECT_TEMPLATES[0]!.text);
    expect(
      screen.getByTestId("reject-template-beleg_unleserlich").dataset[
        "selected"
      ],
    ).toBe("");
  });

  it("replaces the reason when another template is picked", async () => {
    render(RejectDialog, { props: baseProps });
    const doppelt = screen
      .getByTestId("reject-template-doppelte_einreichung")
      .querySelector<HTMLInputElement>("input")!;
    await fireEvent.click(doppelt);
    expect(grundField().value).toBe(
      REJECT_TEMPLATES.find((t) => t.key === "doppelte_einreichung")!.text,
    );
  });

  it("empties the field for Sonstiges and offers a placeholder", async () => {
    render(RejectDialog, { props: baseProps });
    const sonstiges = screen
      .getByTestId("reject-template-sonstiges")
      .querySelector<HTMLInputElement>("input")!;
    await fireEvent.click(sonstiges);
    expect(grundField().value).toBe("");
    expect(grundField().placeholder).toContain("In eigenen Worten");
  });

  it("moves the selection to Sonstiges once the reason is hand-edited", async () => {
    render(RejectDialog, { props: baseProps });
    await fireEvent.input(grundField(), {
      target: { value: "Eigener Text statt Vorlage." },
    });
    // The edit is no longer "the template" — so the next template pick cannot
    // silently overwrite it without the radio having said so first.
    expect(
      screen.getByTestId("reject-template-sonstiges").dataset["selected"],
    ).toBe("");
    expect(
      screen.getByTestId("reject-template-beleg_unleserlich").dataset[
        "selected"
      ],
    ).toBe(undefined);
    expect(grundField().value).toBe("Eigener Text statt Vorlage.");
  });

  // SLOT-FELD §4: the submit is no longer disabled for an unfinished reason —
  // it stays open and constraint validation refuses the click and names the
  // gap. What must still hold is that a too-short reason CANNOT be submitted
  // and that the threshold is explained, so that is what this asserts.
  it("refuses a reason below the 3-character minimum and explains the threshold", async () => {
    render(RejectDialog, { props: baseProps });
    const submit = screen.getByTestId("reject-submit") as HTMLButtonElement;
    const grund = grundField();

    await fireEvent.input(grund, { target: { value: "ab" } });
    expect(submit.disabled).toBe(false);
    expect(grund.checkValidity()).toBe(false);
    expect(grund.validationMessage).toContain(`${GRUND_MIN} Zeichen`);
    expect(screen.getByTestId("reject-hint").textContent).toContain(
      `Mindestens ${GRUND_MIN} Zeichen`,
    );

    await fireEvent.input(grund, { target: { value: "abc" } });
    expect(submit.disabled).toBe(false);
    expect(grund.checkValidity()).toBe(true);
    expect(screen.getByTestId("reject-hint").textContent).toContain(
      "1:1 in der Ablehnungs-Mail",
    );
  });

  // `minlength` counts whitespace; the server trims. Without the custom
  // validity below, five spaces would clear the HTML rule and buy a round-trip
  // that comes back with the same "no".
  it("counts a whitespace-only reason as empty, not as five characters", async () => {
    render(RejectDialog, { props: baseProps });
    const grund = grundField();
    await fireEvent.input(grund, { target: { value: "     " } });
    expect(grund.value.length).toBeGreaterThanOrEqual(GRUND_MIN);
    expect(grund.checkValidity()).toBe(false);
    expect(
      (screen.getByTestId("reject-submit") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("names the recipient of the rejection mail", () => {
    render(RejectDialog, { props: baseProps });
    expect(screen.getByTestId("reject-sub").textContent).toContain(
      "Lena Huber",
    );
  });

  it("says the rejection stays internal when no address is on file", () => {
    render(RejectDialog, { props: { ...baseProps, hasEmail: false } });
    const sub = screen.getByTestId("reject-sub").textContent ?? "";
    expect(sub).toContain("keine E-Mail hinterlegt");
    expect(sub).not.toContain("Lena Huber");
  });

  it("gives the footer buttons equal weight — no nudge either way", () => {
    const { container } = render(RejectDialog, { props: baseProps });
    const footer = container.ownerDocument.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]',
    )!;
    expect(footer.className).toContain("sm:[&>*]:flex-1");
    expect(footer.className).toContain("flex-col-reverse");
  });

  it("carries the reason text, not the template label, as the payload", () => {
    render(RejectDialog, { props: baseProps });
    expect(grundField().name).toBe("grund");
    // No template key is ever submitted — the server knows nothing about them.
    const form = grundField().closest("form")!;
    expect(form.querySelector('[name="template_key"]')).toBeNull();
    expect(
      form.querySelector<HTMLInputElement>('input[name="submissionId"]')!.value,
    ).toBe("sub-1");
  });
});
