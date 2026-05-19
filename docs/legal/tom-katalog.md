# TOM-Katalog (Art. 32 DSGVO)

Übersicht über die technisch-organisatorischen Maßnahmen des Vereins.
Bewusst kurz gehalten — für einen ~10-Personen-Verein angemessen.

## Zugang & Zugriff

- **Authentifizierung**: Magic-Link-Login per E-Mail; keine Passwörter,
  keine Session-Token in URLs. Magic-Link gültig 15 min, einmalig.
- **Autorisierung**: feste Admin-Allowlist (`ADMIN_EMAILS` env);
  Nicht-Admins erhalten beim Login eine generische Erfolgsmeldung
  (Anti-Enumeration), aber keinen funktionalen Zugang.
- **Session-Lebensdauer**: idle 7 Tage, absolut 30 Tage; jeder Request
  prüft Admin-Status neu (Allowlist-Änderungen wirken sofort).

## Vertraulichkeit & Integrität

- TLS für sämtliche Verbindungen (HTTPS via Vercel; Postgres über
  `sslmode=require`).
- Datenbank-Rolle `app_runtime` hat nur CRUD, keine DDL und keine
  UPDATE/DELETE/TRUNCATE auf `audit_log` (append-only).
- Audit-Log mit Hash-Chain (ADR-0004) erkennt nachträgliche Mutationen
  innerhalb der DB.
- IP-Adressen werden vor Persistenz auf /24 (IPv4) bzw. /48 (IPv6)
  reduziert (`actor_ip_prefix`).

## Verfügbarkeit

- Hosting: Vercel + Neon Postgres (EU Frankfurt). Neon bietet
  Point-in-Time-Recovery innerhalb der Plan-Retention.
- Zusätzlich nächtlicher `pg_dump` in einen Drive-Ordner des
  Kassenwarts (Konfiguration siehe Issue #31).

## Pseudonymisierung & Löschung

- DSGVO-Auskunfts- und Löschungspfade liegen unter `/app/dsgvo`
  (Admin-only).
- Löschanfrage löscht User-Datensatz, redigiert verknüpfte Audit-Log-
  Felder (ohne den Hash-Chain zu brechen).

## Auftragsverarbeitung

Siehe [`auftragsverarbeitung/README.md`](./auftragsverarbeitung/README.md).

## Datenpannen

Meldung an [BayLDA](https://www.lda.bayern.de) innerhalb von 72 h, falls
ein Verlust personenbezogener Daten festgestellt wird. Kontakt:
poststelle@lda.bayern.de.
