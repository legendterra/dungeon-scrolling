# Batch 12 — Partikel & Decal (7 file)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

Beberapa partikel digambar PUTIH saja karena di-tint runtime (blood per-enemy, mote per-biome, drop glow per-rarity).

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

## PAR-01 Dust puff — `par_dust.png` (64x16 — 4 frame @16x16)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x16 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 16x16 px, identical pivot and baseline across frames, no gap between frames. Small landing dust puff, 4 frames: tight cluster, expanding ring, wide and thin, nearly gone. Palette #6f6a90 #9b96b8 #d8d5e8. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PAR-02 Blood splatter — `par_blood.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Gore burst, 4 frames of chunky angular pixels flying outward and falling, no soft edges. Draw in WHITE #ffffff and grey only — the engine tints it per enemy color. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PAR-03 Ambient mote — `par_mote.png` (18x6 — 3 frame @6x6)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 18x6 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 6x6 px, identical pivot and baseline across frames, no gap between frames. Single floating dust mote, 3 frames: bright, mid, dim. Draw in WHITE #ffffff only — the engine tints it per biome. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PAR-04 Spark — `par_spark.png` (18x6 — 3 frame @6x6)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 18x6 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 6x6 px, identical pivot and baseline across frames, no gap between frames. Bright hit spark, 3 frames: 4-point star flash, small cross, 2x2 pixel dot. Palette #ffffff #fff0a8 #f2c14e. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PAR-05 Ground crack decal — `par_crack.png` (32x12)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x12 pixels. Cracked stone impact decal lying flat on the ground, radiating fracture lines from the centre. Palette #1c1a2b #2a2740 #514c72. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PAR-06 Shockwave ring — `par_shockwave.png` (256x16 — 4 frame @64x16)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 256x16 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 64x16 px, identical pivot and baseline across frames, no gap between frames. Expanding ground shockwave ring for the boss slam, seen in side-scroller perspective as a flattened ellipse, 4 frames from narrow and bright to wide and faint, with dust pixels kicked up along the leading edges. Palette #ffffff #d8d5e8 #9b96b8. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PAR-07 Level-up burst — `par_levelup.png` (288x48 — 6 frame @48x48)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 288x48 pixels. Horizontal sprite sheet, 6 frames in a single row, each frame exactly 48x48 px, identical pivot and baseline across frames, no gap between frames. Golden radial burst with rising sparkles, 6 frames: bright core flash, expanding ray star, full burst, rays retracting while sparkles rise, sparkles only, faint remnants. Palette #fff0a8 #f2c14e #8a7440 #ffffff. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

