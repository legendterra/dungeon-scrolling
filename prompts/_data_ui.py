# -*- coding: utf-8 -*-
from _gen import block, emit

items=[
{"id":"UI-01 Key cap","file":"ui_keycap.png","size":"28x14 — 2 state @14x14",
 "prompt":block(28,14,"Minimal pixel keyboard keycap with an EMPTY blank face (no letter — the engine draws the letter), 2px light top-left bevel and 2px dark bottom-right bevel. 2 states side by side: frame 1 idle, frame 2 pressed (face shifted 2 pixels down, overall darker, bevel inverted). Palette #1c1a2b #514c72 #9b96b8.",n=2,fw=14,fh=14)},
{"id":"UI-02 Key cap wide","file":"ui_keycap_wide.png","size":"56x14 — 2 state @28x14",
 "prompt":block(56,14,"Wide pixel keyboard keycap for SHIFT / SPACE with an EMPTY blank face, 2px light top-left bevel and 2px dark bottom-right bevel. 2 states side by side: idle, and pressed (shifted 2 pixels down, darker). Palette #1c1a2b #514c72 #9b96b8. Same visual language and bevel thickness as the 14x14 keycap.",n=2,fw=28,fh=14)},
{"id":"UI-03 Health bar frame","file":"ui_hpframe.png","size":"64x8",
 "prompt":block(64,8,"Empty pixel HP bar FRAME only (no fill — the engine draws the red fill inside), horizontal, notched into segments by 2px vertical dividers, iron and bone styling with small end caps. Interior must be transparent. Palette #1c1a2b #6f6a90 #d8d5e8.")},
{"id":"UI-04 Mana bar frame","file":"ui_mpframe.png","size":"64x6",
 "prompt":block(64,6,"Empty pixel mana bar FRAME only (no fill), horizontal, notched segments, thinner than the HP bar, blue-tinted iron styling with end caps. Interior transparent. Palette #1c1a2b #2f6fa8 #a8e4ff.")},
{"id":"UI-05 Skill slot frame","file":"ui_skillslot.png","size":"20x20",
 "prompt":block(20,20,"Empty square skill slot frame, 4px border with a beveled inner shadow and a rivet in each corner, hollow transparent centre so an icon and a cooldown sweep can be drawn inside. Palette #1c1a2b #2a2740 #6f6a90 #9b96b8.")},
{"id":"UI-06 Weapon display panel","file":"ui_weaponpanel.png","size":"48x32",
 "prompt":block(48,32,"Small pixel plaque frame for a bottom-left weapon display, thin ornate border with corner flourishes, hollow transparent centre. Palette #1c1a2b #2a2740 #8a7440 #f2c14e.")},
]
BOONS=[("bloodthirst","#c0303c","a fanged mouth over a blood drop"),
("ironhide","#9b96b8","a riveted iron shield"),
("featherweight","#a8e4ff","a single feather"),
("sharpshooter","#5cbf62","an arrow hitting a bullseye"),
("overflow","#4fb3e0","a flask overflowing with liquid"),
("conduit","#f2c14e","a lightning bolt between two nodes"),
("golden touch","#f2c14e","an open hand with a coin above it"),
("berserker","#e8743b","two crossed axes with rage marks"),
("momentum","#a3e86b","three forward speed lines with an arrow"),
("blood harvest","#6e1b28","a sickle over a blood drop"),
("fleetfoot","#a3e86b","a winged boot"),
("ricochet","#4fb3e0","an arrow bouncing off an angled wall"),
("vigil","#fff0a8","an open watchful eye"),
("ruin","#7f45b8","a cracked skull")]
for n,c,sym in BOONS:
    items.append({"id":"UI-07 Boon icon — %s"%n,"file":"ui_boon_%s.png"%n.replace(" ","_"),"size":"16x16",
      "prompt":block(16,16,"Single-symbol pixel UI icon: %s. Monochrome light grey #9b96b8 with dark #1c1a2b outline, plus ONE accent color %s used sparingly on the key detail. Bold simple silhouette, must stay readable at 32px. Centered, transparent background, no frame or border."%(sym,c))})
ELEM=[("fire","#e8743b","a flame"),("ice","#4fb3e0","a snowflake"),("lightning","#f2c14e","a lightning bolt"),
("poison","#5cbf62","a bubbling droplet with a skull hint"),("water","#2f6fa8","a water droplet with a ripple"),
("earth","#b98d5c","a jagged rock"),("leaf","#a3e86b","a leaf"),("dark","#7f45b8","a crescent void")]
for n,c,sym in ELEM:
    items.append({"id":"UI-08 Element affix icon — %s"%n,"file":"ui_elem_%s.png"%n,"size":"12x12",
      "prompt":block(12,12,"Tiny single-symbol pixel UI icon: %s, in %s with a dark #1c1a2b outline and one lighter highlight of the same hue. Extremely simple silhouette, readable at 24px. Centered, transparent background."%(sym,c))})
RAR=[("common","#9b96b8"),("uncommon","#5cbf62"),("rare","#4fb3e0"),("epic","#c86ee0"),("legendary","#f2c14e")]
for n,c in RAR:
    items.append({"id":"UI-09 Rarity gem — %s"%n,"file":"ui_gem_%s.png"%n,"size":"6x6",
      "prompt":block(6,6,"Tiny faceted gem for an item list row, diamond shape, main color %s with a darker shadow of the same hue and a 2x2 white #ffffff highlight block. Transparent background."%c)})
items += [
{"id":"UI-10 Cursor","file":"ui_cursor.png","size":"16x8 — 2 varian @8x8",
 "prompt":block(16,8,"Two pixel cursors side by side: frame 1 a classic arrow pointer, frame 2 a pointing hand. Both white #ffffff fill with a hard #0d0b14 outline, hotspot at the top-left 2x2 pixel block. Transparent background.",n=2,fw=8,fh=8)},
{"id":"UI-11 Minimap tiles","file":"ui_minimap.png","size":"20x4 — 5 varian @4x4",
 "prompt":block(20,4,"Five 8x8 pixel minimap markers in a row: frame 1 room (filled square #6f6a90), frame 2 corridor (thin horizontal bar #514c72), frame 3 boss (square with a red #c0303c 2x2 centre block), frame 4 shop (square with a gold #f2c14e 2x2 centre block), frame 5 current position (bright white #ffffff square).",n=5,fw=4,fh=4)},
{"id":"UI-12 Title logo","file":"ui_logo.png","size":"240x64",
 "prompt":block(240,64,"Pixel wordmark logo reading exactly \"DUNGEON SCROLLING\" on two lines, carved stone letters with a gold #f2c14e edge light on the top edges, cracks and chips in the stone, dungeon fantasy. Letters must be clean and fully legible, correct spelling, no extra words. Palette #1c1a2b #2a2740 #6f6a90 #9b96b8 #8a7440 #f2c14e #fff0a8. Transparent background.")},
{"id":"UI-13 Depth banner","file":"ui_banner.png","size":"128x16",
 "prompt":block(128,16,"Ornate pixel plaque for a floor-name banner, wide and short, thin gold-trimmed stone frame with small end flourishes, hollow transparent centre so text can be drawn inside. Palette #1c1a2b #2a2740 #8a7440 #f2c14e.")},
]
emit("13_UI.md","Batch 13 — UI (~50 file)","Gaya UI: pixelated, minimalis, sesuai arah desain yang sekarang.",items)
