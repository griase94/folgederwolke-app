# UX & Visual Design Review — folgederwolke-app

Date: 2026-05-19
Reviewer: senior product designer / UX review pass
Scope: every public + admin route, mail templates, error/legal pages, mobile rendering at 375 px
Method: source read + screenshots (`docs/reviews/screens/` for fresh captures, `docs/reviews/2026-05-19-julia-screenshots/` for authed admin captures already on disk)

---

## TL;DR — "if Julia opened this tomorrow, what's the worst thing she'd see?"

1. **Three core admin pages crash with a generic 500.** Mitglieder, Rechnungen, Projekte, Kunden all render `500 — Ein Fehler ist aufgetreten / Internal Error`. The two areas Julia (and any treasurer) needs most are unreachable. This dwarfs every other paper-cut.
2. **The Impressum and Datenschutz pages publish placeholder text verbatim.** `[VEREIN_ADRESSE]`, `[VEREIN_VR]`, `[VEREIN_STEUERNUMMER]` are rendered as literal strings on `/impressum`. That's an active legal liability for a German e.V.: TMG §5 requires a valid address — there is none.
3. **The legal/markdown pages have no `prose` styling.** The `prose prose-zinc` classes are referenced in markup, but `@tailwindcss/typography` is not installed. Every long-form page is a wall of identical-sized lines — Datenschutz especially looks like a 1995 Geocities print-out.
4. **Five mail templates use `oklch()` colors and `linear-gradient` headers — those silently strip in Gmail / Outlook / iOS Mail.** The MagicLink rewrite already fixed this; the rest didn't get the memo. Eingangs-, Erstattungs-, Rejection-, BeitragsReminder-, InvoiceVersendet-Mail will all render as a transparent header bar (background:`linear-gradient(135deg,oklch(...)...)`) and have pink "Liebste:r"/CTA labels rendered in the default link color (blue) on a transparent background. Same brand bug, five places.
5. **"Check your inbox 💌" is English in a 100% German app.** The single line a not-yet-logged-in user sees post-submit is the wrong language. Easy fix, big tonal hit.
6. **The /sign-in page has no brand identity.** No logo, no Verein name, no headline, no trust framing — just `<h1>Anmelden</h1>` floating mid-screen. For a finance app a non-member is logging into, this is below acceptable trust threshold.
7. **The `+error.svelte` page shows raw error codes** like `TOKEN_MISSING` as the user-facing description. The template was built to be polished but the message it renders is dev-string.
8. **Mobile sign-in is _vertically un-anchored_.** The form sits in the center of an empty 812 px viewport — looks like a half-loaded page.
9. **There's no public landing page.** `/` redirects to `/auslage-einreichen` if forms are enabled, else `/sign-in?reason=public-form-coming-soon`. A non-admin who lands on the bare domain gets dropped straight into a form with no context. The `/+page.svelte` that does exist (`<Button>Auslage einreichen</Button>` etc.) is unreachable.
10. **The Admin sidebar shrinks the brand to "FW Folge der Wolke" at 240 px — but at the collapsed tablet width the user sees just "FW" with no tooltip on the brand.** Minor; we have icon tooltips on nav items only.

The headline framing for Andy: the chrome we already built (`AdminShell`, `KpiCard`, `InboxCard`, mobile tab bar, error template) is genuinely nice. The problems are at the edges: data-load errors, legal pages, mail templates, public/auth surfaces, and one missing Tailwind plugin.

---

## Severity legend

- **CRIT** — user will bounce / the brand looks broken / legal liability
- **HIGH** — significantly hurts trust or task completion
- **MED** — visible paper cut, fixable in <1h
- **LOW** — polish improvement
- **NIT** — opinion / nice-to-have

---

## Findings

### CRIT-1. Three admin list pages crash with raw 500

- **Screens:** `2026-05-19-julia-screenshots/22-mitglieder.png`, `23-rechnungen.png`, `26-projekte.png`, `27-kunden.png` (all four)
- **Observation:** Mitglieder, Rechnungen, Projekte, Kunden all render the styled `/app/+error.svelte` with status 500 and the body literal `Internal Error`. Julia cannot reach the two surfaces most relevant to her job.
- **Fix:**
  1. Triage the underlying load errors — likely DB-shape / driver issue since these are all data-bound. The error message ought to be logged on the server.
  2. The error page itself should not echo the raw `error.message` from the load function. Render a friendly fallback ("Diese Liste konnte nicht geladen werden. Bitte lade die Seite neu — wenn es weiter scheitert, schreib uns an folgederwolke@gmail.com") and put the technical detail behind a `<details>Technische Details</details>`.
  3. Add Sentry / equivalent error reporting so the next 500 doesn't need a user to surface it.
- **Priority:** P0.

### CRIT-2. Impressum publishes literal template placeholders

- **Screens:** `screens/31-impressum.png`, `screens/64-mobile-impressum.png`
- **Observation:** `/impressum` renders the raw markdown which still contains `[VEREIN_ADRESSE]`, `[VEREIN_VR]`, `[VEREIN_STEUERNUMMER]`. The loader at `src/lib/server/legal/loader.ts` reads and returns markdown without any interpolation. This is a TMG §5 compliance failure the moment the site goes public.
- **Fix:** In `loader.ts`, after `readFile`, run a replacement that substitutes `[VEREIN_ADRESSE]` → `env.VEREIN_ADRESSE`, etc. Then ensure the env vars are populated (see `src/lib/server/env.ts:53-55` — they default to empty string, so set them in `.env` and Vercel). Add an assertion in dev that the rendered HTML contains zero `[VEREIN_` substrings.
- **Priority:** P0.

