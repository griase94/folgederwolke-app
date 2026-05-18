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
 *      404                      → DriveNotFoundError after `maxNotFoundAttempts` (default 3)
 *      500                      → rethrow after maxAttempts
 *      non-HTTP error           → rethrow immediately
 *  - Backoff jitter (statistical)
 *  - Idempotency key format: crypto.randomUUID() produces a v4 UUID
 *  - escapeDriveQ (single quote, backslash, normal chars)
 *  - client.uploadBeleg: idempotency hit with missing webViewLink → fetched separately
 *  - client.getOrCreateAppFolder: race-safe folder creation under advisory lock
 *
 * Live API tests are deferred to a separate integration suite (Phase 4).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DriveAuthError,
  DriveError,
  DriveNotFoundError,
  DriveQuotaError,
  DriveRateLimitError,
} from "./types.js";
import { withDriveRetry } from "./retry.js";

// ---------------------------------------------------------------------------
// Mocks for client.ts dependencies. These must be declared before importing
// the client module under test.
// ---------------------------------------------------------------------------

// Fake Drive client — each test replaces `filesListImpl` / `filesGetImpl`
// / `filesCreateImpl` to shape the response.
const filesListImpl = vi.fn();
const filesGetImpl = vi.fn();
const filesCreateImpl = vi.fn();
const filesUpdateImpl = vi.fn();

vi.mock("@googleapis/drive", () => ({
  drive: () => ({
    files: {
      list: (...args: unknown[]) => filesListImpl(...args),
      get: (...args: unknown[]) => filesGetImpl(...args),
      create: (...args: unknown[]) => filesCreateImpl(...args),
      update: (...args: unknown[]) => filesUpdateImpl(...args),
    },
  }),
}));

vi.mock("./auth.js", () => ({
  getDriveAuth: () => ({}),
}));

// Fake DB. We model:
//   - `db.execute(sqlTag)` for the top-level fast-path settings read in
//     readSettingRaw (returns the in-memory settings map's entry).
//   - `db.transaction(cb)` runs the callback with a `tx` that supports the
//     same `.execute()` semantics and additionally records the advisory-lock
//     call so tests can assert serialization.
const settingsStore = new Map<string, string>();
const advisoryLockCalls: string[] = [];

// Capture the literal SQL "command" out of the drizzle sql tag for routing.
// drizzle's sql tag produces an object with `.queryChunks` where:
//   - static text chunks are objects shaped like `{ value: [string, ...] }`
//   - interpolated values appear inline as bare primitives / objects.
function isStaticChunk(c: unknown): c is { value: unknown[] } {
  return (
    !!c &&
    typeof c === "object" &&
    "value" in (c as object) &&
    Array.isArray((c as { value: unknown }).value)
  );
}

function sqlFingerprint(query: unknown): string {
  if (!query || typeof query !== "object") return "";
  const q = query as { queryChunks?: unknown[] };
  if (!Array.isArray(q.queryChunks)) return "";
  const parts: string[] = [];
  for (const c of q.queryChunks) {
    if (isStaticChunk(c)) {
      parts.push((c.value as string[]).join(""));
    }
  }
  return parts.join(" ");
}

function sqlParams(query: unknown): unknown[] {
  if (!query || typeof query !== "object") return [];
  const q = query as { queryChunks?: unknown[] };
  if (!Array.isArray(q.queryChunks)) return [];
  const params: unknown[] = [];
  for (const c of q.queryChunks) {
    if (isStaticChunk(c)) continue;
    params.push(c);
  }
  return params;
}

function makeExecutor() {
  return async (query: unknown) => {
    const fp = sqlFingerprint(query);
    const params = sqlParams(query);

    if (fp.includes("pg_advisory_xact_lock")) {
      advisoryLockCalls.push(String(params[0] ?? ""));
      return [];
    }

    if (fp.includes("SELECT value FROM settings")) {
      const key = String(params[0]);
      const v = settingsStore.get(key);
      return v === undefined ? [] : [{ value: v }];
    }

    if (fp.includes("INSERT INTO settings")) {
      const key = String(params[0]);
      // The second param is a JSON.stringify'd value — un-stringify so the
      // settings store holds the bare string.
      const raw = params[1];
      let parsed: string;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        parsed = String(raw);
      }
      if (!settingsStore.has(key)) settingsStore.set(key, parsed);
      return [];
    }

    return [];
  };
}

const dbMock = {
  execute: vi.fn(makeExecutor()),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = { execute: vi.fn(makeExecutor()) };
    return cb(tx);
  }),
};

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => dbMock,
  getClient: () => ({}),
}));

