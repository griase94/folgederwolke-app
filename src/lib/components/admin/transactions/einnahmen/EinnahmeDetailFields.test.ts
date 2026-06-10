/**
 * EinnahmeDetailFields — FIX B (review).
 *
 * Verifies:
 *  - success result → toast.success("Änderungen gespeichert") + onSaved fires
 *  - failure result → toast.error (no regression) + onSaved NOT fired
 */

import { render, cleanup } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import EinnahmeDetailFields from "./EinnahmeDetailFields.svelte";

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

const baseProps = {
  bezeichnung: "Mitgliedsbeitrag",
  betragCents: 6000,
  geldEingangDatum: "2026-03-01",
  kategorieNameSnapshot: "Beiträge",
  projectId: null,
  kommentar: null,
  kategorien: [],
  projects: [],
};

describe("EinnahmeDetailFields — FIX B: success toast + onSaved callback", () => {
  it("calls toast.success and onSaved when result.type === 'success'", async () => {
    const onSaved = vi.fn();
    render(EinnahmeDetailFields, { props: { ...baseProps, onSaved } });
    const enhance = getCapturedEnhance();
    expect(enhance).not.toBeNull();
    await enhance!({ result: { type: "success", data: { ok: true } } });
    expect(toastMock.success).toHaveBeenCalledWith("Änderungen gespeichert");
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("calls toast.error and NOT onSaved when result.type === 'failure'", async () => {
    const onSaved = vi.fn();
    render(EinnahmeDetailFields, { props: { ...baseProps, onSaved } });
    const enhance = getCapturedEnhance();
    expect(enhance).not.toBeNull();
    await enhance!({
      result: { type: "failure", data: { error: "Ungültiger Betrag" } },
    });
    expect(toastMock.error).toHaveBeenCalledWith("Ungültiger Betrag");
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
