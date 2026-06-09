/**
 * @phase-8 Export-download e2e — Phase 8 T7 (Tier 2 gate).
 *
 * Navigates to /app/ausgaben, clicks the "Gefilterte Liste als CSV" CTA, and
 * asserts a CSV download fires with:
 *   - Content-Disposition: attachment filename ending in .csv
 *   - Suggested filename matching ausgaben-*.csv
 *   - Non-empty body starting with the UTF-8 BOM (U+FEFF) followed by
 *     the expected header line ("Datum;Buchung-Nr;Bezeichnung;…")
 *
 * Uses the shared loginAs helper (magic-link bypass). The test exercises the
 * real /app/ausgaben/export endpoint via the browser anchor click so it covers
 * the full stack: auth guard → list query → CSV serialiser → response headers.
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

async function signIn(page: Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  try {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await client`
      INSERT INTO magic_links (token_hash, email_canonical, expires_at)
      VALUES (${tokenHash}, ${TEST_ADMIN_EMAIL}, ${expiresAt})
    `;
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    const mismatch = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mismatch.click();
    }
    await Promise.all([
      page.waitForURL(/\/app/, { timeout: 15_000 }),
      page.click('button[type="submit"]').catch(() => {}),
    ]);
  } finally {
    await client.end();
  }
}

test.describe("@phase-8 CSV export download", () => {
  test("Ausgaben tab: clicking 'Gefilterte Liste als CSV' downloads a .csv file with BOM + header", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben");
    // Wait for the list scaffold to render (the export CTA is in the desktop header).
    await page.waitForSelector('[data-testid="export-cta"]', {
      timeout: 10_000,
    });

    // Arm the download event listener BEFORE clicking the anchor.
    const downloadPromise = page.waitForEvent("download");
    await page.click('[data-testid="export-cta"]');
    const download = await downloadPromise;

    // 1. Filename ends with .csv and matches ausgaben-*.csv
    const filename = download.suggestedFilename();
    expect(filename, "filename should end with .csv").toMatch(/\.csv$/);
    expect(filename, "filename should start with ausgaben-").toMatch(
      /^ausgaben-/,
    );

    // 2. Body is non-empty
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const body = Buffer.concat(chunks).toString("utf8");

    // 3. Starts with UTF-8 BOM (U+FEFF, 0xEF 0xBB 0xBF in UTF-8)
    expect(body.charCodeAt(0), "first char should be UTF-8 BOM (U+FEFF)").toBe(
      0xfeff,
    );

    // 4. Header line is present (after the BOM)
    const withoutBom = body.startsWith("﻿") ? body.slice(1) : body;
    const firstLine = withoutBom.split("\r\n")[0] ?? "";
    expect(firstLine, "header must start with Datum").toMatch(/^Datum;/);
    expect(firstLine, "header must contain Buchung-Nr").toContain("Buchung-Nr");
    expect(firstLine, "header must contain Betrag").toContain("Betrag");
  });
});
