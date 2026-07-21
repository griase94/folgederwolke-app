// LockedSphereField.test.ts
//
// The Sphäre is derived read-only from the Kategorie (ADR-0002); this field
// renders that derivation transparently and is NEVER a chooser. There is no
// project-sphere override in the entry path, so the component takes only a
// `sphere` and renders label + swatch + lock + hint.
//
// Reset lane → `pnpm test --run <file>`.
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import LockedSphereField from "./LockedSphereField.svelte";
import { SPHERE_LABELS } from "$lib/domain/sphere.js";

afterEach(() => cleanup());

describe("LockedSphereField", () => {
  it("renders the §13 label for the derived sphere", () => {
    render(LockedSphereField, { props: { sphere: "zweckbetrieb" } });
    expect(screen.getByText(SPHERE_LABELS.zweckbetrieb)).toBeTruthy();
  });

  it("carries no interactive control — it is read-only (no select/input)", () => {
    const { container } = render(LockedSphereField, {
      props: { sphere: "ideeller" },
    });
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  it("exposes the derived sphere on the locked box for styling/tests", () => {
    const { container } = render(LockedSphereField, {
      props: { sphere: "wirtschaftlich" },
    });
    const box = container.querySelector('[data-slot="locked-field"]');
    expect(box?.getAttribute("data-sphere")).toBe("wirtschaftlich");
  });

  it("shows the default derivation hint", () => {
    render(LockedSphereField, { props: { sphere: "ideeller" } });
    expect(screen.getByText(/Aus der Kategorie abgeleitet/i)).toBeTruthy();
  });

  it("accepts an override hint (e.g. Spende — always ideeller)", () => {
    render(LockedSphereField, {
      props: {
        sphere: "ideeller",
        hint: "Spenden gehören immer in den ideellen Bereich.",
      },
    });
    expect(
      screen.getByText(/Spenden gehören immer in den ideellen Bereich/i),
    ).toBeTruthy();
  });
});
