# Abschnitt 5 — Internes Kontrollsystem (IKS)

<!-- FILL: Diesen Abschnitt bitte mit Andy/Kassenwart ausarbeiten. Vorlage unten. -->

## 5.1 Überblick

Das interne Kontrollsystem (IKS) stellt sicher, dass alle buchführungsrelevanten
Vorgänge vollständig, richtig und zeitgerecht erfasst werden und dass
unbefugte Änderungen erkannt werden.

Grundprinzipien:

- **Vier-Augen-Prinzip** bei Ausgaben über einem definierten Schwellenwert
- **Festschreibung** (ADR-0006): Buchungsjahre können nach Jahresabschluss nicht mehr geändert werden
- **Unveränderliche Audit-Kette** (ADR-0004): Jede Aktion wird kryptographisch geloggt
- **Rollenbasierter Zugriff**: Nur Admins (Vorstand/Kassenwart) können Ausgaben genehmigen

## 5.2 Genehmigungs-Workflow Auslagen

```
Einreichung (form/app)
  → Status: zu_pruefen
  → Kassenwart/Admin prüft Beleg und Betrag
  → Status: geprueft (approve_action mit audit_log)
  → Überweisung durch Kassenwart (extern, außerhalb des Systems)
  → Status: erstattet (erstattet_am gesetzt)
```

<!-- FILL: Schwellenwerte für Vier-Augen-Pflicht festlegen. Beispiel:
- Bis €50: Kassenwart allein genehmigungsberechtigt
- Ab €50: Zweite Unterschrift (weiteres Vorstandsmitglied)
- Ab €500: Vorstandsbeschluss erforderlich
-->

## 5.3 Zugriffskontrolle

| Aktion                           | Berechtigung                                           |
| -------------------------------- | ------------------------------------------------------ |
| Auslagen einreichen              | Öffentlich (wenn `PUBLIC_FORM_ENABLED=true`) oder Auth |
| Auslagen einsehen                | Admin (`user_role=admin`)                              |
| Auslagen genehmigen/ablehnen     | Admin                                                  |
| Ausgaben buchen                  | Admin                                                  |
| Jahresabschluss (Festschreibung) | Admin                                                  |
| Mitglieder verwalten             | Admin                                                  |
| Systemeinstellungen              | Admin                                                  |
| Datenbankzugriff direkt          | Technischer Betreiber (andy.griesbeck@gmail.com)       |

## 5.4 Plausibilitätsprüfungen

Das System führt folgende automatische Prüfungen durch:

- **Belegpflicht**: Ausgaben-Formulare fordern Upload-Feld (client + server-seitig)
- **Betrag > 0**: CHECK-Constraint in Datenbank
- **Sphere-Pflicht**: `sphere_snapshot NOT NULL`
- **Kategorie-Pflicht**: `kategorie_name_snapshot NOT NULL`
- **Festschreibung-Sperre**: Route-Actions prüfen `settings.festgeschrieben_bis` vor Schreibzugriff (ADR-0006)
- **business_id Eindeutigkeit**: UNIQUE-Constraint verhindert Doppelbuchungen (ADR-0010)

## 5.5 Periodische Kontrollen

<!-- FILL: Konkrete Kontrollintervalle und Verantwortliche festlegen. Beispiel:

| Kontrolle | Häufigkeit | Verantwortlich |
|---|---|---|
| Kontoauszug-Abgleich | Monatlich | Kassenwart |
| Belegvollständigkeit offener Ausgaben | Monatlich | Kassenwart |
| Audit-Log-Review (ungewöhnliche Aktionen) | Vierteljährlich | Vorstand |
| Backup-Restore-Test (manuell, produktionsnah) | Halbjährlich | Technischer Betreiber |
| Jahresabschluss + Festschreibung | Jährlich (März) | Kassenwart + Vorstand |
-->

## 5.6 Abweichungsbehandlung

<!-- FILL: Beschreiben, wie mit Abweichungen (falsche Buchung, doppelter Beleg,
falscher Betrag) umgegangen wird. Storno-Prozess via ADR-0006 (`supersedes_id`). -->

_Korrekturen nach Festschreibung: Storno-Zeile + neue korrekte Zeile.
Beide Zeilen bleiben im System (GoBD-Unveränderbarkeits-Anforderung).
Storno-Verknüpfung über `supersedes_id` FK._
