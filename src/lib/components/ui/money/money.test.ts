import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import Money from "./money.svelte";

afterEach(() => cleanup());

describe("Money", () => {
  it("renders positive integer cents as German EUR string", () => {
    render(Money, { props: { valueInCents: 123456 } });
    const el = screen.getByTestId("money");
    // German locale: thin-space / nbsp between number and currency symbol
    expect(el.textContent?.replace(/\s/g, " ")).toMatch(/1\.234,56\s€/);
  });

  it("renders zero correctly", () => {
    render(Money, { props: { valueInCents: 0 } });
    const el = screen.getByTestId("money");
    expect(el.textContent?.replace(/\s/g, " ")).toMatch(/0,00\s€/);
  });

  it("renders negative values with minus sign", () => {
    render(Money, { props: { valueInCents: -50000 } });
    const el = screen.getByTestId("money");
    const txt = el.textContent ?? "";
    expect(txt).toMatch(/-|−/);
    expect(txt.replace(/\s/g, " ")).toMatch(/500,00\s€/);
  });

  it("applies tabular-nums class for column alignment", () => {
    render(Money, { props: { valueInCents: 100 } });
    const el = screen.getByTestId("money");
    expect(el.className).toContain("tabular-nums");
  });

  it("applies emerald color for positive values", () => {
    render(Money, { props: { valueInCents: 100 } });
    const el = screen.getByTestId("money");
    expect(el.className).toMatch(/text-emerald/);
  });

  it("applies rose color for negative values", () => {
    render(Money, { props: { valueInCents: -100 } });
    const el = screen.getByTestId("money");
    expect(el.className).toMatch(/text-rose/);
  });

  it("applies muted color for zero values", () => {
    render(Money, { props: { valueInCents: 0 } });
    const el = screen.getByTestId("money");
    expect(el.className).toMatch(/text-muted-foreground/);
  });

  it("respects forceSign='always' showing + for positive", () => {
    render(Money, { props: { valueInCents: 100, forceSign: "always" } });
    const el = screen.getByTestId("money");
    expect(el.textContent).toMatch(/\+/);
  });

  it("respects forceSign='never' suppressing sign on negative", () => {
    render(Money, { props: { valueInCents: -100, forceSign: "never" } });
    const el = screen.getByTestId("money");
    expect(el.textContent).not.toMatch(/-|−/);
  });

  it("merges custom class prop", () => {
    render(Money, { props: { valueInCents: 100, class: "custom-money" } });
    const el = screen.getByTestId("money");
    expect(el.className).toContain("custom-money");
  });
});
