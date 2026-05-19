# 2026-05-19 Independent Security Review (Phase 7.5 reviewer pass)

Reviewer: AppSec re-check of PR #29 (`phase-7.5-compliance-hardening`),
performed against the entire codebase, not only the diff. SvelteKit app,
single-tenant Verein admin (real money + DSGVO scope).

## TL;DR severity breakdown

| Severity | Count |
| -------- | ----- |
| CRIT     | 4     |
| HIGH     | 6     |
| MED      | 9     |
| LOW      | 5     |
| NIT      | 4     |
| Total    | 28    |

The Phase 1+ MUST-fix list (ADR-0009) is fully implemented and the audit-log
chain (ADR-0004 Phase 7.5) is wired correctly. The remaining critical risks
are not in the new hardening code itself — they are pre-existing config /
env-handling defects that the hardening sprint did not touch, plus a small
number of new gaps introduced around the chain trigger and cron endpoints.

Top-5 highest-impact items to fix before flipping the form live and before
the next deploy:

1. **CRIT-1** SESSION_SECRET silently defaults to empty string — anyone can
   forge cookies if env var is missing in any environment.
2. **CRIT-2** Magic-link URL host comes from request `Host` header when
   `PUBLIC_BASE_URL`/`ORIGIN` is unset — attacker-controlled host injection
   leading to magic-link theft.
3. **CRIT-3** Allowlist is only checked at sign-in. Sessions outlive
   `ADMIN_EMAILS` changes — a kicked admin retains access for up to 30 days.
4. **CRIT-4** Email enumeration via timing: admin path performs a DB INSERT
   - SMTP send; non-admin path is a no-op SHA-256. Sub-ms vs ~200 ms gap is
     trivially measurable and defeats MUST-fix #3.
5. **HIGH-1** Audit-log handler swallows trigger failures in the public form
   action — submissions persist without an audit row, breaking tamper-evidence
   guarantees ADR-0004 promises.

---

## Findings (sorted by severity)

### CRIT-1 — SESSION_SECRET silently defaults to empty string

- **File:** `src/lib/server/env.ts:10`
- **Observation:** `SESSION_SECRET: z.string().default("")`. There is no
  `requireEnv("SESSION_SECRET")` call on cold start; `cookies.ts` simply does
  `createHmac("sha256", env.SESSION_SECRET)`. If the var is missing in
  Vercel, every cookie is signed with HMAC-key `""`.
- **Exploit:** Anyone who knows the HMAC key (= empty string in the broken
  config) can sign arbitrary session cookies and impersonate any user. The
  same holds for the magic-link intent cookie. There is no startup guard.
- **Fix:**
  ```ts
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be ≥ 32 chars"),
  ```
  and call `requireEnv("SESSION_SECRET")` at module-init time in
  `cookies.ts` (or guard inside `sign()` and fail closed).

### CRIT-2 — Magic-link host from attacker-controlled `Host` header

- **File:** `src/lib/server/auth/index.ts:122-128`
- **Observation:** Base URL fallback chain is
  `PUBLIC_BASE_URL || ORIGIN || meta.origin || ""`. `meta.origin` is
  `url.origin` which derives from the `Host` request header. `.env.example`
  declares neither `PUBLIC_BASE_URL` nor `ORIGIN`; the live `.env` likewise
  has neither set; `env.ts` has no schema entry forcing them.
- **Exploit:** Attacker POSTs to `/sign-in` with
  `Host: evil.example.com`, supplying the victim's email. App sends the
  magic link `https://evil.example.com/sign-in/verify?token=…` to the
  victim. Victim clicks → token leaks to attacker. Attacker replays on the
  real host within 15 min and gains full admin.
- **Fix:** Require `PUBLIC_BASE_URL` (or read SvelteKit's compile-time
  `ORIGIN`) and _do not fall back to `meta.origin` in production_. Add to
  env.ts:
  ```ts
  PUBLIC_BASE_URL: z.string().url(),
  ```
  and in `issueMagicLink`:
  ```ts
  const baseUrl = requireEnv("PUBLIC_BASE_URL").replace(/\/$/, "");
  ```

### CRIT-3 — Allowlist not re-checked on session resolve

