# Brainstorming Briefing — 2026-05-19 Deep-Dive Pass

Six specialist agents ran in parallel on the live app for ~17 minutes each
(julia-buchhaltung, auslagen-tester, vereinsbuchhalter, ux-expert,
ui-designer, pwa-mobile). This document collapses their **171 raw findings**
into the agenda for the `/brainstorming` session with Andy.

Each individual report (with screenshots, Playwright spec, machine-readable
findings JSON) lives under `docs/reviews/2026-05-19-deepdive-*`.

## Top-line tally

| Agent | Findings | P0 | P1 | Top theme |
| --- | --- | --- | --- | --- |
| julia-buchhaltung | 28 | 0 | 5 | Dashboard cashflow + year switch + EÜR thinness |
| auslagen-tester | 4 | 2 | 1 | **Public form is broken right now** (AT-001 already fixed in this briefing commit) |
| vereinsbuchhalter | 20 | 3 | 3 | EÜR workspace + sphere-bug + Festschreibung pre-flight |
| ux-expert | 46 | 2 | 9 | Sidebar diet + year switcher + dashboard rewrite |
| ui-designer | 45 | 1 | 13 | System primitives, type+color discipline, EÜR re-skin |
| pwa-mobile | 28 | 2 | 6 | Real icons, manifest shortcuts, share-target, FAB wired |
| **Sum** | **171** | **10** | **37** | |

## Cross-reviewer confluence (the "definitely build it" items)

A finding flagged by ≥ 2 independent agents is high-confidence. Cluster by
problem area:

### 🔴 P0 — Andy's three explicit gaps (every agent agrees)

| Problem | Agents | Single-line solution |
| --- | --- | --- |
| **EÜR page is a 4-row table, not a workspace** | VB-001, JB-007, UX-100, UI-002 | Tabs: Overview / Buchungsliste / Spenden / Exports. Add YoY column, monthly trend strip, project filter, pre-flight checklist, big "PDF drucken" button at top. |
| **No global fiscal-year switcher** | VB-002, JB-001, UX-010 | Sticky topbar segmented control or compact dropdown. URL-param convention `?year=NNNN`. Persist last choice in localStorage. Lock-icon on festgeschriebene years. |
| **Dashboard doesn't answer "wie geht's uns dieses Jahr?"** | VB-003, JB-005, UI-008, UX-330 | Replace the 4 identical KPI cards with: 2 large Einnahmen/Ausgaben cards (sparkline + LY delta) + 4 chips for quick links. KPI cards must link to pre-filtered transaction views. |

### 🔴 P0 — Tax-compliance bug (caught by 2 reviewers)

| Problem | Agents | Solution |
| --- | --- | --- |
| **`/app/transactions/neu` hardcodes `sphere=ideeller` + `kategorie=(Unkategorisiert)`** — every direct entry lands in the wrong sphere, making the EÜR worthless | VB-004, JB-014 | Make sphere + kategorie required form fields, picker dropdowns with the actual enum / kategorien options. Pre-select last-used as a smart default. |

### 🔴 P0 — Public form actually broken (fixed in this briefing commit)

| Problem | Agent | Status |
| --- | --- | --- |
| **`AuslagenForm.svelte` action attr was `?/default` — SvelteKit returns 500** | AT-001, AT-004 | **Fixed**: `src/lib/components/forms/AuslagenForm.svelte:44` `action=''` |

### 🔴 P0 — PWA icons broken

