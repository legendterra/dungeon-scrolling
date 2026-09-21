# Art generators

Sprite di game ini dibangun dari baris ASCII di dalam `src/art/` dan
`src/entities/`. Script di sini yang **menghasilkan** baris-baris itu, lalu
menulisnya balik ke file JS-nya.

Kenapa lewat generator, bukan diketik tangan:

- Bentuk bulat (slime, spider, boss) hampir selalu jadi peyot kalau diketik.
- Tile bata 32x32 harus seamless di keempat sisi — dihitung modulo ukuran tile.
- Lebar baris yang meleset satu karakter diam-diam mengubah **footprint logis**
  sprite, dan itu menggeser collision box. Tiap script memvalidasi lebar dan
  jumlah baris sebelum menulis.

| Script | Menulis ke | Isi |
|---|---|---|
| `chibi.py` | (data) | Baris hero + 4 musuh dasar, dipakai `apply_chibi.py` |
| `apply_chibi.py` | `src/art/sprites.js` | Hero 8 pose, slime, zombie, bat, skeleton, crown |
| `tiles.py` | `src/art/sprites.js` | Wall, floor, platform, spike (seamless) |
| `props.py` | `src/art/sprites.js` | Obor (body + 4 frame api), death spike |
| `props2.py` | `src/art/sprites.js`, `src/world/bonus.js` | Chest, shrine, enchant table, ikon armor, slash FX, gold slime |
| `weapons.py` | `src/art/sprites.js` | 6 ikon senjata |
| `pickups.py` | `src/art/sprites.js` | Coin, heart, shard, key, arrow, orb |
| `enemies2.py` | `src/entities/enemies2.js` | 9 musuh lanjutan + golem pound |
| `king.py` | `src/art/king.js` | Slime King, 6 pose |
| `faces.py` | `src/art/faces.js` | 5 overlay ekspresi hero |
| `fx.py` | `src/art/fxart.js` | 8 bentuk partikel elemen |
| `font.py` | `src/art/base.js` | Font prosa 5x7 didobel jadi 10x14 (Scale2x) |

Jalankan dari folder ini:

```bash
python apply_chibi.py && python tiles.py && python props.py && python props2.py && python weapons.py && python pickups.py && python enemies2.py && python king.py && python faces.py && python fx.py && python font.py
```

Semua script idempotent — aman dijalankan ulang.

## Aturan detail

Tiap sprite diauthor pada grid **2x**: `makeSprite(rows, pal, 2)` menandai canvas
dengan `uw`/`uh` = ukuran **logis**, dan renderer selalu blit ke `uw`/`uh`.
Artinya art 2x mengisi kotak logis yang sama dengan art 1x lama, jadi collision
box, spawn spacing, dan tuning parkur tidak tersentuh. Jangan ubah lebar/tinggi
grid tanpa mengubah `detail` bersamaan.

## Ekspresi

Hero pakai **overlay**, bukan salinan tiap pose per mood: paper doll me-rebake
seluruh badan tiap ganti armor, jadi pose x mood bakal melipatgandakan cache
tanpa untung visual. Overlay-nya menutup art baris 8..15 kepala — pita di mana
lebar wajah bagian dalam konstan 14 kolom — jadi rambut dan outline tidak
pernah tersentuh. Warna kulit tidak di-remap paper doll, makanya satu overlay
benar untuk semua set armor.

Musuh pakai cara berbeda: **frame ke-2 tiap pack adalah wajah kesakitan**.
Hanya pita wajah yang berbeda dari pose diam, sehingga siluet, pivot, dan
baseline dijamin identik. Frame itu ditahan setelah kilat putih benturan
selesai — selama kilat, badan jadi siluet solid, jadi ekspresi yang digambar
di situ tidak akan pernah terlihat.

## Partikel elemen

`fx.py` menghasilkan 8 bentuk (flame, shard, bubble, droplet, rock, leaf, bolt,
spark) yang di-tint per elemen. Sebelumnya semua efek adalah kotak yang sama
dengan warna berbeda, jadi api, racun, dan tanah tidak bisa dibedakan begitu
bergerak. Sekarang tiap elemen punya bentuk **dan** gerak yang cocok: api naik
dan mengecil, pecahan es menggantung, gelembung racun berkelok naik, batu jatuh
berat sambil berputar, daun melayang.

## Font

`font.py` mendobel font prosa 5x7 jadi 10x14 pakai Scale2x (EPX), lalu renderer
menggambarnya dengan langkah **setengah unit logis**. Hasilnya tiap glyph tetap
menempati sel 5x7 logis yang sama, jadi `textWidth()` dan seluruh layout yang
dibangun di atasnya **tidak bergeser sedikit pun** — sementara diagonal di
A M N S W V K Z berhenti terlihat seperti tangga.

Font mikro 3x5 untuk key cap **sengaja tidak didobel**. Hurufnya cuma tiga
pixel, jadi M, N, V, dan W adalah diagonal satu-pixel yang dibulatkan EPX jadi
gumpalan tak terbaca — "SHIFT" sempat terbaca "SHIFY". Di key cap, keterbacaan
menang atas ketajaman.
