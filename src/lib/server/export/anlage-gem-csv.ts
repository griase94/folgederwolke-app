/**
 * Anlage Gem CSV export — Steuerbegünstigte Zwecke aggregation.
 *
 * Groups all income + expense rows by anlage_gem_zeile and emits a
 * semicolon-delimited UTF-8 CSV with BOM for Excel compatibility.
 */

import type { EurYearResult } from "$lib/server/domain/eur.js";
import {
  aggregateByAnlageGemZeile,
  formatEurCents,
} from "$lib/server/domain/eur.js";

function csvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(";");
}

/**
 * Generate Anlage Gem CSV from an EurYearResult.
 * Returns a UTF-8 string with BOM.
 */
export function generateAnlageGemCsv(eur: EurYearResult): string {
  const lines: string[] = [];

  // BOM for Excel DE-locale auto-detect
  const header = csvRow([
    "Anlage-Gem Zeile",
    "Bezeichnung",
    "Sphäre",
    "Art",
    "Betrag (EUR)",
    "Betrag (Cent)",
  ]);
  lines.push("﻿" + header);

  const sphereLabels: Record<string, string> = {
    ideeller: "Ideeller Bereich",
    vermoegen: "Vermögensverwaltung",
    zweckbetrieb: "Zweckbetrieb",
    wirtschaftlich: "Wirtschaftlicher Geschäftsbetrieb",
  };

  for (const sphere of [
    "ideeller",
    "vermoegen",
    "zweckbetrieb",
    "wirtschaftlich",
  ] as const) {
    const sphereData = eur.bySphere[sphere];
    const sphereLabel = sphereLabels[sphere] ?? sphere;

    if (!sphereData) continue;

    const einnahmenZeilen = aggregateByAnlageGemZeile(sphereData.einnahmen);
    for (const z of einnahmenZeilen) {
      lines.push(
        csvRow([
          String(z.zeile),
          z.bezeichnung,
          sphereLabel,
          "Einnahme",
          formatEurCents(z.betragCents),
          String(z.betragCents),
        ]),
      );
    }

    const ausgabenZeilen = aggregateByAnlageGemZeile(sphereData.ausgaben);
    for (const z of ausgabenZeilen) {
      lines.push(
        csvRow([
          String(z.zeile),
          z.bezeichnung,
          sphereLabel,
          "Ausgabe",
          formatEurCents(z.betragCents),
          String(z.betragCents),
        ]),
      );
    }
  }

  return lines.join("\r\n");
}
