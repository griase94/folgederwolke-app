# Money & Business Review — folgederwolke-app

**Date:** 2026-05-19
**Reviewer:** Senior financial-software / German-tax / Verein-accounting correctness review
**Scope:** Cents arithmetic, USt, Zuwendungsbestätigung (BMF Muster), EÜR, SEPA pain.001,
Festschreibung, bezahlt_von, ID-Allocator, member roster, Auslagen, importer, rounding.

---

## TL;DR

**This app must not issue a real Zuwendungsbestätigung or push a real SEPA file
in its current state.** It produces artifacts that look right on screen but
contain at least four CRIT_LEGAL_RISK defects any Betriebsprüfer will flag on
the first pass:

1. The Bescheinigung PDF carries no §50 Abs. 2 EStDV "maschinell erstellt"-Hinweis
   and an empty signature line — it is neither a valid signed Bescheinigung
   nor a valid maschinell erstellte one, so it cannot ground a Spenden-Abzug
   for the donor.
2. The Bescheinigung renders verbatim BMF wording but transliterates every
   umlaut ("Bestaetigung ueber" instead of "Bestätigung über") even though
   pdf-lib's WinAnsi supports them. The BMF Muster wording is the
   pattern-match key for tax-office acceptance.
3. SEPA generator emits the obsolete **pain.001.001.03** schema; German banks
   have moved to **pain.001.001.09** since November 2023 and many production
   institutions now reject `.03`. The generated XML also has float-derived
   amount/control-sum strings (precision loss above 90 trillion cents but more
   importantly: every cents→euro conversion runs through `Number()`).
4. The "WGB-Freigrenze (§19 UStG)" dashboard widget conflates §19 UStG
   (Kleinunternehmer, € 25.000/€ 100.000 limits since 2025) with §64 Abs. 3 AO
   (Wirtschaftlicher Geschäftsbetrieb Besteuerungs-Freigrenze, now €50.000
   since 2025-01-01 — but the widget shows €45.000). The Vorstand is being
   told a non-existent rule and will make the wrong call when revenue
   approaches the threshold.

In addition, the importer, EÜR PDF, GoBD-Z3 export, and Festschreibung enforcement
have HIGH-severity defects (no DB-level immutability trigger, float-coerced
Number() everywhere, fake Z3 schema, Sammelbestätigung is in the enum but
never implemented).

**Verdict:** The cents-storage discipline and the schema design (ADR-0001..0010)
are strong. The pure-domain code is testable and the domain ID-allocator is
concurrency-safe. But the **last 10%** — the legally-loaded artifacts
(Bescheinigung, SEPA, invoice, EÜR PDF) — has shortcuts that defeat the
careful work in the lower layers. **Do not push this to a Verein producing
real Zuwendungsbestätigungen until at least the CRIT and HIGH items below are
fixed.**

---

## Severity tally

| Severity        | Count  |
| --------------- | ------ |
| CRIT_LEGAL_RISK | 5      |
| HIGH            | 11     |
| MED             | 8      |
| LOW             | 4      |
| **Total**       | **28** |

---

## Top 5 legal/financial risks

1. **F-01 — Bescheinigung PDF has neither signature nor §50 EStDV machine-signed Hinweis.** Every Zuwendungsbestätigung the app produces today is invalid for the donor's Einkommensteuer-Erklärung.
2. **F-02 — `maskOrtFromAdresse()` mangles the BMF Pflichttext.** With a multi-line `VEREIN_ADRESSE` the receipt reads "Finanzamts Westermuehlstrasse 6\n80469 Muenchen, StNr. ..." — pattern-mismatch the Finanzamt rejects.
3. **F-04 — SEPA generator emits pain.001.001.03 and uses float arithmetic for CtrlSum/InstdAmt.** Banks may reject the file; control-sum may drift on large batches.
4. **F-10 — Festschreibung is enforced only at the application layer.** ADR-0006 explicitly defers the DB trigger to Phase 7.5. Today, any direct DB write, importer bug, raw `db.update()`, or future code path can mutate a festgeschriebene row — breaking GoBD § 146 immutability.
5. **F-12 — WGB/Kleinunternehmer thresholds wrong AND conflated.** §19 UStG and §64 Abs. 3 AO are different rules with different limits; the dashboard says "Freigrenze 45.000 € (§ 19 UStG)" — both numbers and Paragraph are incorrect for 2025/2026.

---

## Findings (CRIT_LEGAL_RISK → HIGH → MED → LOW)

### CRIT_LEGAL_RISK

#### F-01 — Bescheinigung has empty signature line AND no "maschinell erstellt" Hinweis

- **Where:** `src/lib/server/pdf/templates/bescheinigung-template.ts:319-332`
- **Observation:** The template draws an empty signature line and labels it
  "Unterschrift / Stempel der empfangsberechtigten Koerperschaft", then ends.
  No qualifizierte elektronische Signatur is applied, no graphic of the
  Vorstands-Signatur is embedded, and the PDF carries no §50 Abs. 2 Satz 1
  Nr. 1 EStDV "Diese Zuwendungsbestätigung wurde maschinell erstellt und ist
  auch ohne Unterschrift gültig" Hinweis.
- **Legal reference:** §50 Abs. 2 EStDV (in der Fassung seit 2017) — eine
  Zuwendungsbestätigung MUSS entweder eine Unterschrift einer
  zeichnungsberechtigten Person tragen ODER unter den Voraussetzungen einer
  maschinellen Erstellung den genannten Hinweis sowie eine vorherige
  Anzeige beim zuständigen Finanzamt umfassen.
- **Risk:** The donor's tax authority can disallow the Spenden-Abzug. The
  Verein faces Haftung nach § 10b Abs. 4 EStG i.V.m. § 9 Abs. 3 KStG.
