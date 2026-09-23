# Bab 7 - Dunia: Generator, Biome, Kesulitan, dan Teka-teki

## 7.1 Sepuluh lantai dengan geografinya sendiri

`[CODE]` `src/systems/difficulty.js:31` - bentuk lantai ditentukan **kedalaman**,
bukan dadu. Inilah tangganya:

| Depth | Kunci | Nama | Flavor | Tema visual | Spesial |
|---|---|---|---|---|---|
| 1 | `shore` | The Shore | plain | shore | Pantai; papan kontrol muncul di sini |
| 2 | `cave` | The Cave Mouth | carved | cave | Mulai ada parkour |
| 3 | `cave` | The Deep Cave | carved | cave | - |
| 4 | `puzzle` | The Torch Hall | plain | prison | **Lantai teka-teki** |
| 5 | `safe` | The Waystation | safe | vault | **Safe room** (toko, enchant, istirahat) |
| 6 | `swamp` | The Rot Swamp | flooded | swamp | Mulai ada genangan |
| 7 | `mountain` | The Climb | mountain | mountain | Panjat gunung + boss tengah |
| 8 | `flooded` | The Sunk Halls | flooded | flooded | Air dalam, piranha |
| 9 | `volcanic` | The Ash Reaches | carved | volcanic | - |
| 10 | `boss` | The Throne | boss | throne | **Slime King** |

`kindForDepth(depth)` mengembalikan `'boss'` untuk depth >= `FINAL_DEPTH` (10),
dan `SAFE_BEFORE = [5, 10]` berarti sebelum depth 5 dan 10 pemain selalu melewati
lantai aman. Jadi urutan nyata satu run: `1 2 3 4 [SAFE] 5 6 7 8 9 [SAFE] 10=BOSS`.

> **Keputusan desain yang tercatat di kode.** Dulu flavor lantai di-roll acak,
> sehingga bisa muncul lantai lava di depth 2 dan pantai di depth 9. Sekarang satu
> tangga tetap, supaya dungeon terasa sebagai **tempat** dengan geografi: mulai di
> pesisir, masuk gua, gua membuka ke rawa, rawa menanjak jadi gunung, gunung
> mengalir ke aula tergenang, dan pintu terakhir vulkanik.

## 7.2 Sepuluh palet biome

`[CODE]` `src/art/biomes.js:18`. Satu depth, satu palet, jadi tile dan tema 3D
tidak bisa lagi berbeda pendapat.

| Key | Nama | Palet (D/d/g/G) | Langit (atas -> bawah) | Warna obor | darkness | lightRadius |
|---|---|---|---|---|---|---|
| `halls` | STONE HALLS | palet dasar | `#211b38` -> `#12101c` | `#f2c14e` | 0.58 | 76 |
| `caves` | DAMP CAVES | `#4a7068 #33524c #79b39d #aee0cd` | `#183430` -> `#0b1a17` | `#7de0be` | 0.66 | 72 |
| `prison` | RUSTED PRISON | `#6b5641 #4a3a2b #b8834f #e0b57e` | `#3a2a1c` -> `#17100a` | `#e8a05a` | 0.68 | 72 |
| `vault` | CRYSTAL VAULT | `#584d85 #3c3563 #9b8ae0 #cfc4ff` | `#2b2160` -> `#130e2e` | `#a89bff` | 0.66 | 74 |
| `nest` | THE NEST | `#6e4148 #4d2c31 #b8636f #e0949c` | `#3d191d` -> `#1b090b` | `#e8737f` | 0.70 | 70 |
| `throne` | THRONE OF SLIME | `#6b5c3c #4a3f28 #b89a55 #f0d78e` | `#3a2d14` -> `#171106` | `#f2c14e` | 0.62 | 78 |
| `shore` | THE SHORE | `#7a6a52 #5a4e3c #c8b48e #e8dcc0` | `#1c2b3a` -> `#0b141c` | `#ffe6a8` | 0.50 | 84 |
| `cave` | THE CAVE MOUTH | `#3f5a58 #2b403e #6a9490 #a8ccc6` | `#0a1a1c` -> `#050c0e` | `#7fe8d8` | 0.72 | 70 |
| `swamp` | THE ROT SWAMP | `#4a5638 #333d26 #7a8f4e #b8c97a` | `#0f1a0c` -> `#070d06` | `#b8e06a` | 0.70 | 68 |
| `mountain` | THE CLIMB | `#5a6070 #3e4450 #8a95a8 #ccd6e4` | `#131a26` -> `#080b12` | `#dceaff` | 0.60 | 76 |
| `flooded` | THE SUNK HALLS | `#3a5566 #263a48 #6a8fa8 #a8cde0` | `#081824` -> `#030c14` | `#8fd8ff` | 0.72 | 70 |
| `volcanic` | THE ASH REACHES | `#5a3228 #3a2018 #8f5040 #d08a6a` | `#1c0a06` -> `#0d0403` | `#ff8a4a` | 0.66 | 74 |

