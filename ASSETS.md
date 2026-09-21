# DUNGEON SCROLLING — SPRITE ASSET MANIFEST

> ### STATUS ART — 2026-08-26
> Seluruh roster sudah **digambar ulang di dalam kode** dengan gaya chibi pada
> **detail 2x** (`src/art/`, `src/entities/enemies2.js`, `src/world/bonus.js`).
> Canvas game sekarang 640x360 (`C.RS = 2`); logika tetap 320x180, jadi fisika,
> level, dan parkur tidak berubah sama sekali.
>
> **Ukuran pixel di dokumen ini adalah spesifikasi LAMA (1x).** Setiap sprite
> sekarang memakai grid seni 2x di atas footprint logis yang sama. Untuk angka
> yang sudah dikalikan, lihat [`prompts/`](prompts/README.md).
>
> Dokumen ini tetap berlaku sebagai daftar asset, palette, dan catatan desain --
> dan sebagai spesifikasi kalau nanti mau mengganti art kode dengan PNG.

Daftar lengkap asset yang harus dibuat + prompt siap-tempel untuk Gemini.

## 0. ATURAN GLOBAL (tempel di SETIAP prompt)

Resolusi internal game: **320×180 px**, tile: **16×16 px**, gaya: **pixel art dungeon crawler side-scroller, dark fantasy**.

**PROMPT PREFIX (wajib, salin ke depan setiap prompt di bawah):**

```
Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients,
hard-edged pixels only, transparent PNG background (alpha), no drop shadow,
no text, no watermark, no border frame, single object centered, orthographic
side view, dark-fantasy dungeon crawler style, limited palette (max 12 colors),
crisp near-black outline (#0d0b14). Output exactly {W}x{H} pixels.
```

- Asset TILE tambahkan: `seamlessly tileable on all 4 edges, edge pixels must wrap.`
- Asset BACKGROUND tambahkan: `full-bleed opaque background, horizontally loopable, no alpha.`
- Animasi: `horizontal sprite sheet, {N} frames in a single row, each frame exactly {W}x{H} px, identical pivot and baseline across frames, no gap between frames.`

**PALET RESMI GAME** (pakai persis ini, jangan bikin warna baru):

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

## 1. BACKGROUND / PARALLAX (prioritas)

Sekarang background cuma gradient + kotak arch yang digambar kode. Target: **3 layer parallax per biome** (6 biome = 18 gambar).

- Layer SKY (jauh): **320×180**, opaque, statis
- Layer MID (arsitektur jauh): **640×180**, horizontally loopable, transparan di atas & bawah
- Layer NEAR (pilar depan): **640×180**, transparan, siluet gelap, tengah kosong

| ID | File | Ukuran | Biome |
|---|---|---|---|
| BG-01 | `bg_halls_sky / _mid / _near` | 320×180 / 640×180 ×2 | Depth 1 — STONE HALLS |
| BG-02 | `bg_caves_*` | idem | Depth 2 — DAMP CAVES |
| BG-03 | `bg_prison_*` | idem | Depth 3 — RUSTED PRISON |
| BG-04 | `bg_vault_*` | idem | Depth 4 — CRYSTAL VAULT |
| BG-05 | `bg_nest_*` | idem | Depth 5 — THE NEST |
| BG-06 | `bg_throne_*` | idem | Depth 6-10 — THRONE OF SLIME |

**BG-01 STONE HALLS**
- sky: `Output 320x180 px opaque. Deep indigo to near-black vertical gradient using pixel dithering only (#211b38 top to #12101c bottom), distant cathedral vault ceiling barely visible, faint dust motes, extremely low contrast, must read as far background behind gameplay.`
- mid: `Output 640x180, horizontally seamless loop, transparent above and below. Row of tall gothic stone arches and pillars receding into darkness, carved masonry, a few hanging chains and tattered banners, colors only #2a2740 #514c72 #6f6a90, flattened and 40% darker than foreground.`
- near: `Output 640x180, horizontally seamless loop, transparent PNG. Foreground stone pillar silhouettes and broken column stumps in near-black #1c1a2b, only left and right thirds occupied, wide empty transparent center for gameplay, rubble along the bottom edge.`

