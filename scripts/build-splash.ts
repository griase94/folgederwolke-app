// Generate iOS apple-touch-startup-image splash screens.
// Brand-pink field + the repaired logo SVG + the Verein-name wordmark.
// ONE light set (no prefers-color-scheme variants): the app is light-only, so this
// set is used in both light AND dark appearance — which is what fixes the dark-mode
// black launch frame. Logo rasterized via sharp (reliable SVG); wordmark via
// ImageMagick `label:` with an explicit TTF (FreeType — no fontconfig dependency);
// final composite via sharp. The 0.42 / 0.058 / 0.06 layout constants are tuned at
// the visual review gate. Re-runs may produce non-byte-identical PNGs (acceptable).
// Run: VEREIN_NAME="Folge der Wolke e.V." pnpm splash:build
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_PINK } from "../src/lib/brand";

const ROOT = process.cwd();
const LOGO = join(ROOT, "static/logo.svg");
const FONT = join(ROOT, "assets/fonts/Inter-SemiBold.ttf");
const OUT = join(ROOT, "static/splash");
const NAME = process.env.VEREIN_NAME || "Folge der Wolke e.V.";

// Portrait CSS w×h @dpr. Well-known iOS startup-image matrix (pwa-asset-generator)
// plus the 2024 iPad Pro M4 logical sizes. Each entry → a portrait + landscape image.
// Devices not listed fall through to the no-media catch-all at the end.
const DEVICES: ReadonlyArray<{ w: number; h: number; r: number }> = [
  { w: 320, h: 568, r: 2 },
  { w: 375, h: 667, r: 2 },
  { w: 375, h: 812, r: 3 },
  { w: 390, h: 844, r: 3 },
  { w: 393, h: 852, r: 3 },
  { w: 414, h: 736, r: 3 },
  { w: 414, h: 896, r: 2 },
  { w: 414, h: 896, r: 3 },
  { w: 428, h: 926, r: 3 },
  { w: 430, h: 932, r: 3 },
  { w: 402, h: 874, r: 3 },
  { w: 440, h: 956, r: 3 },
  { w: 744, h: 1133, r: 2 },
  { w: 768, h: 1024, r: 2 },
  { w: 810, h: 1080, r: 2 },
  { w: 820, h: 1180, r: 2 },
  { w: 834, h: 1112, r: 2 },
  { w: 834, h: 1194, r: 2 },
  { w: 834, h: 1210, r: 2 },
  { w: 1024, h: 1366, r: 2 },
  { w: 1032, h: 1376, r: 2 },
];

function wordmarkBuffer(pointPx: number): Buffer {
  // White text on transparent, rendered by ImageMagick via the explicit TTF.
  // NAME must stay confined to the `label:` token (a literal-text coder); do not
  // refactor it into a bare image-spec arg — that would re-open an @file/coder surface.
  return execFileSync(
    "magick",
    [
      "-background",
      "none",
      "-fill",
      "#FFFFFF",
      "-font",
      FONT,
      "-pointsize",
      String(pointPx),
      `label:${NAME}`,
      "png:-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

async function render(pxW: number, pxH: number, file: string): Promise<void> {
  const short = Math.min(pxW, pxH);

  const logoW = Math.round(short * 0.42);
  const logo = await sharp(LOGO, { density: 600 })
    .resize({ width: logoW })
    .png()
    .toBuffer();
  const logoH = (await sharp(logo).metadata()).height ?? logoW;

  const maxW = Math.round(pxW * 0.86);
  let wm = wordmarkBuffer(Math.round(short * 0.058));
  if (((await sharp(wm).metadata()).width ?? 0) > maxW) {
    wm = await sharp(wm).resize({ width: maxW }).toBuffer(); // fit-to-width guard
  }
  const wmMeta = await sharp(wm).metadata();
  const wmW = wmMeta.width ?? 0;
  const wmH = wmMeta.height ?? 0;

  const gap = Math.round(short * 0.06);
  const top0 = Math.round((pxH - (logoH + gap + wmH)) / 2);

  // Hard guard: never emit a clipped/overflowing splash.
  if (logoW > pxW || wmW > pxW || top0 < 0) {
    throw new Error(
      `layout overflow ${file}: logoW=${logoW} wmW=${wmW} top0=${top0} canvas=${pxW}x${pxH}`,
    );
  }

  await sharp({
    create: { width: pxW, height: pxH, channels: 4, background: BRAND_PINK },
  })
    .composite([
      { input: logo, top: top0, left: Math.round((pxW - logoW) / 2) },
      { input: wm, top: top0 + logoH + gap, left: Math.round((pxW - wmW) / 2) },
    ])
    .png()
    .toFile(join(OUT, file));

  const m = await sharp(join(OUT, file)).metadata();
  if (m.width !== pxW || m.height !== pxH) {
    throw new Error(
      `dim mismatch ${file}: got ${m.width}x${m.height}, want ${pxW}x${pxH}`,
    );
  }
}

async function main(): Promise<void> {
  try {
    execFileSync("magick", ["--version"], { stdio: "ignore" });
  } catch {
    console.error(
      "ERROR: ImageMagick not found. Install with: brew install imagemagick",
    );
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  const links: string[] = [];

  for (const d of DEVICES) {
    const pw = d.w * d.r,
      ph = d.h * d.r;
    const base = `screen and (device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.r})`;
    const portrait = `apple-splash-${pw}-${ph}.png`;
    await render(pw, ph, portrait);
    links.push(
      `    <link rel="apple-touch-startup-image" media="${base} and (orientation: portrait)" href="/splash/${portrait}" />`,
    );
    const landscape = `apple-splash-${ph}-${pw}.png`;
    await render(ph, pw, landscape);
    links.push(
      `    <link rel="apple-touch-startup-image" media="${base} and (orientation: landscape)" href="/splash/${landscape}" />`,
    );
  }

  // No-media catch-all (regression insurance for unlisted/future devices), emitted LAST.
  // iOS scales it; validated on a real device at the verification gate.
  await render(1290, 2796, "apple-splash-fallback-portrait.png");
  links.push(
    `    <link rel="apple-touch-startup-image" media="screen and (orientation: portrait)" href="/splash/apple-splash-fallback-portrait.png" />`,
  );
  await render(2796, 1290, "apple-splash-fallback-landscape.png");
  links.push(
    `    <link rel="apple-touch-startup-image" media="screen and (orientation: landscape)" href="/splash/apple-splash-fallback-landscape.png" />`,
  );

  writeFileSync(join(OUT, "_links.html"), links.join("\n") + "\n");
  console.log(
    `built ${DEVICES.length * 2 + 2} splash images for "${NAME}"; tags -> static/splash/_links.html`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
