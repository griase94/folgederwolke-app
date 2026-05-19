# Deep-dive UX critique — folgederwolke-app

Date: 2026-05-19
Reviewer: senior product UX consultant (15 yrs admin tools for small orgs)
Method: 4-hour hands-on session as Julia (Kassenwartin). Drove the app via Playwright at desktop / tablet / mobile breakpoints, plus dry-run of every authoring form. Screenshots at `docs/reviews/2026-05-19-deepdive-screens/ux-expert/`. The prior review at `docs/reviews/2026-05-19-ux-design-review.md` is treated as already-known context — this document does **not** repeat those findings (oklch mail templates, prose-missing legal pages, broken 500s, English "check your inbox" etc.) and instead goes a layer deeper into IA, flows, and concrete redesigns.

Scale assumption locked in: **~15 Mitglieder, ~10 Events/Jahr, <€25 000 jährlicher Geldfluss, 1 Kassenwartin, solo developer**. Every recommendation is sized for that — no enterprise patterns, no real-time presence, no notification center. The standard against which I judge is not Stripe or QuickBooks; it's the cleanest cousin of Notion + Splid + Lexoffice that a non-technical Kassenwartin could love.

---

## 1. TL;DR — top 10 changes by joy-per-effort

Ranked by ratio (impact / dev effort). Each cites the finding ID in the JSON.

