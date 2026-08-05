/**
 * The gate line may only name fields that exist ON SCREEN with that name.
 *
 * Product-lens finding: it asked for "Bezeichnung" and "Datum" while the form
 * showed "Was war's" and "Rechnungsdatum" — so the one line that explains a
 * blocked submit sent people hunting for fields that do not exist. This test
 * reads the gate line and checks every name against the rendered labels, so
 * the two can't drift apart again silently.
 */
import { render, cleanup, screen } from "@testing-library/svelte";
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/state", () => ({
  page: { url: new URL("http://t/x"), data: { kontaktEmail: "t@example.org" } },
}));
vi.mock("$app/environment", () => ({ browser: false }));
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {} }));

import AuslagenForm from "./AuslagenForm.svelte";

afterEach(() => cleanup());

/** "Fehlt noch: A, B und C." → ["A", "B", "C"] */
function gateNames(text: string): string[] {
  const body = text.replace(/^.*Fehlt noch:\s*/s, "").replace(/\.\s*$/, "");
  return body
    .split(/,| und /)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Visible label texts, stripped of the required-marker asterisk. */
function visibleLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll("label, legend, span")]
    .map((el) => (el.textContent ?? "").replace(/\*/g, "").trim())
    .filter(Boolean);
}

describe("AuslagenForm gate line", () => {
  // The public arm gates on identity first, the member arm goes straight to the
  // Auslage fields — between them the check covers every name the line can say.
  for (const mode of ["public", "member"] as const) {
    it(`names only fields that are visible under that exact name (${mode} arm)`, () => {
      const { container } = render(AuslagenForm, { props: { mode } });
      const gate = screen.getByTestId("einreichen-gate").textContent ?? "";
      const names = gateNames(gate);
      expect(names.length).toBeGreaterThan(0);

      const labels = visibleLabels(container);
      for (const name of names) {
        expect(
          labels,
          `gate line names "${name}", but no visible label says that`,
        ).toContain(name);
      }
    });
  }

  it("uses the form's own wording, not database column names", () => {
    render(AuslagenForm, { props: { mode: "member" } });
    const gate = screen.getByTestId("einreichen-gate").textContent ?? "";
    expect(gate).toContain("Was war's");
    expect(gate).toContain("Rechnungsdatum");
    expect(gate).not.toContain("Bezeichnung");
    // "Datum" only ever as part of "Rechnungsdatum".
    expect(gate).not.toMatch(/(^|[\s,:])Datum\b/);
  });
});