- **File:** `src/lib/server/auth/index.ts:293-345` (`resolveSession`)
- **Observation:** Allowlist (`isAdminEmail`) is only consulted in
  `consumeMagicLink`. Once a session row exists, `resolveSession` only
  checks idle / absolute / DB expiry. Removing a user from `ADMIN_EMAILS`
  has no effect on their existing cookies.
- **Exploit:** If an admin is compromised (or simply rotated off the
  allowlist), their session token remains valid until the 7-day idle / 30-
  day absolute timeout. The "Sign out everywhere" admin lever requires
  knowing the user's id, which presumes the bad actor has not yet acted.
- **Fix:** Inside `resolveSession`, after fetching the `user` row:
  ```ts
  if (!isAdminEmail(user.emailCanonical)) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    clearSessionCookie(cookies);
    return null;
  }
  ```
  Cost is the same set lookup that already runs at sign-in; allowlist
  changes propagate within one request.

### CRIT-4 — Email enumeration via timing (MUST-fix #3 incomplete)

- **File:** `src/lib/server/auth/index.ts:71-104`
- **Observation:** The "constant-time" non-admin path does
  `sha256(randomBytes(32).toString("base64url"))` and returns. The admin
  path executes: rate-limit insert + select, magic-link INSERT, mail
  enqueue INSERT, SMTP send (multiple round-trips), intent-cookie sign.
  The work delta is several hundred milliseconds end-to-end — easily
  measurable from outside.
- **Exploit:** Attacker scripts the sign-in endpoint with candidate
  emails. Responses for allowlisted emails are consistently slower than
  responses for unknown emails, even though the JSON body is identical.
  Bulk enumeration of the (tiny) admin allowlist becomes trivial.
- **Fix:** Either move the mail-send to a background queue (so the
  response time is always "wrote DB row, returned 200") or run the
  non-admin path through a comparable amount of synthetic work (insert
  into a discard table, sleep for a sampled distribution matching the
  admin path). Best fix: queue + always-200-in-≤50ms.

### HIGH-1 — Public form swallows audit handler failures

- **File:** `src/routes/auslage-einreichen/+page.server.ts:352-376`
  combined with `src/lib/server/events/handlers.ts:58-78` (audit handler
  re-throws as documented).
- **Observation:** Public form `bus.emit("auslagen.submitted", …)` is
  wrapped in `try { ... } catch (busErr) { console.error(...); }`. The
  comment explicitly says "the user-visible result … must not be hidden
  behind an audit-write transient failure". Net effect: when the trigger
  rejects (e.g. advisory-lock timeout, payload not JSON, pgcrypto missing,
  app_runtime missed a grant after migration 0009), the submission row
  persists in `auslagen_submissions` but no audit row exists.
- **Exploit:** This is exactly the tamper window ADR-0004 promises to
  close. A defender investigating a submission has no audit anchor for
  it. Worse, an attacker who can deliberately fail the trigger (e.g. by
  triggering an advisory-lock starvation) creates persistent
  "audit-orphan" rows.
- **Fix:** Audit insert is not a side-effect — it is part of the truth
  state. Either:
  - move the audit insert into the same `db.transaction(...)` that wrote
    the submission row, OR
  - on bus error, return `fail(500)` and roll back the submission row
    (best effort delete + Drive cleanup, mirroring the existing DB-failure
    branch).
    Don't `console.error` and continue.

### HIGH-2 — `actor_ip_prefix` stores the full IP for sign-in / sign-out

- **File:** `src/lib/server/auth/index.ts:210, 246, 370, 400`
- **Observation:** `meta.ip` comes from `getClientAddress()` (full IPv4 /
  IPv6). The audit-log `actor_ip_prefix` column name promises a prefix;
  the public form correctly truncates via `ipPrefix()` in
  `auslage-einreichen/+page.server.ts:82`. The auth path does not.
- **Exploit:** DSGVO data-minimisation breach. Every sign-in attempt
  (including failed ones, including `NOT_ADMIN` rows by canonical email
  - full IP) writes a directly-identifying datapoint into an append-only
    table. There is no purge job, and the column is hashed into `row_hash`
    for tamper-evidence, so masking after-the-fact rewrites the chain.
