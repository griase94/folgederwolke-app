/**
 * Phase 10 — Rechnung v2 renderer.
 *
 * Pixel-faithful reproduction of the Verein's brand template:
 *   - Lavender-pink "RECHNUNG" wordmark (Anton 36pt) + cloud-lightning logo
 *   - 10pt DejaVu Sans body
 *   - Pink table header bar + Gesamtsumme pill
 *   - 4-column footer with line-art icons
 *
 * See the addendum to `.claude/plans/2026-05-21-rechnung-redesign.md` for
 * the full layout spec. Renderer is self-contained: it loads fonts and
 * images via the cached loaders in `fonts.ts` and `assets.ts`, then draws
 * everything per-document via pdf-lib's drawing primitives.
 */
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  type RGB,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { loadFontBytes } from "./fonts.js";
import { loadAssetBytes } from "./assets.js";
import { BRAND_ROSA, BODY, WHITE } from "./colors.js";

// Geometry
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_TOP = 10 * MM;
const MARGIN_BOTTOM = 10 * MM;
// Andy review v2.5 (2026-05-26): mirror left margin to the right so EVERY
// element (logo, meta block, table, footer columns) is symmetric. Body sits
// at 20mm L / 20mm R now.
const MARGIN_LEFT = 20 * MM;
const MARGIN_RIGHT = 20 * MM;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

// Font sizes (pt) — design hierarchy after Andy's v2.5 review:
//   - Header tier (untouched in -1pt sweep): WORDMARK, SUBTITLE pair, SECTION_TITLE
//   - Body tier (all -1pt from initial design): ADDRESS / META / BODY / TABLE / FOOTER
const SIZE_WORDMARK = 32;
// Sender line now sizes itself (senderBaseSize, auto-shrink) — see header block.
const SIZE_SUBTITLE_ITALIC = 8;
const SIZE_ADDRESS = 9;
const SIZE_META_LABEL = 9;
const SIZE_META_VALUE = 9;
const SIZE_SECTION_TITLE = 11;
const SIZE_BODY = 9;
const SIZE_TABLE_HEADER = 10;
const SIZE_TABLE_CELL = 9;
const SIZE_FOOTER = 7;

// Input contract
export interface RechnungV2Input {
  verein: {
    name: string;
    /** Compact one-line form (name's sender line). */
    adresseSingleLine: string;
    /** Postal address lines top-to-bottom (DIN 5008: [c/o], street, PLZ Ort). */
    adresseLines: string[];
    vereinsregister: string;
    steuernummer: string;
    contactEmail: string;
    bankname: string;
    iban: string;
    bic: string;
  };
  customer: {
    name: string;
    addressBlock: string;
    country: string;
  };
  rechnungsnummer: string;
  rechnungsdatum: string;
  /** Required per § 14 Abs. 4 Nr. 6 UStG. Use "Leistungsdatum entspricht Rechnungsdatum" when service date = invoice date. */
  leistungszeitraum: string;
  bezeichnung: string;
  leistungsBeschreibung: string | null;
  nettoCents: number;
  kassenwaertName: string;
}

// Helpers

const ALPHA2_TO_DE: Record<string, string> = {
  DE: "Deutschland",
  AT: "Österreich",
  CH: "Schweiz",
  FR: "Frankreich",
  IT: "Italien",
  NL: "Niederlande",
  BE: "Belgien",
  LU: "Luxemburg",
  GB: "Vereinigtes Königreich",
  UK: "Vereinigtes Königreich",
  US: "Vereinigte Staaten",
  ES: "Spanien",
  PL: "Polen",
  CZ: "Tschechien",
  SK: "Slowakei",
  HU: "Ungarn",
  DK: "Dänemark",
  SE: "Schweden",
  FI: "Finnland",
  NO: "Norwegen",
  IE: "Irland",
  PT: "Portugal",
  GR: "Griechenland",
  RO: "Rumänien",
  BG: "Bulgarien",
  HR: "Kroatien",
  SI: "Slowenien",
  EE: "Estland",
  LV: "Lettland",
  LT: "Litauen",
  TR: "Türkei",
};

