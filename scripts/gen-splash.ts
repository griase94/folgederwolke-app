#!/usr/bin/env tsx
/**
 * gen-splash.ts — Generate Apple PWA splash-screen PNGs.
 *
 * Produces apple-touch-startup-image assets at portrait pixel dimensions for
 * common iPhone sizes (SE through Pro Max).  Each image is the brand icon
 * (static/icons/icon-512.png) centred on a #fff white background.
 *
 * The icon already carries the rounded-pink-rect + white cloud+bolt — centred
 * on white it mirrors how the app icon looks on the home screen, giving a
 * coherent launch experience on iOS.
 *
 * Output: static/splash/<width>x<height>.png
 *
 * Run via:  pnpm tsx scripts/gen-splash.ts
 * Or:       npx tsx scripts/gen-splash.ts
 *
 * Generated PNGs are committed as build inputs (they are static assets
 * served directly; no build-time regeneration step exists on Vercel).
 *
 * Source of truth for sizes and Apple media queries:
 *   https://developer.apple.com/design/human-interface-guidelines/launching#Launch-screens
 *   (portrait, 2× and 3× device pixel ratios)
 *
 * To add a new device size: add an entry to SIZES, re-run this script,
 * commit the new PNG, and add the corresponding <link> tag to src/app.html.
 */

import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICON_SRC = path.join(ROOT, "static", "icons", "icon-512.png");
const OUT_DIR = path.join(ROOT, "static", "splash");

/**
 * Portrait pixel sizes for common iPhones.
 * iconSize: width of the centred icon in device pixels (≈ 180–200 px looks
 *           right across all densities — matches the "app icon on spring board"
 *           feel that Apple recommends for splash screens).
 *
 * device             width  height   dpr  notes
 * ─────────────────  ─────  ──────   ───  ───────────────────────────────
 * iPhone SE (1st)     640   1136      2   oldest still somewhat supported
 * iPhone 6/7/8        750   1334      2
 * iPhone 6+/7+/8+     828   1792      3   Plus models (logical 414pt)
 * iPhone XR/11        828   1792      2   same physical pixels as Plus
 * iPhone 12/13 mini   750   1334      3   logical 375pt @ 3x
 * iPhone 12/13/14    1170   2532      3
 * iPhone 14 Plus     1284   2778      3
 * iPhone 15/16       1179   2556      3   Dynamic Island
 * iPhone 15/16 Plus  1290   2796      3   Dynamic Island Plus
 * iPhone 15/16 Pro   1179   2556      3   same canvas as non-pro
 * iPhone 15/16 Pro M 1290   2796      3   same canvas as Plus
 */
const SIZES: Array<{ width: number; height: number; iconSize: number }> = [
  { width: 640, height: 1136, iconSize: 128 }, // SE 1st gen
  { width: 750, height: 1334, iconSize: 150 }, // iPhone 6/7/8 & 12/13 mini
  { width: 828, height: 1792, iconSize: 165 }, // XR/11 & 6+/7+/8+
  { width: 1170, height: 2532, iconSize: 180 }, // iPhone 12/13/14
  { width: 1179, height: 2556, iconSize: 180 }, // iPhone 15/16 / Pro
  { width: 1284, height: 2778, iconSize: 195 }, // iPhone 14 Plus
  { width: 1290, height: 2796, iconSize: 195 }, // iPhone 15/16 Plus / Pro Max
];

async function main(): Promise<void> {
  if (!fs.existsSync(ICON_SRC)) {
    console.error(`Icon source not found: ${ICON_SRC}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(
    `Generating ${SIZES.length} splash PNGs → ${path.relative(ROOT, OUT_DIR)}/`,
  );

  for (const { width, height, iconSize } of SIZES) {
    const outFile = path.join(OUT_DIR, `${width}x${height}.png`);

    // Resize the icon to iconSize × iconSize (square), then composite it
    // centred on a plain white canvas of the target dimensions.
    const iconBuf = await sharp(ICON_SRC).resize(iconSize, iconSize).toBuffer();

    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: iconBuf,
          gravity: "centre",
        },
      ])
      .png({ compressionLevel: 9, effort: 10 })
      .toFile(outFile);

    const size = fs.statSync(outFile).size;
    console.log(`  ${width}x${height}.png  (${Math.round(size / 1024)} kB)`);
  }

  console.log("Done.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
