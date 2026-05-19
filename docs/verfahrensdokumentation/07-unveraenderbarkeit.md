# Abschnitt 7 — Unveränderbarkeit und Aufbewahrung

> Auto-populated from ADR-0004, ADR-0006, and database role definitions.

## 7.1 GoBD-Anforderung

GoBD Tz. 64–68: Buchungen dürfen nach Erfassung nicht ohne Nachweis geändert werden.
Änderungen müssen so protokolliert werden, dass Original und Änderung erkennbar sind.

## 7.2 Technische Unveränderbarkeits-Maßnahmen

### 7.2.1 Datenbankrollen (Least Privilege)

`drizzle/0002_roles.sql` entzieht der Laufzeit-Rolle kritische Rechte:

```sql
-- app_runtime hat kein UPDATE/DELETE auf Kernbuchhaltungstabellen
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime;
-- expenses und income: UPDATE nur auf Workflow-Status-Felder
-- (vollständige Einschränkungen: Phase 7.5 REVOKE-Migrationen)
```

### 7.2.2 Festschreibung (ADR-0006)

- Kassenwart führt Jahresabschluss durch: `POST /app/einstellungen/festschreibung`
- Alle Einträge des betroffenen Buchungsjahres erhalten `festgeschrieben_at = NOW()`
- Danach verweigern alle Route-Actions Schreibzugriffe auf das gesperrte Jahr
- Storno + Neubuchung bleibt möglich (erzeugt neue Zeilen, verändert keine alten)

### 7.2.3 Hash-Kette im Audit-Log (ADR-0004)

Jeder `audit_log`-Eintrag enthält:

```
row_hash = SHA-256(prev_hash || canonical_json(row_without_hash_columns))
```

- Trigger `audit_log_chain_trigger` berechnet `chain_seq`, `prev_hash`, `row_hash`
- Advisory Lock (`pg_advisory_xact_lock`) serialisiert parallele Inserts
- Genesis-Row-Marker in `settings.audit_chain_genesis_at`

**Prüfung**: Eine Hash-Kette kann mit folgendem Query verifiziert werden (RUNBOOK §4):

```sql
SELECT chain_seq, row_hash, prev_hash
FROM audit_log
ORDER BY chain_seq;
-- Externe Verifikation: jede row_hash recomputen und mit gespeichertem Wert vergleichen
```

### 7.2.4 Business-ID Unveränderlichkeit (ADR-0010)

`business_id` ist `UNIQUE NOT NULL` und wird nach INSERT nie geändert.
Format: `AUS-YYYY-NNNNN` (Auslagen), `EIN-YYYY-NNNNN` (Einnahmen), etc.
Vergabe über `id_counters`-Tabelle (atomare Sequenz).

## 7.3 Aufbewahrungsfristen

| Datenart                             | Frist                  | Rechtsgrundlage         |
| ------------------------------------ | ---------------------- | ----------------------- |
| Buchungsbelege (Ausgaben, Einnahmen) | 10 Jahre               | § 147 Abs. 1 Nr. 4–5 AO |
| Jahresabschlüsse / EÜR-Exporte       | 10 Jahre               | § 147 Abs. 1 Nr. 1 AO   |
| Ausgangsrechnungen                   | 10 Jahre               | § 14b UStG              |
| Zuwendungsbestätigungen              | 10 Jahre               | § 50 Abs. 4 EStDV       |
| Kontoauszüge                         | 10 Jahre               | § 147 Abs. 1 Nr. 5 AO   |
| Mitgliederlisten (aktive Mitglieder) | Bis Austritt + 3 Jahre | DSGVO, vereinsrechtlich |
| E-Mail-Logs (`sent_mails`)           | 3 Jahre                | Verjährungsfristen      |
| Audit-Log                            | 10 Jahre               | GoBD, § 147 AO          |

## 7.4 Datenlöschung

- **Pflicht zur Löschung**: Personenbezogene Daten ausgeschiedener Mitglieder nach Ablauf der Aufbewahrungsfrist (DSGVO Art. 17)
- **Technische Umsetzung**: Soft-Delete via `austritts_datum`; nach Ablauf Anonymisierung (Phase 2)
- **Buchungsdaten**: Werden nicht gelöscht — nur anonymisiert falls Personenbezug entfernbar
- **Backup-Löschung**: Backup-Dateien nach 10 Jahren aus Drive + GitHub-Backup-Repo löschen

## 7.5 Datensicherungs-Nachweis

Nightly Backup-Log: GitHub Actions Workflow-Run-Protokoll (`.github/workflows/db-backup.yml`).
Restore-Smoke-Test: täglich in CI (`scripts/restore-smoke.sh`).
Letzter erfolgreicher Restore: siehe GitHub Actions CI-Badge.