export function countryLabelForAlpha2(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  return ALPHA2_TO_DE[c] ?? c;
}

export function formatEur(cents: number): string {
  const eur = cents / 100;
  return eur
    .toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    })
    .replace(/ /g, " ");
}

export function formatDE(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.test(iso);
  if (!m) return iso;
  const year = iso.slice(0, 4);
  const month = iso.slice(5, 7);
  const day = iso.slice(8, 10);
  return `${day}.${month}.${year}`;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (font.widthOfTextAtSize(raw, size) <= maxWidth) {
      lines.push(raw);
      continue;
    }
    let current = "";
    for (const word of raw.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
): void {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawCenteredImage(
  page: PDFPage,
  img: PDFImage,
  centerX: number,
  y: number,
  maxW: number,
  maxH: number,
): void {
  const ratio = img.width / img.height;
  let w = maxW;
  let h = maxW / ratio;
  if (h > maxH) {
    h = maxH;
    w = maxH * ratio;
  }
  page.drawImage(img, { x: centerX - w / 2, y, width: w, height: h });
}

// Main renderer

export async function renderRechnungV2(
  input: RechnungV2Input,
): Promise<Uint8Array> {
  const fonts = await loadFontBytes();
  const assets = await loadAssetBytes();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Rechnung ${input.rechnungsnummer}`);
  doc.setSubject(`Rechnung an ${input.customer.name}`);
  doc.setAuthor(input.verein.name);
  doc.setProducer("folgederwolke-app");
  doc.setCreationDate(new Date());

  const anton = await doc.embedFont(fonts.anton, { subset: true });
  const regular = await doc.embedFont(fonts.dejavu, { subset: true });
  const bold = await doc.embedFont(fonts.dejavuBold, { subset: true });
  const italic = await doc.embedFont(fonts.dejavuOblique, { subset: true });

  const logo = await doc.embedPng(assets.logoCloud);
  const iconHouse = await doc.embedPng(assets.iconHouse);
  const iconContact = await doc.embedPng(assets.iconContact);
  const iconBank = await doc.embedPng(assets.iconBank);
  const iconPerson = await doc.embedPng(assets.iconPerson);

  const page = doc.addPage([PAGE_W, PAGE_H]);

  // 1. Header band
  const wordmarkBaselineY = PAGE_H - MARGIN_TOP - 23 * MM;
  page.drawText("RECHNUNG", {
    x: MARGIN_LEFT,
    y: wordmarkBaselineY,
    size: SIZE_WORDMARK,
    font: anton,
    color: BRAND_ROSA,
  });

  // Sender line (DIN 5008 Absenderzeile): "Name · [c/o …] · Straße · PLZ Ort".
  // Bold pink, set tight under the wordmark (~3mm). Auto-shrinks so a long
  // address never runs under the cloud logo (box starts at
  // x = PAGE_W - MARGIN_RIGHT - 30mm); an ~8mm gutter keeps a comfortable gap to
  // the logo. Floor 6.5pt for legibility.
  const subtitleBoldY = wordmarkBaselineY - 3 * MM;
  const senderText = `${input.verein.name} · ${input.verein.adresseSingleLine}`;
  const senderBaseSize = 8;
  const senderMaxW = PAGE_W - MARGIN_RIGHT - 30 * MM - MARGIN_LEFT - 8 * MM;
  const senderNaturalW = bold.widthOfTextAtSize(senderText, senderBaseSize);
  const senderSize =
    senderNaturalW > senderMaxW
      ? Math.max(6.5, (senderBaseSize * senderMaxW) / senderNaturalW)
      : senderBaseSize;
  page.drawText(senderText, {
    x: MARGIN_LEFT,
    y: subtitleBoldY,
    size: senderSize,
    font: bold,
    color: BRAND_ROSA,
  });

  const subtitleItalicY = subtitleBoldY - 4 * MM;
  page.drawText(
    `eingetragen im Vereinsregister des AG München unter ${input.verein.vereinsregister}`,
    {
      x: MARGIN_LEFT,
      y: subtitleItalicY,
      size: SIZE_SUBTITLE_ITALIC,
      font: italic,
      color: BRAND_ROSA,
    },
  );

  // Andy review: bigger logo (was 22mm, too small).
  const logoBoxW = 30 * MM;
  const logoBoxH = logoBoxW;
  const logoX = PAGE_W - MARGIN_RIGHT - logoBoxW;
  const logoY = PAGE_H - MARGIN_TOP - logoBoxH - 2 * MM;
  drawCenteredImage(
    page,
    logo,
    logoX + logoBoxW / 2,
    logoY,
    logoBoxW,
    logoBoxH,
  );

  // 2. Address block + meta block
  // Andy review (2026-05-26): with the larger subtitle gaps (6mm + 4mm) the
  // header block extends to ~y=33mm; give it ~12mm of air before customer.
  const addressTopY = PAGE_H - MARGIN_TOP - 47 * MM;
  const addressLeftX = MARGIN_LEFT;
  const addressMaxW = 80 * MM;
  // Design review: 5mm was too generous for 10pt — German postal addresses
  // render tighter (1.13 line-height ≈ 4mm).
  const addressLineH = 4 * MM;

  const customerLines: string[] = [];
  customerLines.push(input.customer.name);
  const blockLines = (input.customer.addressBlock ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  customerLines.push(...blockLines);
  // UPU recommendation: foreign destination country in UPPERCASE on the last
  // address line (and country line only present when country !== DE).
  if (input.customer.country && input.customer.country.toUpperCase() !== "DE") {
    customerLines.push(
      countryLabelForAlpha2(input.customer.country).toUpperCase(),
    );
  }

  let addressY = addressTopY;
  for (const line of customerLines) {
    page.drawText(line, {
      x: addressLeftX,
      y: addressY,
      size: SIZE_ADDRESS,
      font: regular,
      color: BODY,
      maxWidth: addressMaxW,
    });
    addressY -= addressLineH;
  }

  // Meta block — two fixed anchors (design review):
  //   - Labels right-aligned to a "colon column" (clean right edge)
  //   - Values left-aligned 4mm to the right of that column (clean left edge)
  // Replaces the per-row floating geometry that produced 3 different gutters.
  const metaColonRightX = PAGE_W - MARGIN_RIGHT - 32 * MM;
  const metaValueLeftX = metaColonRightX + 4 * MM;
  // Optical bottom-align label baseline with customer-name baseline. Reference
  // has the label 0.6mm below the customer name (bold tracking pulls the
  // visual baseline up); compensate.
  const metaTopY = addressTopY - 0.6 * MM;
  const metaRowH = 5 * MM;

  const metaRows: Array<{ label: string; value: string }> = [
    { label: "Rechnung Nr.:", value: input.rechnungsnummer },
    { label: "Rechnungsdatum:", value: formatDE(input.rechnungsdatum) },
  ];
  // Leistungszeitraum is mandatory per § 14 Abs. 4 Nr. 6 UStG — but defensively
  // collapse the row at render time so a stale older invoice doesn't crash.
  // Form + DB constraints (Task: legal-fixes) enforce non-null at create time.
  if (input.leistungszeitraum && input.leistungszeitraum.trim().length > 0) {
    metaRows.push({
      label: "Leistungszeitraum:",
      value: input.leistungszeitraum.trim(),
    });
  }

  let metaY = metaTopY;
  for (const row of metaRows) {
    const labelW = bold.widthOfTextAtSize(row.label, SIZE_META_LABEL);
    page.drawText(row.label, {
      x: metaColonRightX - labelW,
      y: metaY,
      size: SIZE_META_LABEL,
      font: bold,
      color: BODY,
    });
    page.drawText(row.value, {
      x: metaValueLeftX,
      y: metaY,
      size: SIZE_META_VALUE,
      font: regular,
      color: BODY,
    });
    metaY -= metaRowH;
  }

  // 3. Section title — Andy review (2026-05-26): more air before this
  const sectionTitleY = addressY - 14 * MM;
  page.drawText(`RECHNUNG NR. ${input.rechnungsnummer}`, {
    x: MARGIN_LEFT,
    y: sectionTitleY,
    size: SIZE_SECTION_TITLE,
    font: bold,
    color: BRAND_ROSA,
  });

  // 4. Greeting + intro — Andy review: a touch more air after the greeting
  let bodyY = sectionTitleY - 14 * MM;
  page.drawText("Sehr geehrte Damen und Herren,", {
    x: MARGIN_LEFT,
    y: bodyY,
    size: SIZE_BODY,
    font: regular,
    color: BODY,
  });
  bodyY -= 8 * MM;
  page.drawText(
    "vielen Dank für Ihr Vertrauen. Ich stelle Ihnen hiermit folgende Leistungen in Rechnung:",
    {
      x: MARGIN_LEFT,
      y: bodyY,
      size: SIZE_BODY,
      font: regular,
      color: BODY,
    },
  );

  // 5. Table
  // Design review: column proportions rebalanced — Pos slightly wider (14 vs
  // 12) for "1." centering, Menge narrower (18 vs 22), Preis wider (30 vs 27)
  // to fit "1.234,56 €" with thousands separator.
  const tableX = MARGIN_LEFT;
  const tableW = CONTENT_W;
  const colPosW = 14 * MM;
  const colMengeW = 18 * MM;
  const colPreisW = 30 * MM;
  const colBeschrW = tableW - colPosW - colMengeW - colPreisW;
  const colPosX = tableX;
  const colBeschrX = colPosX + colPosW;
  const colMengeX = colBeschrX + colBeschrW;
  const colPreisX = colMengeX + colMengeW;
  const colPreisRightX = colPreisX + colPreisW;

  // Andy review (2026-05-26): more air between intro and table
  const tableTopY = bodyY - 12 * MM;
  // Andy review: less squeezed — bump from 7 to 8mm so the rosa band has
  // confident vertical presence.
  const headerH = 8 * MM;

  // Andy review: revert to the original pastel rosa for the header bar
  // (BRAND_ROSA #f09dff). The deeper #e275f4 we introduced for contrast
  // overshot — the brand intent is soft pastel.
  drawRect(page, tableX, tableTopY - headerH, tableW, headerH, BRAND_ROSA);
  // Design review: 2.5mm padTop centers 11pt cap inside 7mm band (was 2.2).
  const headerTextY = tableTopY - headerH + 2.5 * MM;
  page.drawText("Pos.", {
    x: colPosX + 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  page.drawText("Beschreibung", {
    x: colBeschrX + 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  const mengeHdr = "Menge";
  const mengeHdrW = bold.widthOfTextAtSize(mengeHdr, SIZE_TABLE_HEADER);
  page.drawText(mengeHdr, {
    x: colMengeX + colMengeW - mengeHdrW - 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  const preisHdr = "Gesamtpreis";
  const preisHdrW = bold.widthOfTextAtSize(preisHdr, SIZE_TABLE_HEADER);
  page.drawText(preisHdr, {
    x: colPreisRightX - preisHdrW - 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });

  // Data row
  const dataTopY = tableTopY - headerH;
  const cellPadX = 2 * MM;
  const cellPadTop = 2.5 * MM;
  const lineH = 4.5 * MM;

  const beschrInnerW = colBeschrW - 2 * cellPadX;
  const wrappedBez = wrapText(
    input.bezeichnung,
    regular,
    SIZE_TABLE_CELL,
    beschrInnerW,
  );
  const hasSecondary =
    input.leistungsBeschreibung != null &&
    input.leistungsBeschreibung.trim().length > 0;
  const wrappedSec = hasSecondary
    ? wrapText(
        input.leistungsBeschreibung!,
        italic,
        SIZE_TABLE_CELL,
        beschrInnerW,
      )
    : [];

  const totalDataLines = wrappedBez.length + wrappedSec.length;
  const dataRowH = Math.max(8 * MM, cellPadTop * 2 + lineH * totalDataLines);
  const dataBottomY = dataTopY - dataRowH;

  // Design review: top-align Pos/Menge/Preis to the FIRST Beschreibung line
  // (was vertically centered — floated mid-cell on multi-line rows).
  const cellTopBaselineY = dataTopY - cellPadTop - SIZE_TABLE_CELL * 0.8;

  const posText = "1.";
  const posW = regular.widthOfTextAtSize(posText, SIZE_TABLE_CELL);
  page.drawText(posText, {
    x: colPosX + (colPosW - posW) / 2,
    y: cellTopBaselineY,
    size: SIZE_TABLE_CELL,
    font: regular,
    color: BODY,
  });

  let bY = cellTopBaselineY;
  for (const line of wrappedBez) {
    page.drawText(line, {
      x: colBeschrX + cellPadX,
      y: bY,
      size: SIZE_TABLE_CELL,
      font: regular,
      color: BODY,
    });
    bY -= lineH;
  }
  for (const line of wrappedSec) {
    page.drawText(line, {
      x: colBeschrX + cellPadX,
      y: bY,
      size: SIZE_TABLE_CELL,
      font: italic,
      color: BODY,
    });
    bY -= lineH;
  }

  const mengeText = "1";
  const mengeW = regular.widthOfTextAtSize(mengeText, SIZE_TABLE_CELL);
  page.drawText(mengeText, {
    x: colMengeX + colMengeW - mengeW - cellPadX,
    y: cellTopBaselineY,
    size: SIZE_TABLE_CELL,
    font: regular,
    color: BODY,
  });

  const preisText = formatEur(input.nettoCents);
  const preisW = regular.widthOfTextAtSize(preisText, SIZE_TABLE_CELL);
  page.drawText(preisText, {
    x: colPreisRightX - preisW - cellPadX,
    y: cellTopBaselineY,
    size: SIZE_TABLE_CELL,
    font: regular,
    color: BODY,
  });

  // Andy review v2.3 (2026-05-26): drop the soft-rosa hairline above the
  // Gesamtsumme — Andy wants no line above the block. Color change between
  // cells (well, between white data row and rosa sum row) is enough divider.

  // Gesamtsumme row — Andy review v2.3:
  //   - SINGLE rosa bar (no split) — both label + value cells in BRAND_ROSA.
  //   - White text on the single bar.
  const sumRowH = 8 * MM;
  const sumTopY = dataBottomY;
  const sumBottomY = sumTopY - sumRowH;
  const sumLeftW = colPosW + colBeschrW + colMengeW;
  drawRect(page, tableX, sumBottomY, tableW, sumRowH, BRAND_ROSA);
  const sumLabel = "Gesamtsumme";
  const sumLabelW = bold.widthOfTextAtSize(sumLabel, SIZE_TABLE_HEADER);
  // Design review: optical-center factor 0.35 (was 1/3 = 0.33) — undershoots
  // for 11pt; 0.35 sits the cap perfectly mid-cell.
  const sumLabelY = sumBottomY + sumRowH / 2 - SIZE_TABLE_HEADER * 0.35;
  page.drawText(sumLabel, {
    x: tableX + sumLeftW - sumLabelW - cellPadX,
    y: sumLabelY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  const sumValueW = bold.widthOfTextAtSize(preisText, SIZE_TABLE_HEADER);
  page.drawText(preisText, {
    x: colPreisRightX - sumValueW - cellPadX,
    y: sumLabelY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });

  // 6. Body paragraphs after table — Andy review (2026-05-26):
  //   - More air after the table (12mm → 13mm)
  //   - Larger "Mit freundlichen Grüßen" → name gap (5.5mm → 9mm)
  //   - Italic "Kassenwärtin Folge der Wolke e.V." role line (was regular)
  const BODY_LEADING = 7 * MM;
  const CLOSING_BREAK = 13 * MM;

  let p = sumBottomY - 13 * MM;
  page.drawText("Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.", {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: italic,
    color: BODY,
  });
  p -= BODY_LEADING;
  page.drawText(
    "Zahlungsbedingungen: Zahlung innerhalb von 14 Tagen ab Rechnungseingang ohne Abzüge.",
    {
      x: MARGIN_LEFT,
      y: p,
      size: SIZE_BODY,
      font: regular,
      color: BODY,
    },
  );
  p -= BODY_LEADING;
  page.drawText(
    "Bei Rückfragen stehe ich selbstverständlich jederzeit gerne zur Verfügung.",
    {
      x: MARGIN_LEFT,
      y: p,
      size: SIZE_BODY,
      font: regular,
      color: BODY,
    },
  );
  p -= CLOSING_BREAK;
  page.drawText("Mit freundlichen Grüßen", {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: regular,
    color: BODY,
  });
  p -= 9 * MM;
  page.drawText(input.kassenwaertName, {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: bold,
    color: BODY,
  });
  p -= 5 * MM;
  page.drawText(`Kassenwärtin ${input.verein.name}`, {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: italic,
    color: BODY,
  });

  // Safety check: if y went below footer space, add a second page.
  const footerTopReserve = MARGIN_BOTTOM + 30 * MM;
  if (p < footerTopReserve) {
    const page2 = doc.addPage([PAGE_W, PAGE_H]);
    page2.drawText("RECHNUNG", {
      x: MARGIN_LEFT,
      y: PAGE_H - MARGIN_TOP - 12 * MM,
      size: 18,
      font: anton,
      color: BRAND_ROSA,
    });
  }

  // 7. Footer (4-column)
  const footerBottomY = MARGIN_BOTTOM;
  const colSpacing = CONTENT_W / 4;
  const iconBoxW = 13 * MM;
  const iconBoxH = 11 * MM;
  const iconBottomY = footerBottomY + 18 * MM;
  const colTextBaseY = footerBottomY + 13 * MM;
  // Design review: 3.4mm matches reference footer leading (was 3.8 — too loose).
  const colTextLineH = 3.4 * MM;

  const colCenters = [
    MARGIN_LEFT + colSpacing * 0.5,
    MARGIN_LEFT + colSpacing * 1.5,
    MARGIN_LEFT + colSpacing * 2.5,
    MARGIN_LEFT + colSpacing * 3.5,
  ];

  const drawFooterCol = (
    centerX: number,
    icon: PDFImage,
    lines: Array<{ text: string; color?: RGB; bold?: boolean }>,
  ): void => {
    drawCenteredImage(page, icon, centerX, iconBottomY, iconBoxW, iconBoxH);
    let y = colTextBaseY;
    for (const line of lines) {
      // Skip empty lines so the column collapses cleanly (no orphan glyphs or
      // blank gaps) when an optional value — c/o line, phone — is absent.
      if (line.text.trim() === "") continue;
      const font = line.bold ? bold : regular;
      const w = font.widthOfTextAtSize(line.text, SIZE_FOOTER);
      page.drawText(line.text, {
        x: centerX - w / 2,
        y,
        size: SIZE_FOOTER,
        font,
        color: line.color ?? BODY,
      });
      y -= colTextLineH;
    }
  };

  // Address column (DIN 5008) = the complete postal block: the Empfänger name
  // leads, then the postal lines (an optional "c/o …", the street, PLZ Ort).
  // A care-of line is only a valid address with the recipient name above it.
  // Empty lines are skipped above.
  drawFooterCol(colCenters[0]!, iconHouse, [
    { text: input.verein.name, bold: true },
    ...input.verein.adresseLines.map((text) => ({ text })),
  ]);
  drawFooterCol(colCenters[1]!, iconContact, [
    { text: input.verein.contactEmail },
  ]);
  drawFooterCol(colCenters[2]!, iconBank, [
    { text: input.verein.bankname },
    { text: input.verein.iban },
    { text: `BIC: ${input.verein.bic}` },
  ]);
  drawFooterCol(colCenters[3]!, iconPerson, [
    { text: input.verein.name, bold: true },
    { text: "Steuernummer:" },
    // Andy review v2.3: revert to BODY/black — pink stood out too much
    // against the rest of the footer.
    { text: input.verein.steuernummer },
  ]);

  return doc.save();
}

export { rgb };
