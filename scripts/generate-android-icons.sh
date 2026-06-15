#!/usr/bin/env bash
# Generates Android launcher icons from src/assets/images/logo.png
# (same asset used for App Store / Play Store listing).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOGO_SOURCE="$ROOT_DIR/src/assets/images/logo.png"
SQUARE_ICON="$ROOT_DIR/src/assets/app-icon.png"
RES_DIR="$ROOT_DIR/android/app/src/main/res"

if [[ ! -f "$LOGO_SOURCE" ]]; then
  echo "Logo not found: $LOGO_SOURCE" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick (magick) is required to build square app icons from logo.png" >&2
  exit 1
fi

echo "Building square app icon from store listing logo: $LOGO_SOURCE"

# Square 1024x1024 icon — white background (logo has transparent/no background)
magick "$LOGO_SOURCE" \
  -resize 820x820 \
  -background "#FFFFFF" \
  -gravity center \
  -extent 1024x1024 \
  "$SQUARE_ICON"

cp "$LOGO_SOURCE" "$ROOT_DIR/src/assets/logo.png"
cp "$SQUARE_ICON" "$ROOT_DIR/public/app-icon.png"
cp "$SQUARE_ICON" "$ROOT_DIR/resources/icon.png"

generate_icon() {
  local size="$1"
  local output="$2"
  mkdir -p "$(dirname "$output")"
  magick "$SQUARE_ICON" -resize "${size}x${size}" "$output"
}

# Launcher icons
for spec in "36:ldpi" "48:mdpi" "72:hdpi" "96:xhdpi" "144:xxhdpi" "192:xxxhdpi"; do
  size="${spec%%:*}"
  density="${spec##*:}"
  generate_icon "$size" "$RES_DIR/mipmap-${density}/ic_launcher.png"
  generate_icon "$size" "$RES_DIR/mipmap-${density}/ic_launcher_round.png"
done

# Adaptive icon layers
for spec in "81:ldpi" "108:mdpi" "162:hdpi" "216:xhdpi" "324:xxhdpi" "432:xxxhdpi"; do
  size="${spec%%:*}"
  density="${spec##*:}"
  generate_icon "$size" "$RES_DIR/mipmap-${density}/ic_launcher_foreground.png"
  magick -size "${size}x${size}" xc:'#FFFFFF' "$RES_DIR/mipmap-${density}/ic_launcher_background.png"
done

# iOS App Store / home screen icon
IOS_ICON="$ROOT_DIR/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
if [[ -d "$(dirname "$IOS_ICON")" ]]; then
  cp "$SQUARE_ICON" "$IOS_ICON"
  echo "Updated iOS app icon: $IOS_ICON"
fi

echo "Done. Installed app icon now matches logo.png store listing."
