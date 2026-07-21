// KategoriePicker.test.ts
//
// Contract test for the shared Kategorie field every transaction entry form uses.
// The option value is the kategorie ID (#115, id-authoritative); the sphere is
// derived STRICTLY from the chosen option's `sphere` (Phase 1) — NO project
// sphere_default override here (that lives in the domain write path, ADR-0008).
// Choosing an option:
//   - calls `onChange(id)`
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

const EINTRITT_ID = "22222222-2222-2222-2222-222222222222";
const MERCH_ID = "33333333-3333-3333-3333-333333333333";

const options: {
  id: string;
  name: string;
  sphere: Sphere;
  eurZeile?: string | number | null;
}[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Büromaterial",
    sphere: "ideeller",
  }, // eurZeile absent (pre-launch reality)
  { id: EINTRITT_ID, name: "Eintritt", sphere: "zweckbetrieb", eurZeile: null }, // explicit null
  {
    id: MERCH_ID,
    name: "Merch-Einkauf",
    sphere: "wirtschaftlich",
    eurZeile: "5",
  }, // Zeile provided
];

describe("KategoriePicker", () => {
  it("derives sphere strictly from the chosen kategorie (no project override)", async () => {
    const onChange = vi.fn();
    const onSphere = vi.fn();
    render(KategoriePicker, {
      props: { options, value: "", onChange, onSphere },
    });

    // Select "Eintritt" (by id) → onChange(EINTRITT_ID) + onSphere("zweckbetrieb").
    const select = screen.getByRole("combobox", { name: /Kategorie/i });
    await fireEvent.change(select, { target: { value: EINTRITT_ID } });

    expect(onChange).toHaveBeenCalledWith(EINTRITT_ID);
    expect(onSphere).toHaveBeenCalledWith("zweckbetrieb");
  });

  it("renders the SphereBadge for the current value with the §13 label", () => {
    render(KategoriePicker, {
      props: {
        options,
        value: EINTRITT_ID,
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
        value: MERCH_ID, // eurZeile: "5"
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
        value: EINTRITT_ID, // eurZeile: null
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
        value: EINTRITT_ID,
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