- **Fix:** Reuse the `ipPrefix(ip)` helper in `auslage-einreichen/+page.
server.ts` (lift it to `src/lib/server/auth/ip.ts`) and pass
  `ipPrefix(meta.ip)` to every `logAudit` site. Backfill existing rows is
  out of scope (would break the chain); document in `RUNBOOK.md`.

### HIGH-3 — `/api/cron/*` secret compare is not constant-time

- **File:** `src/routes/api/cron/beitragsreminder/+server.ts:18-27` and
  `src/routes/api/cron/daily-dispatcher/+server.ts:28-33`
- **Observation:** Both endpoints compare with `===`. There is no rate
  limit on these routes and the endpoint is internet-reachable on Vercel.
- **Exploit:** Off-by-one timing leaks per char. Practical exploitability
  on Vercel is limited (jitter, edge), but the cron endpoints can trigger
  the audit-chain verifier, dispatch reminder mails, and delete
  rate-limit rows — worth eliminating the oracle.
- **Fix:**
  ```ts
  import { timingSafeEqual } from "node:crypto";
  function isCronAuthorized(request: Request): boolean {
    const got = request.headers.get("authorization") ?? "";
    const want = `Bearer ${env.CRON_SECRET}`;
    if (!env.CRON_SECRET || got.length !== want.length) return false;
    return timingSafeEqual(Buffer.from(got), Buffer.from(want));
  }
  ```

### HIGH-4 — `/api/search` has no auth check (currently a stub, but already exposed)

- **File:** `src/routes/api/search/+server.ts:44-64`
- **Observation:** No `locals.session` check. Comment says Phase 6 will
  add real search; the stub already accepts arbitrary `?q=` and returns 200. Once the real implementation lands and forgets the guard it leaks
  member / customer data.
- **Exploit:** Drift risk — every other `/api/*` endpoint guards. A
  contributor copying the search handler as a template will copy the
  missing guard.
- **Fix:** Add the same `if (!locals.session) throw error(401, ...)`
  guard now, on the stub.

### HIGH-5 — CRON_SECRET / VEREIN_IBAN / VEREIN_BIC / VEREIN_BANK / PUBLIC_BASE_URL missing from `.env.example`

- **File:** `.env.example`
- **Observation:** Live `.env` has `CRON_SECRET`, `VEREIN_IBAN`, `BIC`,
  `BANK` set neither — `.env.example` doesn't list them. New deployers
  follow the example and ship without a cron secret, so cron endpoints
  silently 401 forever (or worse, with the `===` compare above, fall
  through if both sides are empty strings → see HIGH-3 if it weren't
  guarded by the `if (!cronSecret) return false` early return).
- **Exploit:** Operational + secret-rotation hazard; same class as
  CRIT-1 (defaults masking misconfiguration).
- **Fix:** Add to `.env.example` with explanatory comments. Have
  `env.ts` mark these required via `requireEnv` at the relevant
  callsites.

### HIGH-6 — Off-Postgres audit anchor is not cryptographically signed

- **File:** `.github/workflows/audit-anchor.yml:46-93`
- **Observation:** Anchor is a plain CSV + sha256 file pushed to a
  private repo using a PAT. Anyone with the `AUDIT_ANCHOR_TOKEN` can
  rewrite history — the trust root is the PAT, not a signed manifest.
  No detached signature, no key rotation policy, no Drive backup yet.
- **Exploit:** A leaked PAT (or compromise of the GitHub account) is
  indistinguishable from a legitimate anchor update. The whole point of
  the off-Postgres anchor (ADR-0004) is to defend against rewrite by
  someone with PG owner privileges — but if PAT compromise has equal
  power, the anchor adds little.
- **Fix:** Sign the anchor CSV with a key kept _outside_ GitHub (age /
  minisign / GPG, key material in 1Password, public key committed to the
  app repo). The `audit-anchor` job emits both `audit-anchor-<ts>.csv`
  and `audit-anchor-<ts>.csv.sig`; verifier in the app cross-checks.

### MED-1 — `/app` route gate matches `/appendix` and `/app-blah`

