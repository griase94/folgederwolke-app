/**
 * @phase-aurora-slice4
 * Aktivität card (spec §7): desktop cap 8 rows + fade + "Alle Aktivitäten →"
 * (in-place expander — no /app/aktivitaet route exists, see plan open
 * questions), mobile cap 6. NO inner scroll region.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import AktivitaetCard from "./AktivitaetCard.svelte";

afterEach(() => cleanup());

function entries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    occurredAt: new Date(Date.now() - i * 3_600_000),
    label: `Eintrag ${i}`,
  }));
}

describe("AktivitaetCard", () => {
  it("caps at 8 visible on desktop (rows 9+ hidden) and 6 on mobile (rows 7-8 md-only)", () => {
    const { container } = render(AktivitaetCard, {
      props: { entries: entries(12) },
    });
    const rows = container.querySelectorAll("[data-testid='aktivitaet-row']");
    expect(rows.length).toBe(12);
    // rows 0-5 always visible
    expect(rows[5]!.className).not.toContain("hidden");
    // rows 6-7 desktop-only before expansion
    expect(rows[6]!.className).toContain("hidden");
    expect(rows[6]!.className).toContain("md:flex");
    // rows 8+ hidden everywhere before expansion
    expect(rows[8]!.className).toContain("hidden");
    expect(rows[8]!.className).not.toContain("md:flex");
  });

  it("'Alle Aktivitäten →' expands all rows in place", async () => {
    const { container } = render(AktivitaetCard, {
      props: { entries: entries(12) },
    });
    await fireEvent.click(
      screen.getByRole("button", { name: /Alle Aktivitäten/ }),
    );
    const rows = container.querySelectorAll("[data-testid='aktivitaet-row']");
    for (const r of rows) expect(r.className).not.toContain("hidden");
    expect(
      screen.queryByRole("button", { name: /Alle Aktivitäten/ }),
    ).toBeNull();
  });

  it("no expander and no fade when 6 or fewer entries", () => {
    const { container } = render(AktivitaetCard, {
      props: { entries: entries(4) },
    });
    expect(
      screen.queryByRole("button", { name: /Alle Aktivitäten/ }),
    ).toBeNull();
    expect(
      container.querySelector("[data-testid='aktivitaet-fade']"),
    ).toBeNull();
  });

  it("collapses entirely when empty (spec: empty states collapse)", () => {
    const { container } = render(AktivitaetCard, { props: { entries: [] } });
    expect(container.querySelector("section")).toBeNull();
  });
});
