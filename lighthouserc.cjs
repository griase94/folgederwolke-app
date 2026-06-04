/**
 * Lighthouse CI configuration.
 *
 * PRIMARY use: local manual audit to measure performance on the public-facing
 * routes before and after each performance PR.
 *
 *   # 1. Build the app (adapter-node output)
 *   pnpm build
 *
 *   # 2. Set the minimal env vars the preview server needs to boot
 *   #    (only public routes / and /auslage-einreichen are audited — no DB calls)
 *   PORT=9001 ORIGIN=http://localhost:9001 pnpm exec lhci autorun
 *
 * CI bundle-size gate is handled by scripts/check-bundle-size.mjs (wired into
 * the build job in .github/workflows/ci.yml) because lhci requires a running
 * Node server + a headless Chrome install, which adds flakiness risk to the
 * CI matrix. The script-resource-size budget below mirrors the same threshold
 * to keep both gates consistent.
 *
 * If you want to run lhci in CI in the future, add a job that:
 *   1. runs after the build job (or re-runs `pnpm build`)
 *   2. boots `node build/index.js` (not server.js — no CSRF rewrite needed for
 *      GET-only Lighthouse probes)
 *   3. sets PORT, HOST, ORIGIN and any other vars required by env.ts defaults
 *   4. runs `pnpm exec lhci autorun`
 *   5. uploads `lhci-report/` as an artifact
 */

/** @type {import('@lhci/cli').LighthouseRCConfig} */
module.exports = {
  ci: {
    collect: {
      /**
       * adapter-node's compiled server — boots with `node build/index.js`.
       * Mirrors the webServer config in playwright.config.ts (which uses the
       * custom server.js wrapper for share_target CSRF handling, but Lighthouse
       * only issues GET requests so we can use the plain adapter-node entry).
       *
       * Env vars forwarded from the shell so `pnpm exec lhci autorun` picks
       * up PORT / ORIGIN set in the parent shell. The app's env.ts has
       * sensible defaults for all other vars when run without secrets.
       */
      startServerCommand: "node build/index.js",
      startServerReadyPattern: "Listening on",
      startServerReadyTimeout: 30000,
      url: [
        "http://localhost:9001/",
        "http://localhost:9001/auslage-einreichen",
      ],
      numberOfRuns: 1,
      settings: {
        port: 9001,
        // Run in headless mode; skip PWA checks (service worker requires HTTPS).
        preset: "desktop",
        chromeFlags: "--no-sandbox --disable-dev-shm-usage",
        skipAudits: [
          // PWA audits require HTTPS / a deployed origin.
          "service-worker",
          "installable-manifest",
          "apple-touch-icon",
          "splash-screen",
          "themed-color",
          "content-width",
          // third-party cookie warning (not actionable in local audit)
          "uses-http2",
        ],
      },
    },
    assert: {
      preset: "lighthouse:no-pwa",
      assertions: {
        // Lock in the pdfjs lazy-load split: no single script resource on the
        // public routes should exceed ~450 KB uncompressed. Threshold set
        // consistent with scripts/check-bundle-size.mjs (~10 % above baseline).
        "resource-summary:script:size": ["warn", { maxNumericValue: 462000 }],
        // Warn (don't fail) on performance score — the score is noisy in local
        // envs. The bundle-size script is the hard gate; this is informational.
        "categories:performance": ["warn", { minScore: 0.7 }],
      },
    },
    upload: {
      // Store reports locally; do not use temporary-public-storage (which
      // uploads to a public URL and was explicitly excluded in the PR spec).
      target: "filesystem",
      outputDir: "lhci-report",
    },
  },
};
