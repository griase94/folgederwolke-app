// @vitest-environment node
/**
 * Aurora slice 2 — PageShell enforcement meta-test (spec §4 "Enforcement",
 * master §3 row 2). Pattern: ci-e2e-grep.test.ts criticalSpecs.
 *
 * Every /app +page.svelte must render through the PageShell layout
 * primitive (src/lib/components/layout/PageShell.svelte) — EXCEPT the
 * routes enumerated in ALLOWLIST below, which predate the Aurora redesign.
 *
 * THE ALLOWLIST ONLY EVER SHRINKS:
 *  - a NEW route may never be added here (it must use PageShell from day 1
 *    — the walker fails it otherwise);
 *  - a converted route MUST be removed (the stale-entry assertion fails a
 *    route that uses PageShell while still allowlisted).
 * Slice 2 (Task 2.18) removes the dashboard + inbox + projekte entries;
 * follow-up feature-screen passes (spec §11) burn down the rest.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const appRoutesDir = resolve(repoRoot, "src", "routes", "app");

// Paths relative to src/routes/app, posix separators.
const ALLOWLIST = new Set<string>([
  "ausgaben/[id]/+page.svelte",
  "ausgaben/neu/+page.svelte",
  "dsgvo/+page.svelte",
  "einnahmen/[id]/+page.svelte",
  "einnahmen/neu/+page.svelte",
  "einstellungen/+page.svelte",
  "einstellungen/beitraege/+page.svelte",
  "einstellungen/verein/+page.svelte",
  "files/+page.svelte",
  "files/papierkorb/+page.svelte",
  "jahresabschluss/+page.svelte",
  "jahresabschluss/[year]/+page.svelte",
  "jahresabschluss/[year]/buchungsliste/+page.svelte",
  "jahresabschluss/[year]/exports/+page.svelte",
  "jahresabschluss/[year]/gobd-export/+page.svelte",
  "jahresabschluss/[year]/spenden/+page.svelte",
  "jahresabschluss/[year]/uebersicht/+page.svelte",
  "mitglieder/+page.svelte",
  "mitglieder/[id]/+page.svelte",
  "mitglieder/bericht/[year]/+page.svelte",
  "projekte/[id]/+page.svelte",
  "sheet-resync/+page.svelte",
  "spenden/[id]/+page.svelte",
  "spenden/[id]/zuwendungsbestaetigung/+page.svelte",
  "spenden/neu/+page.svelte",
]);

function* walkPages(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkPages(full);
    } else if (entry === "+page.svelte") {
      yield full;
    }
  }
}

function relPosix(file: string): string {
  return relative(appRoutesDir, file).split("\\").join("/");
}

describe("PageShell allowlist (spec §4 enforcement — shrinking allowlist)", () => {
  const pages = [...walkPages(appRoutesDir)];

  it("found the /app route tree", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it("every /app +page.svelte uses PageShell unless allowlisted", () => {
    const offenders: string[] = [];
    for (const file of pages) {
      const rel = relPosix(file);
      if (ALLOWLIST.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (!src.includes("PageShell")) {
        offenders.push(
          `${rel}: new/converted routes must render through PageShell (master §2.3)`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no stale allowlist entries: converted routes must be REMOVED (list only shrinks)", () => {
    const stale: string[] = [];
    for (const rel of ALLOWLIST) {
      const file = resolve(appRoutesDir, rel);
      const src = readFileSync(file, "utf8");
      if (src.includes("PageShell")) {
        stale.push(`${rel}: uses PageShell — delete its ALLOWLIST entry`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("every allowlist entry still exists on disk (deleted routes must be pruned)", () => {
    const zombies: string[] = [];
    for (const rel of ALLOWLIST) {
      try {
        statSync(resolve(appRoutesDir, rel));
      } catch {
        zombies.push(rel);
      }
    }
    expect(zombies).toEqual([]);
  });
});
