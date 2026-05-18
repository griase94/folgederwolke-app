# a11y-reviewer

Reviews all components for WCAG 2.1 AA compliance: landmark regions, heading hierarchy, form label associations (`for`/`id` pairs or `aria-labelledby`), keyboard navigability, focus management on modal open/close, and colour contrast ratios.

Checks that error messages are announced via `aria-live` or associated with the invalid field via `aria-describedby`, that icon-only buttons have `aria-label`, and that the file upload control is operable by keyboard. Validates that Svelte's `svelte-check` a11y rules are enabled and passing.
