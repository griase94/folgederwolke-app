# Auftragsverarbeitung (Art. 28 DSGVO)

Folge der Wolke e.V. setzt folgende Auftragsverarbeiter ein. Für jeden
wird die im jeweiligen Anbieter-Dashboard hinterlegte Standard-DPA
("click-AVV") akzeptiert. Eine signierte Papier-AVV ist für die Anbieter
unter (1–3) nicht erforderlich; ihre Online-AVVs erfüllen Art. 28 DSGVO.

| Anbieter        | Dienst                                 | Personenbezogene Daten                                    | AVV-Quelle                                                                            |
| --------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Vercel Inc.** | Hosting / Edge-Funktionen / HTTP-Logs  | Mitglieder-E-Mails, IP-Adressen (Logs), Formular-Daten    | https://vercel.com/legal/dpa                                                          |
| **Neon Inc.**   | PostgreSQL-Datenbank (EU Frankfurt)    | Alle DB-Felder (Mitglieder, Auslagen, Spenden, Audit-Log) | https://neon.tech/privacy                                                             |
| **Google LLC**  | Google Drive (Belege + PDFs + Backups) | Beleg-Dateien, generierte PDFs, Backup-Dumps              | https://cloud.google.com/terms/data-processing-addendum                               |
| **udag GmbH**   | SMTP-Versand (info@folgederwolke.de)   | Empfänger-E-Mailadressen, Mail-Inhalte                    | siehe AGB des Mail-Hosters                                                            |
| **GitHub Inc.** | Code-Repository, CI/CD                 | Kein produktiver Personenbezug (Code + Test-Fixtures)     | https://docs.github.com/site-policy/privacy-policies/github-data-protection-agreement |

## Was wir tun

Andy akzeptiert die click-AVVs bei Vercel und Neon im jeweiligen
Dashboard, bevor der öffentliche `/auslage-einreichen`-Pfad für Externe
freigeschaltet wird. Eine PDF-Kopie der AVV-Bestätigung wird im
Vereins-Drive unter `Vereinsverwaltung/AVV/` abgelegt.

## Was wir nicht tun (bewusst entschieden, 2026-05-19)

- Wir führen keinen separaten DPA-Status-Tracker (z. B. Spreadsheet,
  Trello) — die Online-Dashboards der Anbieter sind die maßgebliche
  Quelle.
- Wir haben keinen `DPA_GATE_PASSED`-Mechanismus mehr im Code, der
  PUBLIC_FORM_ENABLED zusätzlich gated. Die ursprüngliche Auslegung
  ("formales Release-Gate") war für einen 10-Personen-Verein
  übertrieben.

Für die zugehörige Risikoabschätzung siehe
[`docs/verfahrensdokumentation/aktennotiz.md`](../../verfahrensdokumentation/aktennotiz.md).
