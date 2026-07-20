/**
 * Hero-Field-Familie shared anatomy (F1, kit §F3 "Hero-Field-Familie").
 *
 * AmountField (Betrag) and DateField (Datum) are SIBLINGS of ONE anatomy
 * (ANDY-LENS §2): identical height, radius, border weight AND opacity (65% mix),
 * prefix zone (20px glyph, 16px inset, 10px to the value), value metric
 * (24/800 tabular, right ruler) and focus ring. The ONLY difference is the
 * accent colour (--hero-accent) and the prefix glyph. Both components import
 * these exact strings so the anatomy can never drift.
 */

/** The field shell. Set `--hero-accent` on the element for border/ring/glyph. */
export const HERO_WRAP =
  "flex items-center min-w-0 min-h-14 rounded-[12px] overflow-hidden border-[1.5px] " +
  "bg-[var(--amount-surface)] transition-[border-color,box-shadow] duration-150 " +
  "border-[color-mix(in_srgb,var(--hero-accent)_65%,transparent)] " +
  "focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--hero-accent)_16%,transparent)]";

/** Error override for the shell (adds after HERO_WRAP; sev-critical border+ring). */
export const HERO_WRAP_ERROR =
  "border-severity-critical " +
  "focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--sev-critical)_16%,transparent)]";

/** The 20px accent prefix zone (16px left inset, 10px gap to the value). */
export const HERO_PREFIX =
  "flex-none grid place-items-center w-5 ml-4 mr-2.5 text-[color:var(--hero-accent)]";

/** The value input — identical metric in both fields (right-aligned tabular
 *  extrabold). 19px on mobile so a full date (TT.MM.JJJJ) fits the side-by-side
 *  hero cell at 390px; 24px from the sm breakpoint up. */
export const HERO_INPUT =
  "flex-1 min-w-0 border-0 bg-transparent p-0 text-[19px] sm:text-[24px] font-extrabold leading-none " +
  "tabular-nums tracking-[-0.01em] text-right outline-none " +
  "placeholder:text-ink-300 placeholder:font-semibold";

/** The trailing currency glyph (€) — accent-coloured, 18/700. */
export const HERO_SUFFIX =
  "flex-none grid place-items-center pl-1.5 pr-4 text-[18px] font-bold text-[color:var(--hero-accent)]";