### CRIT-3. Legal/markdown pages have no `prose` styling

- **Screens:** `screens/30-datenschutz.png`, `screens/63-mobile-datenschutz.png`, `2026-05-19-julia-screenshots/50-datenschutz.png`
- **Observation:** Both `/datenschutz` and `/impressum` reference `class="prose prose-zinc prose-headings:text-foreground prose-a:text-primary"`. `package.json` does not include `@tailwindcss/typography`. The result: all `<h1>/<h2>/<h3>/<p>/<ul>` are visually identical, no list bullets visible, no spacing rhythm, no link color. Datenschutz reads as a single 800-line undifferentiated paragraph.
- **Fix:** `pnpm add -D @tailwindcss/typography`. Tailwind v4 plugin path: add `@plugin "@tailwindcss/typography";` in `src/app.css` (the v4 syntax — `tailwind.config.js` is not used). Verify links pick up `--color-primary`. Cap article width to `max-w-prose` (~65ch) and add `prose-lg` on desktop for the legal pages so they're actually readable.
- **Priority:** P0.

### CRIT-4. Mail templates use `oklch()` + `linear-gradient`

- **Files:** `src/lib/server/mail/templates/EingangsMail.svelte:43`, `ErstattungsMail.svelte:48`, `RejectionMail.svelte:42`, `BeitragsReminder.svelte:47`, `InvoiceVersendetMail.svelte:36`
- **Observation:** All five have a header `<td>` with `style="background:linear-gradient(135deg,oklch(0.43 0.20 350) 0%,oklch(0.32 0.18 350) 100%); …"`. Gmail's email parser strips `linear-gradient()` and rewrites `oklch()` to nothing → the header collapses to transparent on the recipient. The CTA buttons (`background:oklch(0.43 0.20 350)`) also lose their fill. Pink "Liebste:r" greeting text uses `color:oklch(...)` → recipients see default black. The MagicLink template already converts to flat hex (`#be185d`) — replicate that approach.
- **Fix:** Search-replace `oklch(0.43 0.20 350)` → `#BE185D`, `oklch(0.32 0.18 350)` → `#9D1452` (or whatever the darker stop should be). Replace `linear-gradient(...)` with the lighter flat color `#BE185D`. Add a `<!--[if mso]>` fallback if you want Outlook-Windows safety. Run the rendered HTML through https://www.htmlemailcheck.com or `litmus.com` if available.
- **Priority:** P0.

### HIGH-5. "Check your inbox 💌" is English

- **File:** `src/lib/server/auth/index.ts:87,103,144` and `src/routes/sign-in/+page.server.ts:28,34`
- **Observation:** The success message returned from the sign-in action is `"Check your inbox 💌"`. Every other string in the app is German. This is the single message anyone first signing in sees.
- **Fix:** Change to `"Schau in dein Postfach 💌"` or even better: `"Mail ist raus! Schau in dein Postfach — der Link ist 15 Minuten gültig."`. Replicate at all 5 call sites. Search the codebase for any other English fall-through (`grep -rn "[A-Z][a-z]* your" src/`).
- **Priority:** P0.

### HIGH-6. /sign-in is a brand vacuum

- **Screens:** `screens/10-signin.png`, `2026-05-19-julia-screenshots/10-signin-empty.png`
- **File:** `src/routes/sign-in/+page.svelte`
- **Observation:** A finance-tool sign-in with no logo, no Verein name, no "Folge der Wolke", no friendly framing. The first `<h1>` is just "Anmelden". Below it: "Gib deine E-Mail-Adresse ein. Du erhältst einen Anmelde-Link." Trust = 0.
- **Fix:** Add the same FW-on-rosa logo bubble used in the sidebar at the top of the card, brand name underneath. Move heading to "Willkommen zurück." with an explanatory subhead: "Trag deine E-Mail ein — wir schicken dir einen 15-Minuten-Anmeldelink. Kein Passwort, kein Captcha." Add a fine-print footer link to /impressum + /datenschutz (German law often expects these reachable from auth pages). Also include a "← zurück" or "Auslage einreichen" link for misclicks.
- **Priority:** P1.

### HIGH-7. /+error.svelte echoes raw error codes

- **Screens:** `screens/12-verify-no-token.png`
- **File:** `src/routes/+error.svelte:64-66`
- **Observation:** Visiting `/sign-in/verify` without a token shows status 400, h1 "Ein Fehler ist aufgetreten", description "TOKEN_MISSING" (literal). Same shape will happen for any error thrown with `error(400, 'CONST_NAME')`.
- **Fix:** Map known error codes to user-friendly German strings in `+error.svelte`. For unknown messages, render the generic "Beim Laden der Seite ist ein unerwarteter Fehler aufgetreten…". E.g.:
  ```ts
  const ERROR_COPY: Record<string, string> = {
    TOKEN_MISSING:
      "Dieser Link ist nicht mehr gültig — bitte einen neuen Anmelde-Link anfordern.",
    TOKEN_EXPIRED: "Der Link ist abgelaufen. Fordere einen neuen unten an.",
    TOKEN_USED: "Dieser Link wurde bereits benutzt. Fordere einen neuen an.",
  };
  ```
  Always include a CTA back to `/sign-in` when a token-related code is shown.
- **Priority:** P1.

### HIGH-8. No public landing page

