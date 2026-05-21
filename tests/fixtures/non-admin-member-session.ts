import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

/**
 * Inject a non-admin member session cookie. Use in C2-TAX e2e where a
 * non-vorstand member submits the AuslagenForm via the admin path.
 *
 * Mirrors the test-only auth seam used by other specs — see
 * tests/e2e/auth.spec.ts for the admin equivalent.
 */
export async function signInAsNonAdminMember(
  page: Page,
  opts: { email?: string; memberId?: string } = {},
): Promise<{ email: string; memberId: string }> {
  const email = opts.email ?? `member-${randomUUID().slice(0, 8)}@example.test`;
  const memberId = opts.memberId ?? randomUUID();

  await page.context().addCookies([
    {
      name: "fdw_test_session",
      value: JSON.stringify({ kind: "member", email, memberId }),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      sameSite: "Lax",
    },
  ]);

  return { email, memberId };
}
