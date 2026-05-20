import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import PageHeaderTest from "./page-header.test.svelte";

afterEach(() => cleanup());

describe("PageHeader", () => {
  it("renders an h1 with the heading text", () => {
    render(PageHeaderTest, { props: { heading: "Dashboard" } });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.trim()).toBe("Dashboard");
  });

  it("renders an eyebrow above the heading", () => {
    render(PageHeaderTest, { props: { heading: "x", eyebrow: "Phase 2" } });
    const eyebrow = screen.getByTestId("page-header-eyebrow");
    expect(eyebrow.textContent?.trim()).toBe("Phase 2");
  });

  it("omits eyebrow when prop not provided", () => {
    render(PageHeaderTest, { props: { heading: "x" } });
    expect(screen.queryByTestId("page-header-eyebrow")).toBeNull();
  });

  it("renders actions slot when provided", () => {
    render(PageHeaderTest, { props: { heading: "x", withActions: true } });
    expect(screen.getByTestId("page-header-actions")).toBeTruthy();
    expect(screen.getByText("Action Button")).toBeTruthy();
  });

  it("renders description when provided", () => {
    render(PageHeaderTest, {
      props: { heading: "x", description: "A nice page" },
    });
    expect(screen.getByText("A nice page")).toBeTruthy();
  });

  it("has data-slot=page-header", () => {
    const { container } = render(PageHeaderTest, {
      props: { heading: "x" },
    });
    expect(container.querySelector('[data-slot="page-header"]')).toBeTruthy();
  });
});