- **File:** `src/routes/+page.server.ts:18-25`
- **Observation:** `/` returns 302 → `/app`, `/auslage-einreichen`, or `/sign-in?reason=public-form-coming-soon` depending on session/env. There is no human-readable home. A visitor who types `folgederwolke.de` gets dropped into a form or sign-in with no context. The unused `/+page.svelte` literally has a `Folge der Wolke e.V.` H1 + two buttons — it's just bypassed.
- **Fix:** Stop redirecting `/` unconditionally. Render a small landing page with: hero ("Folge der Wolke e.V. — Vereinsverwaltung"), two clearly-labeled buttons ("Auslage einreichen" → /auslage-einreichen, "Vorstand anmelden" → /sign-in), a one-line "Was ist das hier" explanation, and footer links to Impressum/Datenschutz. Keep the redirect for signed-in admins only.
- **Priority:** P1.

### HIGH-9. Datenschutz "Vorarbeit" banner is too quiet

- **Screens:** `screens/30-datenschutz.png`
- **File:** `src/routes/datenschutz/+page.svelte:12-17`
- **Observation:** "Hinweis: Diese Datenschutzerklärung ist in Vorarbeit; sie wird vor öffentlichem Launch durch externe Prüfung finalisiert." is the _first_ line a public visitor sees. With the page already unstyled this looks like a draft notice on a draft document.
- **Fix:** Either (a) remove the banner once the lawyer has reviewed it, or (b) make it explicit: "Diese Datenschutzerklärung gilt für die Phase 2-Testversion. Eine final geprüfte Version folgt vor öffentlichem Launch." Better visual treatment: amber-50 banner with an info icon, max-w-prose, mt-4. Also link to the impressum from the banner.
- **Priority:** P1.

### HIGH-10. Form CTA bar overlaps content

- **Screens:** `screens/20-auslage-einreichen.png`, `2026-05-19-julia-screenshots/01-auslage-empty.png`
- **File:** `src/lib/components/forms/AuslagenForm.svelte:558-596`
- **Observation:** The sticky bottom CTA bar uses `bg-background/95 … backdrop-blur-sm` but it has no `border-t` shadow above it visible in the screenshots, and it sits on top of the "Rechnungsdatum" field when scrolled. Even with `pb-32` on the form, the bar can obscure the Beleg-Vorschau when uploading.
- **Fix:** Add `shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.1)]` to the sticky bar so the boundary is unambiguous. Increase `pb-32` to `pb-40` to guarantee Beleg preview has clearance even when expanded. On desktop (`md:`), consider letting the CTA be inline at the end of the form rather than sticky — less overlap, more deliberate.
- **Priority:** P1.

### HIGH-11. Mobile sign-in floats in vertical void

- **Screens:** `screens/61-mobile-signin.png`
- **Observation:** At 375×812 the sign-in card sits mid-viewport with ~300 px of nothing above and below. Reads like a half-loaded page or a modal whose backdrop didn't render.
- **Fix:** Either (a) anchor near the top with `pt-20 pb-12` and remove `min-h-screen items-center`, or (b) add visible structure — a hero rosa block at the top (`<header class="bg-primary text-primary-foreground p-8 …">FW</header>`) so the card has a visual anchor. Recommend (a) plus the branding fix in HIGH-6.
- **Priority:** P1.

### HIGH-12. `verify` page is bare

- **Screens:** `screens/12-verify-no-token.png` (error variant) and source `src/routes/sign-in/verify/+page.svelte`
- **Observation:** The happy-path page shows only "Anmeldung bestätigen" + "Du meldest dich an als x@y.de." + a `Weiter als x@y.de` button. No explanation of _why_ we're asking again. The device-mismatch banner (lines 24-34) is conditional and gentle — too gentle.
- **Fix:** Add a paragraph above the form: "Aus Sicherheitsgründen bestätigst du den Anmelde-Link mit einem Klick. Damit stellen wir sicher, dass auch beim Vorschau-Tracking großer E-Mail-Provider niemand sich versehentlich für dich anmeldet." When device-mismatched, escalate the warning visual (border-l-4 destructive). Add an "Abbrechen / zurück zur Anmeldung" secondary button.
- **Priority:** P1.

### HIGH-13. "Vereinsmitglied auswählen" shows orphaned hint when members list is empty

- **File:** `src/lib/components/forms/BezahltVonPicker.svelte:105-112`
- **Observation:** When `members.length === 0` the picker shows "Mitgliederliste wird in einer späteren Version geladen." — a developer-facing apology. A public submitter who happens to be a Mitglied is then stuck choosing "Externe Person" and entering their own IBAN.
- **Fix:** Either (a) populate the members list (Phase 2 should already do this), or (b) reword: "Ich bin Vereinsmitglied — bitte zahlt mir die Auslage auf das hinterlegte Konto zurück." with a hidden flag and let the admin reconcile.
- **Priority:** P1.

### HIGH-14. Sign-in success message replaces the form completely

- **Screens:** `2026-05-19-julia-screenshots/11-signin-after-submit-nonadmin.png`
- **File:** `src/routes/sign-in/+page.svelte:25-32`
- **Observation:** After submitting, the form vanishes and is replaced by a pink chip "Check your inbox 💌". No instructions ("Wenn nichts ankommt: prüfe Spam, oder fordere unten neu an"), no way to enter a different email, no email confirmation, no countdown of link validity.
- **Fix:**
  - Keep the email visible: "Wir haben den Link an `du@beispiel.de` geschickt."
  - Add: "Schau auch im Spam-Ordner nach. Der Link ist 15 Minuten gültig."
  - Provide an "andere E-Mail probieren" link that resets the form.
  - Don't replace the page — show a card / inline status above the (disabled) form.
