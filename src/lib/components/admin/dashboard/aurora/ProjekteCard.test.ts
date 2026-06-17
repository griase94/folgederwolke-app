/**
 * @phase-aurora-slice4
 * Projekte card (spec §7): row = name · Buchungen-count · saldo;
 * negative saldi in severity text token; empty state collapses.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import ProjekteCard from "./ProjekteCard.svelte";

afterEach(() => cleanup());

const rows = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Sommerfest",
    businessId: "P-001",
    saldoCents: -8450,
    buchungenCount: 12,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Trikots",
    businessId: "P-002",
    saldoCents: 4200,
    buchungenCount: 1,
  },
];

describe("ProjekteCard", () => {
  it("renders name, Buchungen-count (sing./pl.) and saldo per row", () => {
    render(ProjekteCard, { props: { rows } });
    expect(screen.getByText("Sommerfest")).toBeTruthy();
    expect(screen.getByText("12 Buchungen")).toBeTruthy();
    expect(screen.getByText("1 Buchung")).toBeTruthy();
  });

  it("negative saldo uses severity text, positive uses ink", () => {
    render(ProjekteCard, { props: { rows } });
    const neg = screen.getByTestId("projekt-saldo-P-001");
    expect(neg.className).toContain("text-severity-critical-text");
    const pos = screen.getByTestId("projekt-saldo-P-002");
    expect(pos.className).toContain("text-ink-700");
  });

  it("rows link to the project detail", () => {
    render(ProjekteCard, { props: { rows } });
    const link = screen.getByRole("link", { name: /Sommerfest/ });
    expect(link.getAttribute("href")).toBe(
      "/app/projekte/11111111-1111-4111-8111-111111111111",
    );
  });

  it("collapses entirely when empty", () => {
    const { container } = render(ProjekteCard, { props: { rows: [] } });
    expect(container.querySelector("section")).toBeNull();
  });
});
