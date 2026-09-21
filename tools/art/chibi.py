# -*- coding: utf-8 -*-
"""Redraw the hero and every ordinary enemy in a chibi silhouette at 2x detail.

Footprints in LOGICAL units are unchanged, so collision boxes, spawn spacing
and the elite/mini/colossal scaling all keep working. Only the art grid gets
denser (2 art pixels per logical pixel) and the proportions get cuter: bigger
rounder heads, shorter bodies, oversized eyes.
"""
import io
import os

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, "src", "art", "sprites.js")

# --- hero: 24 x 34 art over a 12 x 17 logical footprint ---------------------

HERO_HEAD = [
    '.......kkkkkkkkkk.......',
    '.....kkNNNNNNNNNNkk.....',
    '....kNNNNNNNNNNNNNNk....',
    '...kNNNNNNNNNNNNNNNNk...',
    '...kNNNNNNNNNNNNNNNNk...',
    '..kNNNNNNNNNNNNNNNNNNk..',
    '..kNNNNNNNNNNNNNNNNNNk..',
    '..kNNNNNNNNNNNNNNNNNNk..',
    '..kNNuUUUUUUUUUUUUuNNk..',
    '..kNNuUUUUUUUUUUUUuNNk..',
    '..kNNuUUkkkUUkkkUUuNNk..',
    '..kNNuUUkWkUUkWkUUuNNk..',
    '..kNNuUUkkkUUkkkUUuNNk..',
    '..kNNuUUUUUUUUUUUUuNNk..',
    '..kNNumUUUUkkUUUUmuNNk..',
    '..kNNumUUUUUUUUUUmuNNk..',
    '...kNNuUUUUUUUUUUuNNk...',
    '....kuUUUUUUUUUUUUuk....',
    '.....kuUUUUUUUUUUuk.....',
    '........kkuuuukk........',
]

HERO_BODY = [
    '.....kCCCCCCCCCCCCk.....',
    '....kCCCCCCCCCCCCCCk....',
    '....kCCCCCCCCCCCCCCk....',
    '....kCCCCCCCCCCCCCCk....',
    '....kCCbbbbbbbbbbCCk....',
    '....kCbbbbbbbbbbbbCk....',
    '....kCbbbbbbbbbbbbCk....',
    '....kCCCCCCCCCCCCCCk....',
]

HERO_LEGS = {
    'IDLE': [
        '....kcccccccccccccck....',
        '....kccccck..kccccck....',
        '....kccccck..kccccck....',
        '....knnnnnk..knnnnnk....',
        '...knnnnnnk..knnnnnnk...',
        '...kkkkkkkk..kkkkkkkk...',
    ],
    'RUN_0': [
        '....kcccccccccccccck....',
        '..kccccck.....kccccck...',
        '.kccccck.......kccccck..',
        '.knnnnnk........knnnnnk.',
        'knnnnnnk........knnnnnnk',
        'kkkkkkkk........kkkkkkkk',
    ],
    'RUN_1': [
        '....kcccccccccccccck....',
        '....kcccccccccccccck....',
        '....kcccccccccccccck....',
        '....knnnnnnnnnnnnnnk....',
        '...knnnnnnnnnnnnnnnnk...',
        '...kkkkkkkk..kkkkkkkk...',
    ],
    'RUN_2': [
        '....kcccccccccccccck....',
        '...kccccck.....kccccck..',
        '..kccccck.......kccccck.',
        '.knnnnnk........knnnnnk.',
        'knnnnnnk........knnnnnnk',
        'kkkkkkkk........kkkkkkkk',
    ],
    'JUMP': [
        '....kcccccccccccccck....',
        '....kccccck..kccccck....',
        '...kccccck....kccccck...',
        '...knnnnnk....knnnnnk...',
        '..knnnnnnk....knnnnnnk..',
        '..kkkkkkkk....kkkkkkkk..',
    ],
    'FALL': [
        '....kcccccccccccccck....',
        '..kccccck.....kccccck...',
        '.kccccck.......kccccck..',
        'kccccck.........kccccck.',
        'knnnnnk.........knnnnnk.',
        'kkkkkkk.........kkkkkkk.',
    ],
}

# --- enemies ----------------------------------------------------------------

