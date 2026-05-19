# Spec red-team — UX reviewer protocol

Date: 2026-05-19
Reviewer: senior UX research + accessibility specialist (red-team lens)
Target: `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md` — §Roles, §Per-cluster originating-expert mapping, §Critical-path test matrix, §Required test categories
Question Andy posed: "ensure our reviewers test the actual UI&UX". Will the spec deliver, or does it just look thorough on paper?

The short answer: **the spec hardens the "code correctness" loop nicely and adds a UX-flow reviewer + Playwright walkthrough requirement, but the UX-quality protocol still has fifteen gaps that a real Julia would fall into.** Playwright verifies a flow exists; it cannot verify a flow delights. Below: 15 findings with severity (BLOCKER / HIGH / MEDIUM) and specific spec changes. Five sample Julia-voice review comments at the end.

---

## 1. Playwright walkthrough ≠ human testing

**Severity: BLOCKER.** The spec's UX-flow reviewer "interactively drives the live app via Playwright (clicks, types, scrolls, screenshots)." Playwright is a robot that types perfect strings into known selectors. It does not mis-type "felix" as "fleix" and watch search fail silently. It does not click the wrong button because the secondary CTA is the same color. It cannot feel that a date input accepting `19.05.2026` but rejecting `19/05/26` is "kind of okay" or "deeply annoying." The robot-drives-happy-path pattern is exactly the pattern that ships `mm/dd/yyyy` placeholders for six months.

**Spec change**: Add a `UX-flow reviewer` walkthrough script template in §Roles. For each critical flow the reviewer MUST execute, in writing in the PR:

1. **Happy path** — Playwright drives it, screenshots at each step.
2. **Wrong-button path** — click the secondary CTA, the breadcrumb, the back button. Does the app recover or strand?
3. **Mistyped-input path** — mis-spell a member name in search, paste `12,50 €` into a number field, paste a non-IBAN into the IBAN field. Does the error tell Julia what to do?
4. **Interrupted path** — start the flow, switch tabs, return after 60s, finish. Is state preserved?
5. **Mobile-thumb path** — Pixel-5 emulation, only tap targets the right thumb can reach without re-grip. Is the primary action thumb-reachable?

Critical-path coverage reviewer enforces. PRs missing any of the five for a critical-path cluster: rejected.

---

## 2. Reviewer-as-Julia consistency across N spawns

**Severity: HIGH.** Each cluster respawns `julia-buchhaltung` 1-N times. With no shared memory, cycle-3 Julia may evaluate dashboard copy differently from cycle-1 Julia — same persona prompt, but micro-judgments drift. After 8 cycles of "looks fine," Julia waves through a label that cycle-1 Julia would have failed. The persona has no continuity.

**Spec change**: Anchor the persona. Every spawn of `julia-buchhaltung`, `ux-expert`, `ui-designer` receives two memory inputs at top of context:

1. The original deep-dive narrative (`docs/reviews/2026-05-19-deepdive-julia-buchhaltung.md` for Julia, `…-ux-expert.md` for UX, `…-ui-designer.md` for UI). The reviewer must briefly re-state "in the original review I said X; here's what changed."
2. The findings JSON for the cluster — so cycle-N Julia argues the same points, not new ones.

Add a row to the reviewer-output template: `## Continuity check — what I said in the original deep-dive, what changed`.

---

## 3. Live-app walkthrough protocol is underspecified

**Severity: HIGH.** Spec says "interactively drives the live app via Playwright" but doesn't say what artifacts must end up in the PR. A reviewer could produce one screenshot of the landing page and call it a walkthrough.

**Spec change**: Every live-app walkthrough writes `live-walkthrough-<reviewer>-<cycle>.md` committed to the cluster's PR, with:

- **Setup** — seed scenario, viewport, user role.
- **Step transcript** — numbered steps; each with what the reviewer tried to do (plain language), what they clicked/typed, screenshot path, one-sentence reaction.
- **Comparison against the original finding** — finding text verbatim, then "this is resolved because …" or "NOT resolved because …".
- **Friction log** — any moment the reviewer paused, was confused, or had to read twice.

Without this artifact, the PR can't merge.

---

## 4. Microcopy reviewer is not a native German speaker

**Severity: HIGH.** C9 reskins German microcopy (sidebar, submit labels, empty-state CTAs, undo toasts). C8 reskins 5 mail templates. The ux-expert and ui-designer personas may not catch the difference between "Einreichung speichern" (technically fine, emotionally limp) and "In die Inbox legen" (warm, honest).

