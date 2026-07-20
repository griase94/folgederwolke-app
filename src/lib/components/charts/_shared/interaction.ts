/**
 * Flicker-free hover plumbing shared by the interactive line/column charts.
 *
 * Doctrine (`_kit/dataviz.md` §7): geometry is cached at load/resize and NEVER
 * read on move; the crosshair snaps to the nearest month; the readout card is
 * fixed-size and positioned by transform so it never trembles under the
 * pointer. Mobile is 100% hover-free — callers gate all of this behind
 * {@link watchFineHover}.
 *
 * These are plain functions (no runes) — the reactive `$state` lives in the
 * consuming component; {@link watchFineHover} just wires the media-query.
 */

/**
 * True right now when the device has a fine pointer that can hover (a desktop
 * mouse). SSR-safe (returns false without `window`).
 */
export function hasFineHover(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/**
 * Push the current hover-capability into `set`, then keep it updated as the
 * pointer capability changes. Call inside `onMount`; return value is the
 * cleanup. SSR-safe (sets false and returns undefined without `window`).
 */
export function watchFineHover(
  set: (value: boolean) => void,
): (() => void) | void {
  if (typeof window === "undefined" || !window.matchMedia) {
    set(false);
    return;
  }
  const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
  set(mq.matches);
  const on = () => set(mq.matches);
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}

/** Cached SVG box geometry — read only on mount + resize, never on move. */
export interface ChartGeo {
  /** SVG bounding rect in client pixels. */
  rect: DOMRect;
  /** px-per-viewBox-unit on each axis. */
  sx: number;
  sy: number;
}

/**
 * Map a client X to the nearest of `n` evenly-spaced points spanning the plot
 * (`ml … ml+plotW` in viewBox units). Pure — takes the cached geo.
 */
export function nearestIndex(
  clientX: number,
  geo: ChartGeo,
  vbW: number,
  ml: number,
  plotW: number,
  n: number,
): number {
  const vbX = ((clientX - geo.rect.left) / geo.rect.width) * vbW;
  const raw = ((vbX - ml) / plotW) * (n - 1);
  return Math.max(0, Math.min(n - 1, Math.round(raw)));
}