- **Priority:** P1.

### HIGH-15. /404 "Zurück zur Startseite" icon path is wrong

- **File:** `src/routes/+error.svelte:79-81`, `src/routes/app/+error.svelte:73-75`
- **Observation:** The button SVG has `viewBox="0 0 24 24"` with a path that draws a house-roof outline overlapping itself. The same path is on the admin error variant. In the rendered screenshot it looks like a roof + grid icon, not a clean home.
- **Fix:** Replace with a clean Lucide `home` glyph: `M3 9 12 2l9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z`. Or use a Lucide icon component if you import them.
- **Priority:** P2.

### MED-16. Topbar search popover overflows on mobile

- **File:** `src/lib/components/admin/Topbar.svelte:391-411`
- **Observation:** Mobile collapses the search field to just an icon button which currently has no handler — `aria-label="Suche öffnen"` but no `onclick`. Pressing it does nothing. The notification bell also `disabled`.
- **Fix:** Either implement a full-screen mobile search overlay (the comment says Phase 6) or hide the icon entirely on mobile to avoid disappointing taps. At minimum: add `aria-disabled="true"` + tooltip "Demnächst".
- **Priority:** P2.

### MED-17. Dashboard `Spenden YTD` sublabel mismatches its label

- **File:** `src/lib/components/admin/dashboard/KpiSection.svelte:48-52`
- **Observation:** KPI "Spenden YTD" with sublabel "5 aktive Mitglieder" doesn't connect: active members is a different number from donations YTD.
- **Fix:** Either change sublabel to a Spenden-relevant fact ("X Bestätigungen ausgestellt" / "letzte Spende: gestern") or split into two KPIs: "Spenden YTD" + a separate "Aktive Mitglieder" card.
- **Priority:** P2.

### MED-18. Audit Inbox "Manuell hinzufügen" button is the same weight as the page title

- **Screens:** `2026-05-19-julia-screenshots/25-inbox.png`
- **File:** `src/routes/app/inbox/+page.svelte:47-59`
- **Observation:** The outline button has a `+` icon and a slight border — visually it competes for attention with the H1 because the empty state below is so quiet. Manual import is a rarely-used escape hatch, not the headline action.
- **Fix:** Move "Manuell hinzufügen" into a less-prominent dropdown (`...`-kebab on the right of the empty state) or make it a `ghost` button instead of `outline`.
- **Priority:** P2.

### MED-19. Mobile dashboard text wraps "Was möchtest du heute tun?" across two lines

- **Screens:** `2026-05-19-julia-screenshots/40-mobile-dashboard.png`
- **File:** `src/lib/components/admin/dashboard/ChecklistSection.svelte:36-41`
- **Observation:** On 375 px the heading "Was möchtest du heute tun?" wraps after "du"; on the same flex row the subtitle "Deine offenen Aufgaben" gets pushed to the right and looks like a separate column heading rather than a subtitle.
- **Fix:** Make subtitle render below on mobile: `class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2"`. Or drop the subtitle on mobile entirely with `hidden sm:inline`.
- **Priority:** P2.

### MED-20. Mobile bottom-tab "Neu" FAB is disabled

- **File:** `src/lib/components/admin/MobileTabBar.svelte:62-89`
- **Observation:** A bright rosa "+" pill in the tab bar that does nothing — `disabled`, `aria-label="Schnell hinzufügen (Phase 4)"`. From the user's perspective: a permanently broken main action.
- **Fix:** Either ship the "schnell hinzufügen" sheet now (it can simply navigate to `/app/inbox` `?import=true`) or remove the button until it works. Visible-but-disabled is worse than absent.
- **Priority:** P2.

### MED-21. Auslage status timeline shows the abgelehnt branch in the same column as completed steps

- **File:** `src/routes/auslage-status/[ausId]/+page.svelte:103-167`
- **Observation:** When `status === 'abgelehnt'`, the "Geprüft" step is filled green (because `STATUS_ORDER.abgelehnt = 2` matches the "geprueft" position), then a red X step appears below. A submitter looking at this could think "Geprüft" was successful and the X is a separate step. Logically, abgelehnt branches off at step 3.
- **Fix:** When abgelehnt, render step 3 ("Geprüft") in destructive variant rather than green, and skip step 4 entirely. Or branch the timeline visually (rejection node next to step 3 with a line elbow).
- **Priority:** P2.

### MED-22. Bezahlt-von radio cards use `has-[:checked]` — fine on modern browsers but no checked-icon

- **File:** `src/lib/components/forms/BezahltVonPicker.svelte:82-98`
- **Observation:** Selection visually highlights the border + background, but the native radio dot is small (h-4 w-4) and pale. A user double-checking which option is selected may struggle.
- **Fix:** Increase radio to `h-5 w-5`, add `data-state` styling that also draws a small primary check-mark to the right when selected. Or render a custom radio.
- **Priority:** P3.

### MED-23. Form: no character count on Wofür/Projekt; counts on Bezeichnung and Kommentar

- **File:** `src/lib/components/forms/AuslagenForm.svelte:386-498`
- **Observation:** Inconsistent micro-cues. Bezeichnung has `0/200`, Kommentar has `0/1000`. Wofür/Projekt is a free dropdown. Fine; but `Was war's?` shows `0/200` immediately even when empty, which reads as "you're already at zero, get going."
- **Fix:** Only show the count once `bezeichnung.length > 0` or `> 100`. Or render dimmed grey until 80% and shift to amber → red as it nears the limit.
- **Priority:** P3.

