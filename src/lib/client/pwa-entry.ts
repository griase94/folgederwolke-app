/**
 * PWA launch-entry preference (client-only).
 *
 * Drives where the role-aware root (`/`) sends a LOGGED-OUT visitor when the
 * installed PWA launches, so a returning external lands straight on the Auslage
 * form (sticky "tab") — while a logged-out admin is NEVER stranded there.
 *
 * The safety rule lives in `loggedOutLaunchTarget()`:
 *   - `hasAuthedBefore` is set on the first successful sign-in and is NEVER
 *     cleared (not on sign-out, not on session expiry). Any device that has
 *     ever authenticated is treated as a member/admin device → it always sees
 *     the landing page (with the "Anmelden" CTA), never an auto-redirect to the
 *     form. This is what protects an admin whose session expired.
 *   - otherwise, a device that has completed ≥1 submission (`preferredEntry`)
 *     auto-opens the form (the returning external — delightful).
 *   - otherwise (first/undecided) → the landing page with both choices.
 *
 * All access is wrapped in try/catch — Safari private mode and locked-down
 * webviews throw on `localStorage`. There is no top-level `localStorage` read,
 * so this module is import-safe under SSR; only call these functions in the
 * browser (onMount / `if (browser)`).
 */

const PREFERRED_ENTRY_KEY = "fdw:preferredEntry";
const HAS_AUTHED_KEY = "fdw:hasAuthedBefore";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode / locked-down webview) — ignore.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export type PreferredEntry = "auslage" | null;

export function getPreferredEntry(): PreferredEntry {
  return safeGet(PREFERRED_ENTRY_KEY) === "auslage" ? "auslage" : null;
}

/** Mark the Auslage form as this device's preferred logged-out entry point. */
export function setPreferredAuslage(): void {
  safeSet(PREFERRED_ENTRY_KEY, "auslage");
}

/** Forget the sticky form preference (e.g. when the user heads to login). */
export function clearPreferredEntry(): void {
  safeRemove(PREFERRED_ENTRY_KEY);
}

/** True once this device has ever completed a successful sign-in. */
export function hasAuthedBefore(): boolean {
  return safeGet(HAS_AUTHED_KEY) === "1";
}

/** Record (permanently) that this device has authenticated at least once. */
export function markAuthedBefore(): void {
  safeSet(HAS_AUTHED_KEY, "1");
}

/**
 * Where to send a LOGGED-OUT visitor who landed on `/`.
 * Returns a path to redirect to, or `null` to render the landing page.
 */
export function loggedOutLaunchTarget(): string | null {
  // A device that ever authenticated is a member/admin device — always show
  // the landing (with Anmelden), never auto-open the form. Protects the
  // logged-out admin from being re-trapped on the public form.
  if (hasAuthedBefore()) return null;
  // A returning external who has submitted before → straight to the form.
  if (getPreferredEntry() === "auslage") return "/auslage-einreichen";
  // First / undecided visitor → the landing page with both choices.
  return null;
}
