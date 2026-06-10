/**
 * Zuwendungsbestaetigung (Bescheinigung) - programmatic A4 layout matching
 * the BMF-Vordruck "Bestaetigung ueber Geldzuwendungen" / "Sachzuwendungen".
 *
 * The official BMF Mustervordruck has been simplified to the legally
 * Pflichtfelder. The Verein's letterhead block lives at the top, the
 * Spender block below, the Pflichttext quote of the Bescheid in the
 * middle, the betragInWorten block, and the Bescheid-specific footer
 * (Freistellungsbescheid vs. Paragraph 60a) at the bottom - all per the
 * BMF muster (BMF-Schreiben vom 24.04.2025, GZ IV C 4 - S 2223).
 *
 * The exact wording for Bescheid-Typ-specific text is reproduced verbatim
 * from the BMF text. Do not paraphrase - Finanzamt-Akzeptanz depends on
 * the wording.
 */

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";
import type { BmfPflichtfelder } from "$lib/server/domain/spenden.js";
import { addressLines } from "$lib/server/domain/address.js";

// ── Geometry ──────────────────────────────────────────────────────────────
const MM_TO_PT = 72 / 25.4;
const mm = (n: number): number => n * MM_TO_PT;

const PAGE_W = mm(210);
const PAGE_H = mm(297);
const MARGIN_X = mm(20);
const MARGIN_TOP = mm(20);
const MARGIN_BOTTOM = mm(18);

// ── Palette ───────────────────────────────────────────────────────────────
const COLOR_PRIMARY: RGB = rgb(0.55, 0.16, 0.4);
const COLOR_TEXT: RGB = rgb(0.1, 0.1, 0.14);
const COLOR_MUTED: RGB = rgb(0.42, 0.42, 0.5);
const COLOR_RULE: RGB = rgb(0.85, 0.78, 0.82);

const SIZE_TITLE = 16;
const SIZE_SUBTITLE = 11;
const SIZE_BODY = 10;
const SIZE_SMALL = 8.5;
const SIZE_FOOTER = 8;

// ─────────────────────────────────────────────────────────────────────────
function formatEuro(cents: bigint | number, currency: string = "EUR"): string {
  const c = typeof cents === "bigint" ? Number(cents) : cents;
  return (c / 100).toLocaleString("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatGermanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (font.widthOfTextAtSize(raw, size) <= maxWidth) {
      out.push(raw);
      continue;
    }
    const words = raw.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
}

function drawText(
  ctx: DrawCtx,
  text: string,
  opts: {
    x?: number;
    size?: number;
    bold?: boolean;
    color?: RGB;
    maxWidth?: number;
    lineGap?: number;
  } = {},
): void {
  const size = opts.size ?? SIZE_BODY;
  const x = opts.x ?? MARGIN_X;
  const font = opts.bold ? ctx.fontBold : ctx.font;
  const color = opts.color ?? COLOR_TEXT;
  const lineGap = opts.lineGap ?? 1.4;
  const lineH = size * lineGap;
  const maxW = opts.maxWidth ?? PAGE_W - 2 * MARGIN_X;
  const lines = wrapText(text, font, size, maxW);
  for (const line of lines) {
    ctx.page.drawText(line, { x, y: ctx.y - size, size, font, color });
    ctx.y -= lineH;
  }
}

function drawRule(ctx: DrawCtx, opts: { color?: RGB } = {}): void {
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_W - MARGIN_X, y: ctx.y },
    thickness: 0.4,
    color: opts.color ?? COLOR_RULE,
  });
  ctx.y -= mm(2);
}

function drawGap(ctx: DrawCtx, pts: number): void {
  ctx.y -= pts;
}

/**
 * Verbatim BMF-Pflichttext blocks. Do not edit - Finanzamt matches against
 * the wording. Source: BMF-Schreiben vom 24.04.2025, Anhang
 * "Mustervordrucke Zuwendungsbestaetigungen".
 */
