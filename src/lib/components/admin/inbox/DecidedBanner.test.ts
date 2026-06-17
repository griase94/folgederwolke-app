/**
 * Aurora inbox redesign — DecidedBanner (spec §2.4 read-only decided state).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import DecidedBanner from "./DecidedBanner.svelte";

afterEach(() => cleanup());

describe("DecidedBanner", () => {
  it("approved: shows 'Freigegeben · Betrag · Datum' + Zur-Ausgabe link", () => {
    render(DecidedBanner, {
      props: {
        decision: "approved",
        decidedAt: "2026-05-16T10:00:00.000Z",
        betragCents: 8450,
        decisionReason: null,
        linkedExpenseId: "exp-1",
      },
    });
    expect(screen.getByText(/Freigegeben/)).toBeTruthy();
    expect(screen.getByText(/84,50/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Zur Ausgabe/ });
    expect(link.getAttribute("href")).toBe("/app/ausgaben/exp-1");
  });

  it("approved without a linked expense: no Zur-Ausgabe link", () => {
    render(DecidedBanner, {
      props: {
        decision: "approved",
        decidedAt: "2026-05-16T10:00:00.000Z",
        betragCents: 8450,
        decisionReason: null,
        linkedExpenseId: null,
      },
    });
    expect(screen.queryByRole("link", { name: /Zur Ausgabe/ })).toBeNull();
  });

  it("rejected: shows 'Abgelehnt · Datum' + the Grund", () => {
    render(DecidedBanner, {
      props: {
        decision: "rejected",
        decidedAt: "2026-05-16T10:00:00.000Z",
        betragCents: 8450,
        decisionReason: "Beleg unleserlich",
        linkedExpenseId: null,
      },
    });
    expect(screen.getByText(/Abgelehnt/)).toBeTruthy();
    expect(screen.getByText("Beleg unleserlich")).toBeTruthy();
  });
});
