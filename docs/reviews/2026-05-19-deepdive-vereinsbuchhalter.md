# Deep-Dive: folgederwolke-app durch die Brille der Vereinsbuchhalterin

**Datum:** 2026-05-19
**Reviewer:** senior Vereinsbuchhalter (~30 gemeinnützige Vereine, EÜR-Routine, BMF-Bescheinigungen, §64-Freigrenze-Watching)
**Audience:** Andy + Vorstand "Folge der Wolke e.V." — 10–15 Mitglieder, < €25k/Jahr
**Methode:** Code-Lese (`src/lib/server/`, `src/routes/app/`), Screenshots aus `2026-05-19-julia-screenshots/`, Quervergleich mit ADRs

> Disclaimer: Ich bin der Bookkeeper, nicht der Anwalt. Wo es um §-Auslegung geht (GoBD-Reality, Aufwandsspenden-Verzicht, §64-Freigrenze), schreibe ich, wie es bei meinen Vereinen tatsächlich gelebt wird — die Verein-Legal-Review (`2026-05-19-pragmatic-rebalance-verein-legal.md`) ist die zweite Stimme.

---

## 1. TL;DR — die fünf Änderungen, die Julia (Kassenwartin) heute glücklich machen würden

1. **Die `/app/jahresabschluss/[year]`-Seite ist heute eine Sphere-Tabelle + Festschreibungs-Knopf. Das ist NICHT die EÜR-Seite, die ich als Kassenwartin will.** Ich will: pro Sphäre einklappbare Sektion mit *jeder einzelnen Buchung* drin, "Netto-EÜR pro Projekt" als Sub-Drilldown, "Vergleich zum Vorjahr" als Zusatzspalte, Einzel-PDF/CSV-Exporte (nicht nur das große Bundle). Konkretes Mockup unten in §2.1.
2. **Es gibt keinen Jahres-Filter.** Der Dashboard zeigt "Spenden YTD" — schön — aber wenn ich am 15. Februar 2027 sagen muss "wieviel war 2026 nochmal?", muss ich `?year=2026` manuell in die URL tippen oder über die Jahresabschluss-Seite ins Jahr drillen. Sticky Year-Picker in der Topbar (mit "Aktuelles Jahr (2026)" als Default + Sprung-Buttons) — siehe §2.2.
3. **Auf `/app/transactions` sind Einnahmen, Ausgaben und Spenden zusammengewürfelt.** Für die Belegprüfung springe ich konstant zwischen den Tabs. Sinnvoller wäre die Trennung in `/app/ausgaben` und `/app/einnahmen` mit Spenden als Filter-View innerhalb von Einnahmen, ODER (kleinere Änderung) einen sticky URL-Memory pro Tab. Siehe §2.3.
4. **Der Sphere-Pick beim "Neue Transaktion"-Formular ist `<input type="hidden" name="sphereSnapshot" value="ideeller">` — der Kassenwart kann die Sphäre nicht setzen.** Bei Ausgaben kommt die Sphäre über die Kategorie (ADR-0002), aber in `/app/transactions/neu` wird `kategorieNameSnapshot="(Unkategorisiert)"` hartcoded und Sphäre auf `ideeller`. Das ist nicht die EÜR-Realität: jede Druckerpatrone-Ausgabe wandert in `Ideeller Bereich` — auch wenn sie eigentlich Zweckbetrieb-Material ist. Bug oder absichtlich? So oder so: für `/app/transactions/neu` MUSS ein Kategorie-Dropdown her, und damit kommt die Sphäre dann sauber aus `kategorien.sphere`.
5. **"Mark as paid" ist ein Mehrschritt-SEPA-Modal — aber bei Bar-Erstattung will ich einen Ein-Klick-Toggle.** Heute: Auswahl-Checkboxen → "Markieren als erstattet"-Button → Datum + Zahlungsart picken → Submit. Für Vorgänge wo der Schatzmeister sagt "ja stimmt, hab ich heute überwiesen", ein Row-Level "✓ Bezahlt"-Button mit Zahlungsart-Dropdown direkt in der Zeile + Toast mit 5s-Undo (die Architektur ist da, nur das UI fehlt).

Wenn ich nur EINE Sache wählen müsste: **#1 (EÜR-Seite richtig bauen)**. Ein Verein lebt vom Jahresabschluss; die EÜR ist das Dokument, das man dem Vorstand zeigt, der Kassenprüfung zeigt und dem Steuerberater zeigt. Heute ist sie eine Vier-Zeilen-Tabelle und ein ZIP-Download.

---

## 2. Andys drei explizite Gaps — konkrete UX-Vorschläge

### 2.1 EÜR-Seite (`/app/jahresabschluss/[year]`)

**Heute:** `EurSummary.svelte` rendert 4 Sphere-Zeilen + Gesamt-Summe + zwei Buttons (Bundle-ZIP, GoBD-Export) + Festschreibungs-Block. Das ist eine Zusammenfassung, keine Arbeitsfläche.

