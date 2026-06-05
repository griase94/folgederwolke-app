# Abschnitt 1 — Organisatorische Grundlagen

## 1.1 Angaben zum Verein

| Feld             | Wert                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Vereinsname      | Folge der Wolke e.V.                                                                         |
| Steuernummer     | 143/215/10028                                                                                |
| Registernummer   | VR 211227                                                                                    |
| Sitz             | c/o Jonas Hackenberg, Westermühlstraße 6, 80469 München                                                            |
| Finanzamt        | Finanzamt München (zuständig für gemeinnützige Körperschaften)                               |
| Gemeinnützigkeit | Bestätigt; Bescheid-Typ und Datum in `.env` (`VEREIN_BESCHEID_TYP`, `VEREIN_BESCHEID_DATUM`) |

## 1.2 Verantwortliche

| Funktion              | Zuständigkeit                                                         |
| --------------------- | --------------------------------------------------------------------- |
| Kassenwart            | Buchführung, Belegsicherung, Jahresabschluss, Verfahrensdoku-Pflege   |
| 1. Vorstand           | Freigabe Jahresabschluss, Festschreibung (`festschreibung`-Action)    |
| Technischer Betreiber | Andy Griesbeck — Systemadministration, Deploydienst, Datenbankzugriff |

<!-- FILL: Namen der aktuellen Amtsträger eintragen. Jährlich aktualisieren. -->

## 1.3 Buchführungspflicht

Der Verein ist gemäß § 140 AO i.V.m. § 27 Abs. 3 BGB verpflichtet,  
ordnungsgemäß Bücher zu führen. Als gemeinnütziger Verein unterliegt er  
zusätzlich den Anforderungen der GoBD (BMF-Schreiben vom 28.11.2019).

Buchführungsart: **vereinfachte Einnahmen-Überschuss-Rechnung (EÜR)**  
Buchungszeitraum: Kalenderjahr (01.01.–31.12.)  
Basiswährung: EUR (Cent-genaue Integer-Speicherung, ADR-0003)

## 1.4 Externe Prüfer

<!-- FILL: Name und Kontakt des beauftragten Steuerberaters oder Buchprüfers eintragen, sofern vorhanden. -->

_Derzeit: kein externer Buchprüfer. Steuerberater wird für Jahresabschluss ≥ 2025 beauftragt._

## 1.5 Geltungsbereich

Diese Verfahrensdokumentation gilt für alle buchführungsrelevanten Vorgänge,  
die über die folgederwolke-app erfasst werden:

- Auslagen-Einreichungen (Ausgaben) durch Mitglieder
- Rechnungsstellung an Kunden
- Spendenerfassung und Zuwendungsbestätigungen
- Mitgliedsbeitragsverwaltung
- Einnahmen (Einnahmen-Erfassung durch Kassenwart)
