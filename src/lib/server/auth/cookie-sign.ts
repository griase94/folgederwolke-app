/**
 * Pure-Node HMAC sign/unsign for session + intent cookies.
 *
 * Why a standalone module? `cookies.ts` imports `$lib/server/env`, which goes
 * through SvelteKit's alias resolution. Scripts run via `tsx` (e.g.
 * `scripts/mint-session.ts`) do not see those aliases. Keeping the crypto
 * here, with `secret` passed in explicitly, lets both `cookies.ts` and
 * standalone scripts share one canonical implementation — eliminating the
 * footgun of a script producing a raw token that the server's `unsign()`
 * rejects (no `.` separator).
 *
 * The behavior must stay byte-identical to the previous in-file `sign()`/
 * `unsign()` in `cookies.ts` — they share auth state with production cookies.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs `value` with HMAC-SHA256(secret), appends `.{hex-sig}`.
 */
export function sign(value: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${sig}`;
}

/**
 * Verifies the HMAC signature on `signed`. Returns the original value on
 * match, `null` otherwise (missing separator, tampered value, wrong secret).
 *
 * Uses `timingSafeEqual` on the full signed string (matches the historical
 * cookies.ts behavior) and falls back to a constant-length compare on length
 * mismatch to avoid leaking timing information about which half differed.
 */
export function unsign(signed: string, secret: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot < 0) return null;
  const value = signed.slice(0, lastDot);
  const expected = sign(value, secret);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signed, "utf8");
    if (a.length !== b.length) {
      timingSafeEqual(Buffer.alloc(a.length), Buffer.alloc(a.length));
      return null;
    }
    if (!timingSafeEqual(a, b)) return null;
    return value;
  } catch {
    return null;
  }
}
