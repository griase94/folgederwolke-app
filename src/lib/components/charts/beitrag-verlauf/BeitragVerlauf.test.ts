import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import BeitragVerlauf from "./BeitragVerlauf.svelte";

afterEach(() => cleanup());

const nb = (s: string | null) =>
  (s ?? "").split(String.fromCharCode(160)).join(" ");

const props = {
  cumulativeCents: [
    34845, 55752, 69690, 83628, 90597, 97566, 97566, 104535, 104535, 111504,
    111504, 118473,
  ],
  membersPaid: [5, 8, 10, 12, 13, 14, 14, 15, 15, 16, 16, 17],
  targetCents: 139380,
  totalMembers: 20,
  year: 2026,
};

describe("BeitragVerlauf", () => {
  it("renders the readout card + a full sr-only table twin", () => {
    render(BeitragVerlauf, { props });
    expect(screen.getByTestId("beitrag-verlauf")).toBeTruthy();
    expect(nb(screen.getByTestId("beitrag-readout").textContent)).toContain(
      "1.184,73 €",
    ); // Stand Dez
    expect(
      screen.getByTestId("beitrag-table").querySelectorAll("tbody tr"),
    ).toHaveLength(12);
  });

  it("does not crash when nothing has been collected yet", () => {
    expect(() =>
      render(BeitragVerlauf, {
        props: {
          ...props,
          cumulativeCents: new Array(12).fill(0),
          membersPaid: new Array(12).fill(0),
        },
      }),
    ).not.toThrow();
  });
});
