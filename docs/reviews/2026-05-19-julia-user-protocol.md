# Julia's Hands-On Protocol — 19. Mai 2026

**Tester:** Julia Schwarz (Kassenwartin, _Folge der Wolke e.V._)
**Method:** Klicke-Walkthrough mit Playwright (headed + 375px mobile viewport), Magic-Link-Bypass via direkter DB-Insert, plus stichprobenartige `curl`-Aufrufe.
**Build:** Lokaler Dev-Server `http://127.0.0.1:5175`, Branch `phase-2-public-form` (Stand 19.05.2026).
**Tooling:** `tests/e2e/julia-review*.spec.ts` (drei Specs, ~60 Tests insgesamt — siehe `playwright.julia.config.ts`).

> Hallo Andy — ich hab mich richtig durchgewühlt. Es funktioniert mehr als ich befürchtet hatte, aber 4 von 10 Sidebar-Einträgen werfen einfach `500 Internal Error`, und das öffentliche Formular crasht beim Submit. Das ist heute noch nicht produktiv-tauglich. Details unten — bitte alles als „Julia-Perspektive" lesen, nicht als Bug-Tracker: ich erkläre warum mich das gestört hat, du entscheidest die Priorität.

---

## Zahlen auf einen Blick

| Severity   | Anzahl | Bedeutung                                              |
| ---------- | -----: | ------------------------------------------------------ |
| **MUST**   |     11 | Blockiert Nutzung, Datenverlust oder Sicherheitsrisiko |
| **SHOULD** |     22 | Eindeutig falsch / verwirrend                          |
| **NICE**   |     13 | Politur, Konsistenz, Mikro-UX                          |
| **Σ**      | **46** | gefundene Findings                                     |

Davon sind **8 echte 500-Internal-Errors** (zwei davon im öffentlichen Bereich → können Mitglieder beim Auslage-Einreichen treffen).

---

## Top 5 MUST-Fixes (nach Aufwand vs. Auswirkung)

1. **`/app/mitglieder`, `/app/rechnungen`, `/app/projekte`, `/app/kunden` → alle 500.** Vier von zehn Sidebar-Einträgen sind im Moment unbenutzbar. Ohne diese kannst du nicht arbeiten. → Loader debuggen (vermutlich Schema-/Query-Fehler, vielleicht fehlende Spalte in Drizzle).
2. **`/app/sign-out` löscht die Cookie nicht zuverlässig — nach „Abmelden" lädt `/app` noch immer mit Status 200.** Das ist ein Session-Leak — wenn ich am Vereinsrechner abmelde, bleibt mein Account effektiv eingeloggt.
3. **POST `/auslage-einreichen` mit leerem Body → 500 statt 422.** Jeder Bot oder kaputter Submit zeigt dem User die hässliche „500 Internal Error"-Seite. Server muss validieren _bevor_ er crasht.
4. **Auslage einreichen mit gültigen Daten aber ohne Beleg crasht zu 500** (s. Screenshot `04-auslage-after-submit.png`). Auch ohne Beleg sollte das Formular akzeptiert oder mit klarer Fehlermeldung abgelehnt werden — nicht crashen.
5. **Impressum enthält unsubstituierte Platzhalter `[VEREIN_ADRESSE]`, `[VEREIN_VR]`, `[VEREIN_STEUERNUMMER]`** (Screenshot `51-impressum.png`). Das ist **rechtlich angreifbar** — § 5 TMG.

---

## Walkthrough

Ich habe in dieser Reihenfolge getestet (entspricht dem, was eine Kassenwartin am Montagmorgen wirklich tun würde):

1. Öffne `http://127.0.0.1:5175` ohne Cookie → was sehe ich als Erstes?
2. Probier das öffentliche Formular `/auslage-einreichen` (eingehend für die meisten Mitglieder)
3. Anmeldung (`/sign-in` → Magic Link → `/sign-in/verify` → `/app`)
4. Im Admin-Shell jede Sidebar-Seite einmal anklicken
5. Detail-Seiten (Rechnung-Edit, Inbox-Detail, Jahresabschluss-Detail)
6. Rechtliche Seiten (Impressum, Datenschutz)
7. Edge-Cases: kaputte IDs, abgelaufene Links, Doppelklicks, leere Submits
8. Mobile (375 × 800 px iPhone-SE-Größe) komplette Wiederholung
9. Tastatur/Accessibility-Stichprobe
10. PWA-Manifest

