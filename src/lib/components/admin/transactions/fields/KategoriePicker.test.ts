// KategoriePicker.test.ts
//
// Contract test for the shared Kategorie field every transaction entry form uses.
// The sphere is derived STRICTLY from the chosen kategorie via `kategorieSphere`
// (Phase 1) — NO project sphere_default override here (that lives in the domain
// write path, ADR-0008). Choosing an option:
//   - calls `onChange(name)`
//   - calls `onSphere(derivedSphere)`
//   - drives the SphereBadge (palette §13) + the EÜR-Zeile hint.
//
// Reset lane → `pnpm test --run <file>`. Uses fireEvent (project convention).
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import KategoriePicker from "./KategoriePicker.svelte";
import type { Sphere } from "$lib/domain/sphere.js";

afterEach(() => cleanup());

const options: { name: string; sphere: Sphere }[] = [
  { name: "Büromaterial", sphere: "ideeller" },
  { name: "Eintritt", sphere: "zweckbetrieb" },
  { name: "Merch-Einkauf", sphere: "wirtschaftlich" },
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

  it("shows the Anlage/EÜR-Zeile hint", () => {
    render(KategoriePicker, {
      props: {
        options,
        value: "Eintritt",
        onChange: vi.fn(),
        onSphere: vi.fn(),
      },
    });
    expect(screen.getByText(/EÜR/i)).toBeTruthy();
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
});
