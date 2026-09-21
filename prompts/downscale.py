#!/usr/bin/env python3
"""Downscale generated pixel-art PNGs to their true grid size.

AI image generators cannot hit an exact 32x32 grid, so ask them for a large
image (e.g. 1024x768 for a 128x96 boss frame) and snap it down here with
nearest-neighbour sampling. Also quantises every pixel to the official palette
and hard-cuts alpha, so no anti-aliased fringe survives.

    pip install pillow
    python downscale.py raw/hero_idle.png 64 32
    python downscale.py --all raw/ out/      # reads sizes from sizes.txt
"""
import sys, os
from PIL import Image

PALETTE = [
    "0d0b14","1c1a2b","2a2740","514c72","6f6a90","9b96b8","d8d5e8",
    "8a7440","f2c14e","fff0a8","8a3b2a","e8743b","6e1b28","c0303c","8a4550",
    "1b4436","2f7d4f","5cbf62","a3e86b","16324f","2f6fa8","4fb3e0","a8e4ff",
    "1e0f2a","3c2154","7f45b8","c86ee0","a89bff","2e2018","5c3f2a","8a6340",
    "b98d5c","f0c79c","ffffff",
]
RGB = [tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) for h in PALETTE]
ALPHA_CUT = 128


def nearest(c):
    r, g, b = c
    return min(RGB, key=lambda p: (p[0]-r)**2 + (p[1]-g)**2 + (p[2]-b)**2)


def convert(src, w, h, dst=None, snap=True):
    im = Image.open(src).convert("RGBA").resize((w, h), Image.NEAREST)
    if snap:
        px = im.load()
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < ALPHA_CUT:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = nearest((r, g, b)) + (255,)
    dst = dst or src
    im.save(dst)
    print("%s -> %dx%d  %s" % (os.path.basename(src), w, h, dst))


def main(argv):
    if len(argv) == 4 and argv[1] == "--all":
        # sizes.txt: "<filename> <w> <h>" per line
        srcdir, outdir = argv[2], argv[3]
        os.makedirs(outdir, exist_ok=True)
        for line in open(os.path.join(srcdir, "sizes.txt"), encoding="utf-8"):
            line = line.split("#")[0].strip()
            if not line:
                continue
            name, w, h = line.split()
            convert(os.path.join(srcdir, name), int(w), int(h),
                    os.path.join(outdir, name))
        return 0
    if len(argv) not in (4, 5):
        print(__doc__)
        return 1
    convert(argv[1], int(argv[2]), int(argv[3]),
            argv[4] if len(argv) == 5 else None)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
