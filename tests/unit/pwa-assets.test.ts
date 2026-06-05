import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// Extract startup-image hrefs (app.html is prettier-formatted multi-line; _links.html
// is single-line — so compare the SET of hrefs, not bytes).
const startupHrefs = (s: string): string[] =>
  [...s.matchAll(/apple-touch-startup-image"[^>]*?href="([^"]+)"/gs)]
    .map((m) => m[1])
    .filter((h): h is string => h !== undefined)
    .sort();

describe("PWA assets", () => {
  const html = readFileSync(join(ROOT, "src/app.html"), "utf8");

  it("app.html startup-image hrefs match the generated static/splash/_links.html set", () => {
    const links = readFileSync(join(ROOT, "static/splash/_links.html"), "utf8");
    const inHtml = startupHrefs(html);
    const inLinks = startupHrefs(links);
    expect(inHtml.length).toBeGreaterThan(0);
    expect(inHtml).toEqual(inLinks);
  });

  it("every startup-image href + manifest icon file exists under static/", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "static/manifest.webmanifest"), "utf8"),
    ) as { icons: { src: string }[] };
    const paths = [...startupHrefs(html), ...manifest.icons.map((i) => i.src)];
    const missing = paths.filter((p) => !existsSync(join(ROOT, "static", p)));
    expect(missing).toEqual([]);
  });

  it("ships the marble favicon set and no flat SVG favicon", () => {
    expect(html).not.toContain('href="/favicon.svg"');
    for (const f of [
      "favicon.ico",
      "favicon-16.png",
      "favicon-32.png",
      "favicon-96.png",
      "apple-touch-icon.png",
    ]) {
      expect(existsSync(join(ROOT, "static", f))).toBe(true);
    }
  });
});
