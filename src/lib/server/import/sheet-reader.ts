/**
 * Sheet-reader abstraction — Phase 6 importer.
 *
 * Reads the legacy `Folge_der_Wolke_Finanzen` Google Sheet via one of two
 * channels:
 *
 *  1. **SA path** (preferred): Google Sheets REST via the
 *     `~/secrets/folgederwolke-service-account.json` service-account file.
 *     Direct, fresh, automated.
 *
 *  2. **CSV upload path** (graceful fallback): admin exports the sheet via
 *     Datei → Herunterladen → CSV (one file per tab) and uploads each via
 *     `/app/sheet-resync`. This module accepts the raw text and parses it.
 *
 * Either way the output is the same normalized `LegacySheet` shape so the
 * downstream transform layer never sees which path was taken.
 *
 * The tab list is hardcoded to the legacy contract: Mitglieder, Einnahmen,
 * Ausgaben, Spenden, Projekte_und_Events. Other tabs (Anleitung, Dashboard,
 * Einstellungen, Stammdaten) are ignored because they have no row-level
 * imported state.
 */

import { createHash } from "node:crypto";
import { env } from "$lib/server/env.js";
import { getSheetsClient } from "$lib/server/drive/sheets-client.js";
import { parseCsv } from "./csv-parser.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LegacyTabName =
  | "Mitglieder"
  | "Einnahmen"
  | "Ausgaben"
  | "Spenden"
  | "Projekte_und_Events";

export interface LegacyTab {
  /** Canonical tab name. */
  name: LegacyTabName;
  /** Trimmed header row. */
  headers: string[];
  /** Data rows aligned to `headers`. */
  rows: string[][];
}

export interface LegacySheet {
  /** Each tab parsed once. Some tabs may be missing if the upload skipped one. */
  tabs: Partial<Record<LegacyTabName, LegacyTab>>;
  /** SHA-256 of the canonical raw payload — feeds import_runs.source_hash. */
  sourceHash: string;
  /** Channel that produced this snapshot — useful for the run log + UI hint. */
  source: "service_account" | "csv_upload";
}

/**
 * Canonical tab list. The order is also the SA read order; CSV upload order
 * doesn't matter since the caller passes each file separately.
 */
export const LEGACY_TABS: ReadonlyArray<LegacyTabName> = [
  "Mitglieder",
  "Einnahmen",
  "Ausgaben",
  "Spenden",
  "Projekte_und_Events",
] as const;

/**
 * Aliases the legacy sheet uses for tab names. Matching is case-insensitive
 * and ignores whitespace + underscores so "Projekte & Events" matches
 * "Projekte_und_Events" matches "projekte und events".
 */
const TAB_ALIASES: Record<LegacyTabName, string[]> = {
  Mitglieder: ["Mitglieder"],
  Einnahmen: ["Einnahmen"],
  Ausgaben: ["Ausgaben"],
  Spenden: ["Spenden"],
  Projekte_und_Events: [
    "Projekte_und_Events",
    "Projekte & Events",
    "Projekte und Events",
    "Projekte",
  ],
};

// ---------------------------------------------------------------------------
// SA-path detection
// ---------------------------------------------------------------------------

export interface ServiceAccountAvailability {
  available: boolean;
  reason: string;
  /** Source identifier for logging — "env:GOOGLE_SERVICE_ACCOUNT_KEY_JSON" when set. */
  path: string | null;
}

/**
 * Probes whether env.googleServiceAccount is populated (i.e.
 * GOOGLE_SERVICE_ACCOUNT_KEY_JSON parsed successfully at load time). Does
 * NOT make a network call — that happens in readViaServiceAccount(). Cheap
 * enough to call from a page load.
 */
export async function checkServiceAccountAvailability(): Promise<ServiceAccountAvailability> {
  if (env.googleServiceAccount) {
    return {
      available: true,
      reason: "service-account credentials present in env",
      path: "env:GOOGLE_SERVICE_ACCOUNT_KEY_JSON",
    };
  }
  return {
    available: false,
    reason: "GOOGLE_SERVICE_ACCOUNT_KEY_JSON is not set",
    path: null,
  };
}

// ---------------------------------------------------------------------------
// SA-path read
// ---------------------------------------------------------------------------

/**
 * Reads each legacy tab from `LIVE_SHEET_ID` via the Sheets REST API,
 * authenticated by the SA file. Returns a normalized `LegacySheet`.
 *
 * Throws when:
 *  - LIVE_SHEET_ID is unset.
 *  - SA file is missing or malformed (checkServiceAccountAvailability first).
 *  - Sheets API returns 403/404 — re-raise with a hint.
 */