**BG-02 DAMP CAVES** — `Wet limestone cavern, dripping stalactites, shallow water pools reflecting teal light, moss patches, palette #183430 #33524c #4a7068 #79b39d #aee0cd, glistening highlights.`

**BG-03 RUSTED PRISON** — `Rusted iron cell bars, corroded chains, brick walls with peeling mortar, hanging manacles, palette #3a2a1c #4a3a2b #6b5641 #b8834f #e0b57e, oppressive.`

**BG-04 CRYSTAL VAULT** — `Amethyst crystal formations growing from walls, glowing violet geodes, polished arcane masonry with runes, palette #130e2e #3c3563 #584d85 #9b8ae0 #cfc4ff, violet glow done with dithering not blur.`

**BG-05 THE NEST** — `Organic flesh-and-chitin cavern, egg sacs, sinew webbing, bone ribs embedded in walls, palette #1b090b #4d2c31 #6e4148 #b8636f #e0949c, unsettling biological texture.`

**BG-06 THRONE OF SLIME** — `Ruined golden throne hall half-swallowed by green slime, gilded columns dripping ooze, cracked royal banners, palette #171106 #4a3f28 #6b5c3c #b89a55 #f0d78e with #5cbf62 slime accents, grand and decayed.`

---

## 2. HERO (16×16 per frame, kaki di baris piksel paling bawah)

| ID | Asset | Frame | Ukuran sheet |
|---|---|---|---|
| HERO-01 | idle | 2 | 32×16 |
| HERO-02 | run | 4 | 64×16 |
| HERO-03 | jump | 1 | 16×16 |
| HERO-04 | fall | 1 | 16×16 |
| HERO-05 | attack swing | 3 | 48×16 |
| HERO-06 | hurt / knockback | 1 | 16×16 |
| HERO-07 | death | 4 | 64×16 |
| HERO-08 | dash / roll | 3 | 48×16 |

**PENTING — sistem paper doll.** Warna hero di-remap saat pakai armor, jadi area berikut harus **flat satu warna, tanpa shading di dalamnya**:

- Rambut/helm `#f2c14e` · Tunik `#7f45b8` · Sabuk `#c86ee0` · Celana `#3c2154` · Sepatu `#5c3f2a` · Kulit `#f0c79c` · Outline `#0d0b14`

Prompt HERO-01:

```
{PREFIX} Output 32x16 px. Horizontal sprite sheet, 2 frames, each exactly 16x16.
Small heroic adventurer facing right, idle breathing loop. Gold hair, purple tunic
with light purple belt, dark purple trousers, brown boots, tiny sword sheathed at hip.
Flat color regions with NO shading inside hair, tunic, trousers, or boots (each must be
a single solid fill color) so the palette can be swapped at runtime. Feet on bottom row.
```

Sheet lain tinggal ganti kalimat aksinya: run cycle 4 frame, jump (naik, kaki tertekuk), fall (kaki terentang, rambut naik), attack (windup → slash → recover), hurt (badan miring ke belakang), death (jatuh berlutut lalu tergeletak), dash (badan condong + afterimage).

---

## 3. MUSUH

Tiap musuh butuh 4 sheet: **idle(2) · move(2-4) · attack/windup(2) · death(3)**. Hadap KANAN saja (kode mirror otomatis).

