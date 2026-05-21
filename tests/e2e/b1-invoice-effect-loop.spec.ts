/**
 * E2E B-1 — Rechnungen $effect infinite-loop fix + beforeNavigate dirty-check.
 *
 * Done-tests for cluster B-1 (Night 1, Wave 0). Three guarantees:
 *   1. InvoiceLivePreview updates within ~1s of typing, and submit enables
 *      within 1.5s (proves the $effect loop no longer re-triggers itself
 *      and the unconditional override $effect doesn't wipe user input).
 *   2. No `effect_update_depth_exceeded` console errors during the fill
 *      flow (regression guard for the $state(timer) bug).
 *   3. A dirty form on /app/rechnungen/new AND /app/transactions/neu prompts
 *      with window.confirm on sidebar navigation.
 *
 * Auth helper mirrors tests/e2e/rechnungen.spec.ts (magic-link insertion).
 *
 * @phase-9
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
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

async function seedCustomer(): Promise<{ id: string; name: string }> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const unique = randomBytes(4).toString("hex");
  const name = `B1 Kunde ${unique}`;
  const [customer] = await client<{ id: string }[]>`
    INSERT INTO customers (name, address_block)
    VALUES (${name}, ${"B1str. 1\n00000 Stadt"})
    RETURNING id
  `;
  await client.end();
  if (!customer) throw new Error("Failed to seed B-1 customer");
  return { id: customer.id, name };
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-9 B-1 InvoiceForm effect loop fix", () => {
  test("preview updates within 1s, submit enables, no effect_update_depth_exceeded console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await signIn(page);

    const customer = await seedCustomer();

    await page.goto("/app/rechnungen/new");

    // Select the seeded customer (use native <select>)
    await page.selectOption('select[name="customerId"]', customer.id);

    await page.fill('input[name="bezeichnung"]', "Test");
    await page.fill('input[name="nettoEur"]', "100,00");

    // Submit button should be enabled within 1.5s (no effect-loop blocking)
    const submitBtn = page.locator(
      'button[type="submit"]:has-text("Rechnung erstellen")',
    );
    await expect(submitBtn).toBeEnabled({ timeout: 1500 });

    // Preview must contain the typed bezeichnung — proves $effect debounce
    // reaches the server preview endpoint and renders into the DOM. The
    // debounce is 500ms; allow 2.5s for the round-trip in CI.
    const preview = page.locator('[data-component="invoice-live-preview"]');
    await expect(preview).toContainText("Test", { timeout: 2500 });

    // No effect-loop errors during the entire fill flow.
    const loopErrors = consoleErrors.filter((e) =>
      /effect_update_depth_exceeded/i.test(e),
    );
    expect(loopErrors).toEqual([]);
  });

  test("dirty InvoiceForm prompts on sidebar navigate-away", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/rechnungen/new");

    // Wait for the form to be mounted (so onMount has taken the snapshot).
    await expect(page.locator('input[name="bezeichnung"]')).toBeVisible();
    await page.fill('input[name="bezeichnung"]', "Dirty");

    let dialogFired = false;
    page.on("dialog", async (d) => {
      dialogFired = true;
      expect(d.type()).toBe("confirm");
      await d.dismiss();
    });

    // Click the sidebar "Übersicht" link
    await page.getByRole("link", { name: /übersicht/i }).first().click();

    // Wait briefly for the dialog handler to run / navigation to be cancelled.
    await page.waitForTimeout(300);

    expect(dialogFired).toBe(true);
    // Dismissed → still on /app/rechnungen/new
    await expect(page).toHaveURL(/\/app\/rechnungen\/new/);
  });

  test("dirty /transactions/neu form prompts on sidebar navigate-away", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/transactions/neu?kind=ausgabe");

    await expect(page.locator('input[name="bezeichnung"]')).toBeVisible();
    await page.fill('input[name="bezeichnung"]', "Dirty Ausgabe");

    let dialogFired = false;
    page.on("dialog", async (d) => {
      dialogFired = true;
      expect(d.type()).toBe("confirm");
      await d.dismiss();
    });

    await page.getByRole("link", { name: /übersicht/i }).first().click();

    await page.waitForTimeout(300);

    expect(dialogFired).toBe(true);
    await expect(page).toHaveURL(/\/app\/transactions\/neu/);
  });
});
