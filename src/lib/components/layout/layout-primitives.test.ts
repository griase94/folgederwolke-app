/**
 * Aurora slice 2 — PageShell/PageHeader layout primitives (master §2.3
 * FROZEN contract; spec §4 dimension table).
 *
 * PageShell: form → 640px · list → 1100px · full → no max; one horizontal
 * padding scale (16/24/32, 4px grid); mobile bottom padding clears the
 * fixed tab bar + home indicator.
 * PageHeader: title row → meta line → ONE toolbar row; back slot renders
 * only when backHref is set and only on mobile (md:hidden).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import PageShellHarness from "./PageShell.test.svelte";
import PageHeaderHarness from "./PageHeader.test.svelte";

afterEach(() => cleanup());

describe("PageShell", () => {
  it("renders children inside a data-page-shell wrapper", () => {
    render(PageShellHarness, { props: {} });
    expect(screen.getByTestId("shell-content")).toBeTruthy();
    const shell = document.querySelector("[data-page-shell]");
    expect(shell).toBeTruthy();
  });

  it("width=form caps at 640px", () => {
    render(PageShellHarness, { props: { width: "form" } });
    const shell = document.querySelector<HTMLElement>("[data-page-shell]");
    expect(shell!.dataset["width"]).toBe("form");
    expect(shell!.className).toContain("max-w-[640px]");
  });

  it("width=list (default) caps at 1100px", () => {
    render(PageShellHarness, { props: {} });
    const shell = document.querySelector<HTMLElement>("[data-page-shell]");
    expect(shell!.dataset["width"]).toBe("list");
    expect(shell!.className).toContain("max-w-[1100px]");
  });

  it("width=full has no max-width cap", () => {
    render(PageShellHarness, { props: { width: "full" } });
    const shell = document.querySelector<HTMLElement>("[data-page-shell]");
    expect(shell!.className).toContain("max-w-none");
  });

  it("carries the one horizontal padding scale and vertical padding (clearance owned by AdminShell)", () => {
    render(PageShellHarness, { props: {} });
    const cls =
      document.querySelector<HTMLElement>("[data-page-shell]")!.className;
    expect(cls).toContain("px-4");
    expect(cls).toContain("sm:px-6");
    expect(cls).toContain("lg:px-8");
    // Mobile tab-bar + home-indicator clearance is owned by AdminShell's <main>
    // (pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0) so ALL /app
    // routes get uniform clearance. PageShell adds desktop bottom padding only.
    expect(cls).toContain("pb-6");
    expect(cls).toContain("md:pb-12");
  });
});

describe("PageHeader", () => {
  it("renders the title as the page h1", () => {
    render(PageHeaderHarness, { props: { title: "Projekte" } });
    expect(
      screen.getByRole("heading", { level: 1, name: "Projekte" }),
    ).toBeTruthy();
  });

  it("renders meta and toolbar snippets", () => {
    render(PageHeaderHarness, { props: {} });
    expect(screen.getByTestId("meta-content")).toBeTruthy();
    expect(screen.getByTestId("toolbar-content")).toBeTruthy();
  });

  it("renders NO back link when backHref is unset", () => {
    render(PageHeaderHarness, { props: {} });
    expect(
      document.querySelector('[data-testid="page-header-back"]'),
    ).toBeNull();
  });

  it("renders the mobile-only back link when backHref is set", () => {
    render(PageHeaderHarness, {
      props: { backHref: "/app/ausgaben?year=2026", backLabel: "Ausgaben" },
    });
    const back = document.querySelector<HTMLAnchorElement>(
      '[data-testid="page-header-back"]',
    );
    expect(back).toBeTruthy();
    // Preserves the originating list's query params (spec §4) — the caller
    // passes the full href; PageHeader must not strip it.
    expect(back!.getAttribute("href")).toBe("/app/ausgaben?year=2026");
    expect(back!.textContent).toContain("Ausgaben");
    // Mobile detail routes only — hidden from md upwards.
    expect(back!.className).toContain("md:hidden");
  });

  it("back link falls back to 'Zurück' without backLabel", () => {
    render(PageHeaderHarness, { props: { backHref: "/app/ausgaben" } });
    const back = document.querySelector<HTMLAnchorElement>(
      '[data-testid="page-header-back"]',
    );
    expect(back!.textContent).toContain("Zurück");
  });
});
