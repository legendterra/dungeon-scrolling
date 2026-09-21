# -*- coding: utf-8 -*-
from _gen import block, emit

MAT=[("cloth","#9b96b8 #514c72 #d8d5e8","a soft draped cloth hood"),
("leaf","#5cbf62 #1b4436 #a3e86b","a woven leaf circlet with sprigs"),
("leather","#8a6340 #2e2018 #b98d5c","a stitched leather cap"),
("bone","#d8d5e8 #6f6a90 #ffffff","a horned skull-helm"),
("iron","#6f6a90 #2a2740 #9b96b8","a slitted iron great-helm"),
("gold","#f2c14e #8a7440 #fff0a8","a crowned gold helm"),
("crystal","#4fb3e0 #16324f #a8e4ff","a shard tiara"),
("obsidian","#7f45b8 #1c1a2b #c86ee0","a spiked obsidian helm")]
CHEST={"cloth":"a hooded robe with loose sleeves","leaf":"a leaf-scale mantle with vine shoulder wraps","leather":"a studded leather jerkin with a shoulder strap","bone":"a ribcage cuirass with bone pauldrons","iron":"a riveted iron breastplate with rounded pauldrons","gold":"an ornate gilded cuirass with winged pauldrons","crystal":"a faceted crystal breastplate with shard shoulders","obsidian":"a jagged obsidian breastplate with spiked pauldrons"}
LEGS={"cloth":"loose cloth wraps and soft shoes","leaf":"leaf-wrapped shins and bare-look sandals","leather":"leather greaves and buckled boots","bone":"bone-plated shins and clawed boots","iron":"plate greaves and heavy sabatons","gold":"gilded greaves with filigree and gold boots","crystal":"crystalline greaves and faceted boots","obsidian":"spiked obsidian greaves and heavy boots"}

items=[]
n=1
for mat,cols,helm in MAT:
    items.append({"id":"ARM-%02d Helm — %s"%(n,mat),"file":"arm_helm_%s.png"%mat,"size":"10x6",
      "prompt":block(10,6,"Helmet overlay that sits over the hero head: %s. Colors mid/dark/light = %s. Distinct readable silhouette at 20 pixels wide. Fully transparent everywhere except the helm itself — this is an OVERLAY drawn on top of a 32x32 hero sprite, aligned to head rows 4-14. Do NOT draw the head, face or body."%(helm,cols))});n+=1
for mat,cols,_ in MAT:
    items.append({"id":"ARM-%02d Chest — %s"%(n,mat),"file":"arm_chest_%s.png"%mat,"size":"12x8",
      "prompt":block(12,8,"Torso armor overlay: pauldrons plus chestplate, %s. Colors mid/dark/light = %s. Fully transparent everywhere except the armor — this is an OVERLAY drawn on top of a 32x32 hero sprite, aligned to torso rows 12-26. Do NOT draw the head, arms or legs."%(CHEST[mat],cols))});n+=1
for mat,cols,_ in MAT:
    items.append({"id":"ARM-%02d Legs — %s"%(n,mat),"file":"arm_legs_%s.png"%mat,"size":"10x6",
      "prompt":block(10,6,"Greaves and boots overlay: %s. Colors mid/dark/light = %s. Fully transparent everywhere except the armor — this is an OVERLAY drawn on top of a 32x32 hero sprite, aligned to leg rows 24-32. Do NOT draw the torso or head."%(LEGS[mat],cols))});n+=1
items.append({"id":"ARM-25 Inventory icons (24 file)","file":"icon_{slot}_{material}.png","size":"16x16 masing-masing",
 "prompt":block(16,16,"Inventory item icon for a piece of dungeon armor: {SLOT: helm / chestplate / greaves} made of {MATERIAL: cloth / leaf / leather / bone / iron / gold / crystal / obsidian}. Single object centered on transparent background, three-quarter presentation, readable at 32px. Use the material colors mid/dark/light exactly as listed in the armor palette.")+"\n\nUlangi 24x: 3 slot x 8 material. Ganti {SLOT} dan {MATERIAL} tiap kali."})

emit("08_ARMOR.md","Batch 8 — Armor Paper Doll (24 overlay + 24 ikon)",
"""Overlay = potongan armor SAJA, sisanya transparan. Digambar di atas hero 16x16, bukan menggantikan hero.
Warna material (mid / dark / light):

```
cloth    #9b96b8 #514c72 #d8d5e8      bone     #d8d5e8 #6f6a90 #ffffff
leaf     #5cbf62 #1b4436 #a3e86b      iron     #6f6a90 #2a2740 #9b96b8
leather  #8a6340 #2e2018 #b98d5c      gold     #f2c14e #8a7440 #fff0a8
crystal  #4fb3e0 #16324f #a8e4ff      obsidian #7f45b8 #1c1a2b #c86ee0
```""",items)

W=[("WPN-01","sword","Straight knightly longsword held at a 45 degree diagonal pointing up-right, crossguard, wrapped grip, small pommel gem."),
("WPN-02","dagger","Short curved dagger at a 45 degree diagonal, small quillons, leather-wrapped grip."),
("WPN-03","greataxe","Massive double-headed battle axe at a 45 degree diagonal, thick wooden haft, iron bands."),
("WPN-04","bow","Recurve wooden bow standing vertical with a taut string, leather grip wrap, notched tips."),
("WPN-05","staff","Gnarled wizard staff standing vertical, topped with a glowing orb, twisted wood grain."),
("WPN-06","spear","Long spear at a 45 degree diagonal, leaf-shaped steel head, a small ribbon tied below the head.")]
w2=[{"id":i,"file":"wpn_%s.png"%s,"size":"16x16",
 "prompt":block(16,16,"%s COMMON rarity version: neutral steel and wood, blade/metal in #9b96b8 with #6f6a90 shadow and #d8d5e8 highlight, wood/leather in #5c3f2a #8a6340. No glow, no magic effects."%d)} for i,s,d in W]
w2 += [
{"id":"WPN-07 Slash arc FX","file":"fx_slash.png","size":"72x16 — 3 frame @24x16",
 "prompt":block(72,16,"Crescent slash trail sweeping from upper right to lower right, 3 frames: frame 1 thin short arc, frame 2 full wide crescent at peak brightness, frame 3 fading broken tail. Bright thin white #ffffff core fading through #d8d5e8 to a transparent tail. No weapon in the frame, effect only.",n=3,fw=24,fh=16)},
{"id":"WPN-08 Arrow","file":"wpn_arrow.png","size":"8x3",
 "prompt":block(8,3,"Small arrow flying to the right: iron tip #9b96b8, wooden shaft #8a6340, four fletching pixels #d8d5e8 at the tail.")},
{"id":"WPN-09 Thrust FX","file":"fx_thrust.png","size":"60x8 — 3 frame @20x8",
 "prompt":block(60,8,"Straight forward stab streak pointing right, 3 frames: frame 1 short bright spike, frame 2 full-length streak with a bright #ffffff core, frame 3 dissipating. Effect only, no weapon.",n=3,fw=20,fh=8)},
]
emit("09_WEAPONS.md","Batch 9 — Senjata & Melee FX (9 file)",
"Cukup gambar versi COMMON. Rarity lain (uncommon #5cbf62 / rare #4fb3e0 / epic #c86ee0 / legendary #f2c14e + #e8743b) hasil recolor + glow oleh kode.",w2)
