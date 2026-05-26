/**
 * Throwaway — renders the 3 design variants for Andy's review.
 * Delete once a variant is picked.
 */
import { describe, it } from "vitest";
import { writeFile } from "node:fs/promises";
import {
  renderRechnungV2,
  type RechnungV2Input,
} from "$lib/server/pdf/templates/rechnung-v2/index.js";

const VEREIN_FIXTURE: RechnungV2Input["verein"] = {
  name: "Folge der Wolke e.V.",
  adresseSingleLine: "Westermühlstraße 6 - 80469 München",
  adresseLine1: "Westermühlstraße 6",
  adresseLine2: "80469 München",
  vereinsregister: "VR 211227",
  steuernummer: "143/215/10028",
  kontaktPerson: "Jonas Hackenberg",
  contactPhone: "+49 151 / 57881517",
  contactEmail: "booking@folgederwolke.de",
  bankname: "Deutsche Skatbank",
  iban: "DE25 8306 5408 0006 8944 53",
  bic: "GENO DEF1 SLR",
};

const BEATE_UWE: Omit<RechnungV2Input, "variant"> = {
  verein: VEREIN_FIXTURE,
  customer: {
    name: "Javid und Ücel GbR",
    addressBlock: "Beate Uwe Club\nSchillingstraße 31\n10179 Berlin",
    country: "DE",
  },
  rechnungsnummer: "VA-2026-02",
  rechnungsdatum: "2026-03-02",
  leistungszeitraum: "Februar 2026",
  bezeichnung: "Konzeption und Kuratierung der Kulturveranstaltung",
  leistungsBeschreibung: "“Beate Invites: Folge der Wolke” am 21.02.2026",
  nettoCents: 167570,
  kassenwaertName: "Annalena Feix",
};

const HOME = process.env["HOME"] ?? "";

describe("Rechnung v2 variants for design review", () => {
  it("A. Faithful (Anton 32pt, standard whitespace)", async () => {
    const bytes = await renderRechnungV2({ ...BEATE_UWE, variant: "faithful" });
    await writeFile(`${HOME}/Downloads/rechnung-v2.2-A-faithful.pdf`, bytes);
  });
  it("B. Bebas Neue 40pt (narrower Impact-clone wordmark)", async () => {
    const bytes = await renderRechnungV2({ ...BEATE_UWE, variant: "bebas" });
    await writeFile(`${HOME}/Downloads/rechnung-v2.2-B-bebas.pdf`, bytes);
  });
  it("C. Editorial (Anton 42pt, +25% whitespace at key gaps)", async () => {
    const bytes = await renderRechnungV2({
      ...BEATE_UWE,
      variant: "editorial",
    });
    await writeFile(`${HOME}/Downloads/rechnung-v2.2-C-editorial.pdf`, bytes);
  });
});
