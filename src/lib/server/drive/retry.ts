/**
 * withDriveRetry — exponential-backoff wrapper for Google Drive API calls.
 *
 * Error classification:
 *   403 storageQuotaExceeded   → DriveQuotaError (no retry)
 *   403 rateLimitExceeded      → DriveRateLimitError + retry
 *   403 userRateLimitExceeded  → DriveRateLimitError + retry
 *   403 invalidCredentials     → DriveAuthError (no retry)
 *   401                        → DriveAuthError (no retry)
 *   404                        → DriveNotFoundError + retry (eventual consistency)
 *   500 / 502 / 503 / 504      → retry with backoff
 *   other                      → rethrow original
 */

import {
  DriveAuthError,
  DriveNotFoundError,
  DriveQuotaError,
  DriveRateLimitError,
} from "./types.js";

interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 4 */
  maxAttempts?: number;
  /** Base delay for exponential backoff in ms. Default: 200 */
  baseDelayMs?: number;
  /**
   * Maximum number of attempts for 404 (eventual consistency) responses.
   * The effective 404 cap is `min(maxAttempts, maxNotFoundAttempts)`.
   * Default: 3
   */
  maxNotFoundAttempts?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether an unknown thrown value looks like a GaxiosError / googleapis
 * error object with a numeric `status` or `code` field and optional
 * `errors[].reason` array (as returned by the Google APIs client library).
 */
function isGaxiosLike(err: unknown): err is {
  status?: number;
  code?: number | string;
  response?: {
    status?: number;
    data?: {
      error?: {
        code?: number;
        errors?: Array<{ reason?: string; domain?: string }>;
      };
    };
  };
  errors?: Array<{ reason?: string; domain?: string }>;
} {
  return typeof err === "object" && err !== null;
}

function httpStatus(err: unknown): number | undefined {
  if (!isGaxiosLike(err)) return undefined;

  // GaxiosError exposes `.status` directly
  if (typeof err.status === "number") return err.status;

  // Fallback: numeric `.code` (older googleapis pattern)
  if (typeof err.code === "number") return err.code;

  // Nested response object
  if (typeof err.response?.status === "number") return err.response.status;

  return undefined;
}

function errorReasons(err: unknown): string[] {
  if (!isGaxiosLike(err)) return [];

  // Flat `.errors[]` array
  const flat = err.errors;
  if (Array.isArray(flat)) {
    return flat.map((e) => e.reason ?? "").filter(Boolean);
  }

  // Nested inside `.response.data.error.errors[]`
  const nested = err.response?.data?.error?.errors;
  if (Array.isArray(nested)) {
    return nested.map((e) => e.reason ?? "").filter(Boolean);
  }

  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function withDriveRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  const maxNotFoundAttempts = opts.maxNotFoundAttempts ?? 3;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const status = httpStatus(err);
      const reasons = errorReasons(err);

      // -----------------------------------------------------------------------
      // 401 — credentials gone (no retry)
      // -----------------------------------------------------------------------
      if (status === 401) {
        throw new DriveAuthError(
          "Drive API returned 401 — credentials invalid or expired",
          err,
        );
      }

      // -----------------------------------------------------------------------
      // 403 — disambiguate by reason
      // -----------------------------------------------------------------------
      if (status === 403) {
        if (reasons.includes("storageQuotaExceeded")) {
          throw new DriveQuotaError("Google Drive storage quota exceeded", err);
        }

        if (
          reasons.includes("invalidCredentials") ||
          reasons.includes("authError")
        ) {
          throw new DriveAuthError(
            "Drive API returned 403 invalidCredentials — refresh token may be revoked",
            err,
          );
        }

        if (
          reasons.includes("rateLimitExceeded") ||
          reasons.includes("userRateLimitExceeded")
        ) {
          if (attempt >= maxAttempts) {
            throw new DriveRateLimitError(
              `Drive rate limit exceeded after ${attempt} attempts`,
              err,
            );
          }
          // Retry with backoff (fall through to delay below)
        } else {
          // Unknown 403 — don't retry
          throw err;
        }
      }

      // -----------------------------------------------------------------------
      // 404 — eventual consistency; retry up to `maxNotFoundAttempts` (default 3)
      // attempts. Effective cap is `min(maxAttempts, maxNotFoundAttempts)`.
      // -----------------------------------------------------------------------
      else if (status === 404) {
        if (attempt >= Math.min(maxAttempts, maxNotFoundAttempts)) {
          throw new DriveNotFoundError(
            `Drive resource not found after ${attempt} attempts (404)`,
            undefined,
            err,
          );
        }
        // Retry (fall through to delay)
      }

      // -----------------------------------------------------------------------
      // 5xx — server errors; retry with backoff
      // -----------------------------------------------------------------------
      else if (
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) {
        if (attempt >= maxAttempts) {
          throw err;
        }
        // Retry (fall through to delay)
      }

      // -----------------------------------------------------------------------
      // Everything else — rethrow immediately
      // -----------------------------------------------------------------------
      else {
        throw err;
      }

      // Exponential backoff with ±25% jitter to spread out retries when
      // many concurrent callers hit the same transient failure.
      // Base sequence: 200ms, 400ms, 800ms, … each multiplied by a random
      // factor in [0.75, 1.25].
      const delay =
        baseDelayMs * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5);
      await sleep(delay);
    }
  }

  // Exhausted all attempts
  throw lastErr;
}