### MED-24. Date field "max" uses non-localized format

- **File:** `src/lib/components/forms/AuslagenForm.svelte:474`
- **Observation:** `max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })}` — clever (Swedish locale renders as YYYY-MM-DD which `<input type="date">` accepts), but the value rendered to the user in the field is `2026-05-19` (ISO) on some browsers, not `19.05.2026` (German). On Firefox Linux the spinbox shows `mm/dd/yyyy` by default. Date input internationalization is notoriously inconsistent.
- **Fix:** Either accept the inconsistency, or render a `<input type="text" inputmode="numeric" pattern="\\d{2}\\.\\d{2}\\.\\d{4}">` and parse server-side. Document why in `domain/datenschutz.ts`-adjacent comments.
- **Priority:** P3.

### MED-25. Beleg upload has no error message when file too large

- **File:** `src/lib/components/forms/BelegUpload.svelte:37-52`
- **Observation:** `compressImage` may throw or silently fail. The drop zone advertises "max. 10 MB" but `uploadError` is only set on thrown Error — there's no client-side guard before compressing.
- **Fix:** Check `incoming.size > 10 * 1024 * 1024` first and surface a friendly "Datei ist größer als 10 MB. Bitte mache ein Foto mit niedrigerer Auflösung oder komprimiere die PDF." before attempting compression.
- **Priority:** P3.

### MED-26. Recent Activity uses native emoji icons — inconsistent with everywhere else

- **File:** `src/lib/components/admin/dashboard/RecentActivity.svelte:31-43`
- **Observation:** Across the app icons are inline SVGs (Lucide). The dashboard activity feed switches to emoji (💸📥🎁👤🧾📈🔑📁🏢⚙️). Renders inconsistently across OSes (Apple vs Google vs Twitter emoji). Looks like a different designer.
- **Fix:** Replace with Lucide SVG icons (or whatever the rest of the app uses). Build a small `<EntityIcon kind={kind} />` component reusing the path strings already in `Sidebar.svelte:39-60`.
- **Priority:** P3.

### MED-27. WGB widget bar is `bg-emerald-500` directly — bypasses theme

- **File:** `src/lib/components/admin/dashboard/WGBWidget.svelte:32-39`
- **Observation:** Direct color refs (`bg-emerald-500`, `bg-orange-500`, etc.) on the progress bar. Brand color is `--color-primary`. If the design system shifts these tokens, this widget won't follow.
- **Fix:** Define `--color-success`, `--color-warning`, `--color-danger` tokens (and `-foreground` variants) in `app.css` and reference via `bg-success` etc. Same applies to the badge classes lines 51-59.
- **Priority:** P3.

### MED-28. Search field placeholder is German but truncated on desktop

- **File:** `src/lib/components/admin/Topbar.svelte:285`, screens show `Mitglied, Auslage, Rechnung su…`
- **Observation:** Placeholder is "Mitglied, Auslage, Rechnung suchen…" — the truncation is visible at 1280 px. The field is `w-64` (256 px) on desktop, `xl:w-80` (320 px). Not enough room.
- **Fix:** Either shorten placeholder to "Suchen… (⌘K)" or widen the field. Recommend the former — the ⌘K affordance is already shown as a kbd badge.
- **Priority:** P3.

### MED-29. Magic-link CTA in Topbar (notification bell) is permanently disabled

- **File:** `src/lib/components/admin/Topbar.svelte:413-435`
- **Observation:** A bell icon that's `disabled` with `aria-label="Benachrichtigungen (demnächst)"`. Renders like a broken element. Same pattern as MED-20.
- **Fix:** Remove it from production until you ship it. The reduced chrome is calmer.
- **Priority:** P3.

### MED-30. UserMenu avatar tooltip doesn't show full name on hover

- **File:** `src/lib/components/admin/Sidebar.svelte:204-210`
- **Observation:** On collapsed tablet sidebar the avatar has `title={displayName}` — works as a tooltip. On the open sidebar (desktop) the email may be truncated `truncate` but no expanded view on hover.
- **Fix:** Add `title={user.email}` to the desktop variant's truncated `<p>` so hover shows the full address.
- **Priority:** P3.

### LOW-31. Skip-to-content link has a typo / partial styling

- **File:** `src/lib/components/admin/AdminShell.svelte:33-38`
- **Observation:** Looks fine but uses `focus:not-sr-only` with all `focus:` classes — works on focus only. Verify with keyboard tab — first tab should reveal the link in top-left corner. Probably OK.
- **Fix:** No action needed; spot-check during accessibility QA.
- **Priority:** P4.

### LOW-32. Footer below the legal pages is non-existent

- **Files:** `src/routes/impressum/+page.svelte`, `src/routes/datenschutz/+page.svelte`
- **Observation:** No footer with cross-link between the two pages. Standard German practice: every page (and especially legal pages) should link to the other.
- **Fix:** Add a small footer to public-facing routes (layout group): `<footer class="mt-12 text-xs text-muted-foreground"><a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></footer>`. Even simpler: link from each page to the other ("Siehe auch: Impressum").
- **Priority:** P4.

### LOW-33. Auslage form: Sektionsabstand sehr großzügig

