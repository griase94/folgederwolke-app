import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PwaUpdater.svelte — SSR guard, correct registration scope, silent update.
 *
 * Replaces the former UpdateAvailableToast (cluster C5). That toast was mounted
 * only inside AdminShell (so it could never fire on the public form) and relied
 * on a "waiting" service worker that workbox `skipWaiting` removes — so the
 * "Update verfügbar" prompt never appeared. PwaUpdater is headless, mounted in
 * the ROOT layout (app-wide), and applies updates silently by reloading once on
 * `controllerchange` (the reliable signal under skipWaiting + clientsClaim).
 *
 * It registers the worker manually with an ABSOLUTE `/sw.js` + `scope: '/'`.
 * vite-plugin-pwa's own (injected / useRegisterSW) registration uses a
 * path-relative scope (`./`) which 404s on sub-path entries (e.g. a shared link
 * straight to /auslage-einreichen → /auslage-einreichen/sw.js) and silently
 * skips registration there. These file-content assertions (house style) pin the
 * SSR guard, the absolute scope, and the silent-update mechanism.
 */

const repoRoot = resolve(__dirname, "..", "..");
const updaterSrc = readFileSync(
  resolve(repoRoot, "src/lib/components/pwa/PwaUpdater.svelte"),
  "utf8",
);

describe("PwaUpdater.svelte — registration + silent update", () => {
  it("is SSR-safe: touches navigator only behind the browser flag", () => {
    const navIdx = updaterSrc.indexOf("navigator.serviceWorker");
    expect(navIdx).toBeGreaterThan(-1);
    const between = updaterSrc.slice(updaterSrc.indexOf("<script"), navIdx);
    expect(/from\s+['"]\$app\/environment['"]/.test(between)).toBe(true);
    expect(/\bif\s*\(\s*browser\b/.test(between)).toBe(true);
  });

  it("registers the worker with an absolute path and root scope", () => {
    expect(updaterSrc).toMatch(
      /register\(\s*['"]\/sw\.js['"]\s*,\s*\{\s*scope:\s*['"]\/['"]/,
    );
    // Must NOT reintroduce the relative-scope registration that 404s on sub-paths.
    expect(updaterSrc).not.toMatch(/scope:\s*['"]\.\//);
  });

  it("applies updates silently, deferred to the next navigation (no prompt UI)", () => {
    expect(updaterSrc).toMatch(/controllerchange/);
    expect(updaterSrc).toMatch(/location\.reload\(\)/);
    expect(updaterSrc).not.toMatch(/needRefresh/);
    // Must defer the reload to a navigation (afterNavigate) rather than reload
    // immediately on controllerchange — an in-place reload would discard an
    // admin's unsaved form entry, bypassing the beforeNavigate dirty-checks.
    expect(updaterSrc).toMatch(/afterNavigate\(/);
    const cc = updaterSrc.indexOf("controllerchange");
    const reload = updaterSrc.indexOf("location.reload()");
    const after = updaterSrc.indexOf("afterNavigate(");
    // The reload lives inside the afterNavigate handler, after the listener.
    expect(reload).toBeGreaterThan(after);
    expect(after).toBeGreaterThan(cc);
  });

  it("does not gate on a folding env constant (which dead-code-eliminates the body)", () => {
    // Regression guard: gating the registration on `import.meta.env.PROD`/`dev`
    // made this build constant-fold the guard into an always-true early-return
    // and strip the whole body (no SW registered). Keep the work behind the
    // runtime `browser` flag only; dev's missing /sw.js 404 is swallowed.
    expect(updaterSrc).not.toMatch(/import\.meta\.env/);
  });

  it("the obsolete UpdateAvailableToast component is gone", () => {
    expect(
      existsSync(
        resolve(repoRoot, "src/lib/components/pwa/UpdateAvailableToast.svelte"),
      ),
    ).toBe(false);
  });
});
