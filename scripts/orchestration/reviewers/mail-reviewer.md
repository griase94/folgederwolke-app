# mail-reviewer

Reviews mail sending code: idempotency via `sent_mails` UNIQUE constraint (ADR-0005), correct template rendering via Svelte SSR, subject line accuracy, and provider abstraction (`smtp` vs `resend`). Checks that all `TemplateName` values have a matching `TemplateProps` entry and a `loadTemplate` case.

Validates that failed sends mark the DB row `status='failed'` and re-throw (not silently swallow), that no PII is logged, and that the SMTP provider uses TLS. Checks that `AufwandsspendenBestaetigung` BMF-Pflichtfelder (Verzichtdatum, Betrag, Satzungsnachweis, Freistellungsbescheid) are present once the template is implemented.