- **File:** `src/lib/components/forms/AuslagenForm.svelte:324-328` (`gap-6 pb-32`)
- **Observation:** On desktop the four Cards have so much vertical breathing room that the form feels longer than it is. On mobile this works; on desktop it scrolls more than needed.
- **Fix:** Tighten desktop spacing: `gap-6 md:gap-5 pb-32`. Or reduce `CardHeader` `py` on desktop.
- **Priority:** P4.

### LOW-34. Dashboard greeting time check uses `new Date().getHours()`

- **File:** `src/routes/app/+page.svelte:10-15`
- **Observation:** Uses local time, not Europe/Berlin. A user travelling to NY at 16:00 local sees "Guten Tag" but server-side Berlin is 22:00. Cosmetic.
- **Fix:** `new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric' })` parse-back. Or accept the minor inconsistency and document.
- **Priority:** P4.

### LOW-35. `+layout.svelte` has no skip-to-content for public routes

- **File:** `src/routes/+layout.svelte`
- **Observation:** Skip link exists in `AdminShell` (admin only). Public routes lack one. Less critical because pages are simpler, but accessibility-by-default would add it.
- **Fix:** Add a `<a class="sr-only focus:not-sr-only" href="#main">…</a>` to the root layout for the public form, sign-in, status pages.
- **Priority:** P4.

### LOW-36. Eingangs-/Erstattungs-/Rejection-Mail footer signs every email "Liebste:r"

- **Files:** all 3 mail templates
- **Observation:** "Liebste:r {vorname}" works for Vereinsmitglieder but for an Externe Person ("Max Müller from Office Depot who paid for cake") this is over-familiar. Same with closing "deine Folge der Wolke Finanz-Gschaftler:innen 💋".
- **Fix:** Branch the tone on `bezahlt_von_kind`. For externals: "Hallo {vorname}," and closing "Viele Grüße, das Team von Folge der Wolke e.V.". For members: keep the cozy version.
- **Priority:** P4.

### LOW-37. Inbox card hover lifts but list rows on Mitglieder do too — inconsistent shadow weight

- **Files:** `InboxCard.svelte:58` uses `hover:-translate-y-0.5 hover:shadow-md`; `MemberRow.svelte:48` uses `hover:shadow-md`
- **Observation:** Member rows don't translate. Inbox cards do. Small visual inconsistency.
- **Fix:** Pick one. Recommend not translating any list row — too distracting in long lists.
- **Priority:** P4.

### LOW-38. Date display inconsistency: ISO `2026-05-19` vs `19.05.2026`

- **Files:** various
- **Observation:** `auslage-status` formats with `toLocaleDateString('de-DE')`; the `<input type="date">` shows ISO. Mail templates use `dd.mm.yyyy`.
- **Fix:** Audit and standardize to `dd.MM.yyyy` for German-locale display. Reserve ISO for `<input type="date">` and machine-readable contexts (`<time datetime>`).
- **Priority:** P4.

### LOW-39. Currency formatting verified — `12,50 €` correct everywhere I checked

- **Files:** `RecentActivity.svelte`, `EingangsMail.svelte`, `KpiSection.svelte`, `WGBWidget.svelte`
- **Observation:** Good — `toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })` is used consistently.
- **Fix:** None. Credit in appendix.
- **Priority:** —

### LOW-40. `app.css` has both `--font-sans: "Inter Variable", sans-serif;` and `@import "@fontsource-variable/inter"` — fine, but no fallback testing

- **File:** `src/app.css:4,79`
- **Observation:** If Inter fails to load (CSP, network), `sans-serif` is the only fallback. On macOS that resolves to Helvetica; on Windows to Arial. The brand reads consistently in screenshots but worth knowing.
- **Fix:** Expand fallback: `--font-sans: "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;`.
- **Priority:** P4.

### LOW-41. `MagicLink.svelte` footer says VR + Steuernummer hardcoded — won't match env vars

- **File:** `src/lib/server/mail/templates/MagicLink.svelte:119-120`
- **Observation:** `<strong>Folge der Wolke e.V.</strong> · Westermühlstraße 6, 80469 München<br />VR 211227 · Steuernummer 143/215/10028` — all hardcoded. If `VEREIN_ADRESSE` env var diverges, mail and Impressum disagree.
- **Fix:** Pass these as props to the template from the sender, derived from env. Single source of truth.
- **Priority:** P4.

### LOW-42. Datenschutz consent text duplicated between `domain/datenschutz.ts` and `/datenschutz` page

- **Files:** `src/lib/domain/datenschutz.ts:14-21`, `docs/legal/datenschutzerklaerung-versionen/v1.md`
- **Observation:** The form's privacy snippet is hand-written constants. The "full" version is in markdown. Two sources of truth; drift risk.
- **Fix:** Either generate the short form from the long markdown (programmatically extract `## Kurzfassung` section) or accept that they're independent and stamp `DATENSCHUTZ_VERSION` matching the markdown version.
- **Priority:** P4.

### NIT-43. The cloud SVG in error states doesn't look cloud-shaped

- **File:** `src/lib/components/empty/Welcome.svelte:32-37`
- **Observation:** The path drawn is a cloud, technically. But at h-10 w-10 inside a circle, recognized as a cloud only because you know the brand is "follow the cloud". A casual viewer sees a blob.
- **Fix:** Bigger icon (h-12 w-12), more recognizable cloud silhouette, optional small ⛅ accent.
- **Priority:** P5.

### NIT-44. The Member avatar palette is 10 colors — risk of overlap

