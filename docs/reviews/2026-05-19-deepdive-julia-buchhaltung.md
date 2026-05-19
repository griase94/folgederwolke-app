# Julia's Buchhaltung-Deepdive — 19. Mai 2026

_Julia Schwarz, Kassenwartin Folge der Wolke e.V., setzt sich an einem Sonntagnachmittag hin und versucht, einen kompletten fiskalischen Workflow durchzugehen. Hier sind ihre Notizen._

---

## TL;DR (für Andys Augen)

Die drei Sachen, die ich dir beim nächsten Essen sagen würde:

1. **Das Dashboard sagt mir nicht, wie es uns dieses Jahr geht.** Ich sehe "Spenden YTD: 0,00 €" und vier KPI-Kacheln zu offenen Aufgaben — aber nirgends "Einnahmen gesamt", "Ausgaben gesamt", "Saldo". Genau das ist doch das Erste, was eine Kassenwartin wissen will, wenn sie morgens das Tool aufmacht.
2. **Ich kann das Jahr nicht wechseln.** Es gibt keine Stelle, an der ich sagen könnte "zeig mir alles für 2025". Wenn ich auf `/app/jahresabschluss/2024` gehe, sehe ich die EÜR — aber Dashboard, Mitgliederliste, Transaktionsliste leben in einem eigenen Universum, das immer auf "heute" steht. Das ist genau das, was du gesagt hast, dir fehlt.
3. **Die EÜR-Seite ist nett, aber für die Steuerberaterin zu schmal.** 4 Sphären × 3 Spalten, eine Gesamtzeile, ein Hinweistext — das war's. Kein "Drucken"-Knopf direkt an der Tabelle, kein Vorjahresvergleich, keine monatliche Aufschlüsselung. Das ZIP-Bundle ist erstaunlich gut, aber so versteckt, dass ich es beim ersten Scrollen übersehen habe.

Insgesamt: **28 Funde** (5× P1, 14× P2, 9× P3, kein P0). Keine Datenverlust-Bugs entdeckt — das System ist solide gebaut. Aber die Übersicht/Eleganz, die du explizit angefragt hast, fehlt einfach noch.

---

## Andys explizite Lücken — meine ungeschönte Bewertung

### Lücke 1: Die EÜR-Seite (JB-007, JB-008, JB-009, JB-027)

> "Was ich wirklich vermisse: eine EÜR-Seite."

Doch, es gibt sie. `/app/jahresabschluss/2026` rendert eine schöne pinke Box mit der 4-Sphären-Aufteilung: Ideeller Bereich, Vermögensverwaltung, Zweckbetrieb, Wirtschaftlicher Geschäftsbetrieb — pro Sphäre Einnahmen, Ausgaben, Überschuss. Darunter eine Gesamtzeile. Plus ein Hinweistext zur § 64 Abs. 3 AO-Freigrenze (50.000 €). **Das ist genau richtig konzipiert.**

Was mir aber wirklich fehlt:

- **Ein "PDF" / "Drucken"-Knopf direkt an der EÜR-Tabelle.** Wenn ich die Steuerberaterin am Hörer habe und sie sagt "schick mir mal eben die EÜR" — ich will keinen ZIP-Download mit GoBD-IDEA-XML, ich will einen 1-Seiter, der die Tabelle und unser Logo zeigt. Den könnte ich auch ausdrucken und in den Ordner heften. Das Bundle ist toll für die echte Übergabe am Jahresende, aber für die schnelle Auskunft zwischendurch ist es Overkill.
- **Vorjahresvergleich.** Mein erster Reflex bei jeder Zahl ist: "wie war das letztes Jahr?" Eine zweite Spalte "Δ 2025" pro Sphäre wäre Gold wert. Selbst nur als Prozentangabe.
- **Eine Monatsaufschlüsselung pro Sphäre.** Ich will sehen: war der Mai im Zweckbetrieb wirklich so eingebrochen, wie ich glaube? Ein einklappbares `<details>`-Element mit 12 Zeilen × 4 Spalten würde reichen.
- **Bei Jahren, in denen keine Buchungen existieren, steht "Festgeschrieben" in grün** (Screenshot 02 — Jahresabschluss 2024). Das ist sachlich falsch. Wir haben 2024 nie festgeschrieben — und 2099 zeigt es genauso (Screenshot 03). **Das ist ein echter Bug** (JB-003): wahrscheinlich `festgeschrieben_bis = 0` oder NULL wird als "alle Jahre dadrunter sind closed" interpretiert.

