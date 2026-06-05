// DetailModalShell.test.ts
//
// Contract test for the shared *detail* surface every transaction tab's `[id]`
// page (Phases 4/5/6) binds to. CONTRACT-FIRST — the Tier-C tab detail pages
// bind to this EXACT shape. Asserts the integration seam:
//  - the `beleg` Snippet renders on the left (tab passes <BelegViewer …>)
//  - the per-kind `fields` Snippet renders on the right
//  - the Verlauf (audit timeline) renders from `detail.timeline`
//  - a unified footer with the `workflowAction` Snippet (P3-02: ZERO-param —
//    the tab closes over its OWN saving/dirty) + a Speichern button, disabled
//    until `dirty`
//  - when `isFestgeschrieben`: fields read-only, footer Save HIDDEN, an amber
//    "Korrektur nur über Storno (Phase 2)" notice
//  - the × calls `onClose` (UX-02: → parent list, same guard as browser-back)
//  - a `beforeNavigate` dirty-guard is REGISTERED on mount
//
// Reset lane (renders a Svelte component) → `pnpm test --run <file>`.
// Uses fireEvent (project convention; never userEvent). Mocks $app/navigation
// (beforeNavigate + goto) + $app/stores like EntryFormShell.test.ts.
import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRawSnippet } from "svelte";
import DetailModalShell from "./DetailModalShell.svelte";
import { beforeNavigate } from "$app/navigation";
import type {
  TransactionDetail,
  AuditTimelineEntry,
} from "$lib/server/domain/transactions.js";

