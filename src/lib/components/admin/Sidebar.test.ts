/**
 * Aurora slice 2 — Sidebar (spec §5 "Desktop sidebar").
 *  - active entry: gradient-soft pill + primary-text label + aria-current
 *  - "Mehr" group expanded state persists to localStorage
 *  - line-art logo mark (slice-1 asset)
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import { readable } from "svelte/store";

vi.mock("$app/stores", () => ({
  page: readable({
    url: new URL("http://localhost/app/projekte"),
    data: { vereinName: "Test e.V." },
  }),
}));

import Sidebar from "./Sidebar.svelte";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUser: any = {
  id: "user-test-1",
  email: "admin@example.com",
  name: "Admin Tester",
  role: "admin",
};

const MEHR_LS_KEY = "fdw.nav.mehrOpen";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("Sidebar — Aurora", () => {
  it("renders the line-art logo mark and the Verein name", () => {
    const { container } = render(Sidebar, { props: { user: mockUser } });
    const img = container.querySelector<HTMLImageElement>(
      'img[src="/logo-lineart.svg"]',
    );
    expect(img).toBeTruthy();
    expect(container.textContent).toContain("Test e.V.");
  });

  it("active entry carries the gradient-soft pill + primary-text label + aria-current", () => {
    const { container } = render(Sidebar, { props: { user: mockUser } });
    const active = container.querySelector<HTMLAnchorElement>(
      'a[aria-current="page"]',
    );
    expect(active).toBeTruthy();
    expect(active!.getAttribute("href")).toBe("/app/projekte");
    expect(active!.className).toContain("bg-gradient-brand-soft");
    expect(active!.className).toContain("text-primary-text");
    // Inactive entries must NOT carry the pill.
    const uebersicht =
      container.querySelector<HTMLAnchorElement>('a[href="/app"]');
    expect(uebersicht!.className).not.toContain("bg-gradient-brand-soft");
  });

  it("'Mehr' group is collapsed by default and expands on toggle, persisting to localStorage", async () => {
    const { container } = render(Sidebar, { props: { user: mockUser } });
    expect(container.querySelector('[data-nav-group="more"]')).toBeNull();
    const toggle = screen.getByRole("button", { name: /Mehr/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[data-nav-group="more"]')).toBeTruthy();
    expect(localStorage.getItem(MEHR_LS_KEY)).toBe("1");
    await fireEvent.click(toggle);
    expect(localStorage.getItem(MEHR_LS_KEY)).toBe("0");
  });

  it("restores the persisted expanded state on mount", () => {
    localStorage.setItem(MEHR_LS_KEY, "1");
    const { container } = render(Sidebar, { props: { user: mockUser } });
    expect(container.querySelector('[data-nav-group="more"]')).toBeTruthy();
  });

  it("collapsed (tablet) mode renders icon-only entries with title tooltips", () => {
    const { container } = render(Sidebar, {
      props: { user: mockUser, collapsed: true },
    });
    const uebersicht =
      container.querySelector<HTMLAnchorElement>('a[href="/app"]');
    expect(uebersicht!.getAttribute("title")).toBeTruthy();
    expect(uebersicht!.textContent!.trim()).toBe("");
  });
});
