import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import BeitraegeStatus from "./BeitraegeStatus.svelte";

afterEach(() => cleanup());

const nb = (s: string | null) =>
  (s ?? "").split(String.fromCharCode(160)).join(" ");

const props = {
  sollCents: 139380,
  eingegangenCents: 97566,
  perMemberCents: 6969,
  total: 20,
  paid: { count: 14, cents: 97566 },
  open: { count: 2, cents: 13938 },
  over: { count: 2, cents: 13938 },
  exempt: { count: 2, cents: 13938 },
};

describe("BeitraegeStatus", () => {
  it("leads with the Kassenstand and splits the Soll into four meter segments", () => {
    render(BeitraegeStatus, { props });
    expect(nb(screen.getByTestId("beitraege-kasse").textContent)).toContain(
      "975,66 €",
    );
    // meter has one segment per state
    expect(screen.getByTestId("beitraege-meter").children).toHaveLength(4);
  });

  it("each state row prints count + share + betrag", () => {
    render(BeitraegeStatus, { props });
    const over = nb(screen.getByTestId("beitraege-row-over").textContent);
    expect(over).toContain("Überfällig");
    expect(over).toContain("139,38 €");
    expect(over).toContain("10"); // 2/20 = 10 %
  });
});
