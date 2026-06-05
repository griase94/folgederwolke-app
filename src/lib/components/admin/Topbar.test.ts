/**
 * @phase-7 C7 cycle 2 — Topbar mobile polish (C7-3 / C7-7)
 *
 * Two findings landed on Topbar:
 *  - C7-3 (PM-010): the Vereinsname wordmark must DISAPPEAR below sm —
 *    on iPhone width the topbar should get back the horizontal space.
 *    The cycle-1 implementation had `sm:hidden` on the WRONG side
 *    (wordmark visible on mobile, hidden on sm+). Invert the breakpoint.
 *  - C7-7: the topbar must apply `.safe-top` so notched iPhones don't
 *    show content under the Dynamic Island. The utility is defined in
 *    app.css but was never wired up.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { readable } from "svelte/store";

// $app/stores — Topbar uses $page.url.pathname for breadcrumbs.
vi.mock("$app/stores", () => ({
  page: readable({
    url: new URL("http://localhost/app/transactions"),
    data: {},
  }),
}));

// $app/navigation — Topbar's search uses goto() but we never trigger it.
vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
}));

import Topbar from "./Topbar.svelte";

// SessionUser is structurally complex (sessions/roles/etc.). The Topbar
// only reads vorname/nachname/email for the avatar / menu — we cast a
// minimal stub to `any` so the test doesn't drag in the full type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUser: any = {
  id: "user-test-1",
  email: "admin@example.com",
  name: "Admin",
  vorname: "Admin",
  nachname: "Tester",
};

afterEach(() => cleanup());

describe("Topbar — mobile polish (C7-3 / C7-7)", () => {
  it("applies .safe-top so notched iPhones reserve Dynamic-Island space (C7-7)", () => {
    const { container } = render(Topbar, { props: { user: mockUser } });
    const header = container.querySelector("header");
    expect(header).toBeTruthy();
    expect(header!.className).toMatch(/\bsafe-top\b/);
  });

  it("hides the Vereinsname wordmark below sm (PM-010 / C7-3)", () => {
    const { container } = render(Topbar, { props: { user: mockUser } });

    // Find the wordmark span by its stable test id (the rendered text is now
    // the runtime vereinName, not a hardcoded literal — white-label).
    const wordmark = container.querySelector<HTMLElement>(
      '[data-testid="verein-wordmark"]',
    );
    expect(wordmark).toBeTruthy();

    // It must be HIDDEN on mobile (< sm). Either it's not rendered, or
    // its classList starts with `hidden` (Tailwind's display-utility hide).
    // The wrong implementation was `sm:hidden` — visible on mobile, hidden
    // on sm+. We assert the inverse.
    const cls = wordmark!.className;
    expect(cls).toMatch(/\bhidden\b/);
    // And it must NOT have the inverted `sm:hidden` (which would hide on
    // sm+ only and keep the wordmark visible on mobile).
    expect(cls).not.toMatch(/\bsm:hidden\b/);
  });
});
