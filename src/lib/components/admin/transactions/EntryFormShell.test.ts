// EntryFormShell.test.ts
//
// Contract test for the shared sticky-footer entry-form shell every transaction
// tab's *create/edit* form (Phases 4/5/6) binds to. Asserts the integration seam:
//  - the sticky header renders the `title`
//  - the per-tab `fields` Snippet is rendered in the scrollable body
//  - a unified sticky footer with a Speichern button reflecting `submitLabel`,
//    disabled until `dirty` (NO Verwerfen button)
//  - the × calls `onClose` (UX-02: → parent list, same guard as browser-back)
//  - a `beforeNavigate` dirty-guard is REGISTERED on mount
//
// Reset lane (renders a Svelte component) → `pnpm test --run <file>`.
// Uses fireEvent (project convention; never userEvent). Mocks $app/navigation
// (beforeNavigate + goto) + $app/stores like FilterBar.test.ts.
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRawSnippet } from "svelte";
import EntryFormShell from "./EntryFormShell.svelte";
import { beforeNavigate } from "$app/navigation";

vi.mock("$app/navigation", () => ({
  beforeNavigate: vi.fn(),
  goto: vi.fn(),
}));
vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");
  return {
    page: readable({
      url: new URL("http://localhost/app/ausgaben/neu"),
      data: {},
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(beforeNavigate).mockClear();
});

const fieldsSnippet = createRawSnippet(() => ({
  render: () => `<div data-testid="per-tab-fields">Per-tab fields</div>`,
}));

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    title: "Neue Ausgabe",
    action: "?/create",
    submitLabel: "Ausgabe anlegen",
    submitting: false,
    dirty: false,
    fields: fieldsSnippet,
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("EntryFormShell — shared contract", () => {
  it("renders the title in the header + the per-tab fields snippet in the body", () => {
    render(EntryFormShell, { props: baseProps() });
    expect(screen.getByText("Neue Ausgabe")).toBeTruthy();
    expect(screen.getByTestId("per-tab-fields")).toBeTruthy();
  });

  it("has a sticky header, scrollable body, and a sticky footer", () => {
    const { container } = render(EntryFormShell, { props: baseProps() });
    expect(container.querySelector('[data-slot="entry-header"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="entry-body"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="entry-footer"]')).toBeTruthy();
  });

  it("the Speichern button reflects submitLabel and is disabled until dirty", async () => {
    const { rerender } = render(EntryFormShell, {
      props: baseProps({ dirty: false }),
    });
    const submit = screen.getByRole("button", { name: "Ausgabe anlegen" });
    expect(submit).toBeTruthy();
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Once dirty, it enables.
    await rerender(baseProps({ dirty: true }));
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables the Speichern button while submitting even when dirty", () => {
    render(EntryFormShell, {
      props: baseProps({ dirty: true, submitting: true }),
    });
    const submit = screen.getByRole("button", { name: "Ausgabe anlegen" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders NO Verwerfen button (unified footer is Speichern-only)", () => {
    render(EntryFormShell, { props: baseProps({ dirty: true }) });
    expect(screen.queryByRole("button", { name: /Verwerfen/i })).toBeNull();
  });

  it("UX-02: the × calls onClose (→ parent list, behaviorally identical to back)", async () => {
    const onClose = vi.fn();
    render(EntryFormShell, { props: baseProps({ onClose }) });
    const closeBtn = screen.getByRole("button", { name: /Schließen/i });
    await fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("registers a beforeNavigate dirty-guard on mount (same guard fires on × and back)", () => {
    render(EntryFormShell, { props: baseProps() });
    expect(beforeNavigate).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(beforeNavigate).mock.calls[0]![0]).toBe("function");
  });
});
