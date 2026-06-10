/**
 * Unit tests for LinkChip — the small navigation chip below the headline KPI cards.
 *
 * Each chip is an <a> with:
 *   - label (e.g. "Offene Rechnungen")
 *   - value (badge number or compact money)
 *   - href to a filtered route
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import LinkChip from "./LinkChip.svelte";

afterEach(() => cleanup());

describe("LinkChip", () => {
  it("renders an anchor with the given href", () => {
    render(LinkChip, {
      props: {
        label: "Offene Rechnungen",
        value: "3",
        href: "/app/rechnungen?status=offen",
      },
    });
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/app/rechnungen?status=offen");
  });

  it("renders the label and value as text content", () => {
    render(LinkChip, {
      props: { label: "Mitglieder", value: "42", href: "/app/mitglieder" },
    });
    const link = screen.getByRole("link");
    expect(link.textContent).toMatch(/Mitglieder/);
    expect(link.textContent).toMatch(/42/);
  });

  it("sets data-testid='link-chip'", () => {
    render(LinkChip, {
      props: { label: "Inbox", value: "5", href: "/app/inbox" },
    });
    expect(screen.getByTestId("link-chip")).toBeTruthy();
  });

  it("supports an accessible aria-label override", () => {
    render(LinkChip, {
      props: {
        label: "Saldo",
        value: "1.234,00 €",
        href: "/app/ausgaben", // Phase 8 T6: /app/transactions retired
        ariaLabel: "Saldo dieses Jahr: 1.234,00 €",
      },
    });
    const link = screen.getByRole("link");
    expect(link.getAttribute("aria-label")).toBe(
      "Saldo dieses Jahr: 1.234,00 €",
    );
  });
});
