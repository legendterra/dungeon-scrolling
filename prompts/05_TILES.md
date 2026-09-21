# Batch 5 — Tile Dungeon (13 file)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

Tile sekarang 32x32 (bukan 16x16). Kode me-recolor satu set master per biome, jadi gambar SET MASTER netral saja. Opsional: varian khusus `wall` + `door` per biome (6x2 = 12 file tambahan) supaya tiap lantai terasa beda.

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

## TIL-01 — `tile_wall.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Seamlessly tileable on all 4 edges, edge pixels must wrap. Seamless dungeon stone brick wall tile, chiseled mortar lines, subtle chips and pits, palette #2a2740 #514c72 #6f6a90. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-02 — `tile_floor_top.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Seamlessly tileable on all 4 edges, edge pixels must wrap. Seamless dungeon floor surface tile, flat top edge with a moss and rubble lip along the top four pixel rows, cracked stone below, palette #2a2740 #514c72 #6f6a90 with #2f7d4f moss. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-03 — `tile_platform.png` (32x16)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x16 pixels. Thin one-way stone ledge, visible bright top lip, hollow dark underside, seamless horizontally, palette #2a2740 #6f6a90 #9b96b8. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-04 — `tile_spike.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Row of iron floor spikes occupying only the lower half of the tile, rusty tips, transparent upper half, seamless horizontally, palette #2a2740 #6f6a90 #8a3b2a. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-05 — `tile_deathspike.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Bottom-of-pit impaling spike bed, long jagged blood-stained iron spikes filling the whole tile, seamless horizontally, unmistakably lethal, palette #1c1a2b #6f6a90 #6e1b28 #c0303c. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-06 — `tile_door_arch.png` (32x64)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x64 pixels. Carved stone archway portal with a keystone at the top, dark void opening, palette #2a2740 #514c72 #6f6a90 #0d0b14. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-07 — `tile_door_cave.png` (32x64)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x64 pixels. Rough natural cave mouth, uneven rocky rim, stalactite teeth along the top, dark void opening, palette #1c1a2b #2a2740 #514c72. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-08 — `tile_door_gate.png` (32x64)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x64 pixels. Iron portcullis frame with vertical bars raised into the top, rivets and rust, dark opening below, palette #2a2740 #6f6a90 #8a3b2a. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-13 — `tile_crate.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Pushable wooden crate, plank grain, iron corner brackets, palette #2e2018 #5c3f2a #8a6340 #b98d5c. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-09 Crumble platform — `tile_crumble.png` (96x16 — 3 frame @32x16)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x16 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 32x16 px, identical pivot and baseline across frames, no gap between frames. Cracking stone ledge in 3 states: frame 1 intact ledge, frame 2 cracked with visible fracture lines, frame 3 shattering into falling chunks and dust. Palette #2a2740 #6f6a90 #9b96b8. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-10 Puzzle gate — `tile_gate.png` (64x64 — 2 frame @32x64)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x64 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x64 px, identical pivot and baseline across frames, no gap between frames. Iron barrier gate in 2 states side by side: frame 1 bars lowered to the floor (closed), frame 2 bars retracted up into the top housing (open). Rivets and rust, palette #2a2740 #6f6a90 #8a3b2a. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-11 Pressure plate — `tile_plate.png` (64x12 — 2 frame @32x12)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x12 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x12 px, identical pivot and baseline across frames, no gap between frames. Stone floor pressure plate in 2 states: frame 1 raised and unlit, frame 2 depressed 2 pixels with an amber #f2c14e glow along the seam. Palette #2a2740 #6f6a90 #9b96b8 #f2c14e. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## TIL-12 Lever — `tile_lever.png` (40x28 — 2 frame @20x28)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 40x28 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 20x28 px, identical pivot and baseline across frames, no gap between frames. Wall-mounted lever in 2 states: frame 1 handle up and unlit (off), frame 2 handle down with an amber #f2c14e glow at the pivot (on). Iron bracket, wooden handle, palette #2a2740 #6f6a90 #5c3f2a #f2c14e. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

