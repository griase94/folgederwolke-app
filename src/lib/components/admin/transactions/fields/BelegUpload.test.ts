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

  it("hides the file input once 'Kein Beleg vorhanden' is ticked", async () => {
    const { container } = render(BelegUpload, { props: {} });
    const checkbox = screen.getByRole("checkbox", {
      name: /Kein Beleg vorhanden/i,
    });
    await fireEvent.click(checkbox);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });
});
