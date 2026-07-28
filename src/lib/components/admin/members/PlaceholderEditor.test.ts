/**
 * PlaceholderEditor — editable body with insertable placeholder chips.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import PlaceholderEditor from "./PlaceholderEditor.svelte";

afterEach(() => cleanup());

const STANDARD = "Hallo {Name}, dein Beitrag {Jahr} ist offen.";

describe("PlaceholderEditor", () => {
  it("renders a chip per placeholder + the textarea", () => {
    render(PlaceholderEditor, {
      props: { value: STANDARD, standardText: STANDARD },
    });
    expect(screen.getByTestId("placeholder-editor-textarea")).toBeTruthy();
    // default REMINDER_PLACEHOLDERS = {Name} {Jahr} {Betrag} {Frist}
    expect(screen.getAllByTestId("placeholder-editor-chip").length).toBe(4);
  });

  it("clicking a chip inserts the token into the value (appends when no caret)", async () => {
    render(PlaceholderEditor, { props: { value: "", standardText: STANDARD } });
    const betragChip = screen
      .getAllByTestId("placeholder-editor-chip")
      .find((c) => c.getAttribute("data-placeholder") === "{Betrag}")!;
    await fireEvent.click(betragChip);
    const ta = screen.getByTestId(
      "placeholder-editor-textarea",
    ) as HTMLTextAreaElement;
    expect(ta.value).toContain("{Betrag}");
  });

  it("reset is disabled when clean, enabled + restores when dirty", async () => {
    render(PlaceholderEditor, {
      props: { value: "changed text", standardText: STANDARD },
    });
    const reset = screen.getByTestId(
      "placeholder-editor-reset",
    ) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    await fireEvent.click(reset);
    const ta = screen.getByTestId(
      "placeholder-editor-textarea",
    ) as HTMLTextAreaElement;
    expect(ta.value).toBe(STANDARD);
  });

  it("flags an unknown {Token}", () => {
    render(PlaceholderEditor, {
      props: { value: "Hallo {Foo}", standardText: STANDARD },
    });
    expect(
      screen.getByTestId("placeholder-editor-unknown").textContent,
    ).toMatch(/\{Foo\}/);
  });
});
