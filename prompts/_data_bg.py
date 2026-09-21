# -*- coding: utf-8 -*-
from _gen import block, emit

BIOMES = [
 ("BG-01","halls","Depth 1 — STONE HALLS",
  "Deep indigo to near-black vertical gradient using pixel dithering only (#211b38 top to #12101c bottom), distant cathedral vault ceiling barely visible, faint dust motes, extremely low contrast, must read as far background behind gameplay.",
  "Row of tall gothic stone arches and pillars receding into darkness, carved masonry, a few hanging chains and tattered banners, colors only #2a2740 #514c72 #6f6a90, flattened and 40% darker than foreground.",
  "Foreground stone pillar silhouettes and broken column stumps in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, rubble along the bottom edge."),
 ("BG-02","caves","Depth 2 — DAMP CAVES",
  "Wet limestone cavern seen far away, dripping stalactites, shallow water pools reflecting teal light, moss patches, palette #183430 #33524c #4a7068 #79b39d #aee0cd, glistening highlights, extremely low contrast so gameplay reads on top.",
  "Mid-distance cavern walls with dripping stalactites, moss shelves and shallow reflective water pools, palette #183430 #33524c #4a7068 #79b39d, flattened and 40% darker than foreground.",
  "Foreground stalactite and boulder silhouettes in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, wet rock rubble along the bottom edge."),
 ("BG-03","prison","Depth 3 — RUSTED PRISON",
  "Distant prison block interior, rusted iron cell bars, corroded chains, brick walls with peeling mortar, palette #3a2a1c #4a3a2b #6b5641 #b8834f #e0b57e, oppressive, extremely low contrast.",
  "Row of rusted iron cell doors and barred windows, hanging manacles and corroded chains, brick walls with peeling mortar, palette #3a2a1c #4a3a2b #6b5641 #b8834f, flattened and 40% darker than foreground.",
  "Foreground rusted bar and pillar silhouettes in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, broken bricks along the bottom edge."),
 ("BG-04","vault","Depth 4 — CRYSTAL VAULT",
  "Distant vault interior with amethyst crystal formations growing from walls, glowing violet geodes, palette #130e2e #3c3563 #584d85 #9b8ae0 #cfc4ff, violet glow done with dithering not blur, extremely low contrast.",
  "Polished arcane masonry with carved runes and amethyst crystal clusters growing from the walls, glowing violet geodes, palette #130e2e #3c3563 #584d85 #9b8ae0, glow by dithering only, flattened and 40% darker than foreground.",
  "Foreground giant crystal shard silhouettes in near-black #1c1a2b with faint violet rim pixels, only left and right thirds occupied, wide empty transparent center for gameplay."),
 ("BG-05","nest","Depth 5 — THE NEST",
  "Distant organic flesh-and-chitin cavern, egg sacs, sinew webbing, bone ribs embedded in walls, palette #1b090b #4d2c31 #6e4148 #b8636f #e0949c, unsettling biological texture, extremely low contrast.",
  "Mid-distance flesh walls with hanging egg sacs, sinew webbing strands and embedded bone ribs, palette #1b090b #4d2c31 #6e4148 #b8636f, flattened and 40% darker than foreground.",
  "Foreground bone rib and sinew strand silhouettes in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, membrane sludge along the bottom edge."),
 ("BG-06","throne","Depth 6-10 — THRONE OF SLIME",
  "Distant ruined golden throne hall half-swallowed by green slime, gilded columns dripping ooze, palette #171106 #4a3f28 #6b5c3c #b89a55 #f0d78e with #5cbf62 slime accents, grand and decayed, extremely low contrast.",
  "Row of gilded columns dripping green ooze, cracked royal banners, ruined gold masonry, palette #171106 #4a3f28 #6b5c3c #b89a55 with #5cbf62 slime accents, flattened and 40% darker than foreground.",
  "Foreground gilded column silhouettes with slime drips in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, ooze pools along the bottom edge."),
]

items=[]
for bid,slug,label,sky,mid,near in BIOMES:
    items.append({"id":bid+"a","file":"bg_%s_sky.png"%slug,"size":"640x360 opaque — %s"%label,
        "prompt":block(320,180,sky,kind="bg")})
    items.append({"id":bid+"b","file":"bg_%s_mid.png"%slug,"size":"1280x360 transparan atas/bawah — %s"%label,
        "prompt":block(640,180,mid,extra="Horizontally seamless loop, transparent above and below, no opaque backdrop.")})
    items.append({"id":bid+"c","file":"bg_%s_near.png"%slug,"size":"1280x360 transparan — %s"%label,
        "prompt":block(640,180,near,extra="Horizontally seamless loop, transparent PNG, silhouette only.")})

emit("01_BACKGROUND.md","Batch 1 — Background Parallax (18 file)",
"3 layer per biome: SKY (640x360, opaque, statis) / MID (1280x360, loop, transparan atas-bawah) / NEAR (1280x360, loop, siluet gelap, tengah kosong buat gameplay).",
items)
