// @vitest-environment node
/**
 * Aurora slice 1 — token-contract guard (spec §3, master plan §2.1).
 *
 * Task 1.1 portion: the static @theme pink-ramp block at the end of app.css
 * is deleted (it overrode the `@theme inline` var-mapping, making
 * [data-theme] swaps inert), and InboxCard no longer consumes shade
 * utilities. Task 1.3 replaces this file with the full token assertions.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const appCss = readFileSync(resolve(repoRoot, "src", "app.css"), "utf8");
const inboxCard = readFileSync(
  resolve(
    repoRoot,
    "src",
    "lib",
    "components",
    "admin",
    "inbox",
    "InboxCard.svelte",
  ),
  "utf8",
);

describe("Aurora task #1 — static @theme pink ramp deleted", () => {
  it("app.css has no static @theme block (only @theme inline may remain)", () => {
    // `@theme inline {` does NOT match this regex (` inline` sits between).
    expect(appCss).not.toMatch(/@theme\s*\{/);
  });

  it("app.css defines no primary shade ramp", () => {
    expect(appCss).not.toContain("--color-primary-50");
    expect(appCss).not.toContain("--color-primary-700");
  });

  it("InboxCard no longer consumes shade utilities", () => {
    expect(inboxCard).not.toContain("primary-50");
  });
});
