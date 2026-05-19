import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsFileStorage } from "$lib/server/files/local-fs-impl.js";

describe("LocalFsFileStorage", () => {
  let root: string;
  let storage: LocalFsFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "fdw-localfs-"));
    storage = new LocalFsFileStorage({ root });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("uploads and downloads a file round-trip", async () => {
    const payload = new TextEncoder().encode("hello world");
    const { id, viewUrl } = await storage.upload({
      buffer: payload,
      mimeType: "text/plain",
      name: "greeting.txt",
      idempotencyKey: "key-1",
    });

    expect(id).toMatch(/^[A-Za-z0-9_:-]+$/);
    expect(viewUrl).toContain(id);

    const downloaded = await storage.download(id);
    expect(new TextDecoder().decode(downloaded)).toBe("hello world");
  });

  it("is idempotent: same idempotencyKey returns same id", async () => {
    const buf = new TextEncoder().encode("x");
    const a = await storage.upload({
      buffer: buf,
      mimeType: "text/plain",
      name: "a.txt",
      idempotencyKey: "same",
    });
    const b = await storage.upload({
      buffer: buf,
      mimeType: "text/plain",
      name: "a.txt",
      idempotencyKey: "same",
    });
    expect(a.id).toBe(b.id);
  });

  it("rejects ids with path traversal characters", async () => {
    await expect(storage.download("../etc/passwd")).rejects.toThrow();
  });

  it("throws on download of missing file", async () => {
    await expect(storage.download("nonexistent")).rejects.toThrow();
  });

  it("archive moves the file into a folder subdir", async () => {
    const buf = new TextEncoder().encode("y");
    const { id } = await storage.upload({
      buffer: buf,
      mimeType: "text/plain",
      name: "y.txt",
      idempotencyKey: "y",
    });
    await storage.archive(id, "archived-2026");
    const got = await storage.download(id);
    expect(new TextDecoder().decode(got)).toBe("y");
  });

  it("delete removes the file", async () => {
    const buf = new TextEncoder().encode("z");
    const { id } = await storage.upload({
      buffer: buf,
      mimeType: "text/plain",
      name: "z.txt",
      idempotencyKey: "z",
    });
    await storage.delete(id);
    await expect(storage.download(id)).rejects.toThrow();
  });
});
