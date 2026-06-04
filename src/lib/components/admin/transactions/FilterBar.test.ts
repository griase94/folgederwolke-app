// FilterBar.test.ts
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import FilterBar from "./FilterBar.svelte";
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
// FilterBar reads $page.url to serialize current state → also mock $app/stores (mirror MobileTabBar.test.ts):
vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");
  return {
    page: readable({ url: new URL("http://localhost/app/ausgaben"), data: {} }),
  };
});

afterEach(() => cleanup());

describe("FilterBar", () => {
  it("renders a chip per active filter + a reset control", async () => {
    render(FilterBar, {
      props: {
        tab: "ausgaben",
        state: {
          enums: { status: ["offen"] },
          members: {},
          amount: {},
          booleans: {},
        },
        kategorieOptions: [],
        memberOptions: [],
        resultCount: 7,
      },
    });
    expect(await screen.findByText(/Status/)).toBeTruthy();
    expect(screen.getByText(/7/)).toBeTruthy(); // live count
    expect(screen.getByRole("button", { name: /Zurücksetzen/i })).toBeTruthy();
  });
  it("shows a filter-count badge on the +Filter trigger when filters are active", () => {
    render(FilterBar, {
      props: {
        tab: "ausgaben",
        state: {
          enums: { status: ["offen"], bezahltVon: ["member"] },
          members: {},
          amount: {},
          booleans: {},
        },
        kategorieOptions: [],
        memberOptions: [],
        resultCount: 3,
      },
    });
    expect(screen.getByTestId("filter-count-badge").textContent).toContain("2");
  });
});
