/**
 * Aurora inbox redesign — BelegHero (spec §2.2 hero / §2.3 mobile row +
 * kein-Beleg states). Wraps the real BelegViewer; renders calm slate
 * fallbacks (never pink) when no Beleg exists.
 *
 * BelegViewer pulls in pdfjs; we stub it so the wrapper can be unit-tested in
 * happy-dom without the worker.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";

vi.mock("$lib/components/files/BelegViewer.svelte", async () => ({
  default: (await import("./__belegviewer-stub.svelte")).default,
}));

import BelegHero from "./BelegHero.svelte";

afterEach(() => cleanup());

const withBeleg = {
  belegFileId: "file-1",
  belegMimeType: "application/pdf",
  belegOriginalFilename: "beleg.pdf",
};

describe("BelegHero", () => {
  it("renders the BelegViewer (inline) when a Beleg exists (desktop hero)", () => {
    render(BelegHero, { props: { ...withBeleg, compact: false } });
    const viewer = screen.getByTestId("belegviewer-stub");
    expect(viewer.getAttribute("data-mode")).toBe("inline");
    expect(viewer.getAttribute("data-file-id")).toBe("file-1");
  });

  it("renders the BelegViewer (fold) when compact (mobile)", () => {
    render(BelegHero, { props: { ...withBeleg, compact: true } });
    expect(
      screen.getByTestId("belegviewer-stub").getAttribute("data-mode"),
    ).toBe("fold");
  });

  it("renders a calm slate kein-Beleg PANEL (never pink) on desktop when no Beleg", () => {
    render(BelegHero, {
      props: {
        belegFileId: null,
        belegMimeType: null,
        belegOriginalFilename: null,
        compact: false,
      },
    });
    const panel = screen.getByTestId("kein-beleg-panel");
    expect(panel.textContent).toContain("Kein Beleg vorhanden");
    // Calm slate — no brand/pink/severity utilities on the panel.
    expect(panel.className).not.toMatch(/primary|pink|severity/);
  });

  it("renders a slim muted kein-Beleg LINE on mobile when no Beleg", () => {
    render(BelegHero, {
      props: {
        belegFileId: null,
        belegMimeType: null,
        belegOriginalFilename: null,
        compact: true,
      },
    });
    const line = screen.getByTestId("kein-beleg-line");
    expect(line.textContent).toContain("Kein Beleg vorhanden");
    expect(line.className).not.toMatch(/primary|pink|severity/);
  });
});
