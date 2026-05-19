# Deep-dive UI Designer Review — folgederwolke-app

Date: 2026-05-19
Reviewer: senior UI designer (Linear / Cron / Things / Mercury Bank lens)
Scope: visual system + page-by-page review + concrete design proposals
Method: 37 screenshots across desktop 1440, tablet 820, mobile 375, public + admin routes; source-read of `src/app.css`, `src/lib/components/ui/*`, `src/lib/components/admin/*`, all six mail templates
Companion: `docs/reviews/2026-05-19-ux-design-review.md` (UX-flow review) — this review extends, never repeats
Screenshots: `docs/reviews/2026-05-19-deepdive-screens/ui-designer/`
Findings: `docs/reviews/2026-05-19-deepdive-ui-designer-findings.json`

This is a visual / aesthetic review. It does not re-litigate the UX-flow issues already in the May 19 UX review (500-pages-fixed, mail oklch, prose plugin, etc.). It treats those as solved and asks the next question: **once the basics work, does this look like a Cron / Linear / Mercury app, or does it look like a thoughtful Svelte MVP?**

The honest answer right now: a thoughtful MVP. The bones are right, but the system has drift, the brand color is louder than it needs to be on dense pages, the type scale is too flat, and a Munich art-Verein deserves more soul than the current "shadcn-zinc-with-rosa-paint" feel. There is a Mercury-tier app hiding in here behind ~25 specific changes.

---

## 1. TL;DR — top 10 visual changes ranked by sex-appeal-per-effort

These are the visual changes that, if shipped in a single afternoon, would move the app from "shadcn defaults with rosa paint" to "this feels like a product." Ordered by impact ÷ effort.

1. **Drop the type scale by one notch on dense pages.** Page H1 is currently `text-2xl font-bold` everywhere (Mitglieder, Dashboard, Jahresabschluss, Einstellungen). On data-dense list pages, demote H1 to `text-xl font-semibold tracking-tight` and use `font-bold` only on actual numeric values (KPIs, totals). The page becomes calmer immediately and the numbers — the things Julia actually came to look at — rise to the top. (effort: 15 min, find/replace `text-2xl font-bold` in 8 page-level files)
2. **Replace the magenta EÜR header (`#9c2870`) with calm neutrals.** Right now the Jahresabschluss EÜR table has a saturated rosa-purple header band that screams "I am a feature." It competes with the active sidebar item (also rosa) and the primary CTA. The table is the page — it should not need a colored header to assert that. Replace with a thin card top divider (`border-t-2 border-primary/20`) plus subtle `bg-muted/30` header row. The data does the talking. (effort: 10 min, one file)
3. **Pick one card radius and one card shadow, ban the rest.** Right now there are at least three card treatments in flight: `rounded-xl border shadow-sm` (KpiCard, ChecklistItem), `rounded-2xl border shadow-sm` (some sheet contents), `rounded-xl border-2 border-dashed` (empty states). Standardize on `rounded-xl border shadow-sm` everywhere except empty states (`border-dashed`) and modal/sheet (`rounded-2xl`). Document in `app.css` as `--card-radius` + `--card-shadow`. (effort: 30 min)
4. **Standardize input height to `h-9` and ban `h-8`.** The shadcn-svelte default `h-8` (32 px) is too compact for a finance app where Julia is squinting at IBANs and amounts. `h-9` (36 px) is the Linear / Mercury default. The sign-in form already uses something taller, so this also reduces inconsistency. Update `input.svelte`, `select.svelte`, and the `sm` button variant. (effort: 10 min)
5. **Express the brand in the corners, not the body.** The rosa currently shouts from: sidebar active item, primary buttons, breadcrumb final segment, member-detail accent strip, EÜR header, focus rings, KPI hover state, manual-import sheet save button, the FW logo bubble — nine places per screen. Cut to four:
   - Sidebar active item (1 place per screen)
   - Primary CTA button (1-2 places per screen)
   - The FW logo bubble (1 place per screen)
   - The member-detail accent strip (a delight moment)
   Demote everything else to `--foreground` or `--muted-foreground`. The breadcrumb "Mitglieder / **Felix Bauer**" doesn't need rosa on the leaf — `text-foreground font-semibold` is enough. (effort: 1 h, audit + class swaps)
