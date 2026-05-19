# Test-coverage gap review — 2026-05-19

Reviewer: Claude (Opus 4.7), invoked as an "extensive test-coverage reviewer".
Branch: `phase-2-public-form`. Repo cwd: `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app`.

Read every test file under `tests/unit/`, `tests/e2e/`, every `src/**/*.test.ts`, plus the source they cover. The mission was to find the gaps that produce the kind of bug that ships — production code paths that _work in tests but break in real usage_.

## TL;DR

- 23 unit-test files, 21 e2e specs (+ 2 reviewer specs `julia-review*` outside the @phase grep).
- ~618 `expect()` assertions in unit tests, ~269 in e2e. Coverage is "wide on the obvious things, thin on the load-bearing things".
- The four bugs in the brief — `app.css` import, `entity_id: null` dedup collision, empty `baseUrl`, mail-template `oklch()` — were not coincidental. The suite has a systemic gap: **it tests pure functions exhaustively, then mocks away every contract boundary** (DB, mail, Drive, env, cookies). All four failures occur at boundaries; none was catchable without integration coverage.
- 5 mail templates still contain `oklch()` / `gradient` CSS that Gmail strips (only `MagicLink.svelte` is hardened); no test asserts the rendered HTML is safe for Gmail.
- At least 4 unit-test files are **structural false positives**: they re-implement the behavior they're meant to test (`auth-upsert-user.test.ts`, `id-allocator.test.ts`'s in-memory mutex, `spenden.test.ts`'s in-memory allocator, `dashboard.test.ts`'s copy of `buildActivityLabel`).
- The `audit_log` REVOKE on `app_runtime` is not exercised by any test. The Festschreibung row-level trigger (mentioned in `audit_log.ts` doc comment) does not exist in the migrations — protection relies _entirely_ on application code, untested.
- e2e tests use `test.skip()` aggressively on 401/404/500 from `guardInbox`-style helpers — masking auth failures, missing fixtures, and 500-ing route loaders as "skip".

---

## 1. Top-level numbers

| Metric                                      | Value                                                             |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Unit test files (`*.test.ts`)               | 23                                                                |
| e2e spec files (`*.spec.ts`, @phase tagged) | 21 (+ 2 julia-review)                                             |
| Total `it(`/`test(` count in unit           | ~330                                                              |
| Total `test(` count in e2e                  | ~155                                                              |
| Total `expect(` calls — unit                | ~618                                                              |
| Total `expect(` calls — e2e                 | ~269                                                              |
| Source files under `src/lib/server/`        | 64 `.ts`                                                          |
| Source files with co-located `*.test.ts`    | 8                                                                 |
| `pnpm test:coverage`?                       | configured (`v8`, `text` + `html`) but no badge / threshold in CI |

Largest unit suites: `drive/client.test.ts` (38 cases), `spenden.test.ts` (32), `file-validation.test.ts` (29), `sepa-xml.test.ts` (26).

Largest e2e: `julia-review.spec.ts` (27), `julia-review-2.spec.ts` (25), `transactions.spec.ts` (15).

---

## 2. Critical gaps — bugs a real user will see that tests don't catch

These are the next-batch equivalents of the four "Recent local discoveries". Each is a path that's covered in the doc-comment of the source file but has no behavioral assertion in either suite.

### CG-1 — Mail templates still ship Gmail-incompatible CSS

`MagicLink.svelte` was hardened to solid hex colours after the Gmail-strips-`oklch()` discovery, but the other six templates were not:

```
$ grep -c "oklch\|gradient\|--color" src/lib/server/mail/templates/*.svelte
AufwandsspendenBestaetigung.svelte:0
BeitragsReminder.svelte:3
ErstattungsMail.svelte:3
EingangsMail.svelte:5
InvoiceVersendetMail.svelte:4
MagicLink.svelte:2     ← only refs are in comments
RejectionMail.svelte:4
```

Sample (`src/lib/server/mail/templates/EingangsMail.svelte:43`):

```svelte
style="background:linear-gradient(135deg,oklch(0.43 0.20 350) 0%,oklch(0.32 0.18 350) 100%);"
```

`tests/unit/mail-render.test.ts` only checks that German text + URLs appear — it never asserts the rendered HTML contains _zero_ `oklch(`, `linear-gradient(`, or CSS-custom-properties. Result: every BeitragsReminder, EingangsMail, ErstattungsMail, RejectionMail, and InvoiceVersendetMail sent to a Gmail address renders unstyled.

**Catch with a single assertion** added to `mail-render.test.ts`:

```ts
const FORBIDDEN = /oklch\(|linear-gradient\(|var\(--/;
expect(html).not.toMatch(FORBIDDEN);
```

### CG-2 — `baseUrl` empty-string fallback is still live

`src/lib/server/auth/index.ts:122-128`:

```ts
const baseUrl = (
  process.env["PUBLIC_BASE_URL"] ||
  process.env["ORIGIN"] ||
  meta.origin ||
  ""
) // ← if all three empty, baseUrl is "" → broken magic link
  .replace(/\/$/, "");
const verifyUrl = `${baseUrl}/sign-in/verify?token=${rawToken}`;
```

