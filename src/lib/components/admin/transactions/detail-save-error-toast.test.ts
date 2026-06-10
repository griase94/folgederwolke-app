// detail-save-error-toast.test.ts
//
// T4 (phase 8 review): a failed detail ?/save must surface an error toast in
// the modal instead of silently replacing the page. Before this fix the three
// per-tab detail-fields forms (Ausgabe / Einnahme / Spende) were plain
// `<form method="POST" action="?/save">` with NO use:enhance, so a 422
// validation / 409 festgeschrieben failure showed nothing.
//
// We mock `$app/forms` so `enhance` CAPTURES the submit callback the component
// passes (`use:enhance={saveSubmit}` → enhance(node, saveSubmit)). Rendering the
// component registers the action; we then invoke the captured callback with a
// synthetic ActionResult and assert toast.error fires on `failure` (and not on
// `success`). applyAction is stubbed to a no-op.
//
// Fast lane (mounts a Svelte component, no DB) → `pnpm test:fast <file>`.
import { render, cleanup } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActionResult } from "@sveltejs/kit";
import AusgabeDetailFields from "./ausgaben/AusgabeDetailFields.svelte";
import EinnahmeDetailFields from "./einnahmen/EinnahmeDetailFields.svelte";
import SpendeDetailFields from "./spenden/SpendeDetailFields.svelte";

// Capture every submit callback registered via `use:enhance={fn}` across the
// rendered tree. The form action calls enhance(node, fn) — we keep `fn`.
const enhanceCallbacks: Array<(...a: unknown[]) => unknown> = [];
const applyActionMock = vi.fn(async (_r: unknown) => {});

vi.mock("$app/forms", () => ({
  enhance: (_node: HTMLFormElement, fn: (...a: unknown[]) => unknown) => {
    if (typeof fn === "function") enhanceCallbacks.push(fn);
    return { destroy() {} };
  },
  applyAction: (r: unknown) => applyActionMock(r),
}));

// svelte-sonner: capture toast.error / toast.success calls.
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("svelte-sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

beforeEach(() => {
  enhanceCallbacks.length = 0;
  applyActionMock.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
});
afterEach(() => cleanup());

/** Drive the captured ?/save enhance callback with a synthetic result. */
async function runSaveSubmit(result: ActionResult) {
  // The ?/save form is the first (and for fields components, only) enhanced form.
  expect(enhanceCallbacks.length).toBeGreaterThanOrEqual(1);
  const submit = enhanceCallbacks[0]!;
  // saveSubmit() returns the async ({ result }) => {…} handler.
  const handler = submit() as (arg: {
    result: ActionResult;
  }) => Promise<void> | void;
  await handler({ result });
}

const failure: ActionResult = {
  type: "failure",
  status: 422,
  data: { error: "Betrag muss größer als 0 sein." },
};
const failureNoMsg: ActionResult = { type: "failure", status: 409, data: {} };
const success: ActionResult = { type: "success", status: 200, data: {} };

// ── Ausgabe ──────────────────────────────────────────────────────────────
describe("AusgabeDetailFields — ?/save failure surfaces a toast", () => {
  function renderit() {
    render(AusgabeDetailFields, {
      props: {
        detail: {
          id: "exp-1",
          kind: "expense",
          bezeichnung: "Test",
          betragCents: 1250,
          kategorieNameSnapshot: "Büro",
          sphereSnapshot: "ideeller",
          rechnungsdatum: null,
          projectId: null,
          kommentar: null,
        } as unknown as Parameters<typeof AusgabeDetailFields>[1]["detail"],
        expenseKategorien: [{ id: "k1", name: "Büro", sphere: "ideeller" }],
        projects: [],
      },
    });
  }

  it("calls toast.error with the server message on failure", async () => {
    renderit();
    await runSaveSubmit(failure);
    expect(toastError).toHaveBeenCalledWith("Betrag muss größer als 0 sein.");
    expect(applyActionMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a default message when failure has no error string", async () => {
    renderit();
    await runSaveSubmit(failureNoMsg);
    expect(toastError).toHaveBeenCalledWith("Fehler beim Speichern");
  });

  it("does NOT toast.error on success (only applyAction runs)", async () => {
    renderit();
    await runSaveSubmit(success);
    expect(toastError).not.toHaveBeenCalled();
    expect(applyActionMock).toHaveBeenCalledTimes(1);
  });
});

// ── Einnahme ─────────────────────────────────────────────────────────────
describe("EinnahmeDetailFields — ?/save failure surfaces a toast", () => {
  function renderit() {
    render(EinnahmeDetailFields, {
      props: {
        bezeichnung: "Test",
        betragCents: 1250,
        geldEingangDatum: null,
        kategorieNameSnapshot: "Spende",
        projectId: null,
        kommentar: null,
        kategorien: [{ name: "Spende", sphere: "ideeller" }],
        projects: [],
      },
    });
  }

  it("calls toast.error on failure", async () => {
    renderit();
    await runSaveSubmit(failure);
    expect(toastError).toHaveBeenCalledWith("Betrag muss größer als 0 sein.");
    expect(applyActionMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT toast.error on success", async () => {
    renderit();
    await runSaveSubmit(success);
    expect(toastError).not.toHaveBeenCalled();
  });
});

// ── Spende ───────────────────────────────────────────────────────────────
describe("SpendeDetailFields — ?/save failure surfaces a toast", () => {
  function renderit() {
    render(SpendeDetailFields, {
      props: {
        detail: {
          id: "d-1",
          kind: "donation",
          bezeichnung: "Spende",
          betragCents: 5000,
          gebuchtAm: "2026-03-01T00:00:00.000Z",
          spendeKind: "geldspende",
          zweckbindungKind: "zweckfrei",
          zweckbindungText: null,
          spenderName: "Erika",
          spenderAdresse: null,
          spenderEmail: null,
          bezahltVonMemberId: null,
          wertermittlungMethode: null,
          zustandBeschreibung: null,
          betriebsvermoegen: false,
        } as unknown as Parameters<typeof SpendeDetailFields>[1]["detail"],
      },
    });
  }

  it("calls toast.error on failure", async () => {
    renderit();
    await runSaveSubmit(failure);
    expect(toastError).toHaveBeenCalledWith("Betrag muss größer als 0 sein.");
    expect(applyActionMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT toast.error on success", async () => {
    renderit();
    await runSaveSubmit(success);
    expect(toastError).not.toHaveBeenCalled();
  });
});
