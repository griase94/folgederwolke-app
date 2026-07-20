/**
 * Chart colour tokens as CSS `var()` strings.
 *
 * Every chart mark colour is a token so a theme flip repaints all charts at
 * once (dataviz §2). SVG presentation attributes can't read a CSS variable, so
 * marks apply these via inline `style="fill: …"` / `stroke`. Text always wears
 * ink tokens (§3.7); the mark beside the text carries the identity hue.
 *
 * The token NAMES live in `src/lib/themes/aurora.css` (light + `.dark`); these
 * strings only reference them — never a raw hex.
 */

import type { Sphere } from "$lib/domain/sphere.js";

/** The one true categorical set — the four Gemeinnützigkeits-Sphären. */
export const SPHERE_VAR: Record<Sphere, string> = {
  ideeller: "var(--sphere-ideeller)",
  zweckbetrieb: "var(--sphere-zweckbetrieb)",
  vermoegen: "var(--sphere-vermoegen)",
  wirtschaftlich: "var(--sphere-wirtschaftlich)",
};

export const SPHERE_TINT_VAR: Record<Sphere, string> = {
  ideeller: "var(--sphere-ideeller-tint)",
  zweckbetrieb: "var(--sphere-zweckbetrieb-tint)",
  vermoegen: "var(--sphere-vermoegen-tint)",
  wirtschaftlich: "var(--sphere-wirtschaftlich-tint)",
};

/** Meaning-hues (not brand): income green, expense rose, donation violet. */
export const TOKEN = {
  einnahme: "var(--type-einnahme)",
  einnahmeStrong: "var(--einnahme-strong)",
  einnahmeTint: "var(--type-einnahme-tint)",
  ausgabe: "var(--type-ausgabe)",
  ausgabeTint: "var(--type-ausgabe-tint)",
  spende: "var(--type-spende)",
  deficit: "var(--dataviz-deficit)",
  deficitStrong: "var(--dataviz-deficit-strong)",
  deficitTint: "var(--dataviz-deficit-tint)",
  paid: "var(--dataviz-paid)",
  neutralOpen: "var(--neutral-open)",
  track: "var(--dataviz-track)",
  baseline: "var(--dataviz-baseline)",
  crosshair: "var(--dataviz-crosshair)",
  halo: "var(--dataviz-halo)",
  warn: "var(--sev-warn)",
  warnText: "var(--warn-text)",
  warnTint: "var(--sev-warn-tint)",
  over: "var(--sev-critical)",
  overText: "var(--crit-text)",
  overTint: "var(--sev-critical-tint)",
  ringTrack: "var(--dataviz-track)",
  ink900: "var(--ink-900)",
  ink700: "var(--ink-700)",
  ink500: "var(--ink-500)",
  ink300: "var(--ink-300)",
  hairline: "var(--hairline)",
  card: "var(--card)",
} as const;
