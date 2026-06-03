# Transactions Redesign — Ausgaben / Einnahmen / Spenden as three tabs

**Status:** Design (approved in brainstorming) — ready for implementation plan
**Date:** 2026-06-03
**Author:** Andy + Claude (brainstorming session)
**Primary user:** Julia, Kassenwartin (treasurer) — daily operator, calm-UI preference, year-end close.

---

## 1. Problem & Goals

The current `/app/transactions` is one merged list with a type-tab header and a half-separate `/spenden` sub-route. Categories aren't enforced, income editing is minimal, beleg handling is loose, there is no coherent year scope, and the "Verein paid it directly" case is clumsy.

**Goals**

- Split transactions into three first-class tabs — **Ausgaben**, **Einnahmen**, **Spenden** — each with its own logic, requirements, and elegant list/entry/detail UX.
- **Mandatory Kategorie** on Ausgaben + Einnahmen; **Sphäre derived from Kategorie** (no manual override).
- Elegant, robust, **composable filtering + saved views** (chip-based) shared across tabs.
- **Mandatory Beleg** on Ausgaben (or an explicit, justified "kein Beleg"); **Rechnung-linked** Einnahmen reflect the link; optional Beleg on other Einnahmen.
- Mark Ausgaben as paid elegantly; when the **Verein** pays directly, book it as paid immediately from the entry form. Admins can also mark a member/extern expense as already paid.
- **EÜR and all downstream views** reflect these changes.
- **Year scope** coherent everywhere — but per-surface, not a single global switch (see §5).
- Bullet-proof data integrity (GoBD/ADR-aligned), great UX, mobile-friendly. Pragmatic for a ~20-person Verein.

**Non-goals / deferred** (see §13)

- Analytical multi-year dashboard ("Auswertungen") — fast-follow.
- Aufwandsspende workflow (Phase 2, schema present, UI gated).
- Global topbar year picker (explicitly rejected — see §5).
- Post-Festschreibung sphere_overrides (Phase 2, ADR-0011).

---

## 2. Scope decisions (locked)

1. **Wipe all existing transaction data** (Ausgaben + Einnahmen + Spenden). Clean slate; new constraints enforced from day one. No legacy-row escape hatches needed.
2. **Routing:** flat top-level routes — `/app/ausgaben`, `/app/einnahmen`, `/app/spenden`, with detail at `/app/<kind>/[id]`. Three sidebar entries (replacing the single "Transaktionen").
3. **Mandatory Kategorie** on Ausgaben + Einnahmen. **Spenden:** no Kategorie picker — derived from Spendenart + Zweckbindung (badge shown).
4. **Sphäre is derived from the chosen Kategorie and cannot be overridden** in the UI. Spenden sphere is always `ideeller`.
5. **Year scope:** no global picker. Year-as-filter on lists (default current year, supports "Alle Jahre"); year-in-route for EÜR/Jahresabschluss; "Heute" dashboard always live.
6. **Edit happens on a dedicated detail route** `/app/<kind>/[id]`, presented as a modal-style surface (header / scrollable body / unified footer).
7. **Mobile:** lists collapse to cards → tap opens detail; Beleg uses a fold (peek → full-screen viewer).

---

## 3. Data model changes

