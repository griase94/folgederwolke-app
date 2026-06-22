/**
 * Robust CSV parser for legacy-sheet exports (Phase 6 importer).
 *
 * Handles the quirks that emerge from Google Sheets / Excel exports of the
 * Folge_der_Wolke_Finanzen workbook:
 *
 *  - UTF-8 BOM prefix on the first cell.
 *  - Quoted fields containing commas, newlines, and escaped double-quotes
 *    (`""` inside a quoted run = literal `"`).
 *  - CRLF and CR line endings normalized to LF.
 *  - German number locale on Betrag cells: `1.234,56`, `1234,56`, or the
 *    export-locale-agnostic `1234.56` — `parseGermanNumber` accepts all.
 *  - Date cells in either `dd.MM.yyyy`, `yyyy-MM-dd`, or ISO datetime form;
 *    `parseGermanDate` returns null when nothing matches.
 *
 * Intentionally minimal — no external deps, no streaming — because the legacy
 * sheet weighs in at <500 rows per tab. If a bigger import shows up, swap in
 * papaparse and keep this module as the row-shape normalizer.
 *
 * Multi-tab CSV bundles (the export-as-ZIP variant) are not handled here; the
 * caller (sheet-reader) feeds one tab at a time.
 */

export interface ParsedCsv {
  /** Header row (trimmed, BOM-stripped). */
  headers: string[];
  /** Data rows — each is an array aligned to `headers`. Missing trailing cells become "". */
  rows: string[][];
}

/**
 * Parse a CSV string into rows. Detects delimiter (`,`, `;`, `\t`) by sniffing
 * the first ~2KB — picks whichever produces the highest count outside of
 * quoted runs.
 */
export function parseCsv(input: string): ParsedCsv {
  if (!input) return { headers: [], rows: [] };

  // Strip BOM if present.
  let src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  // Normalize line endings to LF — quoted CRLFs in CSV are extremely unusual
  // and legacy export tooling already collapses them.
  src = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const delimiter = sniffDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  while (
    rows.length > 0 &&
    rows[rows.length - 1]!.every((c) => c.trim() === "")
  ) {
    rows.pop();
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0]!.map((h) => h.trim());
  const dataRows = rows.slice(1);

  // Pad short rows so column-index lookups are safe.
  const width = headers.length;
  for (const r of dataRows) {
    while (r.length < width) r.push("");
  }

  return { headers, rows: dataRows };
}

function sniffDelimiter(src: string): string {
  const sample = src.slice(0, 2048);
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQ = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === d) count++;
      else if (!inQ && ch === "\n") break;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Locale-aware value parsers
// ---------------------------------------------------------------------------

/**
 * Parse a number that may be in German or English locale.
 *
 * Accepts:
 *   "1.234,56"  → 1234.56
 *   "1234,56"   → 1234.56
 *   "1234.56"   → 1234.56
 *   "1,234.56"  → 1234.56  (English with thousands separator)
 *   "  42 EUR"  → 42
 *   ""          → null
 *
 * Logic: if BOTH `,` and `.` are present, the rightmost one is the decimal
 * separator. If only one is present AND has 1-2 trailing digits AND it is a
 * comma, treat as decimal. Otherwise drop as a thousands separator.
 */
export function parseGermanNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Strip currency / whitespace / non-breaking space.
  s = s.replace(/[€$£\s\u00a0]|EUR/gi, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1]!.length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    // Only dot: German thousands ("1.234" → 1234) ONLY when the whole string
    // matches the thousands shape (1-3 digits then ".ddd" groups). Otherwise
    // the dot is an English decimal ("12.50"). F30: the old code skipped this
    // check and let "1.234" parse as 1.234 → 123 cents (×1000 under-count).
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, "");
    }
    // else: dot is a decimal separator — leave as-is for Number().
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a number into integer cents. Returns null on un-parseable input.
 * Uses Math.round to avoid IEEE-754 drift on multiplication.
 */
export function parseCentsFromAnything(raw: unknown): number | null {
  const n = parseGermanNumber(raw);
  if (n === null) return null;
  return Math.round(n * 100);
}

/**
 * Parse a date cell. Accepts dd.MM.yyyy, yyyy-MM-dd, ISO datetime, or legacy
 * Apps Script Date.toString() output. Returns a UTC Date or null.
 */
export function parseGermanDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw : null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO 8601 (date or datetime) — let Date handle it.
  if (/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})?/.test(s)) {
    const d = new Date(s);
    if (Number.isFinite(d.getTime())) return d;
  }

  // dd.MM.yyyy [HH:MM[:SS]]
  const m =
    /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      s,
    );
  if (m) {
    let yyyy = parseInt(m[3]!, 10);
    if (yyyy < 100) yyyy += yyyy < 70 ? 2000 : 1900;
    const dd = parseInt(m[1]!, 10);
    const mm = parseInt(m[2]!, 10);
    const hh = m[4] ? parseInt(m[4], 10) : 0;
    const mi = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const d = new Date(yyyy, mm - 1, dd, hh, mi, ss);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const ts = Date.parse(s);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

/**
 * Convert a Date to a `YYYY-MM-DD` calendar-date string (no TZ shift).
 */
export function toIsoDate(d: Date | null): string | null {
  if (!d || !Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
