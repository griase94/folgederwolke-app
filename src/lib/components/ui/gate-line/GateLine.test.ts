import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import GateLine from "./GateLine.svelte";

afterEach(() => cleanup());

describe("GateLine", () => {
  it("renders the default Beleg / Verzicht segments as a radiogroup", () => {
    render(GateLine, { props: { label: "Beleg", value: "beleg" } });
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);
    expect(screen.getByText("Beleg hochladen")).toBeTruthy();
    expect(screen.getByText("Verzicht begründen")).toBeTruthy();
  });

  it("marks the active segment and fires onChange on switch", async () => {
    const onChange = vi.fn();
    render(GateLine, { props: { label: "Beleg", value: "beleg", onChange } });
    const verzicht = screen.getByText("Verzicht begründen").closest("button")!;
    expect(verzicht.getAttribute("aria-checked")).toBe("false");
    await fireEvent.click(verzicht);
    expect(onChange).toHaveBeenCalledWith("verzicht");
  });

  it("invariant: unsatisfied readout is amber (sev-warn), never neutral grey", () => {
    render(GateLine, {
      props: {
        label: "Beleg",
        value: "beleg",
        status: { ok: false, text: "Fehlt noch: ein Beleg oder ein Verzicht." },
      },
    });
    const readout = screen.getByRole("status");
    expect(readout.getAttribute("data-ok")).toBe("false");
    expect(readout.className).toContain("bg-severity-warn-tint");
    expect(readout.className).toContain("text-severity-warn-text");
  });

  it("readout flips green (einnahme) when the gate is satisfied", () => {
    render(GateLine, {
      props: {
        label: "Beleg",
        value: "beleg",
        status: { ok: true, text: "Bereit — Beleg hochgeladen." },
      },
    });
    const readout = screen.getByRole("status");
    expect(readout.getAttribute("data-ok")).toBe("true");
    expect(readout.className).toContain("text-type-einnahme");
  });
});