- **File:** `src/lib/components/admin/members/MemberRow.svelte:22-33`
- **Observation:** 10 hash-bucketed colors. For a 50-member Verein, ~5 members share each color. Visual identifiability via color is weak. Initials carry the load.
- **Fix:** Reduce to 5 brand-aligned colors (rosa, pink, fuchsia, plus 2 cool accents) — fewer collisions perceived, more brand-consistent.
- **Priority:** P5.

### NIT-45. Search popover keyboard nav doesn't show focus ring on selected item

- **File:** `src/lib/components/admin/Topbar.svelte:367-383`
- **Observation:** Keyboard navigation works (`highlightIndex`), but visual treatment is `bg-muted` only. A keyboard user might lose track.
- **Fix:** Add a left border `border-l-2 border-primary` on `highlightIndex === itemIndex`.
- **Priority:** P5.

### NIT-46. Form section `<Card>` cards use default `shadow-sm` — could feel softer

- **File:** various
- **Observation:** Stronger cards everywhere. Combined with `border` they read slightly heavy.
- **Fix:** Try `border-0 shadow-md ring-1 ring-border/50` for a softer feel — see if Andy prefers.
- **Priority:** P5.

### NIT-47. Email subjects (not visible in screenshots) likely English/German mix

- **Files:** wherever `sendMail` is called
- **Observation:** Worth auditing all `subject:` lines and matching tone to the body.
- **Fix:** Read every call to `sendMail({ template: …, subject: … })` and confirm subjects use German + emoji sparingly. Already out of scope of this visual review.
- **Priority:** P5.

### NIT-48. AdminShell uses `h-svh` — good — but `overflow-hidden` may trap mobile pinch-zoom

- **File:** `src/lib/components/admin/AdminShell.svelte:40`
- **Observation:** `overflow-hidden` on the outer wrap prevents accidental scrolling but can interfere with iOS pinch-to-zoom for accessibility.
- **Fix:** Allow `overscroll-behavior-y: contain` instead of full overflow:hidden. Test with VoiceOver / zoom.
- **Priority:** P5.

### NIT-49. `placeholder="du@beispiel.de"` and `max@example.com` — mix of TLDs

- **Files:** `/sign-in/+page.svelte`, `BezahltVonPicker.svelte`
- **Observation:** The German `.de` example is good. The extern email placeholder is `max@example.com`. Mix; cosmetic.
- **Fix:** Make both German: `max@mustermann.de`.
- **Priority:** P5.

### NIT-50. Sidebar "Heute" label is friendlier than the URL `/app`

- **File:** `nav-registry.ts:33-39`
- **Observation:** "Heute" — nice. Dashboard title is "Guten Tag, juliaschwarz97 👋" which uses email-prefix as fallback. The greeting falls apart when the user has no `name` set in DB.
- **Fix:** Improve fallback: extract name from email prefix and strip digits + capitalize first letter ("Juliaschwarz97" → "Julia"). Or prompt for a name in Einstellungen.
- **Priority:** P5.

---

## Polish punch list — top 30 by impact × effort

Ordered roughly by ratio. Cells: ⚡ = quick win (<30 min), 🔧 = ~1 h, 🏗 = >2 h.

| #   | Change                                                                               | Effort | Impact | Reference      |
| --- | ------------------------------------------------------------------------------------ | ------ | ------ | -------------- |
| 1   | Replace `oklch()` + gradient in 5 mail templates with hex (`#BE185D` / `#9D1452`)    | 🔧     | CRIT   | CRIT-4         |
| 2   | Substitute `[VEREIN_*]` placeholders in `legal/loader.ts`                            | ⚡     | CRIT   | CRIT-2         |
| 3   | Install `@tailwindcss/typography`, add `@plugin` line in app.css                     | ⚡     | CRIT   | CRIT-3         |
| 4   | Investigate + fix Mitglieder / Rechnungen / Projekte / Kunden 500s                   | 🏗     | CRIT   | CRIT-1         |
| 5   | Replace 5 occurrences of "Check your inbox 💌" with German                           | ⚡     | HIGH   | HIGH-5         |
| 6   | Add brand block + Verein name to /sign-in                                            | 🔧     | HIGH   | HIGH-6         |
| 7   | Map `TOKEN_MISSING`/`TOKEN_EXPIRED`/`TOKEN_USED` to human strings in `+error.svelte` | ⚡     | HIGH   | HIGH-7         |
| 8   | Build a real `/` landing page                                                        | 🔧     | HIGH   | HIGH-8         |
| 9   | Keep email visible + add spam hint after sign-in submit                              | ⚡     | HIGH   | HIGH-14        |
| 10  | Anchor mobile /sign-in card near top                                                 | ⚡     | HIGH   | HIGH-11        |
| 11  | Disable or hide the dead mobile "Neu" FAB                                            | ⚡     | MED    | MED-20         |
| 12  | Disable or hide the dead Topbar notification bell + mobile search icon               | ⚡     | MED    | MED-16, MED-29 |
| 13  | Fix 404 home-button SVG path                                                         | ⚡     | MED    | HIGH-15        |
| 14  | Improve sticky CTA shadow + clearance in Auslagen form                               | ⚡     | MED    | HIGH-10        |
| 15  | Improve verify page copy + warn variant for device mismatch                          | 🔧     | MED    | HIGH-12        |
| 16  | Datenschutz "Vorarbeit" banner: stronger visual + better wording                     | ⚡     | MED    | HIGH-9         |
| 17  | Add public footer (Impressum · Datenschutz)                                          | ⚡     | MED    | LOW-32         |
| 18  | Branch abgelehnt timeline visually                                                   | 🔧     | MED    | MED-21         |
| 19  | Swap RecentActivity emojis for Lucide SVGs                                           | 🔧     | MED    | MED-26         |
| 20  | Tone-branch mail greetings (Externe vs Mitglied)                                     | 🔧     | MED    | LOW-36         |
| 21  | Define `--color-success` / `--color-warning` / `--color-danger` tokens               | 🔧     | MED    | MED-27         |
| 22  | Standardize date formatting (`dd.MM.yyyy` everywhere user-facing)                    | 🔧     | LOW    | LOW-38         |
| 23  | Shorten desktop search placeholder to "Suchen… (⌘K)"                                 | ⚡     | LOW    | MED-28         |
| 24  | Tighten Auslagen form desktop gap                                                    | ⚡     | LOW    | LOW-33         |
| 25  | Improve "Bezahlt von" radio visual selection (check-mark + size)                     | 🔧     | LOW    | MED-22         |
| 26  | Pre-check file size in BelegUpload                                                   | ⚡     | LOW    | MED-25         |
| 27  | Use Berlin TZ for dashboard greeting                                                 | ⚡     | LOW    | LOW-34         |
| 28  | Make UserMenu desktop tooltip show full email                                        | ⚡     | LOW    | MED-30         |
| 29  | Move "Manuell hinzufügen" to kebab when inbox is empty                               | 🔧     | LOW    | MED-18         |
| 30  | Avatar palette: reduce 10 → 5 brand-aligned colors                                   | 🔧     | LOW    | NIT-44         |

