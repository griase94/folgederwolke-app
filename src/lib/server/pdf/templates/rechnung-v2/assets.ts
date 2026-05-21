/**
 * Phase 10 — Rechnung v2 image asset loading.
 *
 * Loads the brand PNGs (logo + 4 footer icons) via SvelteKit `read()`. See
 * fonts.ts for the rationale (static-import URLs are traceable by
 * @vercel/nft; dynamic `readFile(join(...))` is not).
 *
 * Bytes are memoised per-process. Each PDF render embeds them per-document
 * because pdf-lib PDFImage instances are tied to a specific PDFDocument.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { read } from "$app/server";

import logoUrl from "./assets/logo-cloud.png?url";
import iconHouseUrl from "./assets/icon-house.png?url";
import iconContactUrl from "./assets/icon-contact.png?url";
import iconBankUrl from "./assets/icon-bank.png?url";
import iconPersonUrl from "./assets/icon-person.png?url";

export interface RechnungAssetBytes {
  logoCloud: Uint8Array;
  iconHouse: Uint8Array;
  iconContact: Uint8Array;
  iconBank: Uint8Array;
  iconPerson: Uint8Array;
}

let cache: RechnungAssetBytes | null = null;

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "assets");

const URL_TO_FILENAME: Record<string, string> = {
  [logoUrl]: "logo-cloud.png",
  [iconHouseUrl]: "icon-house.png",
  [iconContactUrl]: "icon-contact.png",
  [iconBankUrl]: "icon-bank.png",
  [iconPersonUrl]: "icon-person.png",
};

async function readAsset(url: string): Promise<Uint8Array> {
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

export async function loadAssetBytes(): Promise<RechnungAssetBytes> {
  if (cache) return cache;
  const [logoCloud, iconHouse, iconContact, iconBank, iconPerson] =
    await Promise.all([
      readAsset(logoUrl),
      readAsset(iconHouseUrl),
      readAsset(iconContactUrl),
      readAsset(iconBankUrl),
      readAsset(iconPersonUrl),
    ]);
  cache = { logoCloud, iconHouse, iconContact, iconBank, iconPerson };
  return cache;
}
