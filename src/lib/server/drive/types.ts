/**
 * Drive error hierarchy.
 *
 * DriveError is the base class. Callers can use instanceof to branch:
 *   - DriveAuthError   → credentials revoked or invalid; do not retry
 *   - DriveQuotaError  → storage quota exceeded; do not retry
 *   - DriveRateLimitError → API rate limit; retry with backoff
 *   - DriveNotFoundError  → file not found; may retry for eventual consistency
 */

export class DriveError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

/** OAuth credentials are invalid or revoked. Token refresh won't help. */
export class DriveAuthError extends DriveError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "DriveAuthError";
  }
}

/** Google Drive storage quota exceeded for the account. Do not retry. */
export class DriveQuotaError extends DriveError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "DriveQuotaError";
  }
}

/** API rate limit or user rate limit hit. Caller should retry with backoff. */
export class DriveRateLimitError extends DriveError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "DriveRateLimitError";
  }
}

/** File not found; may be an eventual-consistency gap right after creation. */
export class DriveNotFoundError extends DriveError {
  constructor(
    message: string,
    public readonly driveFileId?: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "DriveNotFoundError";
  }
}
