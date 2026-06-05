// StaleYearBanner.test.ts
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import StaleYearBanner from "./StaleYearBanner.svelte";
describe("StaleYearBanner", () => {
  it("renders a loud banner naming the year when stale", () => {
    render(StaleYearBanner, {
      props: { selectedYear: 2024, currentYear: 2026 },
    });
    expect(screen.getByRole("status").textContent).toContain("2024");
  });
  it("renders nothing for the current year or Alle Jahre", () => {
    const { container } = render(StaleYearBanner, {
      props: { selectedYear: 2026, currentYear: 2026 },
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
