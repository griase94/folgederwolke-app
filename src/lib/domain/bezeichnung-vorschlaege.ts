/**
 * Bezeichnungs-Vorschläge je Kategorie (#115 Stufe 4).
 *
 * Per-Kategorie suggestions for the transaction entry forms' free-text
 * „Bezeichnung" field, surfaced as a native `<datalist>` (the field stays
 * FREE-TEXT — these are non-binding hints, never a constraint). Andy's wordings
 * (style = the Beate-Uwe canonical „Konzeption und Kuratierung der
 * Kulturveranstaltung" — the concrete event + date belong in the longer
 * Leistungsbeschreibung, not the short Bezeichnung).
 *
 * Keyed by the exact seeded Kategorie NAME (scripts/seed.ts EINNAHMEN_KATEGORIEN),
 * so the picker resolves a selected id → its option name → this map. Only the
 * invoiceable income Kategorien carry suggestions today; anything unlisted
 * (all expense Kategorien, donations, cash-desk revenue) yields none and the
 * field renders without a datalist.
 */

const VORSCHLAEGE: Readonly<Record<string, readonly string[]>> = {
  "Kuratierung & Künstlerische Leitung": [
    "Konzeption und Kuratierung der Kulturveranstaltung",
    "Künstlerische Leitung der Veranstaltung",
  ],
  "Honorar künstlerische Leistung": [
    "Künstlerischer Auftritt / Live-Performance",
    "Musikalische Darbietung",
  ],
  "Sponsoring (mit Gegenleistung)": [
    "Sponsoring-Leistung – Logo-Präsenz & Nennung",
    "Werbepartnerschaft Veranstaltung",
  ],
  "Workshop / Kursgebühr": ["Workshop-Leitung", "Kurs-/Seminargebühr"],
  "Vermietung Technik": [
    "Vermietung Veranstaltungstechnik",
    "Technik-Verleih (Licht/Ton)",
  ],
  "Dienstleistung (allgemein)": ["Dienstleistung", "Projektbezogene Leistung"],
  "Sonstige Einnahme (Zweckbetrieb)": ["Leistung im Rahmen des Zweckbetriebs"],
  "Sonstige Einnahme (WGB)": ["Sonstige wirtschaftliche Leistung"],
};

/**
 * The free-text Bezeichnungs-Vorschläge for a Kategorie by NAME. Returns an
 * empty array when the Kategorie has no suggestions (the caller then omits the
 * `<datalist>` entirely). Never throws — an unknown name is simply "no hints".
 */
export function bezeichnungsVorschlaege(
  kategorieName: string | null | undefined,
): readonly string[] {
  if (!kategorieName) return [];
  return VORSCHLAEGE[kategorieName] ?? [];
}