- **Fix:** EITHER (a) embed a PNG of the Vorstands-Unterschrift loaded from
  Drive + a hidden audit hash, OR (b) ADD the verbatim Hinweis text + persist
  proof-of-Anzeige in `settings.bescheinigung_maschinell_anzeige_datum`.
  Reject Bescheinigungs-Generierung when neither is configured.

#### F-02 — `maskOrtFromAdresse()` corrupts the BMF Pflichttext

- **Where:** `src/lib/server/pdf/templates/bescheinigung-template.ts:187-191`
- **Observation:**
  ```ts
  function maskOrtFromAdresse(adr: string): string {
    const parts = adr.split(",").map((s) => s.trim());
    const last = parts[parts.length - 1] ?? adr;
    return last.replace(/^\d{4,5}\s+/, "").trim() || adr;
  }
  ```
  Called as `Finanzamt ${maskOrtFromAdresse(p.vereinAdresse)}, StNr. ...`.
  `VEREIN_ADRESSE` is a multi-line string (the invoice template splits on
  `\n` — `invoice-template.ts:204`); a value like
  `"Westermuehlstrasse 6\n80469 Muenchen"` has zero commas, so `parts.length===1`
  and `last` = the whole string. Output:
  `"Finanzamt Westermuehlstrasse 6\n80469 Muenchen, StNr. ..."` — also drops
  a literal newline into the rendered run, which pdf-lib then prints as a
  glyph or breaks the line mid-sentence.
- **Legal reference:** BMF Muster Vordruck "Bestätigung über Geldzuwendungen /
  Mitgliedsbeiträge" (IV C 4 - S 2223), Pflichttext: "Wir sind wegen Förderung
  ... nach dem letzten uns zugegangenen Freistellungsbescheid ... des
  Finanzamts **München**, StNr. ..." — i.e., the place-of-the-Finanzamt only.
- **Risk:** Pattern mismatch with the BMF Muster — auditors reject Bescheinigungen
  whose Pflichttext doesn't follow the Muster verbatim.
- **Fix:** Split `VEREIN_ADRESSE` on newlines first, take the last line,
  strip the PLZ. Better: add a dedicated `VEREIN_FINANZAMT_ORT` env var
  (e.g. `"München"`) and use it directly. No string-parsing in the renderer.

#### F-03 — Default value for `VEREIN_STEUERBEGUENSTIGTE_ZWECKE` ships FdW-specific wording

- **Where:** `src/lib/server/env.ts:76-80`
- **Observation:**
  ```ts
  VEREIN_STEUERBEGUENSTIGTE_ZWECKE: z
    .string()
    .default("Förderung der Kunst und Kultur sowie der Heimatpflege und Heimatkunde"),
  ```
  If a Verein deploys without overriding this env var, every Bescheinigung
  carries FdW's Zwecke verbatim — which (a) is wrong for other Vereine, and
  (b) for FdW could disagree with their actual Bescheid if the Zwecke list
  changes.
- **Legal reference:** §50 Abs. 1 EStDV — die "Bezeichnung der nach der Satzung
  oder Stiftung steuerbegünstigten Zwecke" muss DEM AKTUELLEN BESCHEID
  ENTSPRECHEN. A mismatch is a Bescheinigungs-Fehler.
- **Risk:** Issuing a Bescheinigung with Zwecke that don't match the
  Freistellungsbescheid voids the Spenden-Abzug.
- **Fix:** Remove the default. Validate at startup that the env var is set
  before the app boots in production (`requireEnv("VEREIN_STEUERBEGUENSTIGTE_ZWECKE")`).

#### F-04 — SEPA generator emits pain.001.001.03 (obsolete) and uses float arithmetic

- **Where:** `src/lib/server/sepa/xml.ts:189, 284-286`
- **Observation:**
  - Schema URI: `urn:iso:std:iso:20022:tech:xsd:pain.001.001.03`. The 2019
    EBA SEPA Rulebook moved European banks to `pain.001.001.09`, and most
    German banks (incl. Sparkasse, Commerzbank, ING, DKB) accept ONLY .09
    as of November 2023. Some still accept .03 for legacy retail
    submitters, but corporate-side submissions are typically rejected.
  - `centsToEurStr(cents: number): (cents / 100).toFixed(2)` — once SEPA
    inputs go through `buildSepaInputs` (xml.ts:73), `betragCents` is
    already typed as `number` (xml.ts:28), so every amount in the XML
    derives from a float division.
  - `transactions.reduce((s, t) => s + t.betragCents, 0)` (xml.ts:122) sums
    `number` cents. With 50+ rows summing to seven-figure cents the running
    sum is safe in IEEE-754 but the precision-correctness is by accident,
    not design.
  - `CtrlSum` and per-tx `InstdAmt` are then formatted from those floats.
    A single .005 €-rounding glitch fails the bank-side CtrlSum check and
    the entire batch is rejected.
- **Legal/business reference:** EBA SEPA Rulebook v1.0 (2023), German Banks'
  CGI-MP profile, DK SEPA-Akzeptanzanforderungen.
- **Risk:** SEPA XML is silently rejected by the bank → Erstattung
  never happens → Mitglieder/Externe stay out of pocket and lose trust;
  worse, the app marks expenses `erstattet` (via the `sepa-mark-erstattet`
  action) BEFORE confirming the bank accepted. The audit trail then claims
  Erstattung that did not occur.
- **Fix:**
  - Upgrade generator to pain.001.001.09 (verify schemaLocation URN +
    re-validate against the v.09 XSD). Keep .03 path available behind a
    settings flag for legacy testing.
  - Convert all SEPA cent arithmetic to `bigint`. The conversion to a
    "1234.56" string must be done by integer-divmod, e.g.
    `(c/100n).toString() + "." + (c%100n).toString().padStart(2,"0")`.
  - Move `betragCents` typing in `SepaTransactionInput` and `ApprovedExpense`
    to `bigint`. Database is already `bigint`; the `Number(r.betragCents)`
    coercions throughout `transactions.ts` defeat the cents-only invariant.