- **File:** `src/hooks.server.ts:38`
- **Observation:** `event.url.pathname.startsWith("/app")` triggers the
  auth redirect for any prefix-matching path, including `/appendix`,
  `/api` (no — `/api` doesn't start with `/app`), or
  hypothetical `/app-onboarding`. None exist today, but a future route
  added without a leading slash would be silently mis-gated.
- **Exploit:** Defence-in-depth gap; not an immediate vuln.
- **Fix:** `event.url.pathname === "/app" || event.url.pathname.startsWith("/app/")`.

### MED-2 — Magic-link intent cookie not cleared on enumeration path

- **File:** `src/lib/server/auth/index.ts:82-88`
- **Observation:** When a non-admin email is submitted, the intent cookie
  from a prior legitimate sign-in attempt (if any) is never cleared. A
  later legitimate sign-in then succeeds with a stale intent cookie,
  defeating MUST-fix #7 (device binding).
- **Exploit:** Minor. Attacker who shoulder-surfed the intent cookie value
  retains it across a "non-admin" probe.
- **Fix:** `clearIntentCookie(cookies)` before the early-return in the
  non-admin branch (and on `RateLimitError`).

### MED-3 — `consumeMagicLink` writes audit row even when intent cookie mismatches

- **File:** `src/routes/sign-in/verify/+page.server.ts:24-33`
- **Observation:** The GET handler computes `deviceMismatch` and renders
  a banner but does not refuse to consume. POST consumes regardless.
- **Exploit:** If an attacker steals the URL (referer leak, screen
  capture, link copy-paste) and forwards it to the victim, the legitimate
  intent cookie is on the victim's device, so the banner says nothing
  unusual — but if the attacker themselves opens the link they get a
  warning yet POST still succeeds.
- **Fix:** Option 1 (stricter): refuse POST when `deviceMismatch === true`
  and prompt the user to request a fresh link. Option 2 (current):
  document explicitly that the banner is informational only and rely on
  the user. Recommend Option 1 since the cost is one extra mail.

### MED-4 — Magic-link raw token round-trips through the verify page DOM

- **File:** `src/routes/sign-in/verify/+page.svelte:50`
  - `src/routes/sign-in/verify/+page.server.ts:27-32`
- **Observation:** The GET handler returns the raw `token` to the page
  load data so the POST form can submit it. The token is also still in
  the URL bar, in browser history, in any referer logs that fire from
  this page, and in any client-side error reporter that captures the DOM.
- **Exploit:** Bypassing the cookie-bound intent. If browser history is
  shared (kiosk, screen recording, Sync), the raw token can be replayed
  until consumed/expired.
- **Fix:** Bind the token to the cookie before the GET completes —
  store `tokenHash` in the intent cookie (already done) and on POST,
  derive the token-to-consume from the cookie, not from the form field.
  The page then only needs an opaque CSRF-token to POST.

### MED-5 — Audit handler error semantics inconsistent across emitters

- **File:** various call-sites: `auslage-einreichen` swallows; `inbox/
[ausId]` swallows on `auslage.reviewed`; `transactions/[id]` does not
  catch around `bus.emit("expense.updated", …)`.
- **Observation:** Some emitters wrap `bus.emit` in try/catch, others
  let the AggregateError surface as a 500. Across the codebase the
  audit-log durability promise is not uniformly enforced.
- **Exploit:** Same class as HIGH-1. Hard to reason about during
  incident response.
- **Fix:** Either always-transactional (preferred) or document a single
  policy and use it everywhere.

### MED-6 — `InvoiceLivePreview` writes server-rendered HTML straight into the DOM

- **File:** `src/lib/components/admin/invoices/InvoiceLivePreview.svelte:95`
  - `src/lib/server/domain/invoices.ts:724-818`
- **Observation:** `{@html html}` where `html` is whatever the preview
  action returned. The server-side `escape()` is incomplete (missing the
  single-quote → `&#39;` mapping). All values land in HTML body or
  double-quoted attribute contexts, so the missing apostrophe escape is
  not exploitable today, but the codepath is the textbook XSS source if
  the template is later edited to interpolate into a single-quoted
  attribute or a `<script>` tag.
- **Exploit:** Self-XSS by admin typing into their own form; not a
  privilege boundary today. Risk is regression on template change.
- **Fix:** Use a battle-tested escape helper (or `htmlescape`),
  including `'`/`/`. Add a test that re-renders with `<script>` in
  every field and asserts the output is benign.

### MED-7 — `marked.parse(...)` without sanitization for legal pages

- **File:** `src/routes/datenschutz/+page.server.ts:9`,
  `src/routes/impressum/+page.server.ts:9`
- **Observation:** marked v18 does not sanitize embedded HTML by default
  and the CSP allows `style-src: 'unsafe-inline'`. Admin-controlled (git
  commit gate) but a single mis-commit of `<script>` would be XSS for
  every visitor.
- **Exploit:** Requires git push to `main` to land a script tag in a
  legal markdown file. CSP `script-src: 'self'` blocks inline `<script>`
  but `<img onerror>` / `<iframe srcdoc>` may still execute.
- **Fix:** Pass through a sanitizer (DOMPurify on server via `isomorphic-
dompurify`, or `sanitize-html`) configured to allow only headings,
  paragraphs, lists, links, code, and inline emphasis.

### MED-8 — Sheet-resync `/app/sheet-resync` accepts unbounded CSV uploads

- **File:** `src/routes/app/sheet-resync/+page.server.ts:137-143,
185-191`
- **Observation:** Uploaded files are read with `await value.text()`
  with no per-file or total-size cap. Admin-only but memory DoS is
  trivial — a 500 MB CSV will OOM Vercel's lambda.
- **Exploit:** DoS via admin upload. Limited blast radius but easy to
  hit accidentally with the wrong file.
- **Fix:** Mirror the `MAX_REQUEST_BYTES` + `MAX_BELEG_BYTES` pattern
  used in `auslage-einreichen`. Check `value.size` before `text()`.

### MED-9 — Sessions cookie missing `__Host-` prefix / `SameSite=Strict`

- **File:** `src/lib/server/auth/cookies.ts:55-66`
- **Observation:** Cookie attrs are `HttpOnly + Secure (prod) + SameSite=
Lax + Path=/`. The cookie is single-origin (no Domain), but the prefix
  isn't used and SameSite is lax (Lax permits top-level POST cross-site
  navigation, which is rare but not zero risk).
