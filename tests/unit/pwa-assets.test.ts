import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// Extract startup-image hrefs (app.html is prettier-formatted multi-line; _links.html
// is single-line — so compare the SET of hrefs, not bytes).
// Parse startup-image <link>s into {media, href} pairs. app.html is prettier-
// formatted (multi-line attributes); _links.html is single-line — so we compare the
// SET of media→href PAIRS (catches a swapped/duplicated media query, not just a
// missing file), order-independent.
const startupLinks = (s: string): { media: string; href: string }[] => {
  const out: { media: string; href: string }[] = [];
  for (const m of s.matchAll(
    /apple-touch-startup-image"[^>]*?media="([^"]+)"[^>]*?href="([^"]+)"/g,
  )) {
    if (m[1] && m[2]) out.push({ media: m[1], href: m[2] });
  }
  return out;
};
const pairKey = (p: { media: string; href: string }): string =>
  `${p.media} => ${p.href}`;

describe("PWA assets", () => {
  const html = readFileSync(join(ROOT, "src/app.html"), "utf8");

  it("app.html startup-image media→href pairs match the generated static/splash/_links.html", () => {
    const links = readFileSync(join(ROOT, "static/splash/_links.html"), "utf8");
    const inHtml = startupLinks(html).map(pairKey).sort();
    const inLinks = startupLinks(links).map(pairKey).sort();
    expect(inHtml.length).toBeGreaterThan(0);
    expect(inHtml).toEqual(inLinks);
  });

  it("every startup-image href + manifest icon file exists under static/", () => {
    const manifest = JSON.parse(
      readFileSync(join(ROOT, "static/manifest.webmanifest"), "utf8"),
    ) as { icons: { src: string }[] };
    const paths = [
      ...startupLinks(html).map((p) => p.href),
      ...manifest.icons.map((i) => i.src),
    ];
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
