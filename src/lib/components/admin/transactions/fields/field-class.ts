/**
 * FIELD_CLASS — shared Aurora control class string for all form fields in the
 * entry-modals redesign (Package B2).
 *
 * Tokens: h-11/min-h-11 (44px control height), rounded-[10px] (Aurora radius),
 * border-hairline (Aurora hairline), Aurora focus ring. No hardcoded hex.
 * Surface is bg-card (not bg-white) so fields invert correctly in dark (F1).
 *
 * text-base sm:text-sm — 16px on mobile so iOS never zooms the viewport on
 * focus (ANDY-LENS mobile), 14px from the sm breakpoint up.
 */
export const FIELD_CLASS =
  "h-11 min-h-11 w-full rounded-[10px] border border-hairline bg-card px-3 text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
