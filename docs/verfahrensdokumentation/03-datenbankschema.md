# Abschnitt 3 — Datenbankschema

> Auto-populated from `src/lib/server/db/schema/`. Migrations in `drizzle/`.

## 3.1 Tabellenübersicht

| Tabelle                | Beschreibung                                                | GoBD-relevant        |
| ---------------------- | ----------------------------------------------------------- | -------------------- |
| `expenses`             | Ausgaben (Auslagen, Eingangsrechnungen)                     | Ja — Kernbuchhaltung |
| `income`               | Einnahmen                                                   | Ja — Kernbuchhaltung |
| `donations`            | Spenden + Zuwendungsbestätigungen                           | Ja                   |
| `invoices`             | Ausgangsrechnungen                                          | Ja                   |
| `invoice_jobs`         | Async PDF-Generierungsjobs                                  | Nein                 |
| `auslagen_submissions` | Öffentliche Auslagen-Einreichungen                          | Ja — Eingangskanal   |
| `members`              | Vereinsmitglieder                                           | Eingeschränkt        |
| `member_beitrags`      | Mitgliedsbeiträge (tall table, 1 Zeile pro Mitglied+Jahr)   | Ja                   |
| `customers`            | Rechnungsempfänger                                          | Ja                   |
| `projects`             | Projekte für Sphären-Zuordnung                              | Nein                 |
| `kategorien`           | Buchungskategorien                                          | Nein                 |
| `zahlungsarten`        | Zahlungswege (Bank, Bar, PayPal, …)                         | Nein                 |
| `audit_log`            | Append-only Prüfpfad (ADR-0004)                             | Ja — GoBD § 239      |
| `settings`             | Vereinsparameter (JSONB Key-Value)                          | Eingeschränkt        |
| `sent_mails`           | E-Mail-Idempotenz-Log (ADR-0005)                            | Nein                 |
| `import_runs`          | Sheet-Import-Protokoll                                      | Nein                 |
| `id_counters`          | Sequenzzähler für Business-IDs                              | Nein                 |
| `sphere_overrides`     | Sphären-Korrekturen post-Festschreibung (Phase 2, ADR-0008) | Eingeschränkt        |

## 3.2 Schlüsselfelder (GoBD-Relevanz)

### expenses

| Spalte                    | Typ                    | Bedeutung                                                |
| ------------------------- | ---------------------- | -------------------------------------------------------- |
| `business_id`             | `text UNIQUE NOT NULL` | Unveränderliche Geschäfts-ID (ADR-0010)                  |
| `gebucht_am`              | `timestamptz NOT NULL` | Buchungszeitpunkt (Europe/Berlin via `year_for_booking`) |
| `year_of_buchung`         | `integer GENERATED`    | Buchungsjahr (abgeleitet, STORED)                        |
| `betrag_cents`            | `bigint NOT NULL`      | Betrag in Cent (ADR-0003)                                |
| `sphere_snapshot`         | `sphere enum NOT NULL` | Sphäre zum Buchungszeitpunkt (ADR-0002)                  |
| `kategorie_name_snapshot` | `text NOT NULL`        | Kategorie-Name zum Buchungszeitpunkt                     |
| `festgeschrieben_at`      | `timestamptz`          | Zeitpunkt der Festschreibung (ADR-0006)                  |
| `source`                  | `source_kind enum`     | Herkunft (app / form / sheet_import / fixture)           |
| `status`                  | `status enum`          | Workflow-Status                                          |

### audit_log

| Spalte          | Typ                 | Bedeutung                                            |
| --------------- | ------------------- | ---------------------------------------------------- |
| `chain_seq`     | `integer`           | Sequenznummer in der Hash-Kette                      |
| `prev_hash`     | `text`              | SHA-256 des Vorgänger-Eintrags                       |
| `row_hash`      | `text`              | SHA-256 dieses Eintrags (Unveränderbarkeitsnachweis) |
| `action`        | `audit_action enum` | Aktion (create/update/delete/approve/…)              |
| `actor_user_id` | `uuid`              | Handelnder Benutzer                                  |
| `occurred_at`   | `timestamptz`       | Ereigniszeitpunkt                                    |

## 3.3 Enumerationen

Definiert in `src/lib/server/db/schema/enums.ts`:

- `sphere`: `ideeller | vermoegen | zweckbetrieb | wirtschaftlich`
- `status`: `zu_pruefen | in_pruefung | geprueft | abgelehnt | importiert | erstattet`
- `member_role`: `vorstand | kassenwart | schriftfuehrer | mitglied | fördermitglied`
- `audit_action`: `create | update | delete | approve | reject | reimburse | import | festschreibung | storno | sign_in | sign_out | magic_link_issue | magic_link_verify`
- `source_kind`: `app | form | sheet_import | fixture`
- `bezahlt_von_kind`: `verein | member | extern`

## 3.4 Migrationshistorie

| Migration                                        | Inhalt                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `0000_init.sql`                                  | Initiales Schema (alle Kerntabellen)                         |
| `0001_phase2_additions.sql`                      | Phase-2-Erweiterungen                                        |
| `0002_roles.sql`                                 | Datenbankrollen (`app_runtime`, `app_migrate`, `app_export`) |
| `0003_phase2_constraints.sql`                    | CHECK-Constraints (ADR-0007, ADR-0010)                       |
| `0004_members_contact_columns.sql`               | Kontakt-Spalten Mitglieder                                   |
| `0005_invoices_pdf_bytes.sql`                    | PDF-Bytes auf Rechnungen                                     |
| `0006_phase5_projects_customers_soft_delete.sql` | Soft-Delete Projekte/Kunden                                  |
| `0007_eur_views.sql`                             | EUR-Ansichten                                                |
| `0008_views.sql`                                 | Weitere Datenbankansichten                                   |

Alle Migrationen sind idempotent und versioniert. Tool: `drizzle-kit`.
