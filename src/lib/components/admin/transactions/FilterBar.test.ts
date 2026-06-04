// FilterBar.test.ts
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import FilterBar from "./FilterBar.svelte";
import { goto } from "$app/navigation";
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
// FilterBar reads $page.url to serialize current state → also mock $app/stores (mirror MobileTabBar.test.ts).
// The URL carries ?page=5 so we can assert pagination is reset on a filter change.
vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");
  return {
    page: readable({
      url: new URL("http://localhost/app/ausgaben?status=offen&page=5"),
      data: {},
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(goto).mockClear();
});

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
  it("resets ?page on a filter change (removing a chip strips stale pagination)", async () => {
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
    // Remove the Status:Offen chip → navigate() rewrites the URL.
    const remove = screen.getByRole("button", { name: /Offen entfernen/i });
    await fireEvent.click(remove);
    expect(goto).toHaveBeenCalledTimes(1);
    const target = String(vi.mocked(goto).mock.calls[0][0]);
    // The stale ?page=5 must be gone; the removed status filter too.
    expect(target).not.toMatch(/[?&]page=/);
    expect(target).not.toMatch(/status=/);
  });
});
