#!/bin/sh
# Convert every card master in assets-src/cards/*.png to a .webp in public/images/cards/.
# Needs cwebp (brew install webp). The .webp output is committed; the server never runs this.
cd "$(dirname "$0")/.." || exit 1
for png in assets-src/cards/*.png; do
  name=$(basename "$png" .png)
  cwebp -quiet -q 82 -alpha_q 90 "$png" -o "public/images/cards/$name.webp" && echo "$name.webp"
done
