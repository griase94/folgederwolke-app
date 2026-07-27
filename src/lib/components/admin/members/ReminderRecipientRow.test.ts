/**
 * ReminderRecipientRow — one .copt row; honest non-candidate flags.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import ReminderRecipientRow from "./ReminderRecipientRow.svelte";
import type { ReminderCandidate } from "$lib/domain/reminder-candidate.js";

afterEach(() => cleanup());

function candidate(over: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    memberId: "m1",
    name: "Jonas Köhler",
    email: "jonas@example.de",
    state: "overdue",
    openCents: 6969,
    lastReminderAt: null,
    selectable: true,
    blockedReason: null,
    ...over,
  };
}

describe("ReminderRecipientRow", () => {
  it("selectable: enabled checkbox, shows email + open amount", () => {
    render(ReminderRecipientRow, { props: { candidate: candidate() } });
    const cb = screen.getByTestId(
      "reminder-recipient-row-check",
    ) as HTMLInputElement;
    expect(cb.disabled).toBe(false);
    expect(
      screen.getByTestId("reminder-recipient-row-amount").textContent,
    ).toMatch(/69,69/);
  });

  it("no_email: disabled checkbox + 'Keine E-Mail' flag", () => {
    render(ReminderRecipientRow, {
      props: {
        candidate: candidate({
          email: null,
          selectable: false,
          blockedReason: "no_email",
        }),
      },
    });
    const cb = screen.getByTestId(
      "reminder-recipient-row-check",
    ) as HTMLInputElement;
    expect(cb.disabled).toBe(true);
    expect(
      screen.getByTestId("reminder-recipient-row-flag").textContent,
    ).toMatch(/Keine E-Mail/);
  });

  it("recently_reminded: disabled + 'Schon erinnert am {date}' with 30-day note", () => {
    render(ReminderRecipientRow, {
      props: {
        candidate: candidate({
          selectable: false,
          blockedReason: "recently_reminded",
          lastReminderAt: "2026-06-01T10:00:00.000Z",
        }),
      },
    });
    const flag = screen.getByTestId("reminder-recipient-row-flag");
    expect(flag.textContent).toMatch(/Schon erinnert/);
    expect(flag.textContent).toMatch(/01\.06\.2026/);
    expect(flag.textContent).toMatch(/30-Tage-Schutz/);
  });

  it("marks selectability via data attribute for the sheet's bulk logic", () => {
    render(ReminderRecipientRow, {
      props: {
        candidate: candidate({
          selectable: false,
          blockedReason: "no_email",
          email: null,
        }),
      },
    });
    expect(
      screen
        .getByTestId("reminder-recipient-row")
        .getAttribute("data-selectable"),
    ).toBe("false");
  });
});
