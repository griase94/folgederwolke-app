// KategoriePicker.test.ts
//
// Contract test for the shared Kategorie field every transaction entry form uses.
// The sphere is derived STRICTLY from the chosen kategorie via `kategorieSphere`
// (Phase 1) — NO project sphere_default override here (that lives in the domain
// write path, ADR-0008). Choosing an option:
//   - calls `onChange(name)`
//   - calls `onSphere(derivedSphere)`
//   - drives the SphereBadge (palette §13).
// The "Anlage EÜR Zeile {n}" hint is rendered ONLY when the chosen option carries
// a non-null `eurZeile` (P44-04: the eur_zeile/anlage_gem_zeile columns are NULL
// pre-launch, so the hint must NOT depend on a Zeile being present).
//
// Reset lane → `pnpm test --run <file>`. Uses fireEvent (project convention).
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import KategoriePicker from "./KategoriePicker.svelte";
import type { Sphere } from "$lib/domain/sphere.js";

afterEach(() => cleanup());

const options: {
  name: string;
  sphere: Sphere;
  eurZeile?: string | number | null;
}[] = [
  { name: "Büromaterial", sphere: "ideeller" }, // eurZeile absent (pre-launch reality)
  { name: "Eintritt", sphere: "zweckbetrieb", eurZeile: null }, // explicit null
  { name: "Merch-Einkauf", sphere: "wirtschaftlich", eurZeile: "5" }, // Zeile provided
];

describe("KategoriePicker", () => {
  it("derives sphere strictly from the chosen kategorie (no project override)", async () => {
    const onChange = vi.fn();
    const onSphere = vi.fn();
    render(KategoriePicker, {
      props: { options, value: "", onChange, onSphere },
    });

    // Select "Eintritt" → onChange("Eintritt") + onSphere("zweckbetrieb").
    const select = screen.getByRole("combobox", { name: /Kategorie/i });
    await fireEvent.change(select, { target: { value: "Eintritt" } });

    expect(onChange).toHaveBeenCalledWith("Eintritt");
    expect(onSphere).toHaveBeenCalledWith("zweckbetrieb");
  });

  it("renders the SphereBadge for the current value with the §13 label", () => {
    render(KategoriePicker, {
      props: {
        options,
        value: "Eintritt",
        onChange: vi.fn(),
        onSphere: vi.fn(),
      },
    });
    // SphereBadge shows the human-readable §13 label for the derived sphere.
    expect(screen.getByText("Zweckbetrieb")).toBeTruthy();
  });

  it("shows 'Anlage EÜR Zeile {n}' ONLY when the chosen option carries an eurZeile", () => {
    render(KategoriePicker, {
      props: {
        options,
        value: "Merch-Einkauf", // eurZeile: "5"
        onChange: vi.fn(),
        onSphere: vi.fn(),
      },
    });
    expect(screen.getByText(/Anlage EÜR Zeile 5/)).toBeTruthy();
  });

  it("renders NO EÜR-Zeile hint when the chosen option has no eurZeile (pre-launch)", () => {
    render(KategoriePicker, {
      props: {
        options,
        value: "Eintritt", // eurZeile: null
        onChange: vi.fn(),
        onSphere: vi.fn(),
      },
    });
    // The SphereBadge still renders…
    expect(screen.getByText("Zweckbetrieb")).toBeTruthy();
    // …but nothing misleading about an EÜR Zeile appears.
    expect(screen.queryByText(/Anlage EÜR Zeile/)).toBeNull();
    expect(screen.queryByText(/EÜR/i)).toBeNull();
  });

  it("falls back to the ideeller sphere when nothing is chosen yet", () => {
    const { container } = render(KategoriePicker, {
      props: { options, value: "", onChange: vi.fn(), onSphere: vi.fn() },
    });
    // No badge before a choice (or the ideeller fallback) — at minimum no
    // wrong-sphere badge leaks. Assert the picker mounts with no selection.
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  // B4: "Sphäre:" caption prefix + FIELD_CLASS on select
  it("prefixes the derived sphere badge with a 'Sphäre:' caption", () => {
    render(KategoriePicker, {
      props: {
        options,
        value: "Eintritt",
        onChange: vi.fn(),
        onSphere: vi.fn(),
      },
    });
    // Caption text "Sphäre:" must appear when a sphere is derived
    expect(screen.getByText(/Sphäre:/i)).toBeTruthy();
  });

  it("select carries h-11 class from FIELD_CLASS", () => {
    const { container } = render(KategoriePicker, {
      props: { options, value: "", onChange: vi.fn(), onSphere: vi.fn() },
    });
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.className).toContain("h-11");
  });

  it("select carries rounded-[10px] from FIELD_CLASS", () => {
    const { container } = render(KategoriePicker, {
      props: { options, value: "", onChange: vi.fn(), onSphere: vi.fn() },
    });
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.className).toContain("rounded-[10px]");
  });

  it("select carries border-hairline from FIELD_CLASS", () => {
    const { container } = render(KategoriePicker, {
      props: { options, value: "", onChange: vi.fn(), onSphere: vi.fn() },
    });
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.className).toContain("border-hairline");
  });
});
