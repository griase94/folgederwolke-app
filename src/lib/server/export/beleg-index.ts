/**
 * Beleg-Index CSV — index of all Belege (receipts) for the year.
 *
 * Lists every expense with a beleg_drive_file_id, providing AUS-ID,
 * designation, amount, and a direct Drive link for Steuerberater review.
 * Semicolon-delimited, UTF-8 with BOM.
 */

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
  belegDriveFileId: string | null;
  belegOriginalName: string | null;
}

function driveUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Generate a Beleg-Index CSV listing all expenses with Drive Beleg links.
 * Returns a UTF-8 string with BOM.
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
    "Beleg-Link (Drive)",
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
        row.belegDriveFileId ? driveUrl(row.belegDriveFileId) : "",
      ]),
    );
  }

  return lines.join("\r\n");
}
