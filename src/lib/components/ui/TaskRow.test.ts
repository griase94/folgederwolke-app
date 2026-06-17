/**
 * Aurora — TaskRow (master §2.4 frozen contract). Single-link row;
 * {title}, {amount}, {ctaLabel}; rail variants; CTA emphasis from railKind.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import TaskRowHarness from "./TaskRow.test.svelte";

afterEach(() => cleanup());

describe("TaskRow", () => {
  it("is exactly ONE link with the contract accessible name (amount included)", () => {
    const { container } = render(TaskRowHarness, {
      props: {
        title: "2 Erstattungen freigegeben",
        amountCents: 12345,
        ctaLabel: "Zur Überweisungsliste",
      },
    });
    expect(container.querySelectorAll("a, button").length).toBe(1);
    const link = screen.getByRole("link");
    // formatMoney (Intl de-DE currency) emits U+00A0 (NBSP) before €, so the
    // exact-string .toBe would fail on an ASCII-space literal. Match with a
    // regex tolerant of NBSP/ASCII space ([\s ] — \s already covers NBSP);
    // the non-amount text stays exact. Expected: PASS.
    expect(link.getAttribute("aria-label")).toMatch(
      /^2 Erstattungen freigegeben, 123,45[\s ]€, Zur Überweisungsliste$/,
    );
  });

  it("omits the amount from the accessible name when amountCents is undefined", () => {
    render(TaskRowHarness, {
      props: { title: "3 Beiträge überfällig", ctaLabel: "Ansehen" },
    });
    expect(screen.getByRole("link").getAttribute("aria-label")).toBe(
      "3 Beiträge überfällig, Ansehen",
    );
  });

  it("exposes the rail variant via data-rail and renders the chip snippet", () => {
    render(TaskRowHarness, { props: { railKind: "warn" } });
    expect(screen.getByRole("link").getAttribute("data-rail")).toBe("warn");
    expect(screen.getByTestId("chip-content")).toBeTruthy();
  });

  it("rank1 renders the filled primary-strong CTA pill", () => {
    render(TaskRowHarness, {
      props: { railKind: "rank1", ctaLabel: "Prüfen" },
    });
    const cta = screen.getByTestId("task-cta");
    expect(cta.className).toContain("bg-primary-strong");
    expect(cta.className).toContain("text-white");
  });

  it("critical renders the filled red CTA (rank-0 rule)", () => {
    render(TaskRowHarness, {
      props: { railKind: "critical", severity: "critical" },
    });
    const cta = screen.getByTestId("task-cta");
    expect(cta.className).toContain("bg-severity-critical");
  });

  it("warn/default render a text-link CTA (no fill)", () => {
    for (const railKind of ["warn", "default"] as const) {
      const { unmount } = render(TaskRowHarness, { props: { railKind } });
      const cta = screen.getByTestId("task-cta");
      expect(cta.className).toContain("text-primary-text");
      expect(cta.className).not.toContain("bg-primary-strong");
      expect(cta.className).not.toContain("bg-severity-critical");
      unmount();
    }
  });
});
