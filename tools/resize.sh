#!/bin/sh
# Regenerate the extension icons from r128.png.
#
# This lives in tools/ instead of next to the icons on purpose: everything below
# src/static/images is copied into the packaged extension, where web-ext lint
# flags the .sh file extension.

cd "$(dirname "$0")/../src/static/images" || exit 1

magick r128.png -resize 96x96 r96.png
magick r128.png -resize 48x48 r48.png
magick r128.png -resize 40x40 r40.png
magick r128.png -resize 30x30 r30.png
magick r128.png -resize 25x25 r25.png
magick r128.png -resize 20x20 r20.png
