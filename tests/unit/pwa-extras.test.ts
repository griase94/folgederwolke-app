import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cluster C5 — cycle 2.
 *
 * Asserts the additional scope items beyond the icon pack:
 *   - PM-007: hooks.server.ts redirects /app?source=pwa → /auslage-einreichen
 *             when the user is unauthenticated.
 *   - PM-020: an OfflineBanner.svelte component exists and is mounted in
 *             both the admin shell and the public Auslagen page.
 *   - PM-006: vite.config.ts ships a background-sync queue for
 *             POST /auslage-einreichen (named fdw-auslage-queue).
 */

const repoRoot = resolve(__dirname, "..", "..");

describe("PM-007 — hooks.server.ts redirects unauthed PWA launches to the public form", () => {
  const hooks = readFileSync(resolve(repoRoot, "src/hooks.server.ts"), "utf8");

  it("inspects source=pwa search-param", () => {
    expect(hooks).toMatch(/source.*pwa/);
  });

  it("redirects to /auslage-einreichen instead of /sign-in for that branch", () => {
    expect(hooks).toMatch(/\/auslage-einreichen\?source=pwa/);
  });
});

describe("PM-020 — OfflineBanner.svelte exists and is mounted", () => {
  const banner = resolve(
    repoRoot,
    "src/lib/components/pwa/OfflineBanner.svelte",
  );

  it("component file exists", () => {
    expect(existsSync(banner)).toBe(true);
  });

  it("listens for window 'online'/'offline' events + reads navigator.onLine", () => {
    const src = readFileSync(banner, "utf8");
    expect(src).toMatch(/navigator\.onLine/);
    expect(src).toMatch(/['"]online['"]/);
    expect(src).toMatch(/['"]offline['"]/);
  });

  it("is mounted in AdminShell", () => {
    const shell = readFileSync(
      resolve(repoRoot, "src/lib/components/admin/AdminShell.svelte"),
      "utf8",
    );
    expect(shell).toMatch(/OfflineBanner/);
  });

  it("is mounted on the public Auslagen page", () => {
    const page = readFileSync(
      resolve(repoRoot, "src/routes/auslage-einreichen/+page.svelte"),
      "utf8",
    );
    expect(page).toMatch(/OfflineBanner/);
  });
});

describe("PM-006 — vite.config.ts wires the background-sync queue for the public form", () => {
  const cfg = readFileSync(resolve(repoRoot, "vite.config.ts"), "utf8");

  it("references the /auslage-einreichen POST path", () => {
    expect(cfg).toMatch(/\/auslage-einreichen/);
  });

  it("declares the fdw-auslage-queue background-sync name", () => {
    expect(cfg).toMatch(/fdw-auslage-queue/);
  });

  it("uses NetworkOnly handler + backgroundSync option", () => {
    expect(cfg).toMatch(/NetworkOnly/);
    expect(cfg).toMatch(/backgroundSync/);
  });

  it("declares maxRetentionTime so the queue auto-purges after a day", () => {
    expect(cfg).toMatch(/maxRetentionTime/);
  });
});
