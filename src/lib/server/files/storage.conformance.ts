/**
 * FileStorage v2 conformance suite — Phase 9.
 *
 * Each FileStorage implementation re-uses this parameterized suite to
 * guarantee identical byte-equality and error semantics across backends.
 * Filename intentionally does NOT end in `.test.ts` so Vitest does not
 * auto-discover it; callers (`local-fs-impl.test.ts`,
 * `in-memory-mock-impl.test.ts`) opt in by importing
 * `runConformanceSuite` and passing a factory.
 */

import { describe, expect, it } from "vitest";
import {
  StorageDuplicateError,
  StorageImmutabilityError,
  StorageInvalidError,
  StorageNotFoundError,
} from "./errors.js";
import type { FileStorage } from "./storage.js";

export function runConformanceSuite(
  name: string,
  makeStorage: () => FileStorage,
): void {
  describe(`FileStorage conformance: ${name}`, () => {
    function fresh(): FileStorage {
      return makeStorage();
    }

    it("round-trip bytes (byte-equal)", async () => {
      const s = fresh();
      const bytes = new TextEncoder().encode("hello world");
      const path = `belege/2026/test-${crypto.randomUUID()}.pdf`;
      await s.upload({
        buffer: bytes,
        mimeType: "application/pdf",
        pathname: path,
      });
      expect(await s.download(path)).toEqual(bytes);
    });

    it("1-byte file round-trips", async () => {
      const s = fresh();
      const bytes = new Uint8Array([42]);
      const path = `belege/2026/onebyte-${crypto.randomUUID()}.pdf`;
      await s.upload({
        buffer: bytes,
        mimeType: "application/pdf",
        pathname: path,
      });
      expect(await s.download(path)).toEqual(bytes);
    });

    it("empty buffer rejected", async () => {
      const s = fresh();
      await expect(
        s.upload({
          buffer: new Uint8Array(0),
          mimeType: "application/pdf",
          pathname: `belege/2026/empty-${crypto.randomUUID()}.pdf`,
        }),
      ).rejects.toThrow(StorageInvalidError);
    });

    it("path traversal rejected", async () => {
      const s = fresh();
      for (const bad of [
        "../etc/passwd",
        "belege/2026/../../x.pdf",
        "belege/2026/x\0.pdf",
        "/etc/passwd",
        "belege//2026/x.pdf",
      ]) {
        await expect(
          s.upload({
            buffer: new Uint8Array([1]),
            mimeType: "application/pdf",
            pathname: bad,
          }),
        ).rejects.toThrow(StorageInvalidError);
      }
    });

    it("reserved-prefix writes rejected (archived/)", async () => {
      const s = fresh();
      await expect(
        s.upload({
          buffer: new Uint8Array([1]),
          mimeType: "application/pdf",
          pathname: `archived/belege/2024/${crypto.randomUUID()}.pdf`,
        }),
      ).rejects.toThrow(StorageImmutabilityError);
    });

    it("reserved-prefix writes rejected (quarantine/)", async () => {
      const s = fresh();
      await expect(
        s.upload({
          buffer: new Uint8Array([1]),
          mimeType: "application/pdf",
          pathname: `quarantine/belege/2024/${crypto.randomUUID()}.pdf`,
        }),
      ).rejects.toThrow(StorageImmutabilityError);
    });

    it("reserved-prefix writes rejected (tmp/)", async () => {
      const s = fresh();
      await expect(
        s.upload({
          buffer: new Uint8Array([1]),
          mimeType: "application/pdf",
          pathname: `tmp/${crypto.randomUUID()}.pdf`,
        }),
      ).rejects.toThrow(StorageImmutabilityError);
    });

    it("duplicate pathname rejected", async () => {
      const s = fresh();
      const path = `belege/2026/dupe-${crypto.randomUUID()}.pdf`;
      await s.upload({
        buffer: new Uint8Array([1]),
        mimeType: "application/pdf",
        pathname: path,
      });
      await expect(
        s.upload({
          buffer: new Uint8Array([1]),
          mimeType: "application/pdf",
          pathname: path,
        }),
      ).rejects.toThrow(StorageDuplicateError);
    });

    it("download(missing) throws not-found", async () => {
      const s = fresh();
      await expect(
        s.download(`belege/2026/nope-${crypto.randomUUID()}.pdf`),
      ).rejects.toThrow(StorageNotFoundError);
    });

    it("archive moves to archived/ preserving bytes", async () => {
      const s = fresh();
      const bytes = new TextEncoder().encode("archived content");
      const path = `belege/2025/test-${crypto.randomUUID()}.pdf`;
      await s.upload({
        buffer: bytes,
        mimeType: "application/pdf",
        pathname: path,
      });
      const { newPathname } = await s.archive(path, 2025);
      expect(newPathname).toBe(`archived/${path}`);
      expect(await s.download(newPathname)).toEqual(bytes);
      await expect(s.download(path)).rejects.toThrow(StorageNotFoundError);
    });

    it("archive of already-archived path rejected", async () => {
      const s = fresh();
      const path = `belege/2025/idem-${crypto.randomUUID()}.pdf`;
      await s.upload({
        buffer: new Uint8Array([1]),
        mimeType: "application/pdf",
        pathname: path,
      });
      const r1 = await s.archive(path, 2025);
      await expect(s.archive(r1.newPathname, 2025)).rejects.toThrow(
        StorageImmutabilityError,
      );
    });

    it("archive(missing) throws not-found", async () => {
      const s = fresh();
      await expect(
        s.archive(`belege/2025/missing-${crypto.randomUUID()}.pdf`, 2025),
      ).rejects.toThrow(StorageNotFoundError);
    });

    it("downloadStream round-trip byte-equal", async () => {
      const s = fresh();
      const bytes = new TextEncoder().encode(
        "stream test " + "x".repeat(10_000),
      );
      const path = `belege/2026/stream-${crypto.randomUUID()}.pdf`;
      await s.upload({
        buffer: bytes,
        mimeType: "application/pdf",
        pathname: path,
      });
      const stream = await s.downloadStream(path);
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as Uint8Array);
      }
      const total = new Uint8Array(
        chunks.reduce((sum, c) => sum + c.length, 0),
      );
      let o = 0;
      for (const c of chunks) {
        total.set(c, o);
        o += c.length;
      }
      expect(total).toEqual(bytes);
    });

    it("unicode pathname round-trips", async () => {
      const s = fresh();
      const bytes = new TextEncoder().encode("ü");
      const path = `belege/2026/umlaut-${crypto.randomUUID()}.pdf`;
      await s.upload({
        buffer: bytes,
        mimeType: "application/pdf",
        pathname: path,
      });
      expect(await s.download(path)).toEqual(bytes);
    });
  });
}