#### F-05 — Festschreibung is enforced only at the application layer (no DB trigger)

- **Where:** `docs/adr/0006-festschreibung.md:27-30`; `drizzle/0000_init.sql:589+`
  (close_buchhaltungsjahr) — no UPDATE-blocking trigger anywhere in `drizzle/`.
- **Observation:** ADR-0006 explicitly defers the row-level UPDATE trigger
  to "Phase 7.5". Today, only the domain layer guards (`fetchFestgeschriebenBis()`
  in `members-actions.ts:200`, `invoices.ts:155`, `transactions.ts:773`,
  `audit-inbox-actions.ts:174`). The four guards even differ slightly:
  - `members-actions` parses `value` JSON; `invoices` strips quotes; both
    handle `string` and `number` separately, with no shared helper. Easy
    to drift.
  - `markExpenseErstattet` derives the year from `berlinYear(expense.gebuchtAm)`
    — but a Storno row's gebucht_am is the CORRECTION'S own date (per
    ADR-0006:33-43), so a Storno for a 2024 row created in 2026 doesn't
    hit the 2024 Festschreibung gate. That's actually correct per ADR,
    but reviewer-confusing.
  - `editSpende` (`spenden.ts:445`) checks `existing[0].festgeschriebenAt`
    instead of looking up `festgeschrieben_bis`. Inconsistent — if a year
    closed by hand-setting `festgeschrieben_bis` to 2025 without running
    `close_buchhaltungsjahr(2025)`, the donations themselves still have
    NULL `festgeschriebenAt` and the gate passes. Two source-of-truth.
- **Legal reference:** GoBD § 146 (Unveränderbarkeit der Buchung post-Festschreibung);
  HGB § 239 by analogy. The Betriebsprüfer expects DB-level guarantees,
  not "the application checks".
- **Risk:** Any code path that bypasses the domain layer (raw db call, a
  cron task, the importer running for a closed year due to a bug, a future
  migration script) can silently mutate a closed year. A subsequent
  Betriebsprüfung that detects a post-Festschreibung edit voids the
  GoBD-Einhaltung claim for that year and can escalate to a Schätzung
  (§ 162 AO).
- **Fix (priority):**
  - Ship the trigger NOW, before any year is closed in production. Block
    UPDATE/DELETE on any row where `festgeschrieben_at IS NOT NULL` (allow
    only `id`, `created_at` immutable already; reject all monetary,
    date, narrative columns). Storno rows are NEW INSERTS so they're not
    blocked by an UPDATE trigger.
  - Centralise the gate to ONE helper (`assertNotFestgeschrieben(year)`)
    consumed by every write path.
  - Add a CHECK that `festgeschrieben_at IS NULL OR festgeschrieben_by_user_id IS NOT NULL`
    so an honest write can't strand a half-closed row.

---

### HIGH

#### F-06 — Bescheinigung transliterates umlauts despite WinAnsi supporting them

- **Where:** `src/lib/server/pdf/templates/bescheinigung-template.ts` (entire file: "Bestaetigung ueber", "Foerderung", "Koerperschaft", etc.)
- **Observation:** pdf-lib's `StandardFonts.Helvetica` uses WinAnsi encoding,
  which natively encodes ä/ö/ü/Ä/Ö/Ü/ß. The umlaut workaround was correct
  for AcroForm-flattened PDF/A-1 but is unnecessary here. The BMF Muster
  uses the standard German orthography ("Bestätigung über").
- **Legal reference:** BMF Muster Vordruck IV C 4 - S 2223/19/10004 (and
  predecessors); the Pflichttext is given with umlauts and Finanzämter
  pattern-match accordingly.
- **Risk:** Auditor flags it as a non-Muster Bescheinigung. The Verein
  must reissue.
- **Fix:** Replace transliterations with proper German throughout
  `bescheinigung-template.ts`. Unit-test by widthOfTextAtSize on a long
  umlaut-bearing line.

#### F-07 — `betragInWorten` corner: large amounts lose precision via `Number(bigint)`

- **Where:** `src/lib/server/domain/spenden.ts:839-857`
- **Observation:** `betragInWorten(cents: bigint | number)` coerces to
  Number for arithmetic (`Number(cents)`, `Math.floor(abs/100)`, etc.).
  Above 2^53 cents (~€90 trillion) precision dies. For a Verein this is
  not a hot risk, BUT the same Number-coercion pattern repeats in
  `eur.ts:formatEurCents`, `eur-pdf.ts:drawAmountRight`,
  `gobd-z3.ts:eurAmount`, `invoice.ts:loadRenderInput:511-516`, etc. The
  cents-only invariant from ADR-0003 is repeatedly defeated at the
  presentation/integration boundary.
- **Risk:** A single-row Verein won't trip on €90T but: aggregating across
  many years for IDEA-Z3 export or running a Spenden-Sammelbestätigung on
  decades of corpus could. More importantly: the discipline is broken —
  any future feature that relies on bigint precision (FX, multi-currency,
  multi-Verein consolidation) inherits a silent precision-loss bug.
- **Legal reference:** ADR-0003 ("never reverse-engineer cents from euro").
- **Fix:** Add `formatCentsAsEuroBigint(cents: bigint): string` doing pure
  integer math (already done in `money.ts:42-50`). Replace every
  `Number(betragCents)/100` with a call to this helper. Lint rule:
  forbid `Number(.*[Cc]ents)` in `src/lib/server/`.

#### F-08 — `formatEurCents` in eur.ts uses float division (precision loss path)

- **Where:** `src/lib/server/domain/eur.ts:198-206`
- **Observation:**
  ```ts
  export function formatEurCents(cents: bigint | number): string {
    const n = typeof cents === "bigint" ? Number(cents) : cents;
    return (n / 100).toLocaleString(...);
  }
  ```
  Same defect as F-07 but at the heart of EÜR display: every row in the
  EÜR PDF, dashboard cards, jahresabschluss summary runs through this.