- **Exploit:** Marginal — CSRF default-on in SvelteKit catches the POST
  side. Lax is fine for the redirect flow.
- **Fix:** Rename cookie to `__Host-session` (requires Secure + Path=/ +
  no Domain — already true) and switch to `SameSite=Strict`. Document
  the loss of top-level cross-site GET cookie attach (irrelevant here).

### LOW-1 — Hardcoded Verein IBAN fallback in source

- **File:** `src/routes/app/mitglieder/[id]/+page.server.ts:275-280`
- **Observation:** Hardcoded `DE258306...` IBAN baked into the source as
  a fallback when env vars are unset. Same fallback in
  `src/routes/api/cron/beitragsreminder/+server.ts:41-44`. Also the
  `env.VEREIN_ADRESSE ? IBAN_A : IBAN_A` ternary is a dead branch (same
  value in both arms).
- **Exploit:** Not a secret leak (IBANs are not confidential), but
  encourages a "the source knows" pattern that breaks the env-driven
  config contract. Make-or-break for a 2nd Verein onboarding.
- **Fix:** Hard-require `VEREIN_IBAN/BIC/BANK` via `requireEnv()` at
  use-site; remove the fallbacks.

### LOW-2 — Health endpoint exposes commit SHA + deployedAt unauthenticated

- **File:** `src/routes/healthz/+server.ts:40-48`
- **Observation:** Unauthenticated GET returns the commit SHA and
  deployment timestamp.
- **Exploit:** Allows attackers to fingerprint the deployed version and
  correlate with known CVEs. Standard practice today; minimise the
  payload for prod.
- **Fix:** Return only `{ ok: true }` to anonymous callers, or gate the
  detail behind a header (`X-Healthcheck-Token`).

### LOW-3 — Standard Helvetica only in Bescheinigung PDF — non-WinAnsi crashes generation

- **File:** `src/lib/server/pdf/templates/bescheinigung-template.ts:201-
202, 66-92`
- **Observation:** Uses `StandardFonts.Helvetica` with no subset font
  embedding and no input sanitisation. A spender name containing
  characters outside WinAnsi (emoji, CJK, lots of typographic marks)
  throws inside `font.widthOfTextAtSize`, returning a 500.