**Was ich will (als Kassenwartin):** Eine Seite, auf der ich VOR dem Festschreiben **alles sehe und prüfen kann**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Jahresabschluss                                                        │
│                                                                          │
│ Buchungsjahr 2026          [offen]                                       │
│ Folge der Wolke e.V.                                                     │
│                                                                          │
│ [📊 Übersicht] [📑 Buchungsliste] [💸 Spenden] [📦 Exporte]              │
│ ─────────────────────────────────────────────────────────                │
│                                                                          │
│ ▼ Übersicht (Default-Tab)                                                │
│                                                                          │
│   Gesamtbild                                                             │
│   ┌──────────────┬──────────┬──────────┬─────────────┐                   │
│   │ Sphäre       │ Einnahm. │ Ausgaben │ Überschuss  │  vs 2025          │
│   ├──────────────┼──────────┼──────────┼─────────────┤                   │
│   │ Ideeller     │ 8.420 €  │ 3.110 €  │ +5.310 €    │  +12 %    [▸]    │
│   │ Vermögen     │   210 €  │     0 €  │   +210 €    │   −4 %    [▸]    │
│   │ Zweckbetrieb │ 4.180 €  │ 4.090 €  │    +90 €    │   +8 %    [▸]    │
│   │ Wirtsch. GB  │   870 €  │   620 €  │   +250 €    │  +35 %    [▸]    │
│   ├──────────────┼──────────┼──────────┼─────────────┤                   │
│   │ Gesamt       │13.680 €  │ 7.820 €  │ +5.860 €    │  +11 %           │
│   └──────────────┴──────────┴──────────┴─────────────┘                   │
│                                                                          │
│   ⚠ WGB-Freigrenze (§64 Abs. 3 AO, 2026: 50.000 €):                       │
│      870 € von 50.000 € → 1,7 % ausgenutzt   [im grünen Bereich]         │
│                                                                          │
│   📁 Pro Projekt (Top 5)                                                 │
│   ┌─────────────────────────┬──────────┬──────────┬─────────────┐        │
│   │ Festival 2026           │ 3.890 €  │ 3.620 €  │   +270 €    │        │
│   │ Sommerakademie          │ 2.100 €  │ 1.840 €  │   +260 €    │        │
│   │ Mitgliedschaftsbeitr.   │ 5.060 €  │     0 €  │ +5.060 €    │        │
│   │ Spenden (zweckfrei)     │ 2.420 €  │     0 €  │ +2.420 €    │        │
│   │ Raummiete (keine Proj.) │     0 €  │ 1.800 €  │ −1.800 €    │        │
│   └─────────────────────────┴──────────┴──────────┴─────────────┘        │
│                                                                          │
│   📋 Status zur Festschreibung                                           │
│   ✓ Alle 47 Auslagen geprüft (0 offen)                                   │
│   ✓ Alle genehmigten Auslagen erstattet (0 offen)                        │
│   ✓ Kassenprüfung-Protokoll hochgeladen                                  │
│   ⚠ 3 Spenden ohne Bescheinigung erstellt (Spender bekommt nichts)       │
│   ⚠ 1 Buchung ohne Beleg (E-2026-014, 35 €)                              │
│                                                                          │
│   [Jahresabschluss schließen (festschreiben)]                            │
│                                                                          │
│ ▼ Buchungsliste (Tab 2)                                                  │
│   Filter: [Alle Sphären ▾] [Alle Kategorien ▾] [Sortierung ▾]            │
│   ┌─────────┬─────────────┬───────────────┬─────────┬─────────┬────────┐ │
│   │ Datum   │ Business-ID │ Bezeichnung   │ Sphäre  │ Kat.    │ Betrag │ │
│   └─────────┴─────────────┴───────────────┴─────────┴─────────┴────────┘ │
│   (sortierbar, exportierbar als CSV)                                     │
│                                                                          │
│ ▼ Spenden (Tab 3)                                                        │
│   Spenden-Tabelle mit Bescheinigungs-Spalte                              │
│                                                                          │
│ ▼ Exporte (Tab 4)                                                        │
│   [⬇ Bundle ZIP (alles)]                                                 │
│   [⬇ EÜR PDF (nur Übersicht für Vorstand/Kassenprüfung)]                 │
│   [⬇ EÜR CSV (für Steuerberater-Import)]                                 │
│   [⬇ Buchungsliste CSV]                                                  │
│   [⬇ Spendenliste CSV]                                                   │
│   [⬇ GoBD-Z3 IDEA-XML]                                                   │
│   [⬇ Kassenprüfung-Mappe PDF] ← NEU, siehe §4.8                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Konkrete Implementierungs-Empfehlungen:**

