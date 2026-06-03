# Transactions Redesign — Ausgaben / Einnahmen / Spenden as three tabs

**Status:** Design (approved in brainstorming) — rebased onto `origin/main` (Phase 12). Ready for implementation plan.
**Date:** 2026-06-03 (rev. 2 — reconciled with shipped code)
**Author:** Andy + Claude (brainstorming session)
**Primary user:** Julia, Kassenwartin (treasurer) — daily operator, calm-UI preference, year-end close.

> **Baseline note.** This branch (`feat/transactions-three-tabs`) was originally cut from Phase 8; `origin/main` is now at Phase 12 and has _already shipped_ much of the infrastructure this feature needs. This revision builds **on** that shipped code rather than reinventing it. Before implementation, rebase this branch onto `origin/main`. A parallel branch `phase-beitrag-1-datamodel` (membership dues) is **orthogonal** — it touches none of our surfaces (Beiträge live in `member_beitrags`, not `income`); only coordinate migration numbering and treat `members` as read-only.

---

## 1. Problem & Goals

Today `/app/transactions` is one merged list with a type-tab header plus a half-separate `/spenden` sub-route. Categories aren't enforced, income editing is thin, the "Verein paid directly" case is clumsy, and filtering is client-side (fetch-all-then-slice).

**Goals**

- Split into three first-class tabs — **Ausgaben**, **Einnahmen**, **Spenden** — each with its own logic, list, entry, and detail UX.
- **Mandatory Kategorie** on Ausgaben + Einnahmen; **Sphäre strictly derived from Kategorie** (no override in our UI). Spenden derive Kategorie from Spendenart + Zweckbindung.
- **Bullet-proof, composable filtering + saved views** (chip-based, server-side) shared across tabs.
- **Mandatory Beleg** on Ausgaben (or an explicit, justified "kein Beleg"); Einnahmen Beleg optional; Rechnung-linked Einnahmen show the link.
- Elegant mark-as-paid: Verein-direct books paid immediately; admins can mark a member/extern expense already-paid; **bulk** mark-paid.
- Everything reflects in the (already shipped) EÜR + dashboard.
- Great, fully responsive UX; pragmatic for a ~20-person Verein.

**Non-goals / deferred** (see §14): analytical multi-year dashboard (**already shipped** — cashflow cards, sphere chips, sparklines, EÜR YoY); Aufwandsspende (Phase 2); partial invoice payments; post-Festschreibung sphere_overrides (Phase 2, ADR-0011).

---

## 2. What we REUSE vs BUILD

### 2.1 Reuse (already shipped on `origin/main` — do not rebuild)

| Capability                                                            | Where it lives                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global year switcher** (`?year=`, topbar segmented + mobile select) | `YearSwitcher.svelte`, `MobileYearPicker.svelte`, `src/lib/domain/year.ts`, `src/lib/server/domain/years.ts`, `/app/+layout.server.ts` (provides `selectedYear`, `availableYears`, `currentYear`, `festgeschriebenBis`)            |
| **Upload pipeline + Blob + `files` table**                            | `src/lib/server/files/` (`storage.ts`, `upload-pipeline.ts`, `thumbnail.ts`), `files` schema, `belegFileId` FK on all three tx tables, `/api/files/[id]/blob` + `/thumbnail`                                                       |
| **Client HEIC→JPEG + scan-PDF compression**                           | `src/lib/client/file-compress.ts` (browser-image-compression; pdfjs)                                                                                                                                                               |
| **Rechnung → income link**                                            | `markInvoiceAsPaid()`, `undoPayment()`, `editInvoice()` in `src/lib/server/domain/invoices.ts`; `invoices.paidByIncomeId` + `bezahltAm`                                                                                            |
| **Sphere resolver + EÜR + dashboard**                                 | `resolveSphereForKategorie()` (`transaction-pickers.ts`); EÜR workspace `/app/jahresabschluss/[year]/*` (`computeEurYear`, `SphereYoYTable`); dashboard cashflow (`CashflowOverviewSection.svelte`, `src/lib/domain/cashflow.ts`)  |
| **Tx create/detail helpers**                                          | `createExpense/createIncome/createDonation`, `getTransactionDetail`, `markExpenseAsPaid` (reimbursement), `checkFestschreibungGate`, `listZahlungsarten`, `listApprovedPendingErstattet` (`src/lib/server/domain/transactions.ts`) |
| **pdfjs-dist** (`^4.10.38`, worker wired)                             | already a client dependency                                                                                                                                                                                                        |