**Spec change**: Add a new role **`Vereinsmitglied-Native (DE)`** to §Roles, assigned to C8 and C9. Persona prompt:

> Du bist Vereinsmitglied in einem ehrenamtlichen Münchner Kunst-Verein. Du sprichst Deutsch als Muttersprache, kein Behördendeutsch, kein Marketing-Sprech. Du bewertest, ob sich ein String anfühlt wie ein freundlicher Mensch oder wie eine SAP-Maske. Du forderst Korrekturen an Strings, die richtig aber kalt sind.

This reviewer rates every user-facing string on cold / okay / warm and proposes a warmer alternative for any "cold." Their sign-off is mandatory before C8/C9 originating-experts can sign off.

---

## 5. Accessibility coverage is axe-only, not keyboard/screen-reader

**Severity: HIGH.** axe-core catches static-DOM violations (missing labels, low contrast, missing alt). It misses: tab-order traps, focus rings disappearing into pink, screen-reader-only labels contradicting visible ones, custom segmented controls without arrow-key nav, modal focus-return-on-close.

**Spec change**: Extend §Required test categories:

| Kind                                      | Required for                          | Asserts                                                                                          |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Keyboard-only E2E (Playwright, no mouse)  | every UI cluster touching a CTA       | Critical flow completable with only Tab / Shift+Tab / Enter / Space / arrow keys                |
| Screen-reader smoke (role-based asserts)  | C1, C2, C4, C7, C9                    | H1 announces, primary CTA has accessible name, form errors announce via `aria-live`             |
| Reduced-motion + prefers-color-scheme dark | C6 primitives                          | Primitives respond correctly to OS-level prefers-* media queries                                 |

For C7 specifically: keyboard-only E2E MUST cover bottom-sheet FAB → action → form submit (Android-with-Bluetooth-keyboard exists).

---

## 6. Mobile UX is emulated, not felt

**Severity: HIGH.** Playwright emulation tests can't measure thumb-zone reachability (FAB at 88% screen height reachable with one right thumb on iPhone 14 Pro?), glanceability (Julia at a bar at 1am, one ear of focus), or one-thumb-operation viability.

**Spec change**: For C7, add a non-emulation audit:

| Kind                       | Required for | Asserts                                                                                              |
| -------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| Thumb-zone heatmap audit   | C7           | Reviewer overlays a standard iOS/Android thumb-reachable-zone heatmap on the bottom-sheet, FAB, CTAs |
| One-thumb-operation script | C7           | Reviewer proves the full flow completes without the screen leaving thumb reach                       |

Written audit, not automated. pwa-mobile reviewer enforces.

---

## 7. The "delight" gap

**Severity: HIGH.** Andy was explicit: users should be "flashed," especially the PWA. Functional correctness ≠ delight. The spec checks "tests pass," "axe green," "visual diff zero-regression" — none measure delight. The deep-dive UX report's §9 ("Delightful touches") and §10 ("Anti-list") aren't anywhere in the quality gates.

**Spec change**: Add a new role **`Delight reviewer`**, spawned once per cluster and once at morning consolidation. Persona:

> Du bist begeisterte:r Nutzer:in. Du suchst nach den drei kleinen Momenten in diesem Cluster, die einen Menschen lächeln machen — eine Microanimation, ein warmer Empty-State, eine sinnige Farbpaarung. Du bewertest: gibt es überhaupt einen Delight-Moment? Wenn nein: schlägst du drei konkrete, in Stunden umsetzbare Delight-Adds vor.

Output: "Delight inventory." For most clusters non-blocking. For C5 (PWA) and C9 (microcopy) — the clusters with the largest delight surface — the delight reviewer's sign-off IS blocking.

---

## 8. First-run experience never tested

**Severity: MEDIUM.** Every reviewer assumes a Julia who's already used the app. None simulate "brand-new admin opens `/app` for the first time." C2 (year switcher) and C3 (dashboard) in particular have a first-run failure mode: empty DB, no projects — does the dashboard say something helpful or just "0 €"?

**Spec change**: Add a "first-run scenario" seed to the Playwright global setup: fresh DB, one user (Julia, admin), zero rows. Every UI cluster's E2E suite must include at least one test against this seed. The walkthrough protocol (Finding 1) gains a sixth path:

6. **First-run path** — empty-DB seed, navigate as brand-new admin. Is the first screen welcoming? Are empty states inviting? Is "add your first member" obvious?

---

## 9. Empty-state quality bar is not specified

