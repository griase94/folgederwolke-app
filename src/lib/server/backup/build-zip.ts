/**
 * Backup-Export ZIP builder.
 *
 * Streams a CSV-per-table dump of the application database plus a manifest
 * and README into a single ZIP archive. Connects as the read-only `app_export`
 * role (CLAUDE.md §4.5) on a separate connection so we do NOT route the read
 * through the CRUD-capable `app_runtime` pool.
 *
 * **NOT a replacement for the Festschreibung bundle.zip** — this is a
 * lossless technical read-snapshot without the year-close signature. The
 * Steuerberater-Übergabe still happens via `/jahresabschluss/<year>/export`.
 *
 * NIGHT-1 CONSTRAINT (P1-B3): in production on Neon, `app_export` is NOLOGIN
 * (Neon manages connection auth itself). The DATABASE_URL regex used below to
 * derive an app_export password fails in prod. For Night 1 this endpoint is
 * dev-only — the route in `+server.ts` returns 404 on `NODE_ENV=production`.
 * Production enablement requires Vercel-side per-route env injection of an
 * app_export password (Neon admin action), deferred to Night 3+.
 *
 * In dev/test, `scripts/db/grant-local-login.sh` runs
 *   ALTER ROLE app_export WITH LOGIN PASSWORD 'app_export'
 * so the regex-derived URL works locally.
 */

import JSZip from "jszip";
import postgres from "postgres";
import { env } from "$lib/server/env.js";

/**
 * Tables exported in the backup ZIP. Names match the physical Postgres table
 * names (drizzle schema files in src/lib/server/db/schema/). Order matters
 * only for the README — the manifest lists them in the same order.
 *
 * `income` + `expenses` are the two transaction tables in this codebase
 * (no unified `transactions` table; see drizzle schema).
 *
 * Buchhaltung-completeness additions (cycle 2):
 * - `member_beitrags` — Beitragspositionen per member per year (in members.ts)
 * - `donations` — separate donations table (donations.ts)
 * - `kategorien` — Buchungskategorien for income/expense rows (kategorien.ts)
 * - `audit_log` — Änderungshistorie / GoBD-adjacent (audit_log.ts)
 */
const TABLES = [
  "members",
  "member_beitrags",
  "projects",
  "customers",
  "income",
  "expenses",
  "invoices",
  "auslagen_submissions",
  "donations",
  "kategorien",
  "settings",
  "files",
  "audit_log",
] as const;

type RowObj = Record<string, unknown>;

/**
 * Separator used in all exported CSV files.
 * Semicolon is the de-DE list separator expected by LibreOffice Calc and
 * Excel (German locale) when opening a .csv file directly. This avoids the
 * need for the import wizard in the most common user scenario.
 */
const CSV_SEP = ";";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (
    s.includes(CSV_SEP) ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: RowObj[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]!);
  const lines = [cols.join(CSV_SEP)];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(row[c])).join(CSV_SEP));
  }
  return lines.join("\n") + "\n";
}

/**
 * Rewrites a `postgres://<user>:<pw>@host/...` URL to use `app_export`
 * credentials. Returns `null` if the input URL does not match the expected
 * shape (e.g. missing password component).
 */
export function deriveExportUrl(databaseUrl: string): string | null {
  const re = /^postgres:\/\/[^:/@]+:[^@]+@/;
  if (!re.test(databaseUrl)) return null;
  return databaseUrl.replace(re, "postgres://app_export:app_export@");
}

/**
 * Build the backup ZIP as a single Uint8Array. The caller is responsible for
 * serving the bytes with the right Content-Type/Disposition headers and for
 * gating the endpoint to admin users (and dev-only environments — see route
 * `+server.ts`).
 */
export async function buildBackupZip(): Promise<Uint8Array> {
  const exportUrl = deriveExportUrl(env.DATABASE_URL);
  if (!exportUrl) {
    throw new Error(
      "DATABASE_URL missing or malformed — cannot build backup (need user:password@host URL).",
    );
  }
  const client = postgres(exportUrl, { prepare: false, max: 1 });
  try {
    const zip = new JSZip();
    const rowCounts: Record<string, number> = {};
    for (const t of TABLES) {
      // SAFETY: TABLES is a const tuple of literal table names, not user
      // input — no SQL injection vector here. `unsafe` is used because
      // postgres.js does not allow parameterised identifiers, and `client(t)`
      // would interpret t as a value.
      const rows = (await client.unsafe(
        `SELECT * FROM ${t}`,
      )) as unknown as RowObj[];
      zip.file(`${t}.csv`, rowsToCsv(rows));
      rowCounts[t] = rows.length;
    }
    const manifest = {
      schema_version: 1,
      exported_at: new Date().toISOString(),
      app_version: process.env["PUBLIC_COMMIT_SHA"] ?? "dev",
      tables: rowCounts,
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file(
      "README.md",
      [
        "# Backup-Export",
        "",
        "Komplettes Daten-Backup als CSV. **NICHT ein Ersatz für die Festschreibungs-bundle.zip**",
        "— für die Steuerberater-Übergabe nutze stattdessen",
        "`/jahresabschluss/<year>/export/files.zip` (enthält Belege als PDF/JPG plus Signatur).",
        "",
        "## CSV-Format",
        "",
        "Alle CSV-Dateien verwenden **Semikolon (`;`) als Trennzeichen** (de-DE-Konvention).",
        "LibreOffice Calc und Excel (deutsche Locale) erkennen das Trennzeichen beim",
        "direkten Öffnen automatisch. Zeichensatz: UTF-8.",
        "",
        "## Inhalt",
        "",
        ...TABLES.map((t) => `- \`${t}.csv\` — ${rowCounts[t]} Zeilen`),
        "- `manifest.json` — Schema-Version + Zeitstempel + App-Version",
      ].join("\n"),
    );
    return await zip.generateAsync({ type: "uint8array" });
  } finally {
    await client.end({ timeout: 5 });
  }
}