Palet tile sengaja dijaga **terang**: yang menciptakan suasana adalah lapisan
cahaya, bukan palet gelap. Menumpuk palet gelap di bawah pencahayaan gelap dulu
membuat layar menjadi lumpur cokelat. Palet taksonomi lain yang memakai satu palet
yang sudah ada: `puzzle` memakai `prison`, `safe` memakai `vault`, `boss` memakai
`throne`.

## 7.3 Kurva kesulitan: satu sumber angka

`[CODE]` `src/systems/difficulty.js:100` - lantai 1 dan 2 adalah lantai
**pengajaran** yang dipaku: musuh sedikit, tanpa hazard, tanpa elite, lantai
pendek, dan ada satu drop berguna yang dijamin. Pertumbuhan naik cepat lalu
melandai.

| Rumus | Nilai |
|---|---|
| `threat(d)` | `d^1.32` |
| `enemyCount` | tutorial: `2 + d`; sesudahnya `clamp(round(2 + 1.35*d^1.2), 4, 15)` |
| `hpMult` | `1 + 0.17*(d-1)^1.05` |
| `damageMult` | `1 + 0.11*(d-1)^0.9` |
| `speedMult` | `1 + 0.035*(d-1)` |
| `hazardChance` | tutorial 0; sesudahnya `clamp(0.09 + 0.075*(d-1)^1.15, 0, 0.85)` |
| `hazardCount` | tutorial 0; sesudahnya `round(1 + (d-2)*0.45)` |
| `spikeRunMax` | `1 + floor(d/3)` (tidak pernah lebih panjang dari dua lompatan) |
| `roomCount` | `clamp(6 + round(d*1.1), 6, 12)` |
| `climbSteps` | `3 + round(d*0.9)` |
| `climbSpan` | `6 + round(d*1.6)` |
| `pitChance` | tutorial 0.15; sesudahnya `clamp(0.3 + d*0.06, 0, 0.8)` |
| `plates` | tutorial 1; sesudahnya `clamp(2 + floor((d-2)/2.5), 2, 3)` |
| `crates` | tutorial 1; sesudahnya `clamp(2 + floor((d-2)/3), 2, 3)` |
| `torchSpacing` | `round(26 + d*1.6)` - semakin dalam, obor semakin jarang |
| `chestKeep` | `clamp(0.72 - d*0.012, 0.5, 0.72)` - peti makin jarang tapi makin bagus |
| `rarityBias` | `(d-1) * 0.42` |
| `shakeScale` | `1 + (d-1)*0.05` |

Hasil hitung untuk lantai kunci:

| Depth | Musuh | HP x | Damage x | Peluang hazard | Ruangan | Tangga nanjak | Jarak obor | Peti dipertahankan |
|---|---|---|---|---|---|---|---|---|
| 1 | 3 | 1.00 | 1.00 | 0 | 7 | 4 | 28 | 71% |
| 2 | 4 | 1.17 | 1.11 | 0 | 8 | 5 | 29 | 70% |
| 4 | 8 | 1.58 | 1.35 | 20% | 10 | 7 | 32 | 67% |
| 7 | 13 | 2.17 | 1.66 | 49% | 12 | 9 | 37 | 64% |
| 10 | 15 | 2.84 | 1.96 | 85% | 12 | 12 | 42 | 60% |

## 7.4 Tujuh modifier lantai

`[CODE]` `src/systems/modifiers.js:19`. Peluang muncul: `<4` tidak ada,
`4-6` 35%, `7-9` 60%, `10` 100%.

| Modifier | Warna | Efek | Deskripsi di layar |
|---|---|---|---|
| THICK BLOOD | `#c0303c` | `enemyHp: 1.8` | Segala sesuatu di sini lebih sulit dibunuh |
| FRENZY | `#e8743b` | `enemySpeed: 1.25`, `enemyWind: 0.78` | Mereka bergerak dan menyerang lebih cepat |
| HORDE | `#f2c14e` | `spawnMult: 1.5` | Jauh lebih banyak |
| HONOR GUARD | `#e8a05a` | `allElite: true` | Setiap penjaga adalah elite |
| BRITTLE | `#a8e4ff` | `extraDamage: 1` | Setiap luka mengiris lebih dalam |
| FAMINE | `#8a4550` | `noHearts: true` | Tidak ada yang meneteskan penyembuh |
| STARVED | `#b98d5c` | `noCoins: true`, `chestBonus: 2` | Tidak ada koin, tapi peti lebih kaya |