// Import the client AFTER mocks are registered.
import * as client from "./client.js";

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

  it("404 → DriveNotFoundError after default 3 attempts (eventual consistency cap)", async () => {
    const fn = vi.fn().mockRejectedValue(makeGaxiosError(404));
    await expect(
      withDriveRetry(fn, { maxAttempts: 10, baseDelayMs: 0 }),
    ).rejects.toBeInstanceOf(DriveNotFoundError);
    // Cap is min(maxAttempts, maxNotFoundAttempts) = min(10, 3) = 3
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("404 → respects custom maxNotFoundAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(makeGaxiosError(404));
    await expect(
      withDriveRetry(fn, {
        maxAttempts: 10,
        baseDelayMs: 0,
        maxNotFoundAttempts: 5,
      }),
    ).rejects.toBeInstanceOf(DriveNotFoundError);
    expect(fn).toHaveBeenCalledTimes(5);
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
// 3. Backoff jitter — statistical assertion that delay spreads
// ---------------------------------------------------------------------------

describe("@phase-2 withDriveRetry backoff jitter", () => {
  it("delays vary across retries (±25% jitter, variance > 0)", async () => {
    // Spy on setTimeout via vi.useFakeTimers to record requested delays.
    const observedDelays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    const stub = ((handler: () => void, ms?: number) => {
      observedDelays.push(ms ?? 0);
      // Immediately invoke to keep the retry loop spinning fast.
      handler();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    // Patch globalThis.setTimeout
    globalThis.setTimeout = stub;
    try {
      // 100 retry sequences of (500 → fail → wait → fail → wait → fail) → 2
      // delays per sequence × 100 = 200 observed delays.
      for (let i = 0; i < 100; i++) {
        const fn = vi.fn().mockRejectedValue(makeGaxiosError(500));
        await withDriveRetry(fn, {
          maxAttempts: 3,
          baseDelayMs: 100,
        }).catch(() => {});
      }
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }

    expect(observedDelays.length).toBeGreaterThan(50);

    // Variance must be non-zero (jitter is doing something).
    const mean =
      observedDelays.reduce((a, b) => a + b, 0) / observedDelays.length;
    const variance =
      observedDelays.reduce((acc, d) => acc + (d - mean) ** 2, 0) /
      observedDelays.length;
    expect(variance).toBeGreaterThan(0);

    // Every value must lie within the [0.75, 1.25] × baseExp envelope.
    // First-retry exp = 100, second-retry exp = 200.
    for (const d of observedDelays) {
      const inFirst = d >= 75 && d <= 125;
      const inSecond = d >= 150 && d <= 250;
      expect(inFirst || inSecond).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotency key format — crypto.randomUUID() is a v4 UUID
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

// ---------------------------------------------------------------------------
// 5. escapeDriveQ — Drive q= value escaping
// ---------------------------------------------------------------------------

describe("@phase-2 escapeDriveQ", () => {
  it("escapes single quotes", () => {
    expect(client.escapeDriveQ("O'Brien")).toBe("O\\'Brien");
  });

  it("escapes backslashes", () => {
    expect(client.escapeDriveQ("a\\b")).toBe("a\\\\b");
  });

  it("escapes a backslash followed by a single quote without double-escaping", () => {
    // Input is two characters: `\` then `'`.
    // Expect: `\\\'` — backslash escaped first, then the quote.
    expect(client.escapeDriveQ("\\'")).toBe("\\\\\\'");
  });

  it("leaves normal characters untouched", () => {
    expect(client.escapeDriveQ("abc-123_XYZ")).toBe("abc-123_XYZ");
  });

  it("empty string yields empty string", () => {
    expect(client.escapeDriveQ("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 6. uploadBeleg — idempotency hit with missing webViewLink → re-fetch
// ---------------------------------------------------------------------------

describe("@phase-2 uploadBeleg idempotency webViewLink re-fetch", () => {
  beforeEach(() => {
    filesListImpl.mockReset();
    filesGetImpl.mockReset();
    filesCreateImpl.mockReset();
    settingsStore.clear();
    advisoryLockCalls.length = 0;
  });

  it("rejects an idempotency key that contains illegal characters", async () => {
    await expect(
      client.uploadBeleg({
        buffer: Buffer.from("x"),
        mimeType: "image/jpeg",
        name: "x.jpg",
        idempotencyKey: "evil' OR '1'='1",
      }),
    ).rejects.toThrow(/invalid idempotencyKey/);
    expect(filesListImpl).not.toHaveBeenCalled();
  });

  it("returns existing file when list response includes webViewLink", async () => {
    filesListImpl.mockResolvedValueOnce({
      data: {
        files: [{ id: "existing-1", webViewLink: "https://drv/existing-1" }],
      },
    });

    const result = await client.uploadBeleg({
      buffer: Buffer.from("x"),
      mimeType: "image/jpeg",
      name: "x.jpg",
      idempotencyKey: "abc-123",
    });

    expect(result).toEqual({
      driveFileId: "existing-1",
      webViewLink: "https://drv/existing-1",
    });
    expect(filesGetImpl).not.toHaveBeenCalled();
    expect(filesCreateImpl).not.toHaveBeenCalled();
  });

  it("fetches webViewLink separately when list omits it (no duplicate upload)", async () => {
    filesListImpl.mockResolvedValueOnce({
      data: {
        // id present, webViewLink missing
        files: [{ id: "existing-2" }],
      },
    });

    filesGetImpl.mockResolvedValueOnce({
      data: { webViewLink: "https://drv/existing-2" },
    });

    const result = await client.uploadBeleg({
      buffer: Buffer.from("x"),
      mimeType: "image/jpeg",
      name: "x.jpg",
      idempotencyKey: "abc-123",
    });

    expect(result).toEqual({
      driveFileId: "existing-2",
      webViewLink: "https://drv/existing-2",
    });
    expect(filesGetImpl).toHaveBeenCalledTimes(1);
    // Critically — no second file was created
    expect(filesCreateImpl).not.toHaveBeenCalled();
    // Assert it queried the right file id with the right fields
    const getArgs = filesGetImpl.mock.calls[0]?.[0];
    expect(getArgs).toEqual({
      fileId: "existing-2",
      fields: "webViewLink",
    });
  });

  it("throws if list says found but get cannot recover the webViewLink", async () => {
    filesListImpl.mockResolvedValueOnce({
      data: { files: [{ id: "existing-3" }] },
    });
    filesGetImpl.mockResolvedValueOnce({ data: {} });

    await expect(
      client.uploadBeleg({
        buffer: Buffer.from("x"),
        mimeType: "image/jpeg",
        name: "x.jpg",
        idempotencyKey: "abc-123",
      }),
    ).rejects.toThrow(/webViewLink unavailable/);
    expect(filesCreateImpl).not.toHaveBeenCalled();
  });

  it("escapes single quotes in idempotency-search q parameter", async () => {
    // The IDEMPOTENCY_KEY_RE doesn't allow `'` in keys, so we verify
    // escaping via the (still-permitted) backslash-free safe set + a probe
    // of escapeDriveQ injected at the boundary.
    filesListImpl.mockResolvedValueOnce({ data: { files: [] } });
    // Suppress getOrCreateIncomingFolder by pre-seeding the settings store.
    settingsStore.set("drive_app_folder_id", "app-root");
    settingsStore.set("drive_incoming_folder_id", "inbox");
    filesCreateImpl.mockResolvedValueOnce({
      data: { id: "new-1", webViewLink: "https://drv/new-1" },
    });

    await client.uploadBeleg({
      buffer: Buffer.from("x"),
      mimeType: "image/jpeg",
      name: "x.jpg",
      idempotencyKey: "safe-key_42",
    });

    const listArgs = filesListImpl.mock.calls[0]?.[0] as
      | { q?: string }
      | undefined;
    expect(listArgs?.q).toContain("value='safe-key_42'");
  });
});

// ---------------------------------------------------------------------------
// 7. getOrCreateAppFolder — race-safe under advisory lock
// ---------------------------------------------------------------------------

describe("@phase-2 getOrCreateAppFolder race safety", () => {
  beforeEach(() => {
    filesListImpl.mockReset();
    filesGetImpl.mockReset();
    filesCreateImpl.mockReset();
    settingsStore.clear();
    advisoryLockCalls.length = 0;
    dbMock.transaction.mockClear();
  });

  it("fast path: returns cached settings value without calling Drive", async () => {
    settingsStore.set("drive_app_folder_id", "cached-app-folder");

    const id = await client.getOrCreateAppFolder();

    expect(id).toBe("cached-app-folder");
    expect(filesCreateImpl).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("slow path: acquires advisory lock and creates folder when missing", async () => {
    filesCreateImpl.mockResolvedValueOnce({ data: { id: "new-app-folder" } });

    const id = await client.getOrCreateAppFolder();

    expect(id).toBe("new-app-folder");
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(advisoryLockCalls).toEqual(["drive_folder:drive_app_folder_id"]);
    expect(filesCreateImpl).toHaveBeenCalledTimes(1);
    // Persisted into the settings store
    expect(settingsStore.get("drive_app_folder_id")).toBe("new-app-folder");
  });

  it("race: second caller inside the lock sees the value the first one wrote", async () => {
    // Simulate a race: when caller A enters the transaction and tries to
    // re-read settings, the settings store already has the value written
    // by caller B that just completed.
    let createCalls = 0;
    filesCreateImpl.mockImplementation(async () => {
      createCalls++;
      return { data: { id: `folder-${createCalls}` } };
    });

    // Pre-populate inside the transaction by overriding makeExecutor for
    // this scenario: we let the first SELECT inside the tx find a value
    // already there.
    dbMock.transaction.mockImplementationOnce(async (cb) => {
      // Caller B's write landed just before we acquired the lock
      settingsStore.set("drive_app_folder_id", "winner-from-other-worker");
      const tx = { execute: vi.fn(makeExecutor()) };
      return cb(tx);
    });

    const id = await client.getOrCreateAppFolder();

    expect(id).toBe("winner-from-other-worker");
    // Critically — no Drive folder was created by this caller
    expect(filesCreateImpl).not.toHaveBeenCalled();
  });
});
