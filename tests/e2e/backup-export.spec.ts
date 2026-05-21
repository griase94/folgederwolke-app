/**
 * @phase-9 Backup-Export — admin clicks "ZIP herunterladen" and gets a
 * non-trivial ZIP containing the expected CSV files + manifest.
 *
 * Strategy: sign in as admin (magic-link bypass via direct DB insert), then
 * intercept the browser download triggered by the "Backup-Export" anchor on
 * /app/einstellungen.
 *
 * H3 assertion strength: previous draft was structural-truthy only — a
 * 0-byte response named .zip would have passed. This test asserts byte size
 * and inspects the archive's file list via JSZip.
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import JSZip from "jszip";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signInAsAdmin(page: Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  try {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
    await client`
      INSERT INTO magic_links (token_hash, email_canonical, expires_at)
      VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
    `;
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    const mismatch = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mismatch.click();
    }
    await Promise.all([
      page.waitForURL(/\/app/, { timeout: 15_000 }),
      page.click('button[type="submit"]'),
    ]);
  } finally {
    await client.end();
  }
}

const EXPECTED_FILES = [
  "members.csv",
  "projects.csv",
  "customers.csv",
  "income.csv",
  "expenses.csv",
  "invoices.csv",
  "auslagen_submissions.csv",
  "settings.csv",
  "files.csv",
  "manifest.json",
  "README.md",
] as const;

test.describe("@phase-9 Backup-Export", () => {
  test("admin downloads a real ZIP containing the expected files", async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.goto("/app/einstellungen");

    // Disclaimer copy is the user-facing reminder that this is NOT a
    // Festschreibungs-bundle. Assert it's present so a future copy edit
    // doesn't silently drop the warning.
    await expect(
      page.getByText(/KEIN Ersatz für den jahresabschluss-bundle\.zip/i),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("backup-export-button").click();
    const download = await downloadPromise;

    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();

    // Byte-size sanity. EOCD + manifest + README + ten empty CSVs is well
    // above 500 bytes — a hung 0-byte stream would fail here.
    const stat = await fs.stat(savedPath!);
    expect(stat.size).toBeGreaterThan(500);

    // Suggested filename uses the date stamp + .zip extension.
    expect(download.suggestedFilename()).toMatch(
      /^folgederwolke-backup-\d{4}-\d{2}-\d{2}\.zip$/,
    );

    // Inspect ZIP structure via JSZip (already a project dep — avoids
    // pulling in @zip.js/zip.js just for the test).
    const buf = await fs.readFile(savedPath!);
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    for (const expected of EXPECTED_FILES) {
      expect(names, `${expected} in ZIP`).toContain(expected);
    }

    const manifestRaw = await zip.file("manifest.json")!.async("string");
    const manifest = JSON.parse(manifestRaw) as {
      schema_version: number;
      tables: Record<string, number>;
    };
    expect(manifest.schema_version).toBe(1);
    expect(manifest.tables.settings).toBeGreaterThanOrEqual(1);
  });
});