### 2.2 Build (this spec)

Three flat routes + nav; mandatory Kategorie (NOT NULL); the **full** chip-based filter backbone (replacing client-side filtering); entry-form upgrades (Verein auto-paid, "Schon bezahlt" admin toggle, beleg-or-Begründung, Sachspende Wertermittlung, derived-sphere badge); detail-page redesign (Beleg-left + unified footer + mobile fold + **unified pdfjs canvas viewer**); Spenden 3-picker form; per-tab list UIs + KPIs; bulk mark-paid; CSV export of the filtered list; duplicate-as-template; polished empty/error/loading states.

---

## 3. Scope decisions (locked)

1. **Routing:** flat `/app/ausgaben`, `/app/einnahmen`, `/app/spenden`; detail at `/app/<kind>/[id]`. **Desktop:** three sidebar entries. **Mobile:** keep ONE "Transaktionen" bottom-tab → lands on a **segmented Ausgaben | Einnahmen | Spenden switcher** (the 4-slot mobile bar is already full).
2. **Year scope:** **adopt the shipped global `?year=` switcher** on all three tabs (lists consume `selectedYear` from layout). Add an **"Alle Jahre"** option **for the lists only**; dashboard/EÜR require a concrete year (coerce `?year=all` → current year, with a one-line note). Keep EÜR's `[year]` path-segment model. Add a **loud stale-year banner** when `selectedYear ≠ currentYear` ("Ansicht: 2024 — nicht das laufende Jahr") and **year-named empty states** ("Keine Buchungen in 2024").
3. **Mandatory Kategorie** on Ausgaben + Einnahmen (`kategorie_id` NOT NULL + UI required). Spenden: no Kategorie picker — derived.
4. **Sphäre strictly follows the chosen Kategorie** in our entry/edit forms: set `sphere_snapshot = kategorie.sphere`; **do not apply project sphere-default; do not expose any manual override.** Keep the existing ADR-0008 columns (`sphere_override`, project `sphere_default`) for compatibility but our new forms never set/use them. (Note: this intentionally bypasses `resolveSphereForKategorie`'s project-override branch for new app entries.)
5. **Edit on the detail route** `/app/<kind>/[id]`, modal-style surface (header / body / unified footer).
6. **Data:** wipe the Verein's **real prod** transaction data, reseed test fixtures for the new model, preserve invoice↔income integrity (see §15). Enforce new constraints from a clean base.
7. **Mobile:** lists → cards; Beleg uses a fold (peek → full-screen unified viewer).

---

## 4. Data model changes

> Money in integer cents (ADR-0003); year via `year_for_booking` (ADR-0001); sphere snapshot (ADR-0002); Festschreibung gate (ADR-0006); side effects via event bus; audit append-only (ADR-0004); provenance `source_kind='app'` (ADR-0010). Migrations are additive→backfill→constrain (two-phase, CLAUDE.md), numbered after the highest free index at rebase time (origin/main is at `0025`; the beitrag branch will consume `0026–0028` — coordinate).

### 4.1 `expenses`

- `kategorie_id` → **NOT NULL** (currently nullable). `kategorie_name_snapshot`, `sphere_snapshot` already NOT NULL.
- `sphere_snapshot` set server-side from `kategorie.sphere` (no override).
- **Beleg requirement:** add `beleg_verzicht_grund text` (justification for "kein Beleg vorhanden" — bank fees, GEMA, etc.). CHECK: `beleg_file_id IS NOT NULL OR beleg_verzicht_grund IS NOT NULL`. The Begründung is audit-logged. (Reuses the shipped `belegFileId` FK → `files`.)
- **Direct-paid:** `bezahlt_von_kind='verein'` (or admin "Schon bezahlt" for member/extern) → create with `status='erstattet'`, `erstattet_am` (default today), `zahlungsart_id`, `approved_at`/`approved_by`; reuse `markExpenseAsPaid` semantics. No Erstattungsmail for Verein; optional mail for member/extern.

### 4.2 `income`

- `kategorie_id` → **NOT NULL**. `sphere_snapshot` from `kategorie.sphere`.
- Beleg **optional**.
- **Rechnung link is already built** (`markInvoiceAsPaid` sets `paidByIncomeId`/`bezahltAm` + creates the income row). We only **surface** it: a 🔗 indicator on linked rows (join on `invoices.paidByIncomeId`), and read-only "aus Rechnung FDW-…" context on the detail. No new create-from-Rechnung flow. **No partial payments** (shipped model is full-amount-only).

### 4.3 `donations`

- Derived Kategorie: server maps `(spende_kind, zweckbindung_kind)` → a seeded Kategorie row; sets `kategorie_id` + `kategorie_name_snapshot`; `sphere_snapshot='ideeller'` always.
- `zweckbindung_text` **required when `zweckbindung_kind='zweckgebunden'`** (CHECK: `zweckbindung_kind='zweckfrei' OR zweckbindung_text IS NOT NULL`).
- **Sachspende Wertermittlung** — new columns:
  - `wertermittlung_methode` — new pgEnum `wertermittlung_methode` = (`marktpreis`, `kaufbeleg`, `schaetzung`, `buchwert`); required when `spende_kind='sachspende'`.
  - `zustand_beschreibung text` — required when `spende_kind='sachspende'`.
  - `herkunftsbeleg_file_id uuid` → `files` — optional (separate from the main `belegFileId`).
  - `betrag_cents` holds the **gemeiner Wert** (§ 9 BewG) for Sachspenden.
- Spender: member (address from member record) or external person (Name + Adresse required for the Bescheinigung; Email optional).
- **Mitgliedsbeiträge are NOT donations** (separate `member_beitrags` workflow — see beitrag branch).

### 4.4 `kategorien` reseed

- Correct `sphere` per category + `eur_zeile`/`anlage_gem_zeile` for used categories (so EÜR mapping works — `computeEurYear` already consumes these).
- Seed the donation-derivation lookup categories (`kind='income'`, `sphere='ideeller'`): e.g. "Geldspende zweckfrei", "Geldspende zweckgebunden", "Sachspende", each with its Anlage-Gem/EÜR line. The `(spende_kind, zweckbindung_kind) → kategorie` mapping is a documented, unit-tested lookup, seeded `source_kind='fixture'`.

---

## 5. Filtering + saved-views backbone (FULL, shared, robust)

Typed, composable, URL-driven, **server-side** filtering shared by all three lists. (Replaces today's client-side fetch-all-then-`.slice()` in `listTransactions` — a real scaling bug.)

- **Typed filter registry per tab.** Each field declared once: `{ key, label, type, allowedValues }`, `type ∈ {enum-multi, member-picker, date-range, amount-range, boolean}`. The chip bar renders from the registry; new filter = one entry.
- **URL is the single source of truth.** Filter state serialized to `searchParams`, **Zod-validated** on load (garbage → defaults, never crash). Composes with the global `?year=` (§6).
- **Server-side application.** Each field maps to one tested SQL `WHERE` predicate; pagination + counts respect filters.
- **Saved views as data.** Built-in presets in code (Ausgaben "Offen zu erstatten"; Spenden "Ohne Bescheinigung") **plus custom user-defined views** persisted in `localStorage`. Both serialize to/from the same filter-state object. One serializer/parser.
- **One shared component, three registries.** Identical interaction across tabs; per-piece unit tests.
- **Chip UI:** persistent search + "+ Filter" field menu + removable active chips (AND) + "Ansichten ▾" presets/saved + "Zurücksetzen" + live count.
- **Mobile filter UX:** the chip bar collapses on small screens — year pill + search inline; "+ Filter"/active chips live in a bottom **`sheet`** (avoids chip overflow). (Use the shipped `sheet` component.)

**Per-tab fields**

- **Ausgaben:** Status (offen→`zu_pruefen`/`in_pruefung`, genehmigt→`geprueft`, erstattet, abgelehnt), Bezahlt von (Verein/Mitglied/Extern), Kategorie, Monat, Betrag, "Beleg fehlt".
- **Einnahmen:** Kategorie, Sphäre, "nur mit Rechnung", Monat, Betrag.
- **Spenden:** Spendenart, Zweckbindung, Bescheinigung-Status, Spender, Monat, Betrag.

Year is **not** a chip — it's the shipped global pill (§6), to avoid two ways of setting year.

---

## 6. Year scope (adopt shipped global switcher)

- **Lists** consume `selectedYear` from `/app/+layout.server.ts` (the shipped `?year=`), like the dashboard/Mitglieder/Files already do. Add **"Alle Jahre"** as a list-only switcher value; when active, suppress year-anchored summary rows and use year-named-or-"alle" empty states.
- **Dashboard / EÜR** require a concrete year; `?year=all` coerces to `currentYear` with a one-line note (never blank KPIs). EÜR keeps its `[year]` path.
- **Safeguards (both UX experts):** loud, non-dismissible **stale-year banner** when `selectedYear ≠ currentYear`; **year-named empty states** ("Keine Buchungen in 2024", never a bare empty state). The mobile `<select>` is quiet, so the banner is load-bearing.
- Entry forms keep using real dates (`gebucht_am` authoritative) — the year is a hint; no wrong-year bookings.

---

## 7. Ausgaben tab

### 7.1 List

- **KPI anchor:** `<Jahr|Alle> · <Summe> · <N> Buchungen` + a **"N offen" pill** (approved-not-erstattet) that **disappears at zero**, showing oldest-open age ("3 offen · älteste 18 Tage") — the look-hole guard.
- **Columns (sortable, default Datum desc):** Datum, ID, Bezeichnung (+ Bezahlt-von subtitle), Bezahlt von, Kategorie, Sphäre (colored badge), Betrag (right, tabular), Status (badge), chevron. Mobile → cards (define the card hierarchy + an explicit sort control, since headers vanish).
- **Filters:** Status, Bezahlt von (+ search). Preset: **"Offen zu erstatten"**.
- **Bulk:** row multi-select → **"Als bezahlt markieren"** for many at once (pairs with the existing SEPA flow / `listApprovedPendingErstattet`).
- Festgeschriebene rows muted, not editable.

### 7.2 Entry form (sticky-footer modal)

- Fields: Bezeichnung*, Betrag*, Rechnungsdatum, **Kategorie\*** (derived Sphäre + EÜR-Zeile hint), **Projekt** (optional), Bezahlt von\*, **Beleg\*** (upload or "Kein Beleg vorhanden" → mandatory Begründung), Kommentar.
- **Bezahlt von** drives behavior — _distinct affordances to avoid the mode-error_:
  - **Verein** → "Direkt als bezahlt buchen" panel (Zahlungsart* + Datum*, default today). Save → **erstattet**. No mail.
  - **Mitglied / Extern** → default = Auslagenflow (`genehmigt`). An **admin-only** "Schon bezahlt?" toggle reveals a _visually distinct_ paid panel (Zahlungsart + Datum + optional "per E-Mail benachrichtigen"). Save → **erstattet**. Extern shows Name + IBAN + Email instead of the member picker.
- **Full member names everywhere** (lists + forms).
- **Duplicate-as-template:** "Duplizieren" on any Ausgabe detail → pre-filled new entry (recurring Miete/GEMA without a recurrence engine).
- Footer: unified; Speichern label reflects mode; disabled until dirty.

### 7.3 Auslagenflow integration

Public-form → Belegprüfung (Audit-Inbox) → approve stays. On approval an `expenses` row appears in the Ausgaben tab (`geprueft`); treasurer-direct/Verein entries appear `erstattet`. Belegprüfung stays a separate route; the hand-off boundary: an item leaves the Inbox once approved/rejected (it then lives only in the tab).

---

## 8. Einnahmen tab

### 8.1 List

- **KPI:** anchor + **Sphären-Split chips** (Ideeller/Vermögen/Zweckbetrieb/Wirtschaftlich totals).
- **Columns:** Datum, ID, Bezeichnung (+ 🔗 if Rechnung-linked), Kategorie, Sphäre, Betrag. No status column.
- **Filters:** Kategorie, "nur mit Rechnung" (+ search).

### 8.2 Entry form

- **Freie Einnahme** (e.g. Eventfrog): Bezeichnung*, Betrag*, Geldeingang\*, **Kategorie\*** (derived Sphäre), **Projekt** (optional), Beleg (**optional**), Kommentar.
- **Aus Rechnung** is **not built here** — it's the shipped `markInvoiceAsPaid` on the Rechnung detail. We render the resulting income row with a read-only 🔗 badge (and the locked Projekt comes from the invoice). Full-amount only.

---

## 9. Spenden tab

### 9.1 List

- **KPI:** anchor + **"N ohne Bescheinigung" pill** (disappears at zero) + "M Bescheinigungen versandt". **No fake "Sammelbestätigungs-Fenster" deadline** (no statutory cutoff — removed to avoid a false signal).
- **Columns:** Datum, ID, Spender, Art, Zweckbindung, Betrag, Bescheinigung (B-Nummer or "ausstehend").
- **Filters:** Spendenart, Zweckbindung, Bescheinigung-Status, Spender (+ search). Preset: "Ohne Bescheinigung".

### 9.2 Entry form (3 pickers + derived badge)

- **Spendenart\*** (Geldspende / Sachspende / Aufwand — _Aufwand disabled, Phase 2_).
- **Zweckbindung\*** (zweckfrei / zweckgebunden) → zweckgebunden reveals **required** Zweckbindungs-Text (§ 55 AO).
- **Projekt** (optional; for zweckgebundene Mittel / Mittelverwendung).
- **Sachspende** reveals the **Wertermittlungs-block:** Gemeiner Wert* (= Betrag, § 9 BewG), Wertermittlungsmethode*, Zustandsbeschreibung\*, Herkunftsbeleg (optional).
- **Spender:** Mitglied (address auto-filled) or Externe Person (Name* + Adresse* + Email).
- **Derived badge:** "Wird gebucht als <Ideeller> · Kategorie <…> · Anlage Gem Zeile <…>". No Kategorie picker. Sphäre always Ideeller. (Render as a styled hint, not debug text.)
- Bescheinigung issuance / Sammelbestätigung remain Bescheinigungs-side (group a donor's year at print time); not part of the entry form.

---

## 10. Detail / edit page

Route-based (`/app/<kind>/[id]`), modal-style surface (deep-linkable, back-button friendly).

- **Desktop:** sticky header (title, status badge, provenance, × close) · two-column body — **Beleg large on the left** at natural aspect ratio (contain: portrait fills height, landscape fills width) · **fields + Verlauf on the right** (scrollable) · **unified sticky footer** spanning full width: context workflow action (Ausgabe "Als bezahlt markieren"; Einnahme Rechnung link; Spende "Bescheinigung erstellen") + **Speichern** (disabled until dirty). **No "Verwerfen"** — × / back with an unsaved-changes guard. Fields start with Bezeichnung (no "Details" header).
- **Mobile:** stacked; Beleg as a **fold** — peek card (top slice + fade + "Beleg ansehen ⤢") → full-screen **viewer** (§11). All fields present; Verlauf collapsible; sticky bottom action bar.
- **Festgeschrieben:** read-only fields, footer save hidden, amber lock notice ("Korrektur nur über Storno") — server-enforced (ADR-0006).

---

## 11. Beleg viewer (unified pdfjs canvas — images + PDFs)

- **Fold (mobile default):** pure-CSS peek card (clipped + gradient). For images, show the thumbnail (`/api/files/[id]/thumbnail`); for PDFs, render page-1 to a small canvas (or the PDF icon as fallback).
- **Full-screen viewer:** explicit controls — **× Schließen**, **↗ Original öffnen**, **↓ Download**, **+ / −** zoom (scrollable container), **‹ / ›** page nav + dots. Gestures (pinch, swipe-dismiss, swipe-pages) are progressive enhancement; never required.
- **Rendering:** **images** → `<img>` from `/api/files/[id]/blob` (auth'd). **PDFs** → render pages to an **on-screen `<canvas>`** via `pdfjs-dist` (already a dep) — works on all modern browsers incl. iOS Safari (the OffscreenCanvas limitation in the compression worker does **not** apply to on-screen canvas). Render **lazily, one page at a time** (memory safety). **"Original öffnen" is the graceful fallback** for the rare unrenderable PDF (encrypted/corrupt/huge).
- **Desktop** shows the Beleg permanently in the left column (no fold).
- Reuses the shipped `files` table, `belegFileId`, and `/api/files/[id]/blob|thumbnail` routes; no server-side PDF rasterization or server HEIC conversion is introduced (HEIC→JPEG already happens client-side pre-upload).

---

## 12. Exports + downstream reflection

- **CSV export of the active filtered list** (per tab) — reuses the §5 server-side WHERE to stream a CSV for the Steuerberaterin. (The EÜR workspace already has its own `transactions.csv` / `bundle.zip` / exports tab; this is the per-tab convenience export.)
- Mandatory Kategorie + derived `sphere_snapshot` feed the **shipped** EÜR (`computeEurYear`, Anlage-EÜR/Gem mapping) and dashboard cashflow. Sachspenden carry Wertermittlung for prüfungssichere documentation. No EÜR/dashboard redesign — they already exist.

---

## 13. Visual system

- **Sphere palette** (reused on lists, detail, EÜR, dashboard): Ideeller = pink (`#fce7f3`/`#9d174d`), Vermögen = blue (`#eff6ff`/`#1e3a8a`), Zweckbetrieb = purple (`#ede9fe`/`#5b21b6`), Wirtschaftlich = amber (`#fef3c7`/`#92400e`).
- **Status badges** (Ausgaben): offen/zu_pruefen (neutral), genehmigt (blue), erstattet (green), abgelehnt (red). Avoid badge-soup: consider Sphäre as a quiet left rule when a row already shows a status badge.
- **Icons not emoji:** the 🔗/🔒/⤢ glyphs in mockups become icon components in implementation.
- Calm, spacious aesthetic (Things/Linear/Notion); tabular-nums for money; quiet anchor lines; pills that disappear at zero. Sticky-footer modal frame is the shared pattern for entry forms + detail.
- **UI primitives to add** (not in the current `ui/` set): combobox/`popover` (the "+ Filter" menu + member-picker), `tooltip` (truncation), `pagination`, multi-select chips, and the mobile filter `sheet` (the `sheet`/`dialog` pair already exists). Flag the "route renders as deep-linkable modal" pattern for design attention.
- **A11y:** chip keyboard nav (focus + Backspace to remove), `aria-sort` on sortable headers + keyboard sort, ≥44px tap targets (chips, viewer controls, card chevrons), truncation-with-tooltip for long names/Bezeichnung.

---

## 14. Out of scope / deferred

- **Analytical multi-year dashboard** — _already shipped_ (cashflow cards + sphere chips + sparklines; EÜR YoY table). Not rebuilt.
- **Aufwandsspende** workflow (Phase 2; picker disabled).
- **Partial invoice payments** (shipped model is full-amount-only; not extended).
- **Post-Festschreibung sphere_overrides** (Phase 2, ADR-0011).

---

## 15. Migration / rollout

- **Two-phase, additive-first** (CLAUDE.md): ship additive migrations (new columns, `wertermittlung_methode` enum, `beleg_verzicht_grund`, `zustand_beschreibung`, `herkunftsbeleg_file_id`; CHECKs as `NOT VALID` then `VALIDATE`) **before** code that depends on them. Make `kategorie_id` NOT NULL only after the data is clean.
- **Data wipe (prod):** clear the Verein's real `expenses`/`income`/`donations`. **Preserve invoice↔income integrity** — for any invoice with `paidByIncomeId`, either also clear the paid invoices or null the link + reset `bezahltAm` (decide during planning; default: clear the corresponding paid-invoice payment state too so no dangling links). Reseed reference data (`kategorien` incl. donation-derivation fixtures) + test fixtures for the new model.
- **Migration numbering:** origin/main is at `0025`; the `phase-beitrag-1` branch will land `0026–0028`. Our migrations take the next free indices at rebase time — coordinate to avoid journal collisions.
- **Generated columns / self-FKs:** preserve the hand-written generated-column tails (`betrag_eur`, `year_of_buchung`) and the festschreibung/`supersedes_id` self-FKs when editing these tables; wipe must respect FK order (donations → expenses via `aufwandsspende_aus_expense_id`).
- **Routing migration:** `nav-registry.ts` updated (three desktop entries; one mobile "Transaktionen" → segmented switcher). ~14 references to `/app/transactions` (Topbar, KPI/Checklist sections, `sepa/xml.ts`, `events/handlers.ts`, inbox/projekte links, the `[id]/zuwendungsbestaetigung` PDF route, e2e specs) updated + redirects from the old path.
- **No new env/secrets** anticipated (Beleg reuses Blob + client compression; pdfjs already bundled).

---

## 16. Testing strategy

- **Unit:** filter registry → SQL predicate (per field); URL serialize/parse round-trip + Zod garbage-param handling; `(spende_kind, zweckbindung_kind) → kategorie` derivation; `sphere = kategorie.sphere` derivation (and that project override is NOT applied in new entries); beleg-or-Begründung CHECK; zweckbindung_text CHECK; "Alle Jahre" / stale-year coercion; pdfjs page-render fallback path.
- **Integration (app_runtime identity):** NOT NULL kategorie_id enforcement; CHECK constraints; Verein auto-paid → `erstattet` + no mail; member "Schon bezahlt" → `erstattet` + optional mail; bulk mark-paid; reuse of `markExpenseAsPaid`; the income↔invoice link surfacing (read-only); Festschreibung read-only gate; CSV export rows match the filtered query.
- **E2E (Playwright, `@phase-N`):** create each kind; chip filter + saved view (+ custom saved view); year switch incl. "Alle Jahre" + stale-year banner; bulk mark-paid; Sachspende reveal + Bescheinigung status; mobile fold → unified viewer (image + PDF); duplicate-as-template; EÜR reflects new bookings.
- Hermetic Postgres + reset-test-db seed (reseeded kategorien + donation-derivation fixtures). Update existing `transactions.spec.ts` / `spenden.spec.ts` / `julia-review.spec.ts` / `dashboard.spec.ts` for the new routes.

---

## 17. Open items to confirm during planning

- Exact prod-data-wipe handling of paid invoices (clear payment state vs null the link).
- Mobile card information hierarchy + sort affordance (headers vanish on cards).
- Whether the per-tab CSV export needs the same columns as the EÜR `transactions.csv` (avoid two divergent formats).
- Final seeded category list + EÜR/Anlage-Gem line numbers (Steuerberater input).
- Confirm `wertermittlung_methode` as pgEnum (recommended) vs text.
