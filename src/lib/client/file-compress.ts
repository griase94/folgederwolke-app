interface PdfWorkerHost {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (args: { data: Uint8Array }) => {
    promise: Promise<PdfDocument>;
  };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(args: {
    canvasContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }): { promise: Promise<void> };
  cleanup?: () => void;
}

const COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
const PDF_TEXT_RICH_THRESHOLD = 400;
const TARGET_DPI = 150;
const JPEG_QUALITY = 0.7;

// Guard: workerSrc is only set once across multiple calls to compressPdfIfScan.
let pdfjsWorkerSrcSet = false;

export interface CompressOptions {
  onProgress?: (info: {
    stage: "image" | "pdf";
    current: number;
    total: number;
  }) => void;
}

export function isPdfScanLikely(input: {
  size: number;
  firstPageTextLen: number;
}): boolean {
  return (
    input.size >= COMPRESS_THRESHOLD &&
    input.firstPageTextLen < PDF_TEXT_RICH_THRESHOLD
  );
}

export async function compressIfNeeded(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  try {
    if (
      file.type.startsWith("image/") ||
      file.type === "image/heic" ||
      file.type === "image/heif"
    ) {
      const { default: imageCompression } =
        await import("browser-image-compression");
      const compressed = await imageCompression(file, {
        maxSizeMB: 1.5,
        maxWidthOrHeight: 2400,
        useWebWorker: true,
        fileType: "image/jpeg",
      });
      opts.onProgress?.({ stage: "image", current: 1, total: 1 });
      return compressed.size < file.size ? compressed : file;
    }
    if (file.type === "application/pdf" && file.size > COMPRESS_THRESHOLD) {
      return compressPdfIfScan(file, opts);
    }
    return file;
  } catch (e) {
    console.warn("[file-compress] failed, using original:", e);
    return file;
  }
}

async function compressPdfIfScan(
  file: File,
  opts: CompressOptions,
): Promise<File> {
  // Lazy-load pdfjs-dist only when we actually need to process a PDF.
  // This keeps pdfjs out of the initial chunk for every route that imports
  // BelegUpload (including the public Auslage form). Mirror the pattern used
  // for browser-image-compression and pdf-lib above.
  const pdfjs = (await import("pdfjs-dist")) as unknown as PdfWorkerHost;
  if (!pdfjsWorkerSrcSet) {
    // Vite worker URL — use ?url suffix (NOT new URL trick which doesn't
    // resolve node_modules assets).
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
      .default as string;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    pdfjsWorkerSrcSet = true;
  }

  const { PDFDocument } = await import("pdf-lib");
  const buf = await file.arrayBuffer();
  const srcDoc: PdfDocument = await pdfjs.getDocument({
    data: new Uint8Array(buf),
  }).promise;

  const firstPage = await srcDoc.getPage(1);
  const firstText = await firstPage.getTextContent();
  const firstTextLen = firstText.items.reduce(
    (sum, it) => sum + (it.str?.length ?? 0),
    0,
  );

  if (!isPdfScanLikely({ size: file.size, firstPageTextLen: firstTextLen })) {
    await srcDoc.destroy();
    return file;
  }

  // iOS Safari 15 doesn't have OffscreenCanvas — fall back to original.
  if (typeof OffscreenCanvas === "undefined") {
    await srcDoc.destroy();
    return file;
  }

  const outDoc = await PDFDocument.create();
  const total = srcDoc.numPages;
  for (let i = 1; i <= total; i++) {
    opts.onProgress?.({ stage: "pdf", current: i, total });
    const page = await srcDoc.getPage(i);
    const viewport = page.getViewport({ scale: TARGET_DPI / 72 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: JPEG_QUALITY,
    });
    const jpgBytes = new Uint8Array(await blob.arrayBuffer());
    const jpg = await outDoc.embedJpg(jpgBytes);
    const newPage = outDoc.addPage([viewport.width, viewport.height]);
    newPage.drawImage(jpg, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
    page.cleanup?.();
  }
  await srcDoc.destroy();
  const bytes = await outDoc.save();
  const compressed = new File([bytes as BlobPart], file.name, {
    type: "application/pdf",
  });
  return compressed.size < file.size ? compressed : file;
}
