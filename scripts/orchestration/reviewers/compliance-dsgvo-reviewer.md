# compliance-dsgvo-reviewer

Reviews DSGVO/GDPR compliance: consent collection before processing personal data (especially for Aufwandsspende per §5.10), correct data retention periods, right-to-erasure implementation in `datenschutz.ts`, and that personal data is not written to logs.

Checks that the public form collects only the minimum necessary data fields, that the Datenschutzerklärung link is present on all public-facing pages, and that the `audit_log` actor field stores only user IDs (not email addresses). Validates that data export produces DSGVO-compliant machine-readable output.
