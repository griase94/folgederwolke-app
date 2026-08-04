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
//
// F2 dataviz family, 2026-07-20, PR #139: the dashboard now adopts three
// chart components (SaldoVerlauf, SphaerenBars, AgingRail + _shared geometry/
// format helpers), which is genuine new client JS. The dev-only chart gallery
// and the other eleven chart forms are kept OUT of the prod bundle via a
// DEV-gated dynamic import (src/routes/app/dev/charts), so this bump reflects
// only the legitimate dashboard cost. Measured total 1 902.4 KiB → limit set
// to new actual + ~5 % headroom.
//
// Aurora impl wave 1, 2026-07-21: the F2 headroom was consumed by three
// feature lanes stacking genuine new client JS on top of the dashboard —
// B1 transaktionen feed (#140), E1 Kunden-Kette (#141) and E2 Rechnungs-Kette
// (list/detail/form + kunde-detail ledger). No single chunk regressed
// (largest still 410.2 KiB, well under its 462 KB gate → pdfjs stays lazy
// split), so this is legitimate cumulative growth, not an accidental
// eager-import. Measured total 1 998.2 KiB → limit set to new actual + ~2.9 %
// headroom, sized to also absorb the in-flight B2 Erfassen-Kette (#143).
//
// Re-anchored 2026-07-21 (B3 Detail-Kette #146): the B2 headroom was consumed
// by B2 (#143), E3 Versand (#145), the Giro-QR mail slot (#147) and B3's
// board-fix batch (edit mode adopting the Erfassen scaffolding, staged-delete
// modals). Largest chunk STILL 410.2 KiB (no eager-import signature), growth
// spread across small route chunks. Measured total 2 061.3 KiB → limit set to
// new actual + ~3.7 % headroom.
//
// Re-anchored 2026-07-28 (A-S1 Public-Kette #162): the B3 headroom was consumed
// by two flows that landed into main since — D-Abschluss (#157, Jahresabschluss/
// EÜR/GoBD read chain) and C1 Mitglieder (#159, matrix/popovers/detail/bericht)
// — plus this PR's A-flow public chain (batch einreichen form, group receipt,
// status groups + the ~15 shared Auslage compositions). Largest chunk STILL
// 410.2 KiB (UNCHANGED — pdfjs stays lazy-split, no eager-import signature); the
// growth is spread across small route + component chunks, i.e. legitimate
// distributed feature growth, not a re-bundle. Measured total 2 168.3 KiB →
// limit set to new actual + ~3 % headroom. (The dev-only Auslage kit gallery at
// src/routes/app/dev/auslagen is DEV-gated + dead-code-eliminated from prod,
// like the chart gallery, so it costs nothing here.)
// Re-anchored 2026-08-04 (Quer-PR NAV/UX-Politur #170): the A-S1 headroom is
// spent — the gate stood at 2 232.4 KiB against an actual 2 228.3 KiB, i.e.
// 4,1 KiB (0,18 %) left. That is a gate about to fail on whatever lands next
// rather than a gate that means anything, so it is re-anchored deliberately,
// with the evidence below, instead of going red by surprise on the next lane.
//
// Where the growth came from, measured on this branch:
//   2 191,8 KiB  after this PR's kit families + the #167/#169 merge
//   2 228,3 KiB  after merging the S2b Portal-Kit (e317a1f)
//   →  +36,5 KiB attributable to the S2b merge alone, which corroborates the
//      +34,2 KiB the A-lane measured for that package independently.
// The step from the previous anchor's 2 168,3 KiB up to 2 191,8 KiB covers
// BOTH main's intervening lanes (#164 Mitglieder, #165, #166, #167, #169) AND
// this PR's new kit (StatCard family, ListToolbar, TogglePill, CreateMenu,
// ListRailLayout, feed filters). That split was not isolated — claiming a
// precise per-PR number here would be false precision.
//
// LEAK CHECK (the thing this gate actually exists for): the largest chunk is
// 410,2 KiB — byte-identical to every re-anchor since 2026-07-21. pdfjs-dist
// still sits in its own 322,4 KiB chunk, separate from the entry, so the lazy
// split is intact and nothing large was pulled into the synchronous bundle.
// The growth is spread across 215 small route/component chunks, which is the
// signature of distributed feature work, not of a re-bundle.
//
// New anchor: actual 2 228,3 KiB + ~5 % headroom. The largest-chunk gate is
// deliberately NOT raised: at 410,2 KiB against 451,2 KiB it still holds ~10 %,
// and it is the half of this gate that guards the pdfjs split — moving it would
// blunt the only tripwire that matters.
const LARGEST_CHUNK_LIMIT = 462_000; // 462 KB (= 451.2 KiB; actual 410.2 KiB)
const TOTAL_JS_LIMIT = 2_396_000; // ~2 339.8 KiB (actual 2 228.3 KiB + ~5 %)

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
