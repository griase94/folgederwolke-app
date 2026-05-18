/**
 * Unit tests for Drive module — @phase-2
 *
 * Covers:
 *  - DriveError class hierarchy (instanceof checks)
 *  - withDriveRetry error classification:
 *      401         → DriveAuthError (no retry)
 *      403 storageQuotaExceeded → DriveQuotaError (no retry)
 *      403 rateLimitExceeded    → DriveRateLimitError after maxAttempts
 *      403 invalidCredentials   → DriveAuthError (no retry)
 *      403 unknown reason       → rethrow original (no retry)
 *      404                      → DriveNotFoundError after 3 attempts
 *      500                      → rethrow after maxAttempts
 *      non-HTTP error           → rethrow immediately
 *  - Idempotency key format: crypto.randomUUID() produces a v4 UUID
 *  - sleep is mocked so tests run fast (baseDelayMs: 0)
 *
 * Live API tests are deferred to a separate integration suite (Phase 4).
 */

import { describe, expect, it, vi } from "vitest";
import {
  DriveAuthError,
  DriveError,
  DriveNotFoundError,
  DriveQuotaError,
  DriveRateLimitError,
} from "./types.js";
import { withDriveRetry } from "./retry.js";

// ---------------------------------------------------------------------------
// Helpers to build fake error shapes the Drive client library emits
// ---------------------------------------------------------------------------

function makeGaxiosError(
  status: number,
  reasons: string[] = [],
): Record<string, unknown> {
  return {
    status,
    message: `HTTP ${status}`,
    errors: reasons.map((reason) => ({ reason, domain: "usageLimits" })),
  };
}

function makeNestedGaxiosError(
  status: number,
  reasons: string[] = [],
): Record<string, unknown> {
  return {
    message: `HTTP ${status}`,
    response: {
      status,
      data: {
        error: {
          code: status,
          errors: reasons.map((reason) => ({ reason, domain: "usageLimits" })),
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. DriveError hierarchy — instanceof checks
// ---------------------------------------------------------------------------

describe("@phase-2 DriveError hierarchy", () => {
  it("DriveAuthError is instanceof DriveError", () => {
    const err = new DriveAuthError("auth");
    expect(err).toBeInstanceOf(DriveError);
    expect(err).toBeInstanceOf(DriveAuthError);
    expect(err.name).toBe("DriveAuthError");
  });

  it("DriveQuotaError is instanceof DriveError", () => {
    const err = new DriveQuotaError("quota");
    expect(err).toBeInstanceOf(DriveError);
    expect(err).toBeInstanceOf(DriveQuotaError);
    expect(err.name).toBe("DriveQuotaError");
  });

  it("DriveRateLimitError is instanceof DriveError", () => {
    const err = new DriveRateLimitError("rate");
    expect(err).toBeInstanceOf(DriveError);
    expect(err).toBeInstanceOf(DriveRateLimitError);
    expect(err.name).toBe("DriveRateLimitError");
  });

  it("DriveNotFoundError is instanceof DriveError", () => {
    const err = new DriveNotFoundError("not found", "file-123");
    expect(err).toBeInstanceOf(DriveError);
    expect(err).toBeInstanceOf(DriveNotFoundError);
    expect(err.name).toBe("DriveNotFoundError");
    expect(err.driveFileId).toBe("file-123");
  });

  it("subclasses are not cross-instanceOf each other", () => {
    const auth = new DriveAuthError("x");
    const quota = new DriveQuotaError("x");
    expect(auth).not.toBeInstanceOf(DriveQuotaError);
    expect(quota).not.toBeInstanceOf(DriveAuthError);
  });

  it("DriveError carries cause", () => {
    const cause = new Error("original");
    const err = new DriveAuthError("wrapped", cause);
    expect(err.cause).toBe(cause);
  });
});

// ---------------------------------------------------------------------------
// 2. withDriveRetry — error classification (baseDelayMs:0 for speed)
// ---------------------------------------------------------------------------

describe("@phase-2 withDriveRetry classification", () => {
  it("401 → DriveAuthError immediately (no retries)", async () => {
    const fn = vi.fn().mockRejectedValue(makeGaxiosError(401));
    await expect(
      withDriveRetry(fn, { maxAttempts: 4, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("403 storageQuotaExceeded → DriveQuotaError immediately (no retries)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(makeGaxiosError(403, ["storageQuotaExceeded"]));
    await expect(
      withDriveRetry(fn, { maxAttempts: 4, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveQuotaError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("403 rateLimitExceeded → DriveRateLimitError after maxAttempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(makeGaxiosError(403, ["rateLimitExceeded"]));
    await expect(
      withDriveRetry(fn, { maxAttempts: 3, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveRateLimitError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("403 userRateLimitExceeded → DriveRateLimitError after maxAttempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(makeGaxiosError(403, ["userRateLimitExceeded"]));
    await expect(
      withDriveRetry(fn, { maxAttempts: 2, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveRateLimitError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("403 invalidCredentials → DriveAuthError immediately", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(makeGaxiosError(403, ["invalidCredentials"]));
    await expect(
      withDriveRetry(fn, { maxAttempts: 4, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("403 unknown reason → rethrows original immediately (no retry)", async () => {
    const original = makeGaxiosError(403, ["notTheAppsDrive"]);
    const fn = vi.fn().mockRejectedValue(original);
    await expect(
      withDriveRetry(fn, { maxAttempts: 4, baseDelayMs: 0 }),
    ).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("404 → DriveNotFoundError after 3 attempts (eventual consistency cap)", async () => {
    const fn = vi.fn().mockRejectedValue(makeGaxiosError(404));
    await expect(
      withDriveRetry(fn, { maxAttempts: 10, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveNotFoundError);
    // Cap is min(maxAttempts, 3)
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("500 → retries maxAttempts times then rethrows original", async () => {
    const original = makeGaxiosError(500);
    const fn = vi.fn().mockRejectedValue(original);
    await expect(
      withDriveRetry(fn, { maxAttempts: 3, baseDelayMs: 0 }),
    ).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("503 → retries maxAttempts times then rethrows original", async () => {
    const original = makeGaxiosError(503);
    const fn = vi.fn().mockRejectedValue(original);
    await expect(
      withDriveRetry(fn, { maxAttempts: 2, baseDelayMs: 0 }),
    ).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("non-HTTP error (e.g. network) → rethrows immediately", async () => {
    const networkErr = new TypeError("fetch failed");
    const fn = vi.fn().mockRejectedValue(networkErr);
    await expect(
      withDriveRetry(fn, { maxAttempts: 4, baseDelayMs: 0 }),
    ).rejects.toBe(networkErr);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds on second attempt after transient 503", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeGaxiosError(503))
      .mockResolvedValueOnce("ok");
    const result = await withDriveRetry(fn, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("nested response.data.error.errors[] is also parsed for reasons", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(makeNestedGaxiosError(403, ["storageQuotaExceeded"]));
    await expect(
      withDriveRetry(fn, { maxAttempts: 4, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveQuotaError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds immediately (no error) → called exactly once", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await withDriveRetry(fn, { maxAttempts: 4, baseDelayMs: 0 });
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotency key format — crypto.randomUUID() is a v4 UUID
// ---------------------------------------------------------------------------

describe("@phase-2 idempotency key format", () => {
  it("crypto.randomUUID() produces a v4 UUID string", () => {
    const key = crypto.randomUUID();
    // v4 UUID: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("crypto.randomUUID() produces unique keys on each call", () => {
    const keys = new Set(Array.from({ length: 20 }, () => crypto.randomUUID()));
    expect(keys.size).toBe(20);
  });
});
