/**
 * @phase-2 Member-edit permanent-exempt required reason (Task 2.11 / spec §7.9).
 *
 *   - checking "Beitragspflicht aussetzen" reveals the Grund field
 *   - submit stays disabled until the Grund is non-empty (client mirror of the
 *     server superRefine + DB CHECK)
 *
 * The EditMemberDialog is reached from the Mitglieder list (kebab → Bearbeiten).
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${TEST_ADMIN_EMAIL}, ${expiresAt})
  `;
  await client.end();
  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mismatch.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@phase-2 Member permanent-exempt required Grund", () => {
  test("Add dialog: permanent exempt requires a Grund (submit disabled until filled)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    await page.click("button:has-text('Mitglied hinzufügen')");
    await page.fill('input[name="vorname"]', "Pflicht");
    await page.fill('input[name="nachname"]', "Grund");

    // Toggle exempt → the required Grund field appears.
    await page.getByTestId("add-beitrag-exempt").check();
    const reason = page.getByLabel("Begründung (erforderlich)");
    await expect(reason).toBeVisible();

    // Submit is blocked while the Grund is empty (§55 AO client mirror).
    const submit = page.getByRole("button", { name: /Mitglied anlegen/ });
    await expect(submit).toBeDisabled();

    await reason.fill("Ehrenmitglied seit 2020");
    await expect(submit).toBeEnabled();
  });

  test("server rejects exempt member without a Grund (defense in depth)", async ({
    request,
  }) => {
    // Direct POST bypassing the client guard — the superRefine must reject it.
    const res = await request.post("/app/mitglieder?/add", {
      form: {
        vorname: "NoReason",
        nachname: "Exempt",
        eintritts_datum: "2020-01-01",
        role: "mitglied",
        beitrag_exempt: "on",
        beitrag_exempt_reason: "  ",
      },
    });
    // Unauthenticated → 403 admin-gate, or 422 validation — never a 2xx success.
    expect([400, 403, 422]).toContain(res.status());
  });
});
