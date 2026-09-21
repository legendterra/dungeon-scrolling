# -*- coding: utf-8 -*-
"""Redraw chests, the shrine, the enchant table, armour icons and the slash FX
at 2x detail, and let the gold slime reuse the chibi slime art.

Everything is plotted on a canvas helper rather than typed as literal rows:
these are the shapes where a mistyped row width silently changes the sprite's
logical footprint, which would shift collision and pickup positions.
"""
import io
import math
import os
import re

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, "src", "art", "sprites.js")
BONUS = os.path.join(ROOT, "src", "world", "bonus.js")


class G(object):
    def __init__(self, w, h):
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

    def outline(self, c='k'):
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.get(x, y) != '.':
                    continue
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + ox, y + oy) != '.':
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def rows(self):
        return [''.join(r) for r in self.g]


def chest(open_lid):
    """28x22 art over the original 14x11 logical footprint."""
    g = G(28, 22)
    if open_lid:
        # lid thrown back, gold light spilling out of the box
        g.rect(2, 0, 24, 4, 'B')
        g.rect(3, 4, 22, 2, 'b')
        g.rect(1, 8, 26, 4, 'Y')
        g.rect(2, 12, 24, 2, 'y')
        g.rect(11, 8, 6, 3, 'W')
        g.rect(1, 14, 26, 5, 'B')
        g.rect(1, 19, 26, 2, 'b')
    else:
        # domed lid, iron band across the middle, gold lock
        g.rect(4, 1, 20, 2, 'b')
        g.rect(2, 3, 24, 6, 'B')
        g.rect(1, 9, 26, 2, 'b')
        g.rect(1, 11, 26, 8, 'B')
        g.rect(1, 19, 26, 2, 'b')
        g.rect(12, 8, 4, 6, 'y')
        g.rect(13, 10, 2, 2, 'Y')
    g.outline()
    return g.rows()


def shrine():
    """32x40: stepped plinth, pillar, glowing rune head."""
    g = G(32, 40)
    g.rect(11, 1, 10, 1, 'P')
    g.rect(9, 2, 14, 14, 'P')
    g.rect(10, 3, 12, 12, 'm')
    g.rect(12, 5, 8, 8, 'S')
    g.rect(14, 7, 4, 4, 'W')
    g.rect(11, 16, 10, 14, 'p')
    g.rect(12, 17, 8, 12, 'P')
    for y in range(18, 29, 4):
        g.rect(13, y, 6, 1, 'm')
    g.rect(8, 30, 16, 4, 'p')
    g.rect(6, 34, 20, 4, 'P')
    g.rect(7, 35, 18, 2, 'p')
    g.rect(5, 38, 22, 2, 'p')
    g.outline()
    return g.rows()


def enchant_table():
    """32x24: an open glowing tome on carved legs, runes drifting above."""
    g = G(32, 24)
    for x, y in ((7, 1), (15, 0), (23, 2), (11, 3), (19, 3)):
        g.rect(x, y, 2, 2, 'S')
    g.rect(3, 5, 26, 2, 'P')
    g.rect(2, 7, 28, 5, 'm')
    g.rect(3, 8, 12, 3, 'S')
    g.rect(17, 8, 12, 3, 'S')
    g.rect(15, 6, 2, 6, 'P')
    g.rect(2, 12, 28, 2, 'P')
    g.rect(1, 14, 30, 3, 'p')
    g.rect(4, 17, 4, 7, 'p')
    g.rect(24, 17, 4, 7, 'p')
    g.rect(5, 18, 2, 5, 'P')
    g.rect(25, 18, 2, 5, 'P')
    g.outline()
    return g.rows()


def icon_helm():
    """20x20 over the original 10x10 footprint."""
    g = G(20, 20)
    g.rect(3, 1, 14, 3, 'G')
    g.rect(1, 4, 18, 6, 'G')
    g.rect(1, 10, 18, 6, 'G')
    g.rect(3, 16, 14, 2, 'G')
    # visor slit
    g.rect(3, 8, 14, 4, 'x')
    g.rect(4, 9, 5, 2, 'W')
    g.rect(11, 9, 5, 2, 'W')
    # crest ridge
    g.rect(9, 0, 2, 5, 'd')
    g.outline()
    return g.rows()


def icon_chest():
    """20x20 breastplate with pauldrons."""
    g = G(20, 20)
    g.rect(0, 1, 6, 5, 'd')      # left pauldron
    g.rect(14, 1, 6, 5, 'd')     # right pauldron
    g.rect(4, 3, 12, 14, 'G')
    g.rect(6, 17, 8, 2, 'G')
    g.rect(9, 5, 2, 11, 'x')     # centre seam
    g.rect(5, 6, 3, 2, 'W')
    g.rect(12, 6, 3, 2, 'W')
    g.outline()
    return g.rows()


def icon_legs():
    """20x20 greaves: a belt across the top, two legs below."""
    g = G(20, 20)
    g.rect(1, 1, 18, 4, 'G')
    g.rect(2, 5, 7, 13, 'G')
    g.rect(11, 5, 7, 13, 'G')
    g.rect(3, 15, 5, 3, 'd')     # boots
    g.rect(12, 15, 5, 3, 'd')
    g.rect(3, 6, 2, 6, 'W')
    g.rect(15, 6, 2, 6, 'W')
    g.outline()
    return g.rows()