SLIME_0 = [
    '.......kkkkkkkkkk.......',
    '.....kkLLLLLLLLLLkk.....',
    '....kLLLLLLLLLLLLLLk....',
    '...kLLWWLLLLLLLLLLLLk...',
    '..kLLWWLLLLLLLLLLLLLLk..',
    '..kLLLLLLLLLLLLLLLLLLk..',
    '..kLLLkkkLLLLkkkLLLLLk..',
    '..kLLLkWkLLLLkWkLLLLLk..',
    '..kLLLkkkLLLLkkkLLLLLk..',
    '..kLLLLLLLLLLLLLLLLLLk..',
    '..kLLLLLLkkkkLLLLLLLLk..',
    '..klllLLLLLLLLLLLLlllk..',
    '..kllllllLLLLLLllllllk..',
    '..keelllllllllllllleek..',
    '.keeeelllllllllllleeeek.',
    '.keeeeeeeeeeeeeeeeeeeek.',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'kkkkkkkkkkkkkkkkkkkkkkkk',
]

SLIME_1 = [
    '........................',
    '........................',
    '........................',
    '.......kkkkkkkkkk.......',
    '....kkLLLWWLLLLLLLkk....',
    '..kLLLLLWWLLLLLLLLLLLk..',
    '..kLLkkkLLLLLkkkLLLLLk..',
    '..kLLkWkLLLLLkWkLLLLLk..',
    '..kLLkkkLLLLLkkkLLLLLk..',
    '.kLLLLLLLLkkkkLLLLLLLLk.',
    '.klllLLLLLLLLLLLLLLLllk.',
    'kllllllllLLLLLLLLllllllk',
    'keelllllllllllllllllleek',
    'keeeeellllllllllllleeeek',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'keeeeeeeeeeeeeeeeeeeeeek',
    'kkkkkkkkkkkkkkkkkkkkkkkk',
]

ZOMBIE_0 = [
    '......kkkkkkkk......',
    '....kknnnnnnnnkk....',
    '...knnnnnnnnnnnnk...',
    '..knnnnnnnnnnnnnnk..',
    '..knnnnnnnnnnnnnnk..',
    '..knnllllllllllnnk..',
    '..knllllllllllllnk..',
    '..kllkkkllllkkkllk..',
    '..kllkRkllllkRkllk..',
    '..kllkkkllllkkkllk..',
    '..kllllllllllllllk..',
    '..kllllkkkkkkllllk..',
    '..kllllllllllllllk..',
    '...kllllllllllllk...',
    '....klllllllllllk...',
    '......kkllllkk......',
    '....keeeeeeeeeek....',
    '...keeeeeeeeeeeek...',
    '..keeeeeeeeeeeeeek..',
    '..keeeeeeeeeeeeeek..',
    '..keelllllllllleek..',
    '..keeeeeeeeeeeeeek..',
    '...kddddddddddddk...',
    '...kddddddddddddk...',
    '...kddddk..kddddk...',
    '...knnnnk..knnnnk...',
    '..knnnnnk..knnnnnk..',
    '..kkkkkkk..kkkkkkk..',
]

ZOMBIE_1_LEGS = [
    '...kddddddddddddk...',
    '..kddddk....kddddk..',
    '..knnnnk....knnnnk..',
    '.knnnnnk....knnnnnk.',
    '.kkkkkkk....kkkkkkk.',
    '....................',
]

BAT_0 = [
    'kddk..kkkkkkkkkk..kddk',
    'kddk.kddddddddddk.kddk',
    'kddkkdddddddddddkkkddk',
    'kddkkddRRddddRRddkkddk',
    'kddkkddRRddddRRddkkddk',
    'kddk.kddddddddddk.kddk',
    'kddk.kdWWWWWWWWdk.kddk',
    'kddk..kdWWWWWWdk..kddk',
    '.kdk...kkkkkkkk...kdk.',
    '.kdk..............kdk.',
    '..k................k..',
]

BAT_1 = [
    '......kkkkkkkkkk......',
    '.....kddddddddddk.....',
    'kk..kdddddddddddk..kk.',
    'kdkkddRRddddRRddkkdk..',
    'kddkkdRRddddRRddkkddk.',
    'kddk.kddddddddddk.kddk',
    'kddkkkdWWWWWWWWdkkkddk',
    'kddkkkkdWWWWWWdkkkkddk',
    'kddk...kkkkkkkk...kddk',
    '.kdk..............kdk.',
    '..k................k..',
]

SKELETON_0 = [
    '......kkkkkkkk......',
    '....kkwwwwwwwwkk....',
    '...kwwwwwwwwwwwwk...',
    '..kwwwwwwwwwwwwwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwkkkkwwwwkkkkwk..',
    '..kwkRRkwwwwkRRkwk..',
    '..kwkRRkwwwwkRRkwk..',
    '..kwkkkkwwwwkkkkwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwwwwwkkkkwwwwwk..',
    '..kwwkwkwkwkwkwwwk..',
    '...kwwwwwwwwwwwwk...',
    '.....kkwwwwwwkk.....',
    '.......kwwwwk.......',
    '....kwwwwwwwwwwk....',
    '...kwwwwwwwwwwwwk...',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwkwwwwwwwwkwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '...kwwwwwwwwwwwwk...',
    '....kwwwwwwwwwwk....',
    '...kwwwwk..kwwwwk...',
    '...kwwwwk..kwwwwk...',
    '...kwwwwk..kwwwwk...',
    '..kwwwwwk..kwwwwwk..',
    '..kkkkkkk..kkkkkkk..',
]

