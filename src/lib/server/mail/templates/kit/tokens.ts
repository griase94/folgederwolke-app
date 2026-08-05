/**
 * Solid-hex mail palette — the ONE place mail colours are written down.
 *
 * Mail clients strip `var()`, `oklch()` and gradients, so mail templates cannot
 * use the Aurora CSS tokens. These constants are the hand-mapped solid-hex
 * mirror of `src/lib/themes/aurora.css` used by the Auslagen mail suite
 * (mail-auslage-*.md briefs §4). Import them instead of typing a hex literal —
 * a second literal is how the four mails drift apart.
 *
 * Colour hierarchy (ratified, briefs §4): pink = identity (brand strip only),
 * emerald = status (chip + card chrome), plum = the money digit — never the
 * other way round.
 */

/** Warm Aurora ink ramp — replaces cold Tailwind blue-grays in mail. */
export const INK_900 = "#1a1126";
export const INK_700 = "#3a3050";
export const INK_500 = "#6d6481";
export const INK_300 = "#9c92ae";
/** Card/divider hairline. */
export const HAIRLINE = "#ece7f2";

/** Lavender surfaces: tinted card (hero, detail) and the quieter "plain" card. */
export const SURFACE_TINT = "#f4eefb";
export const SURFACE_PLAIN = "#faf7fb";

/** Ausgabe-plum — every EUR amount in every mail (ADR-0003 display rule). */
export const PLUM = "#a64d79";

/** Emerald status lane: chip fill/text, card chrome, accent rules. */
export const EMERALD = "#1f9e76";
export const EMERALD_TEXT = "#147a5a";
export const EMERALD_TINT = "#e6f6ee";
export const PAID_BG = "#eaf7f0";
export const PAID_BORDER = "#cbe9da";
export const PAID_LABEL = "#3f6a58";
export const PAID_VALUE = "#173d2c";

/** Neutral status lane — the rejection chip is deliberately NOT alarm-red. */
export const NEUTRAL_TINT = "#efeaf5";
export const NEUTRAL_DOT = "#b8aecb";

/** Amber: reserved for the Grund-Box, the only warn colour in the suite. */
export const AMBER_BG = "#fdf3e6";
export const AMBER_BAR = "#e39412";
export const AMBER_TEXT = "#b45309";
export const AMBER_BODY = "#5c4a2e";

/** Lavender accent bar of the nextstep callout. */
export const ACCENT_LAVENDER = "#b49fd4";

/** Page background behind the email card. */
export const PAGE_BG = "#f8f5f7";

export const MONO_STACK = "'SFMono-Regular',Menlo,Consolas,monospace";

/**
 * Class hooks for the ONE responsive rule the shell ships (see render.ts):
 * below 480px a two-column fact row stacks label over value. Clients that drop
 * `<style>` keep the inline two-column layout, which is why the inline styles
 * stay authoritative and these classes only ever *relax* them.
 */
export const ROW_K_CLASS = "fdw-k";
export const ROW_V_CLASS = "fdw-v";
