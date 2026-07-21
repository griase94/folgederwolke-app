/**
 * The InvoicePdfPreview "Vorschau aktuell / wird aktualisiert / veraltet" badge
 * as a pure decision — extracted so the state machine can be tested without a
 * DOM, fetch, or iframe.
 *
 * The bug this replaces: the badge used to be $state mutated inside the debounce
 * $effect, which also *read* the badge — so it was its own reactive dependency.
 * `refresh` set it to 'aktuell', the effect re-fired and flipped it straight
 * back to 'veraltet', and the label was stuck on "veraltet" forever. The fix
 * makes the badge a pure function of facts the effect never reads.
 *
 * Semantics (Andy-Feedback 2026-07 — "veraltet == the form changed since the
 * last render; a fresh render clears the label"):
 *   - fetch failed (phase 'error')      → veraltet (the last-good PDF stays up)
 *   - on-screen PDF matches the form     → aktuell
 *   - nothing rendered yet               → wird_aktualisiert (first-ever render)
 *   - changed since last render          → veraltet (stable through the debounce
 *                                          and the re-fetch, until it lands)
 */

export type PreviewPhase = "loading" | "idle" | "error";
export type PreviewBadge = "aktuell" | "wird_aktualisiert" | "veraltet";

export function previewBadge(
  phase: PreviewPhase,
  renderedHash: string | null,
  currentHash: string,
): PreviewBadge {
  if (phase === "error") return "veraltet";
  if (renderedHash === currentHash) return "aktuell";
  if (renderedHash === null) return "wird_aktualisiert";
  return "veraltet";
}
