/**
 * Unit test for the backup-export builder.
 *
 * Verifies:
 *   1. buildBackupZip() returns a non-empty ZIP byte stream
 *   2. The archive contains the expected CSV files (one per exported table)
 *      plus a manifest.json and README.md
 *   3. The manifest carries a schema_version of 1
 *
 * The helper connects as the `app_export` role (SELECT-only, see
 * CLAUDE.md §4.5). The test runner's globalSetup ensures
 * `app_export` has LOGIN + password locally (scripts/db/grant-local-login.sh).
 */

import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildBackupZip } from "$lib/server/backup/build-zip.js";

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

describe("buildBackupZip", () => {
  it("returns a non-empty ZIP containing the expected files", async () => {
    const bytes = await buildBackupZip();
    expect(bytes.byteLength).toBeGreaterThan(100);

    const zip = await JSZip.loadAsync(Buffer.from(bytes));
    const names = Object.keys(zip.files);
    for (const expected of EXPECTED_FILES) {
      expect(names, `${expected} should be in the ZIP`).toContain(expected);
    }

    const manifestRaw = await zip.file("manifest.json")!.async("string");
    const manifest = JSON.parse(manifestRaw) as {
      schema_version: number;
      exported_at: string;
      tables: Record<string, number>;
    };
    expect(manifest.schema_version).toBe(1);
    expect(manifest.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Settings is the only table guaranteed by the seed to be non-empty
    // (single row with festschreibung defaults). Other tables can be 0.
    expect(manifest.tables.settings).toBeGreaterThanOrEqual(1);
  });
});