vi.mock("$app/navigation", () => ({
  beforeNavigate: vi.fn(),
  goto: vi.fn(),
}));
vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");
  return {
    page: readable({
      url: new URL("http://localhost/app/ausgaben/exp-1"),
      data: {},
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(beforeNavigate).mockClear();
  vi.unstubAllGlobals();
});

const belegSnippet = createRawSnippet(() => ({
  render: () => `<div data-testid="beleg-slot">BelegViewer</div>`,
}));
const fieldsSnippet = createRawSnippet(() => ({
  render: () => `<div data-testid="per-kind-fields">Per-kind fields</div>`,
}));
const workflowSnippet = createRawSnippet(() => ({
  render: () => `<button data-testid="workflow-action">Als bezahlt</button>`,
}));

const timeline: AuditTimelineEntry[] = [
  {
    id: "audit-1",
    occurredAt: "2026-05-01T10:00:00.000Z",
    action: "create",
    actorKind: "user",
    actorUserId: "user-1",
    payload: null,
  },
  {
    id: "audit-2",
    occurredAt: "2026-05-02T11:30:00.000Z",
    action: "festschreibung",
    actorKind: "system",
    actorUserId: null,
    payload: null,
  },
];

function makeDetail(
  overrides: Partial<TransactionDetail> = {},
): TransactionDetail {
  return {
    id: "exp-1",
    kind: "expense",
    businessId: "FDW-A-0001",
    bezeichnung: "Büromaterial",
    betragCents: 1999,
    currency: "EUR",
    gebuchtAm: "2026-05-01",
    rechnungsdatum: null,
    sphereSnapshot: "ideell",
    sphereEffective: "ideell",
    kategorieNameSnapshot: "Bürobedarf",
    status: "offen",
    erstattetAm: null,
    bezahltVonDisplay: null,
    festgeschriebenAt: null,
    yearOfBuchung: 2026,
    kommentar: null,
    projectId: null,
    zahlungsartId: null,
    externIban: null,
    externEmail: null,
    externName: null,
    bezahltVonMemberId: null,
    belegDriveFileId: null,
    belegFileId: null,
    belegMimeType: null,
    belegOriginalName: null,
    approvedAt: null,
    rechnungBusinessId: null,
    spenderName: null,
    spenderEmail: null,
    spenderAdresse: null,
    bescheinigungNr: null,
    spendeKind: null,
    zweckbindungKind: null,
    zweckbindungText: null,
    wertermittlungMethode: null,
    zustandBeschreibung: null,
    herkunftsbelegFileId: null,
    betriebsvermoegen: null,
    timeline,
    ...overrides,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    detail: makeDetail(),
    isFestgeschrieben: false,
    beleg: belegSnippet,
    fields: fieldsSnippet,
    workflowAction: workflowSnippet,
    saving: false,
    dirty: false,
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("DetailModalShell — shared contract", () => {
  it("renders the beleg snippet on the left + the per-kind fields snippet on the right", () => {
    render(DetailModalShell, { props: baseProps() });
    expect(screen.getByTestId("beleg-slot")).toBeTruthy();
    expect(screen.getByTestId("per-kind-fields")).toBeTruthy();
  });

  it("omits the beleg column entirely when no beleg snippet is supplied", () => {
    const { container } = render(DetailModalShell, {
      props: baseProps({ beleg: undefined }),
    });
    expect(screen.queryByTestId("beleg-slot")).toBeNull();
    expect(container.querySelector('[data-slot="detail-beleg"]')).toBeNull();
  });

  it("renders the Verlauf (audit timeline) from detail.timeline", () => {
    render(DetailModalShell, { props: baseProps() });
    // The Verlauf section + a row per timeline entry (action label).
    expect(screen.getByText("Verlauf")).toBeTruthy();
    expect(screen.getByText("Erstellt")).toBeTruthy();
    expect(screen.getByText("Festgeschrieben")).toBeTruthy();
  });

  it("shows an empty-state in the Verlauf when detail.timeline is empty", () => {
    render(DetailModalShell, {
      props: baseProps({ detail: makeDetail({ timeline: [] }) }),
    });
    expect(screen.getByText(/Noch keine Aktivitäten/i)).toBeTruthy();
  });

  it("renders the workflowAction snippet in the footer (P3-02 zero-param)", () => {
    render(DetailModalShell, { props: baseProps() });
    const footer = document.querySelector('[data-slot="detail-footer"]');
    expect(footer).toBeTruthy();
    const action = screen.getByTestId("workflow-action");
    expect(action).toBeTruthy();
    expect(footer!.contains(action)).toBe(true);
  });

  it("the Speichern button is disabled until dirty, enabled once dirty", async () => {
    const { rerender } = render(DetailModalShell, {
      props: baseProps({ dirty: false }),
    });
    const submit = screen.getByRole("button", { name: "Speichern" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await rerender(baseProps({ dirty: true }));
    expect((submit as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Speichern while saving even when dirty", () => {
    render(DetailModalShell, {
      props: baseProps({ dirty: true, saving: true }),
    });
    const submit = screen.getByRole("button", { name: "Speichern" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it("festgeschrieben: hides the Speichern button + shows the amber Storno notice", () => {
    render(DetailModalShell, {
      props: baseProps({
        isFestgeschrieben: true,
        detail: makeDetail({ festgeschriebenAt: "2026-05-02T11:30:00.000Z" }),
      }),
    });
    expect(screen.queryByRole("button", { name: "Speichern" })).toBeNull();
    expect(
      screen.getByText(/Korrektur nur über Storno \(Phase 2\)/i),
    ).toBeTruthy();
  });

  it("festgeschrieben: the workflowAction snippet STILL renders in the footer", () => {
    render(DetailModalShell, {
      props: baseProps({
        isFestgeschrieben: true,
        detail: makeDetail({ festgeschriebenAt: "2026-05-02T11:30:00.000Z" }),
      }),
    });
    const footer = document.querySelector('[data-slot="detail-footer"]');
    expect(footer).toBeTruthy();
    const action = screen.getByTestId("workflow-action");
    expect(footer!.contains(action)).toBe(true);
  });

  it("festgeschrieben: marks the fields region read-only (data-readonly + inert)", () => {
    const { container } = render(DetailModalShell, {
      props: baseProps({ isFestgeschrieben: true }),
    });
    const fieldsRegion = container.querySelector('[data-slot="detail-fields"]');
    expect(fieldsRegion).toBeTruthy();
    expect(fieldsRegion!.getAttribute("data-readonly")).toBe("true");
    expect((fieldsRegion as HTMLElement).inert).toBe(true);
  });

  it("NOT festgeschrieben: the fields region is editable (no data-readonly, not inert)", () => {
    const { container } = render(DetailModalShell, {
      props: baseProps({ isFestgeschrieben: false }),
    });
    const fieldsRegion = container.querySelector('[data-slot="detail-fields"]');
    expect(fieldsRegion).toBeTruthy();
    expect(fieldsRegion!.getAttribute("data-readonly")).toBeNull();
    expect((fieldsRegion as HTMLElement).inert).toBe(false);
  });

  it("NOT festgeschrieben: shows the Speichern button + no Storno notice", () => {
    render(DetailModalShell, {
      props: baseProps({ isFestgeschrieben: false }),
    });
    expect(screen.getByRole("button", { name: "Speichern" })).toBeTruthy();
    expect(screen.queryByText(/Korrektur nur über Storno/i)).toBeNull();
  });

  it("UX-02: the × calls onClose (→ parent list, behaviorally identical to back)", async () => {
    const onClose = vi.fn();
    render(DetailModalShell, { props: baseProps({ onClose }) });
    const closeBtn = screen.getByRole("button", { name: /Schließen/i });
    await fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("UX-02: clicking the backdrop calls onClose (click-outside → parent list)", async () => {
    const onClose = vi.fn();
    const { container } = render(DetailModalShell, {
      props: baseProps({ onClose }),
    });
    const backdrop = container.querySelector('[data-slot="detail-backdrop"]');
    expect(backdrop).toBeTruthy();
    await fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("UX-02: pressing Escape on the dialog calls onClose (same guard as × / back)", async () => {
    const onClose = vi.fn();
    const { container } = render(DetailModalShell, {
      props: baseProps({ onClose }),
    });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    await fireEvent.keyDown(dialog!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a11y: dialog is labelled by its heading id, × has an aria-label", () => {
    const { container } = render(DetailModalShell, { props: baseProps() });
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    const labelledBy = dialog!.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Schließen/i })).toBeTruthy();
  });

  it("registers a beforeNavigate dirty-guard on mount (same guard fires on × and back)", () => {
    render(DetailModalShell, { props: baseProps() });
    expect(beforeNavigate).toHaveBeenCalledTimes(1);
    expect(typeof vi.mocked(beforeNavigate).mock.calls[0]![0]).toBe("function");
  });

  // ── Exercise the registered guard callback directly ──────────────────────
  // Mirrors EntryFormShell.test.ts: grab the function passed to beforeNavigate
  // and invoke it with a fake nav arg. The guard prompts via window.confirm —
  // happy-dom doesn't implement confirm, so we stub it as a global.
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
  function stubConfirm(answer: boolean) {
    const spy = vi.fn(() => answer);
    vi.stubGlobal("confirm", spy);
    return spy;
  }

  it("guard does NOT cancel when not dirty (clean navigation away is allowed)", () => {
    const confirmSpy = stubConfirm(false);
    render(DetailModalShell, { props: baseProps({ dirty: false }) });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(cancel).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("guard cancels a dirty nav-away when the user declines the confirm", () => {
    const confirmSpy = stubConfirm(false);
    render(DetailModalShell, { props: baseProps({ dirty: true }) });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("guard does NOT cancel a dirty nav-away when the user confirms", () => {
    const confirmSpy = stubConfirm(true);
    render(DetailModalShell, { props: baseProps({ dirty: true }) });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("guard does NOT cancel while saving, even when dirty (the save owns its UX)", () => {
    const confirmSpy = stubConfirm(false);
    render(DetailModalShell, {
      props: baseProps({ dirty: true, saving: true }),
    });
    const cancel = vi.fn();
    registeredGuard()(navAway(cancel));
    expect(cancel).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