**Severity: MEDIUM.** C9 ships "every empty list gets a CTA in its empty state." Spec doesn't differentiate "Noch keine Mitglieder" (functional) from "Hier wird's bald lebendig. Lege dein erstes Mitglied an." (warmth).

**Spec change**: Add to C9 acceptance:

> Each empty state must (a) name the entity in human language, (b) provide a forward-looking sentence, (c) provide the CTA as button/link, (d) optionally suggest a "while you're here" nudge per deep-dive UX §9.9. The `Vereinsmitglied-Native (DE)` reviewer rates each on cold/okay/warm and refuses any "cold."

Examples for the spec:

- Mitglieder leer: NOT "Noch keine Mitglieder." OKAY "Noch keine Mitglieder. Lege das erste an." WARM "Hier wird's bald lebendig — lege dein erstes Mitglied an. ✨"
- Transaktionen leer: NOT "Keine Einträge." OKAY "Noch keine Buchungen — leg die erste an." WARM "Hier wird's später bunt. Leg deine erste Buchung an."

---

## 10. Mail UX testing stops at `.eml` grep

**Severity: HIGH.** C8 tests via `MAIL_PROVIDER=dev-eml` content assertions. Grepping `.eml` proves bytes exist; it does not prove Gmail web renders the brand-strip without clipping, Apple Mail dark-mode inverts rosa to something readable, Outlook web strips the inline `<style>` block. Real users open mail in real clients.

**Spec change**: Add to C8 acceptance:

1. Rendered screenshots of EVERY mail template in **Gmail web (light), Gmail web (dark), Apple Mail macOS, Apple Mail iOS, Outlook web, Outlook for Windows**. 5 templates × 6 clients = 30 screenshots.
2. Giro-QR payload must be decoded by a real banking app on at least one device (pwa-mobile reviewer scans with N26 / DKB, screenshots the prefilled SEPA form).
3. The C8 sign-off comment lists each of the 6 clients with the rendered-screenshot link.

Without these, C8 ships pretty `.eml` files and ugly real emails.

---

## 11. PWA install flow is not tested

**Severity: HIGH.** C5 ships icons + manifest + shortcuts + share_target + start_url redirect. None of the listed tests install the PWA on a device and screenshot the home screen. "Manifest validates" is a markup check.

**Spec change**: Add manual-verification to C5, executed by pwa-mobile reviewer:

1. Install on a physical iPhone via Safari → Add to Home Screen. Home-screen, launch-screen, first-useful-view screenshots.
2. Install on physical Android via Chrome's install prompt. Same three screenshots.
3. Install on macOS via Chrome. Same three.
4. Each manifest `shortcut` appears on long-press / right-click and routes correctly.
5. `share_target` — share a PDF from iOS Files to the installed PWA, public form receives the file.
6. `start_url` — kill app, re-open, no `/sign-in` strand.

No physical device → cluster defers. No "emulator is fine" shortcut.

---

## 12. Dark mode unspecified in C6 primitives

**Severity: MEDIUM.** UI-designer review said "no demand for dark mode at current scale." Anti-list confirms. But C6 primitives will live for years. If they hard-code `bg-white` and `text-zinc-900`, retrofitting dark mode means re-touching every primitive.

**Spec change**: Add to C6:

> Every primitive uses semantic Tailwind tokens (`bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`); never hard-codes hex or Tailwind palette colors. The ui-designer reviewer asserts each primitive renders correctly under `prefers-color-scheme: dark`. Future-proofing assertion, not user-facing dark-mode shipment.

Visual-diff reviewer extends snapshots to simulated dark mode; snapshot fails if any token resolves to a non-semantic color.

---

## 13. Performance felt by the user

**Severity: MEDIUM.** Time-to-interactive on mobile is not in the spec's test categories. The user-felt perception of "slick" is half about snappy. A 4-second cold-start on the PWA destroys delight.

**Spec change**: Add a perf-budget check to C5:

| Metric                       | Target on Pixel 5, throttled 4G | Tool                  |
| ---------------------------- | ------------------------------- | --------------------- |
| Largest Contentful Paint     | < 2.5s                          | Playwright trace      |
| Time to Interactive          | < 3.5s                          | Same                  |
| Cumulative Layout Shift      | < 0.1                           | Same                  |
| PWA cold-launch to dashboard | < 2.0s                          | Lighthouse-CI         |

Non-blocking (no baseline yet), but the cluster's PR body must include measured numbers. Morning consolidation collates them: Andy sees "C3 got worse" or "C5 stayed snappy."

---

