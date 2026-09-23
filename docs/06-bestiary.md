# Bab 6 - Bestiary dan Boss

Monster dibagi dua file: `entities/enemies.js` (empat monster dasar + rank +
tabel spawn) dan `entities/enemies2.js` (tujuh monster lantai dalam). Satu monster
lagi, piranha, mendaftarkan dirinya dari `world/water.js`. Boss ada di tiga file:
`entities/boss.js` (Slime King), `entities/bosses.js` (Stone Warden, Arbiter).

## 6.1 Model pertarungan monster

`[CODE]` `entities/enemies.js:1` - damage sentuh bukan lagi ancaman utama. Setiap
monster berkomitmen pada serangan yang bisa dibaca, dalam tiga fase:

| Fase | Arti | Isyarat visual |
|---|---|---|
| `wind` | Persiapan serangan | Kilatan warna, garis bidik, badan mengempis |
| `strike` | Frame yang benar-benar melukai | Musuh bergerak/menyerang |
| `recover` | Jendela hukuman | Musuh terbuka, tidak bisa menyerang |

Hanya badan slime (saat melompat) dan bat (saat menukik) yang masih melukai karena
sentuhan - dan keduanya bergerak dengan cara yang terbaca saat itu.

## 6.2 Empat monster dasar

`[CODE]` `entities/enemies.js:22`

| Monster | w x h | HP | Sentuh | Kecepatan | Jarak lihat | Armor | wind/strike/recover | Jangkauan | Damage |
|---|---|---|---|---|---|---|---|---|---|
| Slime | 12 x 9 | 9 | 1 | 0.55 | 110 | 0 | 26 / 30 / 34 | 60 | 1 |
| Zombie | 9 x 14 | 20 | 0 | 0.42 | 160 | 1 | 30 / 10 / 30 | 22 | 2 |
| Bat | 10 x 8 | 5 | 0 | 1.15 | 150 | 0 | 26 / 26 / 40 | 70 | 1 |
| Skeleton | 9 x 14 | 11 | 0 | 0.5 | 200 | 0 | 32 / 6 / 46 | 190 | 1 |

Catatan: **bat terbang** (`flying: true`), **skeleton jarak jauh**
(`ranged: true`, jangkauan 190 px - ia menembak, dan proyektilnya terlihat oleh
pemain), zombie dan skeleton punya kotak pukul yang lebih lebar daripada badannya
(`hitbox` 20x14 dan 30x18) supaya tebasan terasa adil.

## 6.3 Tujuh monster lantai dalam

`[CODE]` `entities/enemies2.js:870-925`

| Monster | w x h | HP | Kecepatan | Lihat | Armor | wind/strike/recover | Range | Damage | Kunci perilaku | Muncul dari |
|---|---|---|---|---|---|---|---|---|---|---|
| Spitter | 12 x 12 | 14 | 0 (tertanam) | 190 | 0 | 34 / 8 / 44 | 180 | 1 | Menembak dari tempat, tidak bisa didekati | depth 2 |
| Spider | 12 x 10 | 8 | 1.3 | 150 | 0 | 20 / 22 / 30 | 56 | 1 | Menggantung di langit-langit, menukik | depth 3 |
| Bomber | 12 x 12 | 10 | 0.9 | 170 | 0 | 46 / 4 / 10 | 40 | 2 | Meledak sendiri (tidak bisa dibunuh dengan aman) | depth 3 |
| Shielder | 11 x 16 | 26 | 0.4 | 170 | 2 | 28 / 10 / 34 | 24 | 2 | Menahan sisi depan (`blocksFront`), harus dipukul dari belakang | depth 4 |
| Wraith | 12 x 14 | 18 | 0.55 | **260** | 1 | 24 / 30 / 40 | 44 | 2 | Menembus dinding (`ghost`) dan terbang | depth 5 |
| Necromancer | 10 x 16 | 22 | 0.5 | 220 | 1 | 40 / 6 / 90 | 200 | 1 | Membangkitkan tulang; recover sangat lama (90) | depth 6 |
| Golem | 16 x 18 | **60** | 0.3 | 200 | 4 | 44 / 12 / 50 | 42 | 3 | Berat, armor tebal, pukulan menghancurkan | depth 7 |

## 6.4 Piranha (monster air)

`[CODE]` `world/water.js:357`

| Stat | Nilai |
|---|---|
| Ukuran | 12 x 8 |
| HP | 10 |
| Kecepatan | 1.0 |
| Jarak lihat | 150 |
| wind/strike/recover | 22 / 24 / 34 |
| Damage | 1 |
| Sifat | `flying`, `aquatic`, **`noSpawn`** (tidak pernah di-roll tabel spawn) |

Piranha tidak muncul dari tabel spawn; ia **ditempatkan** oleh `Water.stock()` ke
titik `swimSpots` yang sudah dihitung generator air, dengan jumlah
`clamp(2 + floor(depth/2), 2, jumlah titik)`. Ini perbedaan penting: monster air
harus berada di air, bukan di marker tanah.

## 6.5 Empat rank musuh

`[CODE]` `entities/enemies.js:47`

