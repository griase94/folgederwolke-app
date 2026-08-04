// SphereBadge.test.ts
//
// Pins the §13 sphere colour identity (DESIGN-GUIDELINES §2.2, Debt-Register
// S7). The four spheres carry FIXED hues and they are famously easy to swap:
//   ideeller = pink · vermoegen = blau · zweckbetrieb = violett ·
//   wirtschaftlich = amber
// Both the pill (SPHERE_BADGE_CLASSES) and the dot/swatch (SPHERE_DOT_CLASSES)
// must state the SAME hue for a sphere — a surface that shows a dot next to a
// badge would otherwise claim two identities for one row.
//
// Reset lane → `pnpm test --run <file>`.
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import SphereBadge, {
  SPHERE_BADGE_CLASSES,
  SPHERE_DOT_CLASSES,
} from "./SphereBadge.svelte";
import { SPHERES, SPHERE_LABELS, type Sphere } from "$lib/domain/sphere.js";

afterEach(() => cleanup());

/** The §13 canon: sphere → Tailwind hue family. NEVER reorder. */
const CANON_HUE: Record<Sphere, string> = {
  ideeller: "pink",
  vermoegen: "blue",
  zweckbetrieb: "violet",
  wirtschaftlich: "amber",
};

describe("sphere colour identity (§13)", () => {
  it.each(SPHERES)("%s badge uses only its canon hue", (sphere) => {
    const hue = CANON_HUE[sphere];
    const classes = SPHERE_BADGE_CLASSES[sphere];
    // Every colour utility in the badge belongs to the canon hue family.
    const hues = [...classes.matchAll(/(?:bg|text)-([a-z]+)-\d{2,3}/g)].map(
      (m) => m[1],
    );
    expect(hues.length).toBeGreaterThan(0);
    expect([...new Set(hues)]).toEqual([hue]);
  });

  it.each(SPHERES)("%s dot uses the same hue as its badge", (sphere) => {
    const hue = CANON_HUE[sphere];
    const hues = [
      ...SPHERE_DOT_CLASSES[sphere].matchAll(/bg-([a-z]+)-\d{2,3}/g),
    ].map((m) => m[1]);
    expect(hues.length).toBeGreaterThan(0);
    expect([...new Set(hues)]).toEqual([hue]);
  });

  it("no two spheres share a hue", () => {
    const hues = SPHERES.map((s) => CANON_HUE[s]);
    expect(new Set(hues).size).toBe(SPHERES.length);
  });

  it("dots carry a dark-mode value (a saturated dot must survive Nacht)", () => {
    for (const sphere of SPHERES) {
      expect(SPHERE_DOT_CLASSES[sphere]).toContain("dark:bg-");
    }
  });
});

describe("SphereBadge rendering", () => {
  it("renders the pill with label + canon classes by default", () => {
    const { container } = render(SphereBadge, {
      props: { sphere: "zweckbetrieb" },
    });
    const badge = container.querySelector('[data-slot="sphere-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute("data-sphere")).toBe("zweckbetrieb");
    expect(badge!.className).toContain("bg-violet-100");
    expect(screen.getByText(SPHERE_LABELS.zweckbetrieb)).toBeTruthy();
  });

  it("variant=dot renders a swatch + label instead of the pill", () => {
    const { container } = render(SphereBadge, {
      props: { sphere: "ideeller", variant: "dot" },
    });
    expect(container.querySelector('[data-slot="sphere-badge"]')).toBeNull();
    const dot = container.querySelector('[data-slot="sphere-dot"]');
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute("data-sphere")).toBe("ideeller");
    expect(dot!.innerHTML).toContain("bg-pink-600");
    expect(screen.getByText(SPHERE_LABELS.ideeller)).toBeTruthy();
  });

  it("does NOT read the --sphere-* dataviz vars (they are not the §13 hues)", () => {
    const { container } = render(SphereBadge, {
      props: { sphere: "wirtschaftlich", variant: "dot" },
    });
    expect(container.innerHTML).not.toContain("--sphere-");
  });
});