> All money in integer cents (ADR-0003). All new app rows carry `source_kind='app'` (ADR-0010). Year via `year_for_booking(gebucht_am)` (ADR-0001). Festschreibung gates writes (ADR-0006). Side effects via event bus (§4.1.1 #2). Audit log append-only (ADR-0004).

### 3.1 `expenses` (Ausgaben)

- `kategorie_id` → **NOT NULL** (was nullable). `kategorie_name_snapshot` stays NOT NULL.
- `sphere_snapshot` set **server-side from `kategorie.sphere`** at write time. `sphere_override` column remains (ADR-0008) but is **never set by the UI**.
- **Beleg requirement:** a row must have either `beleg_drive_file_id` **or** a new `beleg_verzicht_grund text` (justification for "kein Beleg vorhanden", e.g. bank fees, GEMA auto-debit). Enforced app-side (and a CHECK: `beleg_drive_file_id IS NOT NULL OR beleg_verzicht_grund IS NOT NULL`). The Begründung is captured in the audit trail.
- **Direct-paid flow:** when `bezahlt_von_kind='verein'`, or when an admin ticks "Schon bezahlt" for member/extern, the row is created with `status='erstattet'`, `erstattet_am` = chosen date (default today), `zahlungsart_id` set, `approved_at`/`approved_by` set. No Auslagenflow, Erstattungsmail only when there is a member/extern to notify (never for Verein).

### 3.2 `income` (Einnahmen)

- `kategorie_id` → **NOT NULL**. `sphere_snapshot` derived from `kategorie.sphere`.
- Beleg **optional** (`beleg_drive_file_id` nullable).
- **Rechnung link:** reuse existing `invoices.paid_by_income_id` (one-way). The list's 🔗 badge derives from a join (`invoices` where `paid_by_income_id = income.id`). When an Einnahme is created from a Rechnung's "Als bezahlt markieren", set `invoices.paid_by_income_id` + `invoices.bezahlt_am`, copy `income.project_id` from the invoice (**locked, not editable**), and prefill Betrag (editable for Teilzahlung) + Kategorie.

### 3.3 `donations` (Spenden)

- Derived Kategorie: server maps `(spende_kind, zweckbindung_kind)` → a seeded Kategorie row; sets `kategorie_id` + `kategorie_name_snapshot`. `sphere_snapshot='ideeller'` always.
- `zweckbindung_text` → **required when `zweckbindung_kind='zweckgebunden'`** (app-enforced; CHECK: `zweckbindung_kind='zweckfrei' OR zweckbindung_text IS NOT NULL`).
- **Sachspende Wertermittlung** — new columns:
  - `wertermittlung_methode` — new enum `wertermittlung_methode` = (`marktpreis`, `kaufbeleg`, `schaetzung`, `buchwert`). Required when `spende_kind='sachspende'`.
  - `zustand_beschreibung text` — required when `spende_kind='sachspende'`.
  - `herkunftsbeleg_drive_file_id text` — optional.
  - The monetary `betrag_cents` holds the **gemeiner Wert** (§ 9 BewG) for Sachspenden.
- Spender: member (address from member record) **or** external person (Name + Adresse required for the Bescheinigung; Email optional).
- **Mitgliedsbeiträge are NOT donations** — they never enter `donations` (not spendenabzugsfähig for this Verein; § 10b EStG risk). They remain a separate income/Beitrags workflow.

### 3.4 Beleg normalization (images + PDFs)

A single upload pipeline produces web-safe **page image(s)** for preview plus keeps the **original** for download:

- **Images** (JPG/PNG): stored as-is + a normalized web preview. **HEIC** (iPhone) converted to JPEG/WebP server-side on upload (or rejected with a clear hint).
- **PDFs:** server renders page(s) to images (reuse the existing PDF rendering capability used by the invoice pipeline / `pdfBytes`). The viewer always shows **page images**; the original PDF is offered via "Original öffnen ↗" → device-native viewer.
- The viewer is **format-agnostic at the UI layer** — type-specific logic lives only in this normalization step.

### 3.5 `kategorien` reseed

- Reseed with correct `sphere` per category and `eur_zeile` / `anlage_gem_zeile` filled for the categories actually used (so EÜR mapping works).
- Seed the **donation-derivation lookup** categories: e.g. "Geldspende zweckfrei", "Geldspende zweckgebunden", "Sachspende" (all `sphere='ideeller'`, `kind='income'`), each with the right Anlage-Gem/EÜR line. The `(spende_kind, zweckbindung_kind) → kategorie` mapping is a documented, unit-tested lookup; seeded as `source_kind='fixture'`.

---

## 4. Filtering + saved-views backbone (shared, robust)

A typed, composable, URL-driven filtering system shared by all three list tabs.

- **Typed filter registry per tab.** Each filter field declared once: `{ key, label, type, allowedValues }` where `type ∈ {enum-multi, member-picker, date-range, amount-range, boolean}`. The chip bar renders itself from the registry; adding a filter = one registry entry.
- **URL is the single source of truth.** Filter state serialized to `searchParams`; parsed and **Zod-validated** on load — invalid params degrade to defaults, never crash. Composes with the year param (§5).
- **Server-side application.** Each filter field maps to one tested SQL `WHERE` predicate. Pagination + counts respect the active filters. (Replaces today's fetch-all-then-filter-client-side, which is a latent scaling bug.)
- **Views as data.** Built-in presets defined in code (e.g. Ausgaben "Offen zu erstatten"); custom saved views in `localStorage`. Both serialize to/from the same filter-state object. One serializer, one parser.
- **One shared component, three registries.** Identical interaction across tabs; only the registry differs. Each piece unit-tested.
- **Chip-based UI** (Linear/Notion/Things style): persistent search box + "+ Filter" field menu + active filters as removable chips (AND-combined) + "Ansichten ▾" presets + "Zurücksetzen" + live match count.

**Per-tab filter fields**

- **Ausgaben:** Status (offen/genehmigt/erstattet/abgelehnt), Bezahlt von (Verein/Mitglied/Extern), Kategorie, Monat, Betrag, "Beleg fehlt".
- **Einnahmen:** Kategorie, Sphäre, "nur mit Rechnung", Monat, Betrag.
- **Spenden:** Spendenart, Zweckbindung, Bescheinigung-Status, Spender, Monat, Betrag.

**Year is not a chip** — it's the always-visible year control (§5), to avoid two ways of setting year.

---

## 5. Year scope (no global picker)

Rejected the global topbar picker (hidden cross-page state, mode-error risk given Festschreibung/`year_for_booking`). Instead, each surface owns its year in the way that fits it:

- **Lists** (Ausgaben/Einnahmen/Spenden): an always-visible **year control** (pill) at the left of the filter bar. Defaults to **current Berlin year**; URL-synced `?year=`; supports **"Alle Jahre"**. It is part of filter state but rendered as a distinct prominent control (consistent pill component).
- **EÜR / Jahresabschluss:** year in the **route** (`/app/jahresabschluss/[year]`) — it is the document's identity. Selecting a year is navigation.
- **"Heute" dashboard:** **always live / current** — no year control, never pinned to a past year.
- **Entry/edit forms:** always use real dates (`gebucht_am`, Rechnungsdatum, etc.) — never a view-filter year. No wrong-year bookings possible.

The same **year-pill component** is used on lists (filter) and EÜR (navigation) so the affordance _looks_ identical even though the semantics differ.

---

## 6. Ausgaben tab

### 6.1 List

- **KPI anchor line:** `<Jahr> · <Summe> · <N> Buchungen`, plus a **"N offen" pill** (approved-not-yet-erstattet) that **disappears when zero** (Julia's "empty inbox" delight). Includes oldest-open age as a look-hole guard (e.g. "3 offen, älteste 18 Tage").
- **Table columns** (all sortable, click header to toggle; default Datum desc): Datum, ID (business_id, monospace), Bezeichnung (+ Bezahlt-von subtitle), **Bezahlt von**, **Kategorie**, **Sphäre** (colored badge), Betrag (right, tabular), Status (badge), chevron.
- **Filters:** Status, Bezahlt von (+ shared search). Saved view: **"Offen zu erstatten"** (status=genehmigt & not erstattet).
- Festgeschriebene rows visually muted, not selectable for edit.

### 6.2 Entry form (sticky-footer modal)

- Fields: Bezeichnung*, Betrag*, Rechnungsdatum, **Kategorie\*** (shows derived Sphäre + EÜR-Zeile hint), **Projekt** (optional), Bezahlt von\*, **Beleg\*** (upload or "Kein Beleg vorhanden" → mandatory Begründung), Kommentar.
- **Bezahlt von toggle** drives behavior:
  - **Verein** → green "Direkt als bezahlt buchen" panel (Zahlungsart* + Zahlungsdatum*, default today). Status on save = **erstattet**. No Erstattungsmail.
  - **Mitglied / Extern** → default goes into the **Auslagenflow** (status `genehmigt`). An **admin-only** "Schon bezahlt?" toggle reveals the same Zahlungsart + Datum panel + optional "per E-Mail benachrichtigen"; status on save = **erstattet**.
  - Extern reveals Name + IBAN + Email instead of the member picker.
- **Full member names everywhere** (lists + forms) — "Maria Klingler", not "Maria K.".
- Footer: unified, actions right; Speichern label reflects the mode ("Speichern" vs "Speichern & als bezahlt buchen").

### 6.3 Auslagenflow integration

The public-form → Audit-Inbox → approve flow stays. On approval, an `expenses` row is created (`status='geprueft'`/`genehmigt`) and **appears in the Ausgaben tab** with that status. Treasurer-direct entries appear with `erstattet` (Verein/already-paid). The Audit Inbox stays a separate route (where un-approved submissions wait). Approved-not-paid items surface via the "Offen zu erstatten" view + the "N offen" pill.

---

## 7. Einnahmen tab

### 7.1 List

- **KPI:** anchor line + **Sphären-Split chips** (Ideeller/Vermögen/Zweckbetrieb/Wirtschaftlich totals) — Julia's concern is sphere distribution on income.
- **Columns:** Datum, ID, Bezeichnung (+ 🔗 badge if Rechnung-linked), Kategorie, Sphäre, Betrag. No status column (income has no workflow).
- **Filters:** Kategorie, "nur mit Rechnung" (+ search).

### 7.2 Entry form

- **Freie Einnahme** (e.g. Eventfrog ticket sales): Bezeichnung*, Betrag*, Geldeingang\*, **Kategorie\*** (derived Sphäre), **Projekt** (optional), Beleg (**optional**), Kommentar.
- **Aus Rechnung** (opened from a Rechnung's "Als bezahlt markieren"): read-only 🔗 Rechnung badge; Betrag prefilled (editable for Teilzahlung); Geldeingang\*; Kategorie; **Projekt locked** (from the project-bound Rechnung, shown with 🔒 "durch die Rechnung festgelegt"); Rechnung-PDF counts as the Beleg. Sets `paid_by_income_id` + `bezahlt_am` bidirectionally.

---

## 8. Spenden tab

### 8.1 List

- **KPI:** anchor + **"N ohne Bescheinigung" pill** (disappears at zero) + "M Bescheinigungen versandt". **No fake "Sammelbestätigungs-Fenster" deadline** (there is no statutory cutoff; removed to avoid a false signal).
- **Columns:** Datum, ID, Spender, Art (Spendenart badge), Zweckbindung, Betrag, **Bescheinigung** (shows B-Nummer when issued, else "ausstehend").
- **Filters:** Spendenart, Zweckbindung, Bescheinigung-Status, Spender (+ search). Saved view: "Ohne Bescheinigung".

### 8.2 Entry form (3 pickers + derived badge)

- **Spendenart\*** (Geldspende / Sachspende / Aufwand — _Aufwand disabled, Phase 2_).
- **Zweckbindung\*** (zweckfrei / zweckgebunden). Zweckgebunden → reveals **required** Zweckbindungs-Text (§ 55 AO).
- **Projekt** (optional; relevant for zweckgebundene Mittel / Mittelverwendungsrechnung).
- **Sachspende** reveals the **Wertermittlungs-block**: Gemeiner Wert* (= Betrag, § 9 BewG), Wertermittlungsmethode*, Zustandsbeschreibung\*, Herkunftsbeleg (optional).
- **Spender:** Mitglied (address auto-filled) or Externe Person (Name* + Adresse* + Email).
- **Derived badge:** "Wird gebucht als <Ideeller> · Kategorie <…> · Anlage Gem Zeile <…>". No Kategorie picker. Sphäre always Ideeller.
- Bescheinigung issuance / Sammelbestätigung remain Bescheinigungs-side concerns (group a donor's year by `spender`/member + Buchungsjahr at print time); no impact on the entry form.

---

## 9. Detail / edit page

Route-based (`/app/<kind>/[id]`) presented as a modal-style surface (deep-linkable, back-button friendly).

- **Desktop:** sticky header (title, status badge, provenance line, × close) · two-column body — **Beleg large on the left** at natural aspect ratio (contain: portrait fills height, landscape fills width), **fields + Verlauf on the right** (scrollable) · **unified sticky footer** spanning full width — context workflow action (e.g. "Als bezahlt markieren", "Bescheinigung erstellen", Rechnung link) + **Speichern** (disabled until dirty). **No "Verwerfen"** — × / back with an unsaved-changes guard. Fields start with Bezeichnung (no "Details" header).
- **Mobile:** stacked, Beleg as a **fold** — a "peek card" (top slice of the receipt with fade + "Beleg ansehen ⤢") that opens a **full-screen viewer** (see §10). All fields present; Verlauf collapsible; sticky bottom action bar (workflow action + Speichern).
- **Festgeschrieben:** all fields read-only, footer save hidden, amber lock notice ("Korrektur nur über Storno") — server-enforced (ADR-0006).
- Context actions by kind: Ausgabe → "Als bezahlt markieren" (if genehmigt); Einnahme → Rechnung link; Spende → "Bescheinigung erstellen".

---

## 10. Beleg viewer (pragmatic, universal)

Robust on every browser/device; gestures are progressive enhancement only.

- **Fold (mobile default):** pure-CSS peek card (clipped + gradient). Universal.
- **Full-screen viewer:** explicit controls — **× Schließen**, **↗ Original öffnen**, **↓ Download**, **+ / −** zoom over a scrollable container, **‹ / ›** page arrows + dots. Pinch-zoom / swipe-dismiss / swipe-pages layer on where supported but are never required.
- **PDFs** shown as server-rendered page images (not inline pdf.js); "Original öffnen" hands off to the native viewer. **Images** shown directly. (See §3.4.)
- **Desktop** shows the Beleg permanently in the left column (no fold).

---

## 11. EÜR + downstream reflection

- Mandatory Kategorie + derived `sphere_snapshot` feed the existing EÜR computation (per-sphere, ADR-0002) and Anlage-EÜR / Anlage-Gem line mapping via `kategorie.eur_zeile` / `anlage_gem_zeile`.
- Donations map to Anlage-Gem via the derived category. Sachspenden carry their Wertermittlung for prüfungssichere documentation.
- "Heute" dashboard KPIs continue to read live state (current year). The deferred "Auswertungen" surface (§13) will provide multi-year charts.

---

## 12. Visual system

- **Sphere palette** (reused on lists, detail, EÜR, dashboard): Ideeller = pink (`#fce7f3`/`#9d174d`), Vermögen = blue (`#eff6ff`/`#1e3a8a`), Zweckbetrieb = purple (`#ede9fe`/`#5b21b6`), Wirtschaftlich = amber (`#fef3c7`/`#92400e`).
- **Status badges** (Ausgaben): offen/zu_pruefen (neutral), genehmigt (blue), erstattet (green), abgelehnt (red).
- Calm, spacious aesthetic (Things/Linear/Notion); tabular-nums for money; quiet anchor lines; pills that disappear at zero.
- Sticky-footer modal frame is the shared pattern for all entry forms + the detail surface.

---

## 13. Out of scope / deferred

- **Analytical "Auswertungen / Jahresübersicht" dashboard** (fast-follow): a separate, range-based multi-year surface — grouped Einnahmen-vs-Ausgaben bars per year, one per-sphere stacked bar across years, an EÜR-style exact-cents table, click-a-bar → that year's transactions. Deliberately sparse (no donuts/sparklines/gauges/MoM theatre). Built after the core ships.
- **Aufwandsspende** workflow (Phase 2; schema present, picker disabled).
- **Global topbar year picker** (rejected, §5).
- **Post-Festschreibung sphere_overrides** (Phase 2, ADR-0011).

---

## 14. Testing strategy

- **Unit:** filter registry → SQL predicate mapping (per field); URL serialize/parse round-trip + Zod validation of garbage params; `(spende_kind, zweckbindung_kind) → kategorie` derivation; sphere-from-kategorie derivation; beleg-requirement CHECK logic; year defaulting.
- **Integration (app_runtime identity):** mandatory-Kategorie NOT NULL enforcement; beleg-or-Begründung CHECK; zweckbindung_text CHECK; Verein auto-paid produces `erstattet` + no mail; member "Schon bezahlt" produces `erstattet` + optional mail; Rechnung "Als bezahlt" creates+links income with locked project; Festschreibung read-only gate.
- **E2E (Playwright, `@phase-N`):** create each kind; filter + saved view; mark-paid flows; Spende Sachspende reveal + Bescheinigung; mobile Beleg fold→viewer; year filter incl. "Alle Jahre"; EÜR reflects new bookings.
- Hermetic Postgres + reset-test-db seed (incl. reseeded kategorien + donation-derivation fixtures).

---

## 15. Migration / rollout

- Additive schema migrations first (new columns, enums, CHECKs as NOT VALID → validate), then the data wipe + kategorien reseed, then code. Follow the two-phase destructive-migration rule (CLAUDE.md): additive ships before code that depends on it; DROP/strict constraints last.
- Data wipe: truncate `expenses`, `income`, `donations` (and dependent rows) in a controlled migration/seed step; reseed reference data + derivation fixtures.
- New env/secrets: none anticipated (HEIC/PDF rendering reuses existing storage + PDF capability — confirm during planning).

---

## 16. Open items to confirm during planning

- Exact reuse path for **PDF→page-image** rendering (invoice pipeline reuse vs. a small shared renderer) and **HEIC→JPEG** conversion library/runtime on Vercel.
- Whether to denormalize the income↔invoice link (add `income.from_invoice_id`) for the 🔗 badge vs. join-on-read.
- Whether `wertermittlung_methode` is a Postgres enum vs. text (enum recommended).
- Final seeded category list + EÜR/Anlage-Gem line numbers (Steuerberater input).
