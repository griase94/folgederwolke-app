# Red-team review — Overnight "Perfect Night" test plan

Reviewer: Claude (Opus 4.7), invoked as senior test-engineering specialist.
Targets: `docs/superpowers/specs/2026-05-19-overnight-perfect-night-design.md` (§Required test categories, §Critical-path test matrix, §Quality gates) + the phase-8 harness at `.claude/worktrees/phase-8-local-dev-environment/`.
Baseline: `docs/reviews/2026-05-19-test-coverage-review.md` (10 CG, 9 false-positive tests, 12 suite-level recs).

The spec is ambitious and the critical-path matrix is a real step forward. But several test categories are under-specified in ways a build agent will read as "I get to choose what counts as integration", and several of the most-likely-to-ship bugs in the deep-dive corpus are NOT on the critical-path list. This report enumerates 18 findings (5 BLOCKING / 10 HIGH / 3 MED) and proposes 8 new critical-path entries with exact test names.

---

## Findings

### F-01 — Critical-path matrix is missing the audit-log REVOKE invariant (BLOCKING)

The 2026-05-19 test-coverage review's **CG-7** flagged that `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM app_runtime` (`drizzle/0009_audit_log_hardening.sql:31`) has no behavioral test. The overnight spec lists "Audit-log hash chain stays valid after each new write" — but a chain valid against a verifier mock is not a REVOKE test. With phase-8 now connecting tests as `app_runtime` (per phase-8 `CLAUDE.md` → "Tests connect as `app_runtime`"), this is finally testable. Spec must require it.

**Insert into §Critical-path test matrix:**
| Audit-log immutability (REVOKE enforces) | `drizzle/0009_audit_log_hardening.sql:31`, `src/lib/server/db/roles/*` | Integration: connect as `app_runtime`, attempt `UPDATE audit_log SET ...`, expect 42501 | every cluster that touches audit |

### F-02 — Festschreibung enforcement has no DB-level test, only app-code tests (BLOCKING)

CG-6: the festschreibung invariant lives only in TypeScript. The spec's critical path "Festschreibung lock + DB trigger refuses mutation" asserts the trigger exists, but **there is no such trigger in the migrations today** (per CG-6). The spec test will either be written against a trigger that doesn't exist (test fails → build agent says "fix the test" instead of fixing the schema), or be written against app-code path (test passes for wrong reason, missing the real invariant).

**Required: spec must clarify which.** Either (a) C1/C2 ship the missing trigger and the test asserts `UPDATE expense WHERE festgeschrieben_at IS NOT NULL` raises 23514 from the trigger, or (b) the spec explicitly accepts the app-only invariant and tests every mutation path via a parametrised test that walks every table-with-festgeschrieben_at column.

**Insert before §Critical-path test matrix:** "Tests labeled 'integration' must hit the docker-compose Postgres as `app_runtime`; tests that only invoke route-handler code paths with mocked drizzle queries are unit tests, not integration tests, regardless of where they live."

### F-03 — TDD git-history check is trivially defeatable (BLOCKING)

The spec says "git log proves tests came first" and the code reviewer rejects "PRs that committed tests + implementation together". A build agent (or a future malicious agent) writes:

```
commit 1: test(c4): tests for sphere picker [TDD-red]  ← contains expect(true).toBe(false) placeholder
commit 2: feat(c4): sphere picker + real tests [TDD-green]
```

The grep check passes. The real test never failed first.

**Fix in §TDD protocol:** the build agent must capture and commit the failing-test output as `tests/.tdd-red/c<N>.txt` (or similar machine-readable proof) BEFORE commit 1. The code reviewer asserts:

1. `tests/.tdd-red/c<N>.txt` exists at commit 1.
2. Its content shows test names matching the test files added in commit 1.
3. Re-running the test file at commit 1 (on a clean working tree, with no impl files) still fails.
4. The re-run failure messages are not trivially "expected true to be false" — they reference symbols/assertions that exist in the final impl.

This is the only defense against placebo-TDD. Without it, the TDD discipline is theater.

### F-04 — "Integration test" is undefined, so build agents will write unit-tests-in-disguise (BLOCKING)