`scripts/e2e-serve.sh:43` papers over this in CI by exporting `ORIGIN=http://127.0.0.1:4173`. The e2e suite cannot reach the bad path. The unit test (`auth.test.ts`) mocks `sendMail` entirely, so the URL composition is never inspected. No assertion anywhere requires `baseUrl !== ""`.

**Bug-class** that ships: a fresh deploy with `PUBLIC_BASE_URL` unset and adapter-node not seeing `Host` (proxy stripping headers) emits `http:///sign-in/verify?token=...`. Recipients see a broken link, can't sign in.

### CG-3 — `sendMail({entity_id: null})` dedup collision is structural, not "fixed by the audit-fix"

The dedup fix in `auth/index.ts:135` passes the magic-link row id so the index is unique per send. But every OTHER `sendMail` caller with `entity_id: null` (admin debug, settings notifications, future templates) collides under the **UNIQUE NULLS NOT DISTINCT** index (`drizzle/0003_phase2_constraints.sql:26-28`):

```sql
CREATE UNIQUE INDEX "sent_mails_template_entity_attempt_uq"
  ON "sent_mails" ("template", "entity_kind", "entity_id", "send_attempt")
  NULLS NOT DISTINCT;
```

No test verifies that a second call to `sendMail({ template: 'X', entity_kind: 'Y', entity_id: null })` is _intentionally_ deduped (the documented behavior) vs _accidentally_ deduped (the bug class). The integration test `cron-tasks.test.ts` mocks `sendMail` entirely, so it never lands on the real index.

**The "ADR-0005 honor for entity_id=NULL" comment in 0003 is a hope, not a test.**

### CG-4 — `+layout.svelte` style-import regression is not testable

`src/routes/+layout.svelte:2` now does `import '../app.css';`. The previous outage (no styles in dev or prod) shipped because nothing in the suite asserts:

1. A request to `/` returns a `<link rel="stylesheet">` or contains `class="...tailwind-marker..."`.
2. A computed style on `body` reflects a Tailwind utility class.

`julia-review.spec.ts:661-677` reads `outline` + `boxShadow` but only on one toast widget; no smoke check that _any_ CSS loaded. If someone removes the import again, every existing test will pass.

### CG-5 — `closeBuchhaltungsjahr` SQL function has a syntactic dead branch

`drizzle/sql/close_buchhaltungsjahr.sql:30-38`:

```sql
IF EXISTS (
  SELECT 1 FROM expenses
  WHERE year_of_buchung = p_year AND festgeschrieben_at IS NULL
  LIMIT 1
) IS NULL AND EXISTS (
  ...
) THEN
  -- "Already closed; idempotent return."
```

`EXISTS(...) IS NULL` is always **false** in Postgres — `EXISTS` returns boolean, never null. The intended idempotent-re-close branch is unreachable. A second call to `closeBuchhaltungsjahr(2024, …)` for an already-closed year reaches the UPDATE statements and silently returns row counts of 0 (which happens to be safe, but the doc-comment lies). No unit or integration test exercises a re-close.

There is _no_ unit test for `closeBuchhaltungsjahr` or `isYearClosed` (`src/lib/server/domain/jahresabschluss.ts`). The e2e `jahresabschluss.spec.ts` only opens the modal and clicks "Abbrechen".

### CG-6 — Festschreibung enforcement relies on app-level checks only

The audit-log schema comment (`src/lib/server/db/schema/audit_log.ts:7-14`) and ADR-0006 both claim "Archived Buchungsjahre are immutable". The migrations contain **no row-level trigger** that prevents UPDATE/DELETE of `festgeschrieben_at IS NOT NULL` rows:

```
$ grep -rn "trigger.*festgeschrieben\|festgeschrieben.*trigger" drizzle/
(empty)
```

The protection lives only in TypeScript checks scattered across `audit-inbox-actions.ts`, `spenden.ts`, `members-actions.ts`. If any new mutation path forgets to call `fetchFestgeschriebenBis` first, the festschreibung is silently violated. The tests assert that the _known_ paths check it — they don't assert the _invariant_ that no path can update a festgeschriebene row.

### CG-7 — Audit-log REVOKE is not exercised in tests

