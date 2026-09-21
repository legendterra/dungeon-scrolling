# -*- coding: utf-8 -*-
from _gen import block, emit, PREFIX

KING = """Pixel art sprite sheet, strict 1:2 pixels grid, no anti-aliasing, no blur,
no gradients, hard-edged pixels only, transparent PNG, crisp #0d0b14 outline.
Output EXACTLY 768x96 pixels: 6 frames in one row, each frame EXACTLY 128x96 px,
identical pivot and baseline across frames, no gap between frames.
Subject: a royal purple slime king, squat dome body, glossy bubbles on the left
side, angry red eyes, gold 3-point crown on top.
Frames in order: idle, idle-squash, rear-up-with-open-maw, slam-flattened,
hurt-recoil, death-collapsed-puddle-with-crown-sliding-off.
Palette ONLY: #0d0b14 #3c2154 #7f45b8 #c86ee0 #ffffff #f2c14e #fff0a8 #c0303c
Design for a 640x360 game screen at tile size 32x32: the silhouette must read
clearly at 100% zoom. Use the extra resolution for expressive detail: readable
angry eyes, glossy bubble highlights, and a crisp crown silhouette."""

boss=[
 {"id":"BOSS-01 Slime King (PROMPT KANONIK — jangan diubah)","file":"boss_slime_king_sheet.png","size":"768x96 — 6 frame @128x96","prompt":KING},
 {"id":"BOSS-02 Crown","file":"boss_crown.png","size":"12x6","prompt":block(12,6,"Small golden spiked crown with a red gem, three points, sits on top of the boss head. Palette #8a7440 #f2c14e #fff0a8 #c0303c.")},
 {"id":"BOSS-03 Telegraph ring","file":"boss_telegraph.png","size":"48x16 — 3 frame @16x16","prompt":block(48,16,"Circular ground warning decal seen in side-scroller perspective as a flattened ellipse, three expanding frames from small to full width, amber #f2c14e outline with a darker #8a7440 inner ring, hollow centre.",n=3,fw=16,fh=16)},
]
emit("04_BOSS.md","Batch 4 — Boss (3 file)","PERHATIAN: Slime King lama (64x48) sudah tidak dipakai — resolusi game naik ke 640x360 / tile 32, jadi sheet ini WAJIB di-regenerate di 128x96 per frame dan `src/art/king.js` harus di-update.",boss)

T=[
("TIL-01","tile_wall",16,16,"Seamless dungeon stone brick wall tile, chiseled mortar lines, subtle chips and pits, palette #2a2740 #514c72 #6f6a90.","tile"),
("TIL-02","tile_floor_top",16,16,"Seamless dungeon floor surface tile, flat top edge with a moss and rubble lip along the top four pixel rows, cracked stone below, palette #2a2740 #514c72 #6f6a90 with #2f7d4f moss.","tile"),
("TIL-03","tile_platform",16,8,"Thin one-way stone ledge, visible bright top lip, hollow dark underside, seamless horizontally, palette #2a2740 #6f6a90 #9b96b8.",None),
("TIL-04","tile_spike",16,16,"Row of iron floor spikes occupying only the lower half of the tile, rusty tips, transparent upper half, seamless horizontally, palette #2a2740 #6f6a90 #8a3b2a.",None),
("TIL-05","tile_deathspike",16,16,"Bottom-of-pit impaling spike bed, long jagged blood-stained iron spikes filling the whole tile, seamless horizontally, unmistakably lethal, palette #1c1a2b #6f6a90 #6e1b28 #c0303c.",None),
("TIL-06","tile_door_arch",16,32,"Carved stone archway portal with a keystone at the top, dark void opening, palette #2a2740 #514c72 #6f6a90 #0d0b14.",None),
("TIL-07","tile_door_cave",16,32,"Rough natural cave mouth, uneven rocky rim, stalactite teeth along the top, dark void opening, palette #1c1a2b #2a2740 #514c72.",None),
("TIL-08","tile_door_gate",16,32,"Iron portcullis frame with vertical bars raised into the top, rivets and rust, dark opening below, palette #2a2740 #6f6a90 #8a3b2a.",None),
("TIL-13","tile_crate",16,16,"Pushable wooden crate, plank grain, iron corner brackets, palette #2e2018 #5c3f2a #8a6340 #b98d5c.",None),
]
items=[{"id":i,"file":f+".png","size":"%dx%d"%(w,h),"prompt":block(w,h,s,kind=k)} for i,f,w,h,s,k in T]
items += [
 {"id":"TIL-09 Crumble platform","file":"tile_crumble.png","size":"48x8 — 3 frame @16x8",
  "prompt":block(48,8,"Cracking stone ledge in 3 states: frame 1 intact ledge, frame 2 cracked with visible fracture lines, frame 3 shattering into falling chunks and dust. Palette #2a2740 #6f6a90 #9b96b8.",n=3,fw=16,fh=8)},
 {"id":"TIL-10 Puzzle gate","file":"tile_gate.png","size":"32x32 — 2 state @16x32",
  "prompt":block(32,32,"Iron barrier gate in 2 states side by side: frame 1 bars lowered to the floor (closed), frame 2 bars retracted up into the top housing (open). Rivets and rust, palette #2a2740 #6f6a90 #8a3b2a.",n=2,fw=16,fh=32)},
 {"id":"TIL-11 Pressure plate","file":"tile_plate.png","size":"32x6 — 2 state @16x6",
  "prompt":block(32,6,"Stone floor pressure plate in 2 states: frame 1 raised and unlit, frame 2 depressed 2 pixels with an amber #f2c14e glow along the seam. Palette #2a2740 #6f6a90 #9b96b8 #f2c14e.",n=2,fw=16,fh=6)},
 {"id":"TIL-12 Lever","file":"tile_lever.png","size":"20x14 — 2 state @10x14",
  "prompt":block(20,14,"Wall-mounted lever in 2 states: frame 1 handle up and unlit (off), frame 2 handle down with an amber #f2c14e glow at the pivot (on). Iron bracket, wooden handle, palette #2a2740 #6f6a90 #5c3f2a #f2c14e.",n=2,fw=10,fh=14)},
]
emit("05_TILES.md","Batch 5 — Tile Dungeon (13 file)",
"Tile sekarang 32x32 (bukan 16x16). Kode me-recolor satu set master per biome, jadi gambar SET MASTER netral saja. Opsional: varian khusus `wall` + `door` per biome (6x2 = 12 file tambahan) supaya tiap lantai terasa beda.",items)