### 1. Öffentliches Formular `/auslage-einreichen`

Sieht auf den ersten Blick gut aus (`01-auslage-empty.png`): saubere Karten, Pflichtfelder mit `*` gekennzeichnet, Datenschutz-Hinweis am Ende, deutsche Tonalität. Aber sobald ich anfange zu klicken, fällt Folgendes auf:

- **Beim Klick auf „Auslage einreichen" ohne irgendwas auszufüllen passiert _gar nichts_ Sichtbares** — keine roten Hinweise scrollen mich zum ersten Fehler. Ich muss raten, was los ist. (Im DOM sind die Errors da, aber sie sind unsichtbar weit oben.)
- Wenn ich Felder ausfülle und auf den Submit-Button klicke (auch wirklich gültige Werte), **bekomme ich eine 500-Seite** (`02-auslage-empty-after-submit.png`, `04-auslage-after-submit.png`). Das ist absolut tödlich — kein Vereinsmitglied wird es ein zweites Mal probieren.
- Klick auf den Radio-Button „Externe Person" auf den **Text** statt auf den Kreis ändert die Auswahl nicht zuverlässig. Der Touch-Treffer ist zu klein.
- Im **Mobile-Layout** verdeckt die Sticky-CTA-Bar mein Betragsfeld, wenn ich da bin (`06-mobile-auslage.png` zeigt das deutlich: der Button steht direkt zwischen „Betrag in Euro \*" und seinem Input — ich kann gar nicht sehen, was ich tippe).
- **Punkt statt Komma** als Dezimaltrennzeichen wird übrigens still akzeptiert — das ist gut, sollte aber zumindest beim Blur normalisiert werden, damit ich nicht in Panik gerate.
- **Negativbeträge (`-50,00`) und `0,00`** werden client-seitig nicht abgelehnt. Die Server-Seite vermutlich auch nicht — habe das nicht durchgetestet, weil der Server eh crasht.
- **Sehr große Beträge (`1.000.000.000,00`)** werden ebenfalls stillschweigend angenommen. Vereine in Deutschland mit Milliarden-Auslagen wären auffällig — eine Obergrenze (z.B. 100 000 €) wäre vernünftig.
- Der Hinweistext „Status verfolgen →" auf `/auslage-eingereicht` führt zu einer Seite, die ich aufrufen kann ohne dass irgendwas gespeichert wurde — siehe „Success-Page-Lecks" unten.

### 2. Success Page `/auslage-eingereicht`

- **Ohne `?id=`-Parameter** zeigt die Seite „Vielen Dank! Deine Auslage wurde erfolgreich eingereicht. Wir haben sie unter der folgenden Kennung gespeichert:" **gefolgt von leerem Bereich** wo die ID hingehört (`80-eingereicht-no-id.png`). Das ist ein Layout-Bruch, der einem Außenstehenden suggeriert „Hier wurde was gespeichert das ich nicht sehen kann".
- **Mit erfundenem `?id=AUS-2099-99999`** (so wie wenn ich aus Versehen den Browser-Tab teile oder ein Lesezeichen falsch setze) bekomme ich genauso die volle „Vielen Dank!"-Seite plus einen „Status verfolgen →"-Button, der dann zu einer 404 geht (`81-eingereicht-bogus-id.png`). Lügt also den User an.

### 3. Sign-In Flow

- `/sign-in` rendert sauber, Tab landet sofort im E-Mail-Feld (gut), `autocomplete="email"` ist gesetzt (gut). Focus-Ring ist aber sehr blass (`oklab(0.708 0 0 / 0.5)` → Kontrast zu schwach für WCAG AA).
- **Kein Logo, keine Branding-Elemente** auf der Sign-in-Seite. Eine Kassenwartin landet auf einer Seite die nicht erkennbar zu „Folge der Wolke" gehört — das fühlt sich unseriös an.
- Die Erfolgs-Bestätigung lautet **„Check your inbox 💌" auf einer ansonsten komplett deutschen App**. Brutaler Sprachbruch.
- Anti-Enumeration funktioniert — Admin und Nicht-Admin bekommen dieselbe Bestätigung (👏 das ist gut umgesetzt).
- Magic-Link-Replay: token wird nach erstem Verbrauch korrekt abgelehnt (👏 gut).
- `/sign-in/verify` ohne `?token=` zeigt: `400 Ein Fehler ist aufgetreten TOKEN_MISSING`. Das ist Englisch-Slang-Mischung, nicht für Endnutzer geeignet.
- `/sign-in/verify` mit falschem Token zeigt eine ähnliche generische Fehlerseite ohne Link zurück zu `/sign-in`.
- Verify in anderem Browser-Kontext zeigt korrekt eine gelbe Warnung „Du öffnest diesen Link in einem anderen Browser oder Gerät" (👏 sehr gut, MUST-fix #7 wirkt).

### 4. Admin Shell `/app` — Sidebar-Sweep

Dashboard sieht poliert aus (`20-dashboard.png`) — Stat-Cards mit „Offene Auslagen / Zu erstatten / Beitrag fällig / Spenden YTD", „Was möchtest du heute tun?"-Sektion mit drei Aktions-Karten, WGB-Freigrenze-Widget. Schöner Eintrittspunkt.

Aber dann:

| Sidebar-Punkt       | Status                                                                            |
| ------------------- | --------------------------------------------------------------------------------- |
| **Heute** (`/app`)  | ✅ Lädt sauber                                                                    |
| **Audit Inbox**     | ✅ Lädt (Empty-State „Alles geprüft" mit Häkchen-Icon — schön)                    |
| **Transaktionen**   | ✅ Lädt, Tabs „Alle / Ausgaben / Einnahmen / Spenden", Empty-State da             |
| **Mitglieder**      | ❌ **500 Internal Error** (`22-mitglieder.png`)                                   |
| **Rechnungen**      | ❌ **500 Internal Error** (`23-rechnungen.png`)                                   |
| **Projekte**        | ❌ **500 Internal Error** (`26-projekte.png`)                                     |
| **Kunden**          | ❌ **500 Internal Error** (`27-kunden.png`)                                       |
| **Jahresabschluss** | ✅ Lädt, zeigt „Buchungsjahr 2026 — Offen" als klickbare Karte                    |
| **Einstellungen**   | ✅ Lädt, mit „Überall abmelden"-Button + Vereinsdaten read-only                   |
| **DSGVO** (in Mehr) | ✅ Form lädt, aber **Submit mit beliebiger Email → 500** (`91-dsgvo-noexist.png`) |
| **Sheet-Resync**    | ✅ Lädt, „Legacy-Sheet-Import" mit Drag-Drop                                      |

Dazu im einzelnen:

- Der **„Inbox öffnen →"-Button** auf der Heute-Seite navigiert _nicht_. URL bleibt `/app`. (Im Test: nach Klick noch `/app`.) Vielleicht hat er aria-disabled oder JS-Handler fehlt.
- Auf dem Dashboard ist der **„Transaktionen öffnen →"-Button visuell ausgegraut (lila → blassrosa)**, aber im DOM nicht `disabled`. Wer drauf klickt erwartet entweder Aktion oder „kann ich gerade nicht". So in der Mitte → Verwirrung.
- **Cmd+K** ist im Suchfeld als Hint sichtbar (oben rechts: `⌘K`), aber das Drücken der Tastenkombination öffnet nichts (`84-cmdk-search.png`). Wenn ihr es nicht implementiert habt, nehmt den Hint raus.
- **Klick auf Avatar (`JU`-Kreis rechts oben)** öffnet kein Menü (`86-avatar-click.png`). Das ist die Standard-Stelle für „Profil / Logout / Konto wechseln" — _jeder_ wird das probieren.
- **Glocken-Icon** habe ich angeklickt — kein Dropdown. Konsistent ungenutzt.
- **Breadcrumb „Start / DSGVO"** ist nicht klickbar — „Start" ist nur Text. In jeder anderen App ist Breadcrumb klickbar.
- **Logo „Folge der Wolke" oben links** — Klick darauf bringt mich zwar nach `/app`, aber nur wenn ich exakt das Wort treffe. Der violette „FW"-Kreis daneben gehört auch dazu, ist aber nicht klickbar — inkonsistent.

### 5. Detail-Pages

- **`/app/rechnungen/RE-2099-99999`** (erfundene ID) zeigt _keine_ 404, sondern lädt das normale Shell-Layout mit leerem Content (`60-invalid-rechnung.png`). Hinweis fehlt.
- **`/app/mitglieder/00000000-0000-0000-0000-000000000000`** (erfundene UUID): genau dasselbe Verhalten — leerer Inhalt.
- **`/app/inbox/00000000-0000-0000-0000-000000000000`** dagegen zeigt eine saubere 404-Seite mit Häkchen-Icon und „Diese Admin-Seite existiert nicht" (`103-inbox-bogus-id.png`). 👏 — bitte dasselbe Pattern überall.
- **Jahresabschluss-Detail** habe ich nicht final öffnen können (Klick navigiert irgendwohin, Loader-Inhalt unklar). Wenn ich auf `Buchungsjahr 2026` klicke, lande ich vermutlich auf der Detail-Ansicht, aber kein offensichtlicher EÜR-PDF-Download-Button.
- **Rechnung anlegen?** Auf `/app/rechnungen` ist gar kein primärer „Neue Rechnung"-Button sichtbar (wegen 500 — siehe oben). Konnte ich also nicht testen.

### 6. Legal & Sonstiges

- **`/datenschutz`** rendert als **eine riesige Wand mit Mikro-Text in Mini-Spalte** (`50-datenschutz.png`). Keine Überschriften gestyled, keine Padding-Whitespace, keine `prose`-Klasse. Liest sich wie ein ausgedrucktes Word-Dokument von 1998. **Die Vorarbeit-Notiz steht auch drin** („Hinweis: Diese Datenschutzerklärung ist Vorarbeit…").
- **`/impressum`** zeigt unsubstituierte Platzhalter: **`[VEREIN_ADRESSE]`, `[VEREIN_VR]`, `[VEREIN_STEUERNUMMER]`** (siehe Screenshot `51-impressum.png`). Auch hier: kein styling, kein H2, kein H3.
- **Vereinsdaten** sind aber unter `/app/einstellungen` korrekt befüllt (Steuernummer 143/215/10028, VR 211227 etc., `29-einstellungen.png`) — d.h. die Werte existieren, sie werden bloß im Impressum nicht aufgelöst. Wahrscheinlich Template-String der nicht durch die DB rennt.
- **PWA-Manifest** ist da und valide (Status 200, Icons-Array vorhanden, `start_url=/app`, theme_color `#be185d`). 👏
- **Service Worker** wird registriert (1 Registration). 👏
- **Favicon**: weder `/favicon.ico` noch `/favicon.svg` liefern 200 — beide 404. Browser-Tab hat dann das Default-Icon. NICE-to-have, aber jede App hat ein Favicon.
- **`/healthz`** → 200 (gut)
- **`/api/health`** → 200 (gut)
- **`/api/search?q=test`** ist _ohne Auth_ erreichbar (Status 200). Das sollte mindestens 401 sein, sonst kann jeder im Internet meinen Suchindex absuchen.

### 7. Sicherheits-Stichproben

- **CSP-Header** ist gesetzt mit Nonce-basiertem `script-src 'self' 'nonce-…'`. 👏
- **HSTS** mit preload + includeSubDomains. 👏
- **X-Frame-Options: DENY** + `frame-ancestors 'none'`. 👏
- **Magic Link Replay** wird abgelehnt. 👏
- **Magic Link Cross-Browser** zeigt Warnung. 👏
- **Email-Enumeration** verhindert (identische Antwort für admin vs. random). 👏
- **XSS in Bezeichnung** (`<script>alert(1)</script>`) wird als Text gerendert (👏 — wenn auch nur im Input-Feld; serverseitige Render-Pfade habe ich nicht durchgekuckt).
- **Rate-Limit auf POST `/auslage-einreichen`**: 7 schnelle POSTs in Folge → alle bekommen 500. Heißt entweder: der Server crasht so früh, dass der Rate-Limiter gar nicht zum Zug kommt, oder der Rate-Limiter feuert intern eine Exception. So oder so: ich sah niemals einen 429.

### 8. Mobile (375 × 800 px)

- **Admin-Shell auf Mobile** sieht gut aus (`40-mobile-dashboard.png`) — Bottom-Tab-Bar mit „Heute / Audit Inbox / Transaktionen / Mitglieder / Neu", oben kompakte Topbar. Layout passt.
- **Public Form auf Mobile**: CTA-Bar fixed unten ok, aber **verdeckt das Betragsfeld** beim Tippen darauf (siehe oben). VisualViewport-Handler existiert im Code, scheint aber nicht zu greifen.
- Der **„Neu"-Tab** in der Bottom-Bar (Plus-Icon, rote Akzentfarbe) ist meine erste Reaktion auf „Ich will eine neue Rechnung". Click — passiert nichts (war disabled / nicht erreichbar).

---

## Bug-Liste (sortiert nach Severity)

### MUST

```
[MUST] /app/mitglieder → Sidebar-Eintrag klicken → 500 Internal Error → 200 mit (auch leerer) Liste → Loader/Query debuggen (Schema oder DB-Migration unvollständig?)
[MUST] /app/rechnungen → Sidebar-Eintrag klicken → 500 Internal Error → 200 mit Liste/Empty-State → s.o.
[MUST] /app/projekte → Sidebar-Eintrag klicken → 500 Internal Error → 200 → s.o.
[MUST] /app/kunden → Sidebar-Eintrag klicken → 500 Internal Error → 200 → s.o.
[MUST] /app/dsgvo → Submit „Auskunft generieren" mit beliebiger Email → 500 → JSON-Auskunft / Hinweis „keine Daten" → DSGVO-Loader prüft Schema-Mapping
[MUST] /app/sign-out → Sign-out aufrufen → URL bleibt /sign-out, danach /app lädt mit 200 (Session lebt) → Redirect zu /sign-in mit gelöschtem Cookie → signOut() prüfen, fehlt evtl. ein `redirect(303, '/sign-in')`
[MUST] /sign-out (anonym) → Aufruf ohne Session → 500 Internal Error → 302/303 zu /sign-in → Null-Check für resolveSession()
[MUST] /auslage-einreichen → Submit ohne irgendein Feld auszufüllen → 500 (statt Inline-Errors) → preventDefault() + Anzeige Inline-Fehler → handleSubmit() / validate() debuggen — der Submit landet auf Server obwohl validate() false zurückgibt
[MUST] /auslage-einreichen → Submit mit gültigen Daten, ohne Beleg (Verein-bezahlt) → 500 → /auslage-eingereicht → Server crasht in Validation oder DB-Insert ohne Beleg-Path
[MUST] /auslage-einreichen (extern, IBAN) → IBAN-Feld nicht erreichbar nach Klick auf "Externe Person" → IBAN-Feld muss erscheinen → BezahltVonPicker prüfen — Reaktivität bei kind-Wechsel
[MUST] /impressum → Seite öffnen → unsubstituierte Platzhalter `[VEREIN_ADRESSE]`, `[VEREIN_VR]`, `[VEREIN_STEUERNUMMER]` → echte Daten → Template-Variablen aus Settings ziehen (Werte existieren in /app/einstellungen)
```

### SHOULD

```
[SHOULD] /auslage-einreichen → Leerer Submit → Keine Errors sichtbar / kein Scroll-to-First-Error → Erstes invalides Feld in Fokus + scrollIntoView → Im handleSubmit fokus auf `[aria-invalid="true"]` setzen
[SHOULD] /auslage-eingereicht (ohne ?id) → Seite zeigt "Vielen Dank!" + leeren ID-Block → Redirect zu /auslage-einreichen oder andere Sprache → Loader: wenn id fehlt, einen anderen Markup-Branch + ggf. redirect
[SHOULD] /auslage-eingereicht?id=AUS-2099-99999 → Seite zeigt Vielen-Dank-Layout für nicht-existente ID → 404 oder "ID unbekannt" → Loader prüft existence
[SHOULD] /auslage-einreichen → Beträge ≤ 0 (z.B. 0,00 oder -50,00) → kein client-side Fehler → "Betrag muss > 0 sein" + serverseitige Validation → parseBetragCents Vorzeichen + 0 prüfen
[SHOULD] /auslage-einreichen → Sticky CTA-Bar verdeckt Betragsfeld auf Mobile beim Scrollen → CTA weicht aus / Form-Padding-Bottom erhöhen → Bottom-Offset visualViewport-aware berechnen
[SHOULD] /auslage-einreichen → 7 schnelle POSTs → alle 500 statt mind. einer 429 → echter 429 nach 5 Anfragen → Server-Crash unterdrückt Rate-Limit-Path; erst validate-light, dann RL
[SHOULD] /sign-in → "Check your inbox 💌" — englisch in deutscher App → "Wir haben dir einen Anmelde-Link geschickt." → i18n
[SHOULD] /sign-in/verify → 400 "TOKEN_MISSING" / "LINK_INVALID_OR_EXPIRED" als sichtbarer Text → Deutsche Fehlerseite mit Link "Anmelde-Link erneut anfordern" → /sign-in/verify/+error.svelte
[SHOULD] /sign-in → Keine Logo / Branding sichtbar → "Folge der Wolke e.V." + Wolken-Logo oben im Card → AppLogo-Komponente einbinden
[SHOULD] /app → Cmd+K Hint angezeigt aber Shortcut nicht funktional → entweder Hint entfernen oder Shortcut implementieren → keydown-Listener registrieren
[SHOULD] /app (avatar oben rechts) → Klick auf JU-Avatar → kein Menü → Dropdown mit Profil / Einstellungen / Abmelden → DropdownMenu-Komponente
[SHOULD] /app (glocke) → Klick auf Notification-Bell → kein Effekt → mind. "Keine Benachrichtigungen" Toast oder Panel → richtig implementieren oder ausblenden
[SHOULD] /app/rechnungen → kein primärer "Neue Rechnung anlegen"-Button sichtbar → top-rechts prominent platziert → Standard-Empty-State mit CTA
[SHOULD] /app/inbox → keine Tab-Filter (Offen / Genehmigt / Abgelehnt) sichtbar → Tabs ergänzen → InboxTabs-Komponente
[SHOULD] /app/rechnungen/<bogus> → Lädt mit leerem Inhalt (nicht 404) → 404 wie bei /app/inbox/<bogus> → Loader: error(404,...) bei missing entity
[SHOULD] /app/mitglieder/<bogus> → s.o. — kein 404 → 404 → s.o.
[SHOULD] Breadcrumb "Start" → nicht klickbar → Link zu /app → <a> statt <span>
[SHOULD] /datenschutz → tiny Text, keine Headings, keine Spacing → mit `prose` Tailwind-Klasse stylen → Wrapper-Div mit class="prose prose-lg max-w-3xl mx-auto"
[SHOULD] /impressum → ungestyletes Text, keine Hierarchie → s.o.
[SHOULD] /api/search?q=test → unauth erreichbar (200) → 401 → resolveSession-Guard in Hooks
[SHOULD] /sign-in → keine Hilfe-Text "Mail kommt in 1-2 Min, ggf. Spam prüfen" → erklärender Untertitel → Subtext im Form-Card
[SHOULD] /auslage-einreichen → Radio "Externe Person" reagiert nicht auf Text-Klick → ganzer Label-Bereich klickbar → label htmlFor + clicky-area erweitern
[SHOULD] /auslage-einreichen → kein POST 422 / fail() mit per-field-Errors bei ungültigem Datum → klare Feldfehler → validateAuslageInput debuggen warum es 500 wird
```

### NICE

```
[NICE] /auslage-einreichen → Fehler 7× rot ohne zentralen Fokus → erstes Feld scrollen+fokussieren → s.o.
[NICE] /auslage-einreichen → "1000000000,00" akzeptiert → Cap z.B. 100.000 € → Server-Validation Obergrenze
[NICE] /auslage-einreichen → "12.50" Punkt wird akzeptiert → ok, vielleicht beim blur normalisieren auf "12,50"
[NICE] /auslage-einreichen → Cyrillisch + Emoji ok → —
[NICE] /sign-in → Focus-Ring blass (oklab 0.708 / 0.5) → kontrastreicher (3:1 mind.) → ring-2 ring-primary
[NICE] /sign-in/verify (mismatch) → Warnung sichtbar (gut)
[NICE] /favicon.ico + /favicon.svg → beide 404 → Favicon ergänzen
[NICE] /app — Logo-Klick nur exakt auf Text, FW-Kreis nicht → ganze Header-Marke klickbar → <a> umschließen
[NICE] /app/inbox → "Manuell hinzufügen" funktioniert (Sheet öffnet) — sehr gut
[NICE] PWA Manifest valide
[NICE] Service Worker registriert
[NICE] Anti-Enumeration Sign-in funktioniert
[NICE] Bottom-Tab-Bar Mobile-Navigation funktioniert für "Audit Inbox"
```

---

## Screenshots — Verzeichnis

Alle Screenshots liegen unter `./2026-05-19-julia-screenshots/`. Die wichtigsten:

| Datei                               | Was zeigt es                                                          |
| ----------------------------------- | --------------------------------------------------------------------- |
| `01-auslage-empty.png`              | Form initial — sieht solide aus                                       |
| `02-auslage-empty-after-submit.png` | **500 nach Klick auf Submit ohne Eingabe** ← MUST                     |
| `04-auslage-after-submit.png`       | **500 nach Klick auf Submit mit gültigen Daten ohne Beleg** ← MUST    |
| `06-mobile-auslage.png`             | Sticky-CTA verdeckt Betragsfeld                                       |
| `20-dashboard.png`                  | Heute-Dashboard — gefällt mir                                         |
| `22-mitglieder.png`                 | **500 auf /app/mitglieder** ← MUST                                    |
| `23-rechnungen.png`                 | **500 auf /app/rechnungen** ← MUST                                    |
| `26-projekte.png`                   | **500 auf /app/projekte** ← MUST                                      |
| `27-kunden.png`                     | **500 auf /app/kunden** ← MUST                                        |
| `30-dsgvo.png`                      | DSGVO-Form initial (lädt)                                             |
| `91-dsgvo-noexist.png`              | **500 nach Submit DSGVO mit irgendeiner Email** ← MUST                |
| `40-mobile-dashboard.png`           | Mobile Layout — schön                                                 |
| `50-datenschutz.png`                | **Datenschutz ungestyled (winzige Schrift, keine Headings)** ← SHOULD |
| `51-impressum.png`                  | **Impressum mit `[VEREIN_ADRESSE]`-Platzhalter** ← MUST               |
| `80-eingereicht-no-id.png`          | Success-Page mit leerer ID-Stelle                                     |
| `81-eingereicht-bogus-id.png`       | Success-Page erscheint für jede beliebige ID                          |
| `83-inbox-manuell-add.png`          | Sheet "Manuell hinzufügen" funktioniert                               |
| `86-avatar-click.png`               | Avatar-Klick — kein Menü öffnet sich                                  |
| `88-verify-mismatch.png`            | Cross-Browser-Warnung (gut)                                           |
| `103-inbox-bogus-id.png`            | Beispiel für saubere 404 — sollte überall so sein                     |

---

## Was funktioniert gut

Damit Andy nicht denkt ich hasse alles:

- **Dashboard** ist ein guter Eintrittspunkt — Stat-Cards (Offene Auslagen / Zu erstatten / Beitrag fällig / Spenden YTD) sind die richtigen vier Zahlen für eine Kassenwartin am Montagmorgen. Die WGB-Freigrenze als progress bar mit „Im grünen Bereich"-Pill ist clever.
- **Heute-Sektion „Was möchtest du heute tun?"** ist das beste UX-Element der ganzen App. Aufgaben-Liste mit primärer Aktion pro Zeile. Genau das richtige Pattern.
- **Audit-Inbox Empty-State** „Alles geprüft — Keine offenen Einreichungen — neue Auslagen erscheinen hier sofort" mit grünem Häkchen-Icon. So macht man Empty-States.
- **Mobile-Layout** der Admin-Shell ist deutlich besser als ich erwartet hatte (`40-mobile-dashboard.png`). Sidebar wird zu Bottom-Tab-Bar, Topbar wird kompakt, Stat-Cards stacken in 2×2-Grid. Tatsächlich auf einem iPhone bedienbar.
- **„Manuell hinzufügen"-Sheet** in der Inbox (`83-inbox-manuell-add.png`) ist gut gestaltet — slide-over right side, alle Felder direkt da, Kommentar-Beispiel „z.B. Papierkasse Sommerfest".
- **CSP / HSTS / X-Frame-Options** alle korrekt gesetzt. Magic-Link-Threat-Model ist sauber umgesetzt (Replay-Block, Cross-Browser-Warnung, Anti-Enumeration, 60s-Dedup gegen Mail-Spam).
- **`/auslage-status/<bogus-id>`** zeigt saubere deutsche 404-Seite ("Diese Seite existiert leider nicht").
- **PWA-Manifest** vollständig, Service-Worker registriert.
- **`autocomplete="email"`** auf dem Sign-in-Feld — kleine Sache, aber Password-Manager freuen sich.
- **Verein-Daten in den Einstellungen** sind read-only und korrekt — der Vorstand hat das offenbar einmal eingetragen und kann es nicht versehentlich kaputt machen.
- **Empty-States insgesamt** (Transaktionen "Keine Transaktionen gefunden", Inbox "Alles geprüft", Jahresabschluss "Buchungsjahr 2026 Offen") sind durchweg gut formuliert.

---

## Julia's Verdikt

> **Würde ich morgen anfangen, mit dieser App die Vereinskasse zu führen? Nein.**
>
> Vier von zehn Hauptseiten (Mitglieder, Rechnungen, Projekte, Kunden) sind als reine 500-Fehler nicht benutzbar. Wenn ich heute einem neuen Mitglied seine Beitrittsdaten eingeben möchte, kann ich es nicht — Mitglieder-Seite crasht. Wenn ich eine Rechnung schreiben will, kann ich es nicht — Rechnungen-Seite crasht. Das öffentliche Auslagen-Formular crasht beim Submit, also bekommen Mitglieder eine 500-Seite statt einer Bestätigung — die einen würden es als „kaputt" abhaken, die anderen würden Andy direkt anrufen.
>
> **Was gut ist:** Das _Konzept_ stimmt. Das Dashboard, der Audit-Inbox-Empty-State, der manuelle Hinzufügen-Sheet, das Mobile-Layout, die Datenschutz/CSP-Hygiene — all das ist sichtbar mit Sorgfalt gebaut. Wenn die vier 500er gefixt sind und das öffentliche Formular durchgeht, ist das _für eine Vereins-App_ richtig gut. Besser als die Excel-Tabellen, mit denen ich heute lebe.
>
> **Was ich konkret als nächstes machen würde, wenn ich Andy wäre:**
>
> 1. Erste Sitzung: die vier 500er fixen (Mitglieder/Rechnungen/Projekte/Kunden). Wahrscheinlich ist es ein gemeinsamer Loader-Helper, der irgendwo crasht. Wenn ich die Stack-Traces aus dem Dev-Log sehe, kann ich das wahrscheinlich in 10 Minuten lokalisieren.
> 2. Zweite Sitzung: das öffentliche Formular durchlaufen lassen, von leerem Submit bis Erfolg. Server-Action sollte _niemals_ 500 zurückgeben — alles ist 422 mit `fail()`.
> 3. Dritte Sitzung: Impressum und Datenschutz formatieren + Platzhalter ersetzen. Vorher nicht online stellen.
> 4. Vierte Sitzung: Sign-out wirklich abmelden, Cmd+K und Avatar-Dropdown beleben oder Hints entfernen.
>
> Dann nochmal Julia ranlassen. 🤝

— Julia