- **Exploit:** DoS of the donor Bescheinigung flow when a donor's name
  contains non-Latin-1 text. Not exploitable across privilege
  boundaries.
- **Fix:** Either embed a Unicode font (`fontkit` is already a dep) and
  use it, or sanitise input via `String.prototype.normalize("NFKD")` +
  drop unmappable code points before passing into pdf-lib.

### LOW-4 — Drive `archiveBelegToFolder` accepts caller-controlled folderName

- **File:** `src/lib/server/drive/client.ts:297-345`
- **Observation:** `folderName` is interpolated into the Drive `q=`
  filter via `escapeDriveQ`, which only escapes `\` and `'`. Drive query
  language has no other special chars but is loosely documented; future
  Drive API expansion (operators) could change the parse.
- **Exploit:** None known today.
- **Fix:** Add a deny-list / allow-list for `folderName` (already done
  for `idempotencyKey` via `IDEMPOTENCY_KEY_RE`). The folder names are
  also internally generated, so codify that with a `FOLDER_NAME_RE`.

### LOW-5 — Auslage status page enumerable by AUS-YYYY-NNN

- **File:** `src/routes/auslage-status/[ausId]/+page.server.ts:50-130`
- **Observation:** AUS-IDs are dense sequential numbers per year.
  20 lookups/min/IP rate-limit allows ~30k IDs scraped/day with a small
  IP pool. Returned data includes masked IBAN + display name + amount.
- **Exploit:** Enumerable PII (display name + amount). Even with masked
  IBAN, the (name, amount, status) triple may be enough to confirm a
  reimbursement happened to a named individual.
- **Fix:** Require the submitter's email or a short token on the URL
  (a 6-char base32 secret stored alongside the row at submit time).
  Or: tighten rate limit to 3/min/IP-prefix.

### NIT-1 — `dev`-only intent cookie `secure=false` documented but not gated

- **File:** `src/lib/server/auth/cookies.ts:62, 92`
- **Observation:** `secure: process.env["NODE_ENV"] === "production"`
  — fine, but Vercel Preview environments are not "production" by
  `NODE_ENV` and so ship without Secure. Preview URLs are HTTPS, so
  this is purely defence-in-depth.
- **Fix:** Use `import.meta.env.PROD` (Vite sets this for production-
  built bundles in both Vercel Production and Preview).

### NIT-2 — DSGVO auskunft endpoint logs PII in console.error

- **File:** `src/routes/app/dsgvo/auskunft.pdf/+server.ts:28-31, 36-38`
- **Observation:** `console.error("[dsgvo/auskunft.pdf] collectAuskunft
error:", err)` — `err` may include the SQL parameters bound, which
  for this codepath is the email being looked up. PII in logs.
- **Fix:** Strip the error to a stable code (`err.code` or `String(err).
slice(0, 200)`) before logging; bind a request-id to correlate.

### NIT-3 — `auslagen_submissions.externEmail` stored verbatim, not canonicalised

- **File:** `src/lib/server/domain/auslagen.ts:50` +
  `src/routes/auslage-einreichen/+page.server.ts:309`
- **Observation:** Public form externs supply their email; it lands in
  the DB un-normalised (no `canonicalizeEmail`). DSGVO `collectAuskunft`
  does `lower(...)` everywhere but two normalised forms with the same
  canonical (`a.b+x@gmail.com` vs `ab@gmail.com`) won't deduplicate.
- **Fix:** Canonicalise at write time, store both raw + canonical
  (mirroring `users.email_canonical`).

### NIT-4 — `RateLimitError` returns silent success to client (intentional) — but no

metric exposed for monitoring

- **File:** `src/routes/sign-in/+page.server.ts:25-29`
- **Observation:** Rate-limit hits get swallowed and a `200 ok` returned
  to avoid leaking. Good for anti-enumeration; bad for ops — nothing in
  audit_log records a rate-limit hit and there's no counter.
- **Fix:** `logAudit({ action: "rate_limit_hit", … })` on the
  catch branch with `actorIpPrefix` only, so SREs can alarm on it.