`drizzle/0009_audit_log_hardening.sql:31`:

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime;
```

`tests/unit/audit-chain.test.ts` happy-paths the verifier with mocked DB responses; it never executes the REVOKE. If someone GRANTs UPDATE to `app_runtime` accidentally (or the migration is re-ordered), no test catches it. The verifier would still report "ok=true" on a chain where a row was secretly modified _and the trigger fired again_ — but the assumption is that REVOKE prevents that. **No assertion proves REVOKE is in force.**

### CG-8 — Hash-chain trigger is not exercised against a real Postgres

`tests/unit/audit-chain.test.ts` is good at the TS recipe and at synthetic verifier inputs. But the **PL/pgSQL trigger** in `0009_audit_log_hardening.sql:38-93` is byte-equivalent to the TS recipe ONLY if you trust the line:

```sql
v_payload := COALESCE(jsonb_strip_nulls(NEW.payload)::text, '{}');
```

produces the same text as Postgres returns for `jsonb_strip_nulls(payload)::text` in the verifier query (`verifier.ts:91`). It almost certainly does, but the test never co-tests trigger + verifier on a real DB. The brief explicitly calls this out as "the kinds of issues you should hunt for".

### CG-9 — `auth-upsert-user.test.ts` is a textbook false-positive

`tests/unit/auth-upsert-user.test.ts:36-52`:

```ts
function makeUpsertStore() {
  const byEmail = new Map<string, { id: string; emailCanonical: string }>();
  ...
  async function upsert(emailCanonical: string) {
    const existing = byEmail.get(emailCanonical);
    if (existing) return existing;
    const created = { id: `user-${++nextId}`, emailCanonical };
    byEmail.set(emailCanonical, created);
    return created;
  }
}
```

The "50 concurrent upserts produce one row" test runs against a synchronous Map. _Any_ implementation would pass — including a buggy find-then-insert. The honest version (the skipped `@phase-2-integration` block at line 110) is the only meaningful test, and it doesn't run.

### CG-10 — `dashboard.test.ts` duplicates the function under test

`tests/unit/dashboard.test.ts:51-92` re-implements `buildActivityLabel` line-for-line, then tests its own copy. The real `buildActivityLabel` in `src/lib/server/domain/dashboard.ts:197-239` is **not exported** — and so is not testable from the test file. Add or remove a label mapping in the source, the test passes regardless.

---

## 3. Module-by-module gap map

### 3.1 `src/lib/server/auth/`

| File            | Tested behaviors                                              | Not tested                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`      | session idle/abs timeout (with mocks), Gmail canonicalization | `baseUrl` empty fallback (CG-2); intent-cookie mismatch path; `signOutEverywhere`; `resolveSession` debounced-touch threshold; `consumeMagicLink` NOT_ADMIN audit log content |
| `rate-limit.ts` | sliding window in a simulator (`auth.test.ts:175-237`)        | the **real** `checkAndRecord` SQL is untested; race between two concurrent inserts hitting the CTE; behavior when `rate_limit_attempts` table is missing                      |
| `cookies.ts`    | nothing — entire module is mocked away                        | `unsign` length-mismatch path; HMAC tamper detection; `secure: NODE_ENV` branching; intent-cookie clearance                                                                   |
| `allowlist.ts`  | nothing                                                       | `isAdminEmail` correctness, env-vs-process.env precedence, comma split, blank-entry trim, canonicalization-before-Set                                                         |
| `hash.ts`       | determinism + uniqueness                                      | (small surface — fine)                                                                                                                                                        |

`getMagicLinkByToken` and the GET verify-page flow have no test.

### 3.2 `src/lib/server/mail/`

| File                  | Tested                             | Not tested                                                                                                                                                              |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` (sendMail) | not directly                       | dedup branch (`inserted.length === 0`); provider-failure marks `failedAt` + re-throws; `subjectFor` defaults; non-EUR currency case; `entity_id` null collision (CG-3)  |
| `provider.ts`         | not directly                       | env-driven provider selection (Resend vs SMTP); fallback when MAIL_PROVIDER is invalid                                                                                  |
| `render.ts`           | indirectly via mail-render.test.ts | `htmlToPlainText` decodes only 5 entities — `&euro;`, `&hellip;`, numeric `&#x...`, etc. silently leak as raw `&...;` into the text fallback                            |
| `resend.ts`           | not directly                       | 4xx vs 5xx mapping; missing API key fallback; rate-limit response handling                                                                                              |
| `smtp.ts`             | not directly                       | TLS vs STARTTLS; connection-refused error mapping; auth-required path                                                                                                   |
| templates             | text-content assertions only       | **no assertion that rendered HTML is Gmail-safe (CG-1)**; no assertion that text fallback contains the magic URL exactly once; HEIC/HEIF rendering in image attachments |

### 3.3 `src/lib/server/audit-log/`

