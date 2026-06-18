// EinnahmeFields.test.ts — Package C2
//
// Validates:
// - Betrag is type=text with inputmode=decimal (not type=number)
// - BelegUpload is rendered in optional mode (no keinBeleg toggle)
// - geldEingangDatum defaults to today on a fresh form
// - bind:value local-state pattern (existing regression guard)
//
// pnpm test --run src/lib/components/admin/transactions/einnahmen/EinnahmeFields.test.ts
import { render, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import EinnahmeFields from "./EinnahmeFields.svelte";

afterEach(() => cleanup());

const today = new Date().toISOString().slice(0, 10);

function baseProps() {
  return {
    kategorien: [{ name: "Mitgliedsbeitrag", sphere: "ideeller" as const }],
    projects: [],
  };
}

describe("EinnahmeFields — C2 redesign", () => {
  it("Betrag field is type=text with inputmode=decimal", () => {
    render(EinnahmeFields, { props: baseProps() });
    const displayInput = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement | null;
    expect(displayInput).not.toBeNull();
    expect(displayInput?.type).toBe("text");
  });

  it("hidden betragCents input is present", () => {
    render(EinnahmeFields, { props: baseProps() });
    const hiddenCents = document.querySelector(
      'input[name="betragCents"]',
    ) as HTMLInputElement | null;
    expect(hiddenCents).not.toBeNull();
    expect(hiddenCents?.type).toBe("hidden");
  });

  it("BelegUpload is rendered in optional mode (no keinBeleg checkbox)", () => {
    render(EinnahmeFields, { props: baseProps() });
    // optional=true suppresses the keinBeleg toggle
    const keinBelegCheckbox = document.querySelector('input[name="keinBeleg"]');
    expect(keinBelegCheckbox).toBeNull();
    // But the dropzone itself should still be present
    const dropzone = document.querySelector('[data-slot="beleg-upload"]');
    expect(dropzone).not.toBeNull();
  });

  it("geldEingangDatum hidden ISO field defaults to today on a fresh form", () => {
    render(EinnahmeFields, { props: baseProps() });
    // DateField renders a hidden ISO input
    const hiddenDate = document.querySelector(
      'input[name="geldEingangDatum"]',
    ) as HTMLInputElement | null;
    expect(hiddenDate).not.toBeNull();
    expect(hiddenDate?.value).toBe(today);
  });
});