**Skalen-Einschätzung:** Eine vollständige ELSTER-Einreichung mit Anlage EÜR + Anlage Gem direkt aus der App — das wäre Overkill für unter 25k €/Jahr. Was wir brauchen, ist genau das, was schon da ist, plus PDF-Knopf, Vorjahresvergleich, Monatsbreakdown. Mehr nicht.

### Lücke 2: Yearly Filters / Jahreswechsel überall (JB-001, JB-004, JB-006, JB-011, JB-013, JB-018, JB-021)

> "Yearly filters, die uns durch verschiedene Jahre wechseln lassen."

Das ist die Lücke, die mich am meisten frustriert. Ich gebe dir mal einen typischen Ablauf:

1. Ich öffne `/app` (Dashboard) — sehe "Spenden YTD: 0,00 €". Aha, 0 Spenden 2026. Aber ich will gerade einen Jahresbericht für 2025 vorbereiten.
2. Ich öffne `/app/transactions` — keine Filterleiste mit "Jahr", keine sichtbare Anzeige, dass das hier alle Jahre auf einmal zeigt. Wenn ich URL-Hacking-Mensch wäre, würde ich `?year=2025` ergänzen — und tatsächlich, die Liste wird gefiltert. Aber **nichts im UI zeigt mir, dass ich gefiltert bin**. Kein Chip "Filter aktiv: 2025", kein deaktiviertes Dropdown.
3. Ich öffne `/app/mitglieder` — gleiche Geschichte. Welche Mitglieder waren 2024 aktiv? Keine Möglichkeit zu filtern.
4. Ich öffne `/app/jahresabschluss/2025` — endlich! Hier kann ich das Jahr in der URL ändern. Aber das ist genau eine Seite. Sobald ich auf "Transaktionen" klicke (wegen der Sphäre, die ich genauer anschauen will), bin ich wieder im "alle Jahre, unklar"-Mode.

**Was ich erwarte:** Ein Year-Dropdown oben rechts in der Topbar, neben dem Glockensymbol. Genau wie in DATEV oder anderen Buchhaltungstools. Wenn ich "2025" wähle:
- Dashboard zeigt KPIs für 2025
- Transaktionsliste filtert auf yearOfBuchung=2025
- Mitgliederliste zeigt 2025 aktive
- WGB-Widget zeigt die 2025er Freigrenze-Auslastung
- EÜR-Klick führt direkt zu `/app/jahresabschluss/2025`

Technisch (siehe JB-001 → suggested_fix): URL-Param `?year=YYYY` durchreichen, `+layout.server.ts` lädt verfügbare Jahre aus den Settings + Daten, Topbar.svelte rendert ein simples `<select>`. Default = aktuelles Berlin-Jahr.

**Skalen-Einschätzung:** Für 5 Buchungsjahre, durch die wir in ~10 Jahren mal scrollen werden? Ein `<select>` mit 5 Optionen. Kein Wartungsaufwand. Sehr hoher UX-Gewinn.

### Lücke 3: Eleganter Einnahmen-Ausgaben-Überblick (JB-005, JB-009, JB-012, JB-021)

> "Einen eleganten Einnahmen-Ausgaben-Überblick auf dem Dashboard und überall."

Was ich auf dem Dashboard sehe (Screenshot 05):
- "Offene Auslagen: 0 — warten auf Prüfung"
- "Zu erstatten: – nichts offen"
- "Beitrag fällig: 0 Mitglieder laufendes Jahr"
- "Spenden YTD: 0,00 €" (mit "5 aktive Mitglieder" als Sublabel)
- Eine "Was möchtest du heute tun?"-Checkliste
- Ein WGB-Freigrenze-Widget (sehr nett)
- "Letzte Aktivitäten"-Feed

Was ich **nicht** sehe:
- "Einnahmen YTD: X €" (alle 4 Sphären zusammen — nicht nur Spenden)
- "Ausgaben YTD: Y €"
- "Saldo: Z €" (idealerweise mit Pfeil + ggü. Vorjahr)
- Ein Mini-Sparkline-Chart "letzte 12 Monate Cashflow"

