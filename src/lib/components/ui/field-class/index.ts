/**
 * The ONE form-field baseline (DESIGN-GUIDELINES §3, height canon §1.5).
 *
 * Every input, select and textarea in the app wears FIELD_CLASS. It lived in
 * `admin/transactions/fields/` until SLOT-FELD, which meant the Kit imported it
 * UPWARD out of a feature folder (`ui/date-field` → `admin/…`) — a layering
 * inversion that also made the constant look feature-local when it is in fact
 * app-wide.
 *
 * HEIGHT CANON (ratified 2026-08-04): a form field is flat `h-11` — 44px on
 * EVERY viewport, no `md:h-10` step-down. Eight to eleven stacked fields in a
 * dialog gain nothing visible from 40px, lose touch comfort, and reflow on every
 * resize. The `md:h-10` step belongs to ROW controls (toolbar, bulk bars, dense
 * rows), where a single line sits beside a list and each pixel counts — see
 * TOOLBAR_CONTROL in `ui/list-toolbar`.
 *
 * Other tokens: `rounded-[10px]` (Aurora radius), `border-hairline`, Aurora
 * focus ring (ring-2 + offset-1). Surface is `bg-card`, never `bg-white` — that
 * is what makes fields invert correctly in dark mode (F1).
 *
 * `text-base sm:text-sm`: 16px on mobile so iOS never zooms the viewport on
 * focus, 14px from sm up.
 *
 * `w-full` belongs to the WRAPPER, not here — Andys Regel 2 (Feldbreite =
 * Inhaltstyp) means a Betrag and a Bezeichnung must not be equally wide. It is
 * still in this string for now; removing it is SLOT-FELD S2 work, because every
 * callsite has to grow its own width first.
 */
export const FIELD_CLASS =
  "h-11 min-h-11 w-full rounded-[10px] border border-hairline bg-card px-3 text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

/**
 * The ONE checkbox anatomy (DESIGN-GUIDELINES §3).
 *
 * `accent-primary` rather than a raw palette colour: the app had eleven
 * checkbox anatomies including `accent-indigo-600` and `accent-pink-600`, which
 * state a brand that is not ours and do not follow a theme flip.
 */
export const CHECKBOX_CLASS = "size-4 shrink-0 rounded border-hairline accent-primary";
