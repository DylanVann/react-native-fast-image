#!/usr/bin/env bash
# Makes the image format samples in images/formats/ (the formats cases in
# RegressionExample.tsx): the same picture in each format (red, green, blue and
# yellow quadrants, 80x80), and an animation (red, then blue, 400 ms each,
# looping) in each animated format. They're committed, so this only needs to
# run to add a format.
#
#   bash ReactNativeFastImageExampleServer/formats.sh
#
# Needs ImageMagick, libwebp (cwebp, img2webp), libavif (avifenc) and libheif
# (heif-enc): `brew install imagemagick webp libavif libheif`, and macOS (sips,
# for PSD and ICNS).
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/images/formats"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
cd "$OUT"

magick -size 40x40 xc:'#ff0000' xc:'#00c000' +append "$TMP/top.png"
magick -size 40x40 xc:'#0000ff' xc:'#ffd000' +append "$TMP/bottom.png"
# No timestamps in the files, so they come out the same every time.
magick "$TMP/top.png" "$TMP/bottom.png" -append -define png:exclude-chunks=date,time "$TMP/quadrants.png"
cp "$TMP/quadrants.png" quadrants.png
magick "$TMP/quadrants.png" -quality 92 quadrants.jpg
magick "$TMP/quadrants.png" quadrants.gif
cwebp -quiet -q 92 "$TMP/quadrants.png" -o quadrants.webp
avifenc -q 90 "$TMP/quadrants.png" quadrants.avif > /dev/null
heif-enc -q 90 "$TMP/quadrants.png" -o quadrants.heic > /dev/null
magick "$TMP/quadrants.png" BMP3:quadrants.bmp
magick "$TMP/quadrants.png" quadrants.ico
magick "$TMP/quadrants.png" -compress none quadrants.tiff
# PSD and ICNS with macOS's sips: ImageMagick's PSD is a palette one, which
# ImageIO decodes wrongly (Photoshop's are RGB), and ICNS needs one of the icon
# sizes (128x128).
sips -s format psd "$TMP/quadrants.png" --out quadrants.psd > /dev/null
magick "$TMP/quadrants.png" -filter point -resize 128x128 -define png:exclude-chunks=date,time "$TMP/quadrants-128.png"
sips -s format icns "$TMP/quadrants-128.png" --out quadrants.icns > /dev/null

magick -size 80x80 xc:'#ff0000' "$TMP/red.png"
magick -size 80x80 xc:'#0000ff' "$TMP/blue.png"
magick -delay 40 "$TMP/red.png" "$TMP/blue.png" -loop 0 animated.gif
magick -delay 40 "$TMP/red.png" "$TMP/blue.png" -loop 0 APNG:animated.png
img2webp -loop 0 -lossless -d 400 "$TMP/red.png" "$TMP/blue.png" -o animated.webp > /dev/null 2>&1
# A large one, which a small view decodes smaller (downsample).
magick -size 400x400 xc:'#ff0000' "$TMP/red-large.png"
magick -size 400x400 xc:'#0000ff' "$TMP/blue-large.png"
img2webp -loop 0 -lossless -d 400 "$TMP/red-large.png" "$TMP/blue-large.png" -o animated-large.webp > /dev/null 2>&1
avifenc --timescale 10 --duration 4 --repetition-count infinite -q 90 \
    --creation-time 1 --modification-time 1 \
    "$TMP/red.png" "$TMP/blue.png" -o animated.avif > /dev/null
chmod 644 ./*
