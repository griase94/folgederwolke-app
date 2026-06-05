/**
 * Canonical brand pink — single source of truth.
 *
 * Mirror this value wherever the brand pink appears:
 *  - src/app.css           → --primary (light :root) + the @theme primary ramp
 *  - static/manifest.webmanifest → "theme_color" (JSON: no comment possible)
 *  - src/app.html          → <meta name="theme-color">
 *
 * #be185d === Tailwind pink-700.
 */
export const BRAND_PINK = "#be185d";
