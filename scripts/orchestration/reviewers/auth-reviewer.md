# auth-reviewer

Reviews all authentication and session code in `src/lib/server/auth/`: magic-link issuance and verification timing, rate-limit logic, allowlist enforcement, session cookie creation/destruction, and Google OAuth token refresh handling.

Validates that `hooks.server.ts` correctly protects `/app/*` routes, that the `resolveSession` function never leaks session details on error, and that ADR-0009 threat model mitigations are implemented. Checks that no auth bypass is possible via URL encoding tricks or missing route guards.
