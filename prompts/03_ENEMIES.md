# Batch 3 — Musuh (11 tipe x 4 sheet = 44 file)

> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).
> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.

Tiap musuh butuh 4 sheet: idle / move / attack-windup / death. Hadap KANAN saja — kode mirror otomatis.
Varian Elite (tint oranye) dan Miniboss (tint darah, skala 2x) TIDAK perlu digambar, dihasilkan kode.

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

## ENM-01a Slime idle — `enm_slime_idle.png` (64x24 — 2 frame @32x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x24 px, identical pivot and baseline across frames, no gap between frames. Green gelatinous blob monster with two black dot eyes and a wet white highlight, palette #1b4436 #2f7d4f #5cbf62 #a3e86b. Animation: idle squash-and-stretch breathing: frame 1 resting dome, frame 2 slightly squashed and wider. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-01b Slime move — `enm_slime_move.png` (128x24 — 4 frame @32x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 128x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 32x24 px, identical pivot and baseline across frames, no gap between frames. Green gelatinous blob monster with two black dot eyes and a wet white highlight, palette #1b4436 #2f7d4f #5cbf62 #a3e86b. Animation: hopping locomotion: compress, launch upward stretched tall, airborne, land splattered wide. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-01c Slime attack — `enm_slime_attack.png` (64x24 — 2 frame @32x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x24 px, identical pivot and baseline across frames, no gap between frames. Green gelatinous blob monster with two black dot eyes and a wet white highlight, palette #1b4436 #2f7d4f #5cbf62 #a3e86b. Animation: wind-up before a lunge: frame 1 pulled back and compressed low, frame 2 reared up tall with the body leaning forward. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-01d Slime death — `enm_slime_death.png` (96x24 — 3 frame @32x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 32x24 px, identical pivot and baseline across frames, no gap between frames. Green gelatinous blob monster with two black dot eyes and a wet white highlight, palette #1b4436 #2f7d4f #5cbf62 #a3e86b. Animation: death: frame 1 split with cracks, frame 2 collapsing, frame 3 flat spreading puddle with the eyes sinking. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-02a Zombie idle — `enm_zombie_idle.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Shambling rotten corpse with torn clothes, exposed ribs and one dangling arm, palette #2f7d4f #6e1b28 #514c72. Animation: idle sway: frame 1 hunched, frame 2 leaning 2 pixels further with the head lolling. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-02b Zombie move — `enm_zombie_move.png` (96x32 — 4 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Shambling rotten corpse with torn clothes, exposed ribs and one dangling arm, palette #2f7d4f #6e1b28 #514c72. Animation: shambling walk cycle, dragging one leg, the dangling arm swinging out of sync. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-02c Zombie attack — `enm_zombie_attack.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Shambling rotten corpse with torn clothes, exposed ribs and one dangling arm, palette #2f7d4f #6e1b28 #514c72. Animation: attack wind-up: frame 1 both arms drawn back, frame 2 both arms thrust forward with the jaw open. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-02d Zombie death — `enm_zombie_death.png` (72x32 — 3 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Shambling rotten corpse with torn clothes, exposed ribs and one dangling arm, palette #2f7d4f #6e1b28 #514c72. Animation: death: frame 1 head snapping back, frame 2 buckling at the knees, frame 3 crumpled pile of limbs and rags. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-03a Bat idle — `enm_bat_idle.png` (48x20 — 2 frame @24x20)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x20 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x20 px, identical pivot and baseline across frames, no gap between frames. Small leathery cave bat with red pinprick eyes, palette #514c72 #6e1b28 #9b96b8. Animation: idle hover: frame 1 wings level, frame 2 wings slightly raised. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-03b Bat move — `enm_bat_move.png` (96x20 — 4 frame @24x20)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x20 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x20 px, identical pivot and baseline across frames, no gap between frames. Small leathery cave bat with red pinprick eyes, palette #514c72 #6e1b28 #9b96b8. Animation: flap cycle: wings fully up, wings mid, wings fully down, wings mid. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-03c Bat attack — `enm_bat_attack.png` (48x20 — 2 frame @24x20)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x20 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x20 px, identical pivot and baseline across frames, no gap between frames. Small leathery cave bat with red pinprick eyes, palette #514c72 #6e1b28 #9b96b8. Animation: dive wind-up: frame 1 wings folded back and body tilted nose-down, frame 2 mouth open showing tiny fangs. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-03d Bat death — `enm_bat_death.png` (72x20 — 3 frame @24x20)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x20 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x20 px, identical pivot and baseline across frames, no gap between frames. Small leathery cave bat with red pinprick eyes, palette #514c72 #6e1b28 #9b96b8. Animation: death: frame 1 wings crumpling, frame 2 tumbling upside down, frame 3 collapsed with wings folded over the body. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-04a Skeleton archer idle — `enm_skelarcher_idle.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Bony skeleton archer with a short bow, glowing eye sockets and a tattered quiver, palette #d8d5e8 #9b96b8 #6f6a90. Animation: idle: frame 1 bow held low, frame 2 skull tilting and eye sockets brightening. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-04b Skeleton archer move — `enm_skelarcher_move.png` (96x32 — 4 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Bony skeleton archer with a short bow, glowing eye sockets and a tattered quiver, palette #d8d5e8 #9b96b8 #6f6a90. Animation: walk cycle, bones rattling, quiver bouncing on the back. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-04c Skeleton archer attack — `enm_skelarcher_attack.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Bony skeleton archer with a short bow, glowing eye sockets and a tattered quiver, palette #d8d5e8 #9b96b8 #6f6a90. Animation: draw and release: frame 1 bowstring pulled fully back with an arrow nocked, frame 2 string released and the bow snapping straight. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-04d Skeleton archer death — `enm_skelarcher_death.png` (72x32 — 3 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Bony skeleton archer with a short bow, glowing eye sockets and a tattered quiver, palette #d8d5e8 #9b96b8 #6f6a90. Animation: death: frame 1 ribcage cracking, frame 2 bones separating mid-air, frame 3 scattered bone pile with the skull on top. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-05a Spitter idle — `enm_spitter_idle.png` (48x24 — 2 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Squat armored maw creature with a big circular mouth and acid drool, palette #5cbf62 #a3e86b #1b4436. Animation: idle: frame 1 mouth closed, frame 2 mouth slightly parted with a drool bead. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-05b Spitter move — `enm_spitter_move.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Squat armored maw creature with a big circular mouth and acid drool, palette #5cbf62 #a3e86b #1b4436. Animation: slow crawl on stubby legs, body rocking side to side. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-05c Spitter attack — `enm_spitter_attack.png` (48x24 — 2 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Squat armored maw creature with a big circular mouth and acid drool, palette #5cbf62 #a3e86b #1b4436. Animation: spit wind-up: frame 1 head pulled back and throat swelling, frame 2 mouth wide open firing acid. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-05d Spitter death — `enm_spitter_death.png` (72x24 — 3 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x24 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Squat armored maw creature with a big circular mouth and acid drool, palette #5cbf62 #a3e86b #1b4436. Animation: death: frame 1 armor plates cracking, frame 2 body deflating, frame 3 flat shell with acid leaking out. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-06a Spider idle — `enm_spider_idle.png` (48x24 — 2 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Chitinous cave spider with eight legs and two white eye clusters, palette #1c1a2b #3c2154 #d8d5e8. Animation: idle: frame 1 legs planted, frame 2 legs flexing and the body dipping 2 pixels. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-06b Spider move — `enm_spider_move.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Chitinous cave spider with eight legs and two white eye clusters, palette #1c1a2b #3c2154 #d8d5e8. Animation: scuttle cycle, legs alternating in two groups of four. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-06c Spider attack — `enm_spider_attack.png` (48x24 — 2 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Chitinous cave spider with eight legs and two white eye clusters, palette #1c1a2b #3c2154 #d8d5e8. Animation: pounce wind-up: frame 1 tucked into a compact ball, frame 2 legs sprung wide with fangs bared. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-06d Spider death — `enm_spider_death.png` (72x24 — 3 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x24 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Chitinous cave spider with eight legs and two white eye clusters, palette #1c1a2b #3c2154 #d8d5e8. Animation: death: frame 1 legs curling inward, frame 2 flipping onto its back, frame 3 legs fully curled over the underside. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-07a Bomber idle — `enm_bomber_idle.png` (48x24 — 2 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Bloated exploding creature with a glowing cracked belly and a blinking red core, palette #8a3b2a #e8743b #f2c14e. Animation: idle: frame 1 core dim, frame 2 core glowing bright through the belly cracks. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-07b Bomber move — `enm_bomber_move.png` (96x24 — 4 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x24 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Bloated exploding creature with a glowing cracked belly and a blinking red core, palette #8a3b2a #e8743b #f2c14e. Animation: waddling bounce cycle, belly wobbling. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-07c Bomber attack — `enm_bomber_attack.png` (48x24 — 2 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x24 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Bloated exploding creature with a glowing cracked belly and a blinking red core, palette #8a3b2a #e8743b #f2c14e. Animation: detonation wind-up: frame 1 body swelling with the cracks widening, frame 2 nearly spherical and the core blindingly bright. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-07d Bomber death — `enm_bomber_death.png` (72x24 — 3 frame @24x24)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x24 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x24 px, identical pivot and baseline across frames, no gap between frames. Bloated exploding creature with a glowing cracked belly and a blinking red core, palette #8a3b2a #e8743b #f2c14e. Animation: death: frame 1 rupturing, frame 2 bursting into fire chunks, frame 3 charred scraps and smoke. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-08a Shielder idle — `enm_shielder_idle.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Heavy armored guard holding a large tower shield covering its front, vulnerable back, palette #6f6a90 #9b96b8 #2a2740. Animation: idle: frame 1 shield planted, frame 2 shield raised 2 pixels with the helm shifting. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-08b Shielder move — `enm_shielder_move.png` (96x32 — 4 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Heavy armored guard holding a large tower shield covering its front, vulnerable back, palette #6f6a90 #9b96b8 #2a2740. Animation: heavy march cycle, shield locked forward, slow deliberate steps. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-08c Shielder attack — `enm_shielder_attack.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Heavy armored guard holding a large tower shield covering its front, vulnerable back, palette #6f6a90 #9b96b8 #2a2740. Animation: shield bash wind-up: frame 1 shield pulled back against the shoulder, frame 2 shield rammed forward past the body. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-08d Shielder death — `enm_shielder_death.png` (72x32 — 3 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Heavy armored guard holding a large tower shield covering its front, vulnerable back, palette #6f6a90 #9b96b8 #2a2740. Animation: death: frame 1 shield dropping, frame 2 falling to the knees, frame 3 armor collapsed with the shield flat on the ground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-09a Wraith idle — `enm_wraith_idle.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Floating tattered spectre with no legs, trailing wisps and hollow glowing eyes, semi-transparent lower body rendered with checkerboard dithering, palette #3c2154 #7f45b8 #c86ee0 #a89bff. Animation: idle float: frame 1 tatters low, frame 2 tatters rising and the eyes brightening. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-09b Wraith move — `enm_wraith_move.png` (96x32 — 4 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Floating tattered spectre with no legs, trailing wisps and hollow glowing eyes, semi-transparent lower body rendered with checkerboard dithering, palette #3c2154 #7f45b8 #c86ee0 #a89bff. Animation: drifting glide cycle, the wisp tail undulating behind. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-09c Wraith attack — `enm_wraith_attack.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Floating tattered spectre with no legs, trailing wisps and hollow glowing eyes, semi-transparent lower body rendered with checkerboard dithering, palette #3c2154 #7f45b8 #c86ee0 #a89bff. Animation: claw wind-up: frame 1 arms drawn wide and the cloak flaring, frame 2 clawed hands lashing forward. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-09d Wraith death — `enm_wraith_death.png` (72x32 — 3 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Floating tattered spectre with no legs, trailing wisps and hollow glowing eyes, semi-transparent lower body rendered with checkerboard dithering, palette #3c2154 #7f45b8 #c86ee0 #a89bff. Animation: death: frame 1 form destabilising, frame 2 dispersing into wisps, frame 3 a few fading motes only. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-10a Necromancer idle — `enm_necromancer_idle.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Robed skeletal caster holding a staff crowned with green flame, palette #1b4436 #2f7d4f #d8d5e8 #a3e86b. Animation: idle: frame 1 staff held upright, frame 2 the green flame flickering taller. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-10b Necromancer move — `enm_necromancer_move.png` (96x32 — 4 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x32 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Robed skeletal caster holding a staff crowned with green flame, palette #1b4436 #2f7d4f #d8d5e8 #a3e86b. Animation: gliding walk cycle, robe hem swaying, staff bobbing. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-10c Necromancer attack — `enm_necromancer_attack.png` (48x32 — 2 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 48x32 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Robed skeletal caster holding a staff crowned with green flame, palette #1b4436 #2f7d4f #d8d5e8 #a3e86b. Animation: summon wind-up: frame 1 staff raised overhead with the flame swelling, frame 2 staff slammed down with a burst of green light at the base. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-10d Necromancer death — `enm_necromancer_death.png` (72x32 — 3 frame @24x32)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 72x32 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 24x32 px, identical pivot and baseline across frames, no gap between frames. Robed skeletal caster holding a staff crowned with green flame, palette #1b4436 #2f7d4f #d8d5e8 #a3e86b. Animation: death: frame 1 robe collapsing inward, frame 2 the staff falling free, frame 3 empty heap of robe with the skull rolled aside. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-11a Golem idle — `enm_golem_idle.png` (64x40 — 2 frame @32x40)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x40 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x40 px, identical pivot and baseline across frames, no gap between frames. Bulky animated stone golem with cracked runic seams glowing amber and heavy fists, palette #2a2740 #514c72 #b98d5c #f2c14e. Animation: idle: frame 1 fists at the sides, frame 2 the rune seams pulsing brighter and the shoulders rising 2 pixels. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-11b Golem move — `enm_golem_move.png` (128x40 — 4 frame @32x40)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 128x40 pixels. Horizontal sprite sheet, 4 frames in a single row, each frame exactly 32x40 px, identical pivot and baseline across frames, no gap between frames. Bulky animated stone golem with cracked runic seams glowing amber and heavy fists, palette #2a2740 #514c72 #b98d5c #f2c14e. Animation: heavy stomp cycle, each step planted hard, the body barely bobbing. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-11c Golem attack — `enm_golem_attack.png` (64x40 — 2 frame @32x40)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 64x40 pixels. Horizontal sprite sheet, 2 frames in a single row, each frame exactly 32x40 px, identical pivot and baseline across frames, no gap between frames. Bulky animated stone golem with cracked runic seams glowing amber and heavy fists, palette #2a2740 #514c72 #b98d5c #f2c14e. Animation: smash wind-up: frame 1 both fists raised high overhead with the runes blazing, frame 2 both fists driven into the ground. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

## ENM-11d Golem death — `enm_golem_death.png` (96x40 — 3 frame @32x40)

```text
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, no watermark, no border frame, single object centered, orthographic side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black outline (#0d0b14). Output exactly 96x40 pixels. Horizontal sprite sheet, 3 frames in a single row, each frame exactly 32x40 px, identical pivot and baseline across frames, no gap between frames. Bulky animated stone golem with cracked runic seams glowing amber and heavy fists, palette #2a2740 #514c72 #b98d5c #f2c14e. Animation: death: frame 1 the seams cracking wide, frame 2 the torso breaking apart, frame 3 a pile of rubble with the runes going dark. Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom. Facing RIGHT only (the engine mirrors for the left). Identical pivot and ground baseline in every frame — the creature must not drift, jump or change size between frames.
```

