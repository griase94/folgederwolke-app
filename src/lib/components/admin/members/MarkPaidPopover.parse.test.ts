/**
 * F25 (review F3) — MarkPaidPopover custom-amount parse wiring.
 *
 * The popover's parseCents now delegates to the canonical parseBetragCents. The
 * old local parser stripped every dot, so a dot-decimal "1.50" became 15000
 * cents (150,00 €) instead of 150 (1,50 €). This renders the component, types a
 * dot-decimal, clicks "Bezahlt", and asserts the onPaid payload carries the
 * correctly-parsed cents — a revert to the dot-stripping parser fails this.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import MarkPaidPopover from "./MarkPaidPopover.svelte";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPopover(onPaid: (d: { paidCents: number }) => void) {
  // betragCents high enough that small dot-decimals stay <= the obligation, so
  // the validity clamp (parsedCents <= betragCents) doesn't mask the parse.
  return render(MarkPaidPopover, {
    props: {
      memberId: "m1",
      year: 2026,
      memberName: "Test Mitglied",
      betragCents: 100000,
      paidCents: 0,
      onPaid,
    },
  });
}

describe("MarkPaidPopover parseCents wiring (F25)", () => {
  it("dot-decimal '1.50' → 150 cents (NOT 15000)", async () => {
    const onPaid = vi.fn();
    renderPopover(onPaid);

    const input = document.getElementById("betrag-m1-2026") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "1.50" } });

    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0]![0].paidCents).toBe(150);
  });

  it("German thousands+comma '1.234,56' → 123456 cents", async () => {
    const onPaid = vi.fn();
    // Need betragCents >= 123456 so the value is accepted by the clamp.
    render(MarkPaidPopover, {
      props: {
        memberId: "m2",
        year: 2026,
        memberName: "Test",
        betragCents: 200000,
        paidCents: 0,
        onPaid,
      },
    });

    const input = document.getElementById("betrag-m2-2026") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "1.234,56" } });
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0]![0].paidCents).toBe(123456);
  });
});
