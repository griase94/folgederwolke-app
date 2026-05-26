# Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO)

**Verantwortlicher:** Folge der Wolke e.V., Westermühlstraße 6, 80469 München  
**Stand:** 2026-05 (Phase 7.5)  
**Erstellt durch:** Andy Griesbeck (Technischer Betreiber)

---

## VVT-1: Auslagen-Einreichung

| Feld                      | Inhalt                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Bezeichnung**           | Erfassung und Bearbeitung von Auslagen-Einreichungen durch Vereinsmitglieder und Externe                  |
| **Zweck**                 | Erstattung von Vereinsausgaben; GoBD-konforme Buchführung                                                 |
| **Rechtsgrundlage**       | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung Mitgliedschaft); Art. 6 Abs. 1 lit. f (Externe)             |
| **Betroffene Personen**   | Vereinsmitglieder; externe Einreicher (z.B. Gastmusiker)                                                  |
| **Datenkategorien**       | Name, E-Mail-Adresse, IBAN (bei Erstattung), Betrag, Verwendungszweck, Beleg-Datei (Foto/PDF)             |
| **Empfänger**             | Kassenwart und Vorstand (intern); Auftragsverarbeiter: Neon (DB), Vercel (Hosting), Google Drive (Belege) |
| **Drittlandübermittlung** | Nein (alle Dienste EU-Region oder SCCs)                                                                   |
| **Löschfrist**            | Buchungsdaten: 10 Jahre (§ 147 AO); Personendaten ohne Buchungsbezug: nach Zweckerfüllung                 |
| **TOMs**                  | Siehe [TOM-Katalog](tom-katalog.md)                                                                       |
| **DB-Tabellen**           | `auslagen_submissions`, `expenses`, `audit_log`                                                           |

---

## VVT-2: Mitglieder-Verwaltung

| Feld                      | Inhalt                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Bezeichnung**           | Verwaltung der Vereinsmitgliedschaften und Mitgliedsbeiträge                                                                              |
| **Zweck**                 | Vereinsverwaltung; Mitgliedsbeitrags-Abrechnung; Kommunikation mit Mitgliedern                                                            |
| **Rechtsgrundlage**       | Art. 6 Abs. 1 lit. b DSGVO (Mitgliedschaftsvertrag)                                                                                       |
| **Betroffene Personen**   | Aktive und ehemalige Vereinsmitglieder                                                                                                    |
| **Datenkategorien**       | Vorname, Nachname, E-Mail, IBAN, Telefon, Adresse, Geburtsdatum, Rolle im Verein, Eintrittsdatum, Austrittsdatum, Mitgliedsbeitragsstatus |
| **Empfänger**             | Kassenwart und Vorstand (intern); Auftragsverarbeiter: Neon (DB), Vercel (Hosting)                                                        |
| **Drittlandübermittlung** | Nein                                                                                                                                      |
| **Löschfrist**            | Aktive Mitglieder: während Mitgliedschaft; nach Austritt: 3 Jahre (Verjährungsfristen); Beitragsdaten: 10 Jahre (§ 147 AO)                |
| **TOMs**                  | Siehe [TOM-Katalog](tom-katalog.md)                                                                                                       |
| **DB-Tabellen**           | `members`, `member_beitrags`                                                                                                              |

---

## VVT-3: Buchhaltung (Einnahmen und Ausgaben)

| Feld                      | Inhalt                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bezeichnung**           | GoBD-konforme Einnahmen-Überschuss-Rechnung (EÜR)                                                                                                                                    |
| **Zweck**                 | Steuerrechtliche Buchführungspflicht (§§ 140–147 AO); Nachweis Gemeinnützigkeit                                                                                                      |
| **Rechtsgrundlage**       | Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung)                                                                                                                                |
| **Betroffene Personen**   | Kassenwart, Vorstand, Mitglieder (als Kostenstellen), Kunden (Rechnungsempfänger), Lieferanten                                                                                       |
| **Datenkategorien**       | Name/Firmenname, Adresse, Betrag, Verwendungszweck, Zahlungsweg, Sphäre, Buchungsjahr, Beleg-Referenz                                                                                |
| **Empfänger**             | Kassenwart, Vorstand (intern); Steuerberater (extern, auf Anfrage); Finanzamt (EÜR-Abgabe); Auftragsverarbeiter: Neon, Vercel (Hosting + Blob für Ausgangsrechnungen/Belege in fra1) |
| **Drittlandübermittlung** | Nein                                                                                                                                                                                 |
| **Löschfrist**            | 10 Jahre (§ 147 AO, § 14b UStG) — keine Löschung, nur Anonymisierung wenn möglich                                                                                                    |
| **TOMs**                  | Siehe [TOM-Katalog](tom-katalog.md)                                                                                                                                                  |
| **DB-Tabellen**           | `expenses`, `income`, `donations`, `invoices`, `customers`, `kategorien`, `files` (Blob-Index: Belege + Ausgangsrechnungen)                                                          |

---

## VVT-4: Magic-Link-Authentifizierung