export function bescheidPflichttext(p: BmfPflichtfelder): string[] {
  // BMF compliance: the issuing Finanzamt name is interpolated verbatim into
  // BOTH branches below ("des Finanzamts …" / "wurde vom Finanzamt …").
  // Asserted non-empty upstream (isBescheinigungEnabled / allocateBescheinigung);
  // throw here rather than render a legally-deficient "des , StNr. …".
  if (!p.vereinFinanzamt?.trim()) {
    throw new Error(
      "vereinFinanzamt missing — Bescheinigung renderer requires Finanzamt name",
    );
  }
  const lines: string[] = [];
  if (p.bescheidTyp === "freistellungsbescheid") {
    // BMF compliance: Veranlagungszeitraum is asserted non-empty upstream
    // (spenden.ts allocateBescheinigung / extractBmfPflichtfelder); we throw
    // here rather than silently render "-".
    if (!p.freistellungsbescheidVz) {
      throw new Error(
        "freistellungsbescheidVz missing — Bescheinigung renderer requires VZ",
      );
    }
    // BMF-verbatim genitive: "des Finanzamts München". p.vereinFinanzamt holds the
    // nominative full name (e.g. "Finanzamt München"); decline the leading word to
    // genitive for this slot. A value not starting with "Finanzamt" is left as-is.
    const finanzamtGenitiv = p.vereinFinanzamt.replace(
      /^Finanzamt\b/,
      "Finanzamts",
    );
    lines.push(
      `Wir sind wegen Foerderung ${p.steuerbegueZwecke} nach dem letzten uns zugegangenen ` +
        `Freistellungsbescheid bzw. nach der Anlage zum Koerperschaftsteuerbescheid des ` +
        `${finanzamtGenitiv}, StNr. ${p.vereinSteuernummer}, ` +
        `vom ${formatGermanDate(p.bescheidDatum)} fuer den letzten Veranlagungszeitraum ` +
        `${p.freistellungsbescheidVz} nach Paragraph 5 Abs. 1 Nr. 9 des Koerperschaftsteuergesetzes ` +
        `von der Koerperschaftsteuer und nach Paragraph 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer ` +
        `befreit.`,
    );
  } else {
    if (!p.satzungsFassung) {
      throw new Error(
        "satzungsFassung missing — Bescheinigung renderer requires Satzungs-Fassungsdatum for §60a",
      );
    }
    lines.push(
      `Die Einhaltung der satzungsmaessigen Voraussetzungen nach den Paragraphen 51, 59, 60 und 61 AO ` +
        `wurde vom ${p.vereinFinanzamt}, StNr. ${p.vereinSteuernummer}, ` +
        `mit Bescheid vom ${formatGermanDate(p.bescheidDatum)} ` +
        `nach Paragraph 60a AO gesondert festgestellt. Wir foerdern nach unserer Satzung ` +
        `(Fassung vom ${formatGermanDate(p.satzungsFassung)}) ${p.steuerbegueZwecke}.`,
    );
  }
  lines.push(
    `Es wird bestaetigt, dass die Zuwendung nur zur Foerderung ` +
      `${p.steuerbegueZwecke} verwendet wird.`,
  );
  return lines;
}

/**
 * Extract the Ort (city) from a free-form Verein address.
 *
 * The address can be single-line ("Musterstraße 1, 12345 Musterstadt") or
 * multi-line ("Musterstraße 1\n12345 Musterstadt"). The previous regex was
 * a single .split(",") which produced "Westermühlstraße 6\n80469 München"
 * for the multi-line value — flagged by the 2026-05-19 money review CRIT-2
 * as actively mangling the BMF Pflichttext on the Bescheinigung.
 *
 * Strategy: scan every comma- AND newline-separated segment for the
 * PLZ+Ort pattern (4-5 digits, whitespace, city name); return the city
 * portion only. Falls back to the last segment if no PLZ pattern is found.
 */
