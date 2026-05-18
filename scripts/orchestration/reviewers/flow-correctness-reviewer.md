# flow-correctness-reviewer

Reviews the end-to-end correctness of multi-step user flows: public Auslage form submission → `auslagen_submissions` DB row → Eingangsmail → admin review → status transition → Erstattungsmail. Validates that each step produces the correct DB state and that no step is skippable.

Checks that form validation errors return the form with field-level messages (not a blank page), that successful submission redirects to a confirmation page, and that re-submission of the same idempotency key is handled gracefully without duplicate rows.
