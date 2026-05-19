/**
 * Spendenliste CSV — BMF-required fields for the year-end bundle.
 *
 * Includes all fields required for the Finanzamt Gemeinützigkeitsprüfung
 * and Bescheinigungs-Nachweise. Semicolon-delimited, UTF-8 with BOM.
 */

function csvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(";");
}

function formatGermanDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("de-DE", {
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

export interface SpendenlisteRow {
  businessId: string;
  zugewendetAm: Date | string | null;
  betragCents: bigint;
  spendeKind: string;
  zweckbindungKind: string;
  zweckbindungText: string | null;
  spenderName: string | null;
  spenderAdresse: string | null;
  spenderEmail: string | null;
  memberName: string | null;
  bescheinigungNr: string | null;
  bescheinigungAusgestelltAm: Date | string | null;
  kategorieName: string;
  sphereSnapshot: string;
}

/**
 * Generate Spendenliste CSV with BMF-required fields.
 * Returns a UTF-8 string with BOM.
 */
export function generateSpendenliste(rows: SpendenlisteRow[]): string {
  const lines: string[] = [];

  const header = csvRow([
    "Beleg-Nr",
    "Zugewendet am",
    "Spende-Art",
    "Zweckbindung",
    "Zweck",
    "Spender Name",
    "Spender Adresse",
    "Spender E-Mail",
    "Betrag (EUR)",
    "Betrag (Cent)",
    "Kategorie",
    "Sphäre",
    "Bescheinigungs-Nr",
    "Bescheinigung ausgestellt am",
  ]);
  lines.push("﻿" + header);

  const spendeKindLabels: Record<string, string> = {
    geldspende: "Geldspende",
    sachspende: "Sachspende",
    aufwandsspende: "Aufwandsspende",
  };

  const zweckLabels: Record<string, string> = {
    zweckfrei: "zweckfrei",
    zweckgebunden: "zweckgebunden",
  };

  for (const row of rows) {
    const spenderDisplay = row.memberName ?? row.spenderName ?? "Anonym";
    lines.push(
      csvRow([
        row.businessId,
        formatGermanDate(row.zugewendetAm),
        spendeKindLabels[row.spendeKind] ?? row.spendeKind,
        zweckLabels[row.zweckbindungKind] ?? row.zweckbindungKind,
        row.zweckbindungText ?? "",
        spenderDisplay,
        row.spenderAdresse ?? "",
        row.spenderEmail ?? "",
        formatEurCents(row.betragCents),
        String(row.betragCents),
        row.kategorieName,
        row.sphereSnapshot,
        row.bescheinigungNr ?? "",
        formatGermanDate(row.bescheinigungAusgestelltAm),
      ]),
    );
  }

  return lines.join("\r\n");
}
