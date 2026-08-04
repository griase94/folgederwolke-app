/**
 * MemberShell nav — three pills, and Profil on the avatar.
 *
 * Product-lens finding: with four pills the row overflowed a 390px phone, so
 * "Einreichen" was cut mid-word and "Profil" sat off-screen with nothing
 * hinting it existed. Profil moved to the avatar (where "me" belongs) and the
 * row now fits. These tests hold that shape: a fourth pill would silently
 * bring the clipping back, and an avatar that stops being a link would make
 * the profile unreachable again.
 */
import { render, cleanup, screen } from "@testing-library/svelte";
import { describe, it, expect, afterEach, vi } from "vitest";

const pageState = { url: new URL("http://t/portal") };
vi.mock("$app/state", () => ({
  get page() {
    return pageState;
  },
}));

import MemberShell from "./MemberShell.test.svelte";

const props = {
  member: { vorname: "Maximiliane", nachname: "Hollerbach-Wimmer" },
  vereinName: "Verein X e.V.",
};

afterEach(() => {
  cleanup();
  pageState.url = new URL("http://t/portal");
});

describe("MemberShell nav", () => {
  it("carries exactly three pills, in flow order", () => {
    const { container } = render(MemberShell, { props });
    const pills = [
      ...container.querySelectorAll('nav[aria-label="Portal-Navigation"] a'),
    ].map((a) => (a.textContent ?? "").trim());
    expect(pills).toEqual(["Übersicht", "Auslagen", "Einreichen"]);
  });

  it("puts Profil on the avatar, with a name a screen reader can use", () => {
    render(MemberShell, { props });
    const profil = screen.getByTestId("member-nav-profil");
    expect(profil.getAttribute("href")).toBe("/portal/profil");
    expect(profil.textContent).toContain("Mein Profil");
    // Not inside the pill row — that is the whole point of moving it.
    expect(profil.closest('nav[aria-label="Portal-Navigation"]')).toBeNull();
  });

  it("marks the avatar as the current page on the profile route", () => {
    pageState.url = new URL("http://t/portal/profil");
    render(MemberShell, { props });
    const profil = screen.getByTestId("member-nav-profil");
    expect(profil.getAttribute("aria-current")).toBe("page");
    expect(profil.className).toContain("bg-secondary");
  });

  it("keeps the pill row scrollable as a safety net", () => {
    const { container } = render(MemberShell, { props });
    const nav = container.querySelector<HTMLElement>(
      'nav[aria-label="Portal-Navigation"]',
    )!;
    expect(nav.className).toContain("overflow-x-auto");
    // Labels never wrap: a two-line pill is worse than a scroll.
    const pill = nav.querySelector<HTMLElement>("a")!;
    expect(pill.className).toContain("whitespace-nowrap");
    expect(pill.className).toContain("shrink-0");
  });
});
