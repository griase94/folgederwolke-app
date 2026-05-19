# Abschnitt 8 — Datenschutz (DSGVO)

> Cross-references: VVT, TOM-Katalog, DPA-Tracker.

## 8.1 Rechtsgrundlagen

| Verarbeitungsvorgang                  | Rechtsgrundlage                                                 |
| ------------------------------------- | --------------------------------------------------------------- |
| Mitgliederverwaltung                  | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung Mitgliedschaft)   |
| Auslagen-Einreichung durch Mitglieder | Art. 6 Abs. 1 lit. b DSGVO                                      |
| Auslagen-Einreichung durch Externe    | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)             |
| Buchhaltung / GoBD-Dokumentation      | Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung)           |
| Magic-Link-Authentifizierung          | Art. 6 Abs. 1 lit. b DSGVO                                      |
| E-Mail-Transaktionen                  | Art. 6 Abs. 1 lit. b/c DSGVO                                    |
| Server-Logs                           | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse: Sicherheit) |
| Backup                                | Art. 6 Abs. 1 lit. c DSGVO (Aufbewahrungspflicht)               |

## 8.2 Betroffenenrechte

Betroffene Personen (Mitglieder, Externe Einreicher) haben folgende Rechte:

| Recht                          | Umsetzung                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Auskunft (Art. 15)             | Kassenwart erteilt Auskunft auf Anfrage per E-Mail                               |
| Berichtigung (Art. 16)         | Admin korrigiert über `/app/mitglieder/:id/bearbeiten`                           |
| Löschung (Art. 17)             | Anonymisierung nach Aufbewahrungsfrist (Phase 2); Buchungsdaten bleiben für GoBD |
| Einschränkung (Art. 18)        | Manuell durch Kassenwart                                                         |
| Datenübertragbarkeit (Art. 20) | EÜR-CSV-Export; auf Anfrage JSON-Export                                          |
| Widerspruch (Art. 21)          | Auf Anfrage; Löschung sofern keine Aufbewahrungspflicht                          |

Anfragen richten an: <!-- FILL: datenschutz@folgederwolke.de oder Vereins-E-Mail -->

## 8.3 Datenschutzbeauftragter

<!-- FILL: Prüfen ob DSB-Pflicht besteht (§ 38 BDSG: > 20 Personen mit regelmäßiger Datenverarbeitung).
Bei gemeinnützigen Vereinen dieser Größe üblicherweise nicht erforderlich.
Falls kein DSB: Verantwortlicher ist der 1. Vorstand. -->

Verantwortlicher i.S.d. DSGVO: <!-- FILL: Name + Anschrift Vorstand -->

## 8.4 Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO)

Vollständiges VVT: [`docs/legal/verzeichnis-verarbeitungstaetigkeiten.md`](../legal/verzeichnis-verarbeitungstaetigkeiten.md)

## 8.5 Auftragsverarbeitung (Art. 28 DSGVO)

Alle Dienstleister, die personenbezogene Daten im Auftrag verarbeiten,
sind im DPA-Tracker erfasst: [`docs/legal/auftragsverarbeitung/README.md`](../legal/auftragsverarbeitung/README.md)

**Release-Gate**: `PUBLIC_FORM_ENABLED=true` darf im Produktionsbetrieb nur gesetzt werden,
wenn AVV mit Vercel und Neon unterzeichnet und im DPA-Tracker als `signed` markiert sind.
Die Umgebungsvariable `DPA_GATE_PASSED` muss auf `true` gesetzt werden (Checkliste in DPA-README).

## 8.6 Datenschutzerklärung

Öffentliche Datenschutzerklärung: `/datenschutz` (separate Route, nicht Teil dieser Verfahrensdoku).

<!-- FILL: URL nach Live-Gang eintragen: https://buchhaltung.folgederwolke.de/datenschutz -->

Empfehlung: Juristisch prüfen lassen, insbesondere Formulierungen zu

- Art und Umfang der Datenverarbeitung im öffentlichen Formular
- Hinweis auf Google Drive als Speicherort für Belege
- Aufbewahrungsfristen

## 8.7 Technische und organisatorische Maßnahmen (TOM)

Vollständiger TOM-Katalog: [`docs/legal/tom-katalog.md`](../legal/tom-katalog.md)
