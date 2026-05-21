import { describe, it, expect, expectTypeOf } from "vitest";
import type { FileStorage } from "$lib/server/files/storage";
import { fileViewUrl, fileThumbnailUrl } from "$lib/server/files/storage";
import {
  StorageNotFoundError,
  StorageDuplicateError,
  StorageImmutabilityError,
  StorageNetworkError,
  StorageInvalidError,
} from "$lib/server/files/errors";

describe("FileStorage v2", () => {
  it("upload signature", () => {
    expectTypeOf<FileStorage["upload"]>().toEqualTypeOf<
      (args: {
        buffer: Uint8Array;
        mimeType: string;
        pathname: string;
      }) => Promise<{ etag: string }>
    >();
  });
  it("includes download / archive / downloadStream", () => {
    expectTypeOf<FileStorage>().toMatchTypeOf<{
      download: (p: string) => Promise<Uint8Array>;
      downloadStream: (p: string) => Promise<ReadableStream>;
      archive: (p: string, y: number) => Promise<{ newPathname: string }>;
    }>();
  });
  it("error classes carry codes", () => {
    expect(new StorageNotFoundError("x").code).toBe("STORAGE_NOT_FOUND");
    expect(new StorageDuplicateError("x").code).toBe("STORAGE_DUPLICATE");
    expect(new StorageImmutabilityError("x").code).toBe("STORAGE_IMMUTABLE");
    expect(new StorageInvalidError("x").code).toBe("STORAGE_INVALID");
    expect(new StorageNetworkError("x").code).toBe("STORAGE_NETWORK");
  });
  it("fileViewUrl + fileThumbnailUrl", () => {
    const id = "01900a32-1234-7000-8000-000000000001";
    expect(fileViewUrl(id)).toBe(`/api/files/${id}/blob`);
    expect(fileThumbnailUrl(id)).toBe(`/api/files/${id}/thumbnail`);
  });
});
