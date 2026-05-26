/**
 * Phase 10 — Rechnung v2 font loading.
 *
 * Loads Anton + DejaVu Sans (regular / bold / oblique) TTF bytes into
 * Uint8Arrays once per process and memoises them. Per-PDF `embedFont` is
 * still called by the renderer because pdf-lib Font instances are bound
 * to a specific PDFDocument.
 *
 * Path resolution strategy:
 * 1. Try SvelteKit's `read()` from `$app/server` with a `?url` import.
 *    On Vercel this is the supported asset-bundling channel — @vercel/nft
 *    follows the static-import URL and copies the file into the function
 *    output automatically. (Dynamic `readFile(join(...))` paths cannot be
 *    statically traced and would be missing from the bundle.)
 * 2. Fall back to `node:fs/promises` against the on-disk asset directory,
 *    resolved via `import.meta.url`. Used by vitest unit tests and by the
 *    fixture-render script that runs outside the SvelteKit runtime.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Vite resolves these `?url` imports to bundle-safe URLs at build time.
// In bare Node (vitest / scripts), the import returns the literal source
// path, which we fall through to read directly.
import antonUrl from "./assets/anton-regular.ttf?url";
import bebasUrl from "./assets/bebas-neue-regular.ttf?url";
import dejavuUrl from "./assets/dejavu-sans.ttf?url";
import dejavuBoldUrl from "./assets/dejavu-sans-bold.ttf?url";
import dejavuObliqueUrl from "./assets/dejavu-sans-oblique.ttf?url";

export interface RechnungFontBytes {
  anton: Uint8Array;
  bebas: Uint8Array;
  dejavu: Uint8Array;
  dejavuBold: Uint8Array;
  dejavuOblique: Uint8Array;
}

let cache: RechnungFontBytes | null = null;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "assets");

const URL_TO_FILENAME: Record<string, string> = {
  [antonUrl]: "anton-regular.ttf",
  [bebasUrl]: "bebas-neue-regular.ttf",
  [dejavuUrl]: "dejavu-sans.ttf",
  [dejavuBoldUrl]: "dejavu-sans-bold.ttf",
  [dejavuObliqueUrl]: "dejavu-sans-oblique.ttf",
};

async function tryReadViaSvelteKit(url: string): Promise<Uint8Array | null> {
  try {
    // Dynamic import so bare Node / vitest never tries to resolve $app/server.
    const mod = (await import("$app/server")) as {
      read?: (asset: string) => Response;
    };
    if (!mod.read) return null;
    const res = mod.read(url);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function readAsset(url: string): Promise<Uint8Array> {
  const viaKit = await tryReadViaSvelteKit(url);
  if (viaKit) return viaKit;
  const filename = URL_TO_FILENAME[url] ?? url.split("/").pop() ?? "";
  const bytes = await readFile(join(ASSETS, filename));
  return new Uint8Array(bytes);
}

export async function loadFontBytes(): Promise<RechnungFontBytes> {
  if (cache) return cache;
  const [anton, bebas, dejavu, dejavuBold, dejavuOblique] = await Promise.all([
    readAsset(antonUrl),
    readAsset(bebasUrl),
    readAsset(dejavuUrl),
    readAsset(dejavuBoldUrl),
    readAsset(dejavuObliqueUrl),
  ]);
  cache = { anton, bebas, dejavu, dejavuBold, dejavuOblique };
  return cache;
}
