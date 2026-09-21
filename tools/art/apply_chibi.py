# -*- coding: utf-8 -*-
"""Write the validated chibi art into sprites.js and bake it at 2x detail."""
import io
import os
import re

import chibi

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SPR = os.path.join(ROOT, "src", "art", "sprites.js")

BAT_0 = [
    'kddk............kddk',
    'kddk............kddk',
    'kddk..kkkkkkkk..kddk',
    'kddk.kddddddddk.kddk',
    'kddk.kddddddddk.kddk',
    'kddk.kdRRddRRdk.kddk',
    'kddk.kdRRddRRdk.kddk',
    'kddk.kddddddddk.kddk',
    'kddk.kdWWWWWWdk.kddk',
    'kddk..kdWWWWdk..kddk',
    '.kdk...kkkkkk...kdk.',
    '.kdk...kddddk...kdk.',
    '..k....kddddk....k..',
    '.......kddddk.......',
    '.......kkkkkk.......',
    '....................',
]

BAT_1 = [
    '....................',
    '....................',
    '......kkkkkkkk......',
    '.....kddddddddk.....',
    'kk...kddddddddk...kk',
    'kdk..kdRRddRRdk..kdk',
    'kddk.kdRRddRRdk.kddk',
    'kddk.kddddddddk.kddk',
    'kddkkkdWWWWWWdkkkddk',
    'kddk..kdWWWWdk..kddk',
    'kddk...kkkkkk...kddk',
    '.kdk...kddddk...kdk.',
    '..k....kddddk....k..',
    '.......kddddk.......',
    '.......kkkkkk.......',
    '....................',
]


# Wings held at rest, eyes crossed out.
BAT_HURT = BAT_0[:3] + [
    'kddkkddLddddLddkkddk',
    'kddkkdLdLddLdLddkddk',
    'kddkkddLddddLddkkddk',
    'kddkkddddddddddkkddk',
    'kddkkdWWWWWWWWdkkddk',
] + BAT_0[8:]


def rows_js(name, rows, comment=None):
    out = []
    if comment:
        out.append("  // " + comment)
    out.append("  const %s = [" % name)
    out.append(",\n".join("    '%s'" % r for r in rows))
    out.append("  ];\n")
    return "\n".join(out)


def build_hero_block():
    H = chibi
    parts = []
    parts.append("""  // ---- player (24 x 34 art at 2x detail, over an 8 x 14 body box) ----------

  /* Chibi proportions: the head takes the top 20 of 34 art rows, the torso is
     deliberately stubby and the legs are short. The art is wider and taller
     than the collision box on purpose -- growing the box instead would make
     the hero a full tile tall and every one-tile gap in every existing level
     would become impassable. The renderer offsets the sprite so the feet still
     land on the box.

     Authored at HERO_D detail: 24x34 art pixels cover the same 12x17 logical
     units the 1x version did, so placement and physics are untouched. The
     palette letters are the ones the paper doll remaps, so armour recolouring
     keeps working unchanged. */
  const HERO_D = 2;
""")
    parts.append(rows_js("HERO_HEAD", H.HERO_HEAD))
    parts.append(rows_js("HERO_BODY", H.HERO_BODY))
    parts.append("""  const HERO_TORSO = HERO_HEAD.concat(HERO_BODY);
  const BLANK_ROW = '........................';

  function heroWith(legs) { return HERO_TORSO.concat(legs); }
""")
    order = [("HERO_IDLE_0", "IDLE", None),
             ("HERO_RUN_0", "RUN_0", None),
             ("HERO_RUN_1", "RUN_1", None),
             ("HERO_RUN_2", "RUN_2", None),
             ("HERO_JUMP", "JUMP", None),
             ("HERO_FALL", "FALL", None)]
    for name, key, _ in order:
        body = ",\n".join("    '%s'" % r for r in H.HERO_LEGS[key])
        parts.append("  const %s = heroWith([\n%s\n  ]);\n" % (name, body))
    parts.append("""  /* Same pose two art pixels lower -- one logical pixel of breathing bob. The
     feet stay put, so the drop is taken out of the torso. */
  const HERO_IDLE_1 = [BLANK_ROW, BLANK_ROW]
    .concat(HERO_HEAD, HERO_BODY.slice(2), HERO_IDLE_0.slice(28));
""")
    return "\n".join(parts)