| Feld                      | Inhalt                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Bezeichnung**           | Passwortlose Anmeldung für Admin-Benutzer via E-Mail-Link                                                   |
| **Zweck**                 | Sicherer Zugang zum Admin-Bereich; Verhinderung unbefugten Zugriffs                                         |
| **Rechtsgrundlage**       | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung: Systemzugang für Admins)                                     |
| **Betroffene Personen**   | Admin-Benutzer (Kassenwart, Vorstand)                                                                       |
| **Datenkategorien**       | E-Mail-Adresse, IP-Adresse-Präfix (gekürzt), User-Agent-Hash, Sitzungstoken (verschlüsselt), Zeitstempel    |
| **Empfänger**             | Intern (System); Auftragsverarbeiter: Neon (Token-Speicherung), Vercel (Logs), SMTP-Anbieter (Link-Versand) |
| **Drittlandübermittlung** | Nein                                                                                                        |
| **Löschfrist**            | Sitzungsdaten: nach Ablauf (Session-Cookie TTL); Audit-Log: 10 Jahre                                        |
| **TOMs**                  | Siehe [TOM-Katalog](tom-katalog.md)                                                                         |
| **DB-Tabellen**           | `users`, `audit_log` (action: sign_in, magic_link_issue, magic_link_verify)                                 |

---

## VVT-5: E-Mail-Versand (Transaktionsmails)

| Feld                      | Inhalt                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Bezeichnung**           | Automatischer Versand von Transaktionsmails (Eingangsbestätigung, Erstattungsbenachrichtigung, Magic-Link, Zuwendungsbestätigung) |
| **Zweck**                 | Information der Betroffenen über Vorgänge; Authentifizierung; Steuer-Pflichtdokumente                                             |
| **Rechtsgrundlage**       | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung); Art. 6 Abs. 1 lit. c (Zuwendungsbestätigungen)                                    |
| **Betroffene Personen**   | Auslagen-Einreicher, Mitglieder, Admin-Benutzer, Spendenempfänger                                                                 |
| **Datenkategorien**       | E-Mail-Adresse, Name (in Mail-Anrede), Betrag, Buchungsdaten (in Mail-Body), Sitzungstoken (Magic-Link)                           |
| **Empfänger**             | Betroffene Person (Empfänger); Auftragsverarbeiter: SMTP-Anbieter (v1: Vereins-Hoster; v2: Resend)                                |
| **Drittlandübermittlung** | Nein (SMTP-Hoster DE; Resend EU-Region)                                                                                           |
| **Löschfrist**            | `sent_mails`-Log: 3 Jahre; Mail-Inhalte beim Provider: gemäß Provider-Retention                                                   |
| **TOMs**                  | Siehe [TOM-Katalog](tom-katalog.md)                                                                                               |
| **DB-Tabellen**           | `sent_mails`                                                                                                                      |

---

## VVT-6: Server-Logs (Infrastruktur)

| Feld                      | Inhalt                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| **Bezeichnung**           | Automatische Server-Logs durch Vercel-Infrastruktur                        |
| **Zweck**                 | Betriebssicherheit, Fehlerdiagnose, Sicherheitsüberwachung                 |
| **Rechtsgrundlage**       | Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse: IT-Sicherheit)         |
| **Betroffene Personen**   | Alle Nutzer der Anwendung (Admins, Formular-Einreicher)                    |
| **Datenkategorien**       | IP-Adresse, HTTP-Methode und Pfad, Timestamp, HTTP-Status-Code, User-Agent |
| **Empfänger**             | Auftragsverarbeiter: Vercel (automatisch, 30 Tage Retention)               |
| **Drittlandübermittlung** | Vercel ist US-Unternehmen; EU-Region-Verarbeitung + SCCs                   |
| **Löschfrist**            | 30 Tage (Vercel-Standard-Retention)                                        |
| **TOMs**                  | Keine App-seitige Steuerung; Vercel TOM gelten                             |
| **DB-Tabellen**           | — (außerhalb App-Datenbank)                                                |

---

## VVT-7: Backup

| Feld                      | Inhalt                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Bezeichnung**           | Tägliche verschlüsselte Datenbank-Sicherung                                                                                              |
| **Zweck**                 | Datensicherung gemäß GoBD, Schutz vor Datenverlust                                                                                       |
| **Rechtsgrundlage**       | Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung: GoBD-Aufbewahrungspflicht)                                                         |
| **Betroffene Personen**   | Alle Personen, deren Daten in der Datenbank gespeichert sind                                                                             |
| **Datenkategorien**       | Vollständiger Datenbank-Dump (alle Tabellen) — age-verschlüsselt                                                                         |
| **Empfänger**             | Technischer Betreiber (Entschlüsselung nur mit 1Password-Key); Auftragsverarbeiter: GitHub (verschlüsselt), Google Drive (verschlüsselt) |
| **Drittlandübermittlung** | GitHub: US-Unternehmen; Daten verschlüsselt (age) → kein lesbarer Personenbezug für GitHub                                               |
| **Löschfrist**            | Backup-Dateien: 10 Jahre; danach sichere Löschung                                                                                        |
| **TOMs**                  | age-Verschlüsselung (X25519); privater Schlüssel in 1Password, nicht in Code oder CI-Secrets                                             |
| **DB-Tabellen**           | Alle (als verschlüsselter Dump)                                                                                                          |
