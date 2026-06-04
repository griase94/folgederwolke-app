# PWA & Mobile Deep Evaluation — Folge der Wolke

**Date:** 2026-06-04
**Baseline:** `origin/main` @ `d98f465` (clean worktree, no WIP)
**Trigger:** Treasurer reports a **2-3s black/blank screen on every installed-PWA launch**, plus a general "is the PWA as good as it could be?" question.
**Method:** Static + behavioural analysis of the real code by a six-person panel — a PWA/service-worker engineer, a web-performance engineer, a UI designer, a UX designer, and two test-user personas (Julia, a non-technical member on iPhone; Tobias, the busy treasurer on Android). Findings were de-duplicated, severity-normalised, and the highest-impact claims independently re-verified against the source by the orchestrator (verifications marked ✅).

> **Scope caveat:** This is a code-grounded evaluation, not a live Lighthouse/RUM run against production (which needs prod auth + the deployed URL). All latency numbers are reasoned from the request/query topology, not measured. A real device + Lighthouse pass is recommended as the *first* validation step (see §6) — but the structural findings below don't depend on measurement.

---

## 1. Verdict

**The PWA has strong bones and a few sharp, mostly-cheap problems.** The scaffolding is competent — rich manifest, a genuinely well-reasoned silent-update lifecycle, safe-area handling, client-side image compression, an offline background-sync *intent*, and consistent rosa branding. It is a well-built web app that has been thoughtfully *adapted* to mobile, but hasn't yet crossed into feeling *native*.

Three things matter most, and only one of them is the thing you reported:

1. **The black screen is real, fully diagnosed, and fixable** (§2). It is not one bug — it's a stack of four compounding causes, and the already-shipped "A2" fix only changed the blank frame from black to white without shortening the wait.
2. **Two P0s you didn't ask about but need to know:**
   - **Silent offline data-loss on the public Auslagen form.** The offline "we'll send it when you're back online" promise is *false* — the form submits via a native POST that the background-sync queue cannot capture, and the reassuring banner isn't even mounted on that page. This is the exact bad-signal-at-an-event case the feature exists for.
   - **A member-PII cache leak.** Authenticated `/api/members`, `/api/customers`, `/api/search` responses are cached in the browser's Cache Storage, survive sign-out, and are readable by the next user of a shared device — a DSGVO data-at-rest problem for a Verein.
3. **A one-line, high-leverage latency win:** the Vercel function has **no region pin** while data lives in (almost certainly EU) Neon, so dashboard queries likely cross the Atlantic.

Everything else is polish, touch-ergonomics, and trust details — individually small, collectively the difference between "fine" and "banging."

**Counts:** 5 × P0, ~18 × P1, ~16 × P2, ~7 × P3 (after de-dup).

---

## 2. The black screen — full diagnosis and the fix

### 2.1 What actually happens when the treasurer taps the icon

```
tap icon ─▶ GET /?source=pwa                       ← manifest start_url
            │  Vercel function COLD START #1
            │  src/routes/+page.server.ts: resolveSession()  ← Neon query (compute may be RESUMING from scale-to-zero)
            │  → throw redirect(302, "/app")        ← a whole second round-trip
            ▼
         GET /app                                   ← Vercel function COLD START #2 possible
            │  hooks.server.ts: resolveSession() AGAIN
            │  /app/+layout.server.ts: listAvailableYears() + readFestgeschriebenBis()  (Promise.all)
            │  /app/+page.server.ts: ~22-query KPI fan-out + a SERIAL Beitrags CTE tail
            ▼
         SSR HTML returns ─▶ first paint ─▶ hydrate ─▶ SW registers
```

Nothing paints until that whole chain returns, because **the service worker has no `navigateFallback` / cached app-shell** — every navigation (the HTML document itself) goes to the network, even though all the JS/CSS is already sitting in the cache.

### 2.2 The four compounding causes (each verified)

| # | Cause | Evidence |
|---|-------|----------|
| C1 | **No cached app-shell.** Workbox `generateSW` precaches 110 asset entries (~5.9 MB) but sets no `navigateFallback` — document requests are network-only. | `vite.config.ts:26-68` ✅ |
| C2 | **Redirect chain on launch.** `start_url=/?source=pwa` → SSR session check → `302 /app`. Two serverless round-trips, each able to cold-start. | `manifest.webmanifest:16`, `+page.server.ts:27` ✅ |
| C3 | **~10 serial Neon queries on the critical path**, the first paying Neon's scale-to-zero **compute resume**. `resolveSession` alone is up to 4 sequential queries (sessions → touch → users → allowlist) and runs **twice** (root + `/app`); the root call is **redundant** because `hooks.server.ts` already resolved the session for that request. Plus a **no region pin** (function likely US, Neon likely `fra1`) → ~80-100ms trans-Atlantic RTT × every query. | `auth/index.ts:312-372`, `+page.server.ts:25`, `hooks.server.ts:37-44`, `vercel.json` (crons only) ✅ |
| C4 | **No iOS launch image.** No `apple-touch-startup-image` tags anywhere → on iOS standalone the webview is a blank canvas until first paint. The inline `html{background:#fff}` "A2" fix (`app.html:21-26`) only repaints the gap white *after* HTML parse; it cannot help the pre-parse iOS frame. | `app.html`, `static/` ✅ |

