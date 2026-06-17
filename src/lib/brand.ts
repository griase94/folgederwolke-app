/**
 * Canonical Aurora brand constants — for contexts that CANNOT use CSS
 * custom properties (HTML mail templates, asset-generation scripts, and
 * the manifest/meta mirrors). In-app UI never imports these — components
 * use the theme tokens from src/lib/themes/aurora.css via Tailwind
 * utilities (bg-primary-strong, text-primary-text, …).
 *
 * Values mirror src/lib/themes/aurora.css (master plan §2.1 — frozen).
 *
 * Mirror sites (update together):
 *  - static/manifest.webmanifest → "theme_color" = BRAND_WASH_ANCHOR (JSON: no comment possible)
 *  - src/app.html               → <meta name="theme-color"> = BRAND_WASH_ANCHOR
 */
export const BRAND_PRIMARY = "#ff1e8c"; // --primary (non-text accents only)
export const BRAND_PRIMARY_STRONG = "#d6116f"; // --primary-strong (fill behind white text, AA 4.5:1)
export const BRAND_PRIMARY_TEXT = "#c71e6e"; // --primary-text (links/text on light surfaces)
export const BRAND_WASH_ANCHOR = "#fff1f6"; // solid anchor of --bg-wash (manifest/meta theme color)
export const BRAND_INK = "#1a1126"; // --ink-900 — splash wordmark (dark text on the wash)
export const BRAND_WASH_STOPS = ["#fff1f6", "#f4eeff", "#ecf3ff"] as const; // --bg-wash stops
export const BRAND_GRADIENT_STOPS = ["#ff1e8c", "#a855f7", "#3b82f6"] as const; // --gradient-brand stops (icon field)
