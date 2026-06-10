import { describe, it, expect } from "vitest";
import { kategorieSphere } from "$lib/domain/sphere.js";

const KATS = [
  { name: "Eintritt", sphere: "zweckbetrieb" as const },
  { name: "Bar-Umsatz", sphere: "wirtschaftlich" as const },
  { name: "Bankgebühren", sphere: "ideeller" as const },
];

describe("kategorieSphere", () => {
  it("returns the kategorie's sphere by name", () => {
    expect(kategorieSphere(KATS, "Eintritt")).toBe("zweckbetrieb");
    expect(kategorieSphere(KATS, "Bar-Umsatz")).toBe("wirtschaftlich");
  });
  it("falls back to 'ideeller' for an unknown kategorie", () => {
    expect(kategorieSphere(KATS, "Nope")).toBe("ideeller");
  });
});