- Default-Tab "Übersicht" ist die heutige `EurSummary`, ERWEITERT um (a) "vs Vorjahr"-Spalte, (b) WGB-Freigrenze-Block (gleicher Widget wie auf Dashboard, aber im Jahresjahr-Kontext), (c) Top-5-Projekt-Tabelle (`income.projectId`/`expenses.projectId` GROUP BY → name + sphere), (d) "Status zur Festschreibung"-Checkliste.
- "Vorjahresvergleich": einfach `SELECT * FROM v_eur_year WHERE year_of_buchung IN (year, year-1)` und in der View gruppieren — der `v_eur_year`-View existiert schon.
- Buchungsliste-Tab ist `listTransactions({ year })` ohne Pagination (max 5000 Buchungen pro Jahr für unsere Vereinsgröße ist machbar) + Spalten-Toggle.
- Einzel-Exporte zusätzlich zum Bundle: Der Vorstand will EÜR-PDF allein, der Steuerberater die Buchungsliste-CSV allein. Heute MUSS man die ZIP runterladen, entpacken, das gewünschte Stück rauspulen. Nervig.
- "Status zur Festschreibung"-Checkliste verhindert das schmerzhafte Szenario: Jahr festgeschrieben → später fällt auf, Auslage 035 fehlt → Storno-Workflow → Bescheinigungsnummern müssen neu allokiert werden. Lieber den Kassenwart 30 Sekunden lang lesen lassen, was noch offen ist.

### 2.2 Year-Switching

**Heute:** Berlin-Year wird in jeder Domain-Function selbst berechnet (`berlinYear()` in `dashboard.ts:71`, `spenden.ts:41`). Die Routen `/app/transactions?year=2025` funktionieren (siehe `+page.server.ts:36-37`), aber nichts in der UI führt einen dorthin.

**Was ich will:**

```
Topbar: [Folge der Wolke /  Transaktionen] ····  [2026 ▾]   [🔔]   [👤]
                                                    ├── 2026 (aktuell)
                                                    ├── 2025
                                                    ├── 2024 [festgeschrieben]
                                                    └── ─────────────────
                                                        Alle Jahre
```

**Mechanik:**

- Year-Picker als globales Topbar-Element (rechts von der Suche, links von der Glocke).
- Persistiert in localStorage UND als URL-Query `?year=`. URL gewinnt.
- Beim Wechsel: SvelteKit-`goto` mit neuem `?year=`. Die Page-Loads filtern alle Listen entsprechend.
- "Aktuelles Jahr" (Berlin-Year) ist sticky-Default; wenn ich auf 2025 wechsle und 5 Min später zurückkomme, ist es immer noch 2025.
- Festgeschriebene Jahre sind im Picker mit einem 🔒 markiert.

**Was passiert beim Erfassen mit Datum aus altem Jahr (Andys Frage)?**

Aktuell: `expenses.gebuchtAm` defaults `now()`, `year_of_buchung` ist davon abgeleitet via SQL-Funktion. Wenn ich am 5. Januar 2026 eine Buchung mit `rechnungsdatum=2025-12-29` erfasse, geht sie ins Buchungsjahr **2026** (gebucht_am = heute).

Das ist legitim — `gebucht_am` ist die System-Bookzeit, `rechnungsdatum`/`abflussDatum` ist die fachliche Realität. ABER: der Kassenwart will manchmal **rückwirkend** ins alte Jahr buchen (z.B. Stromrechnung Dez 2025 kommt am 8.1.2026 — gehört auf EÜR 2025 wegen Periodenabgrenzung; für eine EÜR allerdings nicht zwingend, EÜR ist Zufluss/Abfluss-Prinzip).

**Empfehlung:**
- In `/app/transactions/neu` ein optionales Feld `gebuchtAm` (default heute) freischalten — und wenn `year_for_booking(gebuchtAm) != aktivesYear`, eine gelbe Warning anzeigen: "Diese Buchung landet im Jahr 2025, nicht 2026 (aktive Ansicht)." Mit Bestätigungs-Klick.
- Festschreibungs-Gate (`checkFestschreibungGate(year)` in `transactions.ts:773`) ist schon da. Gut.
- Im "2025-View" sollte der "+ Neue Transaktion"-Button als Default `gebuchtAm = 2025-12-31` setzen, NICHT heute. So entsteht weniger Reibung beim Nachbuchen.

### 2.3 Einnahmen/Ausgaben-Übersicht

**Heute:** `/app/transactions` ist die Master-View. Tabs am oberen Rand für Filter ("Alle / Ausgaben / Einnahmen / Spenden"), aber nichts persistiert. Keine dedizierten `/app/einnahmen` oder `/app/ausgaben` Routen.

**Empfehlung — pragmatisch (Andys 10-15-Mitglieder-Vorgabe):** KEINE neuen Routen. Stattdessen den heutigen Tab-State über URL persistieren und die KPI-Karten am Dashboard auf die richtigen vorgefilterten Views verlinken:

- Dashboard-Karte "Zu erstatten" → `/app/transactions?kind=expense&status=geprueft&year=YYYY` (heute: nur `/app/transactions`)
- Dashboard-Karte "Spenden YTD" → `/app/transactions?kind=donation&year=YYYY`
- Dashboard-Karte "Beitrag fällig" → `/app/mitglieder?view=matrix&year=YYYY`

Das vermeidet Code-Duplikation und neue Routen, aber gibt der Kassenwartin **vorgefilterte Klicks** statt "Mach alles selbst".

**Die Tabellen-Spalten** für Ausgaben sollten (nach meiner Erfahrung) sein:

| Datum | AUS-ID | Bezeichnung | Kategorie | Projekt | Sphäre | Bezahlt von | Brutto | Beleg | Status |
|-------|--------|-------------|-----------|---------|--------|-------------|--------|-------|--------|

(Heute fehlen Kategorie, Projekt, Sphäre, Beleg-Spalte als Icon.) Spalten sollten ein-/ausblendbar sein (localStorage), damit auf engem Screen die wichtigen sichtbar bleiben.

Für Einnahmen analog, plus `Geldeingang-Datum` statt `bezahlt von`.

---

## 3. Das Vereinsjahr (Januar → Dezember) — wo das Tool hilft, wo es schmerzt

| Monat | Was passiert beim Verein                          | Was das Tool heute leistet                                       | Friction                                                                              |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Jan   | MV-Vorbereitung, Beitragsrechnungen rausgeschickt | Beitrags-Cron (`cron-tasks.ts`) versendet Reminder              | Kein "alle Mitglieder bekommen identischen Rechnungs-Beleg PDF" — Beitrag = Rechnung mit Bescheinigung wäre nice |
| Feb   | Letzter Beleg vom Vorjahr trudelt ein             | `gebucht_am=now()` landet auf 2026-EÜR                          | Kein UI-Hinweis "Soll das nicht ins 2025-Jahr?"                                       |
| März  | Kassenprüfung durch zwei Mitglieder               | Bundle-ZIP + GoBD-Export verfügbar                              | Kein speziell-formatiertes "Kassenprüfungs-Protokoll-PDF" (siehe §4.8)                |
| Apr   | MV: Vorstandsentlastung                           | Audit-Log existiert, aber kein "Was hat Kassenwart gemacht"-Bericht | siehe §4.10                                                                           |
| Mai   | Festschreibung des Vorjahres                      | 1-Klick-Aktion mit Modal-Bestätigung                            | "Wenn du fertig bist, klicke hier" — aber keine Pre-Flight-Checkliste (siehe §2.1)    |
| Jun   | Sommer-Veranstaltungen, viele Auslagen            | Inbox-Workflow, SEPA-Generator                                  | Manuelle Erfassung jeder Spende — kein Bank-CSV-Import                                |
| Jul   | Ruhe                                              | ✓                                                                | —                                                                                     |
| Aug   | Ruhe                                              | ✓                                                                | —                                                                                     |
| Sep   | Vorbereitung Herbst-Aktionen                       | ✓                                                                | Recurring-Buchungen für Raummiete, Versicherung fehlen                                |
| Okt   | Ausgangs-Rechnungen für Workshops                  | `/app/rechnungen` vorhanden                                     | Mahnwesen für überfällige Rechnungen fehlt komplett                                   |
| Nov   | Spenden-Hochsaison (Steuer-Wirksamkeit Dez)        | Spenden-Modul + Bescheinigungs-Generator vorhanden              | "Sammelbestätigung für alle Spenden eines Spenders im Jahr" fehlt                     |
| Dez   | Letzte Beiträge + Spenden vorm Stichtag            | ✓                                                                | Kein "Erinnerung an Mitglieder mit offenen Beiträgen" automatisiert vor Jahresende    |

---

## 4. Seitenweiser Review

### 4.1 `/app` (Dashboard)

- Die KPI-Karten sind solide. Vier Karten in einer Reihe, klare Zahlen. **Aber**: keine Verlinkung zu vorgefiltertem Kontext (siehe §2.3).
- "Was möchtest du heute tun?" — die Checklist ist gut für leere Vereine; sie wird laut, wenn 15 offene Auslagen + 8 zu erstattende vorliegen. Empfehlung: collapse-bare Sektionen ab > 5 Items.
- "WGB-Freigrenze" — guter Block, ABER das Screenshot zeigt "45.000 €" statt 50.000 (der Code in `dashboard.ts:167` wurde gefixt auf `5_000_000` Cent = 50.000 €). Hier ist Cache/Snapshot vs. Code-Drift; im laufenden System hoffentlich gefixt.
- **Fehlt:** "Neuer Eintrag"-Quick-Action auf dem Dashboard. Cmd+N oder ein Plus-Button (FAB) für schnelle Erfassung — heute muss man immer erst `/app/transactions` → `Neue Transaktion`-Button.