| ID | Musuh | Ukuran/frame | Prompt inti |
|---|---|---|---|
| ENM-01 | Slime | 16×12 | `Green gelatinous blob monster, squash-and-stretch, two black dot eyes, wet highlight, palette #1b4436 #2f7d4f #5cbf62 #a3e86b.` |
| ENM-02 | Zombie | 12×16 | `Shambling rotten corpse, torn clothes, exposed ribs, one dangling arm, palette #2f7d4f #6e1b28 #514c72.` |
| ENM-03 | Bat | 12×10 | `Small leathery cave bat, wings up and down flap frames, red pinprick eyes, palette #514c72 #6e1b28 #9b96b8.` |
| ENM-04 | Skeleton archer | 12×16 | `Bony skeleton archer with short bow, glowing eye sockets, tattered quiver, palette #d8d5e8 #9b96b8 #6f6a90.` |
| ENM-05 | Spitter | 12×12 | `Squat armored maw creature with a big circular mouth, closed and wide-open variants, acid drool, palette #5cbf62 #a3e86b #1b4436.` |
| ENM-06 | Spider | 12×12 | `Chitinous cave spider, eight legs, plus a tucked-ball pose variant, two white eye clusters, palette #1c1a2b #3c2154 #d8d5e8.` |
| ENM-07 | Bomber | 12×12 | `Bloated exploding creature, glowing cracked belly, blinking red core, palette #8a3b2a #e8743b #f2c14e.` |
| ENM-08 | Shielder | 12×16 | `Heavy armored guard holding a large tower shield covering its front, vulnerable back, palette #6f6a90 #9b96b8 #2a2740.` |
| ENM-09 | Wraith | 12×16 | `Floating tattered spectre, no legs, trailing wisps, hollow glowing eyes, semi-transparent lower body via dithering, palette #3c2154 #7f45b8 #c86ee0 #a89bff.` |
| ENM-10 | Necromancer | 12×16 | `Robed skeletal caster, staff crowned with green flame, summoning pose, palette #1b4436 #2f7d4f #d8d5e8 #a3e86b.` |
| ENM-11 | Golem | 16×20 | `Bulky animated stone golem, cracked runic seams glowing amber, heavy fists, palette #2a2740 #514c72 #b98d5c #f2c14e.` |

Varian **Elite** (tint oranye) dan **Miniboss** (tint darah, skala 2×) **tidak perlu digambar** — dihasilkan kode.

| ID | Boss | Ukuran | Prompt |
|---|---|---|---|
| BOSS-01 | Slime King | 32×24 — idle 2, slam 3, hurt 1 | `Enormous royal purple slime king, regal ooze body, glossy highlight, angry eyes, squash slam pose, palette #3c2154 #7f45b8 #c86ee0.` |
| BOSS-02 | Crown | 12×6 | `Small golden spiked crown with a red gem, sits on top of the boss, palette #8a7440 #f2c14e #fff0a8 #c0303c.` |
| BOSS-03 | Telegraph ring | 48×16, 3 frame | `Circular ground warning decal, three expanding frames, amber #f2c14e outline.` |

---

## 4. TILE DUNGEON (16×16, seamless)

Kode sekarang me-recolor satu set master per biome. Rekomendasi: buat **set master** + 6 varian khusus untuk `wall` dan `door` supaya tiap lantai terasa beda.

| ID | Tile | Ukuran | Prompt |
|---|---|---|---|
| TIL-01 | Wall block | 16×16 | `Seamless dungeon stone brick wall tile, chiseled mortar lines, subtle chips, palette #2a2740 #514c72 #6f6a90.` |
| TIL-02 | Floor top | 16×16 | `Seamless dungeon floor surface tile, flat top edge with a moss and rubble lip, cracked stone below.` |
| TIL-03 | Platform | 16×8 | `Thin one-way stone ledge, visible top lip, hollow underside, seamless horizontally.` |
| TIL-04 | Spike | 16×16 | `Row of iron floor spikes occupying only the lower half of the tile, rusty tips, seamless horizontally.` |
| TIL-05 | Death spike pit | 16×16 | `Bottom-of-pit impaling spike bed, long jagged blood-stained iron spikes filling the tile, seamless horizontally, unmistakably lethal.` |
| TIL-06 | Door — arch | 16×32 | `Carved stone archway portal, dark void opening, keystone at top.` |
| TIL-07 | Door — cave | 16×32 | `Rough natural cave mouth, uneven rocky rim, stalactite teeth.` |
| TIL-08 | Door — gate | 16×32 | `Iron portcullis frame with vertical bars raised, rivets and rust.` |
| TIL-09 | Crumble platform | 16×8, 3 frame | `Cracking stone ledge: intact, cracked, shattering to dust.` |
| TIL-10 | Puzzle gate | 16×32, 2 state | `Iron barrier gate: bars down (closed) and bars raised (open).` |
| TIL-11 | Pressure plate | 16×6, 2 state | `Stone floor pressure plate: raised, and depressed with amber glow.` |
| TIL-12 | Lever | 10×14, 2 state | `Wall lever: handle up (off), handle down (on, amber glow).` |
| TIL-13 | Crate | 16×16 | `Pushable wooden crate, iron corner brackets, palette #2e2018 #5c3f2a #8a6340 #b98d5c.` |

