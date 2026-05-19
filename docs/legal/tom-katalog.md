# TOM-Katalog (Art. 32 DSGVO)

**Technische und organisatorische Maßnahmen zum Schutz personenbezogener Daten**

**Verantwortlicher:** Folge der Wolke e.V., Westermühlstraße 6, 80469 München
**Stand:** 2026-05 (Phase 7.5)

---

## 1. Zutrittskontrolle

_Verhinderung des Zutritts Unbefugter zu Datenverarbeitungsanlagen._

| Maßnahme                                        | Umsetzung                                                    | Status    |
| ----------------------------------------------- | ------------------------------------------------------------ | --------- |
| Serverless-Architektur (kein physischer Server) | Vercel Serverless Functions — kein Rechenzentrum des Vereins | Umgesetzt |
| Neon-Datenbankzugriff nur über TLS              | `sslmode=require` in `DATABASE_URL`                          | Umgesetzt |
| Kein physischer Zugang zu Infrastruktur         | Vollständig cloudbasiert (Vercel, Neon, GitHub)              | Umgesetzt |

---

## 2. Zugangskontrolle

_Verhinderung der Nutzung von Datenverarbeitungssystemen durch Unbefugte._

| Maßnahme                                            | Umsetzung                                                            | Status    |
| --------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| Passwortlose Authentifizierung (Magic Link)         | Kein Passwort-Speicher; Token einmalig + zeitbegrenzt                | Umgesetzt |
| E-Mail-Allowlist für Admin-Zugang                   | `ADMIN_EMAILS` Umgebungsvariable; serverseitige Prüfung              | Umgesetzt |
| Session-Cookies HttpOnly + Secure + SameSite=Strict | SvelteKit Session-Konfiguration                                      | Umgesetzt |
| Session-Secret rotierbar                            | `SESSION_SECRET` in Vercel Secrets; Rotations-Prozedur in RUNBOOK §1 | Umgesetzt |
| Audit-Log für alle Sign-In/Sign-Out Events          | `audit_log` action: `sign_in`, `sign_out`, `magic_link_verify`       | Umgesetzt |

---

## 3. Zugriffskontrolle (Autorisierung)

_Sicherstellung, dass Berechtigte nur auf die ihnen zustehenden Daten zugreifen._

| Maßnahme                           | Umsetzung                                                                                       | Status    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| Rollenbasierter Zugriff (RBAC)     | `user_role` enum: `admin`, `steuerberater`, `member_self_service`                               | Umgesetzt |
| Datenbankrollen (Least Privilege)  | `app_runtime` (kein DELETE auf audit_log), `app_export` (SELECT only), `app_migrate` (DDL only) | Umgesetzt |
| Route-Guards für alle Admin-Seiten | SvelteKit `load()`-Funktionen prüfen Session vor jedem Response                                 | Umgesetzt |
| Öffentliches Formular Feature-Flag | `PUBLIC_FORM_ENABLED` — kann sofort deaktiviert werden                                          | Umgesetzt |
| Steuerberater-Rolle (read-only)    | `user_role=steuerberater` hat keine Schreibrechte                                               | Umgesetzt |

---

## 4. Trennungskontrolle

_Getrennte Verarbeitung von Daten für unterschiedliche Zwecke._

| Maßnahme                              | Umsetzung                                                    | Status    |
| ------------------------------------- | ------------------------------------------------------------ | --------- |
| Sphären-Trennung (steuerrechtlich)    | `sphere` enum pro Buchungszeile; automatische EÜR-Trennung   | Umgesetzt |
| Buchhaltungsdaten vs. Mitgliederdaten | Separate Tabellen (`expenses`/`income` vs. `members`)        | Umgesetzt |
| Preview vs. Production (Vercel)       | Separate Deployment-URLs; Production-Daten nur in Production | Umgesetzt |

---

## 5. Pseudonymisierung / Anonymisierung

| Maßnahme                                  | Umsetzung                                                                             | Status    |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| IP-Adressen im Audit-Log gekürzt          | `actor_ip_prefix` (nur Prefix, nicht vollständige IP)                                 | Umgesetzt |
| User-Agent im Audit-Log gehasht           | `actor_ua_hash` (SHA-256, nicht Klartext)                                             | Umgesetzt |
| Backup-Dumps verschlüsselt                | age-Verschlüsselung (`BACKUP_AGE_RECIPIENT`); Klartextdaten nur lokal entschlüsselbar | Umgesetzt |
| Anonymisierung ausgeschiedener Mitglieder | Phase 2 (geplant) — bis dahin: Soft-Delete via `austritts_datum`                      | Geplant   |

---

## 6. Verschlüsselung

