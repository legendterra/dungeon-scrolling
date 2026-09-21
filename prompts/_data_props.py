# -*- coding: utf-8 -*-
from _gen import block, emit

items=[
{"id":"PRP-01 Torch sconce (body)","file":"prp_torch_body.png","size":"12x24",
 "prompt":block(12,24,"Wall-mounted iron torch sconce on a short pole bracket, wrapped rag head, soot mark on the wall plate, mounted low. Body only, NO flame. Palette #1c1a2b #514c72 #5c3f2a #8a6340.")},
{"id":"PRP-02 Torch flame","file":"prp_torch_flame.png","size":"48x12 — 4 frame @12x12",
 "prompt":block(48,12,"Small pixel flame loop, tapered teardrop shape, gentle flicker (not wild swinging), core #fff0a8, mid #f2c14e, outer #e8743b, no smoke, fully transparent around the flame.",n=4,fw=12,fh=12)},
]
TINTS=[("caves","#7de0be","teal"),("prison","#e8a05a","amber-orange"),("vault","#a89bff","violet"),("nest","#e8737f","blood pink"),("throne","#f2c14e","gold")]
for slug,col,name in TINTS:
    items.append({"id":"PRP-03 Flame tint — %s"%slug,"file":"prp_torch_flame_%s.png"%slug,"size":"48x12 — 4 frame @12x12",
      "prompt":block(48,12,"Small pixel flame loop, tapered teardrop shape, gentle flicker, %s coloured flame: bright white-tinted core, mid %s, darker outer edge of the same hue. No smoke, fully transparent around the flame. Identical shape and frames to the standard torch flame — only the hue differs."%(name,col),n=4,fw=12,fh=12)})
items += [
{"id":"PRP-04 Enchant table","file":"prp_enchant.png","size":"40x16 — 2 frame @20x16",
 "prompt":block(40,16,"Small arcane enchanting table with an open glowing tome and floating runes above it, violet glow rendered with dithering not blur. 2-frame loop: frame 1 runes low, frame 2 runes risen 4 pixels and brighter. Palette #3c2154 #7f45b8 #c86ee0 #f2c14e.",n=2,fw=20,fh=16)},
{"id":"PRP-05 Hanging chain","file":"prp_chain.png","size":"6x32",
 "prompt":block(6,32,"Vertical rusted iron chain, seamless vertically so it can be stacked, ending in a hook at the bottom. Palette #1c1a2b #514c72 #8a3b2a.")},
{"id":"PRP-06 Banner","file":"prp_banner.png","size":"24x24 — 2 frame @12x24",
 "prompt":block(24,24,"Tattered hanging cloth banner with a faded crest, frayed bottom edge, gentle two-frame sway (frame 2 shifted 2 pixels to the right at the bottom). Palette #6e1b28 #c0303c #8a7440 #f2c14e.",n=2,fw=12,fh=24)},
{"id":"PRP-07 Skull pile","file":"prp_skulls.png","size":"16x10",
 "prompt":block(16,10,"Small pile of bones and skulls resting on the floor, off-white #d8d5e8 with #9b96b8 shadow and #6f6a90 deep shadow.")},
{"id":"PRP-08 Brazier","file":"prp_brazier.png","size":"56x16 — 4 frame @14x16",
 "prompt":block(56,16,"Standing iron fire bowl on a tripod, 4-frame flame loop with small ember sparks rising, bowl identical in every frame. Palette #1c1a2b #514c72 #e8743b #f2c14e #fff0a8.",n=4,fw=14,fh=16)},
{"id":"PRP-09 Signpost","file":"prp_sign.png","size":"12x14",
 "prompt":block(12,14,"Wooden dungeon signpost with an arrow-shaped board pointing right, NO readable text, just a couple of illegible scratch marks. Palette #2e2018 #5c3f2a #8a6340 #b98d5c.")},
]
emit("06_PROPS.md","Batch 6 — Obor & Props Dinding (9 grup / 14 file)","Torch dipisah body + flame supaya flame bisa di-tint per biome.",items)

