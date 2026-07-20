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
    hasDark: true,
  },
];

export const DEFAULT_THEME = "aurora";
export const THEME_COOKIE = "fdw_theme";

/**
 * Dark-mode preference (F1). Persisted in the `fdw_mode` cookie so the server
 * can render the `.dark` class into the SSR HTML flash-free (mirroring the
 * theme swap), while mode-watcher owns the client-side reactive class + the
 * `mode.current` store consumed by sonner. CSP forbids mode-watcher's inline
 * FOUC script (`script-src 'self'`), so we pass `disableHeadScriptInjection`
 * and prevent the flash server-side instead.
 */
export const MODE_COOKIE = "fdw_mode";
export type ThemeMode = "light" | "dark" | "system";
export const DEFAULT_MODE: ThemeMode = "system";

/** Resolve a raw cookie value to a valid mode; unknown/missing → system. */
export function resolveMode(cookieValue: string | undefined): ThemeMode {
  return cookieValue === "light" ||
    cookieValue === "dark" ||
    cookieValue === "system"
    ? cookieValue
    : DEFAULT_MODE;
}

/**
 * Whether SSR should stamp the `.dark` class, given the cookie mode and the
 * client's colour-scheme preference (from the `Sec-CH-Prefers-Color-Scheme`
 * client hint — `true` when it reports "dark"). For `system` mode the hint is
 * the only server-visible signal; browsers that don't send it fall back to
 * light, and mode-watcher corrects the class on hydration.
 */
export function shouldRenderDark(
  mode: ThemeMode,
  clientHintPrefersDark: boolean,
): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return clientHintPrefersDark;
}

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