| File          | Tested                                | Not tested                                                                                                                                                                                                           |
| ------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chain.ts`    | recipe parity (great)                 | `formatOccurredAtForHash` for sub-second precision >= 1ms (the `+'000'` µs padding works only because JS only has ms precision; a real Postgres trigger writing 6-digit µs will diverge)                             |
| `verifier.ts` | happy path + 4 tamper cases via mocks | gap detection in `chain_seq` (insert hole vs pre-genesis NULL); orphan rows where `chain_seq IS NOT NULL` but `row_hash IS NULL` and `prev_hash IS NULL` (genesis with empty payload edge); pre-genesis count > head |
| `index.ts`    | not directly                          | `logAudit` writer-vs-tx fallthrough; default `actorKind='user'`; null payload → empty `{}` insertion                                                                                                                 |
| trigger SQL   | not at all                            | CG-8 — never executed in tests                                                                                                                                                                                       |

### 3.4 `src/lib/server/sepa/xml.ts`

Best-tested module in the codebase — but several known pain points are missing:

- No assertion that `Ustrd` body avoids characters outside the SEPA charset for non-ASCII data (test asserts truncation length but not content). Try a `bezeichnung` with `€` or smart quotes — they get stripped to spaces by `sanitizeSepaText`, but no test pins the exact substitution.
- No round-trip test against an XSD validator. The XSD URL hint is in the doc-comment; running `xmllint --schema pain.001.001.03.xsd` against the generated string would be 5 lines.
- `CtrlSum` precision: the test asserts `(totalCents / 100).toFixed(2)`; no test for `totalCents = 1` (`0.01` vs `.01`).
- No assertion that all `EndToEndId` values are unique within a doc (a duplicate causes immediate bank rejection).
- `formatBerlinIso` is not exported and not directly tested for the DST edge — only "summer" and "winter" smoke cases at fixed dates. Try `2026-03-29T00:30:00Z` (the moment the clock skips 02:00–03:00) — output is unverified.
- `loadSepaDebtorFromSettings` falls back to `""` on null, then the generator falls back to `NOTPROVIDED` placeholders. Banks reject NOTPROVIDED. No assertion forces a real IBAN+BIC in production routes.

### 3.5 `src/lib/server/import/`

`transform.ts` is well-covered for the discriminator + year derivation. Gaps:

- `combineKommentar` — when both `kommentar` and `belegLink` are present, the test never asserts the literal `\n\n` separator. A regression to `\n` would be invisible.
- Excel-locale weirdness: `parseCentsFromAnything("1.234,56")` vs `parseCentsFromAnything("1,234.56")`. `csv-parser.ts` is sometimes called with a string already pre-parsed by the sheet client — if Drive ever returns the formatted value rather than the raw, cents go wrong. No fixture covers that.
- Year-consistency check assumes `getFullYear()` (local TZ), not Berlin TZ. `transform.ts:217,233,360` uses `gebuchtAm.getFullYear()` while `dashboard.ts` and the DB use `year_for_booking` (Berlin). A 23:30 UTC import on 31 December will mismatch the DB's derived year by one. No test covers this.
- `findMemberByName` falls back to vorname unique-match (`transform.ts:803-807`). If two members share a Vorname but the legacy sheet has only "Anna" and "Anna" exists twice, it returns null (correct) — but the test fixture has only single-vorname members.
- `runner.ts` `applyImport` has no unit test at all. The full transaction with `seed_id_counter_from_corpus` is e2e-only via `inbox-import.spec.ts`, which graceful-skips on 404.

### 3.6 `src/lib/server/spenden/zuwendungsbestaetigung` (the PDF)

The user asked specifically. Path is:

- `src/lib/server/domain/spenden.ts` (`allocateBescheinigung`, `extractBmfPflichtfelder`, `betragInWorten`)
- `src/lib/server/pdf/bescheinigung.ts` + `src/lib/server/pdf/templates/bescheinigung-template.ts`

Tested: `betragInWorten` (11 cases), `isBescheinigungEnabled` (5 cases), `validateSpendeInput` (12 cases).

**Not tested**:

- `allocateBescheinigung` end-to-end — its idempotency, festschreibung gate, and BMF env-validation are all dead code from the unit suite's view.
- `extractBmfPflichtfelder` — including the "split Sache: from zweckbindungText" parsing in `spenden.ts:617-620`. A Sachspende with `zweckbindungText` containing the word "Sache:" twice will be incorrectly split.
- The PDF renderer for Bescheinigung (`PdfLibBescheinigungRenderer`) has **zero** test coverage. By contrast, `PdfLibInvoiceRenderer` has three unit tests.
- BMF compliance: §10b EStG requires the Bescheinigung to quote the Bescheid Veranlagungszeitraum verbatim and to render "Aufwandsspende" / "Geldspende" / "Sachspende" exactly per the BMF Vordruck. None of this is asserted on the rendered PDF.
- `betragInWorten` for `cents > 1_000_000_000` returns numeric fallback (`spenden.ts:826-827`) — untested.
- `betragInWorten` for negative input (`spenden.ts:809`) returns "minus ..." — untested.

### 3.7 `src/lib/server/eur/` and `src/lib/server/domain/eur.ts`

The pure aggregator (`computeEurYear`, `aggregateByEurZeile`, etc.) has 21 strong unit tests. Gaps:

- `loadEurRows()` (or whatever loads from the DB into `EurRow[]`) is not in `domain/eur.ts` — it must live in a route loader; if so, the SQL is untested. Verify.
- `formatEurCents` for `bigint > Number.MAX_SAFE_INTEGER` silently truncates because of `Number(cents)`. A union budget that crosses ~90 quadrillion cents is hypothetical but the cast is wrong. Untested.
- `aggregateByEurZeile` puts rows with `eurZeile === null` under `zeile=0` AND uses `kategorieNameSnapshot` in the label. If two null-zeile rows have different category names, the label is whichever row came first. Untested.
- The EÜR PDF (`src/lib/server/export/eur-pdf.ts`) has zero tests; its sphere ordering, page-break logic, and currency formatting are all untested.
- Anlage-Gem CSV export (`src/lib/server/export/anlage-gem-csv.ts`) — untested.
- GoBD Z3 export (`src/lib/server/export/gobd-z3.ts`) — untested for CSV header escaping, BOM, encoding.

### 3.8 `src/lib/server/drive/`

`client.test.ts` is the strongest suite in the repo. Real gaps:

- **Token refresh path** — `auth.ts` is mocked out (`getDriveAuth: () => ({})`). The OAuth refresh round-trip on access-token expiry is not exercised. If `setCredentials({refresh_token})` is called with `undefined`, `google-auth-library` throws on first request; the singleton would die silently and re-throw on every subsequent call.
- `archiveBelegToFolder` race test only verifies that 2 concurrent callers don't both create the subfolder. It does not assert that the file actually moved (e.g. `currentParents.join(",")` when there are zero parents — empty string passed to `removeParents` — Drive behavior is unverified).
- `getBelegBytes` fails-shut on unexpected `data` type with `DriveNotFoundError`. Misclassification: a Buffer-decode failure isn't "not found".
- `IDEMPOTENCY_KEY_RE` rejects `.`, `+`, `=`, `/`, `,`. crypto.randomUUID() produces `-` (allowed) but if someone ever passes a base64-url key, `+` will trip the regex.

### 3.9 `src/lib/server/pdf/`

- `invoice-render.test.ts` exists and verifies PDF magic bytes. Gaps:
  - No assertion that the line-item `bezeichnung` containing `\n` actually wraps (only that the file is > 500 bytes).
  - Long `customer.addressBlock` (> page height) does not produce overflow assertions.
  - `verein.iban` and `bic` undefined branch is tested for non-crash, not for absent IBAN block.
  - `bytes[0]!` non-null assertion at line 58 is unsafe; the test would throw a different error than the assertion if the array were unexpectedly empty.
- `bescheinigung-template.ts` has zero tests (CG above).
- `pdf-lib-renderer.ts` font-subsetting is the default — pdf-lib doesn't subset by default. Large fonts ship in every invoice. Untested side effect.

### 3.10 `src/lib/server/files/` and route layer

- `FileStorage` interface and `drive-impl.ts` are not in any test directly; they are mocked in cron-tasks.test.ts.
- The "retry failed Drive uploads" cron logic only tests three rows. Behavior with > 100 rows (`.limit(100)` in the source?) and partial failures triggering an audit-log entry — untested.

### 3.11 Routes / SvelteKit actions

**No tests exist for any `+page.server.ts` `actions` object.** All e2e tests are UI-driven and skip on 401/404. That means:

- The CSRF / `ORIGIN` check that `scripts/e2e-serve.sh` papers over is never tested in CI under failure conditions.
- Form validation in route actions (vs the Zod schema) is tested only when a UI submit happens.
- 405 / unsupported-method handling — untested.
- HTML escape in error messages reflected to the user — untested.

---

## 4. False-positive tests (passing for the wrong reason)

These deserve their own list because they actively _protect_ bad code from regression noise:

| File                                                              | Why it's a false positive                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/auth-upsert-user.test.ts:36-95`                       | Tests an in-memory Map. The real ON CONFLICT DO UPDATE behavior is never exercised — even the `.skip()` block is hand-wavy.                                                                                                                                                                                                                                               |
| `tests/unit/id-allocator.test.ts:21-40` + `spenden.test.ts:19-32` | Both `makeInMemoryAllocator` simulators use a JS Promise chain as the "mutex". A regression that removes `pg_advisory_xact_lock` from `id-allocator.ts` would not fail these tests.                                                                                                                                                                                       |
| `tests/unit/dashboard.test.ts:51-92`                              | Re-implements `buildActivityLabel` in the test file. The real function isn't exported and isn't reachable from the test.                                                                                                                                                                                                                                                  |
| `tests/unit/cron-tasks.test.ts:42-52`                             | `drizzle-orm` is replaced with identity stubs. The actual SQL the DELETE / UPDATE compose is never validated — only that `mockDelete` was called. A swap of `lt` for `gt` passes.                                                                                                                                                                                         |
| `src/lib/server/auth/auth.test.ts:48-78`                          | The DB mock returns canned shapes; `consumeMagicLink`'s atomic UPDATE RETURNING is not testable through it. The 50-concurrent-upsert claim is in a different file (also false-positive).                                                                                                                                                                                  |
| `tests/unit/audit-inbox-actions.test.ts`                          | Excellent for the discriminator and idempotency logic, but relies on its own in-memory DB; the real `expenses` UNIQUE constraint + `auslagen_submissions` FK back-pointer are not engaged. The "concurrent race fires 23505" branch (line 89 `uniqueViolationOnNextInsert`) is _only_ triggered by the test toggling its own simulator — it's not the real Postgres path. |
| `tests/unit/audit-chain.test.ts`                                  | The verifier tests build their own valid chain in JS using the same recipe. If the recipe in `chain.ts` regresses (e.g. someone changes the separator from `                                                                                                                                                                                                              | `to`;`), `buildValidChain` regresses with it and the tests still pass. The only true cross-check would be a real Postgres trigger. |
| `tests/unit/sepa-xml.test.ts`                                     | Asserts presence of substrings (`<BtchBookg>true</BtchBookg>`). Does NOT validate the XML against the pain.001.001.03 XSD. A schema violation that German banks would reject is invisible.                                                                                                                                                                                |
| `tests/unit/invoice-render.test.ts:50-65`                         | Asserts PDF starts with `%PDF` but never opens the PDF to check that the customer name actually rendered. A renderer that emits `%PDF-1.7\n%%EOF` would pass.                                                                                                                                                                                                             |

