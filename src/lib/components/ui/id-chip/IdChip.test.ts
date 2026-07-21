import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import IdChip from "./IdChip.svelte";

afterEach(() => cleanup());

describe("IdChip", () => {
  it("renders the identifier value", () => {
    render(IdChip, { props: { value: "B-2026-014" } });
    const chip = screen.getByTestId("id-chip");
    expect(chip.textContent).toContain("B-2026-014");
    expect(chip.className).toContain("id-chip");
    expect(chip.classList.contains("pending")).toBe(false);
  });

  it("pending renders the placeholder with dashed/muted styling", () => {
    render(IdChip, { props: { value: "B-2026-###", pending: true } });
    const chip = screen.getByTestId("id-chip");
    expect(chip.textContent).toContain("B-2026-###");
    // pending is a dashed, muted variant — never a status colour
    expect(chip.classList.contains("pending")).toBe(true);
  });
});
