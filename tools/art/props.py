# -*- coding: utf-8 -*-
"""Redraw the wall torch and the pit spike bed at 2x detail."""
import io
import os
import re

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, "src", "art", "sprites.js")

TORCH_BODY = [
    '....tttttt......',
    '..ttBBBBBBtt....',
    '..tBBBBBBBBt....',
    '..tbBBBBBBbt....',
    '..tbbBBBBbbt....',
    '..tbbbbbbbbt....',
    '...tbbbbbbt.....',
    '....tttttt......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '..GGkkNNkkGG....',
    'GGGGkkNNkkGGGG..',
    'GGGGkkNNkkGGGG..',
    '..GGkkNNkkGG....',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '.....kNNk.......',
    '....kkNNk.......',
    '..kkGGNNk.......',
    '..kGGGkkk.......',
    '..kGGx..........',
    '..kGGx..........',
    '..kGGx..........',
    '..kGGx..........',
    '..kkxx..........',
    '................',
    '................',
    '................',
    '................',
]

# Four flame frames on a slow cycle. The shape breathes rather than swings --
# a torch that whips side to side reads as wind, not as a light source.
TORCH_FLAMES = [
    [
        '......YY........',
        '.....YWWY.......',
        '....yYWWYy......',
        '....yYWWYy......',
        '...yyYYYYyy.....',
        '...yyYYYYyy.....',
        '....yoYYoy......',
        '....yooooy......',
        '.....oooo.......',
        '......oo........',
    ],
    [
        '.....YYY........',
        '.....YWWY.......',
        '....yYWWYy......',
        '...yyYWWYy......',
        '...yyYYYYyy.....',
        '..yyoYYYYyy.....',
        '...yooYYoy......',
        '....yooooy......',
        '.....oooo.......',
        '......oo........',
    ],
    [
        '......YY........',
        '.....YWWYY......',
        '....yYWWWYy.....',
        '....yYWWWYy.....',
        '...yyYYYYYy.....',
        '...yyYYYYoy.....',
        '....yoYYooy.....',
        '....yoooooy.....',
        '.....ooooo......',
        '......oo........',
    ],
    [
        '......Y.........',
        '.....YWY........',
        '....yYWWYy......',
        '....yYWWYy......',
        '...yyYYYYy......',
        '...yoYYYYy......',
        '....ooYYoy......',
        '....yoooo.......',
        '.....ooo........',
        '......o.........',
    ],
]


def build_death_spike():
    """The killing floor at the bottom of a pit, at 32x28."""
    W, H = 32, 28
    grid = [['.'] * W for _ in range(H)]
    base = H - 6
    for i in range(6):
        cx = i * 5 + 3
        tip = 2 + (i % 3)
        for y in range(tip, base):
            half = ((y - tip) * 2) // max(1, (base - tip))
            for dx in range(-half, half + 1):
                x = cx + dx
                if 0 <= x < W:
                    grid[y][x] = 'R'
            if 0 <= cx < W:
                grid[y][cx] = 'r' if y > tip + 2 else 'R'
    for y in range(base, H):
        for x in range(W):
            if y == base:
                grid[y][x] = 'R'
            elif y == base + 1:
                grid[y][x] = 'r'
            elif y == base + 2:
                grid[y][x] = 'k' if x in (0, W - 1) else 'r'
            else:
                grid[y][x] = 'k'
    return [''.join(r) for r in grid]


def rows_js(name, rows, indent="  "):
    body = ",\n".join("%s    '%s'" % (indent, r) for r in rows)
    return "%sconst %s = [\n%s\n%s];" % (indent, name, body, indent)


def flames_js(frames):
    out = ["  const TORCH_FLAMES = ["]
    for i, f in enumerate(frames):
        rows = ",\n".join("      '%s'" % r for r in f)
        tail = "," if i < len(frames) - 1 else ""
        out.append("    [\n%s\n    ]%s" % (rows, tail))
    out.append("  ];")
    return "\n".join(out)


def main():
    death = build_death_spike()
    for name, rows, w, h in (("TORCH_BODY", TORCH_BODY, 16, 38),
                             ("DEATH_SPIKE", death, 32, 28)):
        bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != w]
        assert not bad, (name, bad[:3])
        assert len(rows) == h, (name, len(rows))
    for i, f in enumerate(TORCH_FLAMES):
        bad = [(j, len(r)) for j, r in enumerate(f) if len(r) != 16]
        assert not bad and len(f) == 10, (i, bad, len(f))
    print("props validated")

    s = io.open(SPR, encoding="utf-8").read()

    pat = r"  const TORCH_BODY = \[\n(?:.*?\n)*?  \];"
    assert re.search(pat, s), "could not find TORCH_BODY"
    body_block = rows_js("TORCH_BODY", TORCH_BODY)
    s = re.sub(pat, lambda m: body_block, s, count=1)

    pat = r"  const TORCH_FLAMES = \[\n(?:.*?\n)*?  \];"
    assert re.search(pat, s), 'pattern not found'
    _b = flames_js(TORCH_FLAMES)
    s = re.sub(pat, lambda m: _b, s, count=1)

    pat = r"  const DEATH_SPIKE = \[\n(?:.*?\n)*?  \];"
    assert re.search(pat, s), "could not find DEATH_SPIKE"
    spike_block = rows_js("DEATH_SPIKE", death)
    s = re.sub(pat, lambda m: spike_block, s, count=1)

    # bake them at tile detail
    s = s.replace("    torch: A.makeSprite(TORCH_FLAMES[0].concat(TORCH_BODY)),",
                  "    torch: A.makeSprite(TORCH_FLAMES[0].concat(TORCH_BODY), null, TILE_D),")
    s = s.replace("      return A.makeSprite(flame.concat(TORCH_BODY));",
                  "      return A.makeSprite(flame.concat(TORCH_BODY), null, TILE_D);")
    s = re.sub(r"A\.makeSprite\(DEATH_SPIKE\)", "A.makeSprite(DEATH_SPIKE, null, TILE_D)", s)

    io.open(SPR, "w", encoding="utf-8").write(s)
    print("props written")


if __name__ == "__main__":
    main()
