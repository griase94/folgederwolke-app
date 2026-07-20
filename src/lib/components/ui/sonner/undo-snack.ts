/**
 * UndoSnack — an undo toast (F1 shared primitive).
 *
 * Extends the existing sonner Toaster rather than duplicating it: an 8-second
 * toast carrying a "Rückgängig" action. The pattern is optimistic — the caller
 * applies the change immediately, then shows the snack; `onUndo` reverts it,
 * `onExpire` runs once the window closes without an undo (commit / no-op).
 */
import { toast } from "svelte-sonner";

/** Default undo window (ms). */
export const UNDO_DURATION = 8000;

export interface UndoSnackOptions {
  /** Revert the optimistic change. */
  onUndo: () => void;
  /** Runs once the window closes without an undo (auto-close or dismiss). */
  onExpire?: () => void;
  /** Secondary line under the message. */
  description?: string;
  /** Undo window in ms (default 8000). */
  duration?: number;
  /** Action label (default "Rückgängig"). */
  actionLabel?: string;
}

/**
 * Show an undo snackbar. Returns the toast id. `onUndo` and `onExpire` are
 * mutually exclusive and each fire at most once.
 */
export function undoToast(
  message: string,
  {
    onUndo,
    onExpire,
    description,
    duration = UNDO_DURATION,
    actionLabel = "Rückgängig",
  }: UndoSnackOptions,
): string | number {
  let settled = false;
  const id: string | number = toast(message, {
    description,
    duration,
    action: {
      label: actionLabel,
      onClick: () => {
        if (settled) return;
        settled = true;
        onUndo();
        toast.dismiss(id);
      },
    },
    onAutoClose: () => {
      if (settled) return;
      settled = true;
      onExpire?.();
    },
    onDismiss: () => {
      if (settled) return;
      settled = true;
      onExpire?.();
    },
  });
  return id;
}
