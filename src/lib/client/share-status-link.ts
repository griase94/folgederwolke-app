/**
 * Status-link share/copy affordance for the public Auslage flow (Aurora §6).
 *
 * WhatsApp in-app browsers (a common path to the public form) lose the URL
 * when closed — the confirmation mail carries the status link too; this is
 * the belt to that suspender: native share sheet where available, clipboard
 * fallback otherwise.
 */

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export function buildStatusUrl(ausId: string, origin: string): string {
  return new URL(`/auslage-status/${encodeURIComponent(ausId)}`, origin).href;
}

export async function shareOrCopyStatusLink(
  url: string,
  vereinName: string,
): Promise<ShareOutcome> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ title: `Auslage-Status — ${vereinName}`, url });
      return "shared";
    } catch (err) {
      // User dismissed the native sheet — normal action, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      // Other share failures (unsupported payload, transient) → clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
