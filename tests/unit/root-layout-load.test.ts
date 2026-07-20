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

// The load now reads the fdw_mode / fdw_theme cookies (F1 dark mode), so the
// event must carry a `cookies` accessor. Build a minimal one per cookie jar.
/* eslint-disable @typescript-eslint/no-explicit-any */
const runLoad = (jar: Record<string, string> = {}) =>
  (load as any)({ cookies: { get: (name: string) => jar[name] } } as any);
/* eslint-enable @typescript-eslint/no-explicit-any */

describe.skipIf(!dbConfigured)("root layout load", () => {
  it("returns a non-empty vereinName from readStammdaten", async () => {
    const result = await runLoad();
    expect(typeof result.vereinName).toBe("string");
    expect(result.vereinName).toBeTruthy();
    // .env.test sets VEREIN_NAME="Folge der Wolke e.V. (TEST)" → env-fallback.
    expect(result.vereinName).toContain("Folge der Wolke");
  });

  it("still exposes publicFormEnabled", async () => {
    const result = await runLoad();
    expect(typeof result.publicFormEnabled).toBe("boolean");
  });

  it("resolves mode + theme from the cookies (F1 dark mode)", async () => {
    const empty = await runLoad();
    expect(empty.mode).toBe("system");
    expect(empty.theme).toBe("aurora");
    const dark = await runLoad({ fdw_mode: "dark" });
    expect(dark.mode).toBe("dark");
  });
});
