# Batch 1 — Background Parallax (18 file)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

3 layer per biome: SKY (640x360, opaque, statis) / MID (1280x360, loop, transparan atas-bawah) / NEAR (1280x360, loop, siluet gelap, tengah kosong buat gameplay).

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

## BG-01a — `bg_halls_sky.png` (640x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 640x360 pixels. Full-bleed opaque background, horizontally loopable, no alpha. Deep indigo to near-black vertical gradient using pixel dithering only (#211b38 top to #12101c bottom), distant cathedral vault ceiling barely visible, faint dust motes, extremely low contrast, must read as far background behind gameplay. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## BG-01b — `bg_halls_mid.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Row of tall gothic stone arches and pillars receding into darkness, carved masonry, a few hanging chains and tattered banners, colors only #2a2740 #514c72 #6f6a90, flattened and 40% darker than foreground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent above and below, no opaque backdrop.
```

## BG-01c — `bg_halls_near.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Foreground stone pillar silhouettes and broken column stumps in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, rubble along the bottom edge. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent PNG, silhouette only.
```

## BG-02a — `bg_caves_sky.png` (640x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 640x360 pixels. Full-bleed opaque background, horizontally loopable, no alpha. Wet limestone cavern seen far away, dripping stalactites, shallow water pools reflecting teal light, moss patches, palette #183430 #33524c #4a7068 #79b39d #aee0cd, glistening highlights, extremely low contrast so gameplay reads on top. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## BG-02b — `bg_caves_mid.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Mid-distance cavern walls with dripping stalactites, moss shelves and shallow reflective water pools, palette #183430 #33524c #4a7068 #79b39d, flattened and 40% darker than foreground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent above and below, no opaque backdrop.
```

## BG-02c — `bg_caves_near.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Foreground stalactite and boulder silhouettes in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, wet rock rubble along the bottom edge. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent PNG, silhouette only.
```

## BG-03a — `bg_prison_sky.png` (640x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 640x360 pixels. Full-bleed opaque background, horizontally loopable, no alpha. Distant prison block interior, rusted iron cell bars, corroded chains, brick walls with peeling mortar, palette #3a2a1c #4a3a2b #6b5641 #b8834f #e0b57e, oppressive, extremely low contrast. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## BG-03b — `bg_prison_mid.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Row of rusted iron cell doors and barred windows, hanging manacles and corroded chains, brick walls with peeling mortar, palette #3a2a1c #4a3a2b #6b5641 #b8834f, flattened and 40% darker than foreground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent above and below, no opaque backdrop.
```

## BG-03c — `bg_prison_near.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Foreground rusted bar and pillar silhouettes in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, broken bricks along the bottom edge. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent PNG, silhouette only.
```

## BG-04a — `bg_vault_sky.png` (640x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 640x360 pixels. Full-bleed opaque background, horizontally loopable, no alpha. Distant vault interior with amethyst crystal formations growing from walls, glowing violet geodes, palette #130e2e #3c3563 #584d85 #9b8ae0 #cfc4ff, violet glow done with dithering not blur, extremely low contrast. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## BG-04b — `bg_vault_mid.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Polished arcane masonry with carved runes and amethyst crystal clusters growing from the walls, glowing violet geodes, palette #130e2e #3c3563 #584d85 #9b8ae0, glow by dithering only, flattened and 40% darker than foreground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent above and below, no opaque backdrop.
```

## BG-04c — `bg_vault_near.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Foreground giant crystal shard silhouettes in near-black #1c1a2b with faint violet rim pixels, only left and right thirds occupied, wide empty transparent center for gameplay. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent PNG, silhouette only.
```

## BG-05a — `bg_nest_sky.png` (640x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 640x360 pixels. Full-bleed opaque background, horizontally loopable, no alpha. Distant organic flesh-and-chitin cavern, egg sacs, sinew webbing, bone ribs embedded in walls, palette #1b090b #4d2c31 #6e4148 #b8636f #e0949c, unsettling biological texture, extremely low contrast. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## BG-05b — `bg_nest_mid.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Mid-distance flesh walls with hanging egg sacs, sinew webbing strands and embedded bone ribs, palette #1b090b #4d2c31 #6e4148 #b8636f, flattened and 40% darker than foreground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent above and below, no opaque backdrop.
```

## BG-05c — `bg_nest_near.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Foreground bone rib and sinew strand silhouettes in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, membrane sludge along the bottom edge. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent PNG, silhouette only.
```

## BG-06a — `bg_throne_sky.png` (640x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 640x360 pixels. Full-bleed opaque background, horizontally loopable, no alpha. Distant ruined golden throne hall half-swallowed by green slime, gilded columns dripping ooze, palette #171106 #4a3f28 #6b5c3c #b89a55 #f0d78e with #5cbf62 slime accents, grand and decayed, extremely low contrast. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.
```

## BG-06b — `bg_throne_mid.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Row of gilded columns dripping green ooze, cracked royal banners, ruined gold masonry, palette #171106 #4a3f28 #6b5c3c #b89a55 with #5cbf62 slime accents, flattened and 40% darker than foreground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent above and below, no opaque backdrop.
```

## BG-06c — `bg_throne_near.png` (1280x360)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 1280x360 pixels. Foreground gilded column silhouettes with slime drips in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, ooze pools along the bottom edge. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Horizontally seamless loop, transparent PNG, silhouette only.
```

