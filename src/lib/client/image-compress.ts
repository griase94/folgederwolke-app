/**
 * Wrapper around browser-image-compression.
 * Target: 1600px max dimension, 0.8 quality, preserve EXIF orientation.
 * Returns the compressed File (or the original if it's already small enough).
 */

import imageCompression from "browser-image-compression";

const MAX_BELEG_BYTES = 10 * 1024 * 1024; // 10 MB

export interface CompressOptions {
  maxWidthOrHeight?: number;
  quality?: number;
}

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const { maxWidthOrHeight = 1600, quality = 0.8 } = opts;

  // Skip non-image types (PDF etc.)
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const compressed = await imageCompression(file, {
    maxWidthOrHeight,
    initialQuality: quality,
    useWebWorker: true,
    // Preserve EXIF orientation so the image renders upright.
    exifOrientation: -1,
  });

  // imageCompression returns a Blob; we need a File to carry the name.
  const result = new File([compressed], file.name, { type: compressed.type });

  // C5: Post-compression size guard
  if (result.size > MAX_BELEG_BYTES) {
    throw new Error(
      "Datei zu groß auch nach Komprimierung. Bitte kleineres Foto wählen.",
    );
  }

  return result;
}