- **Fix:** Use `formatCentsAsEuro` from `$lib/domain/money.ts:42`. It already
  does integer math.

#### F-09 — `centsToEurStr` in SEPA is the same defect

- **Where:** `src/lib/server/sepa/xml.ts:284-286`
- **Observation:** `(cents / 100).toFixed(2)` against an upstream
  `betragCents: number` channel. Plus the upstream sum is also a float.
- **Fix:** As F-04.

#### F-10 — `isYearClosed` does not check `invoices`

- **Where:** `src/lib/server/domain/jahresabschluss.ts:54-65`
- **Observation:** `isYearClosed(year)` sums open rows across `expenses`,
  `income`, `donations` only. `invoices` is omitted. After running
  `close_buchhaltungsjahr(year)` the function correctly returns true if
  invoices were closed (since the close function flips all four tables —
  see `drizzle/0000_init.sql:601+`), BUT a hand-written `UPDATE settings
SET value = 2024 WHERE key='festgeschrieben_bis'` without invoking the
  close function leaves invoice rows un-flipped, and `isYearClosed`
  silently returns true.
- **Risk:** Dashboard shows a closed year that still has mutable invoice
  rows.
- **Fix:** Add `(SELECT count(*) FROM invoices WHERE year_of_buchung = ${year}
AND festgeschrieben_at IS NULL)` to the union.

#### F-11 — `transformLegacySheet` uses `gebuchtAm.getFullYear()` (server local TZ, not Berlin)

- **Where:** `src/lib/server/import/transform.ts:218, 225, 233, 360, 540, 665`
- **Observation:** The transform's year-consistency check derives the year
  via JS `Date.getFullYear()`. `parseGermanDate()` constructs dates with
  local TZ semantics (`new Date(yyyy, mm-1, dd, ...)`). If the server runs
  in UTC (Vercel default), a row with "31.12.2025 23:30" parses to
  `Date(2025, 11, 31, 23, 30, 0)` in JS local TZ = `2025-12-31 23:30 UTC` =
  `2026-01-01 00:30 Berlin`. The DB-side `year_for_booking()` returns
  2026 (Berlin TZ); the JS-side check used `2025`. Insert fails the
  year-consistency CHECK constraint.
- **Risk:** Importer rejects valid sheet rows for spurious year mismatches,
  OR (worse) accepts them on a server in a German-local TZ and inserts
  rows where `business_id` says one year and `year_of_buchung` says another.
  Because the CHECK constraint runs server-side, it'd still catch this
  before commit — but if the constraint is ever briefly disabled (a
  migration, a hotfix) silently wrong rows land. Pure-TS year derivation
  should match the SQL.
- **Fix:** Use the existing `yearForBooking()` mirror from
  `src/lib/domain/year.ts:18` everywhere in the importer. Or
  better: pass an ISO date string with Berlin-TZ to the DB and let the
  DB do the year derivation in one place.

#### F-12 — WGB Freigrenze widget conflates §19 UStG and §64 AO

- **Where:** `src/lib/components/admin/dashboard/WGBWidget.svelte:1-108`,
  `src/lib/server/export/eur-pdf.ts:274`
- **Observation:**
  - Widget header: "WGB-Freigrenze {year} (§19 UStG)" with bar capped at
    €45.000. WGB means "Wirtschaftlicher Geschäftsbetrieb", which is
    governed by §64 Abs. 3 AO — NOT §19 UStG. §19 UStG governs the
    Kleinunternehmer-Regelung (Vorjahresumsatz ≤ €25.000, laufendes Jahr
    ≤ €100.000 ab 2025-01-01; prior to 2025: €22.000/€50.000).
  - §64 Abs. 3 AO Freigrenze WAS €45.000 brutto; **JStG 2024 raised it
    to €50.000** effective 2025-01-01. The widget still uses 45.000.
  - EÜR-PDF (`eur-pdf.ts:274`) says "Freigrenze 50.000 € (§ 64 AO ab 2026)"
    — wrong: it's "ab 2025-01-01", and 2026 is irrelevant to the
    change date.
- **Legal reference:** §19 UStG (in der Fassung des Wachstumschancengesetzes
  vom 27.03.2024); §64 Abs. 3 AO (in der Fassung des JStG 2024 vom
  02.12.2024); BMF-Schreiben zum §64 AO Freigrenze.
- **Risk:** Vorstand makes wrong call: thinks the §19-UStG limit is
  €45.000 (it never was). If revenue crosses €25.000/€100.000 the Verein
  becomes USt-pflichtig from year+1 / immediately respectively; the app
  has zero logic to detect this transition.
- **Fix:**
  - Rename widget "Freigrenze § 64 Abs. 3 AO" with €50.000 cap.
  - Add a separate "Kleinunternehmer § 19 UStG" widget tracking BOTH
    Vorjahresumsatz (€25.000) and laufendes Jahr (€100.000) with
    distinct status colors. Surface a critical alert if either is
    exceeded.
  - Make both thresholds configurable in `settings` (`limits.wgb_freigrenze_eur`,
    `limits.kleinunternehmer_vorjahr_eur`, `limits.kleinunternehmer_laufendesjahr_eur`)
    so future law changes don't ship via redeploy.

#### F-13 — Sammelbestätigung is in the enum but unimplemented

- **Where:** `src/lib/server/db/schema/enums.ts:64` (`sammelbestaetigung` in
  `bescheidTypEnum`), no code path issues one.