### 4.2 `/app/transactions`

- Tab-Filter funktioniert visuell, aber `localSearch` und `activeKind` sind reines client-state — Refresh verliert den Filter. Sollte URL-getrieben sein.
- Die Liste hat keine Spalten für **Kategorie / Projekt / Sphäre** — nur Bezeichnung / Betrag / Datum / Status / Kategorie (`xl:table-cell` versteckt). Für einen Kassenwart, der jeden Monat 15-20 Buchungen prüft, ist die Sphäre-Spalte (oder zumindest eine farbige Markierung) Gold wert.
- "SEPA XML kopieren" + "Mark als erstattet" Bulk-Workflow ist sauber gebaut (Auswahl → Modal → bulk-Action → 5s Undo). Hut ab.
- **Fehlt:** Inline "Mark this expense as paid" (Bar) als Row-Action — die Architektur (`markExpenseErstattet`) ist da; nur kein Single-Row-UI dafür.

### 4.3 `/app/transactions/neu`

- **Bug oder Designentscheidung?:** `sphereSnapshot` als hidden `value="ideeller"` (Zeile 262), `kategorieNameSnapshot` als hidden `value="(Unkategorisiert)"` (Zeile 261). Es gibt keinen Kategorie-Picker im Formular. Das heißt: jede direkt-erfasste Buchung landet ohne Kategorie und in "Ideeller Bereich" — was die EÜR für Steuer-Zwecke wertlos macht.
- Selbst wenn das Design vorsieht, dass direkt-erfasste Buchungen nachträglich kategorisiert werden — der Workflow dafür ist nicht sichtbar. (Die Edit-Form `TransactionEditForm.svelte` sollte das ermöglichen — aber das ist ein doppelter Klick und ein Zustand "Buchung existiert ohne Sphäre" für unbestimmte Zeit.)
- **Empfehlung:** Kategorie-Picker als Required-Feld; Sphäre kommt automatisch aus `kategorien.sphere` (mit Override-Toggle "Andere Sphäre" für den Project-Override-Case ADR-0008).
- "Bezahlt von" mit Verein/Mitglied/Extern-Tabs ist sehr gut.
- "Sphere assignment ohne Erklärung" — der Kassenwart bei einem Verein, der das Wort "Zweckbetrieb" nicht parat hat, ist verloren. **Brauche Tooltip:** "Ideeller Bereich: Beitrag, Spende, Mitgliederversammlung. Zweckbetrieb: satzungsmäßige Veranstaltung mit Eintritt. Wirtschaftlich: Verkauf von T-Shirts, Sponsoring-Anzeigen."

### 4.4 `/app/mitglieder` (laut Julia-Findings 500 — kann ich nicht selbst öffnen)

- Schema (`members.ts`) und Domain-Layer (`members-actions.ts`) sind sauber: `member_beitrags(member_id, year, betragCents, paidCents)` mit Matrix-View pro 3-Jahres-Fenster.
- Beitrags-Bezahlt-Markierung läuft über separate `mark-beitrag-paid` Action — gut.
- **Was fehlt:** "Copy from previous year" — neue Beitragsjahre für alle aktiven Mitglieder mit gleichem Betrag anlegen ist (laut Code) noch nicht automatisiert für den UI-Workflow. Ein "Jahr 2026 einrichten"-Button auf der Matrix-View, der für jedes aktive Mitglied einen `member_beitrags`-Row mit Vorjahresbetrag erzeugt, ist 5 Minuten Code und spart der Kassenwartin 15-30 Minuten manuelle Klicks.
- **Mahnwesen-Workflow:** Reminder-Cron (`cron-tasks.ts`) verschickt Erinnerungen — gut. Aber: dritte Stufe "wenn 30 Tage nach Mahnung 2 noch offen, Vorstand informieren" fehlt. Für unsere Größe ist das auch OK — Vereins-Mahnwesen ist menschlich, nicht maschinell.

### 4.5 `/app/transactions/spenden`

- Geld + Sach unterstützt; Aufwandsspende explizit auf Phase 2 vertagt (siehe `spenden.ts:91`). Korrektes Scope-Management.
- Bescheinigungs-Workflow: `allocateBescheinigung()` allokiert `B-{YYYY}-{NNN}`, atomisch in Transaktion, idempotent bei Wiederaufruf. Sehr gut.
- BMF-Pflichtfelder werden aus `donations`-Snapshot + env-VEREIN_*-Variablen zusammengebaut. **Aber**: `betragInWorten()` produziert "Ein Euro und neunundneunzig Cent" — die ältere BMF-Vorlage will "Einhundertneunundneunzig Cent" als reine Cent-Schreibung, oder die volle EUR-Form mit "/100 EUR"-Bruchnotation. Hier ist Vorsicht angezeigt; das aktuelle Format wird durchgehen, ich habe aber Steuerberater erlebt, die's ablehnen. Niedrig-Prio, aber prüfen.
- **Workflow-Lücke:** Es gibt keinen automatisierten E-Mail-Versand der Bescheinigung an den Spender. Der PDF wird generiert (in `bescheinigung_pdf_drive_file_id`), aber das Versenden ist manuell — Kassenwart muss PDF runterladen, an Spender mailen. Bei 20 Bescheinigungen/Jahr OK. Bei 80+ nervig.
- **Sammelbestätigung** fehlt komplett. Spender X hat 12× im Jahr 25 € gespendet → man darf laut BMF eine Sammelbestätigung über 300 € ausstellen. Für regelmäßige Förderer ist das DER Workflow.

