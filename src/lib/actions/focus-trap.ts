/**
 * focusTrap — a Svelte action for modal dialog containers.
 *
 * On mount it moves focus into the dialog (first focusable element, else the
 * container itself), traps Tab / Shift-Tab so keyboard + screen-reader users
 * cannot tab onto the obscured page behind the backdrop, and restores focus to
 * the element that opened the dialog on teardown. Escape-to-close and any
 * dirty-guard stay where they are (a sibling keydown handler on the same node).
 *
 * Used by EntryFormShell + DetailModalShell so both transaction modals share
 * one correct focus-management implementation (combined-review a11y high).
 *
 * Usage: `<div role="dialog" aria-modal="true" tabindex="-1" use:focusTrap>…`
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusTrap(node: HTMLElement) {
  // Remember who opened the dialog so we can restore focus on close.
  const opener =
    typeof document !== "undefined"
      ? (document.activeElement as HTMLElement | null)
      : null;

  const focusable = (): HTMLElement[] =>
    Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));

  // Focus the first field after mount (microtask so the DOM is settled).
  queueMicrotask(() => {
    const first = focusable()[0];
    (first ?? node).focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const items = focusable();
    if (items.length === 0) {
      // Nothing focusable inside — keep focus on the dialog itself.
      e.preventDefault();
      node.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === node)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  node.addEventListener("keydown", onKeydown);

  return {
    destroy() {
      node.removeEventListener("keydown", onKeydown);
      // Restore focus to the opener if it's still in the document.
      if (opener && typeof opener.focus === "function" && opener.isConnected) {
        opener.focus();
      }
    },
  };
}