| Problem | Agent | Solution |
| --- | --- | --- |
| **Browser tabs still show the Svelte default favicon**; manifest icons are SVG-only (iOS won't render reliably) | PM-001, PM-002 | Replace `src/lib/assets/favicon.svg`. Ship PNG 192/512/180 + maskable variants. ~30 min with any logo generator. |

### 🟠 P1 — Recurring themes across multiple agents

| Theme | Agents | Direction |
| --- | --- | --- |
| **Disabled mobile FAB** is the most prominent affordance on mobile and it's dead | UX-prior, PM-003 | Wire to a bottom-sheet menu: Neue Ausgabe / Neue Einnahme / Neue Spende / Auslage einreichen |
| **5 of 6 mail templates** still use old structure (only MagicLink follows the new brand-strip pattern) | UI-031, prior UX | Re-skin BeitragsReminder, EingangsMail, ErstattungsMail, RejectionMail, InvoiceVersendetMail to match MagicLink |
| **No primitives** — every page hand-rolls `Card`, `EmptyState`, `PageHeader`, `Money`, `SegmentedControl` | UI-005…UI-014 | Build them. ~3-4h. Massive drift prevention. |
| **Money displays lack `tabular-nums`** — columns shimmy | UI-013, UX-072 | `font-variant-numeric: tabular-nums` on every cents-formatter |
| **Mitglieder list doesn't degrade to cards on mobile** | UX-028, PM-009 | Add a 2nd render path below md breakpoint |
| **`mm/dd/yyyy` placeholders** in a German app | UX-030, UI-019 | Swap to `dd.MM.yyyy` + native German lang attr |
| **Project list empty in public-form layout** | AT-002 | Pass projects in `+layout.server.ts` |
| **Submit buttons say "Speichern"**, not the action | UX-020 | "Mitglied anlegen" / "Auslage einreichen" / "Spende erfassen" |
| **Empty states are blank** — no CTA, no "what is this page" | UX-021, UI-006 | Inline-CTA empty state per list |

## Andy's three gaps — concrete designs (cross-agent synthesis)

### Gap 1: EÜR page

The VB / UX / UI agents converged on the same shape:

```
┌─────────────────────────────────────────────────────────────────┐
│ Eyebrow: JAHRESABSCHLUSS                                        │
│ H1: EÜR 2026          [Year switcher ▾]   [PDF drucken] [⋯]    │
├─────────────────────────────────────────────────────────────────┤
│ Tabs: [Übersicht] Buchungsliste · Spenden · Exports             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Einnahmen   │  │ Ausgaben    │  │ Saldo       │              │
│  │ 18.420,00 € │  │ 14.230,00 € │  │ +4.190,00 € │              │
│  │ ▲ 12% vs LY │  │ ▼ 3% vs LY  │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                 │
│  Monthly trend strip ──────────────────────                     │
│                                                                 │
│  4-Sphere table (ideeller / Vermögen / Zweck / wirtschaftlich)  │
│  with: Einnahmen | Ausgaben | Saldo | YoY% | Drill              │
│                                                                 │
│  WGB-Status: 8.430 € von 50.000 € (16% • § 64 Abs. 3 AO)        │
│                                                                 │
│  Festschreibung-Status:  ○ offen  [Pre-flight starten →]        │
└─────────────────────────────────────────────────────────────────┘
```

Sketch lives in `docs/reviews/2026-05-19-deepdive-ui-designer.md` §2.1 with
Tailwind class skeletons.

### Gap 2: Global year switcher

The UX expert proposes a compact `<SegmentedControl>` in the topbar showing
last 3 years + current + "alle". Hovering reveals festgeschrieben-state via
lock icon. URL becomes `?year=2026` everywhere; current year sticks via
localStorage.

The vereinsbuchhalter calls out the policy question to brainstorm:
*"When I'm 'in 2025 view' and add a transaction with Datum 2024-12-30, what does that do?"*
Recommended answer: the form's Datum picker is authoritative; the topbar
year switcher only filters list/dashboard views.

### Gap 3: Income + expense dashboard

UI designer's sketch (`docs/reviews/2026-05-19-deepdive-ui-designer.md` §2.3):

```
Hero strip (2 large cards + 4 small chips):
  ┌─────────────────┐ ┌─────────────────┐
  │ Einnahmen 2026  │ │ Ausgaben 2026   │
  │ 18.420,00 €     │ │ 14.230,00 €     │
  │ ▲ 12% vs LY     │ │ ▼ 3% vs LY      │
  │ ━━━━╱━━━━━━━╲   │ │ ━━━━━━━╲━━━╱   │  (12-mo sparkline)
  └─────────────────┘ └─────────────────┘
  [Saldo] [Offene Rechnungen] [Inbox: 2] [Mitglieder: 14]
```

KPI cards link to filtered views. The 4 chips replace today's
`KpiSection` of 4 identical "open count" cards.

## Themes worth brainstorming (beyond Andy's 3 explicit gaps)

### Bookkeeping workflow gaps

- **No Storno UI** for festgeschriebene rows (VB-020) — schema is ready,
  no domain function, no UI. First correction need → dead end.
- **No pre-flight check** before Festschreibung (VB-006). Currently
  1-click with no validation.
- **No automated Bescheinigungs-mail** (VB-008) — PDFs generated but
  manually emailed; annoying at 20+ donations/year.
- **"Copy from previous year" for Mitgliedsbeiträge** (VB-009) — 5 min
  of code, saves 30 min/year.
- **Bank CSV import** (VB-010, money-review F-?) — at <€25k/year and
  ~20 tx/month, this is the biggest workflow lever (vs manual entry).
- **Kassenprüfungs-PDF** (VB-016) — formatted for ehrenamtliche
  Kassenprüfer, not for the Steuerberater.
- **Vorstandsentlastungs-Jahresreport** (VB-007) — audit_log has the
  data, no aggregated view.
- **Aufwandsspende temporal-ordering UI** — schema ready, UI needs to
  guide the user (BFH X R 32/16: Verzicht must be < 3 months from
  Aufwand).

### PWA / mobile high-leverage features

- **Manifest `shortcuts`** (PM-004): long-press app icon → Audit Inbox,
  Neue Spende, EÜR aktuelles Jahr, Auslage einreichen.
- **`share_target`** (PM-005): Android can share a PDF Beleg INTO the
  Auslage form.
- **Background Sync** (PM-006): public form survives flaky network.
- **EPC 069 Giro-QR code** on Beitragsreminder mails + Rechnungen
  (PM-024) — scan with banking app, fills SEPA-Lastschrift. Standard,
  client-side library, ~half a day. Big delight.
- **Camera capture for Beleg upload** (PM-014):
  `<input type="file" capture="environment">` opens the camera.
- **Wire the disabled mobile FAB** (PM-003) — the prior UX review
  flagged this too. Bottom-sheet menu.

### Design system primitives to build

Per UI designer's audit, these primitives don't exist and would prevent
the next 6 months of drift:

1. `<Card>` — radius / shadow standard
2. `<PageHeader>` — eyebrow + H1 + actions slot
3. `<EmptyState>` — illustration / message / CTA
4. `<Money>` — `tabular-nums`, color by sign, locale-aware
5. `<SegmentedControl>` — for year switcher + sphere filter
6. `<KpiCard>` — refactor the existing one to support
   sparkline + YoY delta variant

### Microcopy + IA polish

- **Sidebar diet** (UX-001): 9 main + 2 "Mehr" → 5 main entries.
  Specifically drop `/app/sheet-resync` from nav (it's a one-time
  importer).
- **Rename "Heute" → "Übersicht"** (UX-040) — Heute is misleading on
  the YTD-cumulative dashboard.
- **Toast undo** on every destructive action (UX-050).
- **Honest submit buttons** everywhere (UX-020).

## The anti-list (what NOT to build)

Cross-agent consensus on things that would be a mistake at this scale:

- ❌ Sentry / Datadog / log drains (UptimeRobot ping is enough — already
  deferred to issue #36)
- ❌ Web Push notifications (PM-021) — iOS PWA push is fiddly, 1-3
  users won't justify it
- ❌ Passkeys / WebAuthn (PM-022) — magic-link is already good enough
- ❌ Real-time presence / collaborative editing
- ❌ Slack / Discord integration
- ❌ AI categorization of expenses (yet)
- ❌ Recurring auto-bookings (you have 5-10 events/year; you'll set
  them manually)
- ❌ Multi-Verein / multi-tenant support
- ❌ A separate Mahnwesen system (Beitragsreminder cron is enough)
- ❌ Hardware-key / 2FA beyond magic-link

## Open questions for the brainstorming session

The agents converged on the WHAT. These are the WHEN / HOW decisions
to discuss with Andy:

1. **Sequencing**: do we ship the 4-P0 cluster (EÜR redesign, year
   switcher, dashboard rewrite, sphere fix) as one big PR or as four?
2. **Year switcher policy**: when "in 2024 view" and you add a
   transaction with Datum 2025-…, what happens?
3. **Bank CSV import** — which format(s)? DKB, Sparkasse, GLS? Or
   defer until you've felt the manual-entry pain for a few months?
4. **EPC Giro-QR codes** — worth doing in v1 of the
   Beitragsreminder, or Phase 2?
5. **Primitives PR** — refactor before features, or build features
   first and primitives next?
6. **PWA icon set** — generate via a tool or hand a designer brief?
   Andy's design taste matters here.
7. **Mobile FAB** — bottom-sheet with 4 actions, or a different
   pattern altogether?
8. **"Cancel + clean up" issue management** — we have 9 deferred
   issues (#30-#38) from the pragmatic-rebalance; do we want to
   close any of those now that we have a clearer picture?
9. **Anti-list ratification** — confirm we're explicitly NOT doing
   each of the items above.

## Where each report's full detail lives

- `docs/reviews/2026-05-19-deepdive-julia-buchhaltung.md` — Julia's narrative + 28 findings
- `docs/reviews/2026-05-19-deepdive-vereinsbuchhalter.md` — expert audit + 20 findings
- `docs/reviews/2026-05-19-deepdive-auslagen-findings.json` — 4 findings (markdown narrative not produced; agent ran out of context)
- `docs/reviews/2026-05-19-deepdive-ux-expert.md` — 7300 words + 46 findings + 47 screenshots
- `docs/reviews/2026-05-19-deepdive-ui-designer.md` — 8200 words + 45 findings + 37 screenshots
- `docs/reviews/2026-05-19-deepdive-pwa-mobile.md` — 2800 words + 28 findings + 48 device screenshots

## Ready for `/brainstorming`

The next step is the brainstorming session with Andy. This document is
the input. We'll cluster the findings into 3-6 buildable initiatives,
sequence them, and file the rest as labelled GitHub issues
(priority:p0/p1/p2/p3 × topic:ui/ux/process/data/pwa/accounting/dx).
