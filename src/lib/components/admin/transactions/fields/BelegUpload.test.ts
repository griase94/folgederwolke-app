// BelegUpload.test.ts
//
// Contract test for the shared Beleg field used by the Ausgaben entry form.
// Wraps the native file input + the "Kein Beleg vorhanden" → Begründung reveal:
// ticking the checkbox reveals a (mandatory) Begründung textarea; the file input
// is the default path.
//
// Reset lane → `pnpm test --run <file>`. Uses fireEvent (project convention).
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import BelegUpload from "./BelegUpload.svelte";

afterEach(() => cleanup());

describe("BelegUpload", () => {
  it("renders the native file input by default (no Begründung field shown)", () => {
    const { container } = render(BelegUpload, { props: {} });
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
    expect(screen.queryByLabelText(/Begründung/i)).toBeNull();
  });

  it("ticking 'Kein Beleg vorhanden' reveals the Begründung field", async () => {
    render(BelegUpload, { props: {} });
    const checkbox = screen.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    expect(screen.queryByLabelText(/Begründung/i)).toBeNull();

    await fireEvent.click(checkbox);

    expect(screen.getByLabelText(/Begründung/i)).toBeTruthy();
  });

  it("keeps the file input MOUNTED (disabled + hidden) once 'Kein Beleg vorhanden' is ticked — label association never dangles", async () => {
    const { container } = render(BelegUpload, { props: {} });
    const checkbox = screen.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    await fireEvent.click(checkbox);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    // Still in the DOM so `for="beleg-file"` keeps a live target (no dangling
    // label), but disabled (won't submit) + hidden.
    expect(fileInput).toBeTruthy();
    expect(fileInput.disabled).toBe(true);
    expect(fileInput.classList.contains("hidden")).toBe(true);
  });

  it("marks the Beleg field as required (asterisk) and the label points at the file input", () => {
    const { container } = render(BelegUpload, { props: {} });
    const belegLabel = container.querySelector('label[for="beleg-file"]');
    expect(belegLabel).toBeTruthy();
    expect(belegLabel!.textContent).toContain("*");
    // The label's `for` resolves to the mounted file input.
    const fileInput = container.querySelector("#beleg-file");
    expect(fileInput).toBeTruthy();
    expect((fileInput as HTMLElement).getAttribute("type")).toBe("file");
  });
});
