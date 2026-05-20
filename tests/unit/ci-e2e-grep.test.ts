import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cycle 3 — F3: lock in the contract that `.github/workflows/ci.yml`'s e2e
 * grep covers every tag we ship tests under.
 *
 * Background: CI runs `pnpm test:e2e --grep '@phase-0|@phase-1|@phase-2'`.
 * Before the F3 fix the PWA share_target spec was tagged @phase-7 and
 * silently never executed in CI — the share_target prod-build regression
 * (F1) could land any time without anyone noticing. This test guards
 * against a recurrence: any new untagged or off-grep critical-path test
 * fails the unit-and-types job locally and on PR before the e2e job even
 * spins up.
 */

const repoRoot = resolve(__dirname, "..", "..");
const ciYmlPath = resolve(repoRoot, ".github", "workflows", "ci.yml");
const e2eDir = resolve(repoRoot, "tests", "e2e");

function extractCiGrep(ciYml: string): string[] {
  const m = ciYml.match(/--grep\s+'([^']+)'/);
  if (!m) throw new Error("could not find --grep in ci.yml");
  return m[1]!.split("|").map((t) => t.trim());
}

function extractDescribeTags(specSrc: string): string[] {
  const tags: string[] = [];
  // Accept plain test.describe(), .serial(), .only(), .skip(), .parallel().
  // The (?:\.\w+)? bit lets the meta-test pick up chained variants without
  // each cluster having to restructure its describe blocks.
  const re = /test\.describe(?:\.\w+)?\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(specSrc)) !== null) {
    const title = m[1]!;
    const tag = title.match(/@[a-z0-9-]+/i);
    if (tag) tags.push(tag[0]);
  }
  return tags;
}

describe("CI e2e grep coverage (F3)", () => {
  const ciYml = readFileSync(ciYmlPath, "utf8");
  const grepTags = extractCiGrep(ciYml);

  it("ci.yml e2e grep declares the core phase tags", () => {
    expect(grepTags).toContain("@phase-0");
    expect(grepTags).toContain("@phase-1");
    expect(grepTags).toContain("@phase-2");
  });

  it("PWA share_target spec is covered by the CI grep (F3)", () => {
    const pwaSpec = readFileSync(resolve(e2eDir, "pwa.spec.ts"), "utf8");
    const pwaTags = extractDescribeTags(pwaSpec);
    expect(pwaTags.length).toBeGreaterThan(0);
    const covered = pwaTags.some((t) => grepTags.includes(t));
    expect(
      covered,
      `pwa.spec.ts describe tag(s) ${JSON.stringify(pwaTags)} not in CI grep ${JSON.stringify(grepTags)}`,
    ).toBe(true);
  });

  // The set of "release-critical" specs that MUST be covered by every CI run.
  // PWA is on this list because the share_target POST is the primary
  // untrusted-origin entry point into the public Auslage form (CSRF-bypass
  // surface). Add others here as new critical-path entry points ship.
  const criticalSpecs = ["pwa.spec.ts"];

  it("every release-critical spec has at least one tag in the CI grep", () => {
    const failures: string[] = [];
    for (const spec of criticalSpecs) {
      const src = readFileSync(resolve(e2eDir, spec), "utf8");
      const tags = extractDescribeTags(src);
      if (tags.length === 0) {
        failures.push(`${spec}: no @-tag found on any test.describe()`);
        continue;
      }
      if (!tags.some((t) => grepTags.includes(t))) {
        failures.push(
          `${spec}: tags ${JSON.stringify(tags)} not in CI grep ${JSON.stringify(grepTags)}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  // Belt-and-braces sanity: walk the whole e2e directory and confirm that
  // any spec we ship has at least one describe-tag (uncovered files would
  // never be greppable). Informational on the tags-vs-grep diff.
  it("every e2e spec declares at least one @-tagged describe block", () => {
    const specs = readdirSync(e2eDir).filter((f) => f.endsWith(".spec.ts"));
    const untagged: string[] = [];
    for (const spec of specs) {
      const src = readFileSync(resolve(e2eDir, spec), "utf8");
      const tags = extractDescribeTags(src);
      if (tags.length === 0) untagged.push(spec);
    }
    expect(
      untagged,
      `the following e2e specs have no tagged describe block and will never run in CI: ${untagged.join(", ")}`,
    ).toEqual([]);
  });
});