Die Spenden-YTD-Zahl steht da prominent, aber Spenden sind bei uns vielleicht 20 % der Einnahmen. Konzerttickets, Mitgliedsbeiträge, gelegentliche Workshops machen den Rest. Wenn die einzige Einnahmenzahl auf dem Dashboard "Spenden" ist, gibt das ein verzerrtes Bild.

Gleiches Problem in der Transaktionsliste (Screenshot 11): Tabs "Alle / Ausgaben 0 / Einnahmen 0 / Spenden 0" — aber **keine €-Summen** neben den Tabs. Wenn ich "Einnahmen" wähle, möchte ich eine Headerzeile wie "Einnahmen 2026: 1.234,56 € (12 Buchungen)". Das ist eine reine Frontend-Berechnung aus den schon-geladenen Rows — kein Backend-Aufwand.

**Skalen-Einschätzung:** Eine zusätzliche `CashflowOverview.svelte`-Komponente. Die Logik existiert schon in `eur.ts → computeEurYear()`. Die müsste man nur fürs laufende Jahr aufrufen und drei große Zahlen rendern. Optionalen Mini-Bar-Chart per CSS, kein chart.js nötig. Eine Stunde Arbeit, riesiger Wahrnehmungsgewinn.

---

## Mein Sonntag-Nachmittag, Schritt für Schritt

### 0. Anmelden

Magic-Link-Flow funktioniert wie spezifiziert. Keine Anmerkungen — `/sign-in` ist sauber, Verify-Token-Replay wird abgelehnt (das hatten wir ja im letzten Review schon).

### 1. Dashboard öffnen (Screenshot 05)

"Guten Abend, juliaschwarz97 👋" — netter Touch.

Aber siehe oben: keine Einnahmen/Ausgaben/Saldo. Vier KPI-Kacheln sind richtig für die "Was tun?"-Frage, aber falsch für die "Wie steht's?"-Frage. Beide gehören aufs Dashboard.

### 2. Jahreswechsel ausprobieren

Topbar — kein Year-Switcher (JB-001). Sidebar — auch nicht. URL `/app?year=2025` → wird ignoriert (JB-006), KPIs sind hartcodiert auf `berlinYear()`.

Test mit `/app/jahresabschluss/2024` (Screenshot 02): EÜR mit lauter Nullen, **Status "Festgeschrieben"**. Das stimmt nicht. JB-003 (Bug).

Test mit `/app/jahresabschluss/2099` (Screenshot 03): Gleiches Ergebnis. Kein 400, keine Warnung.

Test mit `/app/jahresabschluss` Übersicht (Screenshot 04): Liste der bekannten Jahre. Aber wenn 2026 noch keine Buchungen hat, taucht es nicht auf — also kein Einstieg, wenn man frisch anfängt (JB-004).

### 3. Mitglieder (Screenshot 09)

Liste rendert sauber. Auf den ersten Blick fehlt mir nur ein dezentes "SEPA"-Badge bei Mitgliedern mit hinterlegter IBAN (JB-010 — Detail, kein Showstopper).

Jahres-Filter? Nein (JB-011). "Wer war 2024 Mitglied?" muss ich per Hand aus austrittsDatum rauslesen.

### 4. Einnahmen erfassen — Mitgliedsbeitrag, Workshop-Ticket, Spende

`/app/transactions/neu` (Screenshot 13): Tabs "Ausgabe / Einnahme / Spende". Schön.

Aber: **kein Kategorie-Dropdown, kein Sphäre-Dropdown** (JB-014). Ich gucke im Code: `<input type="hidden" name="sphereSnapshot" value="ideeller">`. Heißt: jede neue Buchung, die ich anlege, landet im ideellen Bereich. Selbst wenn ich einen Konzertticket-Verkauf erfasse (klar Zweckbetrieb), wird der falsch zugeordnet. **Die EÜR-Aufteilung, die wir oben so liebevoll anzeigen, wird ihr Material gar nicht mehr selbst klassifizieren — solange die Form das nicht zulässt.** Das ist mein größter Schock dieses Reviews.

Bonus: das Datumsfeld "Rechnungsdatum" zeigt **"mm/dd/yyyy"** als Placeholder (JB-026). Englisches Format in einem deutschen Verein. Tippfehler vorprogrammiert.