---

## 5. OBOR & PROPS DINDING

| ID | Asset | Ukuran | Frame | Prompt |
|---|---|---|---|---|
| PRP-01 | Torch sconce (body) | 12×24 | 1 | `Wall-mounted iron torch sconce on a short pole bracket, wrapped rag head, soot mark on the wall plate, mounted low. Body only, no flame. Palette #1c1a2b #514c72 #5c3f2a #8a6340.` |
| PRP-02 | Torch flame | 12×12 | 4 | `Horizontal sprite sheet, 4 frames, small pixel flame loop, tapered teardrop shape, gentle flicker (not wild swinging), core #fff0a8, mid #f2c14e, outer #e8743b, no smoke, transparent.` |
| PRP-03 | Flame biome tints | 12×12 ×5 | 4 | Ganti warna: caves `#7de0be`, prison `#e8a05a`, vault `#a89bff`, nest `#e8737f`, throne `#f2c14e`. |
| PRP-04 | Enchant table | 20×16 | 2 | `Small arcane enchanting table, open glowing tome, floating runes above, violet glow, palette #3c2154 #7f45b8 #c86ee0 #f2c14e.` |
| PRP-05 | Hanging chain | 6×32 | 1 | `Vertical rusted iron chain, seamless vertically, ends in a hook.` |
| PRP-06 | Banner | 12×24 | 2 | `Tattered hanging cloth banner with a faded crest, gentle two-frame sway.` |
| PRP-07 | Skull pile | 16×10 | 1 | `Small pile of bones and skulls on the floor, off-white #d8d5e8.` |
| PRP-08 | Brazier | 14×16 | 4 | `Standing iron fire bowl on a tripod, flame loop, ember sparks.` |
| PRP-09 | Signpost | 12×14 | 1 | `Wooden dungeon signpost with an arrow, no readable text.` |

---

## 6. CHEST & INTERAKSI

| ID | Asset | Ukuran | Prompt |
|---|---|---|---|
| CHS-01 | Chest wood | 16×14, 2 state | `Wooden treasure chest, iron bands, gold lock. Closed, and lid open with gold glow inside. Palette #5c3f2a #8a6340 #b98d5c #f2c14e.` |
| CHS-02 | Chest iron | 16×14, 2 state | Sama, warna `#2a2740 #6f6a90 #9b96b8`, kunci biru `#4fb3e0`. |
| CHS-03 | Chest cursed | 16×14, 2 state | Sama, warna `#3c2154 #7f45b8 #c86ee0`, rantai ungu, aura gelap. |
| CHS-04 | Mimic reveal | 16×16, 3 frame | `Chest bursting open revealing rows of jagged teeth and a long tongue, aggressive.` |
| CHS-05 | Shop stall | 32×24 | `Small merchant stall with an awning, hanging wares, purple cloth.` |

---

## 7. NPC

| ID | Asset | Ukuran | Prompt |
|---|---|---|---|
| NPC-01 | Merchant | 16×16, idle 2 | `Hooded robed shopkeeper, purple robe #7f45b8, gold trim, coin pouch, friendly posture. Flat fill regions like the hero.` |
| NPC-02 | Blacksmith | 16×16, idle 2 + hammer 2 | `Stocky bearded smith with hammer and anvil, leather apron.` |

---

## 8. ARMOR (paper doll — 8 material × 3 slot)

Sistem sekarang hanya me-recolor hero. Yang benar-benar menambah siluet adalah **overlay**. Warna material (mid / dark / light):

```
cloth    #9b96b8 #514c72 #d8d5e8      bone     #d8d5e8 #6f6a90 #ffffff
leaf     #5cbf62 #1b4436 #a3e86b      iron     #6f6a90 #2a2740 #9b96b8
leather  #8a6340 #2e2018 #b98d5c      gold     #f2c14e #8a7440 #fff0a8
crystal  #4fb3e0 #16324f #a8e4ff      obsidian #7f45b8 #1c1a2b #c86ee0
```

