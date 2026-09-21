# -*- coding: utf-8 -*-
"""Generate the high-detail font tables in src/art/base.js.

The game's two bitmap faces (5x7 for prose, 3x5 for key caps) were the last
art still drawn at 1x, so text looked twice as coarse as the sprites beside it.
Replacing them with hand-drawn hi-res faces would have been a large amount of
typing AND a layout risk, because `textWidth` feeds the position of nearly
every HUD element.

So the 5x7 prose face is doubled with Scale2x (EPX) instead: an algorithm built
for exactly this, which rounds diagonal steps while leaving straight edges
alone. The letterforms stay recognisably the same face, the diagonals in A M N
S W V K Z stop looking like staircases, and -- crucially -- each glyph still
occupies the same number of LOGICAL pixels, because the renderer draws the
doubled grid at half-unit steps. Metrics are unchanged, so no layout moves.

The 3x5 micro face used for key caps is deliberately NOT doubled. Its letters
are three pixels wide, so M, N, V and W are single-pixel diagonals that EPX
rounds into indistinguishable blobs -- SHIFT came out reading as SHIFY. On a
key cap, legibility beats crispness.
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = os.path.join(ROOT, "src", "art", "base.js")


def parse_table(src, name, width, height):
    """Pull a `const NAME = { KEY: [bits, ...] }` table out of the JS."""
    start = src.index("const %s = {" % name)
    depth = 0
    for i in range(start, len(src)):
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    body = src[start:end]

    out = {}
    for m in re.finditer(r"(?:'((?:\\.|[^'])*)'|([A-Za-z0-9]))\s*:\s*\[([^\]]*)\]", body):
        key = m.group(1) if m.group(1) is not None else m.group(2)
        rows = [int(v) for v in m.group(3).replace("\n", "").split(",") if v.strip()]
        assert len(rows) == height, "%s[%r]: %d rows, want %d" % (name, key, len(rows), height)
        out[key] = rows
    return out, body


def to_grid(rows, width):
    return [[(r >> (width - 1 - c)) & 1 for c in range(width)] for r in rows]


def scale2x(grid):
    """EPX / Scale2x. Rounds a diagonal step; leaves straight runs untouched."""
    h, w = len(grid), len(grid[0])

    def at(y, x):
        if 0 <= y < h and 0 <= x < w:
            return grid[y][x]
        return 0

    out = [[0] * (w * 2) for _ in range(h * 2)]
    for y in range(h):
        for x in range(w):
            p = grid[y][x]
            a, b = at(y - 1, x), at(y, x + 1)
            c, d = at(y, x - 1), at(y + 1, x)
            e0 = a if (c == a and c != d and a != b) else p
            e1 = b if (a == b and a != c and b != d) else p
            e2 = c if (d == c and d != b and c != a) else p
            e3 = d if (b == d and b != a and d != c) else p
            out[y * 2][x * 2] = e0
            out[y * 2][x * 2 + 1] = e1
            out[y * 2 + 1][x * 2] = e2
            out[y * 2 + 1][x * 2 + 1] = e3
    return out


def to_bits(grid):
    w = len(grid[0])
    return [sum(v << (w - 1 - i) for i, v in enumerate(row)) for row in grid]


def js_key(k):
    if len(k) == 1 and (k.isalnum()):
        return k
    return "'%s'" % (k.replace("\\", "\\\\").replace("'", "\\'"))


def emit(name, table, width, height, comment):
    lines = ["  /* %s */" % comment, "  const %s = {" % name]
    keys = list(table.keys())
    for i, k in enumerate(keys):
        tail = "," if i < len(keys) - 1 else ""
        vals = ", ".join(str(v) for v in table[k])
        lines.append("    %s: [%s]%s" % (js_key(k), vals, tail))
    lines.append("  };")
    return "\n".join(lines)


def main():
    src = io.open(BASE, encoding="utf-8").read()

    glyphs, _ = parse_table(src, "GLYPHS", 5, 7)
    print("parsed %d prose glyphs" % len(glyphs))

    glyphs_hd = {}
    for k, rows in glyphs.items():
        glyphs_hd[k] = to_bits(scale2x(to_grid(rows, 5)))
    block = emit("GLYPHS_HD", glyphs_hd, 10, 14,
                 "Scale2x of GLYPHS: 10x14, drawn at half-unit steps so the face\n"
                 "     occupies the same 5x7 LOGICAL cell and no layout moves. The 3x5\n"
                 "     micro face is deliberately NOT doubled -- see tools/art/font.py.")

    marker = "  const GLYPH_W = 5, GLYPH_H = 7, GLYPH_GAP = 1;"
    assert marker in src

    # replace an existing generated block, or insert a fresh one
    begin = "  // >>> generated font tables (tools/art/font.py)"
    end = "  // <<< generated font tables"
    payload = begin + "\n" + block + "\n" + end + "\n\n" + marker

    if begin in src:
        a = src.index(begin)
        b = src.index(end) + len(end) + 1
        # keep the marker line that follows
        rest = src[b:].lstrip("\n")
        assert rest.startswith(marker)
        src = src[:a] + payload + rest[len(marker):]
    else:
        src = src.replace(marker, payload, 1)

    if "GLYPHS_HD:" not in src:
        src = src.replace("    GLYPHS: GLYPHS,",
                          "    GLYPHS: GLYPHS,\n    GLYPHS_HD: GLYPHS_HD,", 1)

    io.open(BASE, "w", encoding="utf-8").write(src)
    print("wrote GLYPHS_HD (10x14) into src/art/base.js")


if __name__ == "__main__":
    main()
