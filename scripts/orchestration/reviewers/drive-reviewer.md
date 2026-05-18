# drive-reviewer

Reviews Google Drive integration code: idempotency key enforcement on uploads, advisory-lock usage for folder creation races, retry logic in `withDriveRetry`, and correct `drive.file` scope usage (no broader permissions).

Validates that `escapeDriveQ` is applied to all user-supplied strings interpolated into Drive query filters, that `uploadBeleg` returns the existing file when the idempotency key matches, and that the `FileStorage` interface is used by callers rather than raw drive client functions. Checks that Drive credentials are never logged.
