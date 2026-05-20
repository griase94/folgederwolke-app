import { describe, it, expect } from "vitest";
import { makeImageThumbnail } from "$lib/server/files/thumbnail";
import sharp from "sharp";

describe("makeImageThumbnail", () => {
  it("returns webp ≤ 25KB from a 1024×1024 source", async () => {
    const src = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 128, g: 200, b: 80 },
      },
    })
      .png()
      .toBuffer();
    const out = await makeImageThumbnail(new Uint8Array(src));
    expect(out.byteLength).toBeLessThan(25_000);
  });
});
