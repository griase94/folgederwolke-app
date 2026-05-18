# ADR-0009: Auth threat model + hand-rolled magic-link discipline

**Status:** Accepted (Phase 1 schema; Phase 1 auth-integration agent implements)

## Context

We're hand-rolling magic-link auth (~250 LoC) instead of pulling Lucia / Auth.js
because the surface area is small and the integration friction with Drizzle +
SvelteKit form actions + our specific cookie / CSRF / Postgres-backed
rate-limit needs would dwarf the LoC saved.

Round-4 security review flagged 6 MUST-FIX + 9 SHOULD-FIX mitigations.

## MUST-FIX (all Phase 1)

1. **Atomic verify transaction** — `BEGIN; UPDATE magic_links SET consumed_at=now()
WHERE token_hash=? AND consumed_at IS NULL RETURNING ...; INSERT INTO sessions
...; COMMIT;`. No two-step read-then-update.
2. **Postgres-backed rate limit** — sliding window over `rate_limit_attempts`
   table keyed by `<endpoint>:<canonical-email>`. No in-process counters
   (won't survive Vercel cold starts).
3. **Email enumeration mitigation** — `/sign-in` always returns 200 with the
   same delay; "we sent you a link if the email is allowlisted" wording.
4. **Idle-timeout enforcement** — `sessions.last_used_at` updated on every
   request; session-resolver rejects if `now() - last_used_at > IDLE_LIMIT`.
5. **Sign-out** — POST `/sign-out` writes `revoked_at=now()` on the current
   session row; cookie is cleared.
6. **Narrowed Drive scope** — D1 locks scope to `drive.file` (not `drive`).

## SHOULD-FIX

7. **Device binding** — `sessions.device_fingerprint` = hash of UA + IP/24
   captured at issue. Resolver compares; soft re-prompt on mismatch (Phase 2 UX).
8. **Click-through verify** (D13) — magic link → GET `/sign-in/verify` renders
   "Continue as <email>" page → POST consumes. Protects against URL prefetchers.
9. **Dedup magic links** — at issuance, look up unconsumed prior link for this
   canonical email; either re-send the same hash or invalidate the old one.
   v1: invalidate.
10. **Gmail-canonicalization** — `src/lib/domain/email.ts:canonicalizeEmail()`
    strips dot-tricks + `+suffix` and normalizes googlemail.com → gmail.com.
    Used for allowlist + dedup, never for display.
11. **CSRF** — SvelteKit's built-in `csrfChecksOrigin: true` for all POSTs.
    Plus same-site=Lax cookies.
12. **Cleanup crons** (Phase 7.5) — daily DELETE on expired magic_links +
    expired/revoked sessions older than 30 days.
13. **Healthz reports auth status** — `/healthz` includes a non-secret summary
    (active sessions count, latest magic-link issuance) for monitoring.
14. **TTDSG §25 safe Mitglied pre-fill** — D12 dropped the pre-fill cookie
    entirely; nothing to harden.
15. **No bearer-token leakage** — magic-link tokens never written to logs; we
    redact `?token=...` in request-logging middleware.

## Phase 1 storage

- `users.email_canonical` UNIQUE — dedup by canonical form.
- `users.role user_role` (ADR-0012) — enum for future RBAC growth.
- `sessions.last_used_at` — Round-4 #4.
- `sessions.device_fingerprint` — Round-4 SHOULD #7.
- `magic_links.token_hash` UNIQUE; never the raw token.
- `rate_limit_attempts(key, occurred_at DESC)` index for sliding-window count.

## Allowlist (ADMIN_EMAILS env)

`ADMIN_EMAILS` env is a comma-separated list of admin email addresses.
Canonicalized at boot. `/sign-in` proceeds only if the requested email's
canonical form is in the set. Failures look identical to the user — see
mitigation #3.
