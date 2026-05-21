import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/svelte";
import DateField from "$lib/components/ui/date-field/DateField.svelte";

afterEach(() => cleanup());

describe("DateField (de-DE primitive)", () => {
  it("renders TT.MM.JJJJ placeholder when value is empty", () => {
    const { getByTestId } = render(DateField, {
      props: { value: "", name: "test_date" },
    });
    const input = getByTestId("datefield-input") as HTMLInputElement;
    expect(input.placeholder).toBe("TT.MM.JJJJ");
    expect(input.value).toBe("");
  });

  it("renders ISO value as TT.MM.JJJJ in de-DE locale", () => {
    const { getByTestId, container } = render(DateField, {
      props: { value: "2026-05-21", name: "test_date" },
    });
    const input = getByTestId("datefield-input") as HTMLInputElement;
    expect(input.value).toBe("21.05.2026");
    const hidden = container.querySelector(
      'input[name="test_date"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("2026-05-21");
  });

  it("typing 21.05.2026 produces hidden form value 2026-05-21", async () => {
    const { getByTestId, container } = render(DateField, {
      props: { value: "", name: "test_date" },
    });
    const input = getByTestId("datefield-input") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "21.05.2026" } });
    await fireEvent.blur(input);
    const hidden = container.querySelector(
      'input[name="test_date"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("2026-05-21");
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("rejects invalid input 99.99.9999 and sets aria-invalid", async () => {
    const { getByTestId, container } = render(DateField, {
      props: { value: "", name: "test_date" },
    });
    const input = getByTestId("datefield-input") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "99.99.9999" } });
    await fireEvent.blur(input);
    const hidden = container.querySelector(
      'input[name="test_date"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("rejects calendar-invalid date (Feb 30)", async () => {
    const { getByTestId, container } = render(DateField, {
      props: { value: "", name: "test_date" },
    });
    const input = getByTestId("datefield-input") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "30.02.2026" } });
    await fireEvent.blur(input);
    const hidden = container.querySelector(
      'input[name="test_date"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("respects disabled prop", () => {
    const { getByTestId } = render(DateField, {
      props: { value: "2026-05-21", name: "test_date", disabled: true },
    });
    const input = getByTestId("datefield-input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
