# Abschnitt 11 — Notfall-Konzept

> Detaillierte Prozeduren in [RUNBOOK.md](../RUNBOOK.md). Dieser Abschnitt gibt den organisatorischen Rahmen.

## 11.1 Notfallszenarien

| Szenario                             | Priorität | Verantwortlich                     | RUNBOOK-Abschnitt                |
| ------------------------------------ | --------- | ---------------------------------- | -------------------------------- |
| Systemausfall (App nicht erreichbar) | Hoch      | Technischer Betreiber              | Emergency Stop / Vercel Rollback |
| Datenbankausfall                     | Sehr hoch | Technischer Betreiber              | Restore from Backup              |
| Kompromittierung von Credentials     | Sehr hoch | Technischer Betreiber              | Rotate Secrets                   |
| Manipulationsverdacht Buchungsdaten  | Sehr hoch | Kassenwart + Technischer Betreiber | Investigate Audit Chain Break    |
| Datenpanne (Leak)                    | Sehr hoch | Vorstand + Technischer Betreiber   | → Abschnitt 10.2                 |
| Verlust des Admin-Zugangs            | Hoch      | Technischer Betreiber              | Rotate Secrets (SESSION_SECRET)  |

## 11.2 Kontakte im Notfall

<!-- FILL: Kontaktdaten eintragen.

| Rolle | Name | Erreichbarkeit |
|---|---|---|
| Technischer Betreiber | Andy Griesbeck | andy.griesbeck@gmail.com / <!-- FILL: Telefon --> |

| Kassenwart | <!-- FILL --> | <!-- FILL --> |
| 1. Vorstand | <!-- FILL --> | <!-- FILL --> |
| Vercel Support | — | https://vercel.com/support |
| Neon Support | — | https://neon.tech/support |
| BayLDA (Datenschutz) | — | https://www.lda.bayern.de/ |
-->

## 11.3 Wiederherstellungszeit (RTO/RPO)

| Maßnahme                          | RTO (Recovery Time Objective) | RPO (Recovery Point Objective)   |
| --------------------------------- | ----------------------------- | -------------------------------- |
| Vercel Rollback                   | < 5 Minuten                   | 0 (kein Datenverlust)            |
| Neon Point-in-Time-Restore        | < 30 Minuten                  | bis zu 24h (7-Tage-Fenster)      |
| Restore aus pg_dump-Backup        | < 2 Stunden                   | 24h (letztes nächtliches Backup) |
| Beleg-Wiederherstellung aus Drive | < 1 Stunde                    | 0 (Drive-eigene Redundanz)       |

## 11.4 Notfall-Stop des öffentlichen Formulars

Das öffentliche Formular kann sofort deaktiviert werden:

```bash
# In Vercel Dashboard: PUBLIC_FORM_ENABLED auf false setzen
# Oder über Vercel CLI:
vercel env add PUBLIC_FORM_ENABLED false production
vercel redeploy --prod
```

Oder über ABORT-Sentinel während des autonomen Builds:

```bash
touch ~/.folgederwolke-build/state/ABORT
```

## 11.5 Datensicherungs-Verfahren

Vollständige Restore-Prozedur: [RUNBOOK.md — Restore from Backup](../RUNBOOK.md).

Kurzfassung:

1. Backup-Datei aus GitHub-Backup-Repo oder Drive laden
2. Mit age-Schlüssel (1Password) entschlüsseln
3. `pg_restore` gegen neue Neon-Branch-Datenbank
4. Audit-Chain-Integrität prüfen (RUNBOOK §4)
5. Anwendung auf neue Datenbank umschalten

## 11.6 Kommunikation im Notfall

<!-- FILL: Kommunikationsplan festlegen.
- Ab wann werden Vereinsmitglieder informiert?
- Wer kommuniziert nach außen (Presseanfragen)?
- Vorlage für Datenpannen-Benachrichtigung erstellen?
-->