| Maßnahme                            | Umsetzung                                                  | Status    |
| ----------------------------------- | ---------------------------------------------------------- | --------- |
| TLS 1.2+ für alle HTTP-Verbindungen | Vercel HSTS + automatisches TLS                            | Umgesetzt |
| TLS für Datenbankverbindung         | Neon `sslmode=require`                                     | Umgesetzt |
| Backup-Verschlüsselung              | age (X25519 Elliptic Curve)                                | Umgesetzt |
| Secrets in Umgebungsvariablen       | Vercel Encrypted Secrets; 1Password für lokale Entwicklung | Umgesetzt |
| Kein Plaintext-Secret in Git        | `.env` in `.gitignore`; Secrets nie im Repository          | Umgesetzt |

---

## 7. Integrität

| Maßnahme                                 | Umsetzung                                                              | Status                |
| ---------------------------------------- | ---------------------------------------------------------------------- | --------------------- |
| Audit-Log Hash-Kette (ADR-0004)          | SHA-256 Chain: `row_hash = SHA256(prev_hash \|\| canonical_json(row))` | Umgesetzt (Phase 7.5) |
| Festschreibung (ADR-0006)                | Jahresabschluss sperrt alle Buchungen des Jahres für Änderungen        | Umgesetzt             |
| business_id UNIQUE-Constraint (ADR-0010) | Verhindert Doppelbuchungen                                             | Umgesetzt             |
| CHECK-Constraints für kritische Felder   | Betrag > 0, bezahlt_von_kind Konsistenz (ADR-0007)                     | Umgesetzt             |
| Input-Validierung (Zod)                  | Alle Server-Actions validieren Eingaben per Zod-Schema                 | Umgesetzt             |

---

## 8. Verfügbarkeit und Belastbarkeit

| Maßnahme                        | Umsetzung                                                      | Status    |
| ------------------------------- | -------------------------------------------------------------- | --------- |
| Hochverfügbare Datenbank        | Neon Serverless HA (automatisches Failover)                    | Umgesetzt |
| CDN + globale Edge-Distribution | Vercel Edge Network                                            | Umgesetzt |
| Nightly Backup mit Restore-Test | `.github/workflows/db-backup.yml` + `scripts/restore-smoke.sh` | Umgesetzt |
| Neon Point-in-Time-Restore      | 7-Tage-Fenster in Neon Console                                 | Umgesetzt |
| Vercel Instant Rollback         | `vercel rollback` < 60 Sekunden                                | Umgesetzt |
| Monitoring / Healthcheck        | `GET /healthz` (Phase 0) + Vercel Deployment-Checks            | Umgesetzt |

---

## 9. Wiederherstellbarkeit

| Maßnahme                                   | Umsetzung                                      | Status    |
| ------------------------------------------ | ---------------------------------------------- | --------- |
| Vollständige Restore-Prozedur dokumentiert | RUNBOOK.md §2                                  | Umgesetzt |
| Täglicher Smoke-Restore-Test in CI         | `scripts/restore-smoke.sh` + CI-Job            | Umgesetzt |
| Beleg-Dateien in Drive (eigene Redundanz)  | Google Drive built-in Redundanz + Backup-Kopie | Umgesetzt |

---

## 10. Überprüfbarkeit / Auditierbarkeit

| Maßnahme                     | Umsetzung                                        | Status    |
| ---------------------------- | ------------------------------------------------ | --------- |
| Vollständiger Audit-Trail    | `audit_log` für alle buchungsrelevanten Aktionen | Umgesetzt |
| Tamper-Evidence Hash-Kette   | ADR-0004; Überprüfung via RUNBOOK §4             | Umgesetzt |
| Dependency-Scanning          | GitHub Dependabot + `security.yml` Workflow      | Umgesetzt |
| Regelmäßige Security-Reviews | `.github/workflows/security.yml`                 | Umgesetzt |

---

## 11. Organisatorische Maßnahmen

| Maßnahme                          | Umsetzung                                                 | Status         |
| --------------------------------- | --------------------------------------------------------- | -------------- |
| Verfahrensdokumentation           | `docs/verfahrensdokumentation/` (12 Abschnitte)           | Umgesetzt      |
| VVT Art. 30 DSGVO                 | `docs/legal/verzeichnis-verarbeitungstaetigkeiten.md`     | Umgesetzt      |
| AVV mit Auftragsverarbeitern      | `docs/legal/auftragsverarbeitung/README.md`               | In Bearbeitung |
| Schulung der Nutzer               | `docs/verfahrensdokumentation/09-mitarbeiter-schulung.md` | Skeleton       |
| Datenschutzerklärung              | `/datenschutz` Route                                      | Umgesetzt      |
| Need-to-know-Prinzip              | Nur Kassenwart/Vorstand haben Admin-Zugang                | Umgesetzt      |
| Aufbewahrungsfristen dokumentiert | Abschnitt 7 Verfahrensdoku + VVT                          | Umgesetzt      |
