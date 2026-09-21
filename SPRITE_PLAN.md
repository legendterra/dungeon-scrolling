# Sprite Production Plan — Dungeon Scrolling

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

## Tujuan

Mengganti seluruh placeholder monster dan boss dengan roster sprite pixel-art yang konsisten, ringan, dan bisa dianimasikan di game scrolling 320×180 px.

## Status saat ini

- [x] Concept roster monster sudah digenerate sebagai acuan desain bersama.
- [x] Prototype sprite sheet Slime King sudah dibuat sebagai contoh format animasi.
- [ ] Semua concept belum menjadi asset final game.
- [x] Slime King sudah diintegrasikan ke kode; monster lain belum.

## Aturan visual

- Strict 1:1 pixel grid; no anti-aliasing, blur, atau gradient.
- Outline utama: `#0d0b14`.
- Menggunakan palette resmi dari `ASSETS.md`.
- Hadap kanan; sistem kode melakukan mirror untuk arah kiri.
- Pivot, baseline kaki, skala, dan proporsi harus konsisten antar-frame.
- Efek serangan dibuat sebagai pixel FX terpisah jika memungkinkan.
- Asset final transparan PNG.

## Prompt kanonik Slime King

Prompt ini menjadi sumber integrasi tunggal untuk sprite sheet Slime King. Jangan mengubah ukuran sheet, urutan frame, palette, pivot, atau baseline tanpa memperbarui kode dan manifest secara bersamaan.

```text
Pixel art sprite sheet, strict 1:1 pixel grid, no anti-aliasing, no blur,
no gradients, hard-edged pixels only, transparent PNG, crisp #0d0b14 outline.
Output EXACTLY 384x48 pixels: 6 frames in one row, each frame EXACTLY 64x48 px,
identical pivot and baseline across frames, no gap between frames.
Subject: a royal purple slime king, squat dome body, glossy bubbles on the left
side, angry red eyes, gold 3-point crown on top.
Frames in order: idle, idle-squash, rear-up-with-open-maw, slam-flattened,
hurt-recoil, death-collapsed-puddle-with-crown-sliding-off.
Palette ONLY: #0d0b14 #3c2154 #7f45b8 #c86ee0 #ffffff #f2c14e #fff0a8 #c0303c
Design for a 320x180 game screen: the silhouette must read clearly at 100% zoom.
```

Catatan: sheet final Slime King menggunakan 6 frame × 64×48 px = 384×48 px. Ini menggantikan ukuran prototype sebelumnya dan harus menjadi acuan untuk slicing serta integrasi renderer.

## Ukuran final

| Asset | Ukuran per frame | Frame |
|---|---:|---:|
| Monster normal | mengikuti manifest `ASSETS.md` | idle, move, attack/windup, death |
| Slime King final | 64×48 px | idle, idle-squash, rear-up/open-maw, slam-flattened, hurt-recoil, death-puddle |
| Crown | 12×6 px | 1 |

## Urutan pengerjaan

### Fase 1 — Kunci art direction seluruh roster

- [x] Buat concept sheet seluruh roster sebagai referensi visual.
- [ ] Tetapkan bentuk, warna, outline, dan efek khas setiap monster.
- [ ] Pastikan semua monster terlihat berasal dari game yang sama.
- [ ] Pastikan silhouette tetap terbaca saat diperkecil ke ukuran sprite.

Roster yang harus dibuat:

1. Slime
2. Bat
3. Spitter
4. Spider
5. Bomber
6. Shielder
7. Wraith
8. Necromancer
9. Golem
10. Slime King boss

### Fase 2 — Produksi animation sheet seluruh roster

Setiap monster dibuat satu per satu, tetapi target akhirnya adalah seluruh roster, bukan Slime King saja.

Untuk setiap monster normal:

- [ ] Finalisasi silhouette dari concept roster.
- [ ] Generate idle sheet 2 frame.
- [ ] Generate move/flying sheet 2–4 frame.
- [ ] Generate attack/wind-up sheet 2 frame.
- [ ] Generate death sheet 3 frame.
- [ ] Validasi grid, baseline, pivot, transparansi, dan palette.
- [ ] Integrasikan ke `src/art/sprites.js`.
- [ ] Uji collision box, mirror, elite tint, dan mini-boss scale.

Untuk Slime King:

- [x] Generate prototype sheet 6 pose sebagai uji awal.
- [ ] Generate ulang versi final 384×48 px menggunakan prompt kanonik di atas.
- [x] Slice menjadi 6 frame berukuran 64×48 px tanpa gap.
- [x] Buat/rapikan idle, slam, hurt, dan death.
- [ ] Pisahkan crown 12×6 px (tidak dipakai boss: crown sudah menyatu di sheet).
- [x] Integrasikan ke `src/art/sprites.js` sebagai `DS.SPR.boss` / `DS.SPR.bossPose` (rows di `src/art/king.js`).
- [x] Uji boss pada resolusi game (320×180, preview `assets/slime_king_ingame_preview.png`).

### Fase 3 — Efek dan polish

- [ ] Shockwave Slam King.
- [ ] Aura/partikel summon ungu.
- [ ] Poison projectile dan poison cloud.
- [ ] Bomber explosion.
- [ ] Golem impact crack dan dust.
- [ ] Wraith trail.
- [ ] Necromancer summon ring.
- [ ] Uji keterbacaan efek pada background setiap biome.

## Workflow seluruh roster

1. Gunakan concept roster sebagai acuan bersama.
2. Pilih satu monster dari urutan produksi.
3. Generate seluruh animation set monster tersebut.
4. Inspeksi konsistensi bentuk, pivot, baseline, dan pixel structure.
5. Simpan concept dan asset final dengan nama berbeda.
6. Integrasikan setelah dimensinya benar.
7. Uji di game pada ukuran 1× dan 2×.
8. Setelah lolos, lanjut ke monster berikutnya.

## File kerja

- Concept roster: hasil generate pertama, tersimpan di riwayat Codex.
- Prototype Slime King: `assets/boss_slime_king_sheet_concept.png`
- Manifest spesifikasi: `ASSETS.md`
- Sprite registry: `src/art/sprites.js`
- Boss renderer: `src/entities/boss.js`

## Kriteria selesai

- Tidak ada frame yang mengubah bentuk karakter secara tidak sengaja.
- Semua frame memiliki baseline dan pivot yang stabil.
- Sprite tetap terbaca pada resolusi internal 320×180.
- Tidak ada background hitam/putih atau artefak transparansi.
- Animasi tidak menyebabkan karakter melompat, bergeser, atau berubah ukuran.
- Asset baru tidak merusak sprite lama, elite tint, mirror, atau collision.
