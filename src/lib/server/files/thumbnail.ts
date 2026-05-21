import sharp from "sharp";

/**
 * Server-side image thumbnail for the browse view. Resizes to 200×200 max
 * (preserves aspect ratio via `fit: "inside"`) and emits webp at quality 75.
 *
 * Caller is responsible for routing this only at upload time for raster
 * image MIMEs that sharp natively supports — HEIC/HEIF needs libvips
 * compiled with heif support which Vercel doesn't ship, so the caller
 * skips thumbnail generation for those.
 *
 * PDFs use a static SVG icon (static/icons/pdf-thumb.svg) served by the
 * /api/files/[id]/thumbnail route.
 */
export async function makeImageThumbnail(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const out = await sharp(Buffer.from(bytes))
    .resize(200, 200, { fit: "inside" })
    .webp({ quality: 75 })
    .toBuffer();
  return new Uint8Array(out);
}