---

## Appendix: looked at but found no exploitable issue

These areas were reviewed and explicitly cleared so the next reviewer
doesn't re-pull the thread:

- **`src/lib/server/auth/index.ts:165-254` (`consumeMagicLink`).**
  Transaction is atomic via `UPDATE ... RETURNING` in a single SQL
  statement; idempotency under concurrent verify is correct; `clearIntentCookie`
  fires only on success.
- **`src/lib/server/auth/cookies.ts:27-47` (`unsign`).** The
  length-mismatch branch performs a dummy `timingSafeEqual` on
  zero-length buffers to avoid a timing fingerprint. Adequate given
  fixed-length signed payloads.
- **`src/lib/server/audit-log/chain.ts` + `verifier.ts`.** Hash recipe
  matches the SQL trigger byte-for-byte (NULL marker `\N`, pipe
  separator, microsecond truncated, payload via `jsonb_strip_nulls`).
  `pg_advisory_xact_lock(hashtext('audit_log_chain'))` serialises
  inserts so `chain_seq` is monotonic; the (rare) bigint collision
  with another advisory-lock site would block, not corrupt.
- **`drizzle/0009_audit_log_hardening.sql`.** `REVOKE UPDATE, DELETE,
TRUNCATE FROM app_runtime` is correctly re-asserted; trigger is
  `BEFORE INSERT FOR EACH ROW`; pgcrypto extension is created
  idempotently. Trigger refuses any non-INSERT op as defence-in-depth.
- **`src/lib/server/sepa/xml.ts`.** All caller-supplied text is run
  through `sanitizeSepaText()` (charset enforcement) and `escapeXml()`.
  Amounts are integer cents converted via `(cents/100).toFixed(2)`
  (safe for `Number.MAX_SAFE_INTEGER` range). Negative betragCents
  cannot reach the generator: domain layer validates positivity.
- **`src/lib/server/domain/file-validation.ts`.** Two-phase prefix sniff,
  MIME compatibility map, filename strip for control chars + path
  separators + leading dots + length cap. HEIC/HEIF aliasing is
  intentional.
- **`src/lib/server/domain/auslagen.ts`** (Zod schema).
  Discriminated-union for `bezahlt_von`, strict mode, bounded lengths
  on every text field, integer + positive for `betragCents`, ISO date
  regex for `rechnungsdatum`. Strict() rejects unknown keys.
- **SvelteKit CSRF default.** No `csrf: { checkOrigin: false }` override
  anywhere. Form actions all use POST with body-encoded form data; the
  default check is intact.
- **CSP** (`svelte.config.js:21-39`). `default-src 'self'`, `script-src
'self'`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors
'none'`, `base-uri 'self'`, `form-action 'self'`. Style is `'unsafe-
inline'` (necessary for shadcn / tailwind inlined styles); the rest
  is tight. CSP `mode: 'auto'` lets SvelteKit hash its inline
  hydration scripts.
- **Cron secret rejection on unset secret** (`api/cron/*`). Early
  return `if (!cronSecret) return false` correctly forbids requests
  when env is unset, rather than falling through to a comparison
  against `Bearer `.
- **Sign-out flow.** Deletes the session row by `tokenHash` (so a
  client that only has the cookie can sign out) and clears the
  cookie; `signOutEverywhere` deletes by `userId` — both write
  audit-log rows.
- **`POST /api/sepa/generate`.** Session-guarded; recipients filter
  out rows without IBAN; debtor IBAN/BIC loaded from settings.
- **`@googleapis/drive` request handling.** Library uses Google OAuth
  2.0 against `googleapis.com` only; no user-controlled URLs reach
  the HTTP client. `escapeDriveQ()` covers the only user-supplied
  interpolation in `q=` filters.
- **PDF metadata writes via `doc.setSubject(...)` etc.** Strings are
  injected as PDF document info dictionary entries; pdf-lib does the
  PDF string escaping. Risk is encoding crashes (LOW-3 above), not
  injection.
- **`pg_advisory_xact_lock` namespace.** Same `hashtext()` derivation
  used everywhere; collisions are 32-bit-birthday but the consequence
  is contention, not data corruption.