Modifier `DARKNESS` ("no torches burn here") **sudah dihapus** atas permintaan
pemain, dan alasannya tercatat di kode: karena hanya cahaya ruangan yang tersisa,
efeknya terbaca seperti layar mati, bukan seperti aturan lantai.

## 7.5 Kurva horror

`[CODE]` `src/systems/modifiers.js:139`

| Fungsi | Nilai |
|---|---|
| `horrorFor(d)` | `clamp((d-3)/7, 0, 1)` - nol sampai lantai 3, penuh di lantai 10 |
| Vignette | `max(vignette, 0.18 + horror*0.22)` |
| Grain | `max(grain, horror*0.16)` bila `horror > 0.45` |
| Ambience | Drip/whisper pada `round(600 - horror*360)` frame |

Angka vignette ini **sudah diturunkan** dari sebelumnya (`0.35 -> 0.80` menjadi
`0.18 -> 0.40`) karena langkah sebesar itu terbaca seperti layar yang menggelap
sendiri saat masuk lantai lebih dalam - separuh dari keluhan "tiba-tiba gelap".

## 7.6 Generator lantai

`[CODE]` `src/world/generator.js`

Urutan pembuatan satu lantai:

1. `pickFlavor(rng, depth)` membaca `Difficulty.biomeForDepth(depth).flavor`.
2. Flavor dibangun: `mountain` → `world/mountain.js`, `flooded` → `world/water.js`,
   `carved` → `world/parkour.js` + `buildCarved()`, sisanya jalur koridor `plain`.
3. Empat pass yang berjalan di **setiap** flavor, setelah flavor selesai:
   - `plantDoors()` - menempelkan pintu di posisi yang sudah disediakan.
   - `plantTorches()` + `scatterTorches(rng, out, depth)` - obor, dengan jarak dari
     `difficulty.torchSpacing`.
   - `supportPlatforms()` - menopang platform agar tidak ada yang mengambang.
   - `capSpikeRuns(map, maxRun)` - membatasi panjang deretan paku.
4. `ensureTraversable()` - memastikan ada jalan dari spawn ke pintu.
5. `reseatDoor(map, out)` - memindahkan pintu bila penempatan awalnya tidak masuk
   akal.
6. `closeTraps(map)` - menutup jebakan yang bisa membuat lantai tidak selesai.
7. `Reach.ensureExit()` (Bab 7.7) - jaring pengaman terakhir.
8. `hazards.generate()` dan `puzzle.generate()` menempelkan isi.

> **Aturan yang menjadi prinsip.** "Tidak ada yang mengambang" dijalankan sebagai
> pass global, bukan sebagai janji tiap flavor. Karena dungeon adalah domain
> bawah tanah, sesuatu yang melayang seperti di Mario bukan hanya jelek, ia
> merusak premis; yang benar adalah medan yang sulit, dorong peti untuk naik, dan
> tali.

## 7.7 Jaminan level bisa diselesaikan: `systems/reach.js`

`[CODE]` `src/systems/reach.js:1` - satu pemilik untuk satu pertanyaan: "dari
posisi berdiri ini, sel mana yang bisa kucapai?"

Jawabannya diturunkan dari konstanta yang sama dengan yang dipakai karakter
(`inv BASE` untuk kecepatan dan `jumpVel`, `DS.C` untuk gravitasi,
`entities/player.js` untuk lompat udara, badan 8x14, dan gesekan udara 0.14).
Dua aturan, dijalankan **sekali** setelah semua terrain final:

- Setiap tanjakan yang lebih tinggi dari lompatan bebas diberi **rungs** di
  sisinya (tangga yang bisa dipanjat pemain, di sisi pendekatan).
- Kolom pintu keluar harus terjangkau dari spawn. Kalau tidak: sebuah step
  diletakkan di batas jangkauan, lalu lorong dipotong; kalau keduanya tidak muat,
  lantai tempat pemain berdiri **diperpanjang**.

Aturan ketiga itulah yang membuat ini jaminan, bukan tebakan: selalu bisa
dilakukan, sehingga loop perbaikan selalu maju dan tidak pernah meninggalkan level
yang tidak bisa diselesaikan.