| ID | Asset | Ukuran | Catatan |
|---|---|---|---|
| ARM-01..08 | Helm overlay per material | 10×6 | `Helmet overlay that sits over the hero head, {material} colors, distinct silhouette: cloth hood, leaf circlet, leather cap, bone horned skull-helm, iron great-helm, gold crowned helm, crystal shard tiara, obsidian spiked helm. Transparent, aligned to a 16x16 hero head at rows 2-7.` |
| ARM-09..16 | Chest overlay per material | 12×8 | `Torso armor overlay: pauldrons plus chestplate, {material} colors, aligned to hero rows 6-13.` |
| ARM-17..24 | Legs overlay per material | 10×6 | `Greaves and boots overlay, {material} colors, aligned to hero rows 12-16.` |
| ARM-25 | Inventory icons | 16×16 ×24 | Ikon UI untuk tiap kombinasi slot × material. |

---

## 9. SENJATA (6 tipe × 5 rarity)

Rarity skin: common `#9b96b8` · uncommon `#5cbf62` · rare `#4fb3e0` · epic `#c86ee0` · legendary `#f2c14e` + `#e8743b`. **Cukup gambar versi common** — rarity lain hasil recolor + glow oleh kode.

| ID | Asset | Ukuran | Prompt |
|---|---|---|---|
| WPN-01 | Sword | 16×16 | `Straight knightly longsword at 45 degrees, crossguard, wrapped grip, pommel gem.` |
| WPN-02 | Dagger | 16×16 | `Short curved dagger, diagonal, small quillons.` |
| WPN-03 | Greataxe | 16×16 | `Massive double-headed battle axe, thick haft.` |
| WPN-04 | Bow | 16×16 | `Recurve wooden bow with a taut string, vertical.` |
| WPN-05 | Staff | 16×16 | `Gnarled wizard staff topped with a glowing orb.` |
| WPN-06 | Spear | 16×16 | `Long spear with a leaf-shaped steel head and a ribbon.` |
| WPN-07 | Slash arc FX | 24×16, 3 frame | `Crescent slash trail, bright thin core fading to a transparent tail.` |
| WPN-08 | Arrow | 8×3 | `Small arrow flying right, fletching, iron tip.` |
| WPN-09 | Thrust FX | 20×8, 3 frame | `Straight forward stab streak.` |

---

## 10. PROYEKTIL, ORB & ELEMEN

Elemen: fire `#e8743b` · ice `#4fb3e0` · lightning `#f2c14e` · poison `#5cbf62` · water `#2f6fa8` · earth `#b98d5c` · leaf `#a3e86b` · dark `#7f45b8`.

| ID | Asset | Ukuran | Prompt |
|---|---|---|---|
| FX-01 | Element orb ×8 | 8×8, 4 frame loop | `Glowing magic orb projectile, bright white core, colored corona, tiny trailing sparks, {element} color.` |
| FX-02 | Impact burst ×8 | 16×16, 4 frame | `Radial impact burst, expanding ring of shards and sparks, {element} color.` |
| FX-03 | Fire pool | 24×10, 4 frame | `Ground fire patch loop, low licking flames.` |
| FX-04 | Poison cloud | 32×20, 4 frame | `Drifting green gas cloud, soft dithered edge.` |
| FX-05 | Water puddle | 24×6, 2 frame | `Shallow water pool with a ripple.` |
| FX-06 | Ice patch | 24×6, 2 frame | `Frozen slick floor with frost crystals.` |
| FX-07 | Steam cloud | 32×20, 4 frame | `White-grey steam plume, blinding.` |
| FX-08 | Lightning bolt | 8×48, 3 frame | `Vertical jagged lightning strike.` |
| FX-09 | Explosion | 32×32, 6 frame | `Bomber death explosion, fireball collapsing into smoke.` |

---

## 11. PICKUP & ITEM DUNIA

| ID | Asset | Ukuran | Frame | Prompt |
|---|---|---|---|---|
| PCK-01 | Coin | 6×6 | 4 spin | `Spinning gold coin, four rotation frames, #f2c14e #fff0a8 #8a7440.` |
| PCK-02 | Heart | 8×8 | 2 pulse | `Red pixel heart with a white glint, gentle pulse.` |
| PCK-03 | Shard | 8×8 | 4 shimmer | `Cyan crystal shard, faceted, shimmering.` |
| PCK-04 | Key | 8×8 | 2 bob | `Ornate golden dungeon key with a skull bow.` |
| PCK-05 | Mana potion | 8×10 | 2 | `Blue potion flask, cork, bubbling.` |
| PCK-06 | Health potion | 8×10 | 2 | `Red potion flask, cork, bubbling.` |
| PCK-07 | Drop glow | 16×16 | 4 | `Soft rising light beam and sparkles under a dropped item, rarity-colored.` |

