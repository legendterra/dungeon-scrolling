# -*- coding: utf-8 -*-
"""Regenerate the Slime King's six poses at 2x detail (128x96 art over the
same 64x48 logical footprint).

The boss was the last sprite still authored at 1x, which left it visibly
coarser than everything around it once the rest of the roster doubled. The
poses are plotted from a shared body function so the silhouette, the crown
placement and the baseline stay identical between frames -- a boss that
changes size or drifts between frames reads as a glitch, not as animation.
"""
import io
import os
import re

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src", "art", "king.js")

W, H = 128, 96
BASE = 92           # baseline the body sits on, identical in every pose
CX = 64             # horizontal centre, identical in every pose


class G(object):
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.g = [['.'] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.g[y][x]
        return '.'

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.put(xx, yy, c)

    def ellipse(self, cx, cy, rx, ry, c, clip_bottom=None):
        for y in range(self.h):
            if clip_bottom is not None and y > clip_bottom:
                continue
            for x in range(self.w):
                dx = (x + 0.5 - cx) / float(rx)
                dy = (y + 0.5 - cy) / float(ry)
                if dx * dx + dy * dy <= 1.0:
                    self.put(x, y, c)

    def outline(self, c='k', only=None):
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.get(x, y) != '.':
                    continue
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = self.get(x + ox, y + oy)
                    if n != '.' and n != 'k' and (only is None or n == only):
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def rows(self):
        return [''.join(r) for r in self.g]


def body(g, rx, ry, cy=None, squash_top=False):
    """The royal ooze dome: light on the left, deep purple on the right."""
    cy = cy if cy is not None else BASE - ry
    g.ellipse(CX, cy, rx, ry, 'P', clip_bottom=BASE)
    g.ellipse(CX - rx * 0.12, cy, rx * 0.86, ry * 0.88, 'm', clip_bottom=BASE)
    g.ellipse(CX - rx * 0.30, cy - ry * 0.10, rx * 0.58, ry * 0.62, 'w',
              clip_bottom=BASE)
    # glossy bubbles down the lit side
    for bx, by, br in ((-0.55, -0.30, 0.10), (-0.40, 0.10, 0.07),
                       (-0.62, 0.24, 0.05)):
        g.ellipse(CX + rx * bx, cy + ry * by, rx * br, ry * br * 1.4, 'W',
                  clip_bottom=BASE)
    return cy


def eyes(g, cy, rx, angry=True, shut=False):
    ex, ey = rx * 0.30, cy - 2
    for side in (-1, 1):
        x = CX + side * ex
        if shut:
            g.rect(x - 7, ey, 14, 3, 'k')
            continue
        g.ellipse(x, ey, 9, 8, 'k')
        g.ellipse(x, ey + 1, 6.5, 5.5, 'R')
        g.ellipse(x - 2, ey - 1, 2.5, 2.0, 'Y')
        if angry:
            # angry brow: a wedge cutting into the top of the eye
            for i in range(12):
                g.rect(x - 9 + i, ey - 9 + (i if side > 0 else 11 - i) // 2, 1, 4, 'k')


def crown(g, cy, ry, tilt=0, slide=0):
    """Gold three-point crown, sitting ON TOP of the dome rather than across
    its face. `slide` slips it off sideways for the death pose."""
    top = cy - ry - 10 + tilt + abs(slide) * 0.3
    left = CX - 22 + slide * 1.6
    g.rect(left, top + 10, 44, 9, 'y')
    g.rect(left + 2, top + 12, 40, 4, 'Y')
    for i, px in enumerate((0, 16, 32)):
        h = 12 if i == 1 else 9
        g.rect(left + px + 3, top + 10 - h, 7, h, 'y')
        g.put(left + px + 6, top + 9 - h, 'Y')
    g.rect(left + 18, top + 12, 6, 5, 'R')
    g.rect(left, top + 19, 44, 3, 'k')


def pose_idle(squash=False):
    g = G()
    rx = 46 if not squash else 50
    ry = 34 if not squash else 30
    cy = body(g, rx, ry)
    eyes(g, cy, rx)
    crown(g, cy, ry)
    g.outline()
    return g.rows()


def pose_rear():
    """Reared up with the maw open, just before the slam."""
    g = G()
    rx, ry = 40, 44
    cy = body(g, rx, ry)
    eyes(g, cy - 6, rx)
    # open maw
    g.ellipse(CX, cy + 22, 20, 14, 'k')
    g.ellipse(CX, cy + 24, 15, 10, 'R')
    for i in range(6):
        g.rect(CX - 15 + i * 6, cy + 12, 4, 6, 'W')
        g.rect(CX - 13 + i * 6, cy + 30, 4, 5, 'W')
    crown(g, cy, ry, tilt=-4)
    g.outline()
    return g.rows()


def pose_slam():
    """Flattened against the floor at the moment of impact."""
    g = G()
    rx, ry = 58, 20
    cy = body(g, rx, ry)
    eyes(g, cy, rx, angry=True)
    crown(g, cy, ry, tilt=4)
    # splash lips thrown out to both sides
    for side in (-1, 1):
        g.ellipse(CX + side * (rx + 6), BASE - 5, 10, 6, 'm', clip_bottom=BASE)
        g.ellipse(CX + side * (rx + 14), BASE - 3, 6, 4, 'P', clip_bottom=BASE)
    g.outline()
    return g.rows()


def pose_hurt():
    """Recoil: shoved back and up, eyes screwed shut."""
    g = G()
    rx, ry = 44, 36
    cy = body(g, rx, ry)
    eyes(g, cy, rx, shut=True)
    # impact flash across the lit side
    for i in range(7):
        g.rect(CX - 34 + i * 4, cy - 20 + i * 3, 3, 10, 'W')
    crown(g, cy, ry, tilt=-6)
    g.outline()
    return g.rows()


def pose_death():
    """Collapsed puddle with the crown sliding off."""
    g = G()
    rx, ry = 60, 12
    cy = body(g, rx, ry)
    # dull, half-closed eyes sunk into the puddle
    for side in (-1, 1):
        x = CX + side * rx * 0.26
        g.ellipse(x, cy, 7, 4, 'k')
        g.rect(x - 5, cy - 1, 10, 2, 'r')
    crown(g, cy, ry, tilt=6, slide=18)
    g.outline()
    return g.rows()


POSES = [
    ("KING_IDLE_0", lambda: pose_idle(False)),
    ("KING_IDLE_1", lambda: pose_idle(True)),
    ("KING_REAR", pose_rear),
    ("KING_SLAM", pose_slam),
    ("KING_DEATH_HURT", pose_hurt),
    ("KING_DEATH", pose_death),
]


def rows_js(name, rows):
    body_js = ",\n".join("    '%s'" % r for r in rows)
    return "  const %s = [\n%s\n  ];" % (name, body_js)


def main():
    s = io.open(SRC, encoding="utf-8").read()
    for name, fn in POSES:
        rows = fn()
        bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != W]
        assert not bad, (name, bad[:3])
        assert len(rows) == H, (name, len(rows))
        pat = r"  const %s = \[\n(?:.*?\n)*?  \];" % name
        assert re.search(pat, s), "could not find " + name
        block = rows_js(name, rows)
        s = re.sub(pat, lambda m: block, s, count=1)
        print("%-16s %dx%d -> %dx%d logical" % (name, W, H, W // 2, H // 2))

    if "const KING_D =" not in s:
        s = s.replace("  const KING_IDLE_0 = [",
                      "  /* Authored at 2x detail: 128x96 art over the same 64x48 logical\n"
                      "     footprint the boss renderer already centres on its collision box. */\n"
                      "  const KING_D = 2;\n\n  const KING_IDLE_0 = [", 1)
        s = s.replace("  DS.KingRows = {", "  DS.KingRows = {\n    detail: KING_D,", 1)

    io.open(SRC, "w", encoding="utf-8").write(s)
    print("king.js written")


if __name__ == "__main__":
    main()