### 4.6 `/app/inbox` (Audit-Inbox)

- Empty-state ist freundlich ("Alles geprüft" mit Häkchen). Gut.
- Submissions-Liste mit Tastatur-Navigation (Pfeiltasten + Enter laut Comment). Sehr clean.
- **Fehlt:** Bulk-Approve. Wenn ich 5 Auslagen vom gleichen Vereinsmitglied (Maria K., immer Bürobedarf) durchsehe, will ich "Alle 5 prüfen → Alle genehmigen". Heute Einzelklick → Detail-Card → Genehmigen.

### 4.7 `/app/rechnungen`

- Ausgangs-Rechnungen werden als `invoices`-Row + PDF in Drive abgelegt (`invoices.ts`).
- `paid_by_income_id` verlinkt Zahlung — sauberer Reconciliation-Pfad.
- **Lücke:** Kein **Mahnwesen** für überfällige Rechnungen. `faelligkeits_datum` ist im Schema, aber kein Cron-Job-Reminder. Für 5-15 Rechnungen/Jahr per Verein ist das echt wichtig — und nicht-eingegangene Honorare sind oft das "die Email ist hinten in der Mail-Fluten verloren"-Problem.
- **Lücke:** Kein "Zahlungseingang manuell markieren" — der `paid_by_income_id` Link entsteht heute (vermute ich) über manuelles Editieren der Invoice. Sollte ein Workflow sein "Invoice öffnen → 'Als bezahlt markieren' → Einnahme-Row wird automatisch erzeugt + verlinkt".

### 4.8 `/app/jahresabschluss` und `[year]`

- Index-Seite zeigt EINE Karte ("Buchungsjahr 2026 — Offen") (siehe screenshot 28). Das ist eine sehr leere Seite. Sobald 3-4 Jahre Historie da sind, wird sie nützlicher.
- `[year]`-Detail siehe §2.1.
- **Festschreibungs-Modal:** Die Warnung ("Aktion ist nicht rückgängig zu machen") ist gut. Aber: **keine Vorab-Validation**. Was wenn noch 3 Auslagen "approved aber nicht erstattet" sind? Wenn noch Spenden ohne Bescheinigung erstellt sind? Das Modal sagt "Stelle sicher, dass alle Belege geprüft wurden" — aber prüft selbst nichts. Siehe §2.1 für "Status zur Festschreibung"-Checkliste.

### 4.9 Festschreibungs-UX

- Idempotenz: re-running schlägt nicht fehl, gibt 0 Rows zurück. Korrekt.
- **Edit-Versuch nach Festschreibung:** Im Code (`spenden.ts:445-451`, `transactions.ts:773`) wird per `checkFestschreibungGate` geblockt. Fehler-Status 409 mit Message "Buchungsjahr ist festgeschrieben". **Aber** — was sieht der User in der UI? Wenn die Edit-Form gar nicht weiß "das hier ist festgeschrieben", versucht sie zu submitten und kriegt erst nach dem Klick einen Fehler. Bessere UX: Bei festgeschriebenen Buchungen ist die Edit-Form read-only, mit großem Banner "Diese Buchung ist im Buchungsjahr 2025 festgeschrieben (am 5. Mai 2026 durch Julia S.). Korrekturen nur per Storno möglich."
- **Storno-UI:** Existiert offenbar nicht (Code-Search nach `supersedes_id` zeigt: Schema ja, Domain-Function nein). Für `< €25k/Jahr`-Verein-Größe vielleicht akzeptabel, aber der erste "Oops, da steht ein Tippfehler in einer festgeschriebenen Buchung" ist garantiert.

### 4.10 Vorstandsentlastung-Report

- Audit-Log (`auditLog` Schema, Hash-Chain in Phase 7.5) erfasst alle Aktionen. Gut.
- Dashboard zeigt letzte 10 Audit-Entries (`loadRecentActivity()`). Schön für den heutigen Tag, nicht für den Jahres-Bericht.
- **Was fehlt:** Ein "Vorstandsentlastung-Report" PDF, das auf einer Seite zusammenfasst:
  - Anzahl Buchungen (Ausgaben/Einnahmen/Spenden) im Jahr
  - Anzahl Festschreibungs-Aktionen, von wem
  - Anzahl Storno-Aktionen
  - Anzahl Bescheinigungen ausgestellt
  - Login-Aktivität (von wem, wie oft)
  - "Keine ungewöhnlichen Aktivitäten" oder Auflistung bemerkenswerter Events
