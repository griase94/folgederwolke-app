/**
 * White-label Phase 1 — root layout exposes a runtime `vereinName`.
 *
 * The root +layout.server.ts load now reads `readStammdaten()` (settings → env
 * fallback) so every page can thread `$page.data.vereinName` into chrome,
 * titles, and payer labels instead of a hardcoded "Folge der Wolke" literal.
 */

import { describe, it, expect } from "vitest";
import { load } from "../../src/routes/+layout.server.ts";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("root layout load", () => {
  it("returns a non-empty vereinName from readStammdaten", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (load as any)({} as any);
    expect(typeof result.vereinName).toBe("string");
    expect(result.vereinName).toBeTruthy();
    // .env.test sets VEREIN_NAME="Folge der Wolke e.V. (TEST)" → env-fallback.
    expect(result.vereinName).toContain("Folge der Wolke");
  });

  it("still exposes publicFormEnabled", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (load as any)({} as any);
    expect(typeof result.publicFormEnabled).toBe("boolean");
  });
});
