# Transactions Phase 8 — Exports + Cross-Cutting Polish + a11y + Old-Route Retirement (Tier D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Read the ROADMAP (row 8 / D1), spec §11–§13 + §12 + §16 + §17, and confirm the merged Tier-C state (tag `tier-c-transactions-complete`). Runs sequentially on the integration branch (cross-cutting + deletes the old route).

> **STATUS: rev 4 — DECISIONS LOCKED + TWO expert-panel passes applied (2026-06-05).** rev 1→2 fixed the CSV-oracle + "referrers already repointed" errors; rev 3 locked the user's decisions (all defaults + no-back-compat D4 override); **rev 4 applies a 2nd confirmation panel's verified findings** (export can't import the private `resolveOrderBy`; ~14 live e2e specs hard-navigate the old route; the export endpoint must NOT live under the deleted route group; `currency` already projected; CTA label collision). All findings were code-verified. **The plan is now considered bulletproof** — the residual is a tiny, mechanical D3 sub-choice (axe ruleset scope) defaulted below. Ready to execute.

**Goal:** Per-tab CSV export of the active filtered list (byte-parity with the shipped `transactions.csv`), finish empty/error/loading states, complete the a11y pass, and SAFELY retire the old `/app/transactions` surface (repoint internal nav → migrate the e2e specs → delete; NO redirect shim, pre-launch).

**Architecture:** The export calls the per-tab `listXPage` directly via a **new no-pagination path** (`limit: 'all'`) — so WHERE + ORDER (resolveOrderBy) + projection + the Einnahmen invoice-LATERAL join are the SINGLE source of truth and CSV-rows == screen-rows by construction (no re-implementing the private sort helper). A shared `export/csv-util.ts` (extracted from the existing duplicated cells, reused by the shipped `transactions.csv` route too) guarantees byte-parity. The endpoint lives at `/app/{ausgaben,einnahmen,spenden}/export` (NOT under the doomed `transactions/` group). States + a11y are component work on the shipped kit. Retirement = repoint internal referrers + migrate the e2e specs, gated by a `src/`+`tests/` grep, then delete.

**Tech Stack:** SvelteKit (`+server.ts` streaming a `Uint8Array` so the BOM survives), Drizzle, Vitest (fast: CSV/format/injection; reset: streamed-rows integration), existing `export/` conventions.

---

## Established facts (VERIFIED by two review panels against the codebase — do NOT re-derive)

- **CSV parity ORACLE = the shipped `routes/app/jahresabschluss/[year]/transactions.csv/+server.ts`.** EXACT 11-col header: `Datum;Buchung-Nr;Bezeichnung;Art;Sphäre (Snapshot);Sphäre (Effektiv);Kategorie;Betrag (EUR);Betrag (Cent);Währung;Festgeschrieben am`. Formatting: cents → `(c/100).toFixed(2).replace('.', ',')` ⇒ `1234,56` **no thousands sep**; raw `gebuchtAm` for Datum; `;` delimiter; UTF-8 **BOM**; `csvCell` quotes `;"\r\n`. **Do NOT use spendenliste's `toLocaleString` (`1.234,56`).**
- **Projection reality (corrects rev-1/2):** `currency` is ALREADY projected on all three tabs (`BaseTxRow`; listAusgabenPage:549, Einnahmen:645, Spenden:725) → NO query change for Währung. `sphereEffective` is NOT stored: only **`listAusgabenPage` adds `sphereOverride`** (expenses is the SOLE table with `sphere_override`) and emits `sphereEffective = sphereOverride ?? sphereSnapshot`; Einnahmen/Spenden `Effektiv == Snapshot` (zero query change).
- **`resolveOrderBy` is module-private (transactions.ts:443) and the per-tab sort whitelists are inline literals inside `listXPage`** — NOT importable. → the export reuses them by calling `listXPage` (see Architecture / Task 2), not by importing the helper.
- **`csvCell` is duplicated in 5 places** (`export/{spendenliste-csv,beleg-index,anlage-gem-csv,bundle}.ts` + the `transactions.csv` route), differing in null/cents handling. Factor `csv-util.ts`; migrate at least the `transactions.csv` route + the new export to it (characterization-test each before refactor).
- **`/app` is session-gated, NOT role-gated** (hooks.server.ts redirect). Endpoint = "session-gated like the existing transactions.csv route" — invent no role check.
- **Old-route LIVE referrers (repoint FIRST — grep-verified in BOTH `src/` AND `tests/`):**
  - `src/`: `FabBottomSheet.svelte:56/63/70` (global create-FAB, the PRIMARY create entry), `projects/ProjectCtaRail.svelte:24/31`, dashboard `CashflowOverviewSection.svelte:62` + `ChecklistSection.svelte:60`, `jahresabschluss/BuchungslisteTab.svelte:94/219`, `SpendenTab.svelte:169/186`, `inbox/[ausId]/+page.svelte:99` (`goto`), `transaction-kind-url.ts:65`, `eur/index.ts:269/289/400` (fixHrefs — incl. `:400 /app/transactions/neu`), and dead fallbacks `detailHref ?? /app/transactions/${id}` in `TransactionRow.svelte:17` + `TransactionCardMobile.svelte:66`.
  - `tests/` (e2e — MUST migrate, not "selector-tune"): `transactions.spec.ts:14/70/121`, `c7-desktop-transactions-list.spec.ts:65`, `c7-mobile-iphone12.spec.ts`, `dashboard.spec.ts:73` (asserts `a[href="/app/transactions"]`), `prod-bug-regressions-2026-05-20.spec.ts:116-117` (POST `/app/transactions/neu?/create`) + `:52/:90` (`/app/transactions/spenden`), plus c1-prj-a, c2-tax-required-gates, c3-disc, b1-invoice-effect-loop, dashboard-cashflow, julia-review, spenden, phase-6-spenden.
  - `pnpm check` catches ONLY TS imports — string URLs (href/goto/fixHref/spec navigations) need the grep gate.
- **`spende.created` is DEAD → safe to delete** (handler spenden.ts:354-355; only `donation.created` is emitted, transactions.ts:1349). **`spende.edited` is NOT dead** (live emitter spenden.ts:510) — leave it; remove ONLY `spende.created`.
- **Old `transactions/+page.server.ts` now has ONLY `?/markAsPaid`** (bulk/SEPA moved to `ausgaben/` in Phase 4). `TransactionRow.svelte` (component) is rendered ONLY by the to-be-deleted `TransactionsList.svelte` (the live scaffold uses the TransactionRow TYPE + `TransactionCardMobile`) → component deletion is safe after the referrer sweep.
- **Phase 7 (§11 BelegViewer + DetailModalShell + Festschreibung read-only) shipped inside Tier C** — no separate phase-7 artifact.

---

## Decisions (LOCKED — user accepted all defaults + the D4 override, 2026-06-05)

- **D1 — strict parity.** All tabs emit the identical 11-col header. Only `listAusgabenPage` gains `sphereOverride` (above); `currency` already present. **Parity test:** an expense WITH a `sphere_override` emits `Sphäre (Snapshot) ≠ Sphäre (Effektiv)` matching the oracle.
- **D1b — column contract.** Cols 1-11 byte-identical across all tabs; **col 12 `Bescheinigung` (Nr. / "ausstehend") is Spenden-ONLY**, appended after the 11. Beleg presence → **`ja`/`nein` from `belegFileId` presence** (NOT filename — no files-table join is budgeted). Filter-only fields (Status, Rechnung-link, belegFehlt) narrow WHICH rows export but are NOT columns. Test: Ausgaben/Einnahmen header = exactly 11 cols; Spenden = 11 + Bescheinigung.
- **D2 — convenience CSV only** (GoBD/DATEV stay in the existing `export/` module).
- **D3 — WCAG 2.1 AA on the new transaction surfaces.** Must-have gate = unit/keyboard assertions. axe: **add `@axe-core/playwright` (new dep — accepted) as ONE `@phase-8` e2e per tab, with `color-contrast` excluded** (shipped palette tokens) so it's not a flaky launch-blocker. (If the dep is unwanted at execution time, downgrade to a single best-effort axe smoke; unit/keyboard remain the gate.)
- **D4 — full deletion, NO back-compat** (pre-launch): repoint internal referrers + migrate e2e specs, then DELETE the entire `routes/app/transactions/` group; `/app/transactions` 404s. No redirect shim.
- **D5 — Q5 extras out of scope** (print stylesheet, bulk-Beleg export, saved presets — YAGNI).
- **D6 — filename `<tab>-<year|alle>-<yyyy-mm-dd>.csv`; NO row cap** (intentional, accepted divergence from the oracle's `limit:2000` — parity = per-row format, not row-count); **disable the export CTA on a zero-result filter** (no silent header-only download).

---

## Tasks (per-task TDD: failing test → run → implement → run → commit)

### Task 1 — `export/csv-util.ts` + per-tab formatter (byte-parity)

Create `csv-util.ts` (`csvCell` with **formula-injection neutralization** [leading `=+-@`, tab, CR → prefix `'`] + `formatCents`→`1234,56` + BOM helper), extracted from the `transactions.csv` route + `spendenliste-csv.ts` (characterization-test current bytes FIRST, then migrate). Create `export/transactions-csv.ts` (`buildTransactionsCsv(rows, tab)`: 11 cols + Spenden-only col 12). **Tests (fast):** exact header (11 vs 11+Bescheinigung per tab); BOM; `;`+CRLF; injection (`=1+1`/`@SUM`/`-2`/leading-tab); unicode round-trip (`Müller; "Sonder"\nÄ€🎉`); cents `1234,56` no-sep; byte-match vs the shipped `transactions.csv` for a shared row.

### Task 2 — Export endpoint via a no-pagination `listXPage` path

Add `limit: 'all'` (or `null`) support to `listAusgabenPage/Einnahmen/SpendenPage` (skip LIMIT/OFFSET; keep WHERE+resolveOrderBy+projection+LATERAL) + add `sphereOverride`→`sphereEffective` to listAusgabenPage. Create `routes/app/{ausgaben,einnahmen,spenden}/export/+server.ts` (GET; session-gated; `parseFilterState` + `?sort`/`?dir` → `listXPage({…, limit:'all'})` → `buildTransactionsCsv`; stream a `Uint8Array`; `Content-Type: text/csv; charset=utf-8`; `Content-Disposition: attachment; filename="<tab>-<year|alle>-<date>.csv"`). **NOT** under `transactions/` (that group is deleted in T6). **Tests (reset):** rows == filtered query; a filter narrows; a non-default `?sort` reorders; first 3 bytes = `EF BB BF`. Note: point-in-time read-only snapshot, not festschreibung-gated.

### Task 3 — Export CTA per tab

Scaffold header control linking to `/app/<tab>/export?<current $page.url.searchParams>`; **label "Gefilterte Liste als CSV"** (NEVER bare "CSV exportieren" — collides with the EÜR Übersicht year button `UebersichtTab.svelte:78`); tooltip notes "full filtered+sorted set across ALL pages"; **disabled at `total===0`**; pending state while streaming; ≥44px. Test: CTA carries the active query string + disabled-on-empty.

### Task 4 — Empty / error / loading states

Confirm UX-04 empty states (scaffold, done). **Loading** where latency is: export CTA (pending) + BelegViewer pdfjs render (spinner); any list skeleton gates on the `navigating` store (NOT a wall-clock race). **Error:** verify whether `routes/app/+error.svelte` exists before inventing; inline action-failure toasts (`ui/sonner`) on entry/detail. Tests: gated skeleton + an action-failure render.

### Task 5 — a11y (verify-don't-rebuild)

**Chips DONE** — `MultiselectChip` already has Backspace/Delete→remove, `aria-label …entfernen`, ≥44px (and chips are desktop-only: `FilterBar:462 hidden sm:flex`). Spend the budget on the GENUINELY-open items: the `<select>` mobile-sort + the "+ Filter" Sheet keyboard/SR flow, popover/combobox focus management under SR, and confirming `aria-live="polite"` filter-count (FilterBar:398) fires on change. Verify sort `<button>` headers are Enter/Space-operable + focus-visible (`aria-sort` present). Tap-target sweep: viewer controls, card chevrons, sort headers, pagination (or note the A3 Pagination primitive already ships ≥44px/focus). Truncation-with-tooltip on long Bezeichnung/names. Tests: `fireEvent.keyDown` per interaction; (D3) one scoped axe e2e per tab.

### Task 6 — Old-route retirement (repoint-FIRST, grep-gated `src/`+`tests/`, then delete)

**Step A — enumerate:** `ls -R routes/app/transactions` + `grep -rn "/app/transactions" src/ tests/`. Re-confirm `/app/transactions/spenden` is gone (a test references it).
**Step B — repoint `src/`:** FAB + ProjectCtaRail + dashboard + Buchungsliste/SpendenTab + inbox `goto` + `transaction-kind-url.ts` → `kind → /app/{ausgaben|einnahmen|spenden}/{neu|<id>}`; remove the dead `detailHref ?? /app/transactions/${id}` fallbacks (or make `detailHref` required). **EÜR translation:** `eur/index.ts` `?beleg=missing` → `belegFehlt=true` (DOCUMENT the delta: `belegFehlt = isNull(belegFileId) AND isNull(belegVerzichtGrund)` EXCLUDES documented Beleg-Verzicht rows, so fewer rows than the EÜR "ohne Beleg-Datei" count); `?kategorie=missing` → the **`Unkategorisiert (Import)` sentinel-category** filter (post-§4.6 kategorie_id is NOT NULL, so a synthetic "ohne Kategorie" filter would be permanently empty) OR drop that EÜR line; repoint `:400`.
**Step C — migrate `tests/`:** for each of the ~14 e2e specs hard-navigating the old route, repoint to the per-tab route / rewrite the assertion / delete the now-invalid behavior test (e.g. `prod-bug-regressions:116-117` POST `/neu?/create` guards a regression that no longer exists at that URL — move it to the per-tab create or retire it consciously).
**Gate:** `grep -rn "/app/transactions/\(neu\|\[\)" src/ tests/` returns zero (excluding the `export/` endpoints + intentional comments) BEFORE deletion.
**Step D — delete:** `TransactionsList.svelte` (+ its `@phase-7` test), the ENTIRE `routes/app/transactions/` group (`+page.svelte`, `+page.server.ts` incl. its remaining `?/markAsPaid` action, `[id]/`, `neu/`) — `/app/transactions` 404s (fine pre-launch). Remove the dead `bus.on('spende.created')` handler + its `events/types.ts` entry (NOT `spende.edited`). `pnpm check` sweeps TS-import fallout. **Test:** a created donation still writes exactly ONE `donation.created` audit row; no dangling import or `/app/transactions/{neu,[id]}` referrer remains in `src/` or `tests/`.

### Task 7 — Phase-boundary verification + the deferred Tier-C e2e

- [ ] Pure: `pnpm test:fast --run tests/unit/transactions-csv.test.ts`
- [ ] DB/route/component: export integration + a11y/state component tests + broad transactions regression.
- [ ] **§16 downstream reflection:** confirm the existing `@phase-4/5/6` e2e already asserts EÜR/dashboard reflection of a new booking; if not, add a `@phase-8` assertion (create income/donation → `computeEurYear` picks it up).
- [ ] **e2e — FULL run, not just `@phase-…` greps** (the migrated specs are untagged): `pnpm build && pnpm test:e2e` (or at least the migrated-spec set + `@phase-8`), tuning selectors + adding the export-download + scoped-axe e2e. Time-box; triage app-bug vs test-tuning.
- [ ] `pnpm check && pnpm lint`.
- [ ] Tag `phase-8-exports-polish-complete` → transactions redesign implementation-complete (pending the reviewed-by-opus merge gate to `main`).

---

## Self-Review

1. **Spec coverage:** §12 CSV (T1–T3, byte-parity oracle) ✓; §16 downstream reflection (T7) ✓; §11/§13 states + a11y (T4/T5, verify-don't-rebuild) ✓; ROADMAP D1 ✓; retirement (T6, repoint+migrate-tests+delete) ✓.
2. **Two-panel fixes applied (rev 4):** export-via-listXPage (not the private resolveOrderBy); export endpoint OUTSIDE the deleted group; `tests/` in the grep gate + e2e migration; `currency` already projected (only Ausgaben `sphereOverride`); CTA label collision; Beleg `ja/nein`; sentinel-kategorie translation + belegFehlt delta; `spende.edited` preserved; markAsPaid-only old action; no-cap = conscious divergence.
3. **Highest risk:** T6 (repoint ~10 `src` referrers + migrate ~14 e2e specs before deletion — grep-gated) and T7 full-e2e tuning (time-boxed).
4. **Residual decision:** D3 axe ruleset scope (defaulted: `@axe-core/playwright`, color-contrast excluded) — the only non-frozen knob, mechanical.