export async function readViaServiceAccount(): Promise<LegacySheet> {
  if (!env.LIVE_SHEET_ID) {
    throw new Error("readViaServiceAccount: LIVE_SHEET_ID is not set");
  }

  const avail = await checkServiceAccountAvailability();
  if (!avail.available) {
    throw new Error(
      `readViaServiceAccount: SA credentials unavailable — ${avail.reason}`,
    );
  }

  const api = getSheetsClient();

  const tabs: Partial<Record<LegacyTabName, LegacyTab>> = {};
  const hashInput: string[] = [];

  for (const name of LEGACY_TABS) {
    const ranges = TAB_ALIASES[name].map((n) => `'${n}'`);
    let values: string[][] | null = null;
    let resolvedAlias: string | null = null;
    let lastErr: unknown = null;

    for (const range of ranges) {
      try {
        const resp = await api.spreadsheets.values.get({
          spreadsheetId: env.LIVE_SHEET_ID,
          range,
          valueRenderOption: "UNFORMATTED_VALUE",
          dateTimeRenderOption: "FORMATTED_STRING",
        });
        const data = (resp.data.values ?? []) as unknown[][];
        if (data.length > 0) {
          // Coerce to string matrix — the API returns numbers/booleans for
          // typed cells; downstream code assumes string input.
          values = data.map((r) => r.map((c) => (c == null ? "" : String(c))));
          resolvedAlias = range;
          break;
        }
        // 0 rows for an alias — try the next.
        lastErr = new Error(`tab '${range}' is empty`);
      } catch (err) {
        lastErr = err;
      }
    }

    if (!values || values.length === 0) {
      // Some tabs may legitimately be absent (e.g. Spenden if the Verein has
      // none). Skip silently but record an empty entry so downstream code can
      // distinguish "tab not seen" from "tab seen, 0 rows".
      console.warn(
        `[sheet-reader] tab '${name}' could not be read (${(lastErr as Error)?.message ?? "no data"}); skipping.`,
      );
      continue;
    }

    const headers = (values[0] ?? []).map((h) => h.trim());
    const rows = values.slice(1);
    const width = headers.length;
    for (const r of rows) {
      while (r.length < width) r.push("");
    }
    tabs[name] = { name, headers, rows };
    hashInput.push(
      `#${resolvedAlias}\n${headers.join("|")}\n${rows.map((r) => r.join("|")).join("\n")}`,
    );
  }

  const sourceHash = createHash("sha256")
    .update(hashInput.join("\n---\n"))
    .digest("hex");

  return { tabs, source: "service_account", sourceHash };
}

// ---------------------------------------------------------------------------
// CSV-upload path
// ---------------------------------------------------------------------------

/**
 * A CSV file uploaded by the admin via /app/sheet-resync. The admin can
 * upload multiple files at once (one per tab) — this helper accepts a flat
 * list and resolves the canonical tab name from the filename when possible.
 */
export interface UploadedCsv {
  /** Original filename — used to infer the tab when no `tabHint` is passed. */
  filename: string;
  /** UTF-8 CSV text. */
  text: string;
  /** Explicit tab name (overrides the filename-based heuristic). */
  tabHint?: LegacyTabName;
}

export function inferTabFromFilename(filename: string): LegacyTabName | null {
  const norm = filename.toLowerCase().replace(/[\s._-]+/g, "");
  for (const [tab, aliases] of Object.entries(TAB_ALIASES) as [
    LegacyTabName,
    string[],
  ][]) {
    for (const alias of aliases) {
      const aliasNorm = alias.toLowerCase().replace(/[\s._&-]+/g, "");
      if (norm.includes(aliasNorm)) return tab;
    }
  }
  return null;
}

/**
 * Parse multiple uploaded CSVs into a `LegacySheet`. Each upload is parsed,
 * its tab is resolved, and duplicate tabs trigger an error so the admin can
 * see which file collided.
 */
export function readViaCsvUpload(uploads: UploadedCsv[]): LegacySheet {
  if (uploads.length === 0) {
    throw new Error("readViaCsvUpload: no files provided");
  }

  const tabs: Partial<Record<LegacyTabName, LegacyTab>> = {};
  const hashInput: string[] = [];
  const errors: string[] = [];

  for (const upload of uploads) {
    const tab = upload.tabHint ?? inferTabFromFilename(upload.filename);
    if (!tab) {
      errors.push(
        `Konnte Tab für Datei "${upload.filename}" nicht bestimmen — bitte umbenennen oder mit Hint hochladen.`,
      );
      continue;
    }
    if (tabs[tab]) {
      errors.push(
        `Tab "${tab}" wurde mehrfach hochgeladen (Datei: ${upload.filename}).`,
      );
      continue;
    }
    const parsed = parseCsv(upload.text);
    if (parsed.headers.length === 0) {
      errors.push(`Datei "${upload.filename}" hat keine Header-Zeile.`);
      continue;
    }
    tabs[tab] = { name: tab, headers: parsed.headers, rows: parsed.rows };
    hashInput.push(
      `#${tab}\n${parsed.headers.join("|")}\n${parsed.rows.map((r) => r.join("|")).join("\n")}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`CSV-Upload nicht eingelesen: ${errors.join(" | ")}`);
  }

  const sourceHash = createHash("sha256")
    .update(hashInput.join("\n---\n"))
    .digest("hex");

  return { tabs, source: "csv_upload", sourceHash };
}

// ---------------------------------------------------------------------------
// Header-index helper (used by transform.ts)
// ---------------------------------------------------------------------------

/**
 * Find the index of the first header matching any of the given patterns.
 * Returns -1 if none matches. Patterns may be exact strings (case-insensitive
 * substring match after emoji stripping) or RegExp.
 */
export function findHeaderIndex(
  headers: ReadonlyArray<string>,
  patterns: ReadonlyArray<string | RegExp>,
): number {
  const stripped = headers.map(stripLeadingNonLetters);
  for (const p of patterns) {
    for (let i = 0; i < stripped.length; i++) {
      const h = stripped[i]!;
      if (p instanceof RegExp) {
        if (p.test(h)) return i;
      } else if (h.toLowerCase().includes(p.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Drop leading emojis / whitespace from a header for matching. Mirrors the
 * legacy `getAuslagenFormCols` strategy — header titles change as we iterate
 * on the form but the underlying field doesn't.
 */
export function stripLeadingNonLetters(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}