- Das ist nicht viel Code (1 Query pro Bucket gegen `audit_log` mit year-filter) und macht der MV-Vorbereitung 90 Minuten lang Beine.

### 4.11 GoBD-Reality-Check

- Mein Pragmatismus: Bei einem Verein unter §141 AO ist man **nicht** vollverpflichtet zur GoBD-konformen Software. EÜR + Belege + zeitnahe Erfassung reicht. Was die Verein-Legal-Review sagt, gilt.
- Das Tool produziert dennoch:
  - Hash-Chain im Audit-Log (Phase 7.5) — perfekter Overkill für einen 10-15-Mann-Verein. Schadet nicht.
  - Festschreibung + Storno-Mechanik — das ist GoBD-konform, gleichzeitig 1:1 die "wir machen's einfach richtig"-Mentalität, die jeder Steuerberater liebt.
  - Z3-IDEA-XML-Export im Jahresbundle — für eine eventuelle Betriebsprüfung Premium-Zeug.
- **Was ist Theater?** Die `source_kind`-Provenienz-Snapshots auf jeder Row (ADR-0010). Für einen 10-Mann-Verein im Importer-Setup OK, aber ein direkt-erfassender Kassenwart sieht da nie was. Pragmatik: lassen wie es ist (Code-Aufwand ist eh schon investiert).

### 4.12 Sphere-Assignment-UX

- Heute kommt `sphereSnapshot` über `kategorien.sphere` beim normalen Workflow (Inbox → Auslage → Expense), oder über das Project-Override (ADR-0008).
- In `/app/transactions/neu` wird es hartcoded auf `ideeller` (siehe §2.3/§4.3).
- **Mein Vorschlag — Sphere-Assignment-UI:**
  - Default: Sphäre aus Kategorie (heute schon so).
  - Wenn Projekt ausgewählt → Sphäre aus Projekt-Override (`projects.sphereDefault`), klein angezeigt: "Sphäre vom Projekt 'Festival 2026': Wirtschaftlicher GB".
  - Sphäre-Override-Toggle für den Kassenwart-Edge-Case (z.B. "Diese Anschaffung gehört eigentlich in Vermögensverwaltung").
  - Tooltip-Erklärung pro Sphäre (siehe §4.3).

### 4.13 Aufwandsspende — temporal ordering

- D9 explizit auf Phase 2 vertagt (`spenden.ts:14-16`). Korrekte Entscheidung — Aufwandsspende ist eines der häufigsten Finanzamt-Audit-Themen.
- Wenn implementiert, müssen die folgenden Regeln im Code sein:
  - BFH X R 32/16: Verzicht auf Auslagenerstattung muss **innerhalb von 3 Monaten** nach Aufwand erklärt werden.
  - Verzicht muss schriftlich vorliegen.
  - Die Verein-Satzung muss Aufwandsspenden ausdrücklich zulassen (§55 AO).
- UI-Empfehlung: Bei "Aufwandsspende aus Auslage erstellen" prüfen:
  - `expense.rechnungsdatum` (oder `expense.abflussDatum`) ist < 3 Monate her? Wenn nein → blockieren mit klarem Fehler.
  - Verzichts-Text-Snapshot muss explizit signiert sein (Checkbox "Ich habe den Verzicht schriftlich erhalten" mit Pflichtfeld "Verzichtsdatum").
- Das ist alles im Schema (`donations.aufwandsspendeVerzichtDatum`, `aufwandsspendeVerzichtTextSnapshot`) vorgesehen. Gut.

### 4.14 Rechnungs-Workflow

- Schema (`invoices.ts`) ist umfassend, aber das UI (`/app/rechnungen`) ist Liste + Detail-Edit.
- **Fehlt:**
  - Rechnung-PDF nach Versand per E-Mail: Es gibt `InvoiceVersendetMail`-Template — Workflow scheint da. Gut.
  - Mahnwesen / "Bezahlt"-Markierung (siehe §4.7).
  - **Vorlage / Recurring** für Workshop-Rechnungen: Wenn ich jedes Quartal Workshop-X-Rechnung an dieselbe Kundin schicke, ist "Aus letztem Rechnungs-Eintrag duplizieren" eine 30-Sekunden-Funktion.

---

## 5. Wishlist (Best-Bang-for-Buck-Liste)

Sortiert nach Build-Aufwand × Nutzen für Vereinsbuchhalter. **★** = Andy hat das schon erwähnt.

