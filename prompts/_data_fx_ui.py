# -*- coding: utf-8 -*-
from _gen import block, emit

EL=[("fire","#e8743b","orange fire"),("ice","#4fb3e0","pale cyan ice"),("lightning","#f2c14e","yellow lightning"),
("poison","#5cbf62","green poison"),("water","#2f6fa8","deep blue water"),("earth","#b98d5c","tan earth"),
("leaf","#a3e86b","bright leaf green"),("dark","#7f45b8","violet dark")]

items=[]
for e,c,name in EL:
    items.append({"id":"FX-01 Orb — %s"%e,"file":"fx_orb_%s.png"%e,"size":"32x8 — 4 frame @8x8",
      "prompt":block(32,8,"Glowing magic orb projectile flying right, bright white #ffffff core with a %s corona (%s) and tiny trailing sparks. 4-frame loop: the corona pulses and the sparks rotate; the core never moves."%(name,c),n=4,fw=8,fh=8)})
for e,c,name in EL:
    items.append({"id":"FX-02 Impact burst — %s"%e,"file":"fx_burst_%s.png"%e,"size":"64x16 — 4 frame @16x16",
      "prompt":block(64,16,"Radial impact burst, 4 frames: frame 1 small bright flash, frame 2 expanding ring of shards and sparks, frame 3 wider and thinner, frame 4 sparse fading motes. %s (%s) with a white #ffffff hot centre in the first two frames."%(name,c),n=4,fw=16,fh=16)})
items += [
{"id":"FX-03 Fire pool","file":"fx_firepool.png","size":"96x10 — 4 frame @24x10",
 "prompt":block(96,10,"Ground fire patch loop, 4 frames of low licking flames along a flat ground line, flames never exceed the frame height. Palette #8a3b2a #e8743b #f2c14e #fff0a8.",n=4,fw=24,fh=10)},
{"id":"FX-04 Poison cloud","file":"fx_poisoncloud.png","size":"128x20 — 4 frame @32x20",
 "prompt":block(128,20,"Drifting green gas cloud, 4-frame loop, soft dithered checkerboard edge for the fade (no blur), the mass slowly churning. Palette #1b4436 #2f7d4f #5cbf62 #a3e86b.",n=4,fw=32,fh=20)},
{"id":"FX-05 Water puddle","file":"fx_puddle.png","size":"48x6 — 2 frame @24x6",
 "prompt":block(48,6,"Shallow water pool on the ground, 2-frame ripple loop, flat elliptical shape with a highlight line. Palette #16324f #2f6fa8 #4fb3e0 #a8e4ff.",n=2,fw=24,fh=6)},
{"id":"FX-06 Ice patch","file":"fx_icepatch.png","size":"48x6 — 2 frame @24x6",
 "prompt":block(48,6,"Frozen slick floor patch with frost crystals along the edges, 2-frame subtle shimmer loop. Palette #16324f #4fb3e0 #a8e4ff #ffffff.",n=2,fw=24,fh=6)},
{"id":"FX-07 Steam cloud","file":"fx_steam.png","size":"128x20 — 4 frame @32x20",
 "prompt":block(128,20,"White-grey steam plume rising, 4-frame loop, dense enough to be blinding, dithered edges. Palette #6f6a90 #9b96b8 #d8d5e8 #ffffff.",n=4,fw=32,fh=20)},
{"id":"FX-08 Lightning bolt","file":"fx_lightning.png","size":"24x48 — 3 frame @8x48",
 "prompt":block(24,48,"Vertical jagged lightning strike from the top edge to the bottom, 3 frames: frame 1 thin forking leader, frame 2 thick bright main bolt with a white core, frame 3 fading afterglow. Palette #fff0a8 #f2c14e #ffffff.",n=3,fw=8,fh=48)},
{"id":"FX-09 Explosion","file":"fx_explosion.png","size":"192x32 — 6 frame @32x32",
 "prompt":block(192,32,"Bomber death explosion, 6 frames: white flash, expanding fireball, peak fireball with debris, collapsing, smoke ball, sparse dissipating smoke. Palette #fff0a8 #f2c14e #e8743b #8a3b2a #514c72 #9b96b8.",n=6,fw=32,fh=32)},
]
emit("10_FX.md","Batch 10 — Proyektil, Orb & Elemen (~30 file)",
"Elemen: fire #e8743b / ice #4fb3e0 / lightning #f2c14e / poison #5cbf62 / water #2f6fa8 / earth #b98d5c / leaf #a3e86b / dark #7f45b8.",items)