§Required test categories says "Integration (Vitest + local Postgres via dev-up)" but doesn't define what failure modes the integration tier MUST catch that the unit tier cannot. The phase-8 harness gives tests `app_runtime` privileges by default (good!), but a build agent can still write a test that:

- imports the route handler,
- mocks the inner `db.select(...)` calls with vi.mock,
- never executes a real query,
- and labels the file `tests/integration/foo.test.ts`.

That test would pass with the production DB destroyed.

**Insert into §Required test categories:** "A test belongs in `tests/integration/` ONLY if it executes a SQL statement against the local Postgres via a real `pg`/drizzle connection. Tests that use `vi.mock` on drizzle, the db module, or any storage interface are unit tests by definition. The test-quality reviewer rejects any file in `tests/integration/` that contains `vi.mock(...db...)` or `vi.mock(...storage...)`."

### F-05 — `.eml` mail-content tests have a path-stability race (BLOCKING)

`src/lib/server/mail/dev-eml.ts:53-56`:

```ts
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const safe = msg.subject.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60);
const suffix = randomBytes(2).toString("hex");
const file = `${ts}-${safe}-${suffix}.eml`;
```

Path is `<ISO timestamp>-<subject>-<random 4-hex>.eml`. Problems:

1. **Race**: two tests that send the same template within the same ISO-second land in the same directory and the test reading "the .eml file" picks one arbitrarily. With `fullyParallel: false` in `playwright.config.ts` this is currently OK for e2e, but Vitest unit tests run parallel by default → mail-content unit tests for C8 will flake.
2. **Cleanup**: there's no per-test cleanup of `<root>`. The reset-test-db.sh wipes `.dev-data/drive-test` but NOT the mail directory. After 100 test runs the directory has 1000+ `.eml` files and `grep -l "BeitragsReminder" <root>/*.eml` returns yesterday's mail.
3. **Subject collision**: `BeitragsReminder Q3 2026` and `BeitragsReminder Q3 2027` both sanitize to `BeitragsReminder_Q3_2026` and `BeitragsReminder_Q3_2027` respectively — OK here, but the slice(0, 60) truncation means `"AufwandsspendenBestaetigung-2026-XYZ-very-long-trailer"` collides with `"AufwandsspendenBestaetigung-2026-XYZ-very-long-suffix"`.

**Insert into §Required test categories:**

- "Each test that asserts on .eml content sets `MAIL_DEV_EML_ROOT` to a per-test temp directory created via `mkdtempSync` and removed in `afterEach`."
- "The test reads the .eml from the disk path returned by the test helper (e.g. `await sendMailAndCaptureEml()`), not by globbing the dir."
- Add a unit test for `dev-eml` itself: 100 concurrent `send()` calls produce 100 distinct files (no collision).

---

### F-06 — Visual snapshot tests will be flaky on CI and the spec has no diff threshold (HIGH)

§Required test categories mandates "Visual snapshot (Playwright + diff) — every UI cluster". But:

- The existing `playwright.config.ts` doesn't configure `expect.toHaveScreenshot.maxDiffPixels` or `threshold`.
- Font rendering on macOS (where Andy runs) differs from Linux (where CI runs) at the antialiasing level. Playwright's default `threshold: 0.2` covers some, but emoji rendering (the C5 favicon → manifest icon uses pink-marble sticker → likely an embedded image, but secondary brand assets may include emojis) varies by font fallback chain.
- The spec doesn't say WHO produces the baseline images. If the build agent runs `playwright test --update-snapshots` locally on macOS, then CI on Linux fails. If the build agent runs it via `docker run mcr.microsoft.com/playwright:focal`, the baseline is Linux-pinned — but the spec doesn't say.

**Insert into §Required test categories**:

- "Visual snapshot baselines are generated in a Linux container matching the CI runner (`mcr.microsoft.com/playwright:v1.49.1-jammy` or equivalent pinned image). Build agents MUST regenerate via the container script `scripts/update-visual-baselines.sh`; manual `--update-snapshots` from macOS is forbidden."
- "`expect.toHaveScreenshot` config: `threshold: 0.1`, `maxDiffPixels: 100` (default for UI clusters); brand-critical screens (favicon, mail templates rendered) use `maxDiffPixels: 0`."
- "If a screenshot diff fails on CI with antialiasing-class diffs only (visual diff reviewer determines), reviewer may approve via an explicit `playwright-allow-aa-diff: true` PR comment that the orchestrator records."

