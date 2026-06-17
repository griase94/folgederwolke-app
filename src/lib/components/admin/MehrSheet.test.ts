/**
 * Aurora slice 2 — Mehr sheet (spec §5).
 * Open state comes from page.state.mehrSheet (history-entry contract);
 * tiles navigate with replaceState so the sheet entry is consumed.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";

// vi.mock() is hoisted above imports by vitest, so mockPage must be created
// via vi.hoisted() to be available when the factory runs.
const mockPage = vi.hoisted(() => ({
  url: new URL("http://localhost/app"),
  data: {
    user: {
      id: "u1",
      email: "kassen@test.de",
      name: "Karin Kassen",
      role: "admin",
    },
    vereinName: "Test e.V.",
    festgeschriebenBis: 2023,
    currentYear: 2026,
  } as Record<string, unknown>,
  state: { mehrSheet: true } as Record<string, unknown>,
}));

vi.mock("$app/state", () => ({ page: mockPage }));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), pushState: vi.fn() }));

import MehrSheet from "./MehrSheet.svelte";
import { goto } from "$app/navigation";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockPage.state = { mehrSheet: true };
  mockPage.data["festgeschriebenBis"] = 2023;
});

describe("MehrSheet", () => {
  it("renders the profile row (name, role · Verein, Konto)", () => {
    render(MehrSheet);
    expect(screen.getByText("Karin Kassen")).toBeTruthy();
    expect(screen.getByText(/Admin · Test e\.V\./)).toBeTruthy();
    expect(screen.getByText("Konto")).toBeTruthy();
  });

  it("renders the six spec tiles in order", () => {
    render(MehrSheet);
    const tiles = [...document.querySelectorAll('[data-testid="mehr-tile"]')];
    expect(tiles.map((t) => t.textContent?.trim())).toEqual([
      "Projekte",
      "Mitglieder",
      "Jahresabschluss",
      "Rechnungen",
      "Kunden",
      "Einstellungen",
    ]);
  });

  it("tile tap navigates with replaceState (history entry consumed)", async () => {
    render(MehrSheet);
    const projekte = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="mehr-tile"]',
      ),
    ][0]!;
    await fireEvent.click(projekte);
    expect(goto).toHaveBeenCalledWith("/app/projekte", { replaceState: true });
  });

  it("shows the seasonal amber dot on Jahresabschluss while a prior year is open", () => {
    render(MehrSheet);
    expect(
      document.querySelector('[data-testid="jahresabschluss-dot"]'),
    ).toBeTruthy();
  });

  it("hides the dot when the prior year is festgeschrieben", () => {
    mockPage.data["festgeschriebenBis"] = 2025;
    render(MehrSheet);
    expect(
      document.querySelector('[data-testid="jahresabschluss-dot"]'),
    ).toBeNull();
  });

  it("renders the footer: DSGVO & Datenschutz link + Abmelden submit", () => {
    render(MehrSheet);
    const dsgvo = document.querySelector<HTMLAnchorElement>(
      'a[href="/app/dsgvo"]',
    );
    expect(dsgvo?.textContent).toContain("DSGVO & Datenschutz");
    const abmelden = screen.getByRole("button", { name: "Abmelden" });
    expect(abmelden.getAttribute("type")).toBe("submit");
    expect(abmelden.closest("form")?.getAttribute("action")).toBe(
      "/sign-out?/signout",
    );
  });

  it("does not render content when page.state.mehrSheet is unset", () => {
    mockPage.state = {};
    render(MehrSheet);
    expect(document.querySelector('[data-testid="mehr-tile"]')).toBeNull();
  });
});
