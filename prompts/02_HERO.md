# Batch 2 — Hero (8 sheet)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

PENTING: sistem paper doll me-remap warna hero saat pakai armor, jadi tiap region HARUS flat satu warna tanpa shading di dalamnya.

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

## HERO-01 — `hero_idle.png` (64x32 — 2 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, standing idle, gentle breathing loop: frame 1 neutral, frame 2 chest and hair raised by 2 pixels. Tiny sword sheathed at the hip. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

## HERO-02 — `hero_run.png` (128x32 — 4 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 128x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, running to the right, 4-frame cycle: contact, passing, contact opposite, passing opposite. Arms swinging, hair trailing back, one pixel of vertical bob. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

## HERO-03 — `hero_jump.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, at the top of a jump, body rising, knees tucked up, arms out for balance, hair pushed down by the upward motion. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

## HERO-04 — `hero_fall.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, falling, legs extended downward and apart, arms raised, hair blown upward. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

## HERO-05 — `hero_attack.png` (96x32 — 3 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, swinging a sword to the right, 3 frames: wind-up with the blade pulled back behind the head, mid-slash with the blade horizontal in front, recover with the blade low and the body settling. Body stays inside the frame, feet never leave the bottom row. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

## HERO-06 — `hero_hurt.png` (32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 32x32 pixels. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, taking a hit, torso leaning back to the left, head snapped back, one arm flung up, knees bent. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

## HERO-07 — `hero_death.png` (128x32 — 4 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 128x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, dying, 4 frames: stagger, drop to one knee, collapse forward, lying flat on the ground with the sword fallen beside. Final frame occupies only the lower third of the frame. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

## HERO-08 — `hero_dash.png` (96x32 — 3 frame @32x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 32x32 px, identical pivot and baseline across frames, no gap between frames. Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, dashing right, 3 frames: crouched launch, body leaning far forward low to the ground with a 4-pixel afterimage streak behind, recovery upright. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a single solid fill color) so the palette can be swapped at runtime by the paper-doll system. Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.
```

