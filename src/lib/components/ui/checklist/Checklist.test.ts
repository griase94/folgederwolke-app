import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import Checklist from "./Checklist.svelte";
import type { ChecklistRow } from "./Checklist.svelte";

afterEach(() => cleanup());

describe("Checklist", () => {
  it("renders ok rows with label + sub, no fix link", () => {
    const items: ChecklistRow[] = [
      {
        ok: true,
        label: "Name & Anschrift der spendenden Person",
        sub: "Ines Achleitner · 80333 München",
      },
    ];
    render(Checklist, { props: { items } });
    expect(
      screen.getByText("Name & Anschrift der spendenden Person"),
    ).toBeTruthy();
    expect(screen.getByText("Ines Achleitner · 80333 München")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a missing row is a red blocker (.miss) with a Klartext fix link", () => {
    const items: ChecklistRow[] = [
      {
        ok: false,
        label: "Freistellungsbescheid des Finanzamts",
        sub: "Fehlt in den Vereins-Einstellungen",
        fixHref: "/app/einstellungen/verein",
      },
    ];
    const { container } = render(Checklist, { props: { items } });
    const miss = container.querySelector(".ck-item.miss");
    expect(miss).not.toBeNull();
    // missing rows are never neutral-grey — they carry the .miss blocker class
    expect(miss?.querySelector(".ck-label")?.textContent).toContain(
      "Freistellungsbescheid des Finanzamts",
    );
    const fix = screen.getByRole("link");
    expect(fix.getAttribute("href")).toBe("/app/einstellungen/verein");
    expect(fix.textContent).toContain("Eintragen");
  });

  it("does not render a fix link on an ok row even if fixHref is present", () => {
    const items: ChecklistRow[] = [
      { ok: true, label: "Betrag in Ziffern und Worten", fixHref: "/x" },
    ];
    render(Checklist, { props: { items } });
    expect(screen.queryByRole("link")).toBeNull();
  });
});