## 14. Originating-expert sign-off quality bar

**Severity: MEDIUM.** Spec says sign-off "captured in writing." Doesn't say a quality bar. "lgtm" satisfies the rule. After 12 cycles a fatigued reviewer may indeed write "lgtm."

**Spec change**: The sign-off comment MUST contain, in order:

1. **Original finding** (verbatim from deep-dive, with line reference)
2. **What I tested** (live-walkthrough steps)
3. **What I saw** (screenshots referenced)
4. **Verdict**: `RESOLVED` / `PARTIALLY RESOLVED` / `NOT RESOLVED`
5. If PARTIALLY: what's missing, severity, defer-or-block
6. Other findings I noticed (free-form, can be empty)

Orchestrator parses for the literal verdict word. A comment without one of the three verdict headers doesn't count as sign-off.

---

## 15. Reviewer fatigue across cycles

**Severity: MEDIUM.** Cycle 1 reviewer is sharp. Cycle 8 same persona is fresh — but the diff is smaller, the changes are incremental, and the agent doesn't push as hard because "it looks mostly addressed." LLM personas don't tire but they do become less critical when there's less to push against.

**Spec change**: Inject a "skepticism prompt" at cycle ≥ 4:

> Hinweis: Cycle <N> für diesen Cluster. Frühere Cycles haben Feedback geliefert, das adressiert wurde. Genau jetzt ist die Gefahr am größten, dass etwas durchgewunken wird, weil "es sieht ja schon gut aus." Sei kritischer als in Cycle 1. Such aktiv nach dem, was im inkrementellen Diff übersehen wurde, an den Rändern des Original-Findings, in den Nicht-Happy-Paths.

In parallel, every 3rd cycle (3, 6, 9, …) the orchestrator spawns a **second-opinion reviewer** — a different persona, no memory of prior cycles. Would they sign off from scratch? If not, the cluster reopens.

---

## Top-5 UX-quality gaps (summary)

1. **Finding 1** — Playwright drives happy path only; needs wrong-button / mistyped / interrupted / mobile-thumb / first-run protocols.
2. **Finding 4** — No native-German microcopy reviewer; cold-but-correct strings will ship.
3. **Finding 7** — No delight reviewer; the app will be functionally correct and emotionally flat.
4. **Finding 10** — Mail testing stops at `.eml` grep; no real-client rendering.
5. **Finding 11** — PWA install never tested on physical devices; "manifest validates" ≠ "icon looks right on home screen."

---

## Bonus: 5 sample Julia-voice review comments

The kind of PR comments we'd want from the UX-flow reviewer after a walkthrough. Plain German + plain English, calm, specific.

### Sample 1 — Approval of C2 (year switcher)

> Cluster C2 — Year switcher
>
> Original Finding: JB-001 ("Ich kann das Jahr nicht wechseln.")
>
> Was ich getestet habe: Topbar → Jahr-Dropdown → 2025 ausgewählt. Dashboard, Transaktionen, Rechnungen schalten auf 2025 um. URL zeigt `?year=2025`. Reload bleibt auf 2025. Lock-Icon erscheint weil 2025 festgeschrieben ist. Habe versucht, in 2025 eine neue Transaktion mit Datum 2025-12-01 anzulegen — Form lässt mich, zeigt unter dem Datum eine ruhige Warnung "Die Buchung erscheint in 2025 (festgeschrieben). Bitte stornieren statt anlegen." Genau richtig.
>
> Verdict: **RESOLVED**
>
> Bonus: Das Switcher-Dropdown hat eine feine Open-Animation — fühlt sich teuer an. Auf Mobile wird's Bottom-Sheet. Schöne Geste.

### Sample 2 — Rejection of C9 (microcopy)

> Cluster C9 — Microcopy + IA
>
> Original Finding: UX-021 ("Empty-state CTA in every empty page").
>
> Was ich getestet habe: Empty-DB Seed, durch alle 8 Listenseiten.
>
> Was ich gesehen habe: Mitglieder leer rendert "Noch keine Mitglieder. Lege das erste an. [Mitglied anlegen]". Technisch korrekt — CTA existiert. Aber "Noch keine Mitglieder" ist Vereinsamt-Sprache. Bei einem Verein für Kunst und Begeisterung fühlt sich das wie ein Bürgerbüro-Wartezimmer an.
>
> Vorschlag: "Hier wird's bald lebendig — lege dein erstes Mitglied an. ✨" oder "Noch ist's still — leg das erste Mitglied an." Im Diff sind das zwei Strings. In der Deep-Dive habe ich geschrieben dass Tone die Tool-Bindung bestimmt — das hier ist die Stelle.
>
> Verdict: **PARTIALLY RESOLVED**
>
> Was fehlt: Drei Empty-States haben funktionale aber kalte Copy (Mitglieder, Projekte, Kunden). Bitte mit `Vereinsmitglied-Native (DE)` Reviewer durchgehen vor Merge.

