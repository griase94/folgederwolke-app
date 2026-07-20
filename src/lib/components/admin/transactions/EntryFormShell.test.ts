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
  vi.unstubAllGlobals();
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
    render(EntryFormShell, { props: baseProps() });
    // D1: portalled to document.body — use document.body.querySelector, not container
    expect(
      document.body.querySelector('[data-slot="entry-header"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-slot="entry-body"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-slot="entry-footer"]'),
    ).toBeTruthy();
  });

  it("sets enctype=multipart/form-data on the form by default (file uploads transmit)", () => {
    render(EntryFormShell, { props: baseProps() });
    // D1: portalled to document.body
    const form = document.body.querySelector(
      "form#entry-form",
    ) as HTMLFormElement;
    expect(form).toBeTruthy();
    // The browser reflects an unknown enctype to the urlencoded default, so we
    // assert the attribute the component wrote rather than the form's enctype
    // getter (which happy-dom may normalize).
    expect(form.getAttribute("enctype")).toBe("multipart/form-data");
  });

  it("honors a custom enctype prop", () => {
    render(EntryFormShell, {
      props: baseProps({ enctype: "application/x-www-form-urlencoded" }),
    });
    // D1: portalled to document.body
    const form = document.body.querySelector(
      "form#entry-form",
    ) as HTMLFormElement;
    expect(form.getAttribute("enctype")).toBe(
      "application/x-www-form-urlencoded",
    );
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

  it("UX-02: pressing Escape on the dialog calls onClose (same guard as × / back)", async () => {
    const onClose = vi.fn();
    render(EntryFormShell, {
      props: baseProps({ onClose }),
    });
    // D1: portalled to document.body
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    await fireEvent.keyDown(dialog!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("registers a beforeNavigate dirty-guard on mount (same guard fires on × and back)", () => {
    render(EntryFormShell, { props: baseProps() });
    expect(beforeNavigate).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(beforeNavigate).mock.calls[0]![0]).toBe("function");
  });

  // ── Exercise the registered guard callback directly ──────────────────────
  // Grab the function passed to beforeNavigate and invoke it with a fake nav
  // arg, asserting the cancel() behavior across dirty/submitting states. The
  // guard prompts via window.confirm — happy-dom doesn't implement confirm, so
  // we stub it as a global (decline → cancel fires; confirm → nav proceeds).
  function registeredGuard() {
    return vi.mocked(beforeNavigate).mock.calls.at(-1)![0] as (nav: {
      type: string;
      to: { url: { pathname: string } } | null;
      cancel: () => void;
    }) => void;
  }
  const navAway = (cancel: () => void) => ({
    type: "link",
    to: { url: { pathname: "/app/ausgaben" } }, // different path → real nav-away
    cancel,
  });
  /** Stub window.confirm to return `answer`; returns the spy. */
  function stubConfirm(answer: boolean) {
    const spy = vi.fn(() => answer);
    vi.stubGlobal("confirm", spy);
    return spy;
  }

  it("guard does NOT cancel when not dirty (clean navigation away is allowed)", () => {
    const confirmSpy = stubConfirm(false);
    render(EntryFormShell, { props: baseProps({ dirty: false }) });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(cancel).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled(); // bailed before confirming
  });

  it("guard cancels a dirty nav-away when the user declines the confirm", () => {
    const confirmSpy = stubConfirm(false);
    render(EntryFormShell, { props: baseProps({ dirty: true }) });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("guard does NOT cancel a dirty nav-away when the user confirms", () => {
    const confirmSpy = stubConfirm(true);
    render(EntryFormShell, { props: baseProps({ dirty: true }) });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("guard does NOT cancel while submitting, even when dirty (the submit owns its UX)", () => {
    const confirmSpy = stubConfirm(false);
    render(EntryFormShell, {
      props: baseProps({ dirty: true, submitting: true }),
    });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(cancel).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

// ── Package D1: portal / z-index / accent strip ────────────────────────────
describe("EntryFormShell — D1 portal + z-index + accent", () => {
  it("portals the modal to document.body (not inside the render container)", () => {
    const { container } = render(EntryFormShell, { props: baseProps() });
    // The backdrop and dialog should be on document.body, NOT inside the
    // render container (which is just a div inside <body>).
    const backdropInContainer = container.querySelector(
      '[data-slot="entry-backdrop"]',
    );
    const dialogInContainer = container.querySelector(
      '[data-slot="entry-form-shell"]',
    );
    expect(backdropInContainer).toBeNull();
    expect(dialogInContainer).toBeNull();
    // They are accessible from document.body
    expect(
      document.body.querySelector('[data-slot="entry-backdrop"]'),
    ).toBeTruthy();
    expect(
      document.body.querySelector('[data-slot="entry-form-shell"]'),
    ).toBeTruthy();
  });

  it("backdrop carries z-[60] class so it covers MobileTabBar(z-40)+Topbar(z-30)", () => {
    render(EntryFormShell, { props: baseProps() });
    const backdrop = document.body.querySelector(
      '[data-slot="entry-backdrop"]',
    );
    expect(backdrop).toBeTruthy();
    expect((backdrop as HTMLElement).className).toContain("z-[60]");
  });

  it("dialog carries z-[70] class so it sits above the backdrop", () => {
    render(EntryFormShell, { props: baseProps() });
    const dialog = document.body.querySelector(
      '[data-slot="entry-form-shell"]',
    );
    expect(dialog).toBeTruthy();
    expect((dialog as HTMLElement).className).toContain("z-[70]");
  });

  it("renders the per-type accent strip (data-slot=entry-accent)", () => {
    render(EntryFormShell, { props: baseProps() });
    const strip = document.body.querySelector('[data-slot="entry-accent"]');
    expect(strip).toBeTruthy();
  });

  it("accent strip is the brand gradient (type identity lives in the badge + CTA, m2)", () => {
    render(EntryFormShell, { props: baseProps() });
    const strip = document.body.querySelector('[data-slot="entry-accent"]');
    expect((strip as HTMLElement).className).toContain("bg-gradient-brand");
  });

  it("default accent=ausgabe → the type-badge carries the plum tint", () => {
    render(EntryFormShell, { props: baseProps() });
    const badge = document.body.querySelector('[data-slot="entry-typebadge"]');
    expect((badge as HTMLElement).className).toContain("text-type-ausgabe");
  });

  it("accent=einnahme → the type-badge carries the green tint", () => {
    render(EntryFormShell, {
      props: baseProps({ accent: "einnahme" }),
    });
    const badge = document.body.querySelector('[data-slot="entry-typebadge"]');
    expect((badge as HTMLElement).className).toContain("text-type-einnahme");
  });

  it("accent=spende → the type-badge carries the violet tint", () => {
    render(EntryFormShell, {
      props: baseProps({ accent: "spende" }),
    });
    const badge = document.body.querySelector('[data-slot="entry-typebadge"]');
    expect((badge as HTMLElement).className).toContain("text-type-spende");
  });
});
