// BelegUpload.test.ts
//
// Contract test for THE canonical Beleg field (F3 unification, A-S2b.1) —
// used by the public Auslagen batch, the member portal and every admin entry
// form. It replaces the split between `forms/` and
// `admin/transactions/fields/`, so this file carries the merged contract:
//
// - fixed form field names `beleg` / `keinBeleg` / `begruendung` (the server
//   gate reads exactly these — they must never change),
// - both arms (dropzone + Verzicht) and both switch variants,
// - `allowVerzicht={false}` for the public extern arm (required, but no
//   escape hatch),
// - per-instance DOM ids so a batch repeater stays valid HTML,
// - COMPRESSION IS UNCONDITIONAL — the admin path used to upload raw camera
//   photos; that regression must stay fixed.
//
// Reset lane → `pnpm test --run <file>`. Uses fireEvent (project convention).
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/svelte";
import { describe, it, expect, afterEach, vi } from "vitest";

const compressIfNeeded = vi.fn(async (f: File, _opts?: unknown) => f);
vi.mock("$lib/client/file-compress.js", () => ({
  compressIfNeeded: (f: File, o?: unknown) => compressIfNeeded(f, o),
}));

import BelegUpload from "./BelegUpload.svelte";

afterEach(() => {
  cleanup();
  compressIfNeeded.mockClear();
});

describe("BelegUpload (canonical Beleg field)", () => {
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
    expect(screen.getByText(/Datei wählen/i)).toBeTruthy();
    expect(screen.queryByLabelText(/Begründung/i)).toBeNull();
  });

  it("renders the 'Foto aufnehmen' button (single input, capture set dynamically)", () => {
    const { container } = render(BelegUpload, { props: {} });
    // capture="environment" is set dynamically on click, not as a static
    // attribute, so exactly one non-empty beleg part reaches the server.
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
    expect(screen.getByText(/Foto aufnehmen/i)).toBeTruthy();
  });

  // ── Verzicht path ───────────────────────────────────────────────────────

  it("ticking 'Kein Beleg vorhanden' hides the dropzone and shows Begründung", async () => {
    render(BelegUpload, { props: {} });
    await fireEvent.click(
      screen.getByRole("checkbox", { name: /Kein Beleg vorhanden/i }),
    );

    expect(screen.queryByText(/Datei wählen/i)).toBeNull();
    expect(screen.getByLabelText(/Begründung/i)).toBeTruthy();
  });

  it("shows the amber Verzicht note when keinBeleg is active", async () => {
    render(BelegUpload, { props: {} });
    await fireEvent.click(
      screen.getByRole("checkbox", { name: /Kein Beleg vorhanden/i }),
    );
    expect(
      screen.getByText(/Verzicht ist die dokumentierte Ausnahme/i),
    ).toBeTruthy();
  });

  // ── optional prop (Einnahme / Spende paths) ─────────────────────────────

  it("hides the Verzicht toggle when optional=true", () => {
    render(BelegUpload, { props: { optional: true } });
    expect(
      screen.queryByRole("checkbox", { name: /Kein Beleg vorhanden/i }),
    ).toBeNull();
  });

  // ── allowVerzicht=false (public extern arm: required, no escape hatch) ──

  it("keeps the required asterisk but drops the Verzicht arm when allowVerzicht=false", () => {
    const { container } = render(BelegUpload, {
      props: { allowVerzicht: false },
    });
    const slot = container.querySelector('[data-slot="beleg-upload"]');
    expect(slot?.textContent).toContain("*");
    expect(
      screen.queryByRole("checkbox", { name: /Kein Beleg vorhanden/i }),
    ).toBeNull();
    // Dropzone is still there — the Beleg is simply mandatory.
    expect(screen.getByText(/Datei wählen/i)).toBeTruthy();
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
    expect(slot?.textContent).not.toContain("*");
  });

  // ── per-instance DOM ids (batch repeater renders N instances) ───────────

  it("scopes the Begründung id via idPrefix so repeated instances stay unique", async () => {
    const { container } = render(BelegUpload, {
      props: { keinBeleg: true, idPrefix: "beleg-a1" },
    });
    const textarea = container.querySelector('textarea[name="begruendung"]');
    expect(textarea?.id).toBe("beleg-a1-begruendung");
    // The label points at exactly this instance.
    const label = container.querySelector("label[for='beleg-a1-begruendung']");
    expect(label).toBeTruthy();
  });

  it("defaults the Begründung id to beleg-begruendung (single-instance forms)", () => {
    const { container } = render(BelegUpload, { props: { keinBeleg: true } });
    expect(container.querySelector('textarea[name="begruendung"]')?.id).toBe(
      "beleg-begruendung",
    );
  });

  // ── compression is unconditional (the admin-path bugfix) ────────────────

  it("runs every picked file through compressIfNeeded and hands on the RESULT", async () => {
    const compressed = new File(["small"], "bon.jpg", { type: "image/jpeg" });
    compressIfNeeded.mockResolvedValueOnce(compressed);

    const seen: (File | null)[] = [];
    const { container } = render(BelegUpload, {
      props: { onfile: (f: File | null) => seen.push(f) },
    });

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const raw = new File(["x".repeat(64)], "IMG_0001.HEIC", {
      type: "image/heic",
    });
    Object.defineProperty(input, "files", {
      value: [raw],
      configurable: true,
      writable: true,
    });
    await fireEvent.change(input);

    await waitFor(() => expect(seen.length).toBe(1));
    expect(compressIfNeeded).toHaveBeenCalledTimes(1);
    expect(compressIfNeeded.mock.calls[0]![0]).toBe(raw);
    // The COMPRESSED file is what leaves the component — never the raw pick.
    expect(seen[0]).toBe(compressed);
    // …and it is written BACK into the native input, so a plain (non-enhanced)
    // form post carries the compressed bytes too. This is the admin-path fix.
    expect(input.files?.[0]).toBe(compressed);
  });

  it("reports a compression failure inline and keeps no file", async () => {
    compressIfNeeded.mockRejectedValueOnce(new Error("Datei ist beschädigt."));

    const seen: (File | null)[] = [];
    const { container } = render(BelegUpload, {
      props: { onfile: (f: File | null) => seen.push(f) },
    });

    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const raw = new File(["x"], "kaputt.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", {
      value: [raw],
      configurable: true,
      writable: true,
    });
    await fireEvent.change(input);

    await waitFor(() =>
      expect(screen.getByTestId("beleg-upload-error").textContent).toMatch(
        /Datei ist beschädigt\./,
      ),
    );
    expect(seen).toEqual([null]);
  });
});