Wenn ich ein Datum aus 2024 eingebe → keine Warnung, dass das Jahr vielleicht festgeschrieben ist (JB-015). Wenn ich 2030 eingebe → keine Warnung, dass das in der Zukunft liegt (JB-016).

Ich submitte nicht — will keine Test-Buchungen in der DB lassen.

### 5. Einnahmen-Übersicht?

`/app/transactions` (Screenshot 11): Tabs "Alle / Ausgaben 0 / Einnahmen 0 / Spenden 0". Keine Summen. Das ist eigentlich der zentrale Ort für "Was kam dieses Jahr rein, was ging raus" — und es fehlt komplett (JB-012).

Die "Saved Views" sind nett ("Diesen Monat", "Offene Erstattungen", "Spenden YTD"). Wäre eine "Jahresübersicht" als 4. Saved View nicht naheliegend?

### 6. Ausgaben / Auslagen

`/app/inbox` (Screenshot 16): rendert. Aber ich sehe nicht sofort, was als Nächstes zu tun ist (JB-017). Eine Filterleiste mit "offen / genehmigt / abgelehnt" und Counts wäre hilfreich.

### 7. Rechnungen ausstellen

`/app/rechnungen` (Screenshot 17): "0 Rechnungen", Suchfeld, kein Year-Filter, kein Status-Filter, keine Summen (JB-018). Bei einer Rechnungsliste wäre "offen: 850 €, bezahlt: 12.300 € (2026)" das Erste, was ich sehen will.

Den "Neue Rechnung"-Flow habe ich nicht durchgespielt, weil ich keine Test-Rechnung in der DB lassen will und das letzte Julia-Review das schon abgedeckt hat.

### 8. Spenden + Zuwendungsbestätigung

`/app/transactions/spenden` (Screenshot 18): leerer Zustand, Banner "Aufwandsspende-Workflow in Vorbereitung" (JB-019). Das ist OK als Phase-2-Roadmap-Item. Wenn das implementiert ist, wäre der Workflow "genehmigte Auslage → in Aufwandsspende umwandeln" Gold wert.

Eine Zuwendungsbestätigung habe ich nicht generiert (würde echte DB-Spende voraussetzen). Beim letzten Review war der §50 EStDV "maschinell erstellt"-Fix angemerkt — den müsste man nochmal manuell verifizieren mit einem echten Spender.

### 9. Jahresabschluss / EÜR

Siehe Andy-Lücke 1 oben. Funktioniert gut, aber zu mager für reales Steuerberater-Werkzeug.

### 10. Festschreibung

`/app/jahresabschluss/2025` mit Festschreibungs-Widget (Screenshot 24): rendert. Confirm-Button vorhanden. Aber der Hinweis "ist unwiderruflich" verdient eine deutlichere Behandlung — Modal mit Pflicht-Checkbox "Ich habe die EÜR geprüft" (JB-024). Skalen-passend, aber sicherheitsrelevant.

### 11. CRM (Kunden, Projekte)

Beide laden (Screenshots 22, 23). Für einen Verein unserer Größe würde ich überlegen, ob das wirklich zwei eigenständige Sidebar-Einträge braucht, oder ob sie unter "Stammdaten" zusammenpassen (JB-023). Ist aber Detail.

### 12. Suche (Cmd-K)

Cmd-K öffnet einen Dialog (Screenshot 19), aber das Backend ist laut Code ein Stub. Heißt: ich tippe "Konzert" und finde nichts (JB-020). Wenn das mal echt funktioniert, wäre es das wichtigste Power-Feature.

### 13. Mobile (375×800)

Dashboard auf Handy (Screenshot 20): KPIs 2-spaltig stapeln. Bottom-Tab-Bar mit Heute / Audit Inbox / Transaktionen / Mitglieder / Neu. Vernünftig. Kein Year-Switcher dort, klar — aber auch kein Cashflow-Überblick (JB-021).

Transaktionsliste auf Handy (Screenshot 21): die Tabelle scrollt horizontal innerhalb ihres Containers (JB-022). Das ist unschön. Auf Mobile wäre ein Card-Layout pro Zeile (Bezeichnung groß, Betrag prominent, Datum klein) viel lesbarer.

### 14. Einstellungen