| Rank | HP | Sentuh | Kecepatan | Armor | Ukuran | wind | Damage | Catatan |
|---|---|---|---|---|---|---|---|---|
| `normal` | 1x | 0 | 1x | +0 | 1x | 1x | +0 | - |
| `elite` | 2.5x | 1 | 1.15x | +1 | 1x | 0.8x (lebih cepat) | +1 | Warna elite khusus |
| `miniboss` | 6.5x | 1 | 0.95x | +2 | **2x** | 0.72x | +1 | Dianggap berat |
| `colossal` | 14x | 1 | 0.7x | +3 | **3x** | 0.62x | +2 | `footBox: 0.42` - kotak tabrakan hanya sepertiga bawah sprite |

Rancangan "colossal" patut dicatat: sprite tiga kali lipat tapi badan yang bisa
dipukul hanya kaki (42% tinggi). Pemain bertarung melawan kakinya seperti melawan
naga; berjalan ke siluet kepalanya tidak menghabiskan hati.

Bobot rank per kedalaman dihitung `systems/difficulty.js` (`rankWeights`): lantai
1-2 hanya `normal`; `elite` mulai naik dari lantai 3; `miniboss` dari lantai 6;
`colossal` dari lantai 8.

## 6.6 Tabel spawn dan ekornya

`[CODE]` `entities/enemies.js:60`

| Monster | Bobot |
|---|---|
| Slime | `max(4, 40 - depth*6)` |
| Zombie | `depth >= 2 ? max(8, 26 - depth*2) : 12` |
| Bat | `depth >= 2 ? max(8, 22 - depth) : 14` |
| Skeleton | `depth >= 3 ? 24 : 8` |
| Monster `minDepth` | `8 + (depth - minDepth) * 5` - masuk perlahan, bukan membanjiri lantai tempat ia dibuka |

Slime makin jarang seiring kedalaman supaya lantai 8 tidak tetap didominasi slime,
sementara monster baru bertambah perlahan.

## 6.7 Penempatan: monster tidak boleh lahir di dalam tanah

`[CODE]` `entities/enemies.js:81` + `settleSpawn()`

Alur pembuatan musuh: hitung `drawW/drawH` dari `cfg` dikali rank, hitung kotak
tabrakan (`footBox` untuk colossal), buat entitas di `y + (16 - h)`, lalu
**`settleSpawn(g, e)`** menurunkannya ke permukaan lantai yang nyata sebelum
diserahkan. Modifier `HONOR GUARD` bisa menaikkan `normal` menjadi `elite` tepat
di titik ini.

## 6.8 Boss

### Slime King (lantai 10, `entities/boss.js` + `art/king.js`)

| Hal | Nilai |
|---|---|
| Nama di layar | `SLIME KING` |
| HP | `1403` pada depth 10 `[RUNTIME]` |
| Rumus HP | HP dasar x `hpMult` depth (lihat Bab 7.3) |
| Sprite | Sheet 6 frame animasi (618 baris art di `art/king.js`) |
| Bagian | Fase pertarungan dengan lompatan dan spawn anak slime |

Rantai kemenangan (sudah diuji `[RUNTIME]`):

1. King mati → `g.won = true`, toast **THE KING FALLS**, musik berubah ke `calm`.
2. Gerbang keluar terbuka - `doorOpen()` untuk lantai boss mengembalikan `g.won`,
   prompt pintu menjadi `{ key: 'F', text: 'DESCEND' }`.
3. Tekan F → `g.finished = true`, scene berpindah ke `DS.Scenes.gameOver(g, true)`.
4. Layar akhir: `THE DUNGEON IS CLEARED`, dengan `DEPTH REACHED`, `ENEMIES SLAIN`,
   `COINS`, `TIME`, `BEST WEAPON`, dan badge `NEW RECORD` bila rekor terlewati.
5. Rekor disimpan sekali: `Storage.recordRun` menulis `runs`, `totalKills`,
   `bestDepth`, `bestItemName/Rarity`, dan `fastestClearFrames` (hanya terisi bila
   `cleared: true`).
6. Dua pilihan: `RUN AGAIN` (Enter, langsung ke loadout) atau `MENU` (Esc/P).

![The Throne, depth 10: Slime King dan gerbang turun](docs/img/floor-throne.png)

### Boss tengah-run

| Boss | File | Muncul |
|---|---|---|
| **THE STONE WARDEN** | `entities/bosses.js:25` | Lantai gunung (`world/mountain.js` mengisi `spawns.boss`) |
| **THE ARBITER** | `entities/bosses.js:33` | Lantai trial (`world/trial.js`) |

Keduanya hadir sebagai `spawns.boss`, bukan sebagai musuh biasa; hanya
`mountain.js` dan `trial.js` yang mengisi field itu.

## 6.9 Aturan ambience saat lantai dalam

`[CODE]` `systems/modifiers.js` (`ambience`)

- Drip/whisper/heartbeat diputar pada interval yang menyusut seiring `horror`
  (dari 600 frame sampai 240 frame).
- Detak jantung saat `hp <= 2`: setiap 44 frame bila HP 1, setiap 64 frame bila HP 2,
  disertai `R.shake(0.6)`.
- Lantai dengan `horror > 0.7` tidak pernah benar-benar diam (`R.shake(0.35)` tiap
  6 frame).

Semuanya sengaja jarang: suara konstan berhenti jadi menakutkan.
