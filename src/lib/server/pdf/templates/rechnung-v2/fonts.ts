/**
 * Phase 10 — Rechnung v2 font loading.
 *
 * Uses SvelteKit's `read()` from `$app/server` to load the bundled TTF
 * binaries. `read()` reads an asset referenced via a static-import URL,
 * which is the SvelteKit-blessed way to ship binary assets in a serverless
 * function — `@vercel/nft` and the adapter's tracer both follow these URLs
 * and copy the file into the function bundle automatically. No dynamic path
 * construction (which `@vercel/nft` cannot statically trace).
 *
 * Bytes are memoised per-process. The actual `doc.embedFont(bytes)` call
 * is made per PDF because pdf-lib font instances are tied to a specific
 * PDFDocument.
 *
 * Notes:
 * - `?url` imports return the URL of the asset relative to the function
 *   root after build; Vite emits the file unchanged into the function bundle.
 * - In Node test runs (vitest) without SvelteKit's runtime, we fall back to
 *   `node:fs/promises` against the on-disk asset path.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { read } from "$app/server";

import antonUrl from "./assets/anton-regular.ttf?url";
import dejavuUrl from "./assets/dejavu-sans.ttf?url";
import dejavuBoldUrl from "./assets/dejavu-sans-bold.ttf?url";
import dejavuObliqueUrl from "./assets/dejavu-sans-oblique.ttf?url";

export interface RechnungFontBytes {
  anton: Uint8Array;
  dejavu: Uint8Array;
  dejavuBold: Uint8Array;
  dejavuOblique: Uint8Array;
}

let cache: RechnungFontBytes | null = null;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "assets");

const URL_TO_FILENAME: Record<string, string> = {
  [antonUrl]: "anton-regular.ttf",
  [dejavuUrl]: "dejavu-sans.ttf",
  [dejavuBoldUrl]: "dejavu-sans-bold.ttf",
  [dejavuObliqueUrl]: "dejavu-sans-oblique.ttf",
};

async function readAsset(url: string): Promise<Uint8Array> {
  // In SvelteKit runtime, use the asset reader.
  // In bare Node (vitest unit tests), fall back to reading from disk.
  try {
    const res = read(url);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    const filename = URL_TO_FILENAME[url] ?? url.split("/").pop() ?? "";
    const bytes = await readFile(join(ASSETS, filename));
    return new Uint8Array(bytes);
  }
}

export async function loadFontBytes(): Promise<RechnungFontBytes> {
  if (cache) return cache;
  const [anton, dejavu, dejavuBold, dejavuOblique] = await Promise.all([
    readAsset(antonUrl),
    readAsset(dejavuUrl),
    readAsset(dejavuBoldUrl),
    readAsset(dejavuObliqueUrl),
  ]);
  cache = { anton, dejavu, dejavuBold, dejavuOblique };
  return cache;
}
