# Aktennotiz — Verfahren der digitalen Buchführung

**Verein:** Folge der Wolke e.V.
**Anwendung:** folgederwolke-app
**Stand:** 2026-05-19
**Autor:** Andy Griesbeck (Kassenwart)

> Diese kurze Aktennotiz ersetzt die zuvor angelegte 12-Abschnitt-
> Verfahrensdokumentation. Der Verein ist als gemeinnütziger e.V. mit
> Jahresumsatz im niedrigen fünfstelligen Bereich nicht nach § 141 AO
> buchführungspflichtig. Eine vollständige Verfahrensdokumentation nach
> GoBD ist daher nicht zwingend; die GoBD-Klausel „Aufzeichnung nach Art
> und Umfang" wird durch diese Notiz und die Software-Architektur erfüllt.
>
> Bei Erreichen der § 141 AO-Schwelle (€800k Umsatz / €80k Gewinn) ist
> diese Notiz durch eine vollständige Verfahrensdokumentation zu ersetzen.

---

## 1. Was wird gebucht

Einnahmen aus Mitgliedsbeiträgen, Spenden und gelegentlichen
Veranstaltungserträgen sowie Ausgaben aus Auslagen-Erstattungen,
Honoraren und Sachkosten. Buchungsmethode: Einnahmen-Überschuss-Rechnung
nach § 4 Abs. 3 EStG (Zufluss-Abfluss-Prinzip). Jährliche Buchungszahl
im niedrigen zweistelligen Bereich.

## 2. Welche Software

- **folgederwolke-app** (SvelteKit + PostgreSQL via Neon, gehostet auf
  Vercel). Erfasst alle Buchungen, generiert Rechnungen, EÜR und
  Zuwendungsbestätigungen.
- **Beleg-Archiv**: Google Drive, Vereinsordner unter Andy's privatem
  Google-Konto (anmeldepflichtig).
- **Bankkonto**: GLS Bank Verein-Konto, Online-Banking, monatliche
  Kontoauszüge digital archiviert in Drive.

## 3. Wer hat Zugriff

Vollzugriff (Admin) haben aktuell zwei Personen:

- Andy Griesbeck (Kassenwart) — andy.griesbeck@gmail.com
- Julia Schwarz (Beisitz) — juliaschwarz97@web.de

Externe (z. B. Auslagen-Einreichende) haben Zugriff ausschließlich
über das öffentliche `/auslage-einreichen`-Formular und können ihren
eigenen Status unter `/auslage-status/<AUS-ID>` einsehen.

## 4. Wie wird die Unveränderbarkeit gewährleistet (GoBD § 146 Abs. 4 AO)

- **Festschreibung pro Buchungsjahr**: nach Abschluss eines
  Geschäftsjahres setzt der Kassenwart `settings.festgeschrieben_bis`
  auf das abgeschlossene Jahr. Eine Datenbank-Trigger-Regel verhindert
  ab diesem Zeitpunkt jede Änderung an Buchungen aus diesem oder
  früheren Jahren. Korrekturen erfolgen ausschließlich über Storno-Buchungen
  im aktuellen Jahr.
- **Audit-Log**: jede Änderung (Anlage, Genehmigung, Erstattung,
  Storno) wird in einer separaten, ausschließlich anfügbaren
  `audit_log`-Tabelle festgehalten. Die `app_runtime`-Datenbankrolle
  hat keine `UPDATE` / `DELETE` / `TRUNCATE`-Rechte auf diese Tabelle.

## 5. Wie wird die Nachvollziehbarkeit gewährleistet

Jede Buchung trägt eine fortlaufende `business_id` (Format
`PREFIX-JJJJ-NNN`, z. B. `AUS-2026-007`) und einen Snapshot der
relevanten Kategorisierungs- und Sphärendaten zum Buchungszeitpunkt.
Der `audit_log` referenziert die `business_id` zusätzlich zum
internen UUID, sodass eine Buchung auch nach Datenmodell-Änderungen
identifizierbar bleibt.

## 6. Wie wird die Aufbewahrung gewährleistet (§ 147 AO, 10 Jahre)

- Datenbank: Neon Postgres mit Point-in-Time-Recovery (Plan-Retention
  ~7 Tage Standard; bei Bedarf erweiterbar).
- Belege: Google Drive Vereinsordner, dauerhaft.
- Zusätzliche Sicherung: nächtlicher `pg_dump` in einen Drive-Ordner
  des Kassenwarts (siehe Issue #31 für Konfiguration).
- Zuwendungsbestätigungen werden zusätzlich als PDF im Drive abgelegt.

## 7. Datenschutz (DSGVO)

Verarbeitungstätigkeiten siehe `docs/legal/verzeichnis-verarbeitungstaetigkeiten.md`.
Technische und organisatorische Maßnahmen siehe `docs/legal/tom-katalog.md`.
Datenschutzerklärung siehe `docs/legal/datenschutzerklaerung-versionen/`.

## 8. Notfall

Bei Ausfall der Anwendung oder Verlust von Zugangsdaten:

- Erste Anlaufstelle: Andy Griesbeck (+49-... — Nummer beim Vorstand
  hinterlegt).
- Vertretung: Julia Schwarz.
- Wiederherstellung: über Neon-Konsole (PITR) oder den letzten
  Drive-Backup-Dump (siehe RUNBOOK.md § 2.1 A).

## 9. Versionierung dieser Notiz

Anpassungen werden direkt in dieser Datei vorgenommen und über Git
versioniert. Eine separate Unterschriftenseite oder ein
Steuerberater-Sign-off ist auf dieser Verein-Größe nicht zwingend.

---

**Verweise**

- ADRs: [`docs/adr/`](../adr/)
- RUNBOOK: [`docs/RUNBOOK.md`](../RUNBOOK.md)
- VVT (Art. 30 DSGVO): [`docs/legal/verzeichnis-verarbeitungstaetigkeiten.md`](../legal/verzeichnis-verarbeitungstaetigkeiten.md)
