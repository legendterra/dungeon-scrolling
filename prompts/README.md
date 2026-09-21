# Prompt Pack — Dungeon Scrolling

Semua prompt di folder ini sudah **full-expanded**: prefix wajib, ukuran output, klausa sprite-sheet, dan palette sudah nempel di tiap blok. Tinggal copy satu blok `text`, paste ke Claude chat, satu blok = satu file PNG.

> **Resolusi target: 640x360 internal, tile 32x32, hero 32x32.**
> Naik 2x dari spec lama (320x180 / tile 16). Semua ukuran di sini sudah versi baru.
> Kode belum dimigrasi — lihat "Migrasi kode" di bawah.

Sumber kebenaran spesifikasi tetap [`../ASSETS.md`](../ASSETS.md) dan [`../SPRITE_PLAN.md`](../SPRITE_PLAN.md). Kalau ubah ukuran/frame di sini, update juga di sana + `src/art/sprites.js`.

## Urutan pengerjaan disarankan

| # | File | Isi | Jumlah prompt |
|---|---|---|---:|
| 1 | [01_BACKGROUND.md](01_BACKGROUND.md) | Parallax 6 biome x 3 layer | 18 |
| 2 | [06_PROPS.md](06_PROPS.md) | Obor, brazier, chain, banner, enchant table | 13 |
| 3 | [02_HERO.md](02_HERO.md) | 8 sheet hero (paper-doll safe) | 8 |
| 4 | [05_TILES.md](05_TILES.md) | Tile master + door + puzzle | 13 |
| 5 | [03_ENEMIES.md](03_ENEMIES.md) | 11 musuh x 4 sheet | 44 |
| 6 | [04_BOSS.md](04_BOSS.md) | Slime King, crown, telegraph | 3 |
| 7 | [07_CHEST_NPC.md](07_CHEST_NPC.md) | Chest, mimic, shop, merchant, smith | 8 |
| 8 | [11_PICKUP.md](11_PICKUP.md) | Coin, heart, shard, key, potion | 7 |
| 9 | [09_WEAPONS.md](09_WEAPONS.md) | 6 senjata common + slash/thrust FX | 9 |
| 10 | [10_FX.md](10_FX.md) | Orb & burst 8 elemen + hazard | 23 |
| 11 | [12_PARTICLES.md](12_PARTICLES.md) | Dust, blood, spark, shockwave | 7 |
| 12 | [13_UI.md](13_UI.md) | Keycap, bar, boon/elem/rarity icon, logo | 37 |
| 13 | [08_ARMOR.md](08_ARMOR.md) | 24 overlay + 24 ikon inventory | 25 |

**Total: 215 blok prompt** (belum termasuk 24 ikon armor yang satu blok dipakai berulang).

## Cara pakai: generate besar, lalu downscale

AI image gen gak bisa akurat di grid kecil. Jangan minta langsung 32x32 — minta versi besar, lalu snap turun:

1. Copy blok prompt, **tambahkan di akhir**: `Render this at 16x scale (output {W*16}x{H*16} px) with every art pixel drawn as a perfectly square 16x16 block, so it downsamples cleanly to {W}x{H}.`
2. Simpan hasilnya ke `assets/raw/`.
3. Snap ke ukuran final + kunci palette:

```bash
pip install pillow
python prompts/downscale.py assets/raw/hero_idle.png 64 32 assets/final/hero_idle.png
```

`downscale.py` pakai nearest-neighbour, quantise tiap pixel ke palette resmi, dan hard-cut alpha — jadi gak ada sisa anti-aliasing atau warna liar. Buat batch, bikin `assets/raw/sizes.txt` isi `nama.png <w> <h>` per baris lalu:

```bash
python prompts/downscale.py --all assets/raw assets/final
```

## Status: art sekarang digambar KODE, bukan PNG

Migrasi resolusi **sudah selesai** dan seluruh roster **sudah digambar ulang chibi
di dalam kode**, jadi prompt pack ini tidak sedang dipakai game.

Yang sudah dikerjakan:

- `src/core/rng.js` — `C.RS = 2`: canvas 640x360, logika tetap 320x180.
- `src/art/base.js` — `makeSprite(rows, pal, detail)`; tiap canvas membawa
  `uw`/`uh` (ukuran logis), jadi art 1x dan 2x bisa hidup berdampingan.
- `src/core/renderer.js` — semua blit memakai `uw`/`uh`, jadi sprite 2x mengisi
  kotak logis yang sama persis.
- Digambar ulang chibi @2x: hero (8 pose), 4 musuh dasar, 9 musuh lanjutan,
  Slime King (6 pose), tile + pintu, obor, senjata, pickup, chest, shrine,
  enchant table, ikon armor, slash FX, gold slime.

Prompt di folder ini tetap valid **kalau nanti mau mengganti art kode dengan PNG
hasil generate**. Itu butuh loader yang belum ada — sekarang sprite dibangun dari
baris ASCII, bukan dimuat dari file.

## Yang TIDAK perlu digambar

- Varian Elite (tint oranye) dan Miniboss (tint darah, 2x) — dihasilkan kode.
- Rarity senjata selain common — recolor + glow oleh kode.
- Tile per-biome — kode me-recolor set master.
- Alpha fringe / warna di luar palette — dibereskan `downscale.py`.
- Blood splatter, ambient mote, drop glow — gambar putih saja, di-tint runtime.

## Checklist validasi tiap asset masuk

- [ ] Ukuran PNG persis sesuai judul blok.
- [ ] Background transparan (kecuali layer SKY).
- [ ] Tidak ada anti-aliasing / gradient / drop shadow.
- [ ] Warna hanya dari palette resmi.
- [ ] Semua frame: pivot dan baseline kaki sama, tidak bergeser/berubah ukuran.
- [ ] Hadap kanan (musuh & hero).
- [ ] Terbaca jelas di resolusi internal 320x180.

## Regenerate

File `_gen.py` + `_data_*.py` adalah generator. Ubah data lalu:

```bash
cd prompts && python _data_bg.py && python _data_hero.py && python _data_enm.py && python _data_boss_tile.py && python _data_props.py && python _data_arm_wpn.py && python _data_fx_ui.py && python _data_ui.py
```