`/app/einstellungen` (Screenshot 25): Account-Info, "Überall abmelden", Vereinsdaten (nur lesend). Kategorien-Pflege müsste tiefer in der Seite sein — ich habe nicht runtergescrollt (JB-025).

---

## Bewertung gegen Andys "elegant"-Ziel

Andy: _"Ich will alles elegant sehen, alles ordentlich tracken, Einnahmen und Ausgaben hinzufügen und sie als bezahlt markieren."_

Wo wir stehen:

| Aspekt | Status | Lücke |
|---|---|---|
| Hinzufügen | OK | Aber: Kategorie/Sphäre fehlen im Form (JB-014) |
| Als bezahlt markieren | Sehr gut | Bulk-Actions, SEPA-Modal, Undo-Toast — gut gemacht |
| Tracken | Teilweise | Listen rendern, aber **ohne Summen, ohne Jahresfilter, ohne Status-Indikatoren in Headerzeilen** |
| Elegant sehen | Hier hapert's am meisten | Dashboard zeigt KPIs nur für offene Aufgaben, nicht für Cashflow |
| Überall (Konsistenz) | Fehlt | Jeder Listen-Screen hat eigene Filter-Konventionen oder gar keine |

Die Bausteine sind alle da (eur.ts ist sauber, transactions.ts liefert die richtigen Strukturen). Was fehlt, ist die **Komposition zu einem ruhigen, alltagstauglichen Dashboard**.

---

## Meine 3-Stufen-Empfehlung, falls Andy fragt "wo zuerst?"

**Sprint 1 (4-6 Stunden):**
1. Globalen Year-Switcher in Topbar (JB-001). Cookie-basiert, propagiert per URL-Param.
2. `CashflowOverview.svelte` aufs Dashboard (JB-005). Drei große Zahlen, optional Mini-Chart.
3. Festschreibungs-Status-Bug fixen (JB-003).

**Sprint 2 (3-4 Stunden):**
4. Kategorie + Sphere-Picker in der neuen-Transaktion-Form (JB-014).
5. Summen-Header in `/app/transactions` und `/app/rechnungen` (JB-012, JB-018).
6. PDF-Knopf direkt in EurSummary.svelte (JB-007).

**Sprint 3 (2-3 Stunden):**
7. Year-aware Listen für Mitglieder + Transaktionen + Rechnungen (JB-011, JB-013, JB-018).
8. Aktive Filter als Chip-Bar anzeigen (JB-013).
9. Date-Picker mit deutscher Lokalisierung (JB-026).

Danach hat die App genau das Gefühl, das du beschrieben hast. Den Rest (CRM-Reorg, Cmd-K, mobile Cards, Vorjahresvergleich) kann man ergänzen, wenn Bedarf ist.

---

## Was mir richtig gut gefällt

Damit der Bericht nicht zu kritisch klingt:

- **Die EÜR-Sphäre-Aufteilung ist sauber konzipiert.** Die meisten Buchhaltungstools für kleine Vereine bekommen das nicht so klar hin. ADR-0002 trägt sich gut.
- **Das WGB-Freigrenze-Widget mit § 64 Abs. 3 AO-Update auf 50.000 € ist ein nettes proaktives Detail.** Vermisse das bei den meisten Tools.
- **Bulk-Mark-Erstattet + 5-Sekunden-Undo-Toast** ist eine elegante Lösung für ein häufiges Bedienproblem.
- **GoBD-Z3-IDEA-XML im Bundle** ist eine Größenklasse drüber, was kleine Vereine sonst bekommen.
- **Magic-Link-Auth, Festschreibung als ADR, Audit-Log mit Hash-Chain** — das Fundament ist ausgezeichnet.

Das macht's umso schade, dass die Oberfläche an der entscheidenden Stelle — dem Sonntag-Nachmittag-Überblick — noch nicht das volle Potenzial sieht.

---

**Artefakte:**
- Findings JSON: `docs/reviews/2026-05-19-deepdive-julia-buchhaltung-findings.json` (28 Funde)
- Screenshots: `docs/reviews/2026-05-19-deepdive-screens/julia-buchhaltung/` (25 Bilder)
- Playwright-Spec: `tests/e2e/julia-buchhaltung-walkthrough.spec.ts`
- Lauf: `pnpm exec playwright test --config playwright.julia.config.ts tests/e2e/julia-buchhaltung-*.spec.ts --reporter=line`
