// Regenerate the Aurora app-icon / favicon pack (spec §5 — replaces the
// PR #108 single-identity icon system; the source JPG under assets/ is
// retired). Identity: WHITE line-art cloud+bolt centered on the brand
// gradient field — legible at every size down to 16px, survives any
// Android maskable crop (the gradient field is full-bleed; the centered
// mark sits inside the 80% safe zone).
// sharp rasterizes/composits; ImageMagick assembles favicon.ico (sharp has
// no .ico encoder). Run: pnpm icons:build
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { BRAND_GRADIENT_STOPS } from "../src/lib/brand";

const ROOT = process.cwd();
const LOGO_WHITE = join(ROOT, "static/logo-lineart-white.svg");
const STATIC = join(ROOT, "static");
const ICONS = join(STATIC, "icons");

function ensureMagick(): string {
  for (const bin of ["magick", "convert"]) {
    try {
      execFileSync(bin, ["--version"], { stdio: "ignore" });
      return bin;
    } catch {
      /* try next */
    }
  }
  console.error(
    "ERROR: ImageMagick not found. Install with: brew install imagemagick",
  );
  process.exit(1);
}

// Brand-gradient field (≈92deg → near-horizontal sweep), rasterized from an
// inline SVG. Stops mirror --gradient-brand (src/lib/themes/aurora.css).
function gradientField(size: number): Buffer {
  const [a, b, c] = BRAND_GRADIENT_STOPS;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<defs><linearGradient id="g" x1="0" y1="0.05" x2="1" y2="0.95">` +
      `<stop offset="0" stop-color="${a}"/>` +
      `<stop offset="0.55" stop-color="${b}"/>` +
      `<stop offset="1" stop-color="${c}"/>` +
      `</linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
}

async function icon(
  size: number,
  logoRatio: number,
  out: string,
): Promise<void> {
  const logoW = Math.round(size * logoRatio);
  const logo = await sharp(LOGO_WHITE, { density: 600 })
    .resize({ width: logoW })
    .png()
    .toBuffer();
  await sharp(gradientField(size))
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(out);
}

// "any" icons: generous mark (72%). Maskable: mark inside the 80% safe zone
// (56%) so circle/squircle masks never clip the cloud.
const ANY_RATIO = 0.72;
const MASKABLE_RATIO = 0.56;

async function main(): Promise<void> {
  const magick = ensureMagick();

  await icon(180, ANY_RATIO, join(STATIC, "apple-touch-icon.png"));
  await icon(192, ANY_RATIO, join(ICONS, "icon-192.png"));
  await icon(512, ANY_RATIO, join(ICONS, "icon-512.png"));
  await icon(192, MASKABLE_RATIO, join(ICONS, "icon-192-maskable.png"));
  await icon(512, MASKABLE_RATIO, join(ICONS, "icon-512-maskable.png"));
  for (const s of [16, 32, 48, 96])
    await icon(s, ANY_RATIO, join(STATIC, `favicon-${s}.png`));

  // favicon.ico bundles 16/32/48; the loose 48 is only a seed for the .ico.
  execFileSync(magick, [
    join(STATIC, "favicon-16.png"),
    join(STATIC, "favicon-32.png"),
    join(STATIC, "favicon-48.png"),
    join(STATIC, "favicon.ico"),
  ]);
  rmSync(join(STATIC, "favicon-48.png"), { force: true });

  console.log(
    "aurora icons built: favicon.ico, favicon-16/32/96.png, apple-touch-icon.png, icons/icon-192|512[-maskable].png",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
