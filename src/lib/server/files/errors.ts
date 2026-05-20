/**
 * Typed storage errors — Phase 9.
 *
 * Every storage failure path raises a subclass of StorageError with a
 * stable `code` string. Callers (route handlers, the event bus) can switch
 * on `code` to map to HTTP status codes and audit-log entries without
 * coupling to instanceof chains.
 *
 * Each subclass overrides `name` so stack traces + Sentry-style grouping
 * surface the specific error class rather than the base.
 *
 * `cause` propagates the underlying error (SDK error, fetch failure, etc.)
 * via the ES2022 Error cause field for debuggability.
 */

export class StorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(p: string, cause?: unknown) {
    super("STORAGE_NOT_FOUND", `File not found: ${p}`, cause);
    this.name = "StorageNotFoundError";
  }
}

export class StorageDuplicateError extends StorageError {
  constructor(p: string, cause?: unknown) {
    super("STORAGE_DUPLICATE", `File already exists at: ${p}`, cause);
    this.name = "StorageDuplicateError";
  }
}

export class StorageImmutabilityError extends StorageError {
  constructor(p: string, cause?: unknown) {
    super(
      "STORAGE_IMMUTABLE",
      `Refusing to write to reserved path: ${p}. Archived files are immutable per Festschreibung (ADR-0006/0012).`,
      cause,
    );
    this.name = "StorageImmutabilityError";
  }
}

export class StorageNetworkError extends StorageError {
  constructor(reason: string, cause?: unknown) {
    super("STORAGE_NETWORK", `Network error: ${reason}`, cause);
    this.name = "StorageNetworkError";
  }
}

export class StorageInvalidError extends StorageError {
  constructor(reason: string, cause?: unknown) {
    super("STORAGE_INVALID", `Invalid storage request: ${reason}`, cause);
    this.name = "StorageInvalidError";
  }
}
