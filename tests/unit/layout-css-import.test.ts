/**
 * @phase-7.5
 *
 * Smoke test for the root layout's CSS import.
 *
 * Regression net for the "no styles in dev or prod" bug I (the developer
 * agent) hit on 2026-05-19 while running the app locally for the first time:
 *
 *   - `vite.config.ts` did not register `@tailwindcss/vite`
 *   - `src/routes/+layout.svelte` did not import `../app.css`
 *
 * Both were silent failures because no test asserted on rendered CSS — the
 * test-coverage review (CG-4) and ux review (CRIT-3) flagged exactly this
 * gap. This file closes it at the SOURCE level so the assertion fires
 * even without spinning up Vite.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// vitest sets CWD to the project root, so resolve fixtures from there.
const ROOT = process.cwd();

describe("root layout imports app.css", () => {
  it("+layout.svelte has a top-level import of app.css", async () => {
    const src = await readFile(
      join(ROOT, "src/routes/+layout.svelte"),
      "utf-8",
    );
    expect(src).toMatch(/import\s+["']\.\.\/app\.css["']/);
  });

  it("vite.config registers the @tailwindcss/vite plugin", async () => {
    const src = await readFile(join(ROOT, "vite.config.ts"), "utf-8");
    expect(src).toMatch(/from\s+["']@tailwindcss\/vite["']/);
    expect(src).toMatch(/tailwindcss\(\)/);
  });

  it("app.css registers @tailwindcss/typography for prose-styled pages", async () => {
    // /datenschutz + /impressum use the `prose` Tailwind class. Without the
    // typography plugin loaded the class is a no-op and the legal pages
    // render as an unstyled wall of text.
    const css = await readFile(join(ROOT, "src/app.css"), "utf-8");
    expect(css).toMatch(/@plugin\s+["']@tailwindcss\/typography["']/);
  });
});