For a **~15-person app**, almost *every* launch is a true cold path: idle Vercel function + scaled-to-zero Neon. That's why it's 2-3s (and 4-5s on a bad signal / old phone), every time.

### 2.3 The fix — tiered, so you get most of the win cheaply

**Tier 0 — perceived-speed quick wins (hours, ship this week):**
- **Inline branded skeleton in `app.html`** — a rosa cloud mark + a subtle progress shimmer, pure HTML/CSS, no JS. Converts "white void → looks broken" into "obviously loading." This alone removes the *broken* perception without touching the backend.
- **iOS `apple-touch-startup-image`** splash set for the common iPhone viewports (generate from the existing 512px icon). Branded launch frame on iOS instead of blank.

**Tier 1 — kill the avoidable latency (low effort, big win):**
- **Pin the region:** `adapterVercel({ regions: ['fra1'] })` (verify Neon's actual region first — the Blob store is already `fra1`, so EU is near-certain). Single line; likely the largest latency win.
- **Drop the redirect hop:** read `locals.session` in `+page.server.ts` instead of re-calling `resolveSession`, and point `start_url` at `/app?source=pwa` for the installed app (hooks already handles stale logged-out installs). Removes a full function round-trip.
- **Collapse `resolveSession`** sessions+users into one JOIN, and skip the `lastUsedAt` write on the launch path. ~3 round-trips → 1.
- **Parallelise the dashboard:** fold the serial Beitrags CTE into the existing `Promise.all`, and de-dupe the `festgeschrieben_bis` read that runs in *both* the layout and the page.

**Tier 2 — the real architectural fix (the centerpiece, L effort):**
- **Precached app-shell + `navigateFallback`.** Add a prerendered, auth-free shell route (`export const prerender = true` so the adapter emits real HTML that `globPatterns` picks up) rendering the AdminShell chrome + a dashboard skeleton. Set Workbox `navigateFallback: '/app-shell'` with a denylist for `/api/*`, `/auslage-einreichen`, `/sign-in`. Make `/app/+layout.server.ts` **stream** its data (return promises + `{#await}`) so the shell paints *before* Neon answers.
- **New launch sequence:** tap → SW serves shell HTML + cached JS/CSS instantly (<300ms) → hydrate → data streams in behind the skeleton → swap to content. The 2-3s blank becomes an instant branded shell.

**Optional — keep-warm:** a daytime-only Vercel cron hitting `/api/health` (`SELECT 1`) every few minutes (Europe/Berlin working hours) to keep Neon resumed. Weigh against Neon free-tier compute-hours; Tier 1+2 may make this unnecessary.

---

## 3. Findings register

### 3.1 P0 — fix first

| ID | Title | Area | Effort | Evidence |
|----|-------|------|--------|----------|
| **P0-1** | Cold-start: no cached shell + redirect chain + ~10 serial Neon queries + Neon resume → 2-3s blank on every launch (the reported pain) | cold-start | L (Tier 2); S wins available | §2 ✅ |
| **P0-2** | **No Vercel region pin** — function likely US, Neon likely EU → trans-Atlantic RTT on ~30 dashboard queries. One-line fix. | perf | S | `vercel.json`, `svelte.config.js:15` ✅ |
| **P0-3** | **Public Auslage offline submit is broken**: native (non-fetch) POST can't be queued by Workbox BackgroundSync; nothing replays. Silent data loss on bad signal. | offline | M | `AuslagenForm.svelte:355,381`; `vite.config.ts:48-61` |
| **P0-4** | **Member-PII cache leak**: `/api/members`, `/api/customers`, `/api/search` cached via StaleWhileRevalidate with no `CacheableResponse` gating → persists past sign-out, shared across device users (DSGVO). | privacy | S | `vite.config.ts:33-42`; `/api/*` routes exist ✅ |
| **P0-5** *(was P0, refined → P1)* | `/app/+error.svelte:81` secondary button uses `history.back()` (a dead-end in standalone PWA). **Refined:** line 70 has a working `href="/app"` primary, so the user isn't fully stranded — only the secondary button is dead. | navigation | S | `app/+error.svelte:70,81` ✅ |

### 3.2 P1 — high value

**Offline / trust**
- OfflineBanner promises auto-send it can't keep **and isn't mounted on the public form** at all (`OfflineBanner.svelte`; mounted only in `AdminShell.svelte:76`). After P0-3, mount it on the public page and make the copy true.
- Offline-queued submit gives **no durable confirmation** — if sync fires after the app is closed, the user never sees an ID and may re-submit (duplicate). Needs a persisted "pending submission" + next-launch confirmation.

**Bundle / perf**
- **pdfjs-dist (~400 KB) ships eagerly** on the public Auslage form *and* `/app/transactions/neu`. `file-compress.ts:2-3` imports it at module top (while `pdf-lib`/`browser-image-compression` are correctly lazy); pulled in statically via `BelegUpload.svelte:3`. Make pdfjs lazy (`await import` inside `compressPdfIfScan`, `import type` for types). ✅ verified import chain. Highest-ROI client change.
- **Whole 5.9 MB app precached on install** (110 entries) including admin routes a public-form visitor never uses. After Tier-2 shell, trim `globPatterns` to shell + runtime-cache hashed route chunks.
- **Inter font ships all 7 language subsets** (5 unused) with no `preload` (`app.css:4`). Use the latin subset + `<link rel=preload>` → fewer bytes + earlier paint, less CLS.

**Mobile touch & forms**
- **Inputs are 32 px tall** (`input.svelte` `h-8`) and **checklist CTAs ~30 px** (`ChecklistItem.svelte`) — below the 44 px touch minimum. The public form's most-used fields are affected.
- **Sticky CTA bar occludes the required Betrag/Rechnungsdatum field** (`AuslagenForm.svelte:638`); Julia rates this P0 — it hits the form's most important field. Fix: fixed `pb` ≥ 6rem independent of the VisualViewport trick (unreliable on iOS Safari) + `scrollIntoView` on focus.
- **Sphere chips render at 10.4 px** on a 375px viewport (`CashflowOverviewSection.svelte`) — accounting data illegible. Go 2×2 on mobile + `text-xs`.
- **Admin Betrag uses `type=number` + no `inputmode`** (`transactions/neu/+page.svelte`) → wrong mobile keyboard; the public form already does this right (`inputmode="decimal"`).
- **Submit disabled until a Beleg is attached, with no explanation** (`AuslagenForm.svelte:376`) — reads as "form is broken." Add an `aria-describedby` hint under the button.

**Navigation / IA**
- **Mobile search icon opens nothing** (`Topbar.svelte:468-488`, "Phase 6") — a dead tap target on the highest-frequency mobile action. Hide it until built, or implement the overlay (the `/api/search` endpoint already exists).
- **"Mark a Beitrag paid" is 7+ taps + a full page load** on mobile (Mitglieder is buried in the More-sheet). Put Mitglieder on the tab bar; fix the checklist deep-link to `?view=matrix`.
- **Beitrags-matrix is a horizontal-scroll table** (`MemberMatrix.svelte:326` `min-w-[500px]`); the 280px MarkPaid popover can escape a 390px viewport. Use a bottom **Sheet** on mobile instead of an anchored popover.
- **Year-switcher** is a tiny 32px native select with no visible label (`MobileYearPicker.svelte:52`) — low discoverability for a frequent task.

**Install / iOS**
- **3 of 4 manifest shortcuts 404** ✅ verified: `audit-inbox`→`/app/inbox`, `eur`→ doesn't exist (use `/app/jahresabschluss`), `spenden/neu`→`/app/transactions/spenden`. Add a CI grep of manifest URLs vs routes.
- **No iOS splash** (`apple-touch-startup-image`) — see C4.
- **iOS status-bar style `default`** (white) clashes with rosa chrome (`app.html:43`); `black-translucent` + the existing safe-top padding gives seamless brand chrome.

**Legal / trust**
- **Impressum shows unsubstituted placeholders** `[VEREIN_ADRESSE]`, `[VEREIN_VR]` (public page) — §5 TMG risk; the real values already exist in settings. Resolve at render. (Julia)

### 3.3 P2 / P3 — polish backlog

| Sev | Finding | Fix |
|-----|---------|-----|
| P2 | Legal pages `prerender=false` (`datenschutz`, `impressum`) force a function for static text | `prerender = true` + precache |
| P2 | `share_target` drops the shared receipt file and re-asks for it | stash into the IndexedDB drafts file-store across the redirect |
| P2 | `DateField` `inputmode="decimal"` wrong for TT.MM.JJJJ | → `numeric` |
| P2 | Success page renders "Vielen Dank!" with blank ID if visited without `?id=` | branch the message / validate id |
| P2 | `IosInstallHint` fires after 2s over an active form | delay 8-10s + idle-gate + focus mgmt |
| P2 | `window.confirm()` dirty-check on admin tx form; no draft persistence there | add IndexedDB draft + silent flush (match public form) |
| P2 | No install affordance on public landing/form (only admins get it) | mount IosInstallHint/InstallPrompt on public surfaces, frequency-capped |
| P2 | Topbar near-empty on mobile, breadcrumb hidden | show last breadcrumb segment as a centered page title |
| P2 | OfflineBanner overlays public header without pushing content | reserve banner height / use sticky |
| P2 | Datenschutz is an unstyled wall of text | add `prose prose-sm` wrapper |
| P2 | Sign-in page has no branding (phishing-ish) | reuse the landing brand header |
| P2 | EÜR `SphereYoYTable` 5-col table needs horizontal swipe on mobile | collapse "vs. Vorjahr" into an inline chip < md |
| P2 | Year-switch = full SSR reload, no optimistic UI | stream / keep prior numbers greyed during load |
| P2 | Draft restore silently loses the Beleg on iOS relaunch | message: "Beleg bitte erneut anhängen" |
| P3 | SW `registration.update()` polls every 60s (battery/data) | gate on `visibilitychange`/visible, widen to 15-30 min |
| P3 | SW stale-chunk hazard for long sessions (skipWaiting+clientsClaim) | handle `vite:preloadError` → trigger the pending reload |
| P3 | `display_override` leads with `window-controls-overlay` (desktop) | lead with `standalone`; verify maskable safe-zone |
| P3 | RecentActivity uses system emoji icons (inconsistent with Lucide) | swap to Lucide in colored circles |
| P3 | Dashboard greeting `👋` not `aria-hidden` | wrap in `aria-hidden` span |
| P3 | Confetti reduced-motion only zeroes duration | add `display:none` belt-and-suspenders |
| P3 | "Vereinsmitglied" radio on public form is non-functional but clickable | `aria-disabled` + hint |

---

## 4. What's genuinely good (keep it)

- **SW update lifecycle is thoughtfully form-safe** — defers reload to the next navigation so a mid-entry deploy never discards an unsaved booking (`PwaUpdater.svelte`). Rare to see done this carefully.
- **Safe-area insets handled** across app.css, AdminShell, the FAB sheet, and the public form CTA.
- **Manifest is rich** — id, scope, maskable icons, shortcuts, `share_target`, categories.
- **Client-side image compression** (`browser-image-compression`, lazy) is the right call for mobile photo uploads, and the FAB-as-tab-cell avoids the old floating-button overlap.
- **The public Auslage form is the strongest surface** — camera capture, IndexedDB draft restore, ARIA live regions, VisualViewport-aware CTA. The *intent* throughout is good; the gaps are in follow-through.

---

## 5. Recommended sequencing

**This week (hours each, mostly S):**
1. Pin the region (P0-2) — verify Neon region, one line.
2. Fix the 3 broken manifest shortcuts + add the CI grep (P1).
3. Lazy-load pdfjs (P1) — ~400 KB off the public form.
4. Close the PII cache leak (P0-4) — `NetworkOnly` for authed `/api/*` + clear cache on logout.
5. Inline branded skeleton + iOS splash (Tier 0) — kills the "broken" perception now.
6. Touch-target bump (inputs `h-8→h-10`, CTAs `min-h-[44px]`), sticky-CTA `pb` fix, sphere chips 2×2.

**Next (the real fixes, M-L):**
7. App-shell + `navigateFallback` + streamed layout data (Tier 2) — the architectural cold-start fix.
8. Convert the public form to `fetch`/`use:enhance` so BackgroundSync actually works, then mount + truthfully word the OfflineBanner and add durable submit confirmation (P0-3 + P1 offline).
9. Drop the redirect hop + collapse `resolveSession` + parallelise the dashboard (P0-1 latency tail).

**Then:** the P2/P3 polish backlog, ideally folded into whatever feature work touches those surfaces.

---

## 6. Method, scope & caveats

- **Panel:** 6 agents (PWA eng, perf eng, UI, UX, Julia=member/iPhone, Tobias=treasurer/Android), ~668K tokens, 298 tool-uses, against `origin/main@d98f465`.
- **Verified by orchestrator (✅):** the cold-start chain, region/`vercel.json`, the manifest shortcut 404s, the `/app` error dead-end (and its severity refinement), the pdfjs import chain, the `/api/*` cache surface.
- **Not done here (recommended next):** a real **Lighthouse run** (mobile preset) + **WebPageTest/RUM** against production, and a **physical-device pass** on an actual iPhone + mid-range Android to confirm the perceived launch time before/after Tier 0. The structural findings stand regardless, but the latency *numbers* in §2 are reasoned, not measured.
- **Screenshots referenced** are from the 2026-05-19 batch (pre-Beitrag) — used as visual reference, cross-checked against current code.