---

## 12. PARTIKEL & DECAL

| ID | Asset | Ukuran | Prompt |
|---|---|---|---|
| PAR-01 | Dust puff | 8×8, 4 frame | `Small landing dust puff that expands and fades.` |
| PAR-02 | Blood splatter | 12×12, 4 frame | `Gore burst, chunky pixels, per-enemy color.` |
| PAR-03 | Ambient mote | 3×3, 3 frame | `Single floating dust mote, per-biome tint.` |
| PAR-04 | Spark | 3×3, 3 frame | `Bright hit spark.` |
| PAR-05 | Ground crack decal | 16×6 | `Cracked stone impact decal.` |
| PAR-06 | Shockwave ring | 32×8, 4 frame | `Expanding ground shockwave ring for the boss slam.` |
| PAR-07 | Level-up burst | 24×24, 6 frame | `Golden radial burst with rising sparkles.` |

---

## 13. UI (pixelated, minimalis — sesuai arah desain sekarang)

| ID | Asset | Ukuran | Prompt |
|---|---|---|---|
| UI-01 | Key cap | 14×14, 2 state | `Minimal pixel keyboard keycap with an empty face for a letter, 1px light top bevel and dark bottom bevel, palette #1c1a2b #514c72 #9b96b8. Idle and pressed (shifted 1px down, darker).` |
| UI-02 | Key cap wide | 28×14 | Untuk SHIFT / SPACE. |
| UI-03 | Health bar frame | 64×8 | `Pixel HP bar frame, notched segments, iron and bone styling.` |
| UI-04 | Mana bar frame | 64×6 | Sama, biru. |
| UI-05 | Skill slot frame | 20×20 | `Empty square skill slot, beveled inner shadow, corner rivets, works with a cooldown sweep overlay.` |
| UI-06 | Weapon display panel | 48×32 | `Small pixel plaque frame for the bottom-left weapon display, thin ornate border.` |
| UI-07 | Boon icons ×14 | 16×16 | bloodthirst, ironhide, featherweight, sharpshooter, overflow, conduit, golden touch, berserker, momentum, blood harvest, fleetfoot, ricochet, vigil, ruin. `Single-symbol pixel icon, monochrome plus one accent color {color}, readable at 16px.` |
| UI-08 | Element affix icons ×8 | 12×12 | Simbol kecil per elemen. |
| UI-09 | Rarity gem ×5 | 6×6 | `Tiny faceted gem in the rarity color for item list rows.` |
| UI-10 | Cursor | 8×8 | `Pixel arrow cursor plus a hand variant.` |
| UI-11 | Minimap tiles ×5 | 4×4 | `Room, corridor, boss, shop, current-position marker.` |
| UI-12 | Title logo | 240×64 | `Pixel wordmark logo reading DUNGEON SCROLLING, carved stone letters with gold edge light, cracked, dungeon fantasy.` |
| UI-13 | Depth banner | 128×16 | `Ornate pixel plaque for the floor-name banner.` |

---

## RINGKASAN

| Kategori | Jumlah asset unik |
|---|---|
| Background parallax | 18 (6 biome × 3 layer) |
| Hero | 8 sheet |
| Musuh biasa | 11 × 4 sheet = 44 |
| Boss | 3 |
| Tile | 13 (+ varian biome opsional) |
| Obor & props | 9 |
| Chest & interaksi | 5 |
| NPC | 2 |
| Armor overlay | 24 (+24 ikon) |
| Senjata | 9 |
| FX elemen | 9 grup (~30 file) |
| Pickup | 7 |
| Partikel | 7 |
| UI | 13 grup (~50 file) |
| **Total** | **~250 file PNG** |

**Urutan pengerjaan disarankan:** BG (1) → Obor & props (5) → Hero (2) → Tile (4) → Musuh (3) → Chest & pickup (6, 11) → Senjata & FX (9, 10) → UI (13) → Armor (8).
