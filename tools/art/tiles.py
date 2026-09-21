# -*- coding: utf-8 -*-
"""Generate the 2x-detail dungeon tiles.

Hand-typing a 32x32 seamless brick is a good way to get a visible seam, so the
patterns are computed instead: every rule is expressed modulo the tile size,
which makes wrapping on all four edges automatic.
"""
import io
import os
import re

W = 32          # 16 logical units at 2x detail
H = 32
COURSE = 8      # brick course height in art pixels
BRICK = 16      # brick length in art pixels


def _hash(x, y):
    """Cheap deterministic noise, stable across runs."""
    n = (x * 73856093) ^ (y * 19349663)
    n = (n ^ (n >> 13)) & 0xFFFFFFFF
    return (n * 1274126177) & 0xFFFFFFFF


def wall_pixel(x, y):
    """One brick face pixel, wrapping cleanly on both axes."""
    row = (y // COURSE) % 4
    ry = y % COURSE
    offset = (BRICK // 2) if row % 2 else 0
    bx = (x + offset) % BRICK

    if ry == 0:
        return 'x'            # horizontal mortar
    if bx == 0:
        return 'x'            # vertical mortar
    if ry == 1:
        return 'g'            # lit top bevel of each brick
    if ry == COURSE - 1:
        return 'd'            # shadowed bottom bevel

    h = _hash(x // 2, y // 2)
    if h % 23 == 0:
        return 'd'            # small chip
    if h % 31 == 0:
        return 'g'            # catch of light
    return 'D'


def build_wall():
    return [''.join(wall_pixel(x, y) for x in range(W)) for y in range(H)]


def build_floor():
    """Wall with a lit capstone lip, used for any walkable surface."""
    rows = build_wall()
    out = []
    for y in range(H):
        if y == 0:
            out.append('g' * W)
        elif y == 1:
            out.append(''.join('G' if x % 2 == 0 else 'g' for x in range(W)))
        elif y == 2:
            out.append(''.join('g' if _hash(x, 7) % 5 else 'G' for x in range(W)))
        elif y == 3:
            out.append('x' * W)
        else:
            out.append(rows[y])
    out[H - 1] = 'x' * W
    return out


def build_platform():
    """Thin one-way ledge: lit plank top, dark hollow underside."""
    h = 10
    out = []
    for y in range(h):
        row = []
        for x in range(W):
            if y == 0:
                row.append('B' if _hash(x, 1) % 4 else 'b')
            elif y == 1:
                row.append('b' if x % 8 else 'B')
            elif y in (2, 3, 4):
                row.append('n' if x % 8 else 'b')
            elif y == 5:
                row.append('n')
            elif y == 6:
                row.append('G' if x % 8 == 0 else 'k')
            elif y == 7:
                row.append('k' if x % 4 else '.')
            else:
                row.append('.')
        out.append(''.join(row))
    return out


def build_spike():
    """A row of four iron spikes filling the lower half of the tile."""
    h = 16
    grid = [['.'] * W for _ in range(h)]
    for i in range(4):
        cx = i * 8 + 4
        for y in range(h - 3):
            # widen towards the base
            half = (y * 3) // (h - 3)
            for dx in range(-half, half + 1):
                x = (cx + dx) % W
                grid[y][x] = 'G'
            x = cx % W
            grid[y][x] = 'W' if y < 4 else 'w'
            if half:
                grid[y][(cx - half) % W] = 'G'
                grid[y][(cx + half) % W] = 'x'
    for x in range(W):
        grid[h - 3][x] = 'G'
        grid[h - 2][x] = 'x'
        grid[h - 1][x] = 'x'
    return [''.join(r) for r in grid]


def rows_js(name, rows, comment=None):
    out = []
    if comment:
        out.append("  // " + comment)
    out.append("  const %s = [" % name)
    out.append(",\n".join("    '%s'" % r for r in rows))
    out.append("  ];")
    return "\n".join(out)


def main():
    root = r"C:\Project\Fun Project\Game\4. Dungeon Scrolling"
    p = os.path.join(root, "src", "art", "sprites.js")
    s = io.open(p, encoding="utf-8").read()

    wall = build_wall()
    floor = build_floor()
    platform = build_platform()
    spike = build_spike()

    for name, rows, w in (("WALL", wall, W), ("FLOOR", floor, W),
                          ("PLATFORM", platform, W), ("SPIKE", spike, W)):
        bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != w]
        assert not bad, (name, bad[:3])
        print("%-9s %dx%d" % (name, w, len(rows)))

    blocks = {
        "WALL": rows_js("WALL", wall),
        "FLOOR": rows_js("FLOOR", floor,
                         "Wall with a lit top edge -- used for the surface of any floor."),
        "PLATFORM": rows_js("PLATFORM", platform),
        "SPIKE": rows_js("SPIKE", spike),
    }
    for name, block in blocks.items():
        pat = r"  (?:// [^\n]*\n  )?const %s = \[\n(?:.*?\n)*?  \];" % name
        assert re.search(pat, s), "could not find " + name
        s = re.sub(pat, lambda m: block, s, count=1)

    s = s.replace("  const SOLID = 'kkkkkkkkkkkkkkkk';",
                  "  const SOLID = 'k'.repeat(32);\n\n"
                  "  /* Tiles are authored at 2x detail: a 32x32 grid covering the same 16x16\n"
                  "     logical tile. The brick patterns are generated modulo the tile size, so\n"
                  "     they still wrap seamlessly on all four edges. */\n"
                  "  const TILE_D = 2;")

    io.open(p, "w", encoding="utf-8").write(s)
    print("tiles written")


if __name__ == "__main__":
    main()
