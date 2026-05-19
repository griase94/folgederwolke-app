# PWA & Mobile-Web Deep Dive — folgederwolke-app

Date: 2026-05-19
Reviewer: senior PWA / mobile-web engineer
Scope: web app manifest, service worker, install flows, iOS PWA quirks, offline behaviour, mobile-form ergonomics, safe-area handling, install affordances, every public + admin route
Method: source read (`vite.config.ts`, `static/manifest.webmanifest`, `src/app.html`, `src/lib/components/pwa/*`, `src/lib/components/admin/MobileTabBar.svelte`, `AdminShell.svelte`, `AuslagenForm.svelte`, `BelegUpload.svelte`, `Topbar.svelte`) + Playwright tour at iPhone 12 / Pixel 5 / iPad-Mini emulation. Screenshots in `docs/reviews/2026-05-19-deepdive-screens/pwa-mobile/`.

Scale anchor for every recommendation: 15-member Verein, 1-3 Vorstand on phones, solo dev. Anything proposed below has to survive that constraint.

---

## TL;DR — top 8 PWA / mobile changes ranked by joy-per-effort

1. **Replace the Svelte default favicon — it's still being served**. Despite a custom apple-touch-icon, the `<link rel="icon">` in `src/routes/+layout.svelte` imports `src/lib/assets/favicon.svg` which is still the orange `<title>svelte-logo</title>` SVG. Every browser tab, bookmark, and pinned tab shows the Svelte logo, not FdW. **Effort: 5 min** (swap the asset). **Joy: huge** — the cheapest brand win in the entire codebase.
2. **Ship PNG icons alongside the SVGs in the manifest**. Android Chrome and iOS both prefer rasterised icons for home-screen / splash / favicon contexts. Currently the manifest lists only SVG — Chrome may install the app with a Chrome-default fallback icon; iOS will completely ignore SVG icons for splash generation. Ship `192.png`, `512.png`, `180.png` (Apple touch), and `1024.png` for splash. The existing SVG can be left in the manifest as an `any` entry, but **PNGs must be present**. Effort: 30 min with `sharp` / `playwright screenshot` / any export tool.
3. **Add `shortcuts` to the manifest**. Long-press the home-screen icon should give Julia "Audit Inbox", "Neue Spende", "Auslagen-Status" without going through the shell. 4 lines of JSON + matching server routes (the routes already exist). See manifest below.
4. **Switch `start_url` from `/app` to `/auslage-einreichen` for the public form, OR install the admin and public surfaces as two separate scopes**. Today an Externe who installs the PWA from `/auslage-einreichen` opens it and lands on `/sign-in?reason=…` because `start_url=/app` requires auth. Pragmatic fix: query-string the install context — `start_url: "/app?source=pwa"` for admins, and document that Externe just bookmarks the URL (they won't install a one-shot form anyway). Avoid the two-scope rathole — solo-dev cost is too high.
5. **Wire the disabled "Neu" FAB to a bottom-sheet** with "Auslage einreichen / Neue Spende / Neue Rechnung / Neues Mitglied". Right now it renders disabled with a tooltip "(Phase 4)" — the most prominent mobile affordance is dead. Even shipping a simple `<a href>` jump-menu would beat the disabled state.
6. **Make the public Auslagen form offline-tolerant via Background Sync API**. Externe in U-Bahn / festival venue, patchy LTE — `navigator.serviceWorker.ready` + `registration.sync.register('submit-auslage')` + IndexedDB queue. Falls back to retry-on-next-online for browsers without Background Sync (Safari). This is the single biggest reliability win for the form that determines first impressions.
7. **Render brand identity on /sign-in** (already flagged in UX review HIGH-6, repeated here because it's the install-source page for admins): logo bubble + Verein name + trust framing. Same problem on PWA install: when a user reaches `/sign-in` via the home-screen icon, an unbranded form is jarring.
8. **Fix the `Spender` filter chip overflow on Transaktionen** (iPhone 12 / 390 px): the filter row clips the rightmost tab, hiding "Spenden". One-line fix: wrap in `overflow-x-auto -mx-4 px-4 snap-x` or use the existing chip pattern from Projekte. P1 because Spenden filtering is a primary Kassenwart task.

The first three are 1-2 hour sprints with disproportionate visible upside. The middle three (4-6) are a single weekend. The last two (7-8) are paper-cuts but mar the install moment.

---

## 1. Audit — current state, line by line

### Manifest (`static/manifest.webmanifest`)

| Field | Today | Verdict | Recommendation |
| --- | --- | --- | --- |
| `name` | "Folge der Wolke" | OK | keep |
| `short_name` | "FdW" | OK | keep (10 chars max for Android dock) |
| `description` | German | OK | keep |
| `theme_color` | `#be185d` | OK, matches `<meta name="theme-color">` | keep |
| `background_color` | `#ffffff` | OK but consider `#fdf2f8` (pink-50) to match brand on splash | minor |
| `display` | `standalone` | OK | keep |
| `display_override` | _missing_ | should add `["window-controls-overlay","standalone","minimal-ui","browser"]` for desktop PWA | nice-to-have |
| `orientation` | `portrait-primary` | too strict — Kassenwart on iPad may want landscape | switch to `any` |
| `start_url` | `/app` | breaks for Externe install path | see §1.6 |
| `scope` | `/` | OK | keep |
| `lang` | `de` | OK | keep |
| `dir` | _missing_ | add `"dir": "ltr"` | trivial |
| `categories` | _missing_ | add `["finance","productivity","business"]` for Play / install stores | trivial |
| `id` | _missing_ | add `"id": "/?source=pwa"` so Chrome can disambiguate from other PWAs on the same host | trivial |
| `icons` | 4 × SVG | Chrome may render Chrome-default; iOS ignores SVG for splash | **must add PNG variants** |
| `shortcuts` | _missing_ | propose 4 below | high-impact |
| `share_target` | _missing_ | propose below | medium-impact |
| `prefer_related_applications` | _missing_ | add `false` to be explicit | trivial |
| `screenshots` | _missing_ | Chromium uses these in the install bottom-sheet on Android. Add 2 × 1080 × 1920 (mobile) and 1 × 1920 × 1080 (desktop) | nice-to-have |

### `src/app.html` — iOS PWA meta

| Tag | Status |
| --- | --- |
| `<meta name="viewport" … viewport-fit=cover>` | ✅ correct |
| `<meta name="theme-color" content="#be185d">` | ✅ |
| `<meta name="apple-mobile-web-app-capable" content="yes">` | ✅ but **deprecated**; should add `<meta name="mobile-web-app-capable" content="yes">` as the replacement (still safe to keep both) |
| `<meta name="apple-mobile-web-app-status-bar-style" content="default">` | ⚠ consider `black-translucent` for a richer brand top once you control the safe-area padding; `default` renders a stark white bar that hides the brand |
| `<meta name="apple-mobile-web-app-title" content="FdW">` | ✅ |
| `<link rel="apple-touch-icon" href="/apple-touch-icon.svg">` | ⚠ iOS **does not honour SVG apple-touch-icons** in many versions. **Must add 180×180 PNG**. |
| Splash screens (`apple-touch-startup-image`) | _missing_ — iOS uses a flat white splash with the icon centred when missing; acceptable default but ugly. Optional improvement: one `<link rel="apple-touch-startup-image">` per device size (12+ variants). Decision: skip until you have a real designer asset (anti-list). |

### Service worker (`vite.config.ts`)

```ts
SvelteKitPWA({
  strategies: "generateSW",
  registerType: "prompt",
  manifest: false,
  workbox: {
    globPatterns: ["client/**/*.{js,css,html,svg,png,ico,webmanifest}"],
    maximumFileSizeToCacheInBytes: 3_000_000,
    runtimeCaching: [
      { urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
        handler: "StaleWhileRevalidate",
        options: { cacheName: "fdw-api-runtime",
          expiration: { maxAgeSeconds: 60, maxEntries: 100 } } },
    ],
    skipWaiting: true,
    clientsClaim: true,
  },
});
```

| Aspect | Today | Verdict |
| --- | --- | --- |
| Strategy | `generateSW` (Workbox autogen) | OK for this scale |
| Update flow | `prompt` + `UpdateAvailableToast.svelte` + 60 s poll | ✅ Solid — the toast is well-built |
| Precache scope | `client/**/*.{js,css,html,svg,png,ico,webmanifest}` | ✅ Good; SvelteKit's emitted app shell covers it |
| Runtime cache | only `/api/` SWR for 60 s, 100 entries | ⚠ Underutilised. See §1.4. |
| `maximumFileSizeToCacheInBytes` | 3 MB | OK; bump only if the bundle grows past it |
| `skipWaiting` + `clientsClaim` | both on | ✅ Correct given the prompt-driven toast |
| `devOptions.enabled` | `false` | ✅ Correct — dev SWs are a nightmare |

### Service worker — what is NOT cached but should be

- `/manifest.webmanifest` — included via the glob, ✅
- `/icons/*.svg` — included, ✅
- `/auslage-einreichen` (the public-form HTML) — included as part of `client/**.html`, ✅
- `/api/admin/dashboard` (Heute view) — currently `StaleWhileRevalidate` 60 s; **bump to 5 min for the dashboard endpoint** so a U-Bahn admin sees the last numbers. Add a per-route override.
- Beleg files (user-uploaded images) — not cached today, **shouldn't be** (privacy + size). Confirm.

### `IosInstallHint.svelte`

Excellent component — only shows on iOS Safari, persists dismissal in localStorage. Two improvements:
- Currently fires once and never returns. Add a 30-day timeout: `JSON.stringify({ dismissedAt: Date.now() })` and re-show after `>30d`. iOS users who dismiss once never see it again, even after reinstalling Safari.
- Detection: `navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1` is a known iPadOS workaround. ✅ already handled.

### `InstallPrompt.svelte`

Listens for `beforeinstallprompt` and shows a small "Installieren" button in the Topbar. ✅ Lifecycle is correct. The button is only visible once Chrome decides the PWA is install-eligible (manifest valid + SW registered + engagement heuristic). Two improvements:
- After dismissal, never store the choice → re-prompts every page reload. Persist `localStorage["fdw.install-dismissed-at"]` and gate re-show by 30 days, same shape as iOS hint.
- The deferred prompt is fired once per page load; after a successful install you set `deferredPrompt = null` correctly. ✅

### `UpdateAvailableToast.svelte`

Polls `r.update()` every 60 s; on `needRefresh` shows a bottom toast. ✅ Solid. Two minor:
- The 60 s poll for a 15-member Verein is overkill. 5-10 min is plenty. Cuts SW overhead by ~10× on long sessions.
- Toast offset: `bottom-20` on mobile to clear the tab bar (good), `bottom-6` on desktop. ✅ correct.

### Mobile Tab Bar (`MobileTabBar.svelte`)

| Aspect | Verdict |
| --- | --- |
| Position fixed, z-40, safe-area-inset-bottom | ✅ |
| 4 tab items + 1 FAB | ✅ shape |
| Active tint matches `theme_color` | ✅ |
| Tap targets | 5 items × (~80 px wide × 56 px tall) — meets 44 px minimum |
| **FAB is `disabled`** with "(Phase 4)" tooltip | ❌ See TL;DR #5 |
| `aria-current="page"` on active tab | ✅ |
| Order: Heute → Audit Inbox → Transaktionen → Mitglieder → Neu | OK; consider swapping "Mitglieder" with "Rechnungen" — Rechnungen is a higher-frequency surface for Kassenwart per the UX review |

### Public form `AuslagenForm.svelte`

| Field | inputmode / autocomplete / type | Verdict |
| --- | --- | --- |
| Externe Name | `autocomplete="name"` | ✅ |
| Externe IBAN | `inputmode="text"` `autocomplete="off"` | ⚠ should be `inputmode="text" autocomplete="off" spellcheck="false" pattern="[A-Z0-9 ]+" autocapitalize="characters"` so iOS upper-cases the letters |
| Externe Email | `inputmode="email" autocomplete="email"` | ✅ |
| Bezeichnung | `type="text"` no inputmode | ✅ OK |
| Betrag | `inputmode="decimal"` | ✅ Correct — opens the numeric keypad with comma on German keyboards |
| Rechnungsdatum | `type="date"` | ✅ |
| Datenschutz checkbox | OK | ✅ |
| Beleg upload | `accept=".pdf,image/jpeg,…" capture="environment"` (Camera button) | ✅ Camera capture is wired |
| Image compression | `browser-image-compression` at 1600 px / 0.8 q with EXIF preserved | ✅ Excellent |
| Sticky CTA | safe-area-aware `pb-[max(0.75rem,env(safe-area-inset-bottom))]` | ✅ |
| Draft persistence | IndexedDB (`idb`) with file blob in separate store | ✅ State of the art for this app's scale |

The form is **shockingly well-built for mobile**. The two improvements that matter:
- Add a network-loss banner: `addEventListener('online' / 'offline', …)` → show "Offline — Eingabe wird gespeichert" when offline.
- Background-sync submit (see §3).

### Tables on mobile

- `TransactionsList.svelte` (`/app/transactions`) — wraps a `<table>` in `overflow-x-auto`. **Not responsive**. On iPhone 12 the table is horizontally scrollable, but at 390 px the columns squish to unreadable. Should be card-per-row on `<md`. Currently empty on the test fixture so the lack of a mobile pattern isn't immediately visible.
- `MemberMatrix.svelte` (`/app/mitglieder?view=beitrags-matrix`) — `min-w-[500px]`, horizontally scrolls. Acceptable; the matrix needs columns.
- `EurSummary.svelte` (`/app/jahresabschluss`) — table, will compress on mobile but reasonable.
- Mitglieder LIST view — actually uses cards (`MemberList` component). ✅
- Rechnungen LIST view — currently empty state on the screenshot run; check `InvoiceList.svelte` for responsive shape (recommend: cards on mobile if not already).
- Projekte LIST view — cards. ✅

The single concrete fix: convert `TransactionsList.svelte` to a cards-on-mobile / table-on-`md+` pattern. Below an example signature you can adopt:

```svelte
<div class="md:hidden flex flex-col gap-2">
  {#each filteredRows() as row (row.id)}
    <TransactionCardMobile {row} … />
  {/each}
</div>
<div class="hidden md:block overflow-x-auto rounded-lg border">
  <table>…current desktop table…</table>
</div>
```

### Mobile viewport, safe-area, notch

- `viewport-fit=cover` set everywhere ✅
- `env(safe-area-inset-bottom)` applied on the tab bar ✅
- Top notch handling: `apple-mobile-web-app-status-bar-style="default"` leaves a 47 px white bar; the Topbar's `Folge der Wolke` title sits below it. Adequate.
- Tested at iPhone 12 (390 × 844): tab bar hugs the home indicator correctly, no overlap. ✅
- Tested at Pixel 5 (393 × 851): no notch, tab bar at viewport bottom. ✅
- Tested at iPad Mini (768 × 1024): switches to icon-only sidebar at the `md` breakpoint — content area gets ~700 px, sidebar 64 px. ✅

---

## 2. Proposed `manifest.webmanifest`

```json
{
  "id": "/?source=pwa",
  "name": "Folge der Wolke",
  "short_name": "FdW",
  "description": "Vereinsverwaltung für Folge der Wolke e.V. — Auslagen, Spenden, Buchhaltung.",
  "lang": "de",
  "dir": "ltr",
  "theme_color": "#be185d",
  "background_color": "#fdf2f8",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui", "browser"],
  "orientation": "any",
  "start_url": "/app?source=pwa",
  "scope": "/",
  "categories": ["finance", "productivity", "business"],
  "prefer_related_applications": false,
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-monochrome.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "monochrome" },
    { "src": "/icons/icon-512.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ],
  "screenshots": [
    {
      "src": "/screenshots/dashboard-mobile.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Dashboard Heute"
    },
    {
      "src": "/screenshots/auslage-mobile.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Auslage einreichen"
    },
    {
      "src": "/screenshots/dashboard-desktop.png",
      "sizes": "1920x1080",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Schreibtisch-Ansicht"
    }
  ],
  "shortcuts": [
    {
      "name": "Audit Inbox öffnen",
      "short_name": "Inbox",
      "description": "Offene Einreichungen prüfen",
      "url": "/app/inbox?source=shortcut",
      "icons": [{ "src": "/icons/shortcut-inbox.png", "sizes": "96x96", "type": "image/png" }]
    },
    {
      "name": "Neue Spende erfassen",
      "short_name": "Spende",
      "description": "Geld- oder Sachspende eintragen",
      "url": "/app/transactions/spenden?source=shortcut",
      "icons": [{ "src": "/icons/shortcut-spende.png", "sizes": "96x96", "type": "image/png" }]
    },
    {
      "name": "Auslage einreichen",
      "short_name": "Auslage",
      "description": "Öffentliches Auslagen-Formular",
      "url": "/auslage-einreichen?source=shortcut",
      "icons": [{ "src": "/icons/shortcut-auslage.png", "sizes": "96x96", "type": "image/png" }]
    },
    {
      "name": "EÜR aktuelles Jahr",
      "short_name": "EÜR",
      "description": "Einnahmen-Überschuss-Rechnung",
      "url": "/app/jahresabschluss?source=shortcut",
      "icons": [{ "src": "/icons/shortcut-eur.png", "sizes": "96x96", "type": "image/png" }]
    }
  ],
  "share_target": {
    "action": "/auslage-einreichen?source=share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "bezeichnung_display",
      "text": "kommentar_display",
      "files": [
        {
          "name": "beleg",
          "accept": ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"]
        }
      ]
    }
  },
  "edge_side_panel": {
    "preferred_width": 480
  },
  "protocol_handlers": [],
  "launch_handler": {
    "client_mode": "auto"
  }
}
```

Notes:
- All four `shortcuts` require the routes to accept a `source=shortcut` query (cosmetic — your existing auth+layout treats unknowns gracefully, but log it for analytics).
- `share_target` requires you to:
  - Accept `multipart/form-data POST` on `/auslage-einreichen` (the existing POST already does — see `+page.server.ts`). The shared file maps to `beleg`, the title to `bezeichnung_display`, the text to `kommentar_display`. Validate that field names match — the existing AuslagenForm uses `bezeichnung_display`, `kommentar_display`, `beleg`. ✅
  - The shared submission goes through the same Zod-validated path. If a field is missing, the user lands on the form with the file pre-attached and the rest empty — handle this by showing the form pre-populated.
- `monochrome` icon is for Android tinted icon themes (Material You). Optional but ~5 lines of SVG to add.
- `screenshots` are nice-to-have; skip if you don't have time, but the install-bottom-sheet on Android looks naked without them.

---

## 3. Service-worker strategy — what to precache, what to runtime-cache

### Precache (built-in via Workbox glob)

Already covered: app shell JS / CSS / HTML / SVG / PNG / ICO / WebManifest. ✅

Add:
- `/auslage-einreichen` HTML — already covered by glob.
- `/datenschutz`, `/impressum` — same.

### Runtime cache (proposed)

```ts
runtimeCaching: [
  // Dashboard data — admin's "Heute" page. 5 min so U-Bahn admins see last snapshot.
  {
    urlPattern: ({ url }) => url.pathname === "/api/admin/dashboard",
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "fdw-dashboard",
      expiration: { maxAgeSeconds: 5 * 60, maxEntries: 4 },
    },
  },
  // Members, projects — read-mostly, slow-changing.
  {
    urlPattern: ({ url }) => /^\/api\/(members|projects)/.test(url.pathname),
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "fdw-reference",
      expiration: { maxAgeSeconds: 30 * 60, maxEntries: 20 },
    },
  },
  // Recent transactions — last 30 entries only.
  {
    urlPattern: ({ url }) => url.pathname === "/api/transactions/recent",
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "fdw-tx-recent",
      expiration: { maxAgeSeconds: 10 * 60, maxEntries: 4 },
    },
  },
  // All other /api/ GETs — fall back to the existing 60 s SWR.
  {
    urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
    handler: "StaleWhileRevalidate",
    options: {
      cacheName: "fdw-api-runtime",
      expiration: { maxAgeSeconds: 60, maxEntries: 100 },
    },
  },
  // Static assets from /icons, /screenshots — cache-first, 30 days.
  {
    urlPattern: ({ url }) => /^\/(icons|screenshots)\//.test(url.pathname),
    handler: "CacheFirst",
    options: {
      cacheName: "fdw-static-art",
      expiration: { maxAgeSeconds: 30 * 24 * 3600, maxEntries: 32 },
    },
  },
],
```

### Background Sync for Auslagen submission

Use Workbox's `BackgroundSyncPlugin`:

```ts
import { BackgroundSyncPlugin } from "workbox-background-sync";
import { registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

const bgSyncPlugin = new BackgroundSyncPlugin("fdw-auslage-queue", {
  maxRetentionTime: 24 * 60, // 24 h
});

registerRoute(
  ({ url, request }) =>
    url.pathname === "/auslage-einreichen" && request.method === "POST",
  new NetworkOnly({ plugins: [bgSyncPlugin] }),
  "POST",
);
```

Caveats:
- iOS Safari **does not implement Background Sync API**. On iOS, the form will still submit when the device comes back online via the existing IndexedDB draft + `online` event listener — see §6.
- The submission carries multipart/form-data including a file blob; Workbox's BackgroundSyncPlugin handles this correctly.
- Show a UI confirmation when the SW commits the deferred request — fire a `postMessage` from the SW to the client, surface a toast "Auslage offline gespeichert, wird beim nächsten Online gesendet".

### What to NOT cache

- `/api/admin/dsgvo/*` — privacy-sensitive, must not survive logout.
- `POST /api/auth/*` — sign-in flows must be network-only.
- `POST /api/admin/*` — all mutations must be network-only (skip Background Sync except for the public form; admin already has a network).
- User Beleg files — `/files/*` paths, never cache. They're personally identifiable.

---

## 4. App-icon design proposal

Current state: a flat rosa rounded-rect with the text "FdW" centred. Functional but generic. Recommendation for a designer or AI-image tool:

**Concept:** keep the rosa background (`#be185d`), replace the "FdW" text with a stylised cloud (one large rounded shape + two smaller bumps) and one or two diagonal rain-droplet / sparkle accents. The Verein name is "Folge der **Wolke**" — the cloud IS the name. Letters are unreadable at 16 px; a glyph is not.

**Spec to hand to designer / tooling:**
- Canvas: 1024 × 1024, no shadow, no gradient.
- Background: `#be185d` (rosa), full bleed.
- Foreground: a single off-white cloud (slightly translucent, ~85% white over rosa). 3 stacked bumps, asymmetric. Cloud occupies ~65% of the canvas, centred slightly above the optical centre.
- Optional accent: a single small 5-point sparkle in `#fdf2f8` (pink-50) to the upper-right of the cloud, ~6% of the canvas.
- Maskable variant: same composition, but the cloud shrinks to fit a 78% safe-zone circle (Android Material You crops to a circle / squircle on most launchers; keep the cloud well inside).
- Monochrome variant: pure white cloud on transparent (Android tinted-icon theme will recolour at runtime).
- Apple touch icon (180 × 180 PNG): exactly the "any" variant, no rounded corners (iOS adds its own).
- Favicon (32 × 32 ICO + SVG): simplified — just the largest cloud bump, no accent (it's 32 px).

Export tree once the master is signed off:

```
static/
  favicon.ico            (16/32/48 multi-resolution)
  favicon.svg            (vector, monochrome cloud)
  apple-touch-icon.png   (180×180, no transparency)
  icons/
    icon-192.png
    icon-192-maskable.png
    icon-512.png
    icon-512-maskable.png
    icon-1024.png        (used for splash generation)
    icon-monochrome.svg  (Android tinted-icon)
    shortcut-inbox.png   (96×96 — Inbox glyph)
    shortcut-spende.png  (96×96 — heart glyph)
    shortcut-auslage.png (96×96 — receipt glyph)
    shortcut-eur.png     (96×96 — chart-bar glyph)
```

If Andy wants to generate via an AI tool: prompt with "minimalist app icon, rosa pink solid background hex #be185d, soft white stylised cloud icon centred, three rounded bumps, no text, flat design, vector style, 1024x1024, no shadow". DALL-E / Midjourney / Recraft all do this well. Budget: 30 min.

---

## 5. Per-page mobile audit

Screenshots in `docs/reviews/2026-05-19-deepdive-screens/pwa-mobile/`. Three devices per route (iphone12-, pixel5-, ipadmini-).

| Route | iPhone 12 verdict | Notable |
| --- | --- | --- |
| `/` (resolves to `/auslage-einreichen`) | Good. Form fits, no horizontal scroll, sticky CTA respects safe-area. | `<header>` could use a small FdW logo to brand the install entry-point. |
| `/sign-in` | Mid-screen form, unbranded. UX-6 already flagged in main UX review. | Add logo, vertical anchor to top-third. |
| `/auslage-einreichen` | Excellent. Best mobile surface in the app. | Add online/offline banner; submit goes through SW Background Sync. |
| `/impressum`, `/datenschutz` | Unreadable wall of text (UX-3 already flagged: missing `@tailwindcss/typography`). | Cross-reference UX review CRIT-3. |
| `/app` (Heute) | Tab bar respects safe-area; KpiCards stack vertically. | "Folge der Wolke" topbar wastes 56 px — consider hiding on mobile, leaving only avatar + bell + search button. |
| `/app/inbox` | Empty state is friendly. Tab bar OK. | The "Manuell hinzufügen" button at the top is full-width — could be a smaller chip + use the FAB for primary "Neu" affordance. |
| `/app/transactions` | **Filter chips overflow horizontally** — "Spenden" is clipped at 390 px. Empty list state is friendly. | TL;DR #8. Add `overflow-x-auto -mx-4 px-4` to the chip row. Convert table to cards on mobile. |
| `/app/transactions/spenden` | "Neue Spende" button overlaps title on narrow screens (title left, button right, both flex-row on mobile). | Stack vertically on `<sm`. |
| `/app/mitglieder` | Cards work nicely on mobile. ✅ | Avatar bubble colours are decent; consider larger initials for accessibility. |
| `/app/rechnungen` | Empty state. | When populated, confirm cards-on-mobile is in place. |
| `/app/projekte` | Cards, P-2026-002 label is truncated mid-word ("Folge der Wolke — Woche…"). | Use `text-balance` or 2-line clamp; ID + sphere on second line as it is now. |
| `/app/kunden` | Empty / list of one. Cards if populated. | Same as Rechnungen — verify when populated. |
| `/app/jahresabschluss` | EUR summary table compresses. KpiCards work. | At 390 px the summary table works but is tight — consider Schein/Gegenkonto columns hidden on `<sm`. |
| `/app/einstellungen` | Form layout. ✅ | Standard. |
| `/app/dsgvo` | Form. ✅ | Standard. |
| iPad Mini (768 × 1024) — all admin routes | Sidebar collapses to icon-only at md, content gets 700 px. | ✅ Predictable. |
| iPad Mini — public auslage | Form gets a max-w-xl card centred — same as desktop with margin. | Could go wider but fine. |

Top three specific tweaks:
1. `TransactionsList` filter chips overflow at 390 px (highest user impact).
2. Disabled "Neu" FAB on the mobile tab bar (highest visibility deadweight).
3. Topbar "Folge der Wolke" title at the top of every admin route wastes vertical space on mobile.

---

## 6. Anti-list — PWA features NOT worth doing at this scale

A solo dev + 15 members + 1-3 active phone users does **not** justify:

- **Web Push Notifications**. On iOS this requires (a) the user installs the PWA AND (b) grants notification permission AND (c) you ship a VAPID key + backend dispatch. For 1-3 admins, an email + the existing Audit Inbox does the same job. **Skip.** The single use-case ("notify Kassenwart of a new Auslage") is already covered by mail templates.
- **Background Periodic Sync**. Chromium-only, requires the PWA to have "high engagement score", undocumented behaviour on real devices. Skip.
- **Web NFC**. No use-case. Skip.
- **Web Bluetooth / Web Serial**. Skip.
- **Payment Request API for SEPA**. PaymentRequest doesn't speak SEPA. SEPA bookkeeping happens via XML export → bank import → done. The Giro-QR code (EPC 069) idea below is a separate, smaller win.
- **Passkeys / WebAuthn**. For 3 admins logging in twice a week via magic link, the added complexity (server-side credential store + recovery flow + cross-device sync caveats) doesn't pay back. Magic links are already passwordless. **Skip until Phase 8+.** If you do want it later, Apple's Passkey + Chrome's Passkey are both built on WebAuthn — but you need to handle "I lost my phone" recovery, which is non-trivial. Defer.
- **Per-device iOS splash screens** (12+ `apple-touch-startup-image` entries). The default flat-colour splash from `background_color` is fine for a Verein app. Skip until you have a designer in the loop.
- **Workbox Streaming responses / NavigationPreload**. Overkill for the traffic.
- **Multi-scope PWAs** (public form scope `/` + admin scope `/app`). Cute, but the install UX for "two apps from the same domain" is brittle across browsers. Single scope, two start URLs. Skip.
- **App Shortcuts dynamic API** (the JS shortcut-management API). The manifest's static `shortcuts` array is enough.

What IS worth considering once the basics are shipped:

- **Web Share API** (the *outgoing* one) on the Auslage status page: "Status meiner Auslage teilen" → `navigator.share({ url: status-link })`. Useful for Externe who want to forward to a co-payer. Low effort.
- **EPC 069 Giro-QR code on Beitrags-Reminder mails / Rechnungen.** This is the EPC's Single Euro Payments Area QR-payment standard — every German banking app reads it. Generate via a server-side QR library, embed as `<img>` in the mail. Cuts "OK I'll transfer it" from 5 min to 20 s.

---

## 7. One-week implementation roadmap

Evening-sized chunks (~2 h each). Solo dev, no helper.

### Evening 1 — Brand identity & icons (~2 h)

- [ ] Replace `src/lib/assets/favicon.svg` (currently the Svelte default) with a real FdW favicon (start with `static/apple-touch-icon.svg`'s rosa "FdW" mark scaled down; refine later).
- [ ] Generate PNG icon set from a single SVG master using `sharp` or any online icon generator:
  - `static/icons/icon-192.png`, `icon-512.png`, `icon-192-maskable.png`, `icon-512-maskable.png`, `apple-touch-icon.png` (180×180).
- [ ] Update `manifest.webmanifest` to include both PNG and SVG icon variants, add `id`, `dir`, `categories`, `prefer_related_applications`.
- [ ] Switch `apple-touch-icon` `<link>` in `src/app.html` from `.svg` to `.png`.
- [ ] Add `<meta name="mobile-web-app-capable" content="yes">` alongside the apple- one.
- [ ] Test: install on iOS Safari, install on Android Chrome, verify icon on home screen.

### Evening 2 — Manifest shortcuts + share_target (~2 h)

- [ ] Add `shortcuts` array (4 entries) to manifest with PNG glyphs (96 × 96 each — can be quick SVG-to-PNG exports).
- [ ] Add `share_target` to manifest, point at `/auslage-einreichen?source=share`.
- [ ] In `src/routes/auslage-einreichen/+page.server.ts`:
  - Accept a `source=share` query param.
  - On `share`, expect a `multipart/form-data POST` with `title`, `text`, `beleg` — pre-fill the form on render.
- [ ] In `src/lib/components/forms/AuslagenForm.svelte`: accept `prefilled: { bezeichnung?, kommentar?, beleg? }` as a prop and seed the state on mount.
- [ ] Test: from an Android device, "Share" a PDF receipt to the installed PWA, verify the form opens pre-attached.

### Evening 3 — Background Sync for Auslagen submission (~2 h)

- [ ] `pnpm add workbox-background-sync` (already part of `workbox-window` workspace).
- [ ] In `vite.config.ts`, switch to a custom service-worker via `strategies: "injectManifest"` (or stay on `generateSW` and use the `additionalManifestEntries` + custom handler approach). Recommendation: switch to `injectManifest` for control.
- [ ] Write `src/service-worker.ts` (or wherever your SW source goes — SvelteKit standard is `src/service-worker.ts` automatically detected): register the BackgroundSyncPlugin for `POST /auslage-einreichen`.
- [ ] In `AuslagenForm.svelte`: add `online` / `offline` event listeners; show a banner "Offline — Eingabe wird beim nächsten Online gesendet" when offline.
- [ ] Have the SW `postMessage` the client on successful retry; surface a toast "Auslage wurde gesendet".
- [ ] Test: in Playwright, `await page.context().setOffline(true)` then submit, then `setOffline(false)`, verify the form posts.
- [ ] iOS fallback: if `'sync' in registration.constructor.prototype === false`, persist the submission to IndexedDB and retry from the page on next `online` event.

### Evening 4 — Mobile UX paper cuts (~2 h)

- [ ] Wire the disabled "Neu" FAB on `MobileTabBar.svelte` to a bottom-sheet menu (use `vaul-svelte` or build inline) with 4 actions: "Auslage einreichen", "Neue Spende", "Neue Rechnung", "Neues Mitglied". For now they can all just `href` to the relevant existing route.
- [ ] Fix `TransactionsList.svelte` filter chip overflow: wrap the chip row in `overflow-x-auto -mx-4 px-4 snap-x` with `flex-nowrap`.
- [ ] Convert `TransactionsList.svelte` table → cards on `<md` (the `TransactionRow` component already has enough data; render a `TransactionCardMobile` instead inside the `<md:hidden>` branch).
- [ ] Add a network-loss toast wired to `navigator.onLine` — global, in `AdminShell.svelte` and `auslage-einreichen/+page.svelte`.
- [ ] Hide the Topbar "Folge der Wolke" label on `<md` — it duplicates the home-screen icon below.

### Evening 5 — Polish + verify + ship (~2 h)

- [ ] Update `tests/e2e/pwa.spec.ts` to assert: PNG icons exist, `shortcuts` array has ≥ 4 entries, `share_target` is present, `start_url` matches expectation.
- [ ] Run a Lighthouse mobile audit (Chrome DevTools → Lighthouse → mobile + PWA category). Aim: PWA "Installable" ✅, Best Practices ≥ 95, Accessibility ≥ 95.
- [ ] Test the iOS install flow end-to-end on a real iPhone if available, else on the Safari Tech Preview emulator.
- [ ] Test the Android install flow on a real Pixel / a colleague's phone.
- [ ] Update CLAUDE.md with the new PWA conventions (which icons are required, how to add a new shortcut, how to add a new share-target field).

After this week, the PWA is: installable on iOS + Android with a real icon, branded favicon, app-shortcuts on long-press, share-target from Android, offline-tolerant public form, no dead FAB, no chip overflow, no English fall-throughs.

---

## Appendix — Lighthouse / 3G performance note

I did not run a full Lighthouse mobile audit (would need the production build + a real network throttle). For a quick mobile-3G smoke test, the obvious wins are:

- **Code-split the admin shell from the public form**. Today, `src/lib/components/admin/AdminShell.svelte`, `Sidebar.svelte`, `Topbar.svelte`, `MobileTabBar.svelte` are all referenced from the admin layout — they should not ship to the public `/auslage-einreichen` route. SvelteKit code-splits routes by default, so this is likely already OK; verify by inspecting the network tab on `/auslage-einreichen` — if you see `_app/immutable/chunks/AdminShell-*.js`, fix it.
- **Defer non-critical scripts**: `browser-image-compression` is heavy (~250 KB unzipped, uses a Web Worker). Already loaded only on the form — confirm by checking the chunk graph.
- **Drop `idb` from the public form bundle**? No, it's part of the draft persistence and worth the ~10 KB.
- **Preload critical fonts** from `@fontsource-*` packages — add `<link rel="preload" as="font" crossorigin>` for the primary face.
- **Image format**: serve icons as WebP/AVIF where the browser allows. For 192/512 PNG icons, file size is tiny anyway, not worth it.

If Andy wants a real number: `pnpm build && pnpm preview` and run `npx lighthouse http://localhost:4173/auslage-einreichen --preset=desktop --view`, then `--preset=mobile --throttling-method=devtools --throttling.cpuSlowdownMultiplier=4`. Budget 20 minutes.

---

## Wrap

The PWA scaffolding here is already 70% of the way to "good". The framing problems are:
- The favicon is the Svelte default — most visible brand error in the entire codebase.
- The "Neu" FAB is dead — most visible mobile-affordance error.
- The manifest is missing the things that make PWAs feel native — shortcuts, share_target, PNG icons.
- The service worker is a solid 1.0 — runtime caching could earn its keep with a few more rules.

None of these are big rewrites. The one-week roadmap above gets the mobile experience from "fine, but feels like an unpolished SaaS" to "genuinely a phone-first Vereinsverwaltung". Beyond that, the diminishing returns are real — defer Web Push, defer Passkeys, defer iOS splash perfection.
