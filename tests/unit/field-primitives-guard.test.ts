/**
 * The field primitives are the only way to draw a field (SLOT-FELD, §0.5).
 *
 * Before SLOT-FELD the app had 29 raw `<select>` in about a dozen anatomies
 * (h-9, h-10, h-11, min-h-9 and one styled entirely in scoped CSS) and 14 raw
 * `<textarea>` in five more — because there was no Kit select or textarea to
 * reach for. Now there is, so a raw element is a drift, not a choice:
 *
 *   `<select>`   → `$lib/components/ui/select` (FIELD_CLASS + the one chevron)
 *   `<textarea>` → `$lib/components/ui/textarea` (FIELD_CLASS minus the fixed
 *                  height, plus min-h-20 and resize-y)
 *
 * `<input>` is deliberately NOT banned: it has too many legitimate types
 * (checkbox, radio, file, hidden) and the ones that are fields carry
 * FIELD_CLASS, which `control-height-canon.test.ts` pins.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** The primitives themselves — this is where the raw element belongs. */
const ALLOWED = [
  "src/lib/components/ui/select/select.svelte",
  "src/lib/components/ui/textarea/textarea.svelte",
];

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...svelteFiles(abs));
    else if (entry.endsWith(".svelte")) out.push(abs);
  }
  return out;
}

/** Opening tags of a raw lowercase element (the Kit ones are capitalised). */
function rawTags(src: string, tag: "select" | "textarea"): string[] {
  return src.match(new RegExp(`<${tag}\\b`, "g")) ?? [];
}

describe("field primitives — no raw select/textarea outside the Kit", () => {
  const files = svelteFiles(SRC).filter(
    (abs) => !ALLOWED.includes(relative(ROOT, abs)),
  );

  it.each(["select", "textarea"] as const)("no raw <%s> in src/", (tag) => {
    const offenders = files
      .filter((abs) => rawTags(readFileSync(abs, "utf-8"), tag).length > 0)
      .map((abs) => relative(ROOT, abs));
    expect(
      offenders,
      `raw <${tag}> found — use $lib/components/ui/${tag} so the field baseline can never drift again`,
    ).toEqual([]);
  });

  it("the scan reaches the source tree and its detector fires (self-test)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(rawTags('<select name="x">', "select")).toHaveLength(1);
    expect(rawTags("<Select name={x}>", "select")).toHaveLength(0);
    expect(rawTags("<textarea rows={2}>", "textarea")).toHaveLength(1);
    expect(rawTags("<Textarea rows={2}>", "textarea")).toHaveLength(0);
  });
});
