import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import KategorienRanking from "./KategorienRanking.svelte";

afterEach(() => cleanup());

const items = Array.from({ length: 13 }, (_, i) => ({
  name: `Posten ${i + 1}`,
  cents: (13 - i) * 30000,
}));

describe("KategorienRanking", () => {
  it("folds the tail past the top N into a single Sonstige row", () => {
    render(KategorienRanking, { props: { items, topN: 8 } });
    const rows = screen
      .getByTestId("kategorien-table")
      .querySelectorAll("tbody tr");
    // 8 named + 1 Sonstige
    expect(rows).toHaveLength(9);
    expect(screen.getByTestId("kategorien-table").textContent).toContain(
      "Sonstige",
    );
  });

  it("renders every item directly when under the fold threshold", () => {
    render(KategorienRanking, { props: { items: items.slice(0, 5), topN: 8 } });
    const rows = screen
      .getByTestId("kategorien-table")
      .querySelectorAll("tbody tr");
    expect(rows).toHaveLength(5);
  });
});
