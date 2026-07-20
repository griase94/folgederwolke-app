import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import AmountField from "./AmountField.svelte";
import DateField from "./DateField.svelte";
import { HERO_WRAP } from "./hero-field-class.js";

afterEach(() => cleanup());

describe("Hero-Field-Familie", () => {
  it("invariant: AmountField and DateField share ONE anatomy (HERO_WRAP)", () => {
    render(AmountField, { props: { name: "cents" } });
    const amountWrap = screen.getByTestId("amount-field");
    cleanup();
    render(DateField, { props: { name: "datum" } });
    const dateWrap = screen.getByTestId("date-field");
    // both shells carry the identical shared anatomy class string
    for (const cls of HERO_WRAP.split(/\s+/).filter(Boolean)) {
      expect(amountWrap.className).toContain(cls);
      expect(dateWrap.className).toContain(cls);
    }
  });

  describe("AmountField", () => {
    it("parses a German amount into the hidden cents input", async () => {
      const { container } = render(AmountField, {
        props: { name: "betragCents" },
      });
      const input = screen.getByTestId("amount-field-input");
      await fireEvent.input(input, { target: { value: "12,50" } });
      const hidden = container.querySelector(
        'input[type="hidden"][name="betragCents"]',
      ) as HTMLInputElement;
      expect(hidden.value).toBe("1250");
    });

    it("leaves cents empty + flags invalid for unparseable input", async () => {
      const { container } = render(AmountField, {
        props: { name: "betragCents", required: true },
      });
      const input = screen.getByTestId("amount-field-input");
      await fireEvent.input(input, { target: { value: "abc" } });
      const hidden = container.querySelector(
        'input[type="hidden"][name="betragCents"]',
      ) as HTMLInputElement;
      expect(hidden.value).toBe("");
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("renders the € suffix", () => {
      render(AmountField, { props: { name: "cents" } });
      expect(screen.getByText("€")).toBeTruthy();
    });
  });

  describe("DateField", () => {
    it("commits a valid TT.MM.JJJJ date as ISO to the hidden input on blur", async () => {
      const { container } = render(DateField, { props: { name: "datum" } });
      const input = screen.getByTestId("date-field-input");
      await fireEvent.input(input, { target: { value: "15.03.2026" } });
      await fireEvent.blur(input);
      const hidden = container.querySelector(
        'input[type="hidden"][name="datum"]',
      ) as HTMLInputElement;
      expect(hidden.value).toBe("2026-03-15");
    });

    it("rejects an invalid calendar date (30.02.2026) and flags invalid", async () => {
      const { container } = render(DateField, { props: { name: "datum" } });
      const input = screen.getByTestId("date-field-input");
      await fireEvent.input(input, { target: { value: "30.02.2026" } });
      await fireEvent.blur(input);
      const hidden = container.querySelector(
        'input[type="hidden"][name="datum"]',
      ) as HTMLInputElement;
      expect(hidden.value).toBe("");
      expect(input.getAttribute("aria-invalid")).toBe("true");
    });
  });
});