| #   | Change                                                                                                                                                    | Effort | Joy   | Refs                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- | ------------------- |
| 1   | **Sidebar diet: collapse 9 nav items to 5**. Group "Stammdaten" under one submenu (Mitglieder, Projekte, Kunden). Hide Sheet-Resync + Dev/Mails into Einstellungen | 1h     | huge  | UX-001, UX-002      |
| 2   | **Dashboard "Was-jetzt" panel**: replace 3 generic-disabled checklist rows with 1 dynamic "Diese Woche: …" sentence. When all-zero, render a single celebratory line, not 3 grey 0s | 2h     | huge  | UX-003              |
| 3   | **Global year switcher in topbar** (the missing piece, Andy ask #2). Lives next to breadcrumb. Persists in URL prefix `/app/y/2025/…` or cookie. See §3 for the full design | 4h     | huge  | UX-010              |
| 4   | **Honest submit-button labels everywhere**. "Einreichung speichern" → "Auslage in Inbox legen". "PDF generieren" → "Rechnung erstellen & PDF". "Ausgabe erfassen" stays — already honest | 30m    | medium| UX-020              |
| 5   | **Empty-state CTA in every empty page**. Today: Transaktionen empty state has no "Neue Transaktion" button inside the panel — only top-right. Move (or duplicate) the primary CTA into the dashed empty card | 1h     | medium| UX-021              |
| 6   | **Native date inputs → typed `dd.MM.yyyy` with picker fallback**. The current `mm/dd/yyyy` browser placeholder on a German app is the single most jarring detail | 3h     | medium| UX-030              |
| 7   | **Rename "Heute" → "Übersicht"**. "Heute" is a beautiful idea but mismatches what's on the page (KPIs, YTD donations, fiscal year freigrenze — none of which are "heute"). | 5m     | small | UX-040              |
| 8   | **Kill the "Mehr" sidebar group** — it hides only DSGVO and Dev/Mails. Move DSGVO into Einstellungen → "Datenschutz-Tools". Move Dev/Mails into a `?dev=1` query toggle. Sidebar becomes flat | 30m    | small | UX-001              |
| 9   | **Toast undo on every destructive action** (Auslage ablehnen, Mitglied archivieren, Spende stornieren). 8-second window. The current "Sind Sie sicher?" modals are friction | 3h     | medium| UX-050              |
| 10  | **EÜR page redesign** (Andy ask #1, see §2.1). Year-over-year compare row + monthly trend strip + per-Projekt filter inline | 6h     | huge  | UX-100, UX-101      |

---

## 2. Andy's three explicit asks

### 2.1 EÜR page — redesign

The current `/app/jahresabschluss/2026` page renders a 4-sphere summary table, then a "Bundle herunterladen" card, then a Festschreibung box. As a static report this is fine. As the page a Kassenwartin actually visits ~30 times a year, it's underbuilt:

- No year-over-year context (is €4 200 Spenden good for May? worse than last year?)
- No drill-down (where do those Zweckbetrieb-Ausgaben come from?)
- No monthly trend (when was the Bar-Pop-up — that spike?)
- The Bundle download dominates the page even though Festschreibung happens once a year
- The 4 Sphere rows are nearly empty most of the year — wasted space
- "Sphere-Aggregation nach ADR-0002" as the subheader is internal-speak

**Proposed layout (desktop, 1280px+):**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Jahresabschluss                                              Jahr ▾ 2026  │
│                                                                              │
│  EÜR 2026                                              · Offen ·  4 Monate   │
│  Folge der Wolke e.V.                                  Stand: 19.05., 14:32  │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │ Einnahmen      │  │ Ausgaben       │  │ Überschuss     │  │ vs. 2025   │  │
│  │ 8.450,00 €     │  │ 6.120,00 €     │  │ +2.330,00 €    │  │ +18 %      │  │
│  │ 28 Buchungen   │  │ 19 Buchungen   │  │ Ø 466 €/Monat  │  │ ↗          │  │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────┘  │
│                                                                              │
│  Monatlicher Verlauf (kumuliert)                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │   ▁▂▂▃▅▇                                                       2026   │  │
│  │   ▁▂▃▃▄▅▆▆▇▇▇▇                                                  2025   │  │
│  │   J  F  M  A  M  J  J  A  S  O  N  D                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Aufschlüsselung nach Sphäre                                  Filter Projekt│
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Sphäre               | Buchungen | Einnahmen  | Ausgaben  | Überschuss│  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ Ideeller Bereich     |    12     | 2.400,00 € |   400,00 €| +2.000,00 │  │
│  │ Zweckbetrieb (Events)|    23     | 5.200,00 € | 4.500,00 €|   +700,00 │  │
│  │ Wirtschaftl. Bereich |     7     |   850,00 € | 1.220,00 €|   −370,00 │  │
│  │ Vermögensverwaltung  |     5     |     0,00 € |     0,00 €|       0,00│  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ Gesamt 2026          |    47     | 8.450,00 € | 6.120,00 €| +2.330,00 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│   ℹ Wirtschaftlicher Bereich: 850 € von 50.000 € Freigrenze (1,7 %)         │
│                                                                              │
│  ──── EXPORT & ABSCHLUSS ────                                                │
│  ┌────────────────────────────┐    ┌────────────────────────────┐            │
│  │  📥 EÜR-PDF herunterladen  │    │  🔒 Jahresabschluss …      │            │
│  │  Anlage Gem + Spendenliste │    │  Festschreiben (am Ende)   │            │
│  │  Komplettes ZIP            │    │  Aktuell: offen            │            │
│  └────────────────────────────┘    └────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────────────┘
```

Behaviour notes:

- The 4 KPI cards are the same component already on the dashboard (`KpiCard`). The "vs. 2025" card is new and is computed from the previous year's snapshot. Show "—" when no prior year exists.
- The monthly trend uses two cumulative lines. ASCII shows mini sparklines; in reality use SVG. Hide the chart entirely when total Buchungen < 5 (nothing to see; show "Zu wenig Daten").
- "Filter Projekt ▾" is a select inline above the table — choosing a project filters the table and chart to just that project's rows. This is one of the most-requested non-feature in finance tools and trivial to implement here (project_id is already in the row).
- Move both export and Festschreibung into a single "Export & Abschluss" footer band. Today the bundle download dominates the page; in reality Julia downloads it 1-2x per year.
- Drop the "Sphere-Aggregation nach ADR-0002" subheader — Andy is the only person who knows what ADR-0002 is.
- The status pill — "Offen · 4 Monate" — speaks human ("4 months into the year") instead of dry "Buchungsjahr 2026".

**Mobile** collapses the 4 KPI cards to a 2×2 grid, hides the trend chart entirely (it's not informative at 375px), and renders the Sphere table as a stacked list:

```
┌───────────────────────────┐
│ Ideeller Bereich          │
│ 12 Buchungen              │
│ Einnahmen   2.400,00 €    │
│ Ausgaben      400,00 €    │
│ ──────────                │
│ Überschuss +2.000,00 €    │
└───────────────────────────┘
```

### 2.2 Yearly filters — the global year switcher

Today every list page is silently scoped to the current calendar year (Berlin TZ via `year_for_booking()`), but there's no UI for switching. A new Kassenwartin onboarding in November 2026 cannot see her predecessor's 2025 records without typing `/app/jahresabschluss/2025` by hand.

**Proposed: year switcher lives in the topbar, between the breadcrumb and search.**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Start / Transaktionen           Jahr 2026 ▾    🔍 Suchen…   🔔  JU         │
└────────────────────────────────────────────────────────────────────────────┘
                                  ↓ open
                                ┌─────────┐
                                │ 2026 ✓  │
                                │ 2025    │
                                │ 2024    │
                                │ ────    │
                                │ Alle    │
                                └─────────┘
```

Affordances:

- **URL prefix** is the right call: `/app/y/2025/transactions`, `/app/y/2025/jahresabschluss`. Pages that have nothing to do with a year (Mitglieder profile, Einstellungen, DSGVO) drop the prefix and the switcher hides. Members detail pages keep year context for their Beitrags timeline.
- **Default**: current year if no prefix. Sticky cookie remembers last-selected year for 30 days so that the day after Jan 1 you don't accidentally book into the new year while reviewing December receipts.
- **Visual treatment when not current year**: an amber strip at the top of every page: "Du siehst Daten aus 2025. Aktuelles Jahr ist 2026." with a one-click "Zu 2026 wechseln". Prevents the bug where you open the app on Jan 3rd, scroll to last year, and forget you're in archive mode.

**The "add a transaction in 2025 while viewing 2024" question:**

- Use the **booking date** (Datum), never the URL year, to assign to a fiscal year. ADR-0001 already mandates `year_for_booking(ts)`.
- If you're in 2024 and create a Transaction with Datum 2025-12-01, **show a non-blocking warning** below the date field after blur: "Datum liegt in 2025. Die Buchung erscheint im Jahr 2025, nicht im aktuellen Filter." Don't block, don't redirect, just inform.
- After save, redirect to the destination year's list view (`/app/y/2025/transactions/[id]`) so the user is "in the right place". Show a toast: "Buchung gespeichert in 2025."

This is way better than a modal saying "Are you sure you want to book to 2025?" — which would feel paternalistic and break flow.

**What does the switcher show in years with no data?** A grey "leer" badge next to the year so Julia doesn't switch to 2023 expecting last year's data. Compute on the server in `+layout.server.ts` once and cache.

### 2.3 Elegant income/expense overview — dashboard + dedicated page

Today the dashboard has 4 KPI cards (Offene Auslagen / Zu erstatten / Beitrag fällig / Spenden YTD) + a 3-row checklist + WGB widget + recent activity. It's not bad but it's blanded — every empty state is a circle with "0". With ~15 members and ~10 events/year, most days that's the steady state.

The Transaktionen page exists but it's a list. There is no overview that says "this is your fiscal year-to-date" outside of Jahresabschluss.

I'd do **two things**:

**(a) Restructure the dashboard around "What's true this week"** — not "What's true this year".

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Guten Abend, Julia 👋                                Jahr 2026 ▾        │
│ Folge der Wolke e.V.                                                    │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │  Diese Woche                                                        │ │
│ │                                                                     │ │
│ │  Es liegen 2 Auslagen in der Inbox.                                 │ │
│ │  Felix Bauer hat noch keinen Beitrag 2026 bezahlt.                  │ │
│ │  Sonst ist alles im grünen Bereich.                                 │ │
│ │                                                          → Öffnen   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ Saldo 2026       │  │ Diesen Monat     │  │ WGB-Freigrenze       │   │
│  │ +2.330 €         │  │ Ein 420 €        │  │ 1,7 % von 50.000 €   │   │
│  │ ▁▂▃▅▇            │  │ Aus 280 €        │  │ ▁                    │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘   │
│                                                                         │
│  Letzte Aktivität (5)                                  Alles anzeigen → │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 💸 −12,50 € · Bahnticket · Felix B. · vor 3h                        ││
│  │ 🎁 +50,00 € · Spende M. Müller · vor 1 Tag                          ││
│  │ 👤 Sina Hofmann hinzugefügt · vor 2 Tagen                           ││
│  │ ...                                                                 ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

What changed:

- **The "Diese Woche" plain-language card** replaces the 3 generic checklist rows. When nothing needs attention, render: "Alles im grünen Bereich. Genieß deinen Tag. ☕" Single line, soft. This is what makes people love a tool.
- The 4 KPI cards drop to 3, and they're **about the money**, not the counts. "Offene Auslagen" with a "0" is the kind of widget a checklist replaces; once there are 5 it deserves to come back.
- "Saldo 2026" gets a sparkline (cumulative). This is the number Julia explains at the Mitgliederversammlung.
- "Diesen Monat" answers "is this month busy or quiet" without making her open Transaktionen.
- The Recent Activity feed stays — it's the best part of the current dashboard. Just swap the emojis for Lucide SVGs (already in the existing review).

**(b) A new `/app/uebersicht` page** (or rename Transaktionen → Übersicht and use the year prefix to scope) that is the **canonical money view**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Übersicht 2026                                              + Erfassen │
│                                                                         │
│  Saldo: +2.330,00 € · Stand 19.05.2026                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │   Saldo-Verlauf 2026 (kumuliert)                                    ││
│  │      ▁▂▃▅▇                                                          ││
│  │      Jan          Mai                              Dez              ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│  ▾ Filter:  [Alle] [Ausgaben] [Einnahmen] [Spenden]   Projekt: Alle ▾   │
│                                                                         │
│  Mai 2026                                                Σ +140 €       │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 19.05.  −12,50 €  Bahnticket           Felix B. · Verein-bezahlt    ││
│  │ 17.05.  +50,00 €  Spende M.Müller      Ideeller · von M. Müller     ││
│  │ ...                                                                 ││
│  └─────────────────────────────────────────────────────────────────────┘│
│  April 2026                                              Σ −80 €        │
│  …                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

- Group rows by month with a per-month sum strip — this is how money-people think. Today's Transaktionen page renders a flat list; that's fine when there are 10 rows, terrible when there are 200 (which year-end totals will be).
- One sparkline at the top for the saldo trajectory. Tap a peak/valley → scrolls the list to that month.
- "Filter: [Ausgaben] [Einnahmen] [Spenden]" — same tabs as today but moved into the page heading (currently they live in a separate row with redundant "Ansicht:" label and "Diesen Monat / Offene Erstattungen / Spenden YTD" buttons that look like tabs but aren't).

The hard part — generating those monthly groupings — is one SQL window; doable in an afternoon.

---

## 3. The Kassenwart's daily flow — what actually happens

Walking through a real-feeling Tuesday in November 2026:

1. **Julia opens `folgederwolke.de`** on her laptop in the morning. The current "/" redirects to `/app` if logged-in, else `/sign-in`. Good.
2. **Dashboard appears.** "Guten Tag, juliaschwarz97 👋". She winces every single time — `juliaschwarz97` is her *email prefix*, not her name. (Finding UX-060.) She's been meaning to set her name in Einstellungen but Einstellungen doesn't have a "dein Name" field. Vereinsdaten are read-only env vars. Frustration accumulates.
3. **She sees 4 KPIs all showing "0".** The dashboard is supposed to tell her what to do today but it's giving her a quarterly report. The 3 checklist rows are all greyed-out with "0" badges and disabled-looking "Inbox öffnen →" pills — they're styled exactly like buttons-you-can't-click despite being links. (UX-070: the disabled visual treatment of done-checklist-items is confused. Either treat as done (✓ green) or hide.)
4. **She clicks "Audit Inbox"** in the sidebar. Empty. "Alles geprüft ✓" is a sweet empty state. (Credit.) But "Manuell hinzufügen" is sitting at the same visual weight as the H1 — a primary-style outline button to the right of the page title. Manual import is a rare escape-hatch, not the page's headline action. (Confirmed in prior review as MED-18; mentioned again as it's still a visual hierarchy issue I'd reframe more strongly: this button doesn't belong here; it belongs inside the empty card itself, as a secondary `ghost` link "Auslage manuell erfassen (z.B. Papierbeleg)".)
5. **She opens Transaktionen.** A page with three filter chip rows + four tabs + a "Neue Transaktion" CTA + an empty state with no CTA inside it. (UX-021.) The "Diesen Monat / Offene Erstattungen / Spenden YTD" chips look like saved-views but tapping them changes the filter without indicating which is currently active. (UX-080: pseudo-tabs should be visibly tabbed or removed.)
6. **She clicks "Neue Transaktion".** Form opens. (UX-090: full-page form instead of side sheet — for 1-2-minute task this is heavy. Should be a Sheet that opens over the list with auto-focus on first field.) The "Bezahlt von" segmented control is good. The Datum field shows `mm/dd/yyyy` placeholder — German user, German app, US-English date placeholder. (UX-030.) Submit button reads "Ausgabe erfassen" — honest, good. But after submit, she's redirected back to the list. The new row is somewhere in there. No toast, no "✓ Bahnticket €12,50 hinzugefügt → Rückgängig". She's not sure it worked unless she scrolls. (UX-050.)
7. **She moves to Rechnungen** because she needs to invoice last weekend's Auftritt. Empty list. "Noch keine Rechnungen / Lege die erste Rechnung mit dem Button oben an." Says "Button oben" — could just be a link. (UX-021 again.) She clicks "Neue Rechnung". Form is two columns: left form, right preview. The preview says "Tippe Daten ein …" — sweet copy. Date fields are still `mm/dd/yyyy`. Submit button reads "PDF generieren" — the button does two things: creates the Rechnung and generates the PDF. The label only mentions one. (UX-020.) After submit, she should land on the new Rechnung's detail page, not back at the list. (UX-100.)
8. **She opens Mitglieder.** 5 rows. Each row has 3 year badges (2024 2025 2026) that look identical — same color, same shape. (UX-110: there's no payment status on the badges. They probably mean "year membership exists" but visually they communicate nothing. Either color them green=paid / amber=open / grey=N/A, or drop them and show a single status pill.) The avatar palette is wide and the colors don't connect to brand (UX-111 — already in prior review as NIT-44 but worth re-stating: at 15 members 10 colors is mathematically silly).
9. **She tries the search box** ("Mitglied, Auslage, Rechnung suchen…"). Types "felix". Gets nothing. (UX-120: the search index appears not to include members yet. The placeholder promises Mitglied but search returns "Keine Ergebnisse".) Cmd-K focuses the search field rather than opening a global command palette. (UX-121: the ⌘K kbd badge in the placeholder implies a command palette; the reality is just-focus. Either build the palette or drop the badge.)
10. **End of day, she wants to know "what did we spend this month".** No such view. She has to open Transaktionen, filter to "Diesen Monat", and eyeball-sum the visible rows. (UX-100 — the dashboard "Diesen Monat" tile I proposed solves this.)

Trip-distance to important answers:

- "Was ist mein Saldo 2026?" → 3 clicks (Heute → scroll past 4 KPIs → not there → click Jahresabschluss → click 2026 → there). Should be **0 clicks**.
- "Wer hat noch keinen Beitrag bezahlt?" → 2 clicks if you know to go Mitglieder → squint at year badges. Should be **1 click** from a dashboard CTA.
- "Was hat die Bar-Pop-up gekostet?" → not directly answerable. Need to manually filter Transaktionen by project. There's no project filter on Transaktionen. (UX-130: project filter missing.)

The cumulative weight of these small frictions is what makes a Kassenwartin dread the tool versus love it.

---

## 4. Page-by-page UX audit

### `/` (root)
- Currently a redirect-only route. Acceptable for Phase 2 but mentioned in prior review as HIGH-8. Recommendation stands: a tiny landing page is better citizenship than dropping people into `/auslage-einreichen` cold.

### `/sign-in`
- Already heavily critiqued in prior review (no brand, no logo, English success). Adding: the input has no `autocomplete="email"`, browser doesn't offer autofill. (UX-200.) Also missing `inputmode="email"` for mobile keyboard. (UX-201.)
- The success state replaces the entire form, losing email visibility — already noted (HIGH-14). I add: keep the form visible but disable it, and put a primary "Andere Adresse?" link under the chip. Don't let a successful action eliminate context.

### `/sign-in/verify`
- The intent cookie messaging warns about "Vorschau-Tracking" but doesn't explain *why* the user is being asked to click again. Most users will think "didn't I just click?". The copy needs to lead with reassurance, not technical caveat. Proposed: "Fast geschafft. Klick zur Bestätigung — so weiß ich, dass es wirklich dein Klick war (nicht z.B. eine automatische Mail-Vorschau)."

### `/app` (dashboard)
- The greeting reads from `user.name` — but no UI to set `name`! (UX-060.) Until that exists, the fallback should strip digits from email prefixes (`juliaschwarz97` → `Julia`, not `juliaschwarz97`).
- Time-of-day greeting uses `new Date().getHours()` — local time, not Berlin. (Already noted as LOW-34.) For a Verein it's actually low-impact.
- 4 KPI cards collapse to 2x2 on mobile — good. Sublabel of "Spenden YTD" still says "5 aktive Mitglieder" (already noted as MED-17; sublabel-label mismatch).
- "Was möchtest du heute tun?" — the page asks but with 3 disabled-looking rows the answer is implicitly "nothing". At zero-state this should be a single celebratory line, not 3 grey-pill rows. (UX-003.)
- WGB widget uses raw `bg-emerald-500` (MED-27 in prior). At <€25k flows, this widget will be at 1-2% for years. Consider hiding it entirely until > 25% and showing the long-form view only on `/app/jahresabschluss/[year]`.
- Recent activity feed renders 7 entries by default. With 1 admin and ~5 sessions/week this'll mostly be "session angemeldet" repeats — visible in screenshot #12 where 3 of 3 most-recent are "session angemeldet". (UX-140: collapse session-angemeldet entries into "Du hast dich heute 3× angemeldet" or just suppress them — they have no signal value for a Verein.)

### `/app/inbox`
- The header "+ Manuell hinzufügen" button at the same weight as the page title. Move into the empty card body (already in prior).
- The sheet that opens — `14-inbox-manuell-sheet.png` — has a clean structure, but: "Beleg-Upload: Lade den Scan nach dem Speichern direkt in Drive hoch und verknüpfe ihn beim Freigeben der Einreichung." is two run-on sentences explaining a manual workaround. (UX-150.) Either build the upload into the sheet or hide this entire paragraph behind a "Wie kommt der Beleg dazu?" tooltip.
- No close-on-success — after "Einreichung speichern" the sheet stays open. (UX-151 — needs verification, but standard expectation: close + toast + scroll to new row.)
- "Wer hat bezahlt?" → 3 radio cards. Radio dots are small (h-4 w-4) and faint. Already noted (MED-22) — I'd lift the priority because this is the form Externe will see too.

### `/app/transactions`
- Pseudo-tabs vs filter-chips confusion: there's a row with 4 tabs (Alle/Ausgaben/Einnahmen/Spenden) AND a row with 3 chips (Diesen Monat/Offene Erstattungen/Spenden YTD). Two visually similar but semantically different controls. (UX-080.) Either merge into a single bar with sections or drop the chips into a "▾ Mehr Filter" dropdown.
- The chips don't show their active state once clicked — clicking "Spenden YTD" filters but the chip doesn't visually persist as active. (UX-080b.)
- Search field placeholder: "Bezeichnung, Empfänger, ID suchen..." — three things separated by commas. Concise but on a single-line input these comma-separated lists wrap awkwardly on tablet. Shorten to "Suchen…".
- No bulk actions visible despite the BulkActionsBar component existing in code. (UX-160.) A Kassenwartin who's importing 20 rows from the Bar-Pop-up will want to select-all and assign-project at once.
- Empty state has no inline CTA. (UX-021.)

### `/app/transactions/neu`
- Form is full-page rather than overlay. (UX-090.) Reduces context — after submit she's back at the list but the row may be off-screen, no scroll-to-new behavior.
- "Typ" segmented control is good. The form is otherwise plain. No "Projekt zuordnen" or "Sphäre" field, even though both are likely needed for the EÜR. Either auto-derive (most apps do) or expose. Unclear from the screenshot which approach is taken.
- Date placeholder `mm/dd/yyyy` again (UX-030).
- "Bezahlt von: Verein / Mitglied / Extern" tri-toggle — same as the public form. Good consistency.
- Submit button "Ausgabe erfassen" — but if I change Typ to "Einnahme", does the button label change? (UX-020b.) Needs to track Typ: "Ausgabe erfassen" / "Einnahme erfassen" / "Spende erfassen".

### `/app/transactions/spenden`
- Subroute exists but is functionally a filtered Transaktionen view. Should this be a separate top-level "Spenden" page in the IA, or just a filter on /transactions? I'd vote: drop the subroute, surface as a filter chip on Transaktionen + a dedicated "Spendenbescheinigungen erstellen" page (which is the actual Verein-specific task).

### `/app/rechnungen`
- Empty state has the same "Button oben" copy issue (UX-021).
- The list, once populated, should show: number / customer / amount / date / status (Entwurf / Versendet / Bezahlt). The screenshot shows none of these because list is empty. Verify the implementation matches.

### `/app/rechnungen/new`
- Two-column layout (form left, preview right) — nice idea, but at 1280px the preview column collapses awkwardly tight. On the captured screenshot the preview pane is barely 1/3 width of the form. Either expand it or stack vertically on <1440px.
- "Kund:in" select with "-- bitte wählen --" — fine, but you must create the customer beforehand. There's no "+ Neuer Kunde" inline option. For a Kassenwartin who's about to invoice an Auftritt at a brand-new venue, she'd have to: cancel, go to Kunden, add, return to Rechnungen, redo. (UX-170: inline-create for picker fields.)
- "Brutto = Netto (§19 UStG / Kleinunternehmerregelung)" — good helper text. Should be in a smaller `text-muted-foreground` rather than as a normal-weight paragraph below the betrag.
- "Rechnungs-Nr. wird vergeben: FDW–2026–001" — perfect; preview the assigned number before save. Credit.
- Submit "PDF generieren" — actually creates DB row + generates PDF. Label should be "Rechnung erstellen". (UX-020.)

### `/app/mitglieder`
- The "5 Mitglieder" subtitle below the H1 is too quiet — same style as a description line. Make it a small pill: `5 aktiv · 0 archiviert` so the meaning is loud.
- Year badges (2024/2025/2026) — see UX-110. Currently look like 3 inert tags.
- Liste / Beitrags-Matrix segmented control — good. The Matrix view (not captured) is likely the actual answer to "wer ist im Rückstand?" so it deserves to be the default IMO.
- "+ Mitglied hinzufügen" button uses a stronger primary fill than the same-page H1, which is correct — primary action is loud.
- Search field is small (`w-64`). For 15 rows that's fine, but the search appears to be client-side only — verify (the network tab during the test showed no XHR).

### `/app/projekte`
- List rendered cleanly. Each row has `P-2026-002 · Wirtschaftlich` as subtitle — that's good; project ID + sphere visible at a glance.
- No filtering by sphere or year. With ~10 projects/year * multi-year history, a tag filter chip row would be valuable in year 3.
- No "Aktiv / Archiviert" pills. After 2 years there will be 20+ projects and no way to focus on current ones. (UX-180.)
- "Projekt hinzufügen" button — `+` icon + label. Consistent with Mitglieder. Good.

### `/app/kunden`
- 2 rows, same shape as Projekte. The blue building icon is fine.
- No "Anzahl Rechnungen" or "Letzte Rechnung am" subtitle. For Kunden the most-useful info is "wann zuletzt fakturiert" — bring this in. (UX-190.)

### `/app/jahresabschluss`
- Renders only "Buchungsjahr 2026 · Offen" — one card, otherwise empty. The page exists to list multiple years but in practice will list 1 or 2 for the first 24 months of use.
- The header "EÜR-Zusammenfassung, Bundle-Download und Festschreibung pro Buchungsjahr" — three things in one line that all happen on the *next* page, not this one. This index page does very little; consider auto-redirecting to current year and dropping the page. The year switcher (§3) makes this index redundant anyway.

### `/app/jahresabschluss/2026`
- See §2.1 for the full redesign proposal.
- Current rendering: pink header bar reading "Einnahmen-Überschuss-Rechnung 2026 / Sphere-Aggregation nach ADR-0002". The pink header has a hardcoded color (`bg-[#9c2870]`) which is close to but **not identical** to the brand `--color-primary` (`oklch(0.43 0.20 350)` ≈ `#BE185D` in the sidebar). Two pinks fighting. (UX-110b.)

### `/app/einstellungen`
- Two cards under "Konto", then Vereinsdaten (read-only), then more configuration. The "Überall abmelden" card is correctly destructive-toned.
- Missing: "Mein Name" / "Profilbild". The greeting on the dashboard reads from `user.name` — if there's no UI to set it, the field is dead. (UX-060.)
- Missing: notification preferences (do I want emails when an Auslage comes in?). The mail templates exist but the user has no opt-out, which for a 15-person Verein is fine but should be tested with at least one toggle for "Mail-Benachrichtigungen bei neuer Auslage".
- Missing: Mail-Absender is shown as read-only. Why? Make it editable (with verification) — a small Verein may want `kassenwart@…` rather than `info@…`.

### `/app/dsgvo`
- Page exists, two-action card (Auskunft generieren / Pseudonymisieren). Good that it exists. But the page is named "DSGVO-Verwaltung" which sounds bureaucratic. Rename to "Datenschutz-Auskunft & Löschung" — what the user actually does here. (UX-210.)
- The "Pseudonymisieren" button is highlighted in light red (`bg-destructive/10`) but not properly destructive-styled. Confusing visual — looks more "pending" than "dangerous". (UX-211.)
- Should live under Einstellungen → Datenschutz-Tools rather than as a top-level "Mehr" sidebar item. It's used 0-2 times a year.

### `/app/sheet-resync`
- "Legacy-Sheet Import" page exists. Drop zone + idempotency key. This is internal tooling — should not be a top-level "Mehr" item at all; should be `/app/einstellungen/import` or only reachable via a query param. (UX-220.)
- The status banner "Service-Account verfügbar. CSV-Upload trotzdem für manuelle Audits nutzbar." reads as developer-speak. Externalize the implementation detail; just say "Daten aus dem alten Sheet importieren." or hide.

### Public `/auslage-einreichen`
- Form is solid (already credited heavily in prior review). The sticky CTA, draft persistence, beforeunload guard — all good engineering.
- One new finding from this pass: the "Vollständige Datenschutzerklärung" link at the bottom of the form opens `/datenschutz` in the *same tab*. A user filling out an Auslage who clicks that link loses their work (despite the draft persistence). Open in new tab. (UX-230.)
- The whole "Beleg" section appears even when "Folge der Wolke e.V." is selected as payer — but the form lets you submit without a Beleg in that case. UX-confusing: required-looking field that turns out optional. Either drop the section header weight or add "(optional bei Verein-Karte)" inline.
- The `Datenschutz` section at the bottom feels rushed-on. A checkbox + a link. The legal language is short and good ("10 Jahre gemäß § 147 AO"); the visual treatment could use a soft amber tint (`bg-amber-50`) and an icon to communicate "this is the legal bit".

### `/auslage-eingereicht`
- Not captured directly but referenced. The post-submit confirmation page is critical for the public form's trust signal. Verify it shows: a clear ✓, the assigned AUS-ID, the email it was sent to, expected response time ("Wir melden uns in 1-3 Tagen"), and a "Status prüfen" link.

### `/auslage-status/[id]`
- Bogus ID renders 404 (captured). Real status pages should show a clean timeline (eingereicht → geprüft → erstattet). Already critiqued (MED-21: abgelehnt branch).

### `/datenschutz`, `/impressum`
- Already heavily critiqued (CRIT-2 + CRIT-3 in prior). Nothing to add.

### `/404` and admin `+error.svelte`
- Already critiqued (HIGH-7, HIGH-15). Note that the `33-member-detail-404` capture shows a clean 404 for `/app/mitglieder/<bogus-uuid>` — that's actually good behavior; UUID-not-found 404 instead of 500.

### Topbar
- Search field placeholder "Mitglied, Auslage, Rechnung suchen…" — overpromises. Search responds with "Keine Ergebnisse für test" when typing "test", even though there are members named Test (just not seeded). (UX-120.)
- The notification bell + mobile search icon both disabled — already noted (MED-16, MED-29). Strong recommendation: **remove them**. Visible-but-inert chrome is worse than missing chrome.
- Avatar opens a UserMenu — captured at #31 but my screenshot was the same as the dashboard (menu didn't open via the `[aria-label*=Konto]` selector). Verify the menu actually exists and contains "Abmelden" + "Einstellungen" links.

### Sidebar
- 9 main + 2 "Mehr" items = 11 nav targets for a tool with 6 "real" entities (Transactions / Members / Invoices / Projects / Customers / Closing). The IA over-flat. (UX-001.)
- The "Heute" naming is conceptually beautiful but operationally wrong — see UX-040.
- "Mehr" group hides nothing important; either kill it or move DSGVO into the group properly (move Dev/Mails out of production entirely).

### Mobile bottom tab bar
- 5 items: Heute / Audit Inbox / Transaktionen / Mitglieder / [Neu FAB]. The FAB is disabled (already noted MED-20). Once it works, what does it do? At <€25k/year I'd argue the FAB should open the Manuell-hinzufügen sheet, which is the rarest action. The most-common mobile action is *checking* the inbox, which is already a tab. Consider: drop the FAB entirely (4 tabs is fine; the iOS HIG happily accepts 4) and add the manuell-hinzufügen as a `+` in the inbox header only.

---

## 5. Forms — collective findings

A separate cross-cutting audit because forms are 60% of an admin tool's surface area:

1. **Submit button labels** (UX-020): every form's submit button needs to describe the action, not the system. Audit:
   - `Auslage einreichen` ✓
   - `Mitglied hinzufügen` ✓ (assumed; not captured)
   - `Neue Transaktion` (the launch button, fine)
   - `Ausgabe erfassen` ✓ but doesn't track type
   - `PDF generieren` ✗ → "Rechnung erstellen"
   - `Einreichung speichern` ✗ → "In Inbox legen"
2. **Required-field marking**: red asterisks present (Bezeichnung *, Betrag (€) *) — good. Visible at form load (not only after submit). Consider also marking optional fields explicitly ("Kommentar (optional)") — current form does this inconsistently.
3. **Field order**: most forms put "Was war das" (Bezeichnung) before "Wieviel" (Betrag). Correct cognitively — you remember what before how much.
4. **Help-text presence**: spotty. Some fields have a tiny `text-muted-foreground` hint below (e.g. Datenschutz, Datum), most don't.
5. **Date inputs**: pervasive `mm/dd/yyyy` placeholder issue — biggest single bug-by-feel for German users (UX-030).
6. **Currency inputs**: `€ 0,00` with leading symbol, German comma — good.
7. **IBAN field on extern Auslage**: shown without an inline validator. (UX-240: validate on blur, render BIC + bank name + country flag.)
8. **Inline-create for relations**: missing on Rechnungen → Kund:in, Transaktion → Projekt. See UX-170.

---

## 6. Tables / lists — collective findings

The codebase uses card-based lists everywhere (`MemberRow`, `InboxCard`, `TransactionRow`). For 15 members and a few hundred transactions a year, this is fine — but with two caveats:

1. **Card lists are scan-inefficient at scale.** Once Transaktionen has 200 rows (year 1) or 1000 rows (year 5), card lists eat 2-3× the scroll distance of a table. Recommendation: add a "Liste / Tabelle" toggle (like Mitglieder already has Liste/Matrix), and default to Tabelle on `/app/transactions` for desktop.
2. **No sticky headers**: when scrolling a long table, column headers disappear. Add `sticky top-14` to the thead (top-14 to clear the topbar).
3. **No column-header sort**: I want to sort transactions by Betrag desc to find the biggest spend. Currently can't. (UX-250.)
4. **No infinite scroll vs pagination**: at 200 rows a single render is fine; at 1000 it'll be sluggish. Add windowing (svelte-virtual-list or similar) once row count > 300.
5. **Hover row actions**: `MemberRow` shows a kebab on each row, visible always — good (works on touch). Some rows in TransactionsList only show actions on hover — verify and standardize.

---

## 7. Detail pages — pattern critique

A detail page (member, rechnung, projekt) needs three things visible above the fold:

- Identity (name + key ID + status)
- Money summary (for this entity, what's the financial state)
- Timeline / activity

The current pages aren't captured in my screenshots (UUID-404 in the test). From the code (MemberInfoCard, MemberActivityFeed, MemberBeitragsTimeline), the building blocks exist. Recommended layout for any detail page:

```
┌────────────────────────────────────────────────────────────────────┐
│ ← Mitglieder         Felix Bauer                  Aktionen ▾       │
│                      felix.bauer@example.org                       │
│                                                                    │
│ ┌─────────────────────────┐  ┌─────────────────────────────────┐   │
│ │ Status: Aktiv           │  │ Beitrag 2026: 60 €  · offen     │   │
│ │ Mitglied seit: Jan 2024 │  │ Beitrag 2025: 60 €  · bezahlt   │   │
│ │ Adresse: …              │  │ Beitrag 2024: 60 €  · bezahlt   │   │
│ └─────────────────────────┘  └─────────────────────────────────┘   │
│                                                                    │
│ Aktivität                                            Filter: Alle▾ │
│ ─────────                                                          │
│ 19.05.2026  Beitrag 2026 erinnert · per Mail                       │
│ 12.03.2026  Auslage AUS-0042 erstattet · 18,50 €                   │
│ 01.01.2024  Beigetreten                                            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Two-column header summary (identity left, money right), then timeline. The "Aktionen ▾" dropdown collapses "Bearbeiten / Erinnerung senden / Archivieren / DSGVO-Löschung" rather than putting them as 4 buttons in the header.

---

## 8. Microcopy in German — audit

Sample of strings I want to nudge:

| Where                            | Today                                                  | Better                                                                          |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Dashboard greeting fallback      | "Guten Tag, juliaschwarz97 👋"                          | Strip digits + capitalize first letter: "Guten Tag, Juliaschwarz 👋"            |
| Sidebar nav label                | "Heute"                                                | "Übersicht" — "Heute" doesn't match what's on the page                          |
| Transaktionen empty              | "Keine Transaktionen gefunden / Noch keine Einträge."  | "Hier wird's später bunt. Leg deine erste Buchung an."                          |
| Rechnungen empty                 | "Lege die erste Rechnung mit dem Button oben an."      | "Noch keine Rechnungen — leg gleich die erste an." (drop "Button oben")         |
| Audit Inbox empty                | "Alles geprüft / Keine offenen Einreichungen — …"      | Already good. Leave it.                                                         |
| Auslage einreichen success       | "Mail ist raus! Schau in dein Postfach 💌"             | Already covered in HIGH-5 above                                                 |
| Manuell hinzufügen sheet hint    | "Beleg-Upload: Lade den Scan nach dem Speichern …"     | Behind a "Wie kommt der Beleg dazu?" tooltip                                    |
| DSGVO page header                | "DSGVO-Verwaltung"                                     | "Datenschutz-Auskunft & Löschung"                                               |
| Sheet-Resync header              | "Legacy-Sheet Import"                                  | "Daten aus dem alten Sheet" or hide the page                                    |
| Einstellungen Vereinsdaten note  | "Vereinsdaten werden über Umgebungsvariablen (VEREIN_*) konfiguriert." | Hide — implementation detail for users. Or: "Vereinsdaten werden vom Admin gepflegt." |
| WGB widget                       | "Brutto-Einnahmen des wirtschaftlichen Geschäftsbetriebs. Einnahmen über 50.000 €/Jahr lösen die Körperschaft- und Gewerbesteuerpflicht aus (§ 64 Abs. 3 AO, ab 2025)." | Shorten to: "Sobald die wirtschaftlichen Einnahmen über 50.000 €/Jahr steigen, wird der Verein steuerpflichtig. § 64 Abs. 3 AO" |

Tone consistency: app uses "du" throughout — good. Keep it. The legal pages may need "Sie" for impressum but that's a documented convention.

---

## 9. Wishlist of delightful little touches — worth the maintenance

Sized for solo-dev maintenance:

1. **Soft undo via toasts.** After any destructive action (Ablehnen, Archivieren, Festschreiben, Stornieren) show a toast: "Auslage AUS-0042 abgelehnt. [Rückgängig] [×]". 8-second window. Backend already has audit-log; revert is a single insert. The fact that "Rückgängig" exists removes the need for "Sind Sie sicher?" modals — huge friction win.
2. **Memorize last-used project.** When you create a Transaktion, default the Projekt dropdown to whatever you last used in the past 24h. localStorage. (Most Vereine work on one event for weeks then switch.)
3. **Smart paste in betrag field.** If user pastes "12,50 €" or "EUR 12.50" or "1.234,56 €", parse it to cents. Today the field is `<input type="number">` which strips formatting on paste and frustrates copy-paste from emails.
4. **Beleg-Vorschau on hover** in TransactionsList rows. If a row has an attached Beleg, hovering the row shows a popover with the thumb. Implementation: 50 LOC + the existing Drive thumbnail URL.
5. **Keyboard shortcut sheet on `?`.** A modal listing keyboard shortcuts. j/k for row nav, n for new, / for search, g+i for go-to-inbox. Don't actually bind 30 shortcuts — just bind 5 and document them. Modal also serves as marketing for the keyboard-power features.
6. **Cmd-K command palette** (real one). Just wraps the existing search with three extra entries at the top: "→ Neue Auslage einreichen", "→ Neue Transaktion", "→ Springe zu Jahresabschluss". This is what people expect when they see `⌘K`. Without this, drop the kbd badge.
7. **"Letzte Synchronisation: vor 3 Min."** in the topbar. Even when there's nothing to sync, it tells the user the data is fresh. (For an app with no real-time, this is the calmest substitute.)
8. **Skeleton loading on Audit Inbox.** Currently a brief flash → empty state. With even one row the cards would have a half-second of skeleton — more felt-quality.
9. **Empty-state suggestion next to the empty card**: "Keine Auslagen in der Inbox. ✓ Du könntest in der Zwischenzeit deine Mitgliedsbeiträge prüfen → [link]". One nudge, never two. Adds personality without nagging.
10. **Greeting variations.** Instead of always "Guten Tag", on Fridays say "Schönes Wochenende, Julia 🌤". On the user's birthday (we have `name` and `birthdate`? probably not — skip if no birthday data) say "Alles Gute, Julia 🎉". Small things that make a tool feel like it remembers you.
11. **Year switcher persists scroll position** in long lists. When she switches from 2025 → 2026 on Transaktionen, keep her at the same scroll-fraction (or jump to top — but be consistent).
12. **Friendly currency input affordances.** A subtle "€" prefix is good but I'd also right-align the value (financial convention).

What I'd skip even though I see the pull: workflow automations (Zapier-style), email templating editor, custom field builder. These are signs of a tool overgrown for its audience.

---

## 10. Anti-list — UX patterns to NOT add

Equal-weight to the wishlist. **Do not build these.**

- **Notification center / inbox.** The disabled bell in the topbar is already half-built — remove it. For 15 people who all talk to each other in person, in-app notifications add noise without signal. Email is enough.
- **Real-time presence / collaboration.** "Andy is currently viewing this page" makes sense for Figma, not for Vereinsverwaltung. Two admins is the max; collisions are rare.
- **Activity feed at workspace level.** Just-show-me-everything feeds gather dust within weeks. The dashboard "Recent Activity" is enough. Don't promote it to a top-level page.
- **Custom dashboards / widget shelf.** With 15 members, every Kassenwartin needs the same 5 things. Don't let the user rearrange tiles.
- **Tags everywhere.** Resist the urge to add `tags` to Transaktion, Mitglied, Projekt simultaneously. Project + Sphere already do 80% of the categorization work.
- **Multi-currency.** Always EUR. Hard-code it.
- **Multi-Verein support.** This app is for *one* Verein. Building "switch to other Verein" is fantasy work.
- **Audit log viewer for normies.** The audit log is a compliance artifact, not a UI. Don't render it as a page (Phase 7.5 hash chain — keep it behind an export).
- **Slack / Discord / Teams integration.** Tempting because the dev knows how. Useless because the user doesn't.
- **AI-powered anything in v1.** No autosuggest, no semantic search, no "summarize this Mitglieder-Verlauf". The data volume doesn't justify the complexity and the trust costs are real.
- **A settings page with 12 tabs.** Settings should be a single scrollable page until it physically can't be. With 15 fields it can't be twelve tabs.
- **Onboarding wizard / coach-marks.** A solo Kassenwartin's first action is "let me figure this out". A wizard interrupts that. Instead: ensure every empty state is self-explanatory.
- **Dark mode.** Lovely engineering, zero user demand at this scale. Wait until somebody asks.

---

## 11. Closing thought

The bones of this app are sweet. The brand is distinctive (the rosa is a love-it-or-hate-it choice that I love); the AdminShell is clean; the public form is engineered with care; the AuslagenForm draft persistence is exactly the kind of polish that makes a user trust a tool. The work that needs doing is not visual rebranding — it's information architecture and microcopy. Five hours of strict editing (kill the empty checklist rows, fix the date inputs, merge filter chips, add a year switcher, write better empty states) would move this app from "thoughtful MVP" to "actually-loved tool" without changing a single color or shadow.

The path forward, in priority order:

1. Fix what's broken (the prior review's CRIT items).
2. Build the year switcher (§3) — unlocks multi-year usage.
3. Redesign the EÜR page (§2.1) — the page Julia visits most often.
4. Tighten the dashboard (§2.3a) — the page she visits second-most.
5. Sweep microcopy and submit-button labels (§5, §8).
6. Then think about delightful touches (§9).

Don't try to do all of it. Pick the top 5 from the TL;DR and ship them in one sprint; the rest will compound.

---

End of critique.
