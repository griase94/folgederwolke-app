# Abschnitt 10 — Risikomanagement

<!-- FILL: Risikobewertungen und Maßnahmen mit Vorstand abstimmen und jährlich aktualisieren. -->

## 10.1 Risikoübersicht

| #   | Risiko                                    | Eintrittswahrscheinlichkeit         | Schadensausmaß | Maßnahmen                                                                      |
| --- | ----------------------------------------- | ----------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| R1  | Datenverlust (Datenbank)                  | Gering (Neon HA + tägliches Backup) | Hoch           | Nightly pg_dump, Restore-Smoke-Test täglich, Neon Point-in-Time-Restore 7 Tage |
| R2  | Unbefugter Zugriff auf Admin-Bereich      | Mittel                              | Hoch           | Magic-Link-Auth, Audit-Log, ADMIN_EMAILS-Allowlist, keine Passwörter           |
| R3  | Datenpanne (Leak personenbezogener Daten) | Gering                              | Sehr hoch      | TLS überall, Least-Privilege-Rollen, kein Analytics-Tracking                   |
| R4  | Systemausfall (Vercel/Neon down)          | Gering                              | Mittel         | Vercel SLA 99.99%, Neon Serverless-HA, Rollback < 60s                          |
| R5  | Manipulation von Buchungsdaten            | Sehr gering                         | Sehr hoch      | Audit-Hash-Kette (ADR-0004), Festschreibung (ADR-0006), DB-Rollen              |
| R6  | Verlust von Beleg-Dateien (Drive)         | Gering                              | Hoch           | Drive-eigene Redundanz, Backup in GitHub-Repo                                  |
| R7  | Kompromittierung von Credentials          | Mittel                              | Hoch           | 1Password, Rotation-Prozedur (RUNBOOK §1), keine Plaintext-Secrets in Code     |
| R8  | Fehler im Festschreibungs-Prozess         | Gering                              | Mittel         | Bestätigungs-Dialog, Audit-Log, Storno-Verfahren                               |
| R9  | Öffentliches Formular missbraucht (Spam)  | Mittel                              | Gering         | Rate-Limiting (Vercel WAF), manuelle Prüfung vor Buchung                       |
| R10 | GoBD-Prüfung durch Finanzamt              | Gering                              | Mittel         | Diese Verfahrensdoku, EÜR-Export, vollständiger Audit-Trail                    |

## 10.2 Datenpanne — Meldefristen

Bei Verdacht auf eine Datenpanne (Art. 4 Nr. 12 DSGVO):

1. **0–4h**: Technischen Betreiber (Andy) benachrichtigen → `andy.griesbeck@gmail.com`
2. **0–24h**: Vorstand informieren, Schadensausmaß einschätzen
3. **≤ 72h**: Meldung an Bayerisches Landesamt für Datenschutzaufsicht (BayLDA), falls Risiko für Betroffene
4. **ohne unangemessene Verzögerung**: Benachrichtigung betroffener Personen, falls hohes Risiko

BayLDA Meldestelle: https://www.lda.bayern.de/

<!-- FILL: Verantwortliche Person für Datenpannen-Koordination benennen. -->

## 10.3 Risikoakzeptanz

<!-- FILL: Welche Restrisiken werden bewusst akzeptiert? Beispiel aus D4:
"Öffentliches Formular: €100–400 Schadensrisiko über 5 Jahre wird akzeptiert.
Begründung: manuelle Prüfung vor Erstattung verhindert unberechtigte Auszahlungen."
-->

## 10.4 Revisionshistorie

<!-- FILL: Datum der letzten Risikobewertung + Prüfer eintragen.

| Datum | Prüfer | Änderungen |
|---|---|---|
| 2026-05 | Andy Griesbeck (Technischer Betreiber) | Erstversion (Phase 7.5) |
-->
