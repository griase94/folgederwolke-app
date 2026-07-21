/**
 * @aurora-impl-b-zb
 *
 * Zuwendungsbestätigung Werkstatt-Split (B-PR4). The happy-path round-trip that
 * the redesign's whole value rests on — checklist-green → Ausstellen → B-Nr
 * erscheint → PDF-Download 200 — plus the checklist↔server parity guards: the
 * two server-422 reasons (Aufwandsspende, fehlendes Zuwendungsdatum) must show
 * as blocking .miss rows with a disabled CTA, so a green checklist can never
 * click into an invisible 422 no-op.
 *
 * Needs isBescheinigungEnabled()=true — the playwright webServer sets the
 * Bescheid env (VEREIN_BESCHEID_TYP/DATUM/VZ).
 */
import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
  await client`INSERT INTO magic_links (token_hash, email_canonical, expires_at) VALUES (${sha256(rawToken)}, ${adminEmail}, ${expiresAt})`;
  await client.end();
  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false))
    await mismatch.click();
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

/** Create a complete extern Geldspende; returns its detail-route id. */
async function createGeldspende(
  page: import("@playwright/test").Page,
): Promise<string> {
  await page.goto("/app/spenden/neu");
  await page.click('[data-testid="spendeart-geldspende"]');
  await page.click('[data-testid="zweckbindung-zweckfrei"]');
  await page.click('[data-testid="spender-mode-extern"]');
  const uniq = randomBytes(3).toString("hex");
  await page.fill(
    '[data-testid="spender-name-input"]',
    `Ines Achleitner ${uniq}`,
  );
  await page.fill(
    '[data-testid="spender-adresse-input"]',
    "Sonnenstraße 14, 80333 München",
  );
  await page.fill("#betrag-display", "150.00");
  const d = page.locator("input#zugewendet_am");
  await d.fill("12.03.2026");
  await d.blur();
  await page.click('form#entry-form button[type="submit"]');
  await page.waitForURL(/\/app\/spenden\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}

async function mutateDonation(id: string, sql: string): Promise<void> {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  const client = postgres(url, { prepare: false, max: 1 });
  await client.unsafe(sql, [id]);
  await client.end();
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@aurora-impl-b-zb Zuwendungsbestätigung Werkstatt", () => {
  test("round-trip: checklist green → Ausstellen → B-Nr erscheint → PDF 200", async ({
    page,
  }) => {
    await signIn(page);
    const id = await createGeldspende(page);
    const zb = `/app/spenden/${id}/zuwendungsbestaetigung`;
    await page.goto(zb);

    // Checklist all-green, no .miss, CTA enabled.
    await expect(page.getByTestId("bescheinigung-document")).toBeVisible();
    await expect(page.locator(".ck-item.miss")).toHaveCount(0);
    const issue = page.getByTestId("issue-bescheinigung-btn");
    await expect(issue).toBeEnabled();

    // Issue → the real B-Nr appears (nr-display), no error banner.
    await issue.click();
    const nr = page.getByTestId("bescheinigung-nr-display");
    await expect(nr).toBeVisible({ timeout: 10_000 });
    await expect(nr).toContainText(/B-\d{4}-\d{3}/);
    await expect(page.getByTestId("bescheinigung-error")).toHaveCount(0);

    // PDF download responds 200.
    const res = await page.request.get(`${zb}/pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
  });

  test("Aufwandsspende: blocking .miss row + CTA disabled (no silent 422)", async ({
    page,
  }) => {
    await signIn(page);
    const id = await createGeldspende(page);
    await mutateDonation(
      id,
      "UPDATE donations SET spende_kind = 'aufwandsspende' WHERE id = $1",
    );
    await page.goto(`/app/spenden/${id}/zuwendungsbestaetigung`);
    await expect(
      page.locator(".ck-item.miss", { hasText: "Zuwendungsart bescheinigbar" }),
    ).toBeVisible();
    await expect(page.getByTestId("issue-bescheinigung-btn")).toBeDisabled();
  });

  test("fehlendes Zuwendungsdatum: blocking .miss row + CTA disabled", async ({
    page,
  }) => {
    await signIn(page);
    const id = await createGeldspende(page);
    await mutateDonation(
      id,
      "UPDATE donations SET zugewendet_am = NULL WHERE id = $1",
    );
    await page.goto(`/app/spenden/${id}/zuwendungsbestaetigung`);
    await expect(
      page.locator(".ck-item.miss", { hasText: "Tag der Zuwendung" }),
    ).toBeVisible();
    await expect(page.getByTestId("issue-bescheinigung-btn")).toBeDisabled();
  });
});
