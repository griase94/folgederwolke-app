/**
 * Aurora slice 2 — mobile tab bar (spec §5, option B):
 * Übersicht · Transaktionen · ⊕ · Prüfung · Mehr.
 *  - Transaktionen href stays /app/ausgaben (slice-5 flips it), active state
 *    spans all three type routes via mobileTransaktionenActive()
 *  - ⊕ / Mehr open their sheets via pushState (history-entry contract)
 *  - Prüfung badge from page.data.openAuslagenCount, capped "9+"
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";

// vi.mock() is hoisted above imports by vitest, so mockPage must be created
// via vi.hoisted() to be available when the factory runs.
const mockPage = vi.hoisted(() => ({
  url: new URL("http://localhost/app"),
  data: { openAuslagenCount: 3 } as Record<string, unknown>,
  state: {} as Record<string, unknown>,
}));

vi.mock("$app/state", () => ({ page: mockPage }));
vi.mock("$app/navigation", () => ({
  pushState: vi.fn(),
  goto: vi.fn(),
  preloadData: vi.fn().mockResolvedValue(undefined),
}));

import MobileTabBar from "./MobileTabBar.svelte";
import { pushState } from "$app/navigation";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockPage.url = new URL("http://localhost/app");
  mockPage.data = { openAuslagenCount: 3 };
  mockPage.state = {};
});

describe("MobileTabBar — Aurora five-cell bar", () => {
  it("renders the four labeled cells in spec order with the spec hrefs", () => {
    const { container } = render(MobileTabBar);
    const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")];
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "Übersicht",
      "Transaktionen",
      "Prüfung",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/app",
      "/app/ausgaben", // slice phasing: slice 5 flips this to /app/transaktionen
      "/app/inbox",
    ]);
    expect(screen.getByRole("button", { name: /^Mehr/ })).toBeTruthy();
  });

  it("⊕ opens the type-chooser via pushState({ createSheet: true })", async () => {
    render(MobileTabBar);
    const plus = screen.getByRole("button", { name: "Neu erfassen" });
    expect(plus.getAttribute("aria-haspopup")).toBe("dialog");
    await fireEvent.click(plus);
    expect(pushState).toHaveBeenCalledWith("", { createSheet: true });
  });

  it("Mehr opens its sheet via pushState({ mehrSheet: true })", async () => {
    render(MobileTabBar);
    await fireEvent.click(screen.getByRole("button", { name: /^Mehr/ }));
    expect(pushState).toHaveBeenCalledWith("", { mehrSheet: true });
  });

  it("shows the Prüfung badge with the open count", () => {
    render(MobileTabBar);
    expect(screen.getByTestId("pruefung-badge").textContent).toBe("3");
  });

  it("caps the badge at 9+", () => {
    mockPage.data = { openAuslagenCount: 12 };
    render(MobileTabBar);
    expect(screen.getByTestId("pruefung-badge").textContent).toBe("9+");
  });

  it("hides the badge at zero", () => {
    mockPage.data = { openAuslagenCount: 0 };
    render(MobileTabBar);
    expect(document.querySelector('[data-testid="pruefung-badge"]')).toBeNull();
  });

  it("Transaktionen is active across all three type routes (spec §5 active-state rules)", () => {
    mockPage.url = new URL("http://localhost/app/spenden/abc-123");
    const { container } = render(MobileTabBar);
    const tx = container.querySelector<HTMLAnchorElement>(
      'a[href="/app/ausgaben"]',
    );
    expect(tx!.getAttribute("aria-current")).toBe("page");
    expect(tx!.className).toContain("text-primary-text");
  });

  it("Prüfung is active on inbox detail routes", () => {
    mockPage.url = new URL("http://localhost/app/inbox/aus-1");
    const { container } = render(MobileTabBar);
    const pruefung = container.querySelector<HTMLAnchorElement>(
      'a[href="/app/inbox"]',
    );
    expect(pruefung!.getAttribute("aria-current")).toBe("page");
  });

  it("keeps the safe-area utility on the bar (home indicator)", () => {
    const { container } = render(MobileTabBar);
    expect(container.querySelector("nav")!.className).toMatch(
      /\bnav-safe-bottom\b/,
    );
  });
});