1. **EÜR-Seite als echte Arbeitsfläche umbauen** (siehe §2.1) — Andys explizite Anfrage ★. Großer Nutzen, mittlerer Aufwand.
2. **Sticky Year-Picker in Topbar** (siehe §2.2) — Andys explizite Anfrage ★. Kleiner Aufwand, großer Nutzen.
3. **Dashboard-KPI-Karten → vorgefilterte Klicks** (siehe §2.3) — Andys explizite Anfrage ★. Trivial-Aufwand, großer Nutzen.
4. **Sphere/Kategorie-Picker in `/app/transactions/neu`** (siehe §4.3) — wichtig, sonst ist die EÜR unverlässlich. Mittel-Aufwand.
5. **Pre-Flight-Checkliste vor Festschreibung** (siehe §2.1, §4.9) — verhindert Storno-Schmerz.
6. **Vorstandsentlastungs-Report PDF** (siehe §4.10) — pre-MV-Vorbereitung. Klein-Aufwand wenn Audit-Log existiert.
7. **"Copy from previous year" für Mitgliedsbeiträge** (siehe §4.4) — 5 Minuten Code, spart 30 Minuten pro Jahr.
8. **Bank-CSV-Import** (DKB / Sparkasse / GLS-Format, Andy-Frage explizit). Wert hoch, Aufwand mittel. Empfehlung: NICHT FinTS/HBCI (zu fragil), sondern manueller CSV-Upload mit Format-Detection + Memory ("der DKB-Header sieht so aus, das ist eine DKB-Datei"). Match heuristisch gegen offene Mitgliedsbeiträge / offene Rechnungen → Vorschlag in UI: "Diese Buchung sieht aus wie Beitrag Maria K. 2026 — markieren als bezahlt?"
9. **Inline "Bezahlt"-Toggle** in Transactions-Liste (siehe §4.2) — eine Zeile + Zahlungsart-Dropdown.
10. **Beleg-Index-Spalte mit Icon** in Transactions-Liste — Augen-Symbol bei vorhandenem Beleg, rotes "!" bei fehlendem. Schon im Code (`belegDriveFileId`), nur Spalte fehlt.
11. **Sphere-Tooltips** überall im Formular (siehe §4.3).
12. **Sammelbestätigung** für regelmäßige Spender — Phase 2.
13. **Recurring Buchungen** (Raummiete monatlich, Versicherung jährlich): Template + Cron-erzeugte Inbox-Entries. Aufwand mittel, Nutzen lokal hoch.
14. **Mahnwesen für Ausgangsrechnungen** (siehe §4.7) — `faelligkeits_datum > 14 Tage offen` → automatischer Mahn-Reminder per Mail.
15. **Cmd+N Quick-Entry-Shortcut** + Cmd+K-Suche-Ergänzung — auf dem Topbar-Pluszeichen.

---

## 6. Was nicht bauen (Anti-Feature-Liste, klein halten)

1. **Doppelte Buchführung / Bilanz / GuV.** §141 AO sagt: < 600k Einnahmen + < 60k Gewinn = EÜR reicht. Für unseren Verein für die nächsten 5 Jahre garantiert nicht relevant.
2. **HBCI/FinTS-Direktanbindung.** Banking-Library-Hölle. Wenn überhaupt, dann CSV-Import (siehe Wishlist #8).
3. **Belegerkennung per OCR.** Klingt sexy, kostet Geld pro Beleg, Genauigkeit < 80 %. Belege werden hochgeladen + manuell beschriftet — das ist 30 Sekunden Mehraufwand pro Beleg und 100 % korrekt.
4. **Multi-Mandant / Mehrere Vereine in einer Installation.** Schema-Annotation `TODO multi-tenant` ist überall — aber für DIESEN Verein nicht relevant. Wenn Andy es eines Tages vermieten will, geht's los.
5. **E-Mail-Server-Integration für inbound Belege.** "Schick einen Beleg an inbox@folgederwolke.de" — schöne Idee, viel Operations-Overhead. Lieber den existierenden `/auslage-einreichen`-Form-Workflow nutzen.
6. **Komplexes Rechte-Modell (CFO / Buchhalter / Vorstand / Lese-Zugang).** Für 10-15 Personen reicht "Kassenwart darf alles + Vorstand kann zuschauen". Heute scheint's sogar simpler: Magic-Link-Auth ohne Rollen-System.
7. **Berichts-Designer / Custom Reports**. Wenn ein bestimmtes Custom-Reporting gebraucht wird → CSV exportieren, in Excel/Numbers basteln. Eingebauter Report-Designer ist Featuritis.

---

**Reviewer Vereinsbuchhalter, signed off — die Code-Basis ist erstaunlich nahe am "competent Verein-Tool". Das was fehlt ist Polish-am-richtigen-Ort (EÜR-Seite, Year-Picker, vorgefilterte Klicks), nicht Tiefen-Architektur.**
