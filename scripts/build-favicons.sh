#!/usr/bin/env bash
# build-favicons.sh — regenerate the PWA icon pack from the pink-marble sticker.
#
# Two-tier strategy (per cluster C5 brief):
#   Large canvas  (180/192/512 + maskable): keep the pink-marble sticker artwork
#                  but crop out the bottom "@FOLGEDERWOLKE" text.
#   Small canvas  (16/32 + .ico + favicon.svg): solid pink #be185d background
#                  with the white cloud + yellow lightning bolt — the marble
#                  texture is illegible below ~48px.
#
# Requires ImageMagick (the `magick` binary; `convert` works too on older
# installs). On macOS install via `brew install imagemagick`.
#
# Usage:
#   bash scripts/build-favicons.sh
#
# Source image: assets/sticker-source.jpg (a 2000x2000 JPEG; original lives
# in the artwork drive under "Kopie von StickerV2_1.jpg"). The crop window
# below was hand-tuned to drop the diagonal @FOLGEDERWOLKE wordmark in the
# bottom-right while keeping the cloud + bolt centred.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets/sticker-source.jpg"
OUT_DIR="static"
ICONS_DIR="static/icons"
mkdir -p "$ICONS_DIR"

if ! command -v magick >/dev/null 2>&1 && ! command -v convert >/dev/null 2>&1; then
  echo "ERROR: ImageMagick (magick/convert) not found. Install with: brew install imagemagick" >&2
  exit 1
fi

# Prefer the modern `magick` entrypoint.
if command -v magick >/dev/null 2>&1; then
  IM="magick"
else
  IM="convert"
fi

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: source image $SRC not found." >&2
  exit 1
fi

# --- Stage 1: produce a square 1300x1300 crop of the marble sticker that
# excludes the bottom-right @FOLGEDERWOLKE wordmark.
# Source is 2000x2000; the wordmark runs diagonally across the bottom-right
# from roughly y=1100 onwards. We crop a 1300x1300 window at offset +250+100
# — the resulting square keeps the cloud + bolt centred and fully clips
# the wordmark and its drop shadow.
TMP_FULL="$(mktemp -t fdw-marble-full.XXXXXX.png)"
trap 'rm -f "$TMP_FULL"' EXIT
$IM "$SRC" -crop 1300x1300+250+100 +repage "$TMP_FULL"

# Sanity check stage 1 produced a square.
DIM=$($IM identify -format "%wx%h" "$TMP_FULL")
echo "Stage 1 marble crop: $DIM"

# --- Stage 2: derive the large-canvas marble icons.
# Plain ("any" purpose) — fill the canvas edge-to-edge.
for SIZE in 180 192 512; do
  if [[ "$SIZE" == "180" ]]; then
    OUT="$OUT_DIR/apple-touch-icon.png"
  else
    OUT="$ICONS_DIR/icon-${SIZE}.png"
  fi
  $IM "$TMP_FULL" -resize "${SIZE}x${SIZE}" -strip "$OUT"
done

# Maskable ("maskable" purpose) — the inner safe-zone is the centred 80%
# circle (Android docs). To safely render under platform mask crops we
# composite the marble into the centre of a #be185d-bleed canvas at 80%
# scale, ensuring the cloud + bolt survive any circular / squircle mask.
for SIZE in 192 512; do
  INNER=$(( SIZE * 80 / 100 ))
  OUT="$ICONS_DIR/icon-${SIZE}-maskable.png"
  $IM "$TMP_FULL" \
    -resize "${INNER}x${INNER}" \
    -background "#be185d" \
    -gravity center \
    -extent "${SIZE}x${SIZE}" \
    -strip "$OUT"
done

# --- Stage 3: small-canvas variants — solid pink + white cloud + yellow bolt.
# Marble texture would be illegible at 16/32px so we generate a clean SVG
# (single source of truth) and rasterise from it.
SMALL_SVG="$OUT_DIR/favicon.svg"
cat > "$SMALL_SVG" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Folge der Wolke">
  <rect width="64" height="64" rx="12" fill="#be185d"/>
  <!-- Cloud: 5 stacked ellipses, white, black outline simplified to white-only at this scale -->
  <g fill="#ffffff">
    <ellipse cx="22" cy="28" rx="9" ry="7"/>
    <ellipse cx="32" cy="24" rx="11" ry="9"/>
    <ellipse cx="42" cy="28" rx="9" ry="7"/>
    <rect x="16" y="28" width="32" height="8" rx="4"/>
  </g>
  <!-- Lightning bolt -->
  <polygon points="34,30 26,46 32,46 28,56 42,38 35,38 40,30" fill="#facc15"/>
</svg>
SVG

# Rasterise the small SVG to 16/32 PNG and build an .ico containing both.
$IM -background none "$SMALL_SVG" -resize 16x16 "$OUT_DIR/favicon-16.png"
$IM -background none "$SMALL_SVG" -resize 32x32 "$OUT_DIR/favicon-32.png"
$IM "$OUT_DIR/favicon-16.png" "$OUT_DIR/favicon-32.png" "$OUT_DIR/favicon.ico"

echo
echo "Generated:"
ls -l "$OUT_DIR/favicon.ico" "$OUT_DIR/favicon-16.png" "$OUT_DIR/favicon-32.png" \
      "$OUT_DIR/favicon.svg" "$OUT_DIR/apple-touch-icon.png" \
      "$ICONS_DIR"/icon-*.png
echo
echo "Done. Commit the regenerated files."
