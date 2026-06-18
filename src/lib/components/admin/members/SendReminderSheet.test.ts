/**
 * @phase-2 Task E.3 — SendReminderSheet: berlinYear() + openYears dropdown.
 *
 * Two properties under test:
 * 1. Year options come from the openYears prop (not a computed 5-year range).
 * 2. The berlinYear() call path (guarded by verifying openYears shapes the options).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import SendReminderSheet from "./SendReminderSheet.svelte";

// $app/forms enhance blows up in jsdom (requires method="post" on form elements).
// Mock it as a no-op directive so the component mounts cleanly for DOM assertions.
vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
  deserialize: (t: string) => JSON.parse(t),
}));

afterEach(() => cleanup());

const baseMember = {
  id: "m1",
  vorname: "Erika",
  nachname: "Mustermann",
  email: "erika@example.com",
};

describe("SendReminderSheet — openYears dropdown (Package E)", () => {
  it("renders only the years from openYears, not a fixed 5-year range", () => {
    render(SendReminderSheet, {
      props: {
        open: true,
        member: baseMember,
        defaultYear: 2024,
        defaultBetragCents: 6969,
        reminderSentRecently: false,
        openYears: [
          { year: 2024, betragCents: 6969, paidCents: 0 },
          { year: 2023, betragCents: 6969, paidCents: 0 },
        ],
      },
    });

    // Should have exactly 2 options: 2024 and 2023
    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    const yearValues = options.map((o) => Number(o.value));
    expect(yearValues).toContain(2024);
    expect(yearValues).toContain(2023);
    // Must NOT have a year like 2022 or the current year unless in openYears
    expect(yearValues).not.toContain(2022);
    expect(yearValues).not.toContain(2025);
    expect(yearValues.length).toBe(2);
  });

  it("selects defaultYear as the initial value", () => {
    render(SendReminderSheet, {
      props: {
        open: true,
        member: baseMember,
        defaultYear: 2023,
        defaultBetragCents: 6969,
        reminderSentRecently: false,
        openYears: [
          { year: 2024, betragCents: 6969, paidCents: 0 },
          { year: 2023, betragCents: 6969, paidCents: 0 },
        ],
      },
    });

    const select = screen.getByLabelText("Beitragsjahr") as HTMLSelectElement;
    expect(Number(select.value)).toBe(2023);
  });

  it("falls back to a single defaultYear option when openYears is empty", () => {
    render(SendReminderSheet, {
      props: {
        open: true,
        member: baseMember,
        defaultYear: 2026,
        defaultBetragCents: 6969,
        reminderSentRecently: false,
        openYears: [],
      },
    });

    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    // At minimum defaultYear must appear
    const yearValues = options.map((o) => Number(o.value));
    expect(yearValues).toContain(2026);
    expect(yearValues.length).toBe(1);
  });
});
