import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import SphereOverrideBanner from "./SphereOverrideBanner.svelte";

describe("SphereOverrideBanner", () => {
  it("renders nothing when sphereDefault is null", () => {
    const { container } = render(SphereOverrideBanner, { sphereDefault: null });
    expect(container.textContent ?? "").toBe("");
  });

  it("renders override message when sphereDefault is 'zweckbetrieb'", () => {
    render(SphereOverrideBanner, { sphereDefault: "zweckbetrieb" });
    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/Zweckbetrieb/i);
    expect(note.textContent).toMatch(/Sphäre/i);
  });
});