### Sample 3 — Approval of C5 (PWA), begeistert

> Cluster C5 — PWA icons + manifest
>
> Original Finding: PM-001 ("Favicon ist die default Vite-SVG").
>
> Was ich getestet habe: PWA installiert auf iPhone 14 Pro (iOS 17.4), Pixel 5 (Chrome), macOS (Chrome).
>
> Was ich gesehen habe: iOS-Home-Screen zeigt das rosa-Marmor Sticker-Icon mit Wolke und Blitz — bei dunklen Wallpapern poppt es, bei hellen sitzt es ruhig. Android maskable Variante sitzt sauber im Squircle. Tab-Icon bei 16px noch erkennbar (Wolke + Blitz ohne Marmor). Long-press iOS zeigt 4 Shortcuts; Tap auf "Audit Inbox" öffnet direkt `/app/inbox` (Session noch aktiv).
>
> Share_target: PDF aus iOS Files in die installierte PWA geteilt — landet im Public-Form mit dem PDF schon hochgeladen. Genau der "wow"-Moment, den Andy gesucht hat.
>
> Verdict: **RESOLVED**
>
> Delight-Score: +3 Momente (Icon-Detail, Squircle-Treue, Share-Intent). Das wird Andy zum Lächeln bringen.

### Sample 4 — Conditional approval of C1 (EÜR)

> Cluster C1 — EÜR Redesign
>
> Original Finding: JB-007, VB-001, UX-100 — EÜR-Seite zu mager für Steuerberater-Werkzeug.
>
> Was ich getestet habe: Neue Tab-Struktur Übersicht / Buchungsliste / Spenden / Exports durchklickt. PDF gedruckt. Vorjahr 2025 ausprobiert. WGB-Freigrenze geprüft.
>
> Was ich gesehen habe: Übersicht zeigt 4-Sphären Tabelle mit YoY-Spalte (delta % zu 2025). Monatlicher Verlauf als Sparkline darüber. PDF-Knopf prominent oben rechts. PDF gedruckt — sieht aus wie etwas, das ich der Steuerberaterin zeigen würde. **Genau das hatte ich in der Deep-Dive gefordert.**
>
> Verdict: **RESOLVED — mit Hinweis**
>
> Hinweis: Sparkline zeigt "Zu wenig Daten" bei Buchungen < 5 — gut. Aber bei genau 5 Buchungen rendert sie als 1-Pixel-Strich, was komisch aussieht. Schwelle vielleicht 10, oder andere Visualisierung darunter (Punkte statt Linie). Nicht blocking — follow-up Issue.

### Sample 5 — Hard rejection of C7 (mobile FAB)

> Cluster C7 — Mobile polish
>
> Original Finding: UX-FAB ("FAB ist deaktiviert").
>
> Was ich getestet habe: Pixel 5 Emulation, dann mein echtes iPhone (Safari → Add to Home Screen → PWA gestartet). Habe versucht, einhändig mit rechtem Daumen den FAB zu erreichen.
>
> Was ich gesehen habe: FAB sitzt unten rechts, 16px vom Rand. Tap öffnet Bottom-Sheet mit 4 Aktionen. Funktional korrekt — Original-Finding im Code adressiert.
>
> ABER: Auf iPhone 14 Pro (6.1") liegt der FAB knapp außerhalb meiner Daumen-Reichweite einhändig. Ich muss umgreifen oder mit zweiter Hand tippen. Genau die Reibung, die ich abends an der Bar nicht haben will — wenn ich zwischen zwei Gesprächen schnell eine Auslage einreichen will.
>
> Vorschlag: FAB 8px näher zur Mitte (rechts 16 → 24px) UND 8px höher. Das holt ihn in die natural thumb zone für ≥ 6" Geräte. Bottom-Sheet 70% Höhe statt 100% — Aktions-Knöpfe oben bleiben im Daumen-Bereich.
>
> Verdict: **NOT RESOLVED**
>
> Was fehlt: Thumb-zone Audit (Spec §Mobile UX testing). Bitte zurück mit Position-Adjustments. Teste gerne nochmal.

---

End of red-team.
