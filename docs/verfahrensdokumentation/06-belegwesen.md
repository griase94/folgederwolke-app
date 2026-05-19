# Abschnitt 6 — Belegwesen-Prozess

<!-- FILL: Diesen Abschnitt bitte mit Kassenwart ausarbeiten und an Vereinspraxis anpassen. -->

## 6.1 Belegarten

| Belegart                 | Quelle                                   | Speicherort                        |
| ------------------------ | ---------------------------------------- | ---------------------------------- |
| Kassenbon / Quittung     | Auslagen-Einreicher (Foto/Scan)          | Google Drive, Ordner `Belege/`     |
| Eingangsrechnung         | Lieferant per Mail/Post                  | Google Drive, Ordner `Belege/`     |
| Ausgangsrechnung         | System generiert (PDF via Docs-Template) | Google Drive, Ordner `Rechnungen/` |
| Zuwendungsbestätigung    | System generiert (PDF)                   | Google Drive, Ordner `Spenden/`    |
| Kontoauszug              | Bank (manuell, außerhalb System)         | <!-- FILL: Ablageort -->           |
| Mitgliedsbeitrag-Eingang | Banküberweisung (extern)                 | <!-- FILL: Ablageort -->           |

## 6.2 Beleganforderungen (GoBD)

Jeder Beleg muss folgende Pflichtangaben enthalten oder im System erfasst sein:

- **Datum** des Geschäftsvorfalls (`rechnungsdatum` + `abfluss_datum`)
- **Betrag** in EUR (`betrag_cents`, Cent-genau, ADR-0003)
- **Buchungskategorie** (`kategorie_name_snapshot`, unveränderlich bei Buchung)
- **Sphäre** (`sphere_snapshot`, unveränderlich bei Buchung, ADR-0002)
- **Zahlungsweg** (`zahlungsart_id` + `bezahlt_von_kind`, ADR-0007)
- **Beleg-Datei** (`beleg_drive_file_id`; Pflichtfeld bei Auslagen > <!-- FILL: €-Schwellenwert -->)

## 6.3 Belegerfassung — Schritt-für-Schritt

### Ausgaben (Auslagen durch Mitglieder)

1. Mitglied reicht Beleg über `/form` ein (Foto/PDF-Upload, Betrag, Beschreibung)
2. System erzeugt `auslagen_submissions`-Eintrag, sendet Eingangsmail
3. Kassenwart prüft Beleg im Admin-Bereich (`/app/inbox`)
4. Bei Genehmigung: Kassenwart bucht als `expense` (Status `geprueft`)
5. Kassenwart überweist Betrag (außerhalb System, per Banküberweisung)
6. Kassenwart setzt Status auf `erstattet` + `erstattet_am`

### Ausgaben (direkt durch Kassenwart)

1. Kassenwart erfasst Ausgabe unter `/app/ausgaben/neu`
2. Beleg-Upload direkt im Formular
3. Buchung direkt mit Status `geprueft`

### Einnahmen

<!-- FILL: Prozess für Einnahmen-Erfassung beschreiben. -->

_Einnahmen werden vom Kassenwart manuell unter `/app/einnahmen/neu` erfasst._

## 6.4 Belegaufbewahrung

- **Aufbewahrungsfrist**: 10 Jahre ab Entstehung (§ 147 AO, § 14b UStG)
- **Speicherort**: Google Drive (Ordner-Struktur: `folgederwolke-app/Belege/YYYY/`)
- **Backup**: Täglich in privates GitHub-Repo + Google Drive Backup-Ordner
- **Löschsperre**: `app_runtime`-Rolle hat kein DELETE auf `expenses`, `income`, `audit_log`

## 6.5 Nachträgliche Korrekturen

GoBD verbietet das Überschreiben gebuchter Vorgänge. Korrekturen erfolgen ausschließlich
durch **Storno + Neubuchung**:

1. Original-Zeile bleibt unverändert (Festschreibung via `festgeschrieben_at`)
2. Storno-Zeile mit `supersedes_id` → Original-ID und negativem Betrag
3. Neue korrekte Buchung

Alle drei Zeilen erscheinen im Audit-Log.

## 6.6 Digitale Belegqualität

<!-- FILL: Mindestanforderungen für Scan-/Fotoqualität festlegen, z.B.:
- Mindestauflösung: 150 dpi
- Akzeptierte Formate: PDF, JPG, PNG
- Maximale Dateigröße: 10 MB
- Lesbarkeit: Alle Pflichtfelder müssen erkennbar sein
-->
