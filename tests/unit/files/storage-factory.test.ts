/**
 * Factory tests for getFileStorage — verify the STORAGE_BACKEND env var
 * routes to the correct FileStorage implementation. Without these, the
 * factory could silently return the wrong backend after a refactor and
 * tests would still pass (because every backend implements the same
 * interface, and most call sites use the interface).
 *
 * The factory is module-cached, so each test resets module state with
 * vi.resetModules() before stubbing env vars and re-importing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getFileStorage factory", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns LocalFsFileStorage when STORAGE_BACKEND=local-fs", async () => {
    vi.stubEnv("STORAGE_BACKEND", "local-fs");
    vi.stubEnv("FILE_STORAGE_ROOT", "./.dev-data/drive-test");
    const { getFileStorage } = await import("$lib/server/files/storage.js");
    const s = await getFileStorage();
    const { LocalFsFileStorage } =
      await import("$lib/server/files/local-fs-impl.js");
    expect(s).toBeInstanceOf(LocalFsFileStorage);
    vi.unstubAllEnvs();
  });

  // Smoke-test the "drive" branch: actually invoking upload/download would
  // require Drive credentials, so we only verify the factory selects an impl
  // matching the FileStorage shape and doesn't throw on import.
  it("returns the Drive impl when STORAGE_BACKEND=drive (smoke)", async () => {
    vi.stubEnv("STORAGE_BACKEND", "drive");
    const { getFileStorage } = await import("$lib/server/files/storage.js");
    const s = await getFileStorage();
    expect(s).toBeDefined();
    expect(typeof s.upload).toBe("function");
    expect(typeof s.download).toBe("function");
    expect(typeof s.archive).toBe("function");
    expect(typeof s.delete).toBe("function");
    vi.unstubAllEnvs();
  });
});
