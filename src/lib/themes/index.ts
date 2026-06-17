/**
 * Theme registry — one entry per theme (spec §3).
 *
 * Adding a theme = one CSS file under src/lib/themes/<id>.css (defining the
 * COMPLETE token contract under [data-theme="<id>"], imported in app.css)
 * + one entry here. Contract: master plan §2.2 — these export names and
 * shapes are frozen.
 *
 * The swatches are preview colors for the Einstellungen switcher cards —
 * the only place outside the theme CSS files where brand hexes may live
 * (they are data, not styles).
 */
export interface ThemeMeta {
  id: string;
  label: string;
  swatches: [string, string, string];
  hasDark: boolean;
}

export const themes: ThemeMeta[] = [
  {
    id: "aurora",
    label: "Aurora",
    swatches: ["#ff1e8c", "#a855f7", "#3b82f6"],
    hasDark: false,
  },
];

export const DEFAULT_THEME = "aurora";
export const THEME_COOKIE = "fdw_theme";

/**
 * Resolve a raw cookie value to a registered theme id.
 * Unknown, missing, or hostile values fall back to DEFAULT_THEME — the
 * return value is therefore always one of our registry literals, never
 * attacker-controlled input (safe to interpolate into HTML attributes).
 */
export function resolveThemeId(cookieValue: string | undefined): string {
  return themes.some((t) => t.id === cookieValue)
    ? (cookieValue as string)
    : DEFAULT_THEME;
}
