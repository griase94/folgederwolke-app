import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above module init, so build the mock inside vi.hoisted.
const { toastMock } = vi.hoisted(() => {
  const fn = vi.fn((_message: string, _opts?: unknown) => "toast-id");
  (fn as unknown as { dismiss: ReturnType<typeof vi.fn> }).dismiss = vi.fn();
  return { toastMock: fn };
});

vi.mock("svelte-sonner", () => ({
  toast: toastMock,
}));

import { undoToast, UNDO_DURATION } from "./undo-snack.js";

type ToastOpts = {
  duration: number;
  action: { label: string; onClick: () => void };
  onAutoClose: () => void;
  onDismiss: () => void;
};

beforeEach(() => {
  toastMock.mockClear();
  (
    toastMock as unknown as { dismiss: ReturnType<typeof vi.fn> }
  ).dismiss.mockClear();
});

describe("undoToast", () => {
  it("shows an 8-second toast with a Rückgängig action by default", () => {
    undoToast("Gelöscht.", { onUndo: () => {} });
    expect(toastMock).toHaveBeenCalledOnce();
    const opts = toastMock.mock.calls[0]![1] as unknown as ToastOpts;
    expect(opts.duration).toBe(UNDO_DURATION);
    expect(opts.duration).toBe(8000);
    expect(opts.action.label).toBe("Rückgängig");
  });

  it("invokes onUndo (not onExpire) when the action is clicked", () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    undoToast("Gelöscht.", { onUndo, onExpire });
    const opts = toastMock.mock.calls[0]![1] as unknown as ToastOpts;
    opts.action.onClick();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onExpire).not.toHaveBeenCalled();
    // a later auto-close must NOT double-fire onExpire
    opts.onAutoClose();
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("invokes onExpire once when the window closes without an undo", () => {
    const onUndo = vi.fn();
    const onExpire = vi.fn();
    undoToast("Gelöscht.", { onUndo, onExpire });
    const opts = toastMock.mock.calls[0]![1] as unknown as ToastOpts;
    opts.onAutoClose();
    expect(onExpire).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
  });
});
