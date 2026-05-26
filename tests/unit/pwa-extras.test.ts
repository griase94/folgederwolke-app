import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cluster C5 — cycle 2 (PM-007 superseded by A1, 2026-05-26).
 *
 * Asserts the additional scope items beyond the icon pack:
 *   - A1/PM-007: hooks.server.ts routes an unauthed `?source=pwa` launch through
 *             the role-aware root (`/?source=pwa`), NOT straight to the form.
 *             The start_url is now `/?source=pwa`; this branch only catches
 *             stale installs whose cached start_url is still `/app?source=pwa`,
 *             and the landing then offers both Anmelden and the form (so a
 *             logged-out admin is no longer trapped).
 *   - PM-020: an OfflineBanner.svelte component exists and is mounted in both
 *             the admin shell and the public shell.
 *   - PM-006: vite.config.ts ships a background-sync queue for
 *             POST /auslage-einreichen (named fdw-auslage-queue).
 */

const repoRoot = resolve(__dirname, "..", "..");

describe("A1/PM-007 — hooks.server.ts routes unauthed PWA launches through the role-aware root", () => {
  const hooks = readFileSync(resolve(repoRoot, "src/hooks.server.ts"), "utf8");

  it("inspects source=pwa search-param", () => {
    expect(hooks).toMatch(/source.*pwa/);
  });

  it("routes that branch to the role-aware root, not directly to the form", () => {
    expect(hooks).toMatch(/redirect\(303,\s*["']\/\?source=pwa["']\)/);
    // The old trap (straight to the public form) must not return.
    expect(hooks).not.toMatch(/\/auslage-einreichen\?source=pwa/);
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

  it("is mounted in the public shell layout (covers form, success, status, sign-in)", () => {
    // Moved off the individual page and into the shared (public) shell so every
    // public route shows the offline banner — and carries the escape chrome —
    // without per-page duplication.
    const layout = readFileSync(
      resolve(repoRoot, "src/routes/(public)/+layout.svelte"),
      "utf8",
    );
    expect(layout).toMatch(/OfflineBanner/);
  });
});

describe("PM-005 — share_target POST is handled server-side (no fail(400))", () => {
  const serverPath = resolve(
    repoRoot,
    "src/routes/(public)/auslage-einreichen/+page.server.ts",
  );
  const src = readFileSync(serverPath, "utf8");

  it("the default action inspects source=share before validating", () => {
    // The intercept must run BEFORE the normal validation path so the missing
    // betrag/iban/consent doesn't surface a fail(400) to a share intent.
    expect(src).toMatch(/source.*===.*['"]share['"]/);
  });

  it("the action reads multipart fields matching the manifest share_target params", () => {
    // Manifest declares params: title→bezeichnung_display, text→kommentar_display,
    // url→kommentar_url, files[0]→beleg. The server must read each one.
    expect(src).toMatch(/bezeichnung_display/);
    expect(src).toMatch(/kommentar_display/);
    expect(src).toMatch(/kommentar_url/);
    expect(src).toMatch(/get\(['"]beleg['"]\)/);
  });

  it("the action redirects (303) to a GET with ?from=share so the form renders", () => {
    // 303 See Other is the correct status for POST→GET conversion.
    expect(src).toMatch(/redirect\(303,\s*`\/auslage-einreichen\?/);
    expect(src).toMatch(/from=share|\bfrom['"]?\s*,\s*['"]share['"]/);
  });

  it("the load function hydrates sharePrefill from ?from=share query params", () => {
    expect(src).toMatch(/from.*===.*['"]share['"]/);
    expect(src).toMatch(/sharePrefill/);
  });

  it("the page renders the share-prefill banner and forwards initial values", () => {
    const page = readFileSync(
      resolve(repoRoot, "src/routes/(public)/auslage-einreichen/+page.svelte"),
      "utf8",
    );
    expect(page).toMatch(/data-testid=['"]share-prefill-banner['"]/);
    expect(page).toMatch(/initialBezeichnung/);
    expect(page).toMatch(/initialKommentar/);
  });

  it("the AuslagenForm accepts initialBezeichnung/initialKommentar props", () => {
    const form = readFileSync(
      resolve(repoRoot, "src/lib/components/forms/AuslagenForm.svelte"),
      "utf8",
    );
    expect(form).toMatch(/initialBezeichnung/);
    expect(form).toMatch(/initialKommentar/);
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
