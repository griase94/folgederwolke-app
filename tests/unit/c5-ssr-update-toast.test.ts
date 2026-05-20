import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cluster C5 — SSR fix.
 *
 * `UpdateAvailableToast.svelte` (mounted via AdminShell on every /app/* page)
 * imports `useRegisterSW` from `virtual:pwa-register/svelte` and calls it at
 * module top-level. The vite-plugin-pwa implementation dereferences
 * `navigator` synchronously inside `useRegisterSW`, which is undefined on the
 * Node / adapter-vercel SSR side. Every authenticated request to /app/*
 * logged `ReferenceError: navigator is not defined`.
 *
 * Fix: guard the call with SvelteKit's `browser` flag (`if (browser) { ... }`)
 * or move it into `onMount` so it only runs client-side.
 *
 * These tests are file-content assertions (matching the house style of
 * tests/unit/pwa-extras.test.ts) — they pin the guard so future edits cannot
 * silently reintroduce the SSR crash.
 */

const repoRoot = resolve(__dirname, "..", "..");
const toastPath = resolve(
  repoRoot,
  "src/lib/components/pwa/UpdateAvailableToast.svelte",
);
const toastSrc = readFileSync(toastPath, "utf8");

describe("C5 SSR navigator guard — UpdateAvailableToast.svelte", () => {
  it("does not call useRegisterSW at module top-level", () => {
    // A top-level call looks like `const ... = useRegisterSW(`
    // (i.e. the call site is at depth-0 inside the <script> block, with no
    // surrounding `if (browser)` or `onMount(` wrapper).
    //
    // Crude but effective: find the call site, then walk *up* the source and
    // assert one of the guards appears between the <script> open and the call.
    const callIdx = toastSrc.indexOf("useRegisterSW(");
    expect(callIdx).toBeGreaterThan(-1);

    const scriptOpenIdx = toastSrc.indexOf("<script");
    expect(scriptOpenIdx).toBeGreaterThan(-1);

    const between = toastSrc.slice(scriptOpenIdx, callIdx);

    // Must be guarded by `browser` (from $app/environment) or wrapped in
    // onMount(...) so the call is deferred to a client-only context.
    const hasBrowserImport = /from\s+['"]\$app\/environment['"]/.test(between);
    const hasBrowserGuard = /\bif\s*\(\s*browser\s*\)/.test(between);
    const hasOnMountWrap = /\bonMount\s*\(/.test(between);

    expect(
      (hasBrowserImport && hasBrowserGuard) || hasOnMountWrap,
      "UpdateAvailableToast.svelte must guard useRegisterSW() with `if (browser)` " +
        "(import { browser } from '$app/environment') or wrap it in onMount(...) — " +
        "otherwise SSR throws `ReferenceError: navigator is not defined` on every " +
        "/app/* request.",
    ).toBe(true);
  });

  it("still exposes needRefresh + updateServiceWorker for the template", () => {
    // Regression guard: the toast must continue to drive its template via the
    // same shape, even after the guard is added (e.g. the variables may be
    // declared with `let ...` outside the if-block and assigned inside).
    expect(toastSrc).toMatch(/needRefresh/);
    expect(toastSrc).toMatch(/updateServiceWorker/);
  });

  it("uses useRegisterSW from the virtual:pwa-register/svelte module", () => {
    // We don't want a refactor that drops the upstream integration entirely.
    expect(toastSrc).toMatch(/from\s+['"]virtual:pwa-register\/svelte['"]/);
  });
});