---

## 5. New tests to write — priority-ordered

P-tag legend: **P0** = mirrors a bug already shipped; **P1** = next likely production bug; **P2** = correctness improvement.

### P0 — preventive against the four known shipped bugs

1. **`tests/unit/mail-render-css.test.ts`** — assert every rendered template HTML contains _none_ of `/oklch\(|linear-gradient\(|var\(--/`. One file, six templates, ~15 lines.
2. **`tests/unit/auth-base-url.test.ts`** — call `issueMagicLink` with `meta.origin=""` and `process.env.{PUBLIC_BASE_URL,ORIGIN}` both unset; assert `sendMail` was called with `magicUrl` that contains `http://` followed by a non-empty host. Currently produces `http:///`.
3. **`tests/integration/sent-mails-nulls-not-distinct.test.ts`** — point at a throwaway Neon branch. INSERT two `sent_mails` rows with `entity_id IS NULL`, same template/kind/attempt; assert the second raises 23505. Validates the migration AND the dedup behavior.
4. **`tests/e2e/layout-css.spec.ts`** — `await page.goto('/')`; `expect(page.locator('link[rel=stylesheet]')).toHaveCount(>=1)` AND a `getComputedStyle(body).fontFamily` assertion that returns the configured `--font-sans`. Catches another `app.css`-import regression.

