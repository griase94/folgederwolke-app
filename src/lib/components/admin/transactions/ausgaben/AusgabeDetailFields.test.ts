/**
 * AusgabeDetailFields — FIX B (review).
 *
 * Verifies:
 *  - success result → toast.success("Änderungen gespeichert") + onSaved fires
 *  - failure result → toast.error (no regression) + onSaved NOT fired
 */

import { render, cleanup } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import AusgabeDetailFields from "./AusgabeDetailFields.svelte";

// ── Hoisted mocks (vi.mock is hoisted; values that the factory closure reads
//    must be initialised in the hoisted block too) ──────────────────────────
const { toastMock, getCapturedEnhance, setCapturedEnhance } = vi.hoisted(() => {
  const toastMock = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };
  let capturedEnhance: ((opts: { result: unknown }) => Promise<void>) | null =
    null;
  return {
    toastMock,
    getCapturedEnhance: () => capturedEnhance,
    setCapturedEnhance: (
      v: ((opts: { result: unknown }) => Promise<void>) | null,
    ) => {
      capturedEnhance = v;
    },
  };
});

vi.mock("$app/forms", () => ({
  enhance: (
    _form: HTMLFormElement,
    cb: () => (opts: { result: unknown }) => Promise<void>,
  ) => {
    // Invoke the factory immediately to capture the inner async callback.
    setCapturedEnhance(cb());
    return { destroy() {} };
  },
  applyAction: vi.fn(),
}));

vi.mock("svelte-sonner", () => ({ toast: toastMock }));

afterEach(() => {
  cleanup();
  setCapturedEnhance(null);
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    kind: "expense",
    businessId: "A-2026-001",
    bezeichnung: "Büromaterial",
    betragCents: 2500,
    currency: "EUR",
    gebuchtAm: "2026-03-01T00:00:00.000Z",
    sphereSnapshot: "ideeller",
    kategorieNameSnapshot: "Büro",
    festgeschriebenAt: null,
    yearOfBuchung: 2026,
    status: "offen",
    erstattetAm: null,
    approvedAt: null,
    bezahltVonDisplay: "Verein",
    rechnungsdatum: null,
    kommentar: null,
    projectId: null,
    belegFileId: null,
    bezahltVonMemberId: null,
    timeline: [],
    ...overrides,
  } as unknown as Parameters<typeof AusgabeDetailFields>[1]["detail"];
}

describe("AusgabeDetailFields — FIX B: success toast + onSaved callback", () => {
  it("calls toast.success and onSaved when result.type === 'success'", async () => {
    const onSaved = vi.fn();
    render(AusgabeDetailFields, {
      props: {
        detail: detail(),
        expenseKategorien: [],
        projects: [],
        onSaved,
      },
    });
    const enhance = getCapturedEnhance();
    expect(enhance).not.toBeNull();
    await enhance!({ result: { type: "success", data: { ok: true } } });
    expect(toastMock.success).toHaveBeenCalledWith("Änderungen gespeichert");
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("calls toast.error and NOT onSaved when result.type === 'failure'", async () => {
    const onSaved = vi.fn();
    render(AusgabeDetailFields, {
      props: {
        detail: detail(),
        expenseKategorien: [],
        projects: [],
        onSaved,
      },
    });
    const enhance = getCapturedEnhance();
    expect(enhance).not.toBeNull();
    await enhance!({
      result: { type: "failure", data: { error: "Validation failed" } },
    });
    expect(toastMock.error).toHaveBeenCalledWith("Validation failed");
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