items2=[
{"id":"CHS-01 Chest wood","file":"chest_wood.png","size":"32x14 — 2 state @16x14",
 "prompt":block(32,14,"Wooden treasure chest in 2 states side by side: frame 1 closed with the lid down, frame 2 lid open showing a gold glow inside. Iron bands, gold lock. Palette #5c3f2a #8a6340 #b98d5c #f2c14e.",n=2,fw=16,fh=14)},
{"id":"CHS-02 Chest iron","file":"chest_iron.png","size":"32x14 — 2 state @16x14",
 "prompt":block(32,14,"Iron treasure chest in 2 states side by side: frame 1 closed, frame 2 lid open showing a blue glow inside. Riveted iron bands, blue #4fb3e0 lock. Palette #2a2740 #6f6a90 #9b96b8 #4fb3e0. Identical silhouette to the wooden chest.",n=2,fw=16,fh=14)},
{"id":"CHS-03 Chest cursed","file":"chest_cursed.png","size":"32x14 — 2 state @16x14",
 "prompt":block(32,14,"Cursed treasure chest in 2 states side by side: frame 1 closed and bound with purple chains, frame 2 lid open with the chains snapped and a dark violet aura escaping. Palette #3c2154 #7f45b8 #c86ee0. Identical silhouette to the wooden chest.",n=2,fw=16,fh=14)},
{"id":"CHS-04 Mimic reveal","file":"chest_mimic.png","size":"48x16 — 3 frame @16x16",
 "prompt":block(48,16,"Chest bursting open to reveal a monster, 3 frames: frame 1 lid cracking with red eyes appearing in the gap, frame 2 lid flung wide showing rows of jagged white teeth, frame 3 a long red tongue lashing out, aggressive. Palette #5c3f2a #8a6340 #d8d5e8 #c0303c #6e1b28.",n=3,fw=16,fh=16)},
{"id":"CHS-05 Shop stall","file":"shop_stall.png","size":"32x24",
 "prompt":block(32,24,"Small merchant stall with a striped awning and hanging wares (potions, a sword, a pouch), purple cloth. Palette #3c2154 #7f45b8 #c86ee0 #5c3f2a #f2c14e.")},
{"id":"NPC-01 Merchant","file":"npc_merchant.png","size":"32x16 — 2 frame @16x16",
 "prompt":block(32,16,"Hooded robed shopkeeper, purple robe #7f45b8 with gold #f2c14e trim, coin pouch at the belt, friendly welcoming posture, facing right. 2-frame idle: frame 2 raised 2 pixels with the robe hem shifting. Flat solid fill regions with no internal shading, exactly like the hero sprite.",n=2,fw=16,fh=16)},
{"id":"NPC-02 Blacksmith idle","file":"npc_smith_idle.png","size":"32x16 — 2 frame @16x16",
 "prompt":block(32,16,"Stocky bearded smith standing beside an anvil, leather apron, hammer resting on the anvil, facing right. 2-frame idle breathing. Palette #2e2018 #5c3f2a #8a6340 #6f6a90 #f0c79c. Flat solid fill regions with no internal shading.",n=2,fw=16,fh=16)},
{"id":"NPC-02b Blacksmith hammer","file":"npc_smith_hammer.png","size":"32x16 — 2 frame @16x16",
 "prompt":block(32,16,"Stocky bearded smith striking an anvil, 2 frames: frame 1 hammer raised overhead, frame 2 hammer struck down on the anvil with 6 orange spark pixels. Same character, apron and anvil as the idle sheet, identical pivot and baseline.",n=2,fw=16,fh=16)},
]
emit("07_CHEST_NPC.md","Batch 7 — Chest, Interaksi & NPC (8 file)","",items2)