### P0 — Festschreibung & audit log

5. **`tests/integration/festschreibung-trigger.test.ts`** — INSERT an expense with `festgeschrieben_at=now()` and then attempt UPDATE via `app_runtime`. Assert SQLSTATE `42501` (permission) OR document the absence of a row-level trigger and accept the risk (currently the latter is reality).
6. **`tests/integration/audit-log-revoke.test.ts`** — INSERT an audit row via `app_runtime`; assert it succeeds. UPDATE/DELETE/TRUNCATE via `app_runtime`; assert all fail with `42501`. Catches a future `GRANT ALL` regression.
7. **`tests/integration/audit-chain-trigger.test.ts`** — INSERT three audit rows under a real PG with the trigger installed; SELECT them; assert `row_hash` matches `computeRowHash` from `chain.ts` byte-for-byte. Catches recipe drift between PL/pgSQL and TS.
8. **`tests/unit/audit-chain-gap-detection.test.ts`** — feed the verifier a chain `[seq=1, seq=3]` (hole) and assert it flags the prev_hash mismatch on seq=3. Currently the verifier walks by array order, not by chain_seq value; a deleted middle row plus renumbered remaining `chain_seq` to {1, 3} would silently pass.

### P1 — SEPA + money handling

9. **`tests/unit/sepa-xsd-validation.test.ts`** — call `generateSepaXml(...)` and pipe through `xmllint --schema ./vendor/pain.001.001.03.xsd -`. Asserts schema compliance, not substring presence.
10. **`tests/unit/sepa-charset.test.ts`** — `bezeichnung: "Café 50% Räumung €→$ ©"`; assert the resulting `Ustrd` is in the SEPA character set `/^[a-zA-Z0-9 \/\-.?:(),'+]+$/`.
11. **`tests/unit/sepa-dst-edge.test.ts`** — `now: new Date('2026-03-29T00:30:00Z')` (clock skips 02:00–03:00 in Berlin); assert `createdAt` ends with `+01:00` or `+02:00` as appropriate.
12. **`tests/unit/sepa-end-to-end-id-unique.test.ts`** — 250 transactions; assert all `EndToEndId` values are unique within the document.
13. **`tests/unit/sepa-notprovided-refuse.test.ts`** — assert that the _production_ SEPA route (not the helper) refuses to produce a NOTPROVIDED XML; currently any deployment with missing settings emits one.

### P1 — Importer