pk=[
{"id":"PCK-01 Coin","file":"pck_coin.png","size":"24x6 — 4 frame @6x6",
 "prompt":block(24,6,"Spinning gold coin, 4 rotation frames: full face, three-quarter, thin edge-on, three-quarter reversed. Palette #8a7440 #f2c14e #fff0a8.",n=4,fw=6,fh=6)},
{"id":"PCK-02 Heart","file":"pck_heart.png","size":"16x8 — 2 frame @8x8",
 "prompt":block(16,8,"Red pixel heart with a white glint in the upper left, 2-frame gentle pulse (frame 2 one pixel wider and brighter). Palette #6e1b28 #c0303c #ffffff.",n=2,fw=8,fh=8)},
{"id":"PCK-03 Shard","file":"pck_shard.png","size":"32x8 — 4 frame @8x8",
 "prompt":block(32,8,"Cyan crystal shard, faceted, 4-frame shimmer loop where a highlight travels across the facets. Palette #16324f #4fb3e0 #a8e4ff #ffffff.",n=4,fw=8,fh=8)},
{"id":"PCK-04 Key","file":"pck_key.png","size":"16x8 — 2 frame @8x8",
 "prompt":block(16,8,"Ornate golden dungeon key with a skull-shaped bow, 2-frame bob (frame 2 shifted 2 pixels up). Palette #8a7440 #f2c14e #fff0a8.",n=2,fw=8,fh=8)},
{"id":"PCK-05 Mana potion","file":"pck_mana.png","size":"16x10 — 2 frame @8x10",
 "prompt":block(16,10,"Blue potion flask with a cork stopper and a bubbling liquid, 2-frame loop where the bubbles rise. Palette #16324f #2f6fa8 #4fb3e0 #a8e4ff #5c3f2a.",n=2,fw=8,fh=10)},
{"id":"PCK-06 Health potion","file":"pck_health.png","size":"16x10 — 2 frame @8x10",
 "prompt":block(16,10,"Red potion flask with a cork stopper and a bubbling liquid, 2-frame loop where the bubbles rise. Same flask silhouette as the mana potion. Palette #6e1b28 #c0303c #8a4550 #ffffff #5c3f2a.",n=2,fw=8,fh=10)},
{"id":"PCK-07 Drop glow","file":"pck_dropglow.png","size":"64x16 — 4 frame @16x16",
 "prompt":block(64,16,"Soft rising light beam with sparkles, marking a dropped item on the ground, 4-frame loop, dithered vertical beam widening at the base, sparkles drifting upward. Draw it in WHITE #ffffff and light grey only — the engine tints it per rarity. Transparent background.",n=4,fw=16,fh=16)},
]
emit("11_PICKUP.md","Batch 11 — Pickup & Item Dunia (7 file)","",pk)

par=[
{"id":"PAR-01 Dust puff","file":"par_dust.png","size":"32x8 — 4 frame @8x8",
 "prompt":block(32,8,"Small landing dust puff, 4 frames: tight cluster, expanding ring, wide and thin, nearly gone. Palette #6f6a90 #9b96b8 #d8d5e8.",n=4,fw=8,fh=8)},
{"id":"PAR-02 Blood splatter","file":"par_blood.png","size":"48x12 — 4 frame @12x12",
 "prompt":block(48,12,"Gore burst, 4 frames of chunky angular pixels flying outward and falling, no soft edges. Draw in WHITE #ffffff and grey only — the engine tints it per enemy color.",n=4,fw=12,fh=12)},
{"id":"PAR-03 Ambient mote","file":"par_mote.png","size":"9x3 — 3 frame @3x3",
 "prompt":block(9,3,"Single floating dust mote, 3 frames: bright, mid, dim. Draw in WHITE #ffffff only — the engine tints it per biome.",n=3,fw=3,fh=3)},
{"id":"PAR-04 Spark","file":"par_spark.png","size":"9x3 — 3 frame @3x3",
 "prompt":block(9,3,"Bright hit spark, 3 frames: 4-point star flash, small cross, 2x2 pixel dot. Palette #ffffff #fff0a8 #f2c14e.",n=3,fw=3,fh=3)},
{"id":"PAR-05 Ground crack decal","file":"par_crack.png","size":"16x6",
 "prompt":block(16,6,"Cracked stone impact decal lying flat on the ground, radiating fracture lines from the centre. Palette #1c1a2b #2a2740 #514c72.")},
{"id":"PAR-06 Shockwave ring","file":"par_shockwave.png","size":"128x8 — 4 frame @32x8",
 "prompt":block(128,8,"Expanding ground shockwave ring for the boss slam, seen in side-scroller perspective as a flattened ellipse, 4 frames from narrow and bright to wide and faint, with dust pixels kicked up along the leading edges. Palette #ffffff #d8d5e8 #9b96b8.",n=4,fw=32,fh=8)},
{"id":"PAR-07 Level-up burst","file":"par_levelup.png","size":"144x24 — 6 frame @24x24",
 "prompt":block(144,24,"Golden radial burst with rising sparkles, 6 frames: bright core flash, expanding ray star, full burst, rays retracting while sparkles rise, sparkles only, faint remnants. Palette #fff0a8 #f2c14e #8a7440 #ffffff.",n=6,fw=24,fh=24)},
]
emit("12_PARTICLES.md","Batch 12 — Partikel & Decal (7 file)","Beberapa partikel digambar PUTIH saja karena di-tint runtime (blood per-enemy, mote per-biome, drop glow per-rarity).",par)
