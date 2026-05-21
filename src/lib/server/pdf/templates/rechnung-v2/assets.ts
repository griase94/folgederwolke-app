/**
 * Phase 10 — Rechnung v2 image asset loading.
 *
 * Loads the brand PNGs (logo + 4 footer icons) once per process. See
 * fonts.ts for the dual-path rationale (SvelteKit `read()` first, plain
 * filesystem fallback for tests / scripts).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

async function tryReadViaSvelteKit(url: string): Promise<Uint8Array | null> {
  try {
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