def slash():
    """24x32 crescent swing trail: bright core thinning to a tail."""
    g = G(24, 32)
    for band, (r, c) in enumerate(((13.0, 'W'), (11.5, 'W'), (10.0, 'w'), (8.5, 'w'))):
        steps = 90
        for i in range(steps + 1):
            a = -1.15 + (2.30 * i / steps)
            x = 2 + math.sin(a) * r
            y = 16 - math.cos(a) * r * 1.15
            edge = abs(i - steps / 2.0) / (steps / 2.0)
            if edge > 0.82 and band > 1:
                continue          # thin the ends so it reads as a swipe
            g.put(x, y, c)
    return g.rows()


def rows_js(name, rows):
    body = ",\n".join("    '%s'" % r for r in rows)
    return "  const %s = [\n%s\n  ];" % (name, body)


def replace(s, name, rows):
    pat = r"  const %s = \[\n(?:.*?\n)*?  \];" % name
    assert re.search(pat, s), "could not find " + name
    block = rows_js(name, rows)
    return re.sub(pat, lambda m: block, s, count=1)


TARGETS = [
    ("CHEST_CLOSED", lambda: chest(False), 28, 22),
    ("CHEST_OPEN", lambda: chest(True), 28, 22),
    ("SHRINE", shrine, 32, 40),
    ("ENCHANT_TABLE", enchant_table, 32, 24),
    ("ICON_HELM", icon_helm, 20, 20),
    ("ICON_CHEST", icon_chest, 20, 20),
    ("ICON_LEGS", icon_legs, 20, 20),
    ("SLASH", slash, 24, 32),
]


def main():
    s = io.open(SPR, encoding="utf-8").read()

    for name, fn, w, h in TARGETS:
        rows = fn()
        bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != w]
        assert not bad, (name, bad[:3])
        assert len(rows) == h, (name, len(rows), h)
        s = replace(s, name, rows)
        print("%-14s %2dx%-2d -> %dx%d logical" % (name, w, h, w // 2, h // 2))

    if "const PROP_D" not in s:
        anchor = "  const ENCHANT_TABLE = ["
        note = ("  /* Props, chests and item icons are authored at 2x detail over their\n"
                "     original logical footprints. */\n"
                "  const PROP_D = 2;\n\n")
        assert anchor in s
        s = s.replace(anchor, note + anchor, 1)

    subs = [
        ("A.makeSprite(ENCHANT_TABLE)", "A.makeSprite(ENCHANT_TABLE, null, PROP_D)"),
        ("A.makeSprite(SHRINE);", "A.makeSprite(SHRINE, null, PROP_D);"),
        ("A.makeSprite(SLASH);", "A.makeSprite(SLASH, null, PROP_D);"),
        ("A.makeSprite(CHEST_CLOSED, CHEST_TIERS[tier])",
         "A.makeSprite(CHEST_CLOSED, CHEST_TIERS[tier], PROP_D)"),
        ("A.makeSprite(CHEST_OPEN, CHEST_TIERS[tier])",
         "A.makeSprite(CHEST_OPEN, CHEST_TIERS[tier], PROP_D)"),
    ]
    for old, new in subs:
        if old in s:
            s = s.replace(old, new)

    # armour icons bake through a shared helper with an inline palette object
    old = """      armorCache[key] = A.makeSprite(rows, {
        D: mat.mid, d: mat.dark, G: mat.light, x: shade(mat.mid, mat.dark)
      });"""
    new = """      armorCache[key] = A.makeSprite(rows, {
        D: mat.mid, d: mat.dark, G: mat.light, x: shade(mat.mid, mat.dark)
      }, PROP_D);"""
    if old in s:
        s = s.replace(old, new)

    # export the chibi slime rows so the gold slime can reuse them
    if "SLIME_0: SLIME_0" not in s:
        anchor = "    DEATH_SPIKE: DEATH_SPIKE"
        assert anchor in s
        s = s.replace(anchor,
                      anchor + ",\n    SLIME_0: SLIME_0, SLIME_1: SLIME_1,\n"
                               "    ENEMY_D: ENEMY_D", 1)

    io.open(SPR, "w", encoding="utf-8").write(s)
    print("sprites.js props written")

    # --- gold slime reuses the chibi slime shape in a gold palette -----------
    b = io.open(BONUS, encoding="utf-8").read()
    if "GOLD_PAL" not in b:
        a = b.index("  const GOLD_SLIME = [")
        z = b.index("/* It never fights.")
        new = """  /* The gold slime is the ordinary slime in a gold palette, so it stays in
     step with the chibi art instead of drifting into a shape of its own. */
  const GOLD_PAL = {
    L: '#fff0a8', l: '#f2c14e', e: '#8a7440', W: '#ffffff'
  };

  """
        b = b[:a] + new + b[z:]
        b = b.replace(
            "    S.goldslime = [A.makeSprite(GOLD_SLIME), A.makeSprite(GOLD_SLIME_SQUASH)];",
            "    const raw = S.raw;\n"
            "    S.goldslime = [A.makeSprite(raw.SLIME_0, GOLD_PAL, raw.ENEMY_D),\n"
            "                   A.makeSprite(raw.SLIME_1, GOLD_PAL, raw.ENEMY_D)];")
        io.open(BONUS, "w", encoding="utf-8").write(b)
        print("bonus.js gold slime rewired")
    else:
        print("bonus.js already rewired")


if __name__ == "__main__":
    main()
