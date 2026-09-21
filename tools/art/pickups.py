# -*- coding: utf-8 -*-
"""Redraw pickups and projectiles at 2x detail.

Same logical footprints as before, so drop spacing, pickup radii and the
projectile hit boxes are untouched. Palette letters are unchanged so the
element tints (ORB_TINTS) keep working.
"""
import io
import os
import re

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, "src", "art", "sprites.js")

COIN = [
    '...yyyyyy...',
    '..yYYYYYYy..',
    '.yYYYYYYYYy.',
    'yYYYYYYYYYYy',
    'yYYyyyyyyYYy',
    'yYyy....yyYy',
    'yYyy....yyYy',
    'yYYyyyyyyYYy',
    'yYYYYYYYYYYy',
    '.yYYYYYYYYy.',
    '..yYYYYYYy..',
    '...yyyyyy...',
]

HEART = [
    '..RRR..RRR......',
    '.RrrrRRrrrR.....',
    'RrrrrrrrrrrR....',
    'RrWrrrrrrrrR....',
    'RrWrrrrrrrrR....',
    'RrrrrrrrrrrR....',
    '.RrrrrrrrrR.....',
    '.RrrrrrrrrR.....',
    '..RrrrrrrR......',
    '...RrrrrR.......',
    '....RrrR........',
    '.....RR.........',
    '................',
    '................',
]

SHARD = [
    '......SS......',
    '.....SSSS.....',
    '....SSsSSS....',
    '...SSsSSsSS...',
    '..SSsSSSSsSS..',
    '.SSsSSWWSSsSS.',
    'SSsSSSWWSSSsSS',
    'SSsSSSWWSSSsSS',
    '.SSsSSWWSSsSS.',
    '..SSsSSSSsSS..',
    '...SSsSSsSS...',
    '....SSsSSS....',
    '.....SSSS.....',
    '......SS......',
    '..............',
    '..............',
]

KEY = [
    '..yyyyyy........',
    '.yyYYYYyy.......',
    'yyY....Yyy......',
    'yY......Yy......',
    'yY......Yy......',
    'yyY....Yyy......',
    '.yyYYYYyy.......',
    '..yyyyyy........',
    '....yy..........',
    '....yy..........',
    '....yyyyy.......',
    '....yy..........',
    '....yyyy........',
    '....yy..........',
    '....yyy.........',
    '................',
]

ARROW = [
    '..............w...',
    '.............ww...',
    'nnnnnnnnnnnnnnWWw.',
    'nnnnnnnnnnnnnnWWw.',
    '.............ww...',
    '..............w...',
]

ORB = [
    '......yyyy......',
    '....yyYYYYyy....',
    '...yYYYYYYYYy...',
    '..yYYYYYYYYYYy..',
    '.oyYYYYWWYYYYyo.',
    'oyYYYYWWWWYYYYyo',
    'oyYYYWWWWWWYYYyo',
    'oyYYYWWWWWWYYYyo',
    'oyYYYYWWWWYYYYyo',
    '.oyYYYYWWYYYYyo.',
    '..oyYYYYYYYYyo..',
    '...oyyYYYYyyo...',
    '....ooyyyyoo....',
    '.....oooooo.....',
    '......oooo......',
    '................',
]


def rows_js(name, rows):
    body = ",\n".join("    '%s'" % r for r in rows)
    return "  const %s = [\n%s\n  ];" % (name, body)


TARGETS = [
    ("COIN", COIN, 12, 12, 6, 6),
    ("HEART", HEART, 16, 14, 8, 7),
    ("SHARD", SHARD, 14, 16, 7, 8),
    ("KEY", KEY, 16, 16, 8, 8),
    ("ARROW", ARROW, 18, 6, 9, 3),
    ("ORB", ORB, 16, 16, 8, 8),
]


def main():
    s = io.open(SPR, encoding="utf-8").read()

    for name, rows, w, h, lw, lh in TARGETS:
        bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != w]
        assert not bad, (name, bad[:3])
        assert len(rows) == h, (name, len(rows), h)
        pat = r"  const %s = \[\n(?:.*?\n)*?  \];" % name
        assert re.search(pat, s), "could not find " + name
        block = rows_js(name, rows)
        s = re.sub(pat, lambda m: block, s, count=1)
        print("%-6s %2dx%-2d art -> %dx%d logical" % (name, w, h, lw, lh))

    if "const PICKUP_D" not in s:
        old = "  // ---- pickups & projectiles ----"
        new = """  /* Pickups and projectiles are authored at 2x detail: the art grid doubles
     while the logical footprint stays exactly what the pickup radii and the
     projectile hit boxes already assume. */
  const PICKUP_D = 2;

  // ---- pickups & projectiles ----"""
        assert old in s
        s = s.replace(old, new, 1)

    for name in ("COIN", "HEART", "SHARD", "KEY", "ARROW", "ORB"):
        s = re.sub(r"A\.makeSprite\(%s\)" % name,
                   "A.makeSprite(%s, null, PICKUP_D)" % name, s)
        s = re.sub(r"A\.makeSprite\(%s, ([A-Za-z_][A-Za-z0-9_\[\]\.]*)\)" % name,
                   r"A.makeSprite(%s, \1, PICKUP_D)" % name, s)

    io.open(SPR, "w", encoding="utf-8").write(s)
    print("pickups written")


if __name__ == "__main__":
    main()