### F-07 — Critical-path matrix omits the ID allocator's `pg_advisory_xact_lock` (HIGH)

CG (test-coverage review §3.5 / `id-allocator.test.ts` flagged as false-positive): the in-memory mutex test passes even if `pg_advisory_xact_lock` is removed from the production allocator. Year-of-buchung-derived business_id uniqueness depends on this advisory lock. C4 and C1 and C3 all create transactions → all touch the allocator path.

**Insert into §Critical-path test matrix:**
| business_id allocator under concurrency | `src/lib/server/domain/id-allocator.ts`, `drizzle/sql/seed_id_counter_from_corpus.sql` | Integration: 50 concurrent INSERTs against `app_runtime`, assert (a) all 50 allocate unique IDs, (b) no advisory-lock leak after rollback | C1, C3, C4 |

### F-08 — `year_for_booking` SQL function is not on the critical-path matrix despite C2 making the year switcher live (HIGH)

ADR-0001 says always use `year_for_booking(ts)` for Buchungsjahr (Berlin TZ). C2 ships the year switcher. C3 displays year-bound aggregates. C4 changes the transaction-create form. Every one of these is a Berlin-DST-edge bomb. The test-coverage review §3.5 already flagged the import-runner Berlin TZ issue (`gebuchtAm.getFullYear()` vs `year_for_booking`).

**Insert into §Critical-path test matrix:**
| Year-of-buchung at Berlin TZ boundaries (incl. DST) | `drizzle/sql/year_for_booking.sql`, every route that filters by year | Integration: parametrise `2025-12-31T23:30:00Z`, `2026-01-01T00:30:00Z`, `2026-03-29T00:30:00Z` (DST gap), `2026-10-25T01:30:00Z` (DST fold). Assert dashboard, EÜR, year-switcher all agree. | C1, C2, C3, C4 |

### F-09 — Rate-limiter critical-path is absent despite being a known false-positive (HIGH)

Test-coverage review §3.1: the `rate-limit.ts` "real `checkAndRecord` SQL is untested; race between two concurrent inserts hitting the CTE". With phase-8's local Postgres, this is now trivially testable, and is on the critical path for public-form submit (C9's AT-002 fix and the regression case for public-form submit).

**Insert into §Critical-path test matrix:**
| Auth + public-form rate-limit CTE under concurrency | `src/lib/server/auth/rate-limit.ts` | Integration: fire 8 concurrent `checkAndRecord("k", 3, 60_000)`, assert exactly 4 succeed and the rest raise `RateLimitError` | C9 (public form), regression for auth |

### F-10 — Critical-path matrix has no "audit-log chain_seq duplicate / hole" test (HIGH)

CG-8 + test-coverage §3.3 / `audit-chain.test.ts`: the verifier walks by array order, not by `chain_seq` value. A deleted middle row with renumbered chain passes verification. Multiple clusters insert audit-log rows; this gap is per-cluster.

**Insert into §Critical-path test matrix:**
| Audit-chain gap + duplicate detection | `src/lib/server/audit-log/verifier.ts` | Integration: insert audit rows, then SQL-direct DELETE one middle row, then verify. Assert verifier reports gap. Repeat with a manual INSERT that duplicates a `chain_seq` value. | every cluster that inserts audit rows |

### F-11 — Mobile test matrix is too narrow (HIGH)

§Required test categories mentions "iPhone 12 + Pixel 5 + iPad Mini". The phase-8 `playwright.config.ts` only configures `Desktop Chrome` today. The PWA-mobile deep-dive (`docs/reviews/2026-05-19-deepdive-pwa-mobile.md`) drove on Pixel-5 viewport; Julia uses an iPhone 14 Pro per the brief. The current matrix misses:

- **iPhone SE** (375px wide): the smallest non-vintage viewport. Filter chips overflow on `/app/transactions` already (per C7).
- **Galaxy Fold** (280px collapsed): worst-case for responsive design. A real test here catches absolute-positioned elements that escape the viewport.
- **iPhone 14 Pro** with notch + Dynamic Island: needed for C7's safe-area-inset audit.

