# Batch 4 — Boss (3 file)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

PERHATIAN: Slime King lama (64x48) sudah tidak dipakai — resolusi game naik ke 640x360 / tile 32, jadi sheet ini WAJIB di-regenerate di 128x96 per frame dan `src/art/king.js` harus di-update.

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

## BOSS-01 Slime King (PROMPT KANONIK — jangan diubah) — `boss_slime_king_sheet.png` (768x96 — 6 frame @128x96)

```text
Pixel art sprite sheet, strict 1:2 pixels grid, no anti-aliasing, no blur,
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
angry eyes, glossy bubble highlights, and a crisp crown silhouette.
```

## BOSS-02 Crown — `boss_crown.png` (24x12)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 24x12 pixels. Small golden spiked crown with a red gem, three points, sits on top of the boss head. Palette #8a7440 #f2c14e #fff0a8 #c0303c. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## BOSS-03 Telegraph ring — `boss_telegraph.png` (96x32 — 3 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Circular ground warning decal seen in side-scroller perspective as a flattened ellipse, three expanding frames from small to full width, amber #f2c14e outline with a darker #8a7440 inner ring, hollow centre. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