def build_enemy_block():
    H = chibi
    parts = []
    parts.append("""  /* Every monster is drawn chibi at 2x detail: an oversized round head with
     big eyes over a small body. Footprints in LOGICAL units are unchanged --
     the collision box, the spawn spacing and the elite/mini/colossal scaling
     all derive from them. Palette letters are unchanged too, so the elite,
     miniboss and colossal recolours keep working untouched. */
  const ENEMY_D = 2;
""")
    parts.append(rows_js("SLIME_0", H.SLIME_0))
    parts.append(rows_js("SLIME_1", H.SLIME_1,
                         "Squashed landing frame -- wider, flatter, highlight thrown left."))
    parts.append(rows_js("ZOMBIE_0", H.ZOMBIE_0))
    body = ",\n".join("    '%s'" % r for r in H.ZOMBIE_1_LEGS)
    parts.append("  const ZOMBIE_1 = ZOMBIE_0.slice(0, 22).concat([\n%s\n  ]);\n" % body)
    parts.append(rows_js("BAT_0", BAT_0, "Wings up."))
    parts.append(rows_js("BAT_1", BAT_1, "Wings down."))
    parts.append(rows_js("SKELETON_0", H.SKELETON_0))
    body = ",\n".join("    '%s'" % r for r in H.SKELETON_1_LEGS)
    parts.append("  // Drawing the bow: stance widened.\n"
                 "  const SKELETON_1 = SKELETON_0.slice(0, 22).concat([\n%s\n  ]);\n" % body)
    parts.append(rows_js("CROWN", H.CROWN))
    parts.append(rows_js("SLIME_HURT", H.SLIME_HURT,
                         "Hurt faces: eyes crossed out, mouth thrown open. Only the "
                         "face band differs, so the silhouette never shifts."))
    parts.append(rows_js("ZOMBIE_HURT", H.ZOMBIE_HURT))
    parts.append(rows_js("BAT_HURT", BAT_HURT))
    parts.append(rows_js("SKELETON_HURT", H.SKELETON_HURT))
    return "\n".join(parts)


def main():
    chibi.check("BAT_0", BAT_0, 20, 16)
    chibi.check("BAT_1", BAT_1, 20, 16)
    chibi.main()
    chibi.check_hurt()
    chibi.check("BAT_HURT", BAT_HURT, 20, 16)

    s = io.open(SPR, encoding="utf-8").read()

    a = s.index("  // ---- player (")
    b = s.index("  // ---- enemies ---")
    s = s[:a] + build_hero_block() + "\n" + s[b:]

    # Start the replaced region at the ENEMY_D header when it is already there,
    # otherwise a re-run appends a second `const ENEMY_D` above the old one.
    marker = "  /* Every monster is drawn chibi"
    a = s.index(marker) if marker in s else s.index("  const SLIME_0 = [")
    b = s.index("  // ---- world tiles")
    s = s[:a] + build_enemy_block() + "\n" + s[b:]

    # bake the enemy rows at 2x detail
    # Each pack gains a third frame: the hurt face.
    # Rewrite the whole assignment rather than matching one exact spelling of
    # it, so the generator stays idempotent across the 1x, 2-frame 2x and
    # 3-frame forms it has produced at different points.
    def bake(name, a, b, hurt):
        pad = " " * (len(name) + 8)
        new = ("  S.%s = [A.makeSprite(%s, null, ENEMY_D),\n"
               "%sA.makeSprite(%s, null, ENEMY_D),\n"
               "%sA.makeSprite(%s, null, ENEMY_D)];"
               % (name, a, pad, b, pad, hurt))
        return r"  S\.%s\s*= \[[^\]]*\];" % name, new

    pairs = [
        bake("slime", "SLIME_0", "SLIME_1", "SLIME_HURT"),
        bake("zombie", "ZOMBIE_0", "ZOMBIE_1", "ZOMBIE_HURT"),
        bake("bat", "BAT_0", "BAT_1", "BAT_HURT"),
        bake("skeleton", "SKELETON_0", "SKELETON_1", "SKELETON_HURT"),
        (r"  S\.crown = A\.makeSprite\(CROWN[^)]*\);",
         "  S.crown = A.makeSprite(CROWN, null, ENEMY_D);"),
    ]
    for pat, new in pairs:
        assert re.search(pat, s), "pattern not found: " + pat
        s = re.sub(pat, lambda m: new, s, count=1)

    # elite / mini / colossal reuse the same rows through a palette override
    s = re.sub(r"A\.makeSprite\((SLIME_[01]|ZOMBIE_[01]|BAT_[01]|SKELETON_[01]), (ELITE_PAL|MINI_PAL|COLOSSAL_PAL)\)",
               r"A.makeSprite(\1, \2, ENEMY_D)", s)

    io.open(SPR, "w", encoding="utf-8").write(s)
    print("sprites.js rewritten")


if __name__ == "__main__":
    main()
