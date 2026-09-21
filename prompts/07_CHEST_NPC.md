# Batch 7 — Chest, Interaksi & NPC (8 file)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

**PALET RESMI GAME — jangan bikin warna baru:**

```
Ink/outline  #0d0b14  #1c1a2b
Stone        #2a2740  #514c72  #6f6a90  #9b96b8  #d8d5e8
Gold         #8a7440  #f2c14e  #fff0a8
Ember        #8a3b2a  #e8743b
Blood        #6e1b28  #c0303c  #8a4550
Green        #1b4436  #2f7d4f  #5cbf62  #a3e86b
Blue         #16324f  #2f6fa8  #4fb3e0  #a8e4ff
Purple       #1e0f2a  #3c2154  #7f45b8  #c86ee0  #a89bff
Wood/leather #2e2018  #5c3f2a  #8a6340  #b98d5c
Skin         #f0c79c
```

---

## CHS-01 Chest wood — `chest_wood.png` (64x28 — 2 frame @32x28)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x28 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x28 px, identical pivot and baseline across frames, no gap between frames. Wooden treasure chest in 2 states side by side: frame 1 closed with the lid down, frame 2 lid open showing a gold glow inside. Iron bands, gold lock. Palette #5c3f2a #8a6340 #b98d5c #f2c14e. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## CHS-02 Chest iron — `chest_iron.png` (64x28 — 2 frame @32x28)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x28 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x28 px, identical pivot and baseline across frames, no gap between frames. Iron treasure chest in 2 states side by side: frame 1 closed, frame 2 lid open showing a blue glow inside. Riveted iron bands, blue #4fb3e0 lock. Palette #2a2740 #6f6a90 #9b96b8 #4fb3e0. Identical silhouette to the wooden chest. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## CHS-03 Chest cursed — `chest_cursed.png` (64x28 — 2 frame @32x28)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x28 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x28 px, identical pivot and baseline across frames, no gap between frames. Cursed treasure chest in 2 states side by side: frame 1 closed and bound with purple chains, frame 2 lid open with the chains snapped and a dark violet aura escaping. Palette #3c2154 #7f45b8 #c86ee0. Identical silhouette to the wooden chest. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## CHS-04 Mimic reveal — `chest_mimic.png` (96x32 — 3 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Chest bursting open to reveal a monster, 3 frames: frame 1 lid cracking with red eyes appearing in the gap, frame 2 lid flung wide showing rows of jagged white teeth, frame 3 a long red tongue lashing out, aggressive. Palette #5c3f2a #8a6340 #d8d5e8 #c0303c #6e1b28. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## CHS-05 Shop stall — `shop_stall.png` (64x48)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x48 pixels. Small merchant stall with a striped awning and hanging wares (potions, a sword, a pouch), purple cloth. Palette #3c2154 #7f45b8 #c86ee0 #5c3f2a #f2c14e. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## NPC-01 Merchant — `npc_merchant.png` (64x32 — 2 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Hooded robed shopkeeper, purple robe #7f45b8 with gold #f2c14e trim, coin pouch at the belt, friendly welcoming posture, facing right. 2-frame idle: frame 2 raised 2 pixels with the robe hem shifting. Flat solid fill regions with no internal shading, exactly like the hero sprite. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## NPC-02 Blacksmith idle — `npc_smith_idle.png` (64x32 — 2 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Stocky bearded smith standing beside an anvil, leather apron, hammer resting on the anvil, facing right. 2-frame idle breathing. Palette #2e2018 #5c3f2a #8a6340 #6f6a90 #f0c79c. Flat solid fill regions with no internal shading. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## NPC-02b Blacksmith hammer — `npc_smith_hammer.png` (64x32 — 2 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Stocky bearded smith striking an anvil, 2 frames: frame 1 hammer raised overhead, frame 2 hammer struck down on the anvil with 6 orange spark pixels. Same character, apron and anvil as the idle sheet, identical pivot and baseline. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

