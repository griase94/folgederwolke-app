#!/usr/bin/env node
/**
 * scripts/check-bundle-size.mjs
 *
 * Post-build client JS bundle size gate.
 *
 * Asserts that neither the largest individual chunk nor the total client JS
 * (all .js files under .svelte-kit/output/client/_app/immutable/) exceed the
 * documented thresholds. Thresholds are set ~10 % above the sizes measured
 * at the time this gate was introduced (PR0 — Measurement baseline).
 *
 * Baseline (2026-06-04, before PR0 changes land):
 *   largest chunk : ~420 KB  →  threshold 462 KB
 *   total client JS: ~1 734 KB  →  threshold 1 908 KB
 *
 * PRIMARY intent: prevent an accidental re-bundling of pdfjs-dist (or another
 * large library) into the synchronous client bundle. The lazy-load split
 * achieved in a prior phase is what this gate locks in.
 *
 * Run manually:
 *   node scripts/check-bundle-size.mjs
 *
 * Wired into CI (build job) via:
 *   pnpm build && node scripts/check-bundle-size.mjs
 *
 * For a full Lighthouse audit against a running preview server, install
 * @lhci/cli (already a devDependency) and run:
 *   pnpm exec lhci autorun
 * (requires lighthouserc.cjs and a running `node build` server)
 */

import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- configuration -------------------------------------------------- //

const IMMUTABLE_DIR = join(
  fileURLToPath(import.meta.url),
  "../../.svelte-kit/output/client/_app/immutable",
);

// Thresholds in bytes (~10 % headroom above PR0 baseline).
// Bumped after the final-board UI pass (PDF-retry recovery, Dateien Aurora
// redesign, dashboard/Beiträge empty states, mobile-responsive rows) added
// ~2 KB of justified client JS.
const LARGEST_CHUNK_LIMIT = 462_000; // 462 KB
const TOTAL_JS_LIMIT = 1_930_000; // 1 930 KB

// ---------- helpers -------------------------------------------------------- //

/** Recursively collect all .js file sizes under a directory. */
function collectJsSizes(dir) {
  const sizes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      sizes.push(...collectJsSizes(fullPath));
    } else if (entry.isFile() && extname(entry.name) === ".js") {
      sizes.push({ path: fullPath, size: statSync(fullPath).size });
    }
  }
  return sizes;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

// ---------- main ----------------------------------------------------------- //

let files;
try {
  files = collectJsSizes(IMMUTABLE_DIR);
} catch {
  console.error("[check-bundle-size] ERROR: could not read output directory.");
  console.error("  Did you run `pnpm build` first?");
  console.error("  Expected:", IMMUTABLE_DIR);
  process.exit(1);
}

if (files.length === 0) {
  console.error(
    "[check-bundle-size] ERROR: no .js files found in",
    IMMUTABLE_DIR,
  );
  process.exit(1);
}

const largest = files.reduce((a, b) => (a.size > b.size ? a : b));
const totalSize = files.reduce((sum, f) => sum + f.size, 0);

let failed = false;

console.log("[check-bundle-size] Scanning", files.length, "client JS files…");
console.log(
  "  Largest chunk :",
  kb(largest.size),
  `(${largest.path.replace(IMMUTABLE_DIR, "").slice(1)})`,
);
console.log("  Total JS      :", kb(totalSize));
console.log(
  "  Limits        : largest",
  kb(LARGEST_CHUNK_LIMIT),
  "/ total",
  kb(TOTAL_JS_LIMIT),
);

if (largest.size > LARGEST_CHUNK_LIMIT) {
  console.error(
    `\n[check-bundle-size] FAIL: largest chunk ${kb(largest.size)} exceeds limit ${kb(LARGEST_CHUNK_LIMIT)}`,
  );
  console.error("  File:", largest.path);
  failed = true;
}

if (totalSize > TOTAL_JS_LIMIT) {
  console.error(
    `\n[check-bundle-size] FAIL: total client JS ${kb(totalSize)} exceeds limit ${kb(TOTAL_JS_LIMIT)}`,
  );
  failed = true;
}

if (failed) {
  console.error(
    "\n[check-bundle-size] Bundle has grown beyond acceptable thresholds.",
  );
  console.error(
    "Review recent changes for accidental eager-imports of large libraries.",
  );
  console.error(
    "If the growth is intentional, update the thresholds in this script.",
  );
  process.exit(1);
}

console.log("\n[check-bundle-size] OK — bundle within limits.");
