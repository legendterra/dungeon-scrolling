# Batch 6 — Obor & Props Dinding (9 grup / 14 file)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

Torch dipisah body + flame supaya flame bisa di-tint per biome.

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

## PRP-01 Torch sconce (body) — `prp_torch_body.png` (24x48)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 24x48 pixels. Wall-mounted iron torch sconce on a short pole bracket, wrapped rag head, soot mark on the wall plate, mounted low. Body only, NO flame. Palette #1c1a2b #514c72 #5c3f2a #8a6340. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-02 Torch flame — `prp_torch_flame.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Small pixel flame loop, tapered teardrop shape, gentle flicker (not wild swinging), core #fff0a8, mid #f2c14e, outer #e8743b, no smoke, fully transparent around the flame. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-03 Flame tint — caves — `prp_torch_flame_caves.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Small pixel flame loop, tapered teardrop shape, gentle flicker, teal coloured flame: bright white-tinted core, mid #7de0be, darker outer edge of the same hue. No smoke, fully transparent around the flame. Identical shape and frames to the standard torch flame — only the hue differs. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-03 Flame tint — prison — `prp_torch_flame_prison.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Small pixel flame loop, tapered teardrop shape, gentle flicker, amber-orange coloured flame: bright white-tinted core, mid #e8a05a, darker outer edge of the same hue. No smoke, fully transparent around the flame. Identical shape and frames to the standard torch flame — only the hue differs. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-03 Flame tint — vault — `prp_torch_flame_vault.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Small pixel flame loop, tapered teardrop shape, gentle flicker, violet coloured flame: bright white-tinted core, mid #a89bff, darker outer edge of the same hue. No smoke, fully transparent around the flame. Identical shape and frames to the standard torch flame — only the hue differs. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-03 Flame tint — nest — `prp_torch_flame_nest.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Small pixel flame loop, tapered teardrop shape, gentle flicker, blood pink coloured flame: bright white-tinted core, mid #e8737f, darker outer edge of the same hue. No smoke, fully transparent around the flame. Identical shape and frames to the standard torch flame — only the hue differs. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-03 Flame tint — throne — `prp_torch_flame_throne.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Small pixel flame loop, tapered teardrop shape, gentle flicker, gold coloured flame: bright white-tinted core, mid #f2c14e, darker outer edge of the same hue. No smoke, fully transparent around the flame. Identical shape and frames to the standard torch flame — only the hue differs. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-04 Enchant table — `prp_enchant.png` (80x32 — 2 frame @40x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 80x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 40x32 px, identical pivot and baseline across frames, no gap between frames. Small arcane enchanting table with an open glowing tome and floating runes above it, violet glow rendered with dithering not blur. 2-frame loop: frame 1 runes low, frame 2 runes risen 4 pixels and brighter. Palette #3c2154 #7f45b8 #c86ee0 #f2c14e. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-05 Hanging chain — `prp_chain.png` (12x64)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 12x64 pixels. Vertical rusted iron chain, seamless vertically so it can be stacked, ending in a hook at the bottom. Palette #1c1a2b #514c72 #8a3b2a. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-06 Banner — `prp_banner.png` (48x48 — 2 frame @24x48)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x48 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x48 px, identical pivot and baseline across frames, no gap between frames. Tattered hanging cloth banner with a faded crest, frayed bottom edge, gentle two-frame sway (frame 2 shifted 2 pixels to the right at the bottom). Palette #6e1b28 #c0303c #8a7440 #f2c14e. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-07 Skull pile — `prp_skulls.png` (32x20)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x20 pixels. Small pile of bones and skulls resting on the floor, off-white #d8d5e8 with #9b96b8 shadow and #6f6a90 deep shadow. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-08 Brazier — `prp_brazier.png` (112x32 — 4 frame @28x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 112x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 28x32 px, identical pivot and baseline across frames, no gap between frames. Standing iron fire bowl on a tripod, 4-frame flame loop with small ember sparks rising, bowl identical in every frame. Palette #1c1a2b #514c72 #e8743b #f2c14e #fff0a8. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## PRP-09 Signpost — `prp_sign.png` (24x28)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 24x28 pixels. Wooden dungeon signpost with an arrow-shaped board pointing right, NO readable text, just a couple of illegible scratch marks. Palette #2e2018 #5c3f2a #8a6340 #b98d5c. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