14. **`tests/unit/import-runner-apply.test.ts`** — exercise `applyImport` with mocked tx; assert (a) ON CONFLICT DO NOTHING actually skips duplicates, (b) the `import_runs` row transitions `queued → running → ok`, (c) `seed_id_counter_from_corpus` is called once per (year, kind) touched.
15. **`tests/unit/import-runner-festschreibung-violation.test.ts`** — set `festgeschrieben_bis=2025` and try to apply rows with `yearsTouched: [2023, 2026]`; assert refusal AND that no DB writes happened.
16. **`tests/unit/import-transform-year-tz.test.ts`** — `gebuchtAm: new Date('2026-12-31T23:30:00Z')` (Berlin year 2027); business_id `A-2026-001`. The current code's `getFullYear()` check passes (UTC year 2026); the DB-derived `year_of_buchung` would be 2027 (Berlin). Catch the divergence.

### P1 — Spenden + Bescheinigung

17. **`tests/unit/bescheinigung-pdf-render.test.ts`** — render with all three `bescheidTyp` values, assert PDF magic, asset that the `bescheinigungNr` literal string appears in `pdftotext` output.
18. **`tests/unit/spenden-allocate-bescheinigung.test.ts`** — exercise `allocateBescheinigung` with mocks for: (a) already-bescheinigt donation (idempotent return), (b) festschreibung gate, (c) missing VEREIN_FREISTELLUNGSBESCHEID_VZ, (d) missing VEREIN_SATZUNG_FASSUNG, (e) Aufwandsspende refusal.
19. **`tests/unit/betrag-in-worten-edge.test.ts`** — `betragInWorten(-1_000_000_000n)` (negative > billion fallback path); assert deterministic output.
20. **`tests/unit/extract-bmf-pflichtfelder-sache-parsing.test.ts`** — Sachspende with `zweckbindungText: "Spende für Lager Sache: Laptop (Wert: Verkehrswert) | weitere Notizen"`; assert correct split (the current `.split('Sache:')[1]` is fragile).

### P1 — Auth + boundary

21. **`tests/integration/auth-rate-limit-real-cte.test.ts`** — point at a throwaway PG; fire 5 concurrent `checkAndRecord("k", 3, 60_000)`; assert exactly `max + 1 = 4` succeed and the rest raise `RateLimitError`. The current simulator can't see the CTE bug class.
22. **`tests/unit/cookies-unsign.test.ts`** — tamper bit-by-bit in the HMAC signature; assert `unsign` returns null for every flip; assert constant-time behavior (small timing variance under repeated calls).
23. **`tests/unit/allowlist-edge.test.ts`** — `ADMIN_EMAILS=" Andy@Gmail.com ,  ,b@x.com"`; assert `isAdminEmail('andy@gmail.com')` is true, `isAdminEmail('')` is false, `isAdminEmail('a.n.d.y@gmail.com')` is true.
24. **`tests/integration/upsert-user-real-race.test.ts`** — finally land the @phase-2-integration test from `auth-upsert-user.test.ts:110`.
25. **`tests/unit/consume-magic-link-not-admin-audit.test.ts`** — exercise `consumeMagicLink` for a non-admin email; assert `logAudit` was called with `actorKind='system'`, `payload.reason='NOT_ADMIN'`, AND that the magic_link row got `consumed_at` set (anti-retry).

### P2 — Drive + cron

26. **`tests/unit/drive-token-refresh.test.ts`** — mock `OAuth2Client.refreshAccessToken` to throw; assert `withDriveRetry` surfaces `DriveAuthError`. Today `auth.ts` returns `{}` so the refresh path is entirely untested.
27. **`tests/unit/cron-beitrag-reminder-no-email.test.ts`** — `members.email IS NULL` member with open Beitrag; assert reminded count = 0 and no `sendMail` call (currently the SQL filter excludes them, but a refactor could leak).
28. **`tests/unit/sendMail-failure-row-state.test.ts`** — exercise `sendMail` with provider throwing; assert the DB row went `status='failed'`, `failedAt IS NOT NULL`, AND the error was rethrown.

### P2 — UI / e2e expansion

29. **`tests/e2e/auth-mail-issued.spec.ts`** — sign-in as admin; capture the magic link issued via a test-only `mailcatcher` provider; assert the URL has a non-empty host and the link is clickable.
30. **`tests/e2e/festschreibung-blocks-edit.spec.ts`** — close 2025; open an expense from 2025; assert the edit form refuses with the festschreibung message AND no audit_log row was written.
31. **`tests/e2e/audit-log-immutability.spec.ts`** — open a page that triggers an audit insert; via the test DB directly attempt `DELETE FROM audit_log WHERE id = …`; assert permission denied.
32. **`tests/e2e/eur-pdf-bytes.spec.ts`** — download `/app/jahresabschluss/2026/bundle`; assert the resulting zip contains a non-empty EUR PDF; assert PDF magic bytes.

---

## 6. Suite-level recommendations

