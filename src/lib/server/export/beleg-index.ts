/**
 * Beleg-Index CSV — index of all Belege (receipts) for the year.
 *
 * Lists every expense with a Beleg attachment, providing AUS-ID,
 * designation, amount, and a direct view URL for Steuerberater review.
 * Semicolon-delimited, UTF-8 with BOM.
 *
 * Phase 9: URLs point at the app's blob-backed `/api/files/{id}/blob`
 * endpoint (via `fileViewUrl`). Legacy expenses that still carry only a
 * `belegDriveFileId` (pre-Phase-9 Drive upload) get an empty URL cell —
 * the bundle PDF/ZIP is the authoritative copy for those, and the column
 * will go away once the legacy `belegDriveFileId` is dropped in PR2.
 */

import { fileViewUrl } from "$lib/server/files/storage.js";

function csvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(";");
}

function formatGermanDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatEurCents(cents: bigint | number): string {
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  return (n / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export interface BelegIndexRow {
  businessId: string;
  gebuchtAm: Date;
  bezeichnung: string;
  betragCents: bigint;
  sphereSnapshot: string;
  kategorieNameSnapshot: string;
  /**
   * Phase 9 FK into the `files` table. When set, the Beleg-Link column
   * renders an app-internal `/api/files/{id}/blob` URL.
   */
  belegFileId: string | null;
  /**
   * Legacy Drive file ID for pre-Phase-9 expenses. Will be dropped
   * together with the `expenses.beleg_drive_file_id` column in PR2.
   * FIXME(Phase 9 follow-up: backfill drive→blob) — when this is the
   * only Beleg pointer, the Beleg-Link column stays empty.
   */
  belegDriveFileId: string | null;
  belegOriginalName: string | null;
  /**
   * Phase 9 Task 18 — In-bundle relative path to the Beleg under
   * `09_Belege-{year}/`. Steuerberater opens the bundle and finds the
   * file at this path. Optional for backwards compatibility (rows
   * without an in-bundle file get an empty Beleg-Pfad cell).
   */
  bundlePath?: string | null;
}

/**
 * Generate a Beleg-Index CSV listing all expenses with Beleg references.
 * Returns a UTF-8 string with BOM.
 *
 * Phase 9 Task 18: emits a `Beleg-Pfad (im Bundle)` column pointing into
 * the `09_Belege-{year}/` subfolder. The legacy `Beleg-Link (Drive)`
 * column is kept for rows whose Beleg is still served from Drive.
 */
export function generateBelegIndex(rows: BelegIndexRow[]): string {
  const lines: string[] = [];

  const header = csvRow([
    "AUS-ID",
    "Gebucht am",
    "Bezeichnung",
    "Betrag (EUR)",
    "Betrag (Cent)",
    "Sphäre",
    "Kategorie",
    "Beleg-Dateiname",
    "Beleg-Pfad (im Bundle)",
    "Beleg-Link",
  ]);
  lines.push("﻿" + header);

  for (const row of rows) {
    lines.push(
      csvRow([
        row.businessId,
        formatGermanDate(row.gebuchtAm),
        row.bezeichnung,
        formatEurCents(row.betragCents),
        String(row.betragCents),
        row.sphereSnapshot,
        row.kategorieNameSnapshot,
        row.belegOriginalName ?? "",
        row.bundlePath
          ? `09_Belege-${row.gebuchtAm.getFullYear()}/${row.bundlePath}`
          : "",
        row.belegFileId ? fileViewUrl(row.belegFileId) : "",
      ]),
    );
  }

  return lines.join("\r\n");
}
