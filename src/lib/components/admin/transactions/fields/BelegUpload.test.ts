// BelegUpload.test.ts
//
// Contract test for the Aurora-redesigned Beleg dropzone used by every
// expense / Auslage entry form.
//
// Form field names are FIXED: `beleg`, `keinBeleg`, `begruendung` — the
// Package A server gate reads exactly these names. They must never change.
//
// Reset lane → `pnpm test --run <file>`. Uses fireEvent (project convention).
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import BelegUpload from "./BelegUpload.svelte";

afterEach(() => cleanup());

describe("BelegUpload (Aurora dropzone)", () => {
  // ── field-name contract (server gate reads these verbatim) ──────────────

  it("uses the fixed form field names beleg / keinBeleg / begruendung", () => {
    const { container } = render(BelegUpload, { props: {} });
    // Single file input carries name="beleg" (single-input design — see component comment)
    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(1);
    expect((fileInputs[0] as HTMLInputElement).name).toBe("beleg");
    // keinBeleg checkbox
    const keinBelegCb = container.querySelector(
      'input[type="checkbox"][name="keinBeleg"]',
    );
    expect(keinBelegCb).toBeTruthy();
  });

  it("reveals the Begründung textarea (name=begruendung) when keinBeleg is checked", async () => {
    const { container } = render(BelegUpload, { props: {} });
    expect(container.querySelector('textarea[name="begruendung"]')).toBeNull();

    const checkbox = screen.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    await fireEvent.click(checkbox);

    const textarea = container.querySelector('textarea[name="begruendung"]');
    expect(textarea).toBeTruthy();
  });

  // ── ARM A (default) — file upload dropzone ──────────────────────────────

  it("renders the dropzone tap target with 'Datei wählen' button by default", () => {
    render(BelegUpload, { props: {} });
    // "Datei wählen" button visible
    expect(screen.getByText(/Datei wählen/i)).toBeTruthy();
    // No Begründung field yet
    expect(screen.queryByLabelText(/Begründung/i)).toBeNull();
  });

  it("renders the 'Foto aufnehmen' button (single input, capture set dynamically)", () => {
    const { container } = render(BelegUpload, { props: {} });
    // Single file input exists (capture="environment" is set dynamically on click,
    // not as a static attribute, so that exactly one non-empty beleg part reaches
    // the server regardless of which button was used).
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    // The "Foto aufnehmen" button is present in the DOM
    expect(screen.getByText(/Foto aufnehmen/i)).toBeTruthy();
  });

  // ── kein-Beleg path ─────────────────────────────────────────────────────

  it("ticking 'Kein Beleg vorhanden' hides the dropzone and shows Begründung", async () => {
    render(BelegUpload, { props: {} });
    const checkbox = screen.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    await fireEvent.click(checkbox);

    // Dropzone tap target hidden
    expect(screen.queryByText(/Datei wählen/i)).toBeNull();
    // Begründung textarea visible
    expect(screen.getByLabelText(/Begründung/i)).toBeTruthy();
  });

  it("shows the amber Verzicht note when keinBeleg is active", async () => {
    render(BelegUpload, { props: {} });
    const checkbox = screen.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    await fireEvent.click(checkbox);
    // The amber note text (verbatim from plan)
    expect(
      screen.getByText(/Verzicht ist die dokumentierte Ausnahme/i),
    ).toBeTruthy();
  });

  // ── optional prop (Einnahme / Spende paths) ─────────────────────────────

  it("hides the kein-Beleg toggle when optional=true", () => {
    render(BelegUpload, { props: { optional: true } });
    expect(
      screen.queryByRole("checkbox", { name: /Kein Beleg vorhanden/i }),
    ).toBeNull();
  });

  // ── error rendering ─────────────────────────────────────────────────────

  it("renders a per-field error message when the error prop is set", () => {
    render(BelegUpload, {
      props: { error: "Beleg-Datei ODER eine Begründung ist erforderlich." },
    });
    expect(
      screen.getByText(/Beleg-Datei ODER eine Begründung ist erforderlich\./i),
    ).toBeTruthy();
  });

  // ── required asterisk ───────────────────────────────────────────────────

  it("shows required asterisk on the Beleg label when optional=false (default)", () => {
    const { container } = render(BelegUpload, { props: {} });
    const slot = container.querySelector('[data-slot="beleg-upload"]');
    expect(slot?.textContent).toContain("*");
  });

  it("does NOT show required asterisk when optional=true", () => {
    const { container } = render(BelegUpload, { props: { optional: true } });
    const slot = container.querySelector('[data-slot="beleg-upload"]');
    // No asterisk when optional
    expect(slot?.textContent).not.toContain("*");
  });
});
