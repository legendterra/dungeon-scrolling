# -*- coding: utf-8 -*-
"""Redraw the six weapon icons at 2x detail (24x24 over a 12x12 footprint).

Diagonal blades are plotted rather than typed: a hand-typed 45 degree line at
this size almost always ends up with a stair-step that reads as a dent.
Palette letters match RARITY_SKINS, so all five rarity recolours keep working.
"""
import io
import os
import re

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, "src", "art", "sprites.js")
N = 24


class Grid(object):
    def __init__(self, n=N):
        self.n = n
        self.g = [['.'] * n for _ in range(n)]

    def put(self, x, y, c):
        if 0 <= x < self.n and 0 <= y < self.n:
            self.g[y][x] = c

    def rect(self, x0, y0, w, h, c):
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                self.put(x, y, c)

    def line(self, x0, y0, x1, y1, c, width=1):
        steps = max(abs(x1 - x0), abs(y1 - y0))
        for i in range(steps + 1):
            t = i / float(steps) if steps else 0
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            for d in range(width):
                self.put(x + d, y, c)

    def rows(self):
        return [''.join(r) for r in self.g]


def sword():
    g = Grid()
    # blade: bright core with a shaded lower edge, tip at the top right
    g.line(7, 16, 20, 3, 'w', 3)
    g.line(7, 15, 20, 2, 'W', 2)
    g.put(21, 2, 'W')
    g.put(21, 3, 'w')
    # crossguard
    g.rect(4, 15, 9, 2, 'y')
    g.put(3, 15, 'G')
    g.put(3, 16, 'G')
    g.put(13, 15, 'G')
    g.put(13, 16, 'G')
    # grip and pommel
    g.rect(6, 17, 3, 5, 'b')
    g.rect(7, 17, 1, 5, 'n')
    g.rect(5, 22, 5, 2, 'G')
    g.rect(6, 22, 3, 1, 'y')
    return g.rows()


def dagger():
    g = Grid()
    g.line(9, 14, 18, 5, 'w', 3)
    g.line(9, 13, 18, 4, 'W', 2)
    g.put(19, 4, 'W')
    g.rect(6, 13, 6, 2, 'y')
    g.rect(7, 15, 3, 4, 'b')
    g.rect(8, 15, 1, 4, 'n')
    g.rect(6, 19, 5, 2, 'G')
    return g.rows()


def greataxe():
    """Upright haft with two crescent bits, so the silhouette reads as an axe
    rather than as a symmetric fan."""
    g = Grid()
    # haft, top to bottom
    g.rect(11, 2, 3, 21, 'b')
    g.rect(12, 3, 1, 19, 'n')
    g.rect(10, 21, 5, 2, 'G')

    # two bits: a lens profile that is widest at the middle of the head
    top, bot = 3, 14
    mid = (top + bot) / 2.0
    for y in range(top, bot):
        span = int(round(8 - (abs(y - mid) ** 2) * 0.42))
        if span <= 0:
            continue
        g.line(11 - span, y, 10, y, 'w', 1)
        g.line(14, y, 14 + span, y, 'w', 1)
        g.put(11 - span, y, 'W')       # outer cutting edge
        g.put(14 + span, y, 'W')
        if span > 3:
            g.put(11 - span + 1, y, 'W')
            g.put(14 + span - 1, y, 'W')

    # iron collar where the bits meet the haft
    g.rect(10, 5, 5, 2, 'G')
    g.rect(10, 11, 5, 2, 'G')
    g.rect(11, 6, 3, 5, 'y')
    return g.rows()


def bow():
    g = Grid()
    # recurve limbs
    pts = [(13, 2), (15, 4), (16, 7), (16, 11), (16, 15), (15, 18), (13, 21)]
    for i in range(len(pts) - 1):
        g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'b', 2)
    g.put(13, 1, 'G')
    g.put(13, 22, 'G')
    # grip
    g.rect(15, 10, 3, 4, 'n')
    g.put(16, 10, 'y')
    g.put(16, 13, 'y')
    # string
    g.line(13, 2, 13, 21, 'W', 1)
    return g.rows()


def staff():
    g = Grid()
    g.line(11, 8, 11, 23, 'b', 3)
    g.line(12, 8, 12, 23, 'n', 1)
    g.rect(10, 15, 5, 2, 'G')
    # orb
    for y in range(2, 10):
        half = 4 - abs(y - 6) // 2
        g.line(12 - half, y, 12 + half, y, 'w', 1)
    for y in range(3, 9):
        half = 3 - abs(y - 6) // 2
        g.line(12 - half, y, 12 + half, y, 'W', 1)
    g.rect(9, 8, 7, 2, 'y')
    g.put(10, 4, 'W')
    return g.rows()


def spear():
    g = Grid()
    g.line(3, 22, 17, 8, 'b', 3)
    g.line(4, 22, 18, 8, 'n', 1)
    # leaf head
    for i in range(8):
        half = 3 - abs(i - 3) // 2
        for d in range(-half, half + 1):
            g.put(17 + i - d, 7 - i + d, 'w')
    g.line(16, 9, 21, 4, 'W', 1)
    g.put(22, 3, 'W')
    # ribbon
    g.rect(12, 12, 4, 2, 'y')
    g.put(11, 13, 'G')
    g.rect(2, 22, 4, 2, 'G')
    return g.rows()


BUILDERS = [
    ("ICON_SWORD", sword),
    ("ICON_DAGGER", dagger),
    ("ICON_AXE", greataxe),
    ("ICON_BOW", bow),
    ("ICON_STAFF", staff),
    ("ICON_SPEAR", spear),
]


def rows_js(name, rows):
    body = ",\n".join("    '%s'" % r for r in rows)
    return "  const %s = [\n%s\n  ];" % (name, body)


def main():
    s = io.open(SPR, encoding="utf-8").read()
    for name, fn in BUILDERS:
        rows = fn()
        assert len(rows) == N and all(len(r) == N for r in rows), name
        pat = r"  const %s = \[\n(?:.*?\n)*?  \];" % name
        assert re.search(pat, s), "could not find " + name
        block = rows_js(name, rows)
        changed = re.search(pat, s).group(0) != block
        s = re.sub(pat, lambda m: block, s, count=1)
        print("%-12s %dx%d%s" % (name, N, N, "" if changed else "  (unchanged)"))

    old = """    S.iconByRarity[key] = RARITY_SKINS.map(function (skin) {
      return A.makeSprite(ICON_ROWS[key], skin);
    });"""
    new = """    S.iconByRarity[key] = RARITY_SKINS.map(function (skin) {
      return A.makeSprite(ICON_ROWS[key], skin, ICON_D);
    });"""
    if old in s:
        s = s.replace(old, new)

    old = "  const ICON_ROWS = {"
    new = """  /* Weapon icons are authored at 2x detail: 24x24 art over the same 12x12
     logical footprint the swing arithmetic already assumes. */
  const ICON_D = 2;

  const ICON_ROWS = {"""
    if "const ICON_D" not in s:
        assert old in s
        s = s.replace(old, new, 1)

    io.open(SPR, "w", encoding="utf-8").write(s)
    print("weapons written")


if __name__ == "__main__":
    main()
