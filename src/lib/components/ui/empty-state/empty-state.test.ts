import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import EmptyStateTest from "./empty-state.test.svelte";

afterEach(() => cleanup());

describe("EmptyState", () => {
  it("renders the title text", () => {
    render(EmptyStateTest, { props: { title: "No bookings yet" } });
    expect(screen.getByText("No bookings yet")).toBeTruthy();
  });

  it("renders the description text when provided", () => {
    render(EmptyStateTest, {
      props: { title: "x", description: "Add your first booking" },
    });
    expect(screen.getByText("Add your first booking")).toBeTruthy();
  });

  it("renders CTA slot when provided", () => {
    render(EmptyStateTest, { props: { title: "x", withCta: true } });
    expect(screen.getByTestId("empty-state-cta")).toBeTruthy();
    expect(screen.getByText("Create one")).toBeTruthy();
  });

  it("renders icon slot when provided", () => {
    render(EmptyStateTest, { props: { title: "x", withIcon: true } });
    expect(screen.getByTestId("empty-state-icon")).toBeTruthy();
  });

  it("has data-slot=empty-state on the root", () => {
    const { container } = render(EmptyStateTest, {
      props: { title: "x" },
    });
    expect(container.querySelector('[data-slot="empty-state"]')).toBeTruthy();
  });

  it("title is rendered in a heading element", () => {
    render(EmptyStateTest, { props: { title: "Heading text" } });
    // EmptyState uses an h3 or h2 — test that some heading carries the text
    const headings = screen.getAllByRole("heading");
    const match = headings.find((h) => h.textContent?.includes("Heading text"));
    expect(match).toBeTruthy();
  });
});
