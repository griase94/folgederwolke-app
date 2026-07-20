import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import DocSheet from "./DocSheet.svelte";

afterEach(() => cleanup());

describe("DocSheet", () => {
  it("renders eyebrow, title and subtitle", () => {
    render(DocSheet, {
      props: {
        eyebrow: "Zuwendungsbestätigung",
        title: "Bestätigung über Geldzuwendungen",
        subtitle: "im Sinne des § 10b EStG",
      },
    });
    expect(screen.getByText("Zuwendungsbestätigung")).toBeTruthy();
    expect(screen.getByText("Bestätigung über Geldzuwendungen")).toBeTruthy();
    expect(screen.getByText("im Sinne des § 10b EStG")).toBeTruthy();
  });

  it("invariant: is a fixed-light physical sheet (does NOT invert in dark)", () => {
    render(DocSheet, { props: { title: "Beleg" } });
    const sheet = screen.getByTestId("doc-sheet");
    // marks itself as a non-inverting paper surface + carries color-scheme:light
    expect(sheet.getAttribute("data-paper")).toBe("fixed-light");
    expect(sheet.className).toContain("doc-sheet");
    // it must NOT use the inverting theme surface tokens for its paper
    expect(sheet.className).not.toContain("bg-card");
    expect(sheet.className).not.toContain("bg-background");
  });
});
