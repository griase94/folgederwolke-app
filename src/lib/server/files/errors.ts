/**
 * Typed storage errors — Phase 9.
 *
 * Every storage failure path raises a subclass of StorageError with a
 * stable `code` string. Callers (route handlers, the event bus) can switch
 * on `code` to map to HTTP status codes and audit-log entries without
 * coupling to instanceof chains.
 */

export class StorageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(p: string) {
    super("STORAGE_NOT_FOUND", `File not found: ${p}`);
  }
}

export class StorageDuplicateError extends StorageError {
  constructor(p: string) {
    super("STORAGE_DUPLICATE", `File already exists at: ${p}`);
  }
}

export class StorageImmutabilityError extends StorageError {
  constructor(p: string) {
    super(
      "STORAGE_IMMUTABLE",
      `Refusing to write to reserved path: ${p}. Archived files are immutable per Festschreibung (ADR-0006/0012).`,
    );
  }
}

export class StorageNetworkError extends StorageError {
  constructor(cause: string) {
    super("STORAGE_NETWORK", `Network error: ${cause}`);
  }
}

export class StorageInvalidError extends StorageError {
  constructor(reason: string) {
    super("STORAGE_INVALID", `Invalid storage request: ${reason}`);
  }
}
