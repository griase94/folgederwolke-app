# idempotency-reviewer

Reviews all operations that must be safe to retry: Drive uploads (idempotency key in `appProperties`), mail sends (UNIQUE constraint on `sent_mails`), DB inserts using `ON CONFLICT DO NOTHING`, and form submissions keyed on a stable `submissionId`.

Validates that idempotency keys are stable across retries (not regenerated on each attempt), that concurrent duplicate requests don't create two rows, and that all external calls (Drive API, SMTP) are wrapped with retry logic that does not generate new side-effects on each attempt.
