import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import EuerStruktur from "./EuerStruktur.svelte";

afterEach(() => cleanup());

const nb = (s: string | null) =>
  (s ?? "").split(String.fromCharCode(160)).join(" ");

const ein = [
  { name: "Mitgliedsbeiträge", cents: 840000 },
  { name: "Spenden", cents: 525000 },
  { name: "Zinsen", cents: 21000 },
];
const aus = [
  { name: "Raummiete", cents: 420000 },
  { name: "Material", cents: 248000 },
];

describe("EuerStruktur", () => {
  it("surplus year shows a positive signed result", () => {
    render(EuerStruktur, { props: { einnahmen: ein, ausgaben: aus } });
    // 1.386.000 − 668.000 = +718.000 cents → +7.180 €
    expect(nb(screen.getByTestId("euer-result").textContent)).toContain(
      "+7.180 €",
    );
  });

  it("deficit year flips the result strip to a Fehlbetrag (minus)", () => {
    render(EuerStruktur, { props: { einnahmen: aus, ausgaben: ein } });
    expect(screen.getByTestId("euer-result").textContent).toMatch(/−/);
    expect(screen.getByTestId("euer-table").textContent).toContain(
      "Fehlbetrag",
    );
  });
});