1. **Integration tier**. The unit suite mocks the database; the e2e suite skip-on-500s. There is no middle layer that runs real route handlers against a real Postgres. Add `tests/integration/` with Neon-branch (or pg-mem with limitations) so the CG-3 / CG-5 / CG-7 / CG-8 / CG-9 / CG-10 paths get tested. Without it, every "database invariant" lives only in doc-comments.
2. **NULLS-NOT-DISTINCT lint**. A small script that greps `drizzle/` for `UNIQUE INDEX … NULLS NOT DISTINCT` and lists each call site of `sendMail` that passes `entity_id: null`, asserting that each such call site is in an allowlist. Catches CG-3 regressions.
3. **Mail HTML safe-CSS lint**. Run `pnpm test` with a custom matcher: `expect(html).not.toMatch(GMAIL_UNSAFE)`. List the unsafe patterns once.
4. **Schema-drift check**. `pnpm drizzle-kit check` already exists; wire it as a CI step that fails if the generated schema diverges from the migrations. Catches "schema and migration disagree" bugs.
5. **Computed-style smoke in e2e**. One Playwright step at the top of every `auth-required` spec that reads `getComputedStyle(document.body).fontFamily` and asserts it isn't the user-agent default. Cheap insurance against another `app.css` regression.
6. **Stop skipping on 401/404**. `inbox-import.spec.ts` and similar use `guardInbox` to skip when the page returns 401/404/500. This converts CI noise into CI silence. Replace with `expect(status).toBe(200)` and an explicit `test.fixme()` if the precondition isn't met.
7. **Coverage threshold**. `vitest.config.ts:14-21` already configures v8 coverage; add a CI step that fails if `branches < 60%` or `functions < 70%` on `src/lib/server/`. Currently no threshold means coverage silently rots.
8. **xmllint XSD check in CI**. Vendor the pain.001.001.03 XSD; add a vitest custom matcher that pipes through `xmllint --schema`. Catches CG-style "the XML has the right tags but the schema rejects it".
9. **PDF visual smoke**. `pdf-parse` or `pdftotext` to extract text from generated PDFs; assert business_id + amount appear. Replaces "PDF magic bytes" with "PDF actually rendered the data".
10. **`extract-export-roles.test.ts`**. A test that opens a fresh PG connection as `app_runtime` and lists the roles' privileges, asserting the exact set. Catches future `GRANT` regressions to the audit_log REVOKE (CG-7).
11. **`isExported` linter for tested-but-internal functions**. If `dashboard.test.ts` re-implements `buildActivityLabel`, the real one should be either exported (and the test imports it) or untested (and the test removed). A simple grep CI step: any function declared in a `_test_.ts` file that has a same-named non-exported declaration in a sibling source file = warn.
12. **e2e auth bootstrap**. Add a Playwright `globalSetup` that runs the magic-link insert once and produces a `storageState` for downstream specs. Today every spec does its own postgres-direct insert (`spenden.spec.ts:18-45`, `auth.spec.ts:19-40`, …) — duplicated logic, easy to drift. Centralize it.

---

## 7. Findings count

- **35 specific gaps** identified above (10 CG + 11 module-level + 14 P0/P1 test recommendations).
- **9 false-positive tests** flagged.
- **12 suite-level recommendations**.

## 8. Top 10 critical gaps with file:line refs

1. **CG-1**: Mail templates still ship `oklch()` / `linear-gradient()` — `src/lib/server/mail/templates/EingangsMail.svelte:43,59,125,144,160` (and 4 other templates); not asserted in `src/lib/server/mail/mail-render.test.ts`.
2. **CG-2**: `baseUrl` empty-string fallback — `src/lib/server/auth/index.ts:122-128`; CI papered over by `scripts/e2e-serve.sh:43`.
3. **CG-3**: `sent_mails` NULLS NOT DISTINCT collision risk — `drizzle/0003_phase2_constraints.sql:26-28` is asserted by no test; every `sendMail({entity_id: null, ...})` caller is a latent collision.
4. **CG-4**: `+layout.svelte` CSS-import regression has no smoke test — `src/routes/+layout.svelte:2`; no assertion in `tests/e2e/` reads computed style.
5. **CG-5**: `closeBuchhaltungsjahr` idempotent-re-close branch is dead code — `drizzle/sql/close_buchhaltungsjahr.sql:30-46`; `EXISTS(...) IS NULL` is always false.
6. **CG-6**: Festschreibung enforcement has no DB-level trigger — `src/lib/server/db/schema/audit_log.ts:7-14` documents the invariant but `drizzle/*.sql` has none.
7. **CG-7**: `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime` — `drizzle/0009_audit_log_hardening.sql:31` is not exercised by any test.
8. **CG-8**: Hash-chain trigger PL/pgSQL is not co-tested with the TS recipe — `drizzle/0009_audit_log_hardening.sql:38-93` vs `src/lib/server/audit-log/chain.ts:81-93`.
9. **CG-9**: `auth-upsert-user.test.ts:36-95` tests an in-memory Map, not the production upsert.
10. **CG-10**: `dashboard.test.ts:51-92` re-implements `buildActivityLabel` from `src/lib/server/domain/dashboard.ts:197-239` and tests its own copy.

---

End of report.
