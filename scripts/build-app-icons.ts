// Regenerate the marble app-icon / favicon pack from assets/app-icon-marble.jpg.
// Marble is the single icon identity everywhere. sharp resizes/composits; ImageMagick
// assembles favicon.ico (sharp has no .ico encoder). Run: pnpm icons:build
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MARBLE = join(ROOT, "assets/app-icon-marble.jpg");
const STATIC = join(ROOT, "static");
const ICONS = join(STATIC, "icons");

// MASKABLE_MODE: "cover" = full-bleed marble (Android masks the corners, which are
// just texture — the centered cloud+bolt survives any circle/squircle mask); "inset"
// = content scaled into the 80% safe zone. We use "cover": the marble's sampled
// "dominant" color comes out near-white (the cloud + light marble dominate), so an
// inset background would show a white ring, not pink. Full-bleed avoids that and
// reads cleaner for this centered-texture mark.
const MASKABLE_MODE: "inset" | "cover" = "cover";

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

async function square(size: number, out: string): Promise<void> {
  await sharp(MARBLE).resize(size, size, { fit: "cover" }).png().toFile(out);
}

async function maskable(size: number, out: string): Promise<void> {
  if (MASKABLE_MODE === "cover") {
    await square(size, out);
    return;
  }
  const inner = Math.round(size * 0.8);
  const { dominant } = await sharp(MARBLE).stats();
  const art = await sharp(MARBLE)
    .resize(inner, inner, { fit: "cover" })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...dominant, alpha: 1 },
    },
  })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toFile(out);
}

async function main(): Promise<void> {
  const magick = ensureMagick();

  await square(180, join(STATIC, "apple-touch-icon.png"));
  await square(192, join(ICONS, "icon-192.png"));
  await square(512, join(ICONS, "icon-512.png"));
  await maskable(192, join(ICONS, "icon-192-maskable.png"));
  await maskable(512, join(ICONS, "icon-512-maskable.png"));
  for (const s of [16, 32, 48, 96])
    await square(s, join(STATIC, `favicon-${s}.png`));

  // favicon.ico bundles 16/32/48; the loose 48 is only a seed for the .ico.
  execFileSync(magick, [
    join(STATIC, "favicon-16.png"),
    join(STATIC, "favicon-32.png"),
    join(STATIC, "favicon-48.png"),
    join(STATIC, "favicon.ico"),
  ]);
  rmSync(join(STATIC, "favicon-48.png"), { force: true });

  console.log(
    "icons built: favicon.ico, favicon-16/32/96.png, apple-touch-icon.png, icons/icon-192|512[-maskable].png",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
