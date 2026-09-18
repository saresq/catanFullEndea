#!/bin/sh
# Convert every card master in public/images/cards/*.png to a .webp next to it.
# Needs cwebp (brew install webp). The .webp output is committed; the server never runs this.
cd "$(dirname "$0")/../public/images/cards" || exit 1
for png in *.png; do
  cwebp -quiet -q 82 -alpha_q 90 "$png" -o "${png%.png}.webp" && echo "${png%.png}.webp"
done
