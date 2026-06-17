// @vitest-environment node
/**
 * Aurora slice 1 — P0 line-art logo assets (spec §5 "Logo & iOS chrome").
 * Gradient variant: outline (.st1) + bolt (.st2) filled with the brand
 * gradient, NO solid fills (.st0 → none). White variant: same shapes in
 * solid white for gradient surfaces.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");
const lineart = readFileSync(
  resolve(repoRoot, "static", "logo-lineart.svg"),
  "utf8",
);
const white = readFileSync(
  resolve(repoRoot, "static", "logo-lineart-white.svg"),
  "utf8",
);

describe("logo-lineart.svg (gradient variant)", () => {
  it("defines the brand gradient with the frozen stops", () => {
    expect(lineart).toContain('id="fdw-brand-grad"');
    expect(lineart).toContain('stop-color="#FF1E8C"');
    expect(lineart).toContain('stop-color="#A855F7"');
    expect(lineart).toContain('stop-color="#3B82F6"');
  });

  it("fills outline + bolt with the gradient and nothing else", () => {
    expect(lineart).toContain(
      ".st1{fill-rule:evenodd;clip-rule:evenodd;fill:url(#fdw-brand-grad);}",
    );
    expect(lineart).toContain(
      ".st2{fill-rule:evenodd;clip-rule:evenodd;fill:url(#fdw-brand-grad);}",
    );
    expect(lineart).toContain(".st0{fill:none;}");
  });

  it("contains no legacy solid fills (white cloud, black outline, yellow bolt)", () => {
    expect(lineart).not.toContain("#FFFFFF");
    expect(lineart).not.toContain("#030305");
    expect(lineart).not.toContain("#EAE014");
  });
});

describe("logo-lineart-white.svg (for gradient surfaces)", () => {
  it("fills outline + bolt with solid white, cloud body transparent", () => {
    expect(white).toContain(
      ".st1{fill-rule:evenodd;clip-rule:evenodd;fill:#FFFFFF;}",
    );
    expect(white).toContain(
      ".st2{fill-rule:evenodd;clip-rule:evenodd;fill:#FFFFFF;}",
    );
    expect(white).toContain(".st0{fill:none;}");
  });

  it("contains no legacy colors and no gradient", () => {
    expect(white).not.toContain("#030305");
    expect(white).not.toContain("#EAE014");
    expect(white).not.toContain("fdw-brand-grad");
  });
});