export function maskOrtFromAdresse(adr: string): string {
  const segments = adr
    // Normalize a literal backslash-n first: $env/dynamic/private returns
    // process.env verbatim, so a Vercel value entered as "…\n…" reaches us as
    // two characters, not a real newline. Without this the PLZ+Ort pattern
    // never matches and the whole raw address (incl. literal \n) would print on
    // the Zuwendungsbestätigung's "Ort, Datum" line. Mirrors addressLines().
    .replace(/\\n/g, "\n")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Content-free address (only whitespace/separators): still normalize the
  // literal \n on the fallback so a misconfigured value can never print "\n".
  if (segments.length === 0) return adr.replace(/\\n/g, "\n").trim();

  for (const seg of segments) {
    const match = seg.match(/^\d{4,5}\s+(.+)$/);
    if (match && match[1]) return match[1].trim();
  }
  return segments[segments.length - 1] ?? adr;
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export async function drawBescheinigung(
  doc: PDFDocument,
  p: BmfPflichtfelder,
): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const ctx: DrawCtx = { page, font, fontBold, y: PAGE_H - MARGIN_TOP };

  // ── Verein header ──────────────────────────────────────────────────────
  drawText(ctx, p.vereinName, {
    size: SIZE_SUBTITLE,
    bold: true,
    color: COLOR_PRIMARY,
  });
  // Multi-line postal address (DIN 5008) — each line stacked under the name
  // (an optional c/o line, the street, then PLZ Ort).
  for (const addrLine of addressLines(p.vereinAdresse)) {
    drawText(ctx, addrLine, { size: SIZE_SMALL, color: COLOR_MUTED });
  }
  drawText(
    ctx,
    `Steuernummer ${p.vereinSteuernummer} | Vereinsregister ${p.vereinVr}`,
    { size: SIZE_SMALL, color: COLOR_MUTED },
  );
  drawGap(ctx, mm(8));

  // ── Title ──────────────────────────────────────────────────────────────
  // BMF Mustervordruck uses distinct titles per Zuwendungs-Art. Do not
  // generalise — Finanzaemter pattern-match on the exact title string.
  const title =
    p.spendeKind === "sachspende"
      ? "Bestaetigung ueber Sachzuwendungen"
      : "Bestaetigung ueber Geldzuwendungen / Mitgliedsbeitraege";
  drawText(ctx, title, {
    size: SIZE_TITLE,
    bold: true,
    color: COLOR_PRIMARY,
  });
  drawText(
    ctx,
    "im Sinne des Paragraph 10b des Einkommensteuergesetzes (EStG)",
    { size: SIZE_SMALL, color: COLOR_MUTED },
  );
  drawGap(ctx, mm(3));
  drawText(ctx, `Bescheinigungs-Nr. ${p.bescheinigungNr}`, {
    size: SIZE_BODY,
    bold: true,
  });
  drawGap(ctx, mm(4));
  drawRule(ctx);

  // ── Spender block ──────────────────────────────────────────────────────
  drawText(ctx, "an", { size: SIZE_SMALL, color: COLOR_MUTED });
  drawText(ctx, p.spenderName, { size: SIZE_BODY, bold: true });
  drawText(ctx, p.spenderAdresse, { size: SIZE_BODY });
  drawGap(ctx, mm(4));
  drawRule(ctx);

  // ── Spende main facts ──────────────────────────────────────────────────
  const rowLabel = (label: string, value: string) => {
    const labelX = MARGIN_X;
    const valueX = MARGIN_X + mm(55);
    ctx.page.drawText(label, {
      x: labelX,
      y: ctx.y - SIZE_BODY,
      size: SIZE_BODY,
      font: ctx.fontBold,
      color: COLOR_TEXT,
    });
    ctx.page.drawText(value, {
      x: valueX,
      y: ctx.y - SIZE_BODY,
      size: SIZE_BODY,
      font: ctx.font,
      color: COLOR_TEXT,
    });
    ctx.y -= SIZE_BODY * 1.6;
  };

  rowLabel(
    "Art der Zuwendung",
    p.spendeKind === "sachspende" ? "Sachzuwendung" : "Geldzuwendung",
  );
  rowLabel("Tag der Zuwendung", formatGermanDate(p.spendeDatum));
  rowLabel("Betrag", formatEuro(p.betragCents));
  rowLabel("Betrag in Worten", p.betragInWorten);
  if (p.spendeKind === "sachspende" && p.sacheBeschreibung) {
    drawGap(ctx, mm(1));
    drawText(ctx, "Genaue Bezeichnung der Sachzuwendung mit Alter, Zustand:", {
      size: SIZE_SMALL,
      color: COLOR_MUTED,
    });
    drawText(ctx, p.sacheBeschreibung, { size: SIZE_BODY });
  }
  if (p.zweckbindungKind === "zweckgebunden" && p.zweckbindungText) {
    drawGap(ctx, mm(1));
    drawText(ctx, "Zweckbindung:", { size: SIZE_SMALL, color: COLOR_MUTED });
    drawText(ctx, p.zweckbindungText, { size: SIZE_BODY });
  }

  drawGap(ctx, mm(2));
  drawText(
    ctx,
    "Es handelt sich nicht um den Verzicht auf Erstattung von Aufwendungen: ja.",
    { size: SIZE_SMALL, color: COLOR_MUTED },
  );
  drawGap(ctx, mm(4));
  drawRule(ctx);

  // ── Bescheid-Pflichttext ───────────────────────────────────────────────
  for (const block of bescheidPflichttext(p)) {
    drawText(ctx, block, { size: SIZE_BODY, lineGap: 1.45 });
    drawGap(ctx, mm(2));
  }

  drawGap(ctx, mm(2));
  drawRule(ctx);

  // ── Signature block ────────────────────────────────────────────────────
  // Per BMF Mustervordruck IV C 4 — S 2223/19/10004 + §50 Abs. 1 EStDV, a
  // machine-created Bescheinigung MUST carry the "maschinell erstellt und
  // ohne Unterschrift gültig" notice. Without it the donor cannot deduct
  // the Spende (money review CRIT-1, 2026-05-19).
  drawGap(ctx, mm(3));
  drawText(
    ctx,
    `${maskOrtFromAdresse(p.vereinAdresse)}, ${formatGermanDate(p.ausgestelltAm)}`,
    { size: SIZE_BODY },
  );
  drawGap(ctx, mm(4));
  drawText(ctx, p.vereinName, { size: SIZE_BODY, bold: true });
  drawText(ctx, "Vorstand", { size: SIZE_SMALL, color: COLOR_MUTED });
  drawGap(ctx, mm(3));
  drawText(
    ctx,
    "Diese Zuwendungsbestaetigung ist maschinell erstellt und " +
      "ohne Unterschrift gueltig (Paragraph 50 Absatz 1 EStDV).",
    { size: SIZE_SMALL, color: COLOR_MUTED },
  );

  // ── Footer hint ────────────────────────────────────────────────────────
  const footerY = MARGIN_BOTTOM + mm(16);
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: footerY + mm(2) },
    end: { x: PAGE_W - MARGIN_X, y: footerY + mm(2) },
    thickness: 0.3,
    color: COLOR_RULE,
  });
  const footer1 =
    "Hinweis: Wer vorsaetzlich oder grob fahrlaessig eine unrichtige Zuwendungsbestaetigung " +
    "ausstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestaetigung " +
    "angegebenen steuerbeguenstigten Zwecken verwendet werden, haftet fuer die entgangene " +
    "Steuer (Paragraph 10b Abs. 4 EStG, Paragraph 9 Abs. 3 KStG, Paragraph 9 Nr. 5 GewStG).";
  const footer2 =
    p.bescheidTyp === "feststellung_60a"
      ? "Hinweis (vorlaeufige Bescheinigung): Diese Bestaetigung wird auf Grund der Feststellung " +
        "nach Paragraph 60a AO ausgestellt; sie gilt nicht im Sinne eines Freistellungsbescheids."
      : "";
  const wrapped1 = wrapText(
    footer1,
    ctx.font,
    SIZE_FOOTER,
    PAGE_W - 2 * MARGIN_X,
  );
  let fy = footerY;
  for (const line of wrapped1) {
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: fy,
      size: SIZE_FOOTER,
      font: ctx.font,
      color: COLOR_MUTED,
    });
    fy -= SIZE_FOOTER * 1.4;
  }
  if (footer2) {
    const wrapped2 = wrapText(
      footer2,
      ctx.font,
      SIZE_FOOTER,
      PAGE_W - 2 * MARGIN_X,
    );
    fy -= mm(1);
    for (const line of wrapped2) {
      ctx.page.drawText(line, {
        x: MARGIN_X,
        y: fy,
        size: SIZE_FOOTER,
        font: ctx.fontBold,
        color: COLOR_PRIMARY,
      });
      fy -= SIZE_FOOTER * 1.4;
    }
  }
}
