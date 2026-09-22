# -*- coding: utf-8 -*-
"""Generate src/art/font3.js: the faces the Three.js UI renders.

The 2D renderer drew the game's two bitmap faces as *pixel runs* -- one
fillRect per lit pixel -- and the small key-cap face (3x5) was sharpened with
Scale2x (EPX). EPX is the wrong tool for a three-pixel-wide letterform: M, N, V
and W are made of single-pixel diagonals, and EPX rounds them into blobs, so
"SHIFT" came out reading as "SHIFY". That is a legibility bug that the 2D
renderer could not fix and this tool does:

  * MICRO  -- the 3x5 face doubled with NEAREST neighbour instead of EPX, so a
              single-pixel diagonal becomes a clean 2x2 block. Blocky reads;
              blurred does not.
  * BODY   -- the existing 10x14 EPX-doubled prose face, unchanged, now drawn
              as crisp textured quads instead of pixel runs.
  * TITLE  -- a genuinely new face: the prose face doubled again and given a
              serif blast (a wide foot on capitals, a narrow shoulder at the
              top, a stem extension under the baseline) so headings read as
              carved stone rather than as scaled-up prose.

Only the TITLE face is new authoring; the other two are the game's own art
re-cut for a renderer that can show them. Metrics are deliberately unchanged --
MICRO still occupies a 3x5 logical cell (its atlas art is 6x10, drawn at half
logical units), BODY still occupies 5x7 -- because textWidth/textSmallWidth
feed the position of nearly every HUD element and layout must not move.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = os.path.join(ROOT, "src", "art", "base.js")
OUT = os.path.join(ROOT, "src", "art", "font3.js")


def parse_table(src, name, height):
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
    return out


def to_grid(rows, width):
    return [[(r >> (width - 1 - c)) & 1 for c in range(width)] for r in rows]


def to_bits(grid):
    w = len(grid[0])
    return [sum(v << (w - 1 - i) for i, v in enumerate(row)) for row in grid]


def nearest2x(grid):
    out = []
    for row in grid:
        doubled = []
        for v in row:
            doubled.append(v)
            doubled.append(v)
        out.append(doubled)
        out.append(list(doubled))
    return out


def serif(grid):
    """Blast a serif onto a doubled capital: a wide foot at the baseline, a
    narrow shoulder above it, and a stem extension under the last row."""
    h, w = len(grid), len(grid[0])
    out = [list(r) for r in grid]

    ink = [(y, x) for y in range(h) for x in range(w) if out[y][x]]
    if not ink:
        return out
    bottom = max(y for y, _ in ink)
    top = min(y for y, _ in ink)

    # A foot under the baseline: one row wider on each side of the stem run.
    row = out[bottom]
    left = min(x for x in range(w) if row[x]) if any(row) else None
    if left is not None:
        lo = left
        hi = max(x for x in range(w) if row[x])
        if hi - lo < w - 2:
            out[bottom][max(0, lo - 1)] = 1
            out[bottom][min(w - 1, hi + 1)] = 1

    # A shoulder: one extra pixel at the top corners, so capitals get the
    # bracketed look a serif face has.
    trow = out[top]
    lit = [x for x in range(w) if trow[x]]
    if lit:
        lo, hi = min(lit), max(lit)
        if lo > 0 and hi < w - 1 and hi - lo > 3:
            trow[lo - 1] = 1
            trow[hi + 1] = 1

    # A stem extension: two pixels hanging below the foot under the centre.
    centre = (lo + hi) // 2 if lit else w // 2
    if bottom + 1 < h:
        out[bottom][centre] = 1
        if bottom + 1 < h:
            out[bottom + 1][centre] = 1
    return out


def js_key(k):
    if len(k) == 1 and k.isalnum():
        return k
    swap = {" ": "SPACE", ".": "DOT", ",": "COMMA", ":": "COLON", ";": "SEMI",
            "-": "DASH", "!": "BANG", "?": "QUERY", "'": "QUOTE", '"': "DQUOTE",
            "/": "SLASH", "\\": "BSLASH", "(": "LPAREN", ")": "RPAREN",
            "[": "LBRACK", "]": "RBRACK", "<": "LT", ">": "GT", "=": "EQ",
            "+": "PLUS", "*": "STAR", "%": "PCT", "#": "HASH", "@": "AT",
            "&": "AMP", "$": "DOLLAR", "_": "UNDER", "|": "PIPE", "^": "CARET",
            "~": "TILDE", "`": "BACKTICK", "{": "LBRACE", "}": "RBRACE",
            ">=": "GE"}
    return swap.get(k, "U%04X" % ord(k[0]))


def emit(name, table, width, height, keys, indent="    "):
    lines = ["  const %s = {" % name]
    for k in sorted(keys, key=lambda c: (len(c), c)):
        if k not in table:
            continue
        bits = table[k]
        rows = ", ".join(str(b) for b in bits)
        lines.append("%s%s: [%s]," % (indent, js_key(k), rows))
    if lines[-1].endswith(","):
        lines[-1] = lines[-1][:-1]
    lines.append("  };")
    return "\n".join(lines)


def main():
    src = open(BASE, encoding="utf-8").read()
    glyphs = parse_table(src, "GLYPHS", 7)
    hd = parse_table(src, "GLYPHS_HD", 14)
    small = parse_table(src, "SMALL", 5)

    micro = {}
    for k in small:
        micro[k] = to_bits(nearest2x(to_grid(small[k], 3)))

    # BODY is the face the game already ships at 2x detail (Scale2x of the 5x7
    # prose face). Re-cut, not redrawn: it is the game's own letterform.
    body = {}
    for k in hd:
        body[k] = to_bits(to_grid(hd[k], 10))

    # TITLE doubles the body face again and blows a serif onto the capitals.
    title = {}
    for k, rows in hd.items():
        grid = nearest2x(to_grid(rows, 10))
        if k.isalpha() and k.isupper():
            grid = serif(grid)
        title[k] = to_bits(grid)

    keys = sorted(set(list(glyphs.keys()) + list(hd.keys()) + list(small.keys())))

    js = [
        "/* GENERATED by tools/art/font3.py -- do not hand-edit.",
        "",
        "   Three faces for the Three.js UI (see the tool for why each exists):",
        "     MICRO 6x10   drawn at half logical units -> a 3x5 cell (key caps)",
        "     BODY 10x14   drawn at half logical units -> a 5x7 cell (prose)",
        "     TITLE 20x28  drawn at full logical units (headings)",
        "",
        "   Metrics are unchanged from the 2D faces on purpose: textWidth and",
        "   textSmallWidth still return the same numbers, so no layout moves. */",
        "window.DS = window.DS || {};",
        "",
        "(function (DS) {",
        "  'use strict';",
        "",
        emit("MICRO", micro, 6, 10, keys),
        "",
        emit("BODY", body, 10, 14, keys),
        "",
        emit("TITLE", title, 20, 28, keys),
        "",
        "  DS.Font3 = {",
        "    MICRO: MICRO, MICRO_W: 6, MICRO_H: 10, MICRO_STEP: 0.5,",
        "    BODY: BODY, BODY_W: 10, BODY_H: 14, BODY_STEP: 0.5,",
        "    TITLE: TITLE, TITLE_W: 20, TITLE_H: 28, TITLE_STEP: 1,",
        "    /* The logical cells the layout maths already assumes. */",
        "    CELL_W: 5, CELL_H: 7, CELL_GAP: 1,",
        "    SMALL_CELL_W: 3, SMALL_CELL_H: 5, SMALL_CELL_GAP: 1",
        "  };",
        "})(window.DS);",
        "",
    ]
    open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(js))
    print("wrote %s  micro=%d body=%d title=%d" % (OUT, len(micro), len(body), len(title)))


if __name__ == "__main__":
    main()
