// @vitest-environment node
/**
 * Aurora slice 2 — iOS chrome (spec §5 "Logo & iOS chrome"):
 *  - launch overlay: wash background + gradient line-art SVG, no marble pink
 *  - status bar: default (dark glyphs on light wash), scrim DELETED
 *  - manifest: background_color = wash anchor; shortcut label "Prüfung"
 *    (never two names for one destination)
 *  - asset scripts render from the line-art logos (Task 2.11)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(resolve(repoRoot, ...p), "utf8");

const appHtml = read("src", "app.html");
const manifest = JSON.parse(read("static", "manifest.webmanifest")) as Record<
  string,
  unknown
>;
const buildSplash = read("scripts", "build-splash.ts");
const buildIcons = read("scripts", "build-app-icons.ts");

describe("app.html iOS chrome", () => {
  it("status-bar style is default (dark glyphs on light wash)", () => {
    expect(appHtml).toContain(
      '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    );
    expect(appHtml).not.toContain("black-translucent");
  });

  it("the pink status-bar scrim is deleted", () => {
    expect(appHtml).not.toContain("pwa-statusbar-scrim");
  });

  it("launch overlay paints the aurora wash, not the legacy pink", () => {
    expect(appHtml.toLowerCase()).not.toContain("be185d");
    expect(appHtml).toContain(
      "linear-gradient(135deg, #fff1f6 0%, #f4eeff 52%, #ecf3ff 100%)",
    );
  });

  it("launch overlay SVG is line-art with the brand gradient (no solid fills)", () => {
    expect(appHtml).toContain('id="fdw-launch-grad"');
    expect(appHtml).toContain("url(#fdw-launch-grad)");
    expect(appHtml).not.toContain("#eae014"); // legacy yellow bolt
    expect(appHtml).not.toContain("#030305"); // legacy black outline
  });
});

describe("manifest.webmanifest", () => {
  it("background_color is the wash anchor", () => {
    expect(manifest["background_color"]).toBe("#fff1f6");
  });

  it("inbox shortcut uses the 'Prüfung' label (one name per destination, spec §5)", () => {
    const shortcuts = manifest["shortcuts"] as { name: string; url: string }[];
    const inbox = shortcuts.find((s) => s.url.startsWith("/app/inbox"));
    expect(inbox?.name).toBe("Prüfung");
  });
});

describe("asset pipeline scripts (Task 2.11)", () => {
  it("build-splash renders the line-art logo on the wash", () => {
    expect(buildSplash).toContain("static/logo-lineart.svg");
    expect(buildSplash).toContain("BRAND_WASH_STOPS");
    expect(buildSplash).toContain("BRAND_INK");
  });

  it("build-app-icons renders the white line-art logo on the gradient field (marble retired)", () => {
    expect(buildIcons).toContain("static/logo-lineart-white.svg");
    expect(buildIcons).toContain("BRAND_GRADIENT_STOPS");
    expect(buildIcons).not.toContain("marble");
  });
});
