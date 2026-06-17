// @vitest-environment node
/**
 * Aurora slice 1 — zombie-pink sweep (spec §3 "Cleanup (no zombies)").
 *
 * The legacy brand pink (be185d) must be deleted, not aliased. The ONLY
 * surviving text-file sites are the slice-2 iOS-chrome handoff (launch
 * overlay + status-bar scrim in app.html), enumerated in an allowlist that
 * may only ever SHRINK. Binary assets (splash/icon PNGs) are excluded by
 * extension and get regenerated in slice 2.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");

const SCAN_ROOTS = ["src", "static", "scripts"];
const TEXT_EXTENSIONS = [
  ".svelte",
  ".ts",
  ".js",
  ".css",
  ".html",
  ".svg",
  ".json",
  ".webmanifest",
  ".md",
  ".txt",
];

// Slice-2 handoff (spec §5 iOS chrome): aurora-2-shell re-skins the
// #fdw-launch overlay, deletes the .pwa-statusbar-scrim, switches the
// status-bar style, and regenerates splash/icons. Until then app.html
// legitimately carries the legacy pink in those two inline-CSS sites.
const SLICE_2_HANDOFF = new Set(["src/app.html"]);

const LEGACY_PINK = ["#be185d", "be185d"] as const;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

describe("Aurora brand sweep — no zombie legacy pink", () => {
  it("legacy pink survives only at the documented slice-2 handoff sites", () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(resolve(repoRoot, root))) {
        if (!TEXT_EXTENSIONS.some((ext) => file.endsWith(ext))) continue;
        const rel = relative(repoRoot, file);
        if (SLICE_2_HANDOFF.has(rel)) continue;
        const content = readFileSync(file, "utf8").toLowerCase();
        if (LEGACY_PINK.some((p) => content.includes(p))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("allowlist entries still need the handoff (delete entries as slice 2 cleans them)", () => {
    for (const rel of SLICE_2_HANDOFF) {
      const content = readFileSync(
        resolve(repoRoot, rel),
        "utf8",
      ).toLowerCase();
      expect(
        content.includes("be185d"),
        `${rel} no longer contains the legacy pink — remove it from SLICE_2_HANDOFF`,
      ).toBe(true);
    }
  });
});