**Insert into §Required test categories:** mobile matrix = iPhone SE (375), iPhone 14 Pro (393, has notch + Dynamic Island), Pixel 5 (393, Android), Galaxy Fold (280 collapsed), iPad Mini (768). Remove iPhone 12 — superseded by iPhone 14 Pro for the safe-area test and by SE for the smallest-viewport test.

### F-12 — axe-core only covers ~30% of WCAG; spec ignores keyboard nav + screen-reader tests (HIGH)

axe-core catches landmarks, color contrast, alt-text, form labels — about 30% of WCAG-AA. Misses:

- Keyboard navigation order (tab cycles through year switcher correctly, FAB bottom-sheet is reachable via keyboard).
- Focus visible on every interactive element after Tab.
- ARIA live-region announcements for status toasts (C9's soft-undo toast — Julia or any screen-reader user gets no audible confirmation if `aria-live` is missing).
- Trap-focus inside the FAB bottom-sheet modal (C7).

**Insert into §Required test categories (Accessibility):**

- "axe-core via Playwright on every cluster's primary routes (existing)."
- "Keyboard-only walkthrough: tab through the cluster's primary action, hit Enter, assert the next state is reached. No mouse events. C1/C2/C3/C7 minimum."
- "ARIA live-region assertion for every toast/status component: the `[aria-live]` attribute is present and contains the rendered text (C7, C9)."

### F-13 — No performance assertions on shipped code (HIGH)

§Quality gates says "CI ≤ 5min per sub-PR" — that's a CI runtime budget, not a runtime-of-the-product assertion. The dashboard with 1000 transactions, the EÜR aggregator over a 1000-row year, the year-switcher route load — none of these have a "render time < N ms" assertion. This is the single biggest "test exists but doesn't catch the real bug" risk: dashboards that work with 10 fixture rows blow up at 1000.

**Insert into §Required test categories:**

- "Performance assertions on dashboard load (C3), EÜR aggregation (C1), and transactions-list filter (C2): integration test seeds 1000 transactions in the test DB, measures `loadTime = endTime - startTime` for the route loader, asserts `loadTime < 500ms` (server). Threshold lives in the test file, not a CI yml."

### F-14 — Schema-drift check is mentioned but not specified (HIGH)

§Quality gates lists "schema-drift" in CI. Today's `pnpm drizzle-kit check` only verifies that the generated `drizzle/meta/_journal.json` matches the migration files — it does NOT compare the drizzle schema TS against the live Postgres state. So a developer can `DROP COLUMN` directly on the DB without a migration, and drizzle-kit check is happy.

**Insert into §Quality gates:** "schema-drift check = `pnpm drizzle-kit check` AND `pnpm tsx scripts/db/verify-live-schema.ts` (NEW script). The latter introspects `information_schema` on the local test DB and asserts every table/column/index named in `src/lib/server/db/schema/*.ts` exists with the right type."

### F-15 — Giro-QR test: what does it actually assert? (HIGH)

Critical-path matrix says "Beitragsreminder mail with Giro-QR" tested by "`.eml` content + QR-payload decode". The spec is ambiguous: does the test (a) compare the PNG bytes to a golden file (will flake on any QR library version bump), or (b) decode the QR with `jsqr` or `qrcode-reader` and compare the EPC 069 payload string field-by-field?

(b) is the correct answer — but the spec must say so explicitly, or a build agent will pick (a).

**Insert into §Critical-path test matrix (clarify "Beitragsreminder mail with Giro-QR" row):** "Test extracts the `data:image/png;base64,...` from the .eml html, base64-decodes, runs through `jsqr` (or equivalent), asserts the decoded text matches the EPC 069 payload structure byte-for-byte (header `BCD\n002\n1\nSCT\n`, BIC, name, IBAN, EUR amount, purpose/reference). Do NOT assert PNG bytes."

### F-16 — Negative-test coverage is sparse (HIGH)

The critical-path matrix is happy-path-heavy. Production bugs ship in failure modes. Negative-test gaps the spec should add:

- **Form submit with corrupted multipart body** (public Auslagen form): a real attacker truncates the request mid-file. SvelteKit's `request.formData()` throws; assert the route returns 400 and writes an audit-log row with `payload.error_code='multipart_truncated'`.
- **Year switcher with `?year=2099`**: assert the layout-server clamps to a valid range (2020..currentYear+1) instead of passing 2099 to the DB. Today, `?year=99999999` would crash a parseInt-naive loader.
- **Duplicate `chain_seq` insert attempt** (impossible-but-defense-in-depth): SQL-direct INSERT with a duplicate `chain_seq` value while the trigger is firing — assert UNIQUE constraint raises 23505.
- **Drive scope drive.file fallback** (currently not on critical-path despite being noted as "no-touch — regression only"): a Drive token with drive.file scope only can't open files outside its own creation. The "Drive-tolerant Auslagen submit" matrix row needs a failure case where Drive returns 403 on `archiveBelegToFolder` and the local-fs fallback engages.

**Insert into §Critical-path test matrix:**

| Form-submit corrupted multipart body | `src/routes/auslage-einreichen/+page.server.ts` | E2E: send truncated multipart via raw `fetch`, assert 400 + audit row | C9 |
| Year switcher with out-of-range year | `src/routes/app/+layout.server.ts`, year-switcher component | E2E: `?year=99999999` → assert clamped + no DB error | C2 |

### F-17 — Visual diff vs UX-flow reviewer overlap is unresolved (MED)

Both run Playwright on the same flows. The spec says visual diff = "layout shift, color/spacing/type regressions" and UX-flow = "would Julia get stuck". In practice:

- Both will record screenshots → wasted compute (Andy's spec says "no token cap" but reviewer-time is reviewer-time).
- Both will report the same finding ("the form button is illegible") under different framings → orchestrator can't dedupe.

**Insert into §Roles:** explicit handoff. "Visual diff reviewer produces a machine-readable diff report (`tests/visual-diffs/c<N>.json`) listing `{ route, viewport, diff_pixels, diff_image_path }`. UX-flow reviewer READS this report and only investigates issues NOT already flagged visually (i.e. semantic friction, not pixel-level). UX-flow reviewer's output is the prose Julia-narrative; visual diff reviewer's output is the pixel diff. Each defers to the other in their domain."

### F-18 — Docker-compose Postgres in CI has cleanup race risks under parallel test runs (MED)

`scripts/db/reset-test-db.sh` runs once globally (via `playwright-global-setup.ts`). Vitest, by default, runs files in parallel. If a unit-test file mutates global state (e.g. inserts a magic-link row) and a second file reads it, ordering breaks. The phase-8 CLAUDE.md handwaves "Tests that mutate global state … should be ordered last in `testDir` or wrapped in `test.describe.serial()`" — this discipline does not survive contact with 80+ new tests.

**Insert into §Required test categories:** "Integration tests run in a single Vitest worker (`--maxWorkers=1`) on CI. Local dev gets parallel via `pnpm test:watch` (developer accepts flakes). Integration tests MUST clean their own rows via `afterEach` (truncate the tables they touched), even though `reset-test-db.sh` ran once at startup — because a test that runs second sees prior test's data."

Additionally: assert connection-pool sizing. With 50+ integration tests running serially, each opening + closing a pg connection, the docker postgres `max_connections=100` will hold — but a regression to a per-`it()` `new pg.Client()` instead of a shared pool exhausts it. Add a smoke unit test: `assert pool.totalCount < 10 after 100 sequential queries`.

---

## Proposed NEW critical-path matrix entries

Concrete additions. Each has an exact test name + file location:

1. **`tests/integration/audit-log-revoke.test.ts`** → `app_runtime` UPDATE/DELETE/TRUNCATE on `audit_log` raises 42501. (CG-7 → F-01)

2. **`tests/integration/festschreibung-trigger-or-app-check.test.ts`** → assert every mutation path refuses when `festgeschrieben_bis ≥ year`. Parametrized over `expenses`, `incomes`, `donations`, `members`. (CG-6 → F-02)

3. **`tests/integration/id-allocator-concurrency.test.ts`** → 50 concurrent `allocate("expense", 2026)` calls produce 50 distinct sequential `business_id`s. Asserts `pg_advisory_xact_lock` is in place. (F-07)

4. **`tests/integration/year-for-booking-dst.test.ts`** → parametrised over `2025-12-31T23:30:00Z`, `2026-01-01T00:30:00Z`, `2026-03-29T00:30:00Z`, `2026-10-25T01:30:00Z`. Asserts SQL function output equals expected Berlin-TZ year. (F-08)

5. **`tests/integration/rate-limit-cte-concurrency.test.ts`** → 8 concurrent `checkAndRecord("k", 3, 60_000)` — exactly 4 succeed, others raise `RateLimitError`. (F-09)

6. **`tests/integration/audit-chain-gap-and-duplicate.test.ts`** → insert 5 audit rows; SQL-direct DELETE row 3; verifier reports gap. Separately, manual INSERT duplicating `chain_seq=4` → UNIQUE raises 23505. (F-10 + CG-8)

7. **`tests/unit/giro-qr-payload-decode.test.ts`** → render BeitragsReminder.svelte with fixture `{ amount: 5000, iban, bic, recipient, purpose }`; extract data-URL from HTML; jsqr-decode; assert resulting string equals exact EPC 069 payload byte-for-byte. (F-15)

8. **`tests/e2e/year-switcher-out-of-range.spec.ts`** → goto `/app?year=99999999`; assert URL becomes `?year=<currentYear>` (or whatever the clamp is), no 500. (F-16)

9. **`tests/e2e/public-form-corrupted-multipart.spec.ts`** → POST a truncated multipart body via `request.fetch()`; assert 400, no DB write to `auslagen_submissions`, audit row written. (F-16)

10. **`tests/unit/dev-eml-concurrent-writes.test.ts`** → 100 concurrent `send()` calls, all unique file paths, no collision. (F-05)

---

## Test-quality reviewer concrete refusal patterns

The spec says the reviewer "refuses tests that mock the thing under test". Three concrete patterns the reviewer MUST reject:

**Pattern A — drizzle mock in an "integration" test:**

```ts
// tests/integration/foo.test.ts
import { vi } from "vitest";
vi.mock("drizzle-orm", () => ({ ... }));  // ← REJECT
```

Rule: any file under `tests/integration/` with `vi.mock(*db*)`, `vi.mock(*drizzle*)`, `vi.mock(*storage*)`, or `vi.mock(*mail*)` is rejected.

**Pattern B — re-implementing the function under test:**

```ts
// tests/unit/dashboard.test.ts — see CG-10
function buildActivityLabel(...) { /* identical copy of the source */ }
describe("buildActivityLabel", () => {
  it("...", () => expect(buildActivityLabel(...)).toBe(...));
});
```

Rule: if a function declared in a test file shares its name with a non-exported function in the matching source file, REJECT and require the source to export it.

**Pattern C — placebo TDD red:**

```ts
// commit 1 (TDD-red)
it("does the thing", () => { expect(true).toBe(false); });
// commit 2 (TDD-green)
it("does the thing", () => { expect(doThing()).toBe(42); });  // ← totally different test
```

Rule: test bodies in the TDD-green commit must be a superset of the TDD-red commit's test bodies (identical names, identical setup, only the impl-side changes between commits). The code reviewer git-diffs the test files between commits and rejects if test bodies were rewritten rather than extended.

---

## Summary

- **18 findings total.**
- **BLOCKING / HIGH split: 5 BLOCKING / 10 HIGH / 3 MED.**
- **10 new critical-path tests proposed** (8 in matrix + 2 supporting).

**The 5 most-dangerous test gaps (in priority order):**

1. F-04 — "integration test" undefined → build agents will write unit tests in disguise, defeating the entire integration tier. Without F-04's clarification, the spec's promise of integration coverage is unenforceable.

2. F-03 — TDD git-history check is theater without machine-verified red-test proof. Without F-03, the build agent can write impl-and-test-together and falsify the history with a placeholder commit.

3. F-01 + F-02 — audit-log REVOKE and Festschreibung-trigger invariants. Both are documented in ADRs, both fail silently in production if violated, both are testable with phase-8's local Postgres, and neither is on the current critical-path matrix.

4. F-05 — `.eml` mail-content tests have a path-stability race that will produce flaky CI on C8's parallel mail-template tests.

5. F-13 — no shipped-code performance assertion. Today's tests pass with 10 fixture rows; production has 1000+. Dashboards built in C3 will look fine in CI and crawl in real use.

**Report path:** `/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/reviews/2026-05-19-spec-redteam-tests.md`

---

End of report.