SKELETON_1_LEGS = [
    '....kwwwwwwwwwwk....',
    '..kwwwwk....kwwwwk..',
    '..kwwwwk....kwwwwk..',
    '.kwwwwwk....kwwwwwk.',
    '.kkkkkkk....kkkkkkk.',
    '....................',
]

CROWN = [
    '..y......yy......y..',
    '.yy.....yyyy.....yy.',
    '.yyy...yyyyyy...yyy.',
    '.yyyy.yyyyyyyy.yyyy.',
    '.yyyyyyyyyyyyyyyyyy.',
    'kyyyyyyyyyyyyyyyyyyk',
    'kyyYYyyyyRRyyyyYYyyk',
    'kyyYYyyyyRRyyyyYYyyk',
    'kyyyyyyyyyyyyyyyyyyk',
    'kyyyyyyyyyyyyyyyyyyk',
    '.kyyyyyyyyyyyyyyyyk.',
    '..kkkkkkkkkkkkkkkk..',
]


def check(name, rows, w, h):
    bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != w]
    if bad:
        raise SystemExit("%s: wrong width %s (want %d)" % (name, bad[:4], w))
    if len(rows) != h:
        raise SystemExit("%s: %d rows, want %d" % (name, len(rows), h))


def js(name, rows, indent="  "):
    body = ",\n".join("%s    '%s'" % (indent, r) for r in rows)
    return "%sconst %s = [\n%s\n%s];\n" % (indent, name, body, indent)


def main():
    hero_idle = HERO_HEAD + HERO_BODY + HERO_LEGS['IDLE']
    check("HERO_HEAD", HERO_HEAD, 24, 20)
    check("HERO_BODY", HERO_BODY, 24, 8)
    for k, v in HERO_LEGS.items():
        check("HERO_LEGS." + k, v, 24, 6)
    check("hero_idle", hero_idle, 24, 34)

    check("SLIME_0", SLIME_0, 24, 18)
    check("SLIME_1", SLIME_1, 24, 18)
    check("ZOMBIE_0", ZOMBIE_0, 20, 28)
    check("ZOMBIE_1_LEGS", ZOMBIE_1_LEGS, 20, 6)
    check("BAT_0", BAT_0, 22, 11)
    check("BAT_1", BAT_1, 22, 11)
    check("SKELETON_0", SKELETON_0, 20, 28)
    check("SKELETON_1_LEGS", SKELETON_1_LEGS, 20, 6)
    check("CROWN", CROWN, 20, 12)
    print("all art validated")


if __name__ == "__main__":
    main()


# --- hurt faces --------------------------------------------------------------
# Eyes screwed into crosses, mouth thrown open. Only the face band differs from
# the resting pose; every other row is reused verbatim, which guarantees the
# silhouette, the pivot and the baseline stay identical between the two frames.

SLIME_HURT = SLIME_0[:6] + [
    '..kLLLkLkLLLLkLkLLLLLk..',
    '..kLLLLkLLLLLLkLLLLLLk..',
    '..kLLLkLkLLLLkLkLLLLLk..',
    '..kLLLLLLLLLLLLLLLLLLk..',
    '..kLLLLkkkkkkkkLLLLLLk..',
] + SLIME_0[11:]

ZOMBIE_HURT = ZOMBIE_0[:7] + [
    '..kllkLkllllkLkllk..',
    '..kllLkLllllLkLllk..',
    '..kllkLkllllkLkllk..',
    '..kllllllllllllllk..',
    '..kllkkkkkkkkkkllk..',
] + ZOMBIE_0[12:]

SKELETON_HURT = SKELETON_0[:5] + [
    '..kwkwkwwwwkwkwwwk..',
    '..kwwkwwwwwwkwwwwk..',
    '..kwkwkwwwwkwkwwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwwwwwwwwwwwwwwk..',
    '..kwkkkkkkkkkkkkwk..',
] + SKELETON_0[11:]


def check_hurt():
    check("SLIME_HURT", SLIME_HURT, 24, 18)
    check("ZOMBIE_HURT", ZOMBIE_HURT, 20, 28)
    check("SKELETON_HURT", SKELETON_HURT, 20, 28)
    print("hurt faces validated")
