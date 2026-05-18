# ux-mobile-reviewer

Reviews all Svelte components and routes for mobile usability: touch-target sizes (minimum 44x44 px), viewport meta presence, responsive breakpoints, and overflow handling on small screens.

Checks that form inputs have appropriate `inputmode` attributes (e.g. `inputmode="decimal"` for amounts, `inputmode="email"` for email fields), that error states are visible without colour alone, and that loading states do not cause layout shift. Validates that the public form is usable on iOS Safari without horizontal scroll.
