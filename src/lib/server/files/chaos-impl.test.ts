import { describe, it, expect } from "vitest";
import { InMemoryMockFileStorage } from "./in-memory-mock-impl.js";
import { ChaosFileStorage } from "./chaos-impl.js";

describe("ChaosFileStorage", () => {
  it("failNextUpload(2) throws twice then passes", async () => {
    const chaos = new ChaosFileStorage(new InMemoryMockFileStorage());
    chaos.failNextUpload(2);
    for (let i = 0; i < 2; i++) {
      await expect(
        chaos.upload({
          buffer: new Uint8Array([1]),
          mimeType: "application/pdf",
          pathname: `belege/2026/x${i}.pdf`,
        }),
      ).rejects.toThrow(/CHAOS/);
    }
    await chaos.upload({
      buffer: new Uint8Array([1]),
      mimeType: "application/pdf",
      pathname: "belege/2026/ok.pdf",
    });
    expect(await chaos.download("belege/2026/ok.pdf")).toEqual(
      new Uint8Array([1]),
    );
  });
  it("failNextDownload(1) throws once", async () => {
    const inner = new InMemoryMockFileStorage();
    await inner.upload({
      buffer: new Uint8Array([1]),
      mimeType: "application/pdf",
      pathname: "belege/2026/a.pdf",
    });
    const chaos = new ChaosFileStorage(inner);
    chaos.failNextDownload(1);
    await expect(chaos.download("belege/2026/a.pdf")).rejects.toThrow(/CHAOS/);
    expect(await chaos.download("belege/2026/a.pdf")).toEqual(
      new Uint8Array([1]),
    );
  });
  it("forwards _internalDelByPath + _internalList to inner (transparent for tests)", async () => {
    const inner = new InMemoryMockFileStorage();
    await inner.upload({
      buffer: new Uint8Array([1]),
      mimeType: "application/pdf",
      pathname: "belege/2026/a.pdf",
    });
    const chaos = new ChaosFileStorage(inner);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await (chaos as any)._internalList();
    expect(list.blobs.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (chaos as any)._internalDelByPath("belege/2026/a.pdf");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list2 = await (chaos as any)._internalList();
    expect(list2.blobs.length).toBe(0);
  });
});
