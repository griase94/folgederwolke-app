/**
 * Shared BMF-Wortlaut for the Zuwendungsbestätigung — the single source of the
 * amtliche wording used by BOTH the on-screen `.doc-sheet` preview (proper
 * German, with § and umlauts) and the PDF template
 * (`bescheinigung-template.ts`, ASCII-transliterated for the Helvetica
 * WinAnsi core font).
 *
 * WHY a shared module: the preview must show, byte-for-byte modulo the known
 * ASCII transliteration, exactly what the PDF will say (AK 1 — BMF-Treue).
 * Keeping the wording here, with `toPdfAscii()` deriving the PDF form, makes
 * drift a test failure (`bescheinigung-wortlaut.test.ts`) rather than a silent
 * Finanzamt-rejection.
 *
 * SCOPE: the STATIC blocks (titles, subtitle, Verzicht line, §50 hint,
 * Haftungs-Hinweis) are literally shared — the PDF calls `toPdfAscii(...)` on
 * them, so they cannot diverge. The INTERPOLATED Bescheid-Pflichttext is
 * mirrored here in proper German for the preview; the PDF keeps its own
 * ASCII builder so it can render umlaut-carrying env values (e.g. "Finanzamt
 * München") verbatim rather than transliterating them. A proof test asserts
 * `toPdfAscii(bmfBescheidText(p)) === bescheidPflichttext(p)` on an ASCII
 * fixture, locking the boilerplate equivalence.
 *
 * BMF wording is sacred — reproduce verbatim, never paraphrase (Source:
 * BMF-Schreiben vom 24.04.2025, GZ IV C 4 - S 2223).
 */

export type BescheidTyp = "freistellungsbescheid" | "feststellung_60a";

/**
 * Deterministically transliterate proper German to the ASCII form the PDF
 * core font (Helvetica/WinAnsi) draws. The `§§`→`Paragraphen` rule MUST run
 * before the single `§`→`Paragraph` rule (the plural is a word, not two
 * symbols).
 */
export function toPdfAscii(s: string): string {
  return s
    .replace(/§§/g, "Paragraphen")
    .replace(/§/g, "Paragraph")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
}

/** ISO (YYYY-MM-DD) → DIN 5008 DD.MM.YYYY; passthrough on non-ISO input. */
export function formatGermanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Amtlicher BMF-Titel je Zuwendungsart. NEVER generalise — the Finanzämter
 * pattern-match on the exact title string.
 */
export function bmfTitel(spendeKind: "geldspende" | "sachspende"): string {
  return spendeKind === "sachspende"
    ? "Bestätigung über Sachzuwendungen"
    : "Bestätigung über Geldzuwendungen / Mitgliedsbeiträge";
}

export function bmfSubtitle(): string {
  return "im Sinne des § 10b des Einkommensteuergesetzes (EStG)";
}

/**
 * BMF-Vordruck Verzichts-Zeile (Aufwandsspende). Constant on the Muster —
 * the checkbox form is fixed to this phrasing.
 */
export function bmfVerzichtSatz(): string {
  return "Es handelt sich nicht um den Verzicht auf Erstattung von Aufwendungen: ja.";
}

/** §50 Abs. 1 EStDV — a machine-created cert is valid without a signature. */
export function bmf50Hinweis(): string {
  return "Diese Zuwendungsbestätigung ist maschinell erstellt und ohne Unterschrift gültig (§ 50 Absatz 1 EStDV).";
}

/** §10b Abs. 4 EStG — the Ausstellerhaftungs-Hinweis footer. */
export function bmfHaftungHinweis(): string {
  return (
    "Hinweis: Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung " +
    "ausstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung " +
    "angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene " +
    "Steuer (§ 10b Abs. 4 EStG, § 9 Abs. 3 KStG, § 9 Nr. 5 GewStG)."
  );
}

/** Narrowed, client-safe subset of BmfPflichtfelder the Bescheid text needs. */
export interface BescheidTextInput {
  bescheidTyp: BescheidTyp;
  steuerbegueZwecke: string;
  vereinFinanzamt: string;
  vereinSteuernummer: string;
  bescheidDatum: string; // YYYY-MM-DD
  freistellungsbescheidVz: string | null;
  satzungsFassung: string | null;
}

/**
 * Proper-German mirror of `bescheidPflichttext` (bescheinigung-template.ts).
 * The PDF keeps its own ASCII builder (to pass umlaut env values through
 * verbatim); this is the preview's rendering, and the proof test locks
 * `toPdfAscii(bmfBescheidText(p))` to the PDF output on an ASCII fixture.
 *
 * Mirrors the PDF's throw-guards so a legally-deficient cert can never be
 * previewed as valid.
 */
export function bmfBescheidText(p: BescheidTextInput): string[] {
  if (!p.vereinFinanzamt?.trim()) {
    throw new Error(
      "vereinFinanzamt missing — Bescheinigung renderer requires Finanzamt name",
    );
  }
  const lines: string[] = [];
  if (p.bescheidTyp === "freistellungsbescheid") {
    if (!p.freistellungsbescheidVz) {
      throw new Error(
        "freistellungsbescheidVz missing — Bescheinigung renderer requires VZ",
      );
    }
    // BMF-verbatim genitive: "des Finanzamts München" (decline the leading word).
    const finanzamtGenitiv = p.vereinFinanzamt.replace(
      /^Finanzamt\b/,
      "Finanzamts",
    );
    lines.push(
      `Wir sind wegen Förderung ${p.steuerbegueZwecke} nach dem letzten uns zugegangenen ` +
        `Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des ` +
        `${finanzamtGenitiv}, StNr. ${p.vereinSteuernummer}, ` +
        `vom ${formatGermanDate(p.bescheidDatum)} für den letzten Veranlagungszeitraum ` +
        `${p.freistellungsbescheidVz} nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes ` +
        `von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer ` +
        `befreit.`,
    );
  } else {
    if (!p.satzungsFassung) {
      throw new Error(
        "satzungsFassung missing — Bescheinigung renderer requires Satzungs-Fassungsdatum for §60a",
      );
    }
    lines.push(
      `Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO ` +
        `wurde vom ${p.vereinFinanzamt}, StNr. ${p.vereinSteuernummer}, ` +
        `mit Bescheid vom ${formatGermanDate(p.bescheidDatum)} ` +
        `nach § 60a AO gesondert festgestellt. Wir fördern nach unserer Satzung ` +
        `(Fassung vom ${formatGermanDate(p.satzungsFassung)}) ${p.steuerbegueZwecke}.`,
    );
  }
  lines.push(
    `Es wird bestätigt, dass die Zuwendung nur zur Förderung ` +
      `${p.steuerbegueZwecke} verwendet wird.`,
  );
  return lines;
}
