import { describe, it, expect } from "vitest";
import { deriveDonationKategorieName } from "$lib/domain/spenden-kategorie.js";
describe("deriveDonationKategorieName", () => {
  it("maps Geldspende by Zweckbindung", () => {
    expect(deriveDonationKategorieName("geldspende", "zweckfrei")).toBe(
      "Geldspende zweckfrei",
    );
    expect(deriveDonationKategorieName("geldspende", "zweckgebunden")).toBe(
      "Geldspende zweckgebunden",
    );
  });
  it("maps Sachspende regardless of Zweckbindung", () => {
    expect(deriveDonationKategorieName("sachspende", "zweckfrei")).toBe(
      "Sachspende",
    );
    expect(deriveDonationKategorieName("sachspende", "zweckgebunden")).toBe(
      "Sachspende",
    );
  });
});