- **Observation:** A Sammelbestätigung (BMF Muster "Sammelbestätigung über
  Geldzuwendungen / Mitgliedsbeiträge") is the practically-essential pattern
  for any Verein that receives multiple donations per year from the same
  donor. The schema accommodates it, the UI lists it as a select value, but
  there is no function to actually generate one. The single-Spende flow at
  `allocateBescheinigung()` (`spenden.ts:515`) issues ONE B-id per Spende.
- **Legal reference:** BMF Muster "Sammelbestätigung" (Anlage zum
  BMF-Schreiben vom 24.04.2025) — Aufstellung der Einzelzuwendungen muss
  beigefügt sein; das Gesamtjahr und die Anzahl der Zuwendungen müssen
  angegeben werden.
- **Risk:** When a Mitglied has paid 12 Mitgliedsbeiträge in a year, the
  app forces 12 separate Bescheinigungen each with its own B-id. Drift +
  Mitglieder-Frust. They will ask the Steuerberater who will ask for
  Sammelbestätigung.
- **Fix:** Implement `allocateSammelBescheinigung(memberId, year)` that:
  - Aggregates all `donations` rows for that (member, year) where
    `bescheinigung_nr IS NULL`.
  - Allocates ONE B-id (`B-{year}-{NNN}`) and writes it to ALL rows
    in one TX.
  - Generates one PDF with an Aufstellung-Anhang listing each Einzelzuwendung
    (Datum, Art, Betrag).
  - Persists in a new `donation_bescheinigungs` link table — current schema
    couples bescheinigungs-Nr to single donations row, which forbids the
    1-Bescheinigung-N-Spenden topology Sammelbestätigung needs.

#### F-14 — Invoice missing §14 Abs. 4 Nr. 6 UStG: Leistungsdatum optional

- **Where:** `src/lib/server/domain/invoices.ts:100-106` (schema accepts
  empty `leistungsDatum`); `pdf/templates/invoice-template.ts:232` (renders
  the Leistungsdatum block only when present).
- **Observation:** §14 Abs. 4 Nr. 6 UStG requires the "Zeitpunkt der
  Lieferung oder sonstigen Leistung". Section 4 of UStAE 14.5 allows
  the wording "Leistungsdatum entspricht Rechnungsdatum" iff the two
  truly coincide. The current schema permits a NULL Leistungsdatum
  without ANY substitute text — invoice PDF then simply omits the
  Leistung row.
- **Legal reference:** §14 Abs. 4 Nr. 6 UStG; UStAE 14.5 Abs. 16.
- **Risk:** Customer's USt-Abzug is gefährdet — they can demand a
  Rechnungs-Korrektur and the Verein can be liable for ihrer entgangenen
  Vorsteuer-Erstattung wenn Korrekturzeit Vorsteuer-Periode überschreitet.
  Also: a Steuerprüfer sieht "fehlende Pflichtangabe" und kann nach
  § 379 AO Bußgeld bis 5.000 € verhängen.
- **Fix:** Make `leistungsDatum` required at the schema layer. If the
  Verein truly has a Leistungs=Rechnungsdatum case, force them to enter
  the date explicitly OR auto-fill rechnungsdatum and add the wording
  "Leistungsdatum entspricht Rechnungsdatum" to the PDF.

#### F-15 — Invoice fortlaufende Rechnungsnummer can be skipped

- **Where:** `src/lib/server/domain/id-allocator.ts:30-73`
- **Observation:** The allocator does
  `UPDATE id_counters SET next_value = next_value + 1 ... RETURNING (next_value - 1)`.
  This is gapless per (year, kind). BUT: the allocator runs OUTSIDE the
  `createInvoice` transaction. If the `INSERT invoices` later fails (e.g.,
  CHECK constraint, FK violation), the counter has already incremented —
  gap in the FDW-{YYYY}-{NNN} sequence.
- **Legal reference:** §14 Abs. 4 Nr. 4 UStG ("fortlaufende Nummer"). UStAE
  14.5 Abs. 10 explicitly says "Gaps are admissible if the Verein can
  PROVE the missing numbers were not issued" — but the burden of proof
  is on the Verein.
- **Risk:** Minor: a Steuerprüfer asks "where is FDW-2026-005?" and the
  Verein must produce a `id_counters` history or audit_log showing the
  gap was caused by a failed insert. Currently no such audit trail —
  the allocator UPDATE bypasses the audit_log.
- **Fix:**
  - Move ID allocation INSIDE the createInvoice transaction (drop the
    advisory-lock pattern for inserts; rely on the row-level lock via
    `SELECT ... FOR UPDATE` on `id_counters`). Then a failed insert
    rolls back the counter increment too.
  - OR: write an audit_log entry on every counter increment (kind,
    year, claimedSeq, allocator_actor, allocator_correlation_id) so
    gaps can be explained post-hoc.

#### F-16 — `donations.spende_kind = aufwandsspende` cannot satisfy BMF Aufwandsspende ordering

- **Where:** `src/lib/server/db/schema/donations.ts:115-122`,
  `src/lib/server/mail/templates/AufwandsspendenBestaetigung.svelte` (stub),
  `src/lib/server/domain/spenden.ts:263-269` (rejects 'aufwandsspende')
- **Observation:** Aufwandsspende requires:
  1. Vorab schriftlicher Anspruch auf Aufwendungsersatz (Satzung oder
     Vertrag).
  2. Verzichtserklärung MUSS schriftlich vor der Aufwendung erfolgen
     ODER zeitnah nach dem Verzicht (laut BFH X R 32/16; im Regelfall
     binnen 3 Monaten).
  3. Verein muss zur Erstattung tatsächlich in der Lage sein
     (Liquiditätsnachweis).
  4. Der Verzicht muss "ernsthaft, klar und eindeutig" sein.
     Schema columns `aufwandsspendeVerzichtDatum` and
     `aufwandsspendeVerzichtTextSnapshot` model this but no business rule
     enforces "Verzicht BEFORE/within 3 months of the underlying expense's
     `gebucht_am`". No Satzungsverweis is captured. No `expense.id` link
     besides `aufwandsspende_aus_expense_id`.
- **Legal reference:** §10b Abs. 3 EStG, BMF-Schreiben vom 25.11.2014
  IV C 4 - S 2223/07/0010 :005, BFH X R 32/16.
- **Risk:** When Phase 2 enables this workflow, naive use will produce
  Aufwandsspende-Bescheinigungen the Finanzamt rejects retroactively.
- **Fix (before enabling):**
  - Add CHECK: `aufwandsspende_verzicht_datum <= aufwandsspende_aus_expense.gebucht_am + INTERVAL '90 days'`
    (allow some grace; BFH allows up to one year in some judgements but
    safer is 3 months).
  - Persist Satzungs-Paragraph reference at submission time.
  - Require a verified `aufwandsspende_verzicht_datum >= expense.created_at`
    for the "vorab vereinbart" pattern (a Verzicht dated BEFORE the
    Verein even booked the expense is BMF-suspicious).

---

### MED

#### F-17 — `formatBusinessId` rejects year < 2000 (importer break in 2099)

- **Where:** `src/lib/domain/business-id.ts:38-44`
- **Observation:** `year < 2000 || year > 2099`. Importer for very old
  archive material (Verein founded pre-2000) fails. Future-proofing >2099
  fine for now.
- **Fix:** Lower bound to 1990; rely on `id_counters.year` check elsewhere.

#### F-18 — `parseEuroToCents` accepts negative inputs unconditionally

- **Where:** `src/lib/domain/money.ts:26-38`
- **Observation:** Returns negative bigint for `-12,50` input. Donations,
  income, invoices CHECK `betrag_cents >= 0`, so a negative parse leaks
  to a constraint violation at the DB rather than at the form layer.
  Forms should validate sign per use case (`expenses` allow negative
  for Storno; donations/income/invoices do not).
- **Fix:** Add an optional `allowNegative` flag; defaults to false. Have
  the donations form require `allowNegative=false`.

#### F-19 — `formatEuro` in `invoice-template.ts` divides cents by 100 as float

- **Where:** `src/lib/server/pdf/templates/invoice-template.ts:52-60`
- **Observation:** `const eur = cents / 100;` where `cents: number`.
- **Risk:** Single-row invoice can hit a 1-cent rounding error on
  `999.995` → `1000.00`. Unlikely with `BigInt → Number` for sub-21-bit
  values, but the pattern is unsafe.
- **Fix:** Replace with `formatCentsAsEuro(BigInt(cents))` from money.ts.

#### F-20 — `id_counters.kind` is `text`, not enum; importer can write bogus prefix

- **Where:** `src/lib/server/db/schema/id_counters.ts:32`
- **Observation:** The comment says "text, not enum, importer-friendly".
  Importer can therefore set `kind = 'X'` (e.g., a typo) and create
  a permanent off-shelf counter row that no allocator will ever read,
  defeating the seeding logic of `seed_id_counter_from_corpus`.
- **Fix:** Add CHECK: `kind IN ('A', 'E', 'S', 'FDW', 'B', 'AUS')`.

#### F-21 — `bezahlt_von` CHECK does not require IBAN for kind=extern when status='approved'

- **Where:** ADR-0007 schema CHECK (visible from the ADR text); applied in
  `src/lib/server/db/schema/expenses.ts`.
- **Observation:** "well, `extern_name` is the hard requirement; IBAN+email
  are required for Erstattung but the form enforces that, not the DB."
  (ADR-0007:25-26). A misbehaving import or future direct-API caller can
  store an extern expense with no IBAN; the SEPA generator silently filters
  it out (`xml.ts:78-80` returns `[]`) so the Erstattung never happens but
  the audit-inbox shows it as approved/awaiting-pay. Mitglieder report a
  bug; admin can't see where.
- **Fix:**
  - Add a partial CHECK: `(bezahlt_von_kind = 'extern' AND approved_at IS NOT NULL)
=> extern_iban IS NOT NULL`. Or:
  - Refuse `approveSubmission` when the submission's `extern_iban` is empty
    and `bezahltVonKind = 'extern'`.

#### F-22 — `auslagen_submissions` allows reject after approve via concurrent calls

- **Where:** `src/lib/server/domain/audit-inbox-actions.ts:301-307`
- **Observation:** Approve checks `submission.decision === "rejected"`,
  but Reject does NOT check `decision === "approved"` or
  `approvedExpenseId IS NOT NULL`. Two concurrent admins, one clicks
  Approve (race-loser wins per A1; let's say it lands), the other clicks
  Reject (race-winner per A3 lands the flip first). Result: a row with
  `decision='approved'` AND a later `decision='rejected'` overwriting it,
  but an `approvedExpenseId` still pointing to the actually-created
  expense row. Status is inconsistent.
- **Fix:** Add `AND approved_expense_id IS NULL` to the rejectSubmission
  UPDATE WHERE clause and surface a "cannot reject an approved submission"
  error when the row count is zero AND `approved_expense_id IS NOT NULL`.

#### F-23 — GoBD-Z3 export is structurally invalid IDEA Z3

- **Where:** `src/lib/server/export/gobd-z3.ts:117-138`
- **Observation:** IDEA Z3 schema requires (1) a separate INDEX.XML
  descriptor, (2) the data file in a specific column-described layout
  (CSV-with-Schema, NOT a hand-rolled XML), (3) GOBD Datensatzbeschreibung
  with field types, lengths, and code descriptions. The current export
  produces a non-Z3 XML document with custom element names. The README
  honestly states "Schema validation against the official XSD is deferred"
  — but the export is labeled as Z3 and the Verein is given a false sense
  of compliance.
- **Legal reference:** GoBD Rz. 157-167; BMF-Schreiben vom 14.11.2014;
  GDPdU Datensatzbeschreibung; AO § 147 Abs. 6.
- **Risk:** Steuerprüfer asks for the Z3 export, gets an XML the IDEA
  software can't parse, asks again. The Verein looks unprepared. Worst
  case: Schätzung der Besteuerungsgrundlagen because the "elektronische
  Daten konnten nicht zur Verfügung gestellt werden".
- **Fix:** Either label the export as a custom journal CSV/JSON (not
  Z3), or implement actual Z3 (gdpdu-tool source code is public; the
  format requires a CSV + index.xml; output one ZIP per fiscal year).

#### F-24 — `markExpenseErstattet` derives Buchungsjahr from `gebucht_am`, not `erstattet_am`

- **Where:** `src/lib/server/domain/audit-inbox-actions.ts:681`
- **Observation:** `const buchungsjahr = berlinYear(expense.gebuchtAm);`.
  The expense was booked in year X; `chosenDate` (Erstattung) may be in
  year Y > X. The Festschreibungs-Gate is against the booking year. That's
  correct per ADR-0001 (EÜR Buchungsdatum = gebucht_am), so the Erstattung
  event stays in year X. But: setting `erstattetAm` mutates the row of
  year X. If year X is festgeschrieben, the gate correctly blocks. OK
  on its face — BUT the action then also writes `abflussDatum: chosenDate`
  to the row, which is data correction post-Erstattung. If chosenDate
  is in year Y and year X is closed, we're updating a closed-year row.
  Today the app-layer gate catches it; once the DB trigger ships (F-05),
  this UPDATE will fail.
- **Fix:** Either explicitly allow `erstattet_am` + `abfluss_datum`
  updates on festgeschriebene rows (via a trigger exception list), or
  store Erstattung as a separate "payment" row linked to the expense,
  so the original row stays untouched.

---

### LOW

#### F-25 — `transformAusgaben` fallback to "Jan 1 noon" loses fidelity

- **Where:** `src/lib/server/import/transform.ts:356`
  (`new Date(parsedId.year, 0, 1, 12, 0, 0)`)
- **Observation:** When neither Abfluss- nor Rechnungsdatum is available,
  the importer falls back to "Jan 1 12:00 of the business_id year, server
  TZ". Multi-row "Jan 1" entries are clearly synthetic and lose audit
  granularity. Use `15. Juni` (mid-year) or store `gebucht_am_synthetic = TRUE`.
- **Fix:** Add a `gebucht_am_origin` column ('abfluss' | 'rechnung' | 'business_id_fallback')
  for forensics, or refuse the row instead of fabricating a date.

#### F-26 — `formatBerlinIso` in SEPA may resolve to wrong DST offset on Vercel UTC server

- **Where:** `src/lib/server/sepa/xml.ts:257-281`
- **Observation:** Reliance on `Intl.DateTimeFormat(... timeZoneName: "shortOffset")`.
  On older Node versions (< 18.x) `shortOffset` returns a different
  format string ("GMT+0100" without colon). The regex catches that, but
  any unknown format throws and `offset` stays `"+00:00"` even in summer.
- **Fix:** Pin Node version in `package.json`/`engines`; add a unit test
  asserting both DST and standard time produce the right offset.

#### F-27 — Mitgliedsbeitrag has no pro-rata logic on partial-year membership

- **Where:** `src/lib/server/domain/members-actions.ts:32, 263-265`
- **Observation:** `DEFAULT_BEITRAG_CENTS = 6969n` is applied flat for the
  year. A member joining 1. Oktober owes the same 69.69 € as a Jan-joiner.
  Some Vereine want 1/12 per Monat (and the Satzung must back it).
- **Fix:** Either document explicitly that the Verein's Satzung mandates
  full-year contribution regardless of Eintritt (then no change), or
  support pro-rata via a `proRataFactor` field — keyed off Eintrittsdatum.

#### F-28 — Bescheinigung "Datum der Zuwendung" derived from `zugewendetAm` (date), but check is `parseInt(slice(0,4))`

- **Where:** `src/lib/server/domain/spenden.ts:581`
- **Observation:** `const year = parseInt(sp.zugewendetAm.slice(0, 4), 10);`.
  `zugewendetAm` is a Postgres `date` type so format is YYYY-MM-DD —
  slice is correct. But if a future migration changes it to timestamptz,
  the slice still returns "YYYY" — silent wrong year if the ISO becomes
  `2026-01-01T00:30:00Z` (= Berlin year 2026, but ZuwAm could be Dec 2025
  with a Geldwert-Datum logic the Verein chooses).
- **Fix:** Add a regression test asserting `zugewendetAm` schema type.

---

## Tax-office worst-case walkthrough

A Betriebsprüfer arrives in May 2027 for the 2025 fiscal year. They demand:

1. **Buchhaltungs-Journal in Z3-Format (GoBD § 147 Abs. 6).** Current
   export is a hand-rolled XML labeled Z3 but not validatable against
   the actual GDPdU/Z3 XSD. → Sie können das nicht im IDEA-Programm
   öffnen, Sie verlangen einen "ordnungsgemäßen" Export. → Schätzungsdrohung.
   **F-23.**

2. **Stichprobe von 3 Zuwendungsbestätigungen.** Spender:in zeigt einen
   Bescheid vom Finanzamt, in dem die Spende gestrichen wurde mit Hinweis
   "Bescheinigung trägt keine Unterschrift und keinen § 50 EStDV-Hinweis".
   → Verein muss Bescheinigungen reissue. Wenn das zu oft passiert,
   Haftung gem. § 10b Abs. 4 EStG. **F-01, F-02, F-03.**

3. **EÜR + Spendenliste cross-check.** Prüfer summiert Bescheinigungs-Beträge
   und vergleicht mit Spendenliste-CSV. Spendenliste sums `Number(betragCents)`
   floats; tatsächliche Bescheinigungs-Beträge gehen über `Number(bigint)`
   nach Math.floor. Bei mehreren hundert Spenden im Jahr potenziell um 1 Cent
   abweichend → "Beträge stimmen nicht überein". → Verein muss erklären.
   **F-07, F-08.**

4. **§ 19 UStG-Prüfung.** Prüfer sieht "WGB-Freigrenze (§ 19 UStG): 45.000 €"
   im Dashboard-Screenshot. Erklärt dem Verein, das ist § 64 Abs. 3 AO
   nicht § 19 UStG, und der Wert ist seit 2025 50.000 €. Schaut sich
   dann die tatsächliche §19-Schwelle an: Vorjahresumsatz wirtschaftlicher
   Geschäftsbetrieb 2024 = € 26.500. → **Verein verliert
   Kleinunternehmer-Status für 2025**, alle 2025er Rechnungen sind
   USt-pflichtig nachzubuchen + UStVA nachzureichen. Bisher hat das System
   das nicht erkannt. **F-12.**

5. **Festschreibung 2023.** Prüfer fragt: "Wurde 2023 ordnungsgemäß
   festgeschrieben?". Der Setting-Wert ist 2023, aber der DB-Trigger fehlt.
   Prüfer macht eine direkte Test-UPDATE auf eine festgeschriebene Zeile
   per Steuerberater:in — UPDATE geht durch. → GoBD § 146-Verstoß. → Schätzung
   2023 droht. **F-05, F-10.**

6. **SEPA-Erstattung 2025-08-15 von € 4.231,77.** Prüfer sieht die XML im
   Belegarchiv (pain.001.001.03). Vergleicht CtrlSum mit den
   `erstattet_am`-Zeilen in der DB. CtrlSum sagt 4.231,77, DB-Summe sagt
   4.231,78 (1-Cent-Drift durch `cents / 100` Float). → Frage: "Welche Zahl
   stimmt?" Wenn die Bank das XML überhaupt akzeptiert hat, dann die Bank-Zahl.
   Wenn nicht, dann ist die XML nie ausgeführt worden, aber das System
   markiert die Auslagen als erstattet. → Audit-Vermerk "Buchung erfolgt
   ohne tatsächliche Erstattung". **F-04, F-09.**

Realistic outcome: Beanstandungsbescheid mit mehreren Korrekturen, Verein
trägt für 2 Jahre Mehraufwand, Steuerberater-Kosten ca. 5-10k €,
Glaubwürdigkeit beim Finanzamt beschädigt. Nicht weltbewegend, aber
auch nicht das, was man als Kassenwart erleben möchte.

---

## Pre-launch checklist (MUST do before issuing real Zuwendungsbestätigungen)

### Tier 1 — BLOCKING. Cannot ship without.

- [ ] **F-01:** Decide signature strategy. Embed Vorstands-Unterschrift PNG
      OR add maschinell-erstellt Hinweis + persist Anzeige-Datum. Update
      the template accordingly.
- [ ] **F-02:** Add `VEREIN_FINANZAMT_ORT` env var. Replace
      `maskOrtFromAdresse()` with direct env-var read. Remove the function.
- [ ] **F-03:** Remove the FdW-specific default for
      `VEREIN_STEUERBEGUENSTIGTE_ZWECKE`. Use `requireEnv()` at boot.
- [ ] **F-06:** Replace all "ae/oe/ue/ss" transliterations in
      `bescheinigung-template.ts` with proper umlauts. Verify in a rendered
      PDF that pdf-lib doesn't choke.
- [ ] **F-05:** Ship the row-level UPDATE trigger for festgeschriebene
      rows BEFORE the first real `close_buchhaltungsjahr()` call in production.

### Tier 2 — Before issuing the SECOND Bescheinigung.

- [ ] **F-04, F-09:** Upgrade SEPA generator to pain.001.001.09 and convert
      all SEPA arithmetic to bigint. Add a sepa_runs table to track what's
      been actually submitted.
- [ ] **F-12:** Fix the WGB/Kleinunternehmer widget. Make thresholds
      settings-driven.
- [ ] **F-13:** Implement Sammelbestätigung (1:N donations:Bescheinigung
      with Aufstellung-Anhang).
- [ ] **F-14:** Make `leistungsDatum` required, or auto-fill +
      "Leistungsdatum entspricht Rechnungsdatum" note.

### Tier 3 — Discipline / future-proofing.

- [ ] **F-07, F-08, F-19:** Replace every `Number(betragCents) / 100`
      with the bigint `formatCentsAsEuro` helper. Add ESLint rule to
      forbid float division of cents.
- [ ] **F-10:** Fix `isYearClosed` to include `invoices`.
- [ ] **F-11:** Use `yearForBooking()` from `lib/domain/year.ts` in the
      importer; remove `.getFullYear()` calls.
- [ ] **F-15:** Move ID allocation inside the createInvoice transaction.
- [ ] **F-16:** Add CHECK constraints for Aufwandsspende ordering
      before Phase 2 ships the workflow.
- [ ] **F-20:** Add CHECK on `id_counters.kind`.
- [ ] **F-21:** Add partial CHECK enforcing IBAN-on-extern-approval.
- [ ] **F-22:** Tighten the `rejectSubmission` race-condition guard.
- [ ] **F-23:** Either implement real Z3 OR rename the export from "Z3".

### Tier 4 — Polish.

- [ ] **F-24, F-25, F-26, F-27, F-28:** Triage per backlog priority.

---

## Out of scope (noted but not in this review's scope)

- Multi-tenant `verein_id` is TODO'd throughout (schema comments) — fine
  for v1 single-Verein deployment.
- E-Rechnung receiving (XRechnung/ZUGFeRD) is required from 2025-01-01 for
  B2B reception. App produces PDF only; ability to RECEIVE XRechnungen
  from suppliers is out of scope for now but should be tracked. Outbound
  E-Rechnung is optional until 2027/2028 transition.
- Audit log hash chain (ADR-0004) is deferred to Phase 7.5; not assessed
  here.
- Drive/OAuth flow (legal data residency, DSGVO §28 AV) — covered in
  separate review (`docs/reviews/2026-05-19-dsgvo-legal-review.md`).