---

## Appendix: What's already good

Quite a lot, actually — credit where it's due:

- **`AdminShell` layout system.** Three-tier responsive (mobile bottom tabs / tablet icon-only sidebar / desktop full sidebar) is genuinely clean. The skip-to-content link is there. `safe-area-inset-bottom` handled. Reduced-motion media query in `app.css` is conscientious.
- **`AuslagenForm` is thoughtful.** Draft persistence (IndexedDB), idempotency key per page load, visual-viewport keyboard offset for the sticky CTA, beforeunload + beforeNavigate guards, double-submit guard, focus-scroll to first error. This is solid UX engineering.
- **`InboxCard`** has good information density, hover-lift, unread accent strip, relative time ("vor 3 h" → falls back to date), money is right-aligned with tabular-nums. Almost textbook list-row design.
- **`KpiCard`** + the KPI grid on the dashboard reads cleanly. Sublabels add useful context. Hover transition is subtle. Cards become links — discoverable.
- **`+error.svelte`** template (when it's not echoing dev strings) is properly branded — rosa accent circle, big status number, primary + secondary CTAs, focus-visible outlines.
- **Empty states** (`Welcome.svelte`, `NoEntries.svelte`, `SearchNoResults.svelte`) exist as a system and are friendly. The Audit Inbox "Alles geprüft" with a checkmark is sweet. (Just inline the component to avoid drift.)
- **Auslage status timeline** has good steps + descriptions + dates. The visual treatment of done/active/upcoming is right, just needs the abgelehnt branch reworked.
- **Currency formatting** is consistently `de-DE`. Money-as-cents discipline shows in the templates (cents → division by 100 → `toLocaleString`).
- **`MagicLink.svelte` rewrite** is the gold standard — flat colors, table-based layout, fallback URL, divider, footer with imprint, clear "what is this" body. Use it as the template for the other five.
- **The brand color choice (rosa `oklch(0.43 0.20 350)` ≈ `#BE185D`)** is distinctive and used consistently in screens. It doesn't clash anywhere I checked. The amber/red WGB widget colors are fine because they're status communicators, not brand.
- **Accessibility hygiene** is generally present: `aria-label`s on icon buttons, `aria-current="page"` on active nav, `aria-busy` on submitting buttons, `role="status"` on draft-restored banners, fieldset/legend on the bezahlt-von group, `<kbd>` for the search shortcut. Real attention paid.
- **Mobile bottom tab bar** with the right four items (Heute / Inbox / Transaktionen / Mitglieder). Information hierarchy matches the desktop sidebar's mobileTab indices.

If the CRIT findings get cleaned up, this app will feel like a thought-through product, not a stitched-together MVP.

---

## Severity tally

- CRIT: 4
- HIGH: 10
- MED: 16
- LOW: 12
- NIT: 8

**Total: 50 findings.**

---

## Screenshot inventory

Fresh captures from this review: `docs/reviews/screens/`

- `00-home.png`, `10-signin.png`, `12-verify-no-token.png`, `20-auslage-einreichen.png`, `21-auslage-eingereicht.png`, `30-datenschutz.png`, `31-impressum.png`, `40-app-redirect.png`, `50-404.png`, `51-status-bogus.png`
- Mobile (375×812): `60-mobile-home.png`, `61-mobile-signin.png`, `62-mobile-auslage.png`, `63-mobile-datenschutz.png`, `64-mobile-impressum.png`

Authed admin captures (already on disk): `docs/reviews/2026-05-19-julia-screenshots/`

- Dashboard, Mitglieder (500), Rechnungen (500), Transaktionen (empty), Inbox (empty), Projekte (500), Kunden (500), Jahresabschluss, Einstellungen, DSGVO, Sheet-Resync, mobile-dashboard.

Generator script: `docs/reviews/take-screens.mjs` (Playwright; can re-run with `node docs/reviews/take-screens.mjs` from project root).