6. **Use tabular-nums on every money column and right-align them.** Currently most money is `tabular-nums` in some places (EUR summary, InboxCard) but not all (KPI cards left-align the value, RecentActivity doesn't right-align money). Add a `<Money>` component that always renders `<span class="font-medium tabular-nums tracking-tight">`. (effort: 30 min plus one new component)
7. **Status badges: pick three colors, stop at three.** Currently year badges in Mitglieder use amber circles regardless of year-status, the WGBWidget badge cycles through emerald/yellow/orange/red, the "Festgeschrieben" indicator is green text, status chips on member detail are a quartet of pastels. Define a single status palette in `app.css` (success, warning, danger, info, neutral) — one colored pill style, one icon set — and convert everything. (effort: 45 min)
8. **Add a `text-xs uppercase tracking-wider text-muted-foreground` section eyebrow above every section title on long-form pages.** The Einstellungen page already does this ("KONTO", "VEREINSDATEN (NUR LESEND)") — extend the pattern to Jahresabschluss, Dashboard sections, Mitgliederliste filter sections. It gives the pages rhythm and Linear-style scanability. (effort: 30 min across files)
9. **Replace emoji icons in RecentActivity with Lucide.** Already flagged in the prior review but it is genuinely the single most jarring visual on the dashboard — Apple emoji on macOS, Google emoji on Android, blob-blue Twemoji on Windows-Firefox. (effort: 30 min — already a small component)
10. **Anchor every page heading block to the same vertical rhythm.** Right now Mitglieder uses `py-?`, Dashboard `py-8`, Jahresabschluss something else. Build a `<PageHeader>` component (title + subtitle + optional action slot + optional eyebrow slot) and convert all eight admin pages. The eye stops drifting between routes. (effort: 1 h)

If Andy ships only these ten in a single sitting, the app will feel ~40 % more designed without a single new feature.

---

## 2. Andy's three explicit gaps — full design proposals

### 2.1 EÜR page — calm, scannable, Kassenwart-friendly

The current EÜR header (`bg-[#9c2870]`) is a 1-color saturated band that overpowers the data. A Kassenwart wants to look at numbers, not branding. The EÜR is the most important number-dense page in the app; treat it like Mercury treats an account statement.

**Layout sketch (desktop, 1440):**

```
┌──────────────────────────────────────────────────────────────────┐
│  Start / Jahresabschluss / 2026                                  │  ← breadcrumb (Topbar)
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EINNAHMEN-ÜBERSCHUSS-RECHNUNG                                   │  ← eyebrow text-xs uppercase
│  Buchungsjahr 2026                          [2025 ▾]  [✓ Festg.] │  ← year switcher + status pill
│                                                                  │
│  ──────────────────────────────────────────────────────          │
│                                                                  │
│  ┌───────────────────────────┐  ┌───────────────────────────┐    │
│  │  Einnahmen                │  │  Ausgaben                 │    │
│  │  12.480,00 €              │  │  9.230,00 €               │    │
│  │  +18 % vs. 2025           │  │  -3 % vs. 2025            │    │
│  └───────────────────────────┘  └───────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Überschuss                                              │    │
│  │  3.250,00 €    ↑ 41 % vs. 2025                           │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ──────────────────────────────────────────────────────          │
│                                                                  │
│  AUFGLIEDERUNG NACH SPHÄRE                                       │  ← eyebrow
│                                                                  │
│  Sphäre                   Buchungen  Einnahmen  Ausgaben  Saldo  │  ← table header: small caps + muted
│  ────────────────────────────────────────────────────────────────│
│  Ideeller Bereich               24   3.480,00   2.110,00   1.370 │
│    steuerfrei                                                    │
│  Vermögensverwaltung             4     180,00       0,00     180 │
│    steuerfrei                                                    │
│  Zweckbetrieb                   38   7.520,00   5.890,00   1.630 │
│    steuerfrei (§ 65 AO)                                          │
│  Wirtschaftlicher Geschäftsb.   11   1.300,00   1.230,00      70 │
│    unterhalb Freigrenze 50.000 €                                 │
│  ────────────────────────────────────────────────────────────────│
│  Gesamt                         77  12.480,00   9.230,00   3.250 │  ← bold, slight bg-muted/20 strip
│                                                                  │
│  ──────────────────────────────────────────────────────          │
│                                                                  │
│  WGB-FREIGRENZE 2026                                             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  2,6 %     │    │
│  │  Brutto-Einnahmen WGB: 1.300 € · Freigrenze 50.000 €     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ──────────────────────────────────────────────────────          │
│                                                                  │
│  JAHRESABSCHLUSS-BUNDLE                                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  ZIP mit EÜR-PDF, Anlage-Gem, Spendenliste, Belege, ...  │    │
│  │  [↓ Bundle herunterladen]   [↘ GoBD-Z3 Export]           │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**Tailwind class skeleton (drop-in for `EurSummary.svelte`):**

```svelte
<!-- Replace the magenta header band with eyebrow + page header -->
<div class="mb-6">
  <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    Einnahmen-Überschuss-Rechnung
  </p>
  <div class="mt-1 flex items-baseline justify-between gap-4">
    <h1 class="text-xl font-semibold tracking-tight text-foreground">
      Buchungsjahr {eur.year}
    </h1>
    <div class="flex items-center gap-3">
      <YearSwitcher current={eur.year} />
      {#if closed}
        <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          <Check class="size-3" /> Festgeschrieben
        </span>
      {/if}
    </div>
  </div>
</div>

<!-- Sphere table — calm header, no colored band -->
<div class="rounded-xl border border-border bg-card">
  <table class="w-full text-sm">
    <thead>
      <tr class="border-b border-border">
        <th class="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sphäre</th>
        <th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buchungen</th>
        <th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Einnahmen</th>
        <th class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ausgaben</th>
        <th class="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Überschuss</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border/60">
      {#each SPHERES as sphere (sphere)}
        <tr class="hover:bg-muted/30">
          <td class="px-6 py-3.5">
            <div class="font-medium text-foreground">{SPHERE_LABELS[sphere]}</div>
            <div class="mt-0.5 text-xs text-muted-foreground">{SPHERE_TAX_NOTES[sphere]}</div>
          </td>
          <td class="px-4 py-3.5 text-right tabular-nums text-muted-foreground">{data.einnahmenCount + data.ausgabenCount}</td>
          <td class="px-4 py-3.5 text-right tabular-nums text-foreground">{formatEur(data.einnahmenCents)}</td>
          <td class="px-4 py-3.5 text-right tabular-nums text-foreground">{formatEur(data.ausgabenCents)}</td>
          <td class="px-6 py-3.5 text-right tabular-nums font-medium {data.ueberschussCents >= 0 ? 'text-foreground' : 'text-destructive'}">
            {formatEur(data.ueberschussCents)}
          </td>
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr class="border-t-2 border-border bg-muted/30">
        <td class="px-6 py-4 font-semibold text-foreground">Gesamt</td>
        <td class="px-4 py-4"></td>
        <td class="px-4 py-4 text-right tabular-nums font-semibold text-foreground">{formatEur(eur.totalEinnahmenCents)}</td>
        <td class="px-4 py-4 text-right tabular-nums font-semibold text-foreground">{formatEur(eur.totalAusgabenCents)}</td>
        <td class="px-6 py-4 text-right tabular-nums font-semibold {eur.totalUeberschussCents >= 0 ? 'text-foreground' : 'text-destructive'}">
          {formatEur(eur.totalUeberschussCents)}
        </td>
      </tr>
    </tfoot>
  </table>
</div>
```

Key principles:
- **No header band.** A colored band is a tabloid headline; this is a balance sheet. The data is enough.
- **Sphere row has a sub-line** with the tax classification. Right now that's buried in a footnote — but it's the most important thing a Steuerberater wants to see at a glance.
- **No green-on-positive / red-on-negative for surplus rows.** Use foreground for positive (the expected case), destructive for negative only. Avoid "everything is colored" Steuer-Excel aesthetic.
- **Tabular numerals everywhere.** Money columns must align.
- **No `tfoot` border in rosa.** Use `border-t-2 border-border` — let the typography weight do the work.

The above EÜR layout will pass a "would I look at this on a Sunday evening with a glass of wine" test.

### 2.2 Year switcher

Three patterns to choose from. Recommendation: **segment control on desktop, dropdown on mobile.**

**Desktop (segment, top-right of EÜR page header):**

```svelte
<!-- YearSwitcher.svelte -->
<nav class="inline-flex items-center rounded-lg border border-border bg-card p-0.5 text-sm shadow-xs">
  {#each years as y (y.year)}
    <a
      href="/app/jahresabschluss/{y.year}"
      class="relative rounded-md px-2.5 py-1 text-sm font-medium transition-colors
             {y.year === current
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}"
      aria-current={y.year === current ? 'page' : undefined}
    >
      {y.year}
      {#if y.closed}
        <span class="ml-1 inline-block size-1.5 rounded-full bg-emerald-500" aria-label="festgeschrieben"></span>
      {/if}
    </a>
  {/each}
</nav>
```

Renders as: `[ 2024 · ] [ 2025 · ] [ 2026 ]` where `·` = small green dot for closed years.

**Mobile (compact dropdown):** since horizontal space is tight, render as a `<select>`-styled button that opens a sheet.

```svelte
<button class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium">
  2026
  <ChevronDown class="size-4 text-muted-foreground" />
</button>
```

**URL strategy:** keep `/app/jahresabschluss/[year]` as the canonical URL. The switcher updates the URL. No query-string state. Server-side year switch means deep-linking works (CFO sends Steuerberater a link, year baked in).

**Placement:** top-right of the EÜR page header on desktop. On mobile, below the H1 in a `flex items-center gap-2` row with the status pill.

### 2.3 Income + expense dashboard cards

The current dashboard has 4 KPI cards in a row (Offene Auslagen, Zu erstatten, Beitrag fällig, Spenden YTD). They're functional but they're 4 identical cards — no hero, no narrative, no visual rhythm.

Proposal: **the dashboard hero strip becomes 2 large cards (Einnahmen / Ausgaben YTD with sparkline + LY delta) and 4 small KPI chips below.** Bigger numbers, more breathing room, story-of-the-year-so-far.

**Layout sketch (desktop 1440, dashboard hero):**

```
┌──────────────────────────────────────────────────────────────────────┐
│  GUTEN ABEND, JULIA  ☁️                                              │
│  Folge der Wolke e.V. · Kassenführung · Buchungsjahr 2026            │
│                                                                      │
│  ┌──────────────────────────────────┐ ┌─────────────────────────────┐│
│  │ EINNAHMEN YTD                    │ │ AUSGABEN YTD                ││
│  │                                  │ │                             ││
│  │ 12.480,00 €                      │ │  9.230,00 €                 ││
│  │ ▲ 18 % vs. 2025                  │ │ ▼ 3 % vs. 2025              ││
│  │                                  │ │                             ││
│  │ ───▁▂▃▅▆▇█▇▆▅▃▂▁───────          │ │ ───▃▄▂▃▅▄▃▄▆▅▄▃▂───         ││
│  │   Jan  Feb  Mär  ...  Mai        │ │   Jan  Feb  Mär  ...  Mai   ││
│  └──────────────────────────────────┘ └─────────────────────────────┘│
│                                                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                         │
│  │ 0      │ │ –      │ │ 0      │ │ 0,00 € │                         │
│  │ Offene │ │ Zu er- │ │ Beitr. │ │ Spend. │                         │
│  │ Ausl.  │ │ statt. │ │ fällig │ │ YTD    │                         │
│  └────────┘ └────────┘ └────────┘ └────────┘                         │
└──────────────────────────────────────────────────────────────────────┘
```

**Card skeleton (Tailwind):**

```svelte
<!-- IncomeExpenseHero.svelte -->
<div class="grid gap-4 sm:grid-cols-2">
  <a href="/app/transactions?type=einnahmen" class="group rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
    <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      Einnahmen YTD
    </p>
    <p class="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
      {formatEur(einnahmenCents)}
    </p>
    <div class="mt-2 flex items-center gap-2 text-sm">
      <span class="inline-flex items-center gap-0.5 font-medium {deltaPct >= 0 ? 'text-emerald-700' : 'text-destructive'}">
        {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)} %
      </span>
      <span class="text-muted-foreground">vs. {ly}</span>
    </div>
    <div class="mt-5 h-12">
      <Sparkline data={monthlyEinnahmen} stroke="currentColor" class="text-primary/40 group-hover:text-primary" />
    </div>
    <div class="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
      {#each monthLabels as m}
        <span>{m}</span>
      {/each}
    </div>
  </a>

  <a href="/app/transactions?type=ausgaben" class="group rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
    <!-- same shape, but ausgaben -->
    <!-- Sparkline color: text-slate-400 (not destructive — high spend isn't bad, it's just the other side) -->
  </a>
</div>

<!-- KPI chips below — smaller, secondary -->
<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
  {#each chips as chip}
    <a href={chip.href} class="rounded-lg border border-border bg-card px-4 py-3 shadow-xs transition-shadow hover:shadow-sm">
      <p class="text-lg font-semibold tabular-nums text-foreground">{chip.value}</p>
      <p class="mt-0.5 text-xs text-muted-foreground">{chip.label}</p>
    </a>
  {/each}
</div>
```

Key principles:
- **Hero is income/expense flow.** Everything else is secondary. A Kassenwart's primary question is "are we in surplus this year?" — answer that immediately.
- **Sparklines are foreground-neutral, not green/red.** Color-coding direction is for delta badges, not the curve.
- **Tabular numerals, font-semibold (not font-bold).** Linear / Mercury use `font-medium` to `font-semibold` for numbers, never `font-bold`. Bold reads as alarmed.
- **`text-3xl` for hero, `text-lg` for chips.** A two-tier hierarchy.
- **Sparkline implementation:** small inline SVG component, 12 monthly points, no library needed. ~30 lines of code.
- **Whole card is a link.** Click anywhere → go to filtered transactions.

For implementation: write a `Sparkline.svelte` (path generation from numeric array, viewbox `0 0 100 24`), then `IncomeExpenseHero.svelte` consumes it. Server adds `monthlyEinnahmenCents: number[12]`, `monthlyAusgabenCents: number[12]`, and prior-year totals to the dashboard load function.

---

## 3. The system audit

### 3.1 Type scale

**Current state (from screen reads + source):**

- H1 page heading: `text-2xl font-bold tracking-tight` (Mitglieder, Dashboard, Jahresabschluss, …)
- H2 section heading: `text-lg font-semibold` (ChecklistSection) — or `text-base font-semibold` (RecentActivity) — or `text-sm font-medium` (KpiCard label)
- Body: `text-sm` (most places) and `text-base` (form labels)
- Helper: `text-xs text-muted-foreground`

**The bug:** there's no consistent step. H1=24px, H2 alternates between 18 and 16, body alternates between 14 and 16. Without a clear modular scale the page reads "designed by accumulation."

**Proposal — fix the scale to a 6-step ratio:**

| Use | Class | Size | Weight | Tracking |
|----|----|----|----|----|
| Page title | `text-xl font-semibold` | 20 px | 600 | `tracking-tight` |
| Section title | `text-base font-semibold` | 16 px | 600 | normal |
| Section eyebrow | `text-xs font-semibold uppercase` | 12 px | 600 | `tracking-wider` |
| Body | `text-sm` | 14 px | 400 | normal |
| Caption / helper | `text-xs text-muted-foreground` | 12 px | 400 | normal |
| Hero number | `text-3xl font-semibold tabular-nums` | 30 px | 600 | `tracking-tight` |

Drop `font-bold` entirely from titles. Inter at 600 is plenty — `font-bold` (700) shouts. Mercury uses font-medium / font-semibold; Linear uses font-medium / font-semibold; Things uses font-regular / font-medium. Bold is for emergencies.

**Tracking:** Inter at small sizes (≤14 px) does NOT need `tracking-tight`. At 20 px+ headings, `tracking-tight` (-0.025em) adds polish. Currently the code mixes `tracking-tight` on body text in some places — remove.

### 3.2 Color system

**Current state:** `--primary: oklch(0.43 0.2 350)` ≈ `#BE185D` (Tailwind pink-700). Used for nav-active, primary CTA, focus ring, link, accent strips, and emoji-icon-circle backgrounds. The `--color-primary-50…900` ramp is defined but not used much.

**Missing tokens (visible in screens):**

- **No `--success` / `--warning` / `--info`.** WGBWidget direct-references `bg-emerald-500`, `bg-orange-500`, `bg-yellow-400`. The "Festgeschrieben" stamp uses `text-green-700`. Member-aktiv badge uses some other green. Dashboard greeting (when implemented) will need a friendly accent.
- **No `--brand-soft`.** The rosa works at full saturation for CTAs but not as a tonal accent. The member-detail header gradient uses some hand-picked pink. Define `--brand-soft: oklch(0.95 0.04 350)` for tinted backgrounds.

**Proposal — add to `app.css`:**

```css
@theme {
  /* Status tokens — used semantically, not decoratively */
  --color-success: oklch(0.55 0.13 160);      /* ≈ emerald-600 */
  --color-success-foreground: oklch(0.99 0 0);
  --color-success-soft: oklch(0.96 0.04 160); /* ≈ emerald-50 */

  --color-warning: oklch(0.7 0.16 70);        /* ≈ amber-500 */
  --color-warning-foreground: oklch(0.99 0 0);
  --color-warning-soft: oklch(0.97 0.06 80);  /* ≈ amber-50 */

  --color-danger: oklch(0.6 0.21 25);         /* ≈ red-600 */
  --color-danger-foreground: oklch(0.99 0 0);
  --color-danger-soft: oklch(0.97 0.04 20);   /* ≈ red-50 */

  --color-info: oklch(0.55 0.13 240);         /* ≈ sky-600 */
  --color-info-foreground: oklch(0.99 0 0);
  --color-info-soft: oklch(0.96 0.04 240);    /* ≈ sky-50 */

  /* Brand soft — for tinted surfaces, not text */
  --color-brand-soft: oklch(0.95 0.04 350);   /* very pale rosa */
}
```

Then every status badge gets one of: `bg-success-soft text-success`, `bg-warning-soft text-warning-foreground`, etc. The WGBWidget switches off direct `bg-emerald-500` references.

**Where to remove rosa noise** (from the audit):
- Breadcrumb leaf: `text-foreground font-semibold`, not rosa
- Sheet-resync "durchsuchen" link: standard `text-primary underline` (smaller dose)
- Manual-import sheet's selected radio: thicker border, not full rosa fill
- Datenschutz long-form: Tailwind prose `prose-a:text-primary` is fine but only for links, not headings

### 3.3 Spacing rhythm

**Current state:** `px-4 py-8 lg:px-8` on dashboard, `px-4 py-8 lg:px-8` on jahresabschluss, `px-6 py-?` on settings, no clear standard. Card internal padding: `p-5` (KpiCard, WGBWidget, ChecklistItem) or `p-6` (some sheet content) or `px-6 py-4` (jahresabschluss year list).

**Proposal — 4-pt baseline grid, document in `app.css`:**

| Token | Value | Use |
|----|----|----|
| `gap-2` | 8 | tight inline gaps (badge + icon) |
| `gap-3` | 12 | card grid gaps |
| `gap-4` | 16 | major card-section gaps |
| `gap-6` | 24 | between page sections |
| `gap-8` | 32 | between major page sections |
| `p-5` | 20 | card padding (KPI, dashboard widgets) |
| `p-6` | 24 | larger card padding (Einstellungen, EÜR table) |
| Page wrapper | `px-4 py-6 sm:px-6 lg:px-8 lg:py-8` | every admin page |
| Page max-width | `max-w-4xl mx-auto` (read-heavy) / `max-w-6xl` (list-heavy) | |

The dashboard already uses `max-w-4xl` — keep that. Mitglieder and Transaktionen probably want `max-w-6xl` to give tables room.

### 3.4 Component library

| Component | State | Verdict |
|----|----|----|
| Button | 6 variants (default / outline / secondary / ghost / destructive / link) + 7 sizes. Solid. | Keep. Standardize `sm` (h-7) → `default` (h-8) → `lg` (h-9). The current `h-8` default is too compact — see input section. |
| Input | One height (h-8), one variant. | **Bump to h-9 as default.** Add `error` data-attr-driven state already in the class string. |
| Card | Open-coded everywhere with `rounded-xl border bg-card p-5 shadow-sm`. | **Introduce `<Card>` and `<CardHeader>` / `<CardBody>` / `<CardFooter>` components.** Right now every page hand-rolls the card. Wrap shadcn-svelte's Card if missing, or create your own — single source of truth for card radius/border/shadow. |
| Badge | 6 variants, `h-5 rounded-4xl`. Solid. | Add `success` / `warning` / `info` variants — currently MemberRow uses pastels hand-rolled. |
| Sheet | Used on manual-import. Renders cleanly. | Keep — radius could be `rounded-l-2xl` (instead of inheriting page radius) for delight. |
| Table | Hand-rolled per page. | **Introduce a thin Table component pattern** — `<DataTable>` with sticky header on scroll, alternating row backgrounds optional, action-column right-aligned, empty state slot. The Mitglieder list is row-based-cards (not table) — keep that. The EÜR table needs the formal treatment. |

### 3.5 Cards

**Bug:** there's no `<Card>` component. Every page rolls its own with `rounded-xl border bg-card p-5 shadow-sm` — and sometimes `rounded-2xl`, sometimes `shadow-md`, sometimes `border-2 border-dashed`.

**Fix:** create `src/lib/components/ui/card/card.svelte` (might already exist via shadcn-svelte — verify in `components.json`) with:

```svelte
<div class={cn(
  "rounded-xl border border-border bg-card shadow-sm",
  variant === 'soft' && "border-transparent bg-muted/40 shadow-none",
  variant === 'dashed' && "border-dashed",
  className
)}>
  {@render children?.()}
</div>
```

### 3.6 Tables

The Mitglieder page uses a list-of-rows pattern (custom rows, not a `<table>`). Works for mobile. The EÜR uses a proper table. Both are valid; the issue is they look different.

**Recommendation:**
- **List-of-rows pattern** (Mitglieder, Inbox, Transaktionen): rounded card rows, hover-lifts shadow, avatar/icon + primary text + meta + actions right-aligned. Keep as-is.
- **Tabular data** (EÜR, Jahresabschluss bundle table): formal table with `<thead>` muted, `<tbody>` divide-y, hover-row, right-aligned numerics, footer bold. See proposal in section 2.1.

**Row height:** target 48-52 px on lists, 44-48 px on tables. Current Mitglieder rows are taller (~74 px from screenshots) — fine for a small Verein, but cap density when membership grows beyond 30.

**Sticky behavior:** for >20 rows on tables, add `sticky top-0 z-10 bg-card border-b border-border` on `<thead>`. Not urgent today (lists are short) but document the pattern.

### 3.7 Forms

**Current state:** inputs are `h-8`, labels above (good), helper text below the input, error text replaces helper. Form field stacks vertical.

**Issues:**
- Input height (`h-8` / 32 px) is too small. Bump to `h-9` (36 px).
- Label-to-input gap is `mt-1` in some places, `mt-1.5` in others. Standardize to `mb-1.5`.
- Helper text uses the same `text-xs text-muted-foreground` color as labels. Add a distinct `text-[11px] text-muted-foreground/80` or just `text-xs leading-snug` for helpers to visually separate from labels.
- Submit-button alignment: the public form (AuslagenForm) has a sticky-CTA pattern; the admin sheets have inline buttons; the sign-in has a full-width button. Pick one rule: **on narrow forms (≤ 480 px) full-width primary CTA, on wider forms left-aligned default-width.**

### 3.8 Buttons

The 6 variants are good. Two consistency issues from screenshot review:

1. **Default `size` is `h-8` — feels small next to `h-11` Anmelden button.** Use `lg` for top-of-page primary CTAs ("Mitglied hinzufügen", "Neue Rechnung", "Neue Transaktion") and the sign-in CTA. Use `default` for inline form buttons.
2. **`destructive` is rendered as red text on red-soft background.** That works for "abmelden" (Einstellungen "Überall abmelden" looks fine). But there's no "DELETE THIS BUTTON" version. Add a `destructive-solid` variant for genuinely destructive actions (delete project, festschreiben year) — `bg-destructive text-destructive-foreground`. Keep `destructive` (soft) for less-final actions.

### 3.9 Badges / pills / status chips

**Inventory across the app (from screenshots):**

- Year badges in Mitglieder (`2024 / 2025 / 2026`) — pastel amber circles + outline pill
- Member status pills on detail page (`aktiv / Mitglied / Fixture`) — green, gray, amber pastels
- WGBWidget status (`Im grünen Bereich`) — emerald soft pill
- "Festgeschrieben" — green text only, no pill
- Search popover entity badges (probably exist) — unconfirmed
- Sheet-resync success banner ("Service-Account verfügbar") — green-50 banner

**Bug:** four different green tones in play. Three different rounded styles (full pill, half-rounded, no border).

**Proposal — define one badge family in `app.css` and convert:**

```css
/* Add to app.css */
.badge-success { @apply inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700; }
.badge-warning { @apply inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800; }
.badge-info    { @apply inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700; }
.badge-danger  { @apply inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700; }
.badge-muted   { @apply inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground; }
```

Map current statuses:
- Auslage: `eingereicht` → muted, `genehmigt` → success, `abgelehnt` → danger, `erstattet` → success
- Beitrag: `bezahlt` → success, `offen` → warning, `mahnung` → danger
- Year: `offen` → muted, `festgeschrieben` → success
- Member: `aktiv` → success, `inaktiv` → muted, `austritt` → danger

**Iconography:** optional. If you add icons, keep them to 1 set (CheckCircle, AlertTriangle, X, Clock). Lucide already imported.

### 3.10 Icons

Lucide is in use in Sidebar (paths hand-copied — not the React component). The pattern works. Two outliers:

- **RecentActivity uses native emoji** (💸📥🎁👤🧾📈🔑📁🏢⚙️) — already flagged. Convert to Lucide path strings. Build `src/lib/components/icons/EntityIcon.svelte` that maps `entityKind → svg path`.
- **Welcome / NoEntries / SearchNoResults** empty states use ad-hoc SVGs. Consolidate into one `EmptyState.svelte` component with `icon` prop = Lucide name.

Icon sizing convention: `size-4` (16 px) inside buttons, `size-5` (20 px) for standalone icons, `size-6` (24 px) for empty-state hero icons. The current sidebar uses 18 px — fine, but document.

### 3.11 Empty states

**Current state:** there are three empty-state patterns:
1. `Welcome.svelte` (cloud + welcome message)
2. `NoEntries.svelte` ("Keine Einträge gefunden")
3. `SearchNoResults.svelte`
4. Hand-rolled inline empty in Mitglieder/Inbox ("Alles geprüft", "Lege die erste Rechnung an")

Bug: the audit-inbox "Alles geprüft" is friendly and lovable (the rosa-soft circle with checkmark) but it's an inline-only treatment, not reusable.

**Proposal — single `<EmptyState>` component:**

```svelte
<!-- EmptyState.svelte -->
<div class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
  <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
    <Icon class="size-6" />
  </div>
  <h3 class="mt-4 text-base font-semibold text-foreground">{title}</h3>
  <p class="mt-1 text-sm text-muted-foreground">{description}</p>
  {#if children}
    <div class="mt-5">{@render children()}</div>
  {/if}
</div>
```

Then per-page consumers:

- `<EmptyState icon={Check} title="Alles geprüft" description="Keine offenen Einreichungen — neue Auslagen erscheinen hier sofort." />`
- `<EmptyState icon={FileText} title="Noch keine Rechnungen" description="Lege die erste Rechnung mit dem Button oben an." />`
- `<EmptyState icon={Folder} title="Keine Projekte" description="Projekte sind Events und Konzerte, denen du Einnahmen + Ausgaben zuordnen kannst."><Button href="/app/projekte/neu">Projekt anlegen</Button></EmptyState>`

The slight delight: rotate icons based on context (Inbox empty = ✓, Rechnungen empty = receipt, Projekte empty = folder, Mitglieder empty = users).

### 3.12 Hero / landing surfaces

Three "first impression" surfaces:

1. **`/` landing** (per prior UX review: should not redirect, render a small landing). Visual treatment: rosa logo bubble centered, "Folge der Wolke e.V." H1, one-line tagline ("Kassenführung für unseren Münchner Kunstverein"), two prominent buttons ("Auslage einreichen" primary, "Vorstand anmelden" outline), Impressum/Datenschutz footer links.
2. **`/sign-in`** (currently a brand vacuum). Add the same FW bubble + Verein name at top of card, anchor card to upper-third of viewport, soft rosa background tint (`bg-brand-soft`) on the body.
3. **Dashboard `Guten Tag/Abend, Julia 👋`** — already friendly. The 👋 emoji is the only emoji we should keep (it's expected, it's contextual, it's not a status indicator).

### 3.13 Mail templates — re-skin proposal

The MagicLink is the gold standard. Apply that template structure to all six mails. Key visual moves:

1. **Single thin rosa brand strip at top** (18-24 px tall), full-bleed, white "FOLGE DER WOLKE" uppercase tracking-wider 13 px. No gradient, no logo image, no playful subtitle ("Liebesbrief von den Finanz-Geschäftler:innen" is too cute — keep that line in the body, not the header).
2. **Card body: white, 32 px padding, 16 px border-radius, 1px border `#f1e6ec`.**
3. **One H1 (22 px, weight 700, color `#111827`)** above all else.
4. **Body text at 15 px line-height 1.55**, color `#374151`.
5. **CTA button: pill, `background:#be185d`, padding 14px 32px, border-radius 10px, font-weight 600, color white.** Single solid color, no gradient.
6. **Detail card (the AUS-ID / Bezeichnung / Betrag block in Eingangsmail):** `background:#fdf2f8` (pink-50), 12 px border-radius, padded 16 px. Replace the table layout with a 2-column dl pattern in HTML emails (works in Outlook/Gmail). Currently the table is fine — keep.
7. **Footer: 24 px top padding, 1 px border-top `#f1e6ec`, centered 11 px gray text, Verein name + address + VR. Inject from env vars (single source of truth).**
8. **Tone branch on `bezahlt_von_kind`:** members get "Liebste:r {vorname}" + closing "Mit Wolkenpost · deine Finanz-Gschaftler:innen 💋". Externals get "Hallo {vorname}," + closing "Mit freundlichen Grüßen · Folge der Wolke e.V.".

**Specific files to update (apply MagicLink pattern):**

| Template | Subject | Tone | Main visual change |
|----|----|----|----|
| MagicLink | "Dein Anmelde-Link" | Already done. | — |
| EingangsMail | "Wir haben deine Auslage erhalten" | Members: warm. Externals: neutral. | Replace gradient header with flat brand strip. Move "Liebesbrief" line to body, not header. |
| ErstattungsMail | "Deine Auslage ist erstattet" | Members: warm + 🎉. Externals: factual. | Same. Add an emerald-50 "ERSTATTET" pill near the AUS-ID. |
| RejectionMail | "Zu deiner Auslage" | Always gentle. | Same. Use `#fef3c7` (amber-50) detail-card bg instead of pink-50 — softens. |
| BeitragsReminder | "Dein Vereinsbeitrag {jahr}" | Always cozy. | Same. Show the IBAN + Betrag + Verwendungszweck in a copy-friendly monospace block (`font-family:monospace;background:#f9fafb`). |
| InvoiceVersendetMail | "Rechnung {invoice-id}" | Always professional. | Same. This is the most "B2B" email — keep the playful sign-off softer ("Mit Wolkenpost" + Verein team, no 💋). |
| AufwandsspendenBestaetigung | "Deine Aufwandsspendenbescheinigung" | Formal, gratitude. | Same. Add a small "DANKE!" eyebrow + heart emoji ONCE in the body. Steuer-relevant; tone is "we appreciate you, here's the receipt." |

**One global change:** put the unsubscribe / Impressum links in the footer of every mail — German law expectation for transactional mail.

### 3.14 Mobile UI at 375×800

Reviewing the mobile screenshots:

- **Dashboard mobile**: the KPI grid drops to 2×2 (good), the "Was möchtest du heute tun?" heading wraps over 2 lines and the subtitle pushes right — already flagged. Fix: stack subtitle below on mobile.
- **Mitglieder mobile**: rows render without the year badges (overflow hidden). The "Köhler, Lara" row name is rendered in rosa — possibly current-user marker? If so, treat consistently (badge it). If not, bug.
- **Audit Inbox mobile**: empty state renders well — the rosa-soft circle with checkmark is the single most lovable empty state in the app. Use it as the template.
- **Bottom tab bar**: 4 nav items + 1 "Neu" FAB in rosa (currently disabled per prior review). When enabled, the FAB should open a bottom sheet ("Neue Auslage / Neue Rechnung / Neue Transaktion") — Linear / Things pattern.
- **Topbar mobile**: the disabled bell + search icon are still rendered. **Remove until they work.** A finance app where 2 of 4 topbar elements do nothing is a "demo" feel.

### 3.15 Dark mode

Currently `:root { color-scheme: light only; }` and `.dark { ... }` defined but never activated. The light tokens dominate.

**Proposal:** ship a `prefers-color-scheme: dark` opt-in for system-following. No toggle UI required. The dark variables already exist; just remove `color-scheme: light only` and let `<html class:dark={prefersDark}>` flip.

```css
:root { color-scheme: light dark; }
```

```svelte
<!-- in +layout.svelte head -->
<script>
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  }
</script>
```

Dark-mode-specific concern: the rosa `#BE185D` is dark already and works on dark backgrounds. Verify the WGBWidget direct-color references (`bg-emerald-500`, `bg-orange-500`) read well on `bg-card` in dark — they probably need `dark:bg-emerald-600` for contrast.

Don't ship dark mode behind a settings toggle; the cost of a "Light / System / Dark" select is more than the system-preference auto-switch. Andy's audience is small enough that they trust the OS to decide.

### 3.16 PWA installation surface

Manifest exists (`/manifest.webmanifest`). There's an `InstallPrompt.svelte` referenced in Topbar but unclear whether it actually shows. **Add a visible "App installieren" action in the user menu** (UserMenu.svelte) — when `beforeinstallprompt` event fires, show the menu item; otherwise hide. One-click install matters when Julia is at a concert and just opened the link from a Slack message.

Visual treatment:

```svelte
<DropdownMenuItem onclick={triggerInstallPrompt}>
  <DownloadCloud class="size-4" />
  Als App installieren
</DropdownMenuItem>
```

### 3.17 Loading states / skeleton screens

Each list page currently shows nothing during load (or maybe a flash of empty state — depends on SSR). **Propose a per-list-page skeleton:**

```svelte
<!-- Skeleton for list pages -->
{#if loading}
  <div class="space-y-3">
    {#each Array(5) as _, i}
      <div class="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        <div class="size-10 animate-pulse rounded-full bg-muted"></div>
        <div class="flex-1 space-y-2">
          <div class="h-4 w-1/3 animate-pulse rounded bg-muted"></div>
          <div class="h-3 w-1/2 animate-pulse rounded bg-muted/60"></div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <!-- actual list -->
{/if}
```

For the dashboard hero income/expense cards: skeleton the number + sparkline area, keep the labels. For tables: 8 skeleton rows.

Skeletons should use `bg-muted` (not `bg-gray-200`). Animation already defined in `app.css`. Build `<ListSkeleton count={5} />` and `<CardSkeleton variant="kpi|hero" />`.

### 3.18 Toast / notification design

Sonner is imported. Default sonner styling is fine but doesn't match brand. Override in `app.css`:

```css
:root {
  --normal-bg: var(--color-card);
  --normal-text: var(--color-foreground);
  --normal-border: var(--color-border);
  --success-bg: var(--color-success-soft);
  --success-text: var(--color-success);
  --error-bg: var(--color-danger-soft);
  --error-text: var(--color-danger);
}
```

Or use `<Toaster richColors expand toastOptions={{ duration: 4000 }} />`.

Visual: rounded-xl, shadow-lg, max-w-md, position `bottom-right` on desktop, `top-center` on mobile (per iOS convention).

### 3.19 Visual hierarchy on dense pages

**Dashboard:** the eye currently lands on "Guten Abend, juliaschwarz97 👋" — good. Second stop: the KPI grid. Third: the checklist. Fourth: the WGB widget. The order is right.

**Mitglieder:** the eye lands on "Mitglieder" H1 + the "Mitglied hinzufügen" CTA, then drops to the list. The pastel-circle avatars compete with the rosa CTA — fix by softening avatar saturation (`bg-{color}-200 text-{color}-700` instead of `-100/-800`).

**Jahresabschluss:** in the year-list page, the cards are too quiet. The "Buchungsjahr 2026 / Offen" card doesn't telegraph that it's the active year. Make the active year card slightly larger or have a left rosa accent strip.

### 3.20 Brand expression

A €25k/year Munich Kunstverein deserves:
- **The right amount of personality**: the 👋 emoji on greeting. The "Liebste:r" in member mails. The "Alles geprüft" inbox-empty state.
- **Calm data on every other surface**. Mercury Bank doesn't put emoji on the balance sheet. Neither should the EÜR table.

**Where rosa belongs:**
- Primary CTA buttons (1-2 per screen)
- Active nav item (1 per screen)
- FW logo bubble (1 per screen)
- Member-detail header strip (a delight moment, kept)
- Inbox empty-state checkmark circle (the most lovable surface)
- Mail brand strip
- Focus rings

**Where rosa does NOT belong:**
- EÜR header band (replace with neutral)
- Breadcrumb leaf (use foreground)
- KPI hover value color (currently `group-hover:text-primary` — feels gimmicky; the hover state is the slight shadow lift, that's enough)
- The "Inbox öffnen →" CTA in checklist items when empty (currently rosa on rosa-soft — see how it gets opacity-50'd; the rosa stacks. Use `secondary` variant instead.)
- The "Vorschau prüfen" disabled button on Sheet-Resync (currently rosa with `opacity-?` — switch to `secondary` variant or actually disable to `opacity-50 cursor-not-allowed`)

**Cool neutrals for data-dense pages:** the data on the EÜR / Transaktionen / Jahresabschluss pages should sit on `bg-background` / `bg-card` (already neutral). Avoid rosa on these surfaces entirely except the breadcrumb (and even that should be muted).

---

## 4. Page-by-page visual notes

### 4.1 `/` landing

Screen: `desktop-00-landing-or-redirect.png` — currently redirects to /sign-in
- **Bug:** there is no landing page. Per UX review HIGH-8, stop redirecting `/` unconditionally.
- **Visual proposal:** see section 3.12.

### 4.2 `/sign-in`

Screen: `desktop-01-signin.png`, `mobile-01-signin.png`
- Card has no logo, no Verein name, "Anmelden" floats mid-viewport.
- The "Anmelde-Link anfordern" button is full-width but `h-11` (too tall vs the `h-8` inputs in the rest of the app). Inconsistent.
- The input height (h-10 ish) is too tall for desktop; bumping the global input to h-9 normalizes this.
- **Fix:** add FW bubble + Verein name. Anchor `pt-20` instead of `min-h-screen items-center`. Soft brand-tint background (`bg-brand-soft/40`). On mobile, hero the FW bubble.

### 4.3 `/auslage-einreichen`

Screen: `desktop-02-public-form.png` (currently 404 in our env, but the form exists in code)
- The AuslagenForm is genuinely thoughtful (per prior review). The sticky CTA bar visual treatment is a touch heavy — add `shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.1)]` so the bar feels floating not bolted.
- **Visual delight to add:** when the form is empty, show a one-line greeting at top ("Schön dass du eine Auslage einreichst. Es geht schnell.") — humanizes the form.

### 4.4 `/app` dashboard

Screen: `desktop-10-dashboard.png`, `mobile-10-dashboard.png`
- KPIs are functional but flat (4 identical cards). See section 2.3 proposal.
- "Was möchtest du heute tun? Deine offenen Aufgaben" — the subtitle is on the same baseline as the H2. On mobile it wraps awkwardly. Stack subtitle below.
- ChecklistItem when empty (count=0) is `opacity-50` — but the CTA inside is still rosa, just lighter. The pattern reads as "ghost-buttons that I can't tell are clickable." Either hide the CTA when empty, or use `secondary` variant.
- WGBWidget: the 2.5px progress bar with `bg-emerald-500` reads as Material Design. The progress track is barely-different from the page background. Bump the track to `bg-muted` (already), the bar to `bg-success` (token), and the bar height to 6 px.

### 4.5 `/app/inbox`

Screen: `desktop-11-inbox.png`, `mobile-11-inbox.png`
- The "Alles geprüft" empty state is genuinely delightful. Lift this pattern into a reusable `<EmptyState>` (see 3.11).
- The "Manuell hinzufügen" button competes with the H1 — already flagged (MED-18 in UX review). Solution: move to a `<DropdownMenu>` triggered by a kebab next to the H1, OR make it `ghost` variant.

### 4.6 `/app/transactions`

Screen: `desktop-12-transactions.png`
- The 3-tab pill ("Diesen Monat / Offene Erstattungen / Spenden YTD") and the 4-tab segment ("Alle / Ausgaben / Einnahmen / Spenden") create two competing nav patterns above the table. Hierarchically: the 4-tab segment is primary (filter by kind), the 3-pill is secondary (saved views).
- **Fix:** demote the 3 pill chips visually — smaller, more muted (text-xs gray pills), maybe under an "Ansicht:" label. Promote the 4-tab segment to look like a real tab control (border-bottom on active).
- The empty-state icon (document) is small and floats in a large dashed card — use the `<EmptyState>` pattern.

### 4.7 `/app/mitglieder`

Screen: `desktop-13-mitglieder.png`, `tablet-13-mitglieder.png`, `mobile-13-mitglieder.png`
- Rows are good. Year badges (`2024 / 2025 / 2026`) at the right of each row are visually busy — small filled circles + year as a pill = 3 pills in a row per member.
- **Fix:** replace year badges with a single multi-segment payment-status indicator: `■ ■ □` (3 small squares, filled=paid, empty=unpaid, by year). Hover/tap reveals a tooltip ("2024 bezahlt, 2025 bezahlt, 2026 offen"). Same data, 1/3 visual noise.
- Or: keep the badges but unify them visually — same shape, single accent color (success when paid, muted when not). Right now they're all amber.
- The mobile renders without year badges (probably overflow) — the user loses the at-a-glance status. Move the indicator to the row's secondary line on mobile: `felix.bauer@example.org · 2 von 3 Jahren bezahlt`.

### 4.8 `/app/rechnungen` & `/app/projekte` & `/app/kunden`

Screens: `desktop-14-rechnungen.png`, `desktop-15-projekte.png`, `desktop-16-kunden.png`
- All three follow the same list-or-empty pattern. The empty states differ ("Noch keine Rechnungen / Lege die erste Rechnung mit dem Button oben an" / etc.). Standardize via `<EmptyState>`.
- Projekte row design is good — folder icon + project name + ID + sphere label. Could use a status pill for sphere (e.g., `wirtschaftlich` → small warning-soft pill, `zweckbetrieb` → success-soft pill) since sphere is the most legally-relevant attribute.

### 4.9 `/app/jahresabschluss` & `/app/jahresabschluss/2026`

Screens: `desktop-17-jahresabschluss.png`, `desktop-18-jahresabschluss-year.png`
- See section 2.1 for full redesign.
- The "Buchungsjahr 2026" year-list-card is OK but very quiet — too quiet given that it's the entry point to the most important admin surface. Bump prominence: thicker border on active year, primary CTA "EÜR öffnen" inline.

### 4.10 `/app/einstellungen`

Screen: `desktop-19-einstellungen.png`
- This page does the eyebrow + section pattern correctly already (`KONTO`, `VEREINSDATEN (NUR LESEND)`, `KONFIGURATION (NUR LESEND)`). It is the clearest page in the app visually.
- Use it as the template for redesigning other dense pages (EÜR especially).
- "Überall abmelden" destructive button uses the soft-destructive variant — fine.
- The "Vereinsdaten" key-value table renders as `<table>`. The styling is OK but the right-column values lack `tabular-nums` for the Steuernummer. Add it.

### 4.11 `/app/dsgvo`

Screen: `desktop-20-dsgvo.png` — didn't render visibly because it's a long-form page. Source-read shows a `prose` layout. If the `@tailwindcss/typography` plugin is installed (per recent UX-review fix), it should look fine.

### 4.12 `/app/sheet-resync`

Screen: `desktop-21-sheet-resync.png`
- The dashed-border drop zone is good but the "durchsuchen" link in rosa is over-emphasized. Use `text-foreground underline` or `text-primary` only on hover.
- The "Vorschau prüfen" button is disabled but renders in rosa with no opacity. Add `opacity-50 cursor-not-allowed` when no file is selected.
- Idempotenz-Schlüssel input field uses `h-?` (looks taller than admin inputs). Standardize to `h-9`.

### 4.13 Auslage status `/auslage-status/[ausId]`

Not screenshotted (404 in our env) but per UX review the timeline visual treatment for the abgelehnt branch needs work (MED-21). The branch from green→red is misleading.
- **Fix:** when status is abgelehnt, render the rejection step inline (in the timeline column) with destructive variant, NOT below the line. Linear-style branching timeline pattern.

### 4.14 Error / 404 page

Screen: `desktop-24-404.png`, `desktop-22-status-404.png`
- The 404 design is genuinely nice — rosa accent circle, big "404", clear CTAs. Keep.
- The 400 error page (`desktop-23-verify-no-token.png`) reuses the same template but the description shows the raw error code `TOKEN_MISSING`. UX review HIGH-7 already covers this.

---

## 5. Mail-template re-skin proposal — all 6 templates

Covered in section 3.13 with per-template table. Summary of moves:

- **Single brand color (`#be185d`)** everywhere, no gradients
- **One header strip pattern** (uppercase eyebrow, 13 px, white text on rosa)
- **Body cards** in `#fdf2f8` (member tone) or `#fef3c7` (rejection tone) or `#f9fafb` (formal — invoice)
- **CTA buttons** as solid pills, never gradients
- **Tone branch** by `bezahlt_von_kind`
- **Footer** from env vars (single source of truth for Verein name/address/VR)
- **Hardcoded German subject lines** — no English fallbacks anywhere

Apply the MagicLink template as the source-of-truth pattern.

---

## 6. Mobile + PWA proposal

### 6.1 Mobile shell

- Topbar: drop the disabled search icon + disabled bell. The remaining 3 elements (FW name, user avatar — keep) become 1 element. **Replace the topbar entirely with a slim sticky header**: just the logo + name on the left, avatar dropdown on the right. 48 px tall. Skip the gimmicks.
- Bottom tab bar: keep 4 nav items, ship the "Neu" FAB action (currently disabled). The FAB opens a bottom sheet with "Neue Auslage / Neue Transaktion / Neue Rechnung" — 3 actions, not 30.
- Pull-to-refresh: native iOS already supports it on SvelteKit pages. Add `overscroll-behavior-y: contain` to keep this working without weirdness.

### 6.2 Touch targets

All interactive elements should be `≥ 44 px` tall on mobile. The current `h-8` (32 px) buttons are 12 px below iOS HIG. The `<Button size="lg">` (h-9 = 36 px) is closer but still tight. **Add a `size="touch"` variant (`h-11 = 44 px`) and use it on all mobile-first CTAs (the sign-in button, FAB, "Auslage einreichen" submit, manual-import "Speichern").**

### 6.3 PWA install affordance

- Detect `beforeinstallprompt` in layout; if fired, show a "Als App installieren" item in the user menu (3.16).
- iOS doesn't support `beforeinstallprompt` — for iOS Safari, add a one-time bottom-card hint after 3rd session: "Tipp dich auf das Teilen-Symbol → Zum Home-Bildschirm hinzufügen". Tiny illustration of the share icon. Dismissible.
- Theme color in manifest should match `--color-primary` (`#BE185D`) — verify the manifest's `theme_color`.

### 6.4 Mobile-specific polish

- The mobile `Letzte Aktivitäten` (Recent Activity) feed wraps timestamps awkwardly. Drop relative time on mobile ("vor 3 h") and indent it on its own line under the action label.
- The KPI grid on mobile becomes 2×2 — currently each card has lots of whitespace. Could compress: smaller card padding `p-3` instead of `p-5`, but the value text size stays `text-2xl`. Density wins on mobile.

---

## 7. The "what makes this lovable" anti-checklist — what NOT to do

A list of things I see in many small-team apps that you must NOT add to folgederwolke:

1. **No Material Design copy.** No FABs with rotation animations, no ripple effects on click, no MD elevation-shadows. The app is shadcn/Tailwind — keep it that way.
2. **No gradient hero.** No `bg-gradient-to-r from-pink-500 via-fuchsia-500 to-rose-500`. The brand is one color. Use it confidently in single doses.
3. **No glassmorphism.** No `backdrop-blur-2xl bg-white/30` panels. They're 2021. Use `bg-card border shadow-sm`.
4. **No emoji as iconography.** Decorative emoji in body text (👋, 💌) is fine and friendly. Emoji as status indicators (💸📥🎁) is not.
5. **No three-letter category icons in colored squares.** This is a finance-software cliché. Use Lucide.
6. **No "AI sparkle" icons.** No `<Sparkles />` next to "smart" features. This is a deutsche Kunstverein — not OpenAI's marketing site.
7. **No "Pro" / "Premium" / paywall framing.** There is no paid tier.
8. **No notification bell with a permanent red dot.** Currently the bell is disabled; when implemented, only show the dot when there is something new. Permanent red dots train users to ignore them.
9. **No 8 different shades of gray.** Tailwind's `gray-50 / 100 / 200 / 300 / 400 / 500 / 600 / 700 / 800 / 900` is 10 shades. Use 3: `--background / --card`, `--muted`, `--foreground / --muted-foreground`. Done.
10. **No bouncy spring animations on data.** A KPI value shouldn't pulse when it updates. Use the existing `transition-base` (150 ms ease) for everything.
11. **No "skeleton screens that show forever".** Skeleton for ≤500 ms; if data still isn't there, show empty state.
12. **No dark-mode toggle in the UI.** Use `prefers-color-scheme`. One less setting.
13. **No tooltips on every UI element.** Tooltips only on icon-only buttons (mandatory for a11y) or when a label is genuinely truncated. Not on labels that are visible.
14. **No "Tour" / "What's new" modal on first login.** The audit-inbox empty state, dashboard checklist, and KPI hover are enough onboarding.
15. **No carousel.** Anywhere. Ever.

---

## 8. Style-tokens cheat sheet

Paste into `src/app.css` after the existing tokens. These tokens encode the system decisions above.

```css
@theme {
  /* ── Radius ──────────────────────────────────────────── */
  --radius: 0.625rem;        /* 10px — keep */
  --radius-card: 0.75rem;    /* 12px — cards */
  --radius-sheet: 1rem;      /* 16px — sheets, modals */
  --radius-pill: 9999px;     /* badges, status chips */

  /* ── Shadow ──────────────────────────────────────────── */
  --shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04);
  --shadow-md: 0 4px 8px -2px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04);
  --shadow-lg: 0 10px 24px -8px rgb(0 0 0 / 0.08), 0 4px 10px -4px rgb(0 0 0 / 0.06);
  --shadow-sticky-top: 0 -8px 24px -12px rgb(0 0 0 / 0.1); /* sticky CTA bar */

  /* ── Motion ──────────────────────────────────────────── */
  --transition-base: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 200ms cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ── Type scale ──────────────────────────────────────── */
  --text-hero: 1.875rem;     /* 30px — KPI hero numbers */
  --text-title: 1.25rem;     /* 20px — page H1 */
  --text-section: 1rem;      /* 16px — section H2 */
  --text-body: 0.875rem;     /* 14px — body */
  --text-meta: 0.75rem;      /* 12px — labels, helper */
  --text-eyebrow: 0.75rem;   /* 12px uppercase */
  --leading-tight: 1.2;
  --leading-snug: 1.4;
  --leading-normal: 1.55;

  /* ── Status ──────────────────────────────────────────── */
  --color-success: oklch(0.55 0.13 160);
  --color-success-foreground: oklch(0.99 0 0);
  --color-success-soft: oklch(0.96 0.04 160);

  --color-warning: oklch(0.7 0.16 70);
  --color-warning-foreground: oklch(0.2 0 0);
  --color-warning-soft: oklch(0.97 0.06 80);

  --color-danger: oklch(0.6 0.21 25);
  --color-danger-foreground: oklch(0.99 0 0);
  --color-danger-soft: oklch(0.97 0.04 20);

  --color-info: oklch(0.55 0.13 240);
  --color-info-foreground: oklch(0.99 0 0);
  --color-info-soft: oklch(0.96 0.04 240);

  --color-brand-soft: oklch(0.95 0.04 350); /* very pale rosa for tinted surfaces */

  /* ── Z-index ─────────────────────────────────────────── */
  --z-dropdown: 50;
  --z-sticky: 40;
  --z-sheet-backdrop: 60;
  --z-sheet: 70;
  --z-toast: 80;
  --z-tooltip: 90;
}

/* ── Status badge utility classes ──────────────────────── */
@layer components {
  .badge-success { @apply inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700; }
  .badge-warning { @apply inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800; }
  .badge-danger  { @apply inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700; }
  .badge-info    { @apply inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700; }
  .badge-muted   { @apply inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground; }
}
```

---

## Appendix A — screenshot inventory

Total: **37 screenshots** in `docs/reviews/2026-05-19-deepdive-screens/ui-designer/`.

Desktop 1440 (25): public-form, signin, public-thank-you, datenschutz, impressum, dashboard, inbox, transactions, mitglieder, rechnungen, projekte, kunden, jahresabschluss, jahresabschluss-year (EÜR), einstellungen, dsgvo, sheet-resync, status-404, verify-no-token, 404, dashboard-focus, inbox-empty, inbox-manual (sheet), member-detail, landing-or-redirect.

Mobile 375 (9): landing-or-redirect, signin, public-form, dashboard, inbox, transactions, mitglieder, jahresabschluss, einstellungen.

Tablet 820 (3): dashboard, inbox, mitglieder.

---

## Appendix B — files touched in the proposal

- `src/app.css` — token additions (sec 3.2, 3.18, 8)
- `src/lib/components/ui/input/input.svelte` — h-8 → h-9 (sec 3.4)
- `src/lib/components/ui/card/card.svelte` — create `<Card>` (sec 3.5)
- `src/lib/components/ui/empty-state/EmptyState.svelte` — create (sec 3.11)
- `src/lib/components/icons/EntityIcon.svelte` — create, replaces emoji in RecentActivity (sec 3.10)
- `src/lib/components/admin/PageHeader.svelte` — create (sec 1.10)
- `src/lib/components/admin/YearSwitcher.svelte` — create (sec 2.2)
- `src/lib/components/admin/dashboard/IncomeExpenseHero.svelte` — create (sec 2.3)
- `src/lib/components/admin/Sparkline.svelte` — create (sec 2.3)
- `src/lib/components/admin/jahresabschluss/EurSummary.svelte` — refactor (sec 2.1)
- `src/lib/components/admin/dashboard/WGBWidget.svelte` — token-ify colors (sec 3.2)
- `src/lib/components/admin/dashboard/RecentActivity.svelte` — replace emoji icons (sec 3.10)
- `src/lib/components/admin/Topbar.svelte` — drop disabled icons on mobile (sec 6.1)
- `src/routes/sign-in/+page.svelte` — brand block (sec 4.2)
- `src/routes/+page.svelte` — landing (sec 3.12)
- 6 mail templates in `src/lib/server/mail/templates/` — re-skin (sec 3.13)

Roughly 16 files touched, of which 8 are new components and 8 are edits. Estimate: 1 focused day of work for the full proposal, or 4 hours for the top-10 punch list in section 1.