> **Kenapa ini ada.** Sebelumnya setiap generator punya jaring pengaman sendiri,
> dan versi carved menilai level dengan model gerak yang ditulis tangan ("tiga
> petak mendatar, tiga baris ke atas, sekaligus") - lebih atletis daripada
> karakternya sendiri. Ia juga berjalan **sebelum** pass `supportPlatforms()`,
> sehingga pilar dan rak yang dibangun pass itu bisa menembok lorong setelah
> pemeriksaan selesai. Pilar yang menopang langkan itu terrain yang jujur; pilar
> yang menopang langkan tanpa jalan naik adalah run yang mati.

## 7.8 Hazard

`[CODE]` `src/world/hazards.js` - empat jenis:

| Jenis | Perilaku |
|---|---|
| `crumble` | Platform yang runtuh saat diinjak (`updateCrumble`), lalu hilang |
| `platform` | Platform bergerak (`carry()` membawa pemain yang berdiri di atasnya) |
| `ball` | Bola berduri yang bergerak/berayun |
| `saw` | Gergaji |

Tidak ada hazard sama sekali di lantai `safe` dan `boss`
(`generate()` keluar lebih awal untuk kedua kind itu). Jumlah dan peluangnya
mengikuti tabel 7.3, dan panjang deretan paku dibatasi `spikeRunMax`.

## 7.9 Teka-teki

`[CODE]` `src/world/puzzle.js:1`. Sebuah puzzle adalah vault berdinding kecil
berisi peti, ditutup gerbang yang terlalu tinggi untuk dilompati
(`GATE_TILES = 3`). Enam nilai `kind` dipakai:

| Kind | Mekanik | Angka penting |
|---|---|---|
| `plate` | Dorong peti ke pressure plate, tinggalkan di sana | `PUSH_SPEED = 0.55` |
| `crates` | Peti-peti sebagai pijakan dan pemberat | - |
| `lever` | Tarik tuas, lalu masuk sebelum gerbang turun lagi | `LEVER_OPEN_FRAMES = 60*7` (7 detik) |
| `gate` | Gerbang (termasuk `barrier: true` yang harus dibuka) | - |
| `keygate` | Butuh kunci; bisa dijaga warden | `puzzle.warden`, `wardenDown` |
| `plateset` | Beberapa plate sekaligus | jumlah dari `difficulty.plates` |

Aturan jaminan yang penting: **vault teka-teki hanya menjaga harta, tidak pernah
jalan menuju lantai berikutnya.** Teka-teki yang gagal diselesaikan membuat pemain
kehilangan loot, bukan kehilangan run.

![Depth 4, The Torch Hall: lantai teka-teki](docs/img/floor-puzzle.png)

![Depth 6, The Rot Swamp: palet lumut dan kabut metana](docs/img/floor-swamp.png)

## 7.10 Air

`[CODE]` `src/world/water.js`

- Air digambar **dua kali**: badan air ikut turun bersama tile (di belakang
  segalanya), lalu `drawOverlay()` meletakkan permukaan bercahaya dan caustics di
  atas apa pun yang berenang di dalamnya. Satu pass akan menyembunyikan perenang
  atau membuat air terlihat seperti kaca.
- `stock(g, level)` menempatkan piranha di `swimSpots` hasil perhitungan generator.
- Pemain yang menyentuh air mendapat status basah (`checkWater`), yang menyambung
  ke sistem elemen: basah membuat petir bereaksi ELECTROCUTE.

## 7.11 Gunung, trial, dan parkour

| File | Peran |
|---|---|
| `world/mountain.js` | Membangun lantai gunung (climb) dan mengisi `spawns.boss` dengan THE STONE WARDEN |
| `world/trial.js` | Membangun arena ujian dan mengisi `spawns.boss` dengan THE ARBITER |
| `world/parkour.js` | Platform, tangga, dan tali untuk lantai `carved` (depth 2, 3, 9) |

![Depth 7, The Climb: terrain vertikal, langit biru tipis, dan tebing](docs/img/floor-mountain.png)

![Depth 8, The Sunk Halls: air dalam, caustics, dan piranha](docs/img/floor-flooded.png)

![Depth 9, The Ash Reaches: batu hangus dan bara](docs/img/floor-volcanic.png)

## 7.12 Isi tambahan: peti, gold slime, vault bonus

`[CODE]` `src/world/bonus.js`

- `spawnGoldSlime()` - slime emas yang **kabur** saat didekati (`fleeBehavior`);
  kalau berhasil dibunuh, ia menjatuhkan hadiah khusus (`onDeath`).
- `buildVault()` - sayap bonus bersegel tempat `vault` chest (tier tertinggi,
  2 item) diletakkan.
- `generate()` dipanggil generator utama untuk menempelkan keduanya ke lantai.
