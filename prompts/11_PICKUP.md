# Batch 11 — Pickup & Item Dunia (7 file)

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

## PCK-01 Coin — `pck_coin.png` (48x12 — 4 frame @12x12)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x12 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 12x12 px, identical pivot and baseline across frames, no gap between frames. Spinning gold coin, 4 rotation frames: full face, three-quarter, thin edge-on, three-quarter reversed. Palette #8a7440 #f2c14e #fff0a8. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PCK-02 Heart — `pck_heart.png` (32x16 — 2 frame @16x16)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x16 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 16x16 px, identical pivot and baseline across frames, no gap between frames. Red pixel heart with a white glint in the upper left, 2-frame gentle pulse (frame 2 one pixel wider and brighter). Palette #6e1b28 #c0303c #ffffff. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PCK-03 Shard — `pck_shard.png` (64x16 — 4 frame @16x16)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x16 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 16x16 px, identical pivot and baseline across frames, no gap between frames. Cyan crystal shard, faceted, 4-frame shimmer loop where a highlight travels across the facets. Palette #16324f #4fb3e0 #a8e4ff #ffffff. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PCK-04 Key — `pck_key.png` (32x16 — 2 frame @16x16)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x16 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 16x16 px, identical pivot and baseline across frames, no gap between frames. Ornate golden dungeon key with a skull-shaped bow, 2-frame bob (frame 2 shifted 2 pixels up). Palette #8a7440 #f2c14e #fff0a8. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PCK-05 Mana potion — `pck_mana.png` (32x20 — 2 frame @16x20)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x20 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 16x20 px, identical pivot and baseline across frames, no gap between frames. Blue potion flask with a cork stopper and a bubbling liquid, 2-frame loop where the bubbles rise. Palette #16324f #2f6fa8 #4fb3e0 #a8e4ff #5c3f2a. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PCK-06 Health potion — `pck_health.png` (32x20 — 2 frame @16x20)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x20 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 16x20 px, identical pivot and baseline across frames, no gap between frames. Red potion flask with a cork stopper and a bubbling liquid, 2-frame loop where the bubbles rise. Same flask silhouette as the mana potion. Palette #6e1b28 #c0303c #8a4550 #ffffff #5c3f2a. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PCK-07 Drop glow — `pck_dropglow.png` (128x32 — 4 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 128x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Soft rising light beam with sparkles, marking a dropped item on the ground, 4-frame loop, dithered vertical beam widening at the base, sparkles drifting upward. Draw it in WHITE #ffffff and light grey only — the engine tints it per rarity. Transparent background. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

