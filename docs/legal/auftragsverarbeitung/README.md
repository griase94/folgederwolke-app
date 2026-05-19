# Auftragsverarbeitung (Art. 28 DSGVO) — DPA Tracker

Folge der Wolke e.V. setzt folgende Auftragsverarbeiter ein, die personenbezogene Daten
im Auftrag des Vereins verarbeiten. Für jeden ist ein Auftragsverarbeitungsvertrag (AVV)
abzuschließen bzw. zu akzeptieren.

## Release-Gate

**`PUBLIC_FORM_ENABLED=true` darf im Produktionsbetrieb ERST gesetzt werden, wenn
Vercel-AVV und Neon-AVV den Status `signed` haben.**

Prüfung vor Deploy:

```bash
# Manuell prüfen: beide Einträge in dieser Tabelle auf "signed"
grep -E "Vercel|Neon" docs/legal/auftragsverarbeitung/README.md
```

Die Umgebungsvariable `DPA_GATE_PASSED=true` in `.env.production` und Vercel
erst setzen, wenn beide kritischen AVVs unterschrieben sind.

---

## AVV-Status

| #   | Anbieter        | Dienst                              | Personenbezogene Daten                                         | AVV-Typ                                | Status           | Datum | Fundstelle                                                                               |
| --- | --------------- | ----------------------------------- | -------------------------------------------------------------- | -------------------------------------- | ---------------- | ----- | ---------------------------------------------------------------------------------------- |
| 1   | **Vercel Inc.** | Hosting, Serverless Functions, Logs | Mitglieder-E-Mails, IP-Adressen (Logs), Formular-Daten         | DPA im ToS (Data Processing Agreement) | `TODO`           | —     | https://vercel.com/legal/dpa                                                             |
| 2   | **Neon Inc.**   | PostgreSQL Datenbank                | Alle personenbezogenen DB-Felder (Mitglieder, Auslagen, Mails) | DPA im ToS                             | `TODO`           | —     | https://neon.tech/privacy                                                                |
| 3   | **Google LLC**  | Google Drive (Belege, PDFs)         | Beleg-Dateien (können personenbezogene Daten enthalten)        | Google Cloud DPA                       | `TODO`           | —     | https://cloud.google.com/terms/data-processing-addendum                                  |
| 4   | **Resend Inc.** | E-Mail-Versand (v2, geplant)        | Empfänger-E-Mailadressen, Mail-Inhalte                         | DPA im ToS                             | `NOT_YET_NEEDED` | —     | https://resend.com/legal/dpa                                                             |
| 5   | **GitHub Inc.** | CI/CD, Backup-Repository            | Backup-Dumps (verschlüsselt, kein Plaintext-Personenbezug)     | GitHub DPA                             | `LOW_PRIORITY`   | —     | https://docs.github.com/en/site-policy/privacy-policies/github-data-protection-agreement |

Status-Werte: `TODO` | `IN_PROGRESS` | `signed` | `NOT_YET_NEEDED` | `LOW_PRIORITY`

---

## Schritte zum Abschluss

### 1. Vercel DPA (KRITISCH — vor PUBLIC_FORM_ENABLED)

1. Vercel Dashboard → Settings → Legal → Data Processing Agreement
2. DPA als PDF herunterladen und prüfen
3. DPA akzeptieren / unterzeichnen (digitale Signatur im Dashboard)
4. PDF-Kopie in Google Drive ablegen: `Vereinsverwaltung/AVV/Vercel-DPA-YYYY.pdf`
5. Status in dieser Datei auf `signed` + Datum setzen

### 2. Neon DPA (KRITISCH — vor PUBLIC_FORM_ENABLED)

1. Neon Console → Settings → Security → Data Processing Agreement
2. DPA prüfen (Neon ist EU-kompatibel: Standard Contractual Clauses)
3. DPA akzeptieren
4. PDF-Kopie ablegen: `Vereinsverwaltung/AVV/Neon-DPA-YYYY.pdf`
5. Status in dieser Datei auf `signed` + Datum setzen

### 3. Google Cloud DPA

1. Google Cloud Console → IAM → Data Processing Amendment
2. Alternativ: Google Workspace Admin → Account → Legal
3. DPA für das verwendete Google-Konto akzeptieren
4. Status auf `signed` setzen

### 4. Resend DPA (wenn MAIL_PROVIDER=resend aktiviert wird)

Vor Umstellung auf Resend: DPA unter https://resend.com/legal/dpa prüfen und akzeptieren.

---

## Technische Kontextinformation

### Welche Daten gehen wohin?

**Vercel:**

- HTTP-Request-Logs (IP-Adresse, User-Agent, Timestamps) — 30 Tage Retention
- Server-Side Rendering und API-Calls laufen in Vercel Functions (EU Frankfurt)
- Keine Persistenz von Personendaten in Vercel selbst (nur Durchleitung zur DB)

**Neon:**

- Alle Daten in `members`, `expenses`, `auslagen_submissions`, `users`, `sent_mails`, `audit_log`
- Region: EU (Frankfurt / AWS eu-central-1)
- Backup durch Neon: eigene Snapshots + unsere pg_dump-Backups

**Google Drive:**

- Beleg-Dateien (Fotos/PDFs von Kassenbons, Eingangsrechnungen)
- Rechnungs-PDFs (Ausgangsrechnungen)
- Backup-Dumps (age-verschlüsselt — kein Plaintext-Personenbezug)
- OAuth-Scope: `drive.file` (nur Dateien, die die App selbst erstellt hat)

**GitHub:**

- Backup-Dumps sind age-verschlüsselt → kein lesbarer Personenbezug
- CI-Logs enthalten keine Personendaten
- DPA LOW_PRIORITY: verschlüsselte Daten gelten datenschutzrechtlich als angemessen geschützt
