# Abschnitt 2 — DV-Systemumgebung

> Auto-populated from codebase and deployment configuration. Update when infrastructure changes.

## 2.1 Anwendungsarchitektur

| Schicht            | Technologie      | Version |
| ------------------ | ---------------- | ------- |
| Frontend + Backend | SvelteKit        | 2.x     |
| Sprache            | TypeScript       | 5.x     |
| Laufzeit           | Node.js          | 20 LTS  |
| Paketmanager       | pnpm             | 10      |
| Build-Tool         | Vite + Turbopack | —       |

## 2.2 Infrastruktur

| Dienst                         | Anbieter                       | Zweck                               | Region         |
| ------------------------------ | ------------------------------ | ----------------------------------- | -------------- |
| Hosting / Serverless Functions | Vercel                         | App-Auslieferung, Server-Actions    | Frankfurt (EU) |
| Datenbank                      | Neon (PostgreSQL 16)           | Primäre Datenhaltung                | EU (Frankfurt) |
| Dateiablage                    | Google Drive (OAuth as Andy)   | Belege, Rechnungs-PDFs, Backup      | EU-Datencenter |
| E-Mail (v1)                    | SMTP via info@folgederwolke.de | Transaktionsmails                   | DE-Hoster      |
| E-Mail (v2, geplant)           | Resend                         | Transaktionsmails (DNS-verifiziert) | EU             |
| CI/CD                          | GitHub Actions                 | Automatisierte Tests + Backup       | US (GitHub)    |
| Backup                         | GitHub (privates Repo)         | pg_dump-Archiv                      | US (GitHub)    |

## 2.3 Zugriffsrollen (Datenbank)

Definiert in `drizzle/0002_roles.sql`. Drei Rollen:

| Rolle         | Rechte                                                          |
| ------------- | --------------------------------------------------------------- |
| `app_runtime` | CRUD auf alle Tabellen; INSERT-only auf `audit_log`             |
| `app_migrate` | Vollständiges DDL; nur für Migrationen via `scripts/migrate.ts` |
| `app_export`  | SELECT auf alle Tabellen; Steuerexport + Backup                 |

## 2.4 Softwareversionen und Abhängigkeiten

Vollständige Abhängigkeitsliste: `package.json` (root).  
Gesperrte Versionen: `pnpm-lock.yaml`.  
Sicherheits-Scan: GitHub Dependabot + `security.yml` Workflow.

## 2.5 Netzwerk und Verschlüsselung

- Alle HTTP-Verbindungen erzwingen TLS 1.2+ (Vercel-Default + HSTS)
- Datenbankverbindung: `sslmode=require` (in `DATABASE_URL`)
- Backup-Dumps: age-verschlüsselt (Empfänger-Schlüssel in `.env`: `BACKUP_AGE_RECIPIENT`; privater Schlüssel in 1Password)
- Session-Cookies: `HttpOnly; Secure; SameSite=Strict`; Secret in `SESSION_SECRET`

## 2.6 Deployment-Prozess

```
git push phase-* → GitHub Actions CI (typecheck + lint + unit + e2e)
                 → Vercel Preview Deploy
                 → PR Review + Merge to main
                 → Vercel Production Deploy (automatisch)
```

Rollback: `vercel rollback <deployment-url>` (< 60 Sekunden).  
Notfall-Stop: siehe [RUNBOOK.md — Emergency Stop](../RUNBOOK.md).

## 2.7 Datensicherung

Nightly pg_dump (02:30 UTC) via `.github/workflows/db-backup.yml`:

1. `pg_dump --format=custom` auf Neon-Datenbank (role: `app_export`)
2. age-Verschlüsselung mit `BACKUP_AGE_RECIPIENT`
3. Push in privates GitHub-Backup-Repository
4. Upload in Google Drive Backup-Ordner

Aufbewahrungsdauer: mindestens 10 Jahre (GoBD § 14b UStG).  
Restore-Test: täglich in CI via `scripts/restore-smoke.sh`.
