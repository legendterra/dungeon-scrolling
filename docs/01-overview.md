# Bagaimana Membaca Buku Ini

Buku ini adalah **satu-satunya acuan** untuk pass pengembangan berikutnya. Isinya
dibuat dengan satu aturan: setiap pernyataan punya sumber, dan setiap temuan punya
bukti. Tidak ada kalimat "sepertinya".

## Tag bukti

Setiap klaim penting di buku ini ditandai salah satu dari dua label:

| Tag | Artinya |
|---|---|
| `[RUNTIME]` | Diukur sambil game benar-benar berjalan (browser lewat preview, atau skrip headless yang mengemudikan modul aslinya). Angka yang tertulis adalah angka yang terukur. |
| `[CODE]` | Dibaca langsung dari sumber, dengan `file:baris`. Angka yang tertulis adalah nilai yang ada di kode, belum diukur di layar. |

Temuan di **Bagian V (Register Isu)** memakai `[RUNTIME]` untuk yang sudah saya
buktikan, dan `[CODE]` untuk yang masih perlu dijalankan. Temuan yang tidak bisa
saya uji sama sekali (mis. perilaku shell luar) ditandai `[UNVERIFIED]`.

## Ruang lingkup yang diaudit

Seluruh isi `src/` dibaca dalam pass ini: **57 file, 29.004 baris** JavaScript.
Ditambah `index.html`, `libs/three.min.js`, `tools/` (generator art Python +
solver level), `wrangler.jsonc`, `.assetsignore`, `CHANGELOG.md` (riwayat v1.0.0
sampai v5.0.0) dan `README.md`.

## Cara memakai buku ini untuk bugfix

1. Buka **Bagian V**, pilih isu yang mau dikerjakan (sudah diurutkan per tingkat
   keparahan).
2. Setiap entri menyebut file dan barisnya, dampaknya ke pemain, dan usulannya.
   Kerjakan di file itu; kalau perlu mengubah perilaku, cari bagian sistemnya di
   Bagian II-IV supaya tidak menabrak aturan yang sudah ada (mis. skala layar,
   grid UI, atau kurva difficulty).
3. Sesudah diperbaiki, ubah markdown di `docs/` lalu regenerate Word dan PDF
   dengan perintah di Bab 8.12.

[[TOC]]

---

# Bab 1 - Ikhtisar

## 1.1 Apa itu game ini

Dungeon Scrolling adalah **roguelite aksi side-scrolling** bertema dungeon
prosedural: satu nyawa per run, sepuluh lantai, dan lantai 10 selalu Slime King.
Pemain memilih satu dari enam tipe senjata sebelum turun, lalu setiap lantai
dibangkitkan dari seed acak: lorong, tanjakan, jurang, paku, peti, teka-teki, dan
satu gerbang turun. Naik turun dilakukan dengan lompat ganda, dash, panjat, dan
parkour - bukan dengan jalan bebas.

Tampilannya **hibrida**: gameplay dan seluruh UI digambar sebagai quad di dalam
satu kanvas Three.js, sedangkan dunia, model karakter, monster, dan latar belakang
adalah geometri 3D (voxel/box) di belakangnya. Tidak ada canvas 2D lagi: migrasi
ke satu renderer Three.js selesai di v5.0.0.

## 1.2 Prinsip arsitektur yang tidak boleh dilanggar

| # | Prinsip | Tempat aturannya | Kenapa |
|---|---|---|---|
| 1 | Nol langkah build | `index.html` memuat 60 script klasik (bukan ES module) | Bisa dibuka dari `file://` dan di-host sebagai situs statis apa pun. |
| 2 | Satu kanvas, satu skala | `src/ui3/screen.js` (`fitScale`) | Semua UI, HUD dan menu memakai pembulatan skala yang sama, jadi teks tidak buram. |
| 3 | Logika di unit logis 320x180 | `src/core/rng.js` (`DS.C`) | Gameplay tidak ikut berubah saat resolusi/monitor berubah. |
| 4 | Satu pemilik per state | lihat peta file di 1.6 | Tidak ada dua modul yang menghitung angka yang sama. |
| 5 | Angka tuning di satu tempat per sistem | `items/weapons.js`, `systems/difficulty.js`, `systems/elements.js` | Bisa diubah tanpa berburu di seluruh repo. |
| 6 | Nol dependensi runtime | `libs/three.min.js` satu-satunya pustaka | Tidak ada `npm install` yang dibutuhkan pemain. |

## 1.3 Stack teknis

| Lapisan | Teknologi | Catatan |
|---|---|---|
| Bahasa | JavaScript ES5-style (`var`/`function`, IIFE) | Gaya konsisten di seluruh `src/`; tidak ada transpiler. |
| Pustaka 3D | Three.js (satu file, `libs/three.min.js`, 603 KB) | Dimuat sebagai `<script>` klasik. |
| Render | 1 WebGL canvas + 1 shader post-process | World pass, UI pass, lalu overlay post. |
| Audio | Web Audio API, seluruh suara disintesis | `src/core/audio.js`; tidak ada file audio. |
| Data | `localStorage` (`ds_stats`) | Hanya rekor; tidak ada meta-progression. |
| Uji | jsdom (satu-satunya isi `node_modules`) | Untuk tes headless opsional. |
| Host | Cloudflare Worker (mode assets) | `wrangler.jsonc`, domain `dungeonscrolling.moneyspender.net`. |

## 1.4 Sistem koordinat

`[CODE]` `src/core/rng.js:8` menetapkan seluruh satuan:

```js
DS.C = {
  W: 320,            // lebar render internal
  H: 180,            // tinggi render internal
  TILE: 16,          // satu petak dunia, dalam unit logis
  RS: 2,             // skala art (sprite digambar 2x agar 1:1 di piksel perangkat)
  GRAVITY: 0.34,     // px per frame^2 pada 60fps
  MAX_FALL: 6.4,
  FINAL_DEPTH: 10,
  SAFE_BEFORE: [5, 10]
}
```

Semua posisi, ukuran panel, dan tata letak menu ditulis dalam **unit logis**
320x180. Untuk mengubahnya ke piksel layar, semuanya dikalikan satu angka skala
yang dihitung sekali per resize (Bab 2.1). Sumbu Y mengarah ke bawah, dan kamera
UI memakai Y terbalik - hal ini pernah membuat satu bug render (Bab 2.3).

## 1.5 Alur boot dan loop satu frame

Urutan pemuatan script di `index.html` **bukan** alfabetis, dan urutannya penting
karena beberapa modul membaca modul lain saat dimuat (bukan saat dipanggil):

| Urutan | Kelompok | Alasan urutan |
|---|---|---|
| 1 | `libs/three.min.js`, `core/rng.js` | `THREE` dan `DS.C`/`DS.M` harus ada sebelum apa pun. |
| 2 | `core/storage.js`, `core/input.js`, `core/audio.js` | Tidak butuh art. |
| 3 | `art/base.js` -> `art/font3.js` -> `art/sprites.js`, `biomes.js`, `backdrop.js` | `font3` dibaca lapisan layar saat atlas dibakar; sprite adalah bahan semua art. |
| 4 | `core/renderer.js`, `core/voxel.js`, `core/renderer3d.js` | Model voxel adalah bahan renderer 3D, jadi voxel dulu. |
| 5 | `ui3/screen.js` | Lapisan layar: semua HUD/menu/quad FX lewat sini. |
| 6 | `systems/*` (physics, particles, lighting, elements, modifiers, boons) | Aturan gameplay. |
| 7 | `systems/difficulty.js` | **Harus** sebelum semua generator dunia, karena semuanya bertanya ke sini. |
| 8 | `items/*` -> `art/paperdoll.js` -> `art/faces.js`, `fxart.js` -> `art/uiart.js` -> `art/icons.js` | Paperdoll membaca `DS.Armor` saat dimuat; icons menggantikan sprite pickup. |
| 9 | `world/*` (tilemap, reach, parkour, generator, hazards, puzzle, mountain, trial) | `reach.js` sebelum `generator.js`: generator memanggilnya sebagai pass terakhir. |
| 10 | `entities/*` (base, player, enemies, enemies2) -> `world/bonus.js` -> `world/water.js` -> `entities/boss*.js` | `water.js` mendaftarkan monster sendiri, jadi harus sesudah bestiary. |
| 11 | `systems/skills.js` | Menangkap `DS.Ent`/`DS.Inv`/`DS.Weapons` saat dimuat, jadi paling akhir di kelompok gameplay. |
| 12 | `ui/kit.js` -> `ui/pointer.js` -> `ui/ui.js` -> `ui/profile.js` | Kit adalah grid+komponen yang dipakai semua layar. |
| 13 | `scenes/cutscene.js`, `scenes/camp3d.js`, `scenes/menu.js`, `scenes/game.js`, `main.js` | `main.js` terakhir: dia yang menjalankan `boot()`. |

`[CODE]` `src/main.js` menentukan loop:

| Tahap | Yang terjadi |
|---|---|
| `DS.R.init()` | Membangun renderer WebGL, atlas font, dan scene UI. |
| `DS.Scenes.menu()` | Scene pertama selalu menu utama. |
| `requestAnimationFrame(frame)` | Loop utama. |
| Langkah tetap | `STEP = 1000/60`, maksimum `MAX_CATCHUP = 5` langkah per frame; delta > 250 ms (tab tidak aktif) dipangkas jadi satu langkah. |
| Per langkah | `Input.poll()` -> `Ptr.beginFrame()` -> `scene.update()` -> `Input.endFrame()` |
| Sekali per frame | `Audio.update()` -> `scene.draw()` -> `Ptr.drawCursor(scene.cursor)` -> `R.present(time)` |
| Hook uji | `DS.__paused = true` membekukan update+draw tapi loop tetap hidup; `DS.currentGame`/`DS.currentScene` adalah pegangan debug. |

Pergantian scene ditunda ke frame berikutnya (`setScene` menyimpan `pending`),
jadi sebuah scene boleh meminta ganti scene dari dalam `update()`-nya sendiri
tanpa merobek frame yang sedang jalan.

## 1.6 Peta file lengkap

`[CODE]` 57 file, diurutkan dari yang terbesar. Kolom "pemilik state" menyebut
data yang hanya boleh diubah oleh file itu.

| File | Baris | Peran | Pemilik state |
|---|---|---|---|
| `core/renderer3d.js` | 4169 | Renderer dunia: tema, backdrop, model voxel, aktor, cahaya, kamera, FX 3D | `THEMES`, `camRig`, pool cahaya, semua mesh dunia |
| `art/sprites.js` | 1727 | Tabel seni pixel: tile, hero, monster, pickup, FX | `DS.SPR.raw` (art mentah) |
| `ui/ui.js` | 1489 | HUD, kartu item, bag, enchant, shop, shrine | Tata letak HUD & modal |
| `core/voxel.js` | 1206 | Pembangun model voxel (kotak + shard) | Geometri voxel |
| `entities/player.js` | 1075 | MC: physics, state, serangan, i-frame, death | `p.*` (seluruh state pemain) |
| `scenes/game.js` | 982 | Scene run: level, spawn, interaksi, gerbang, menang/kalah | `g.*` (seluruh state run) |
| `systems/elements.js` | 952 | 8 elemen, status, ground field, 28 reaksi | Aura/status musuh, field tanah |
| `entities/enemies2.js` | 920 | Bestiary lantai dalam (7 monster) | Perilaku monster lanjut |
| `world/generator.js` | 841 | Generator lantai: flavor, room, dukungan, pintu, obor | Layout dunia (`map`) |
| `entities/enemies.js` | 786 | 4 monster dasar + rank + tabel spawn | `TYPES`, `RANKS` |
| `ui3/screen.js` | 725 | Lapisan layar: skala, batch quad, font atlas, post overlay | Skala frame, atlas, `post.*` |
| `world/puzzle.js` | 658 | Teka-teki: plate/crate/lever/gate/keygate | Puzzle vault |
| `entities/base.js` | 645 | Dasar entitas: buat, damage, partikel gore | `Ent.*` |
| `art/king.js` | 618 | Sprite sheet Slime King (6 frame animasi) | Art boss akhir |
| `scenes/menu.js` | 581 | Menu utama, help, records, loadout, game over | `state.page`, `state.cursor` |
| `core/renderer.js` | 576 | API gambar: `rectS`, `text`, `panelS`, bar, `present` | Antrean draw UI |
| `systems/skills.js` | 525 | 6 skill + 6 ultimate | Cooldown/efek skill |
| `systems/reach.js` | 500 | Jaminan level bisa diselesaikan (rungs + tangga darurat) | Perbaikan terrain |
| `items/inventory.js` | 493 | Stat dasar pemain, slot, perk, pemakaian item | `Inv` (koin, shard, kunci, equipment) |
| `world/water.js` | 478 | Air: permukaan, caustics, arus, monster piranha | Tile air & swim spot |
| `systems/particles.js` | 454 | Partikel debu/percikan/jejak | Partikel dunia |
| `entities/bosses.js` | 418 | Boss tengah-run: Stone Warden, Arbiter | Fase boss |
| `ui/profile.js` | 392 | Layar profil 3 tab | `g.profile` |
| `ui/kit.js` | 390 | Grid + komponen + audit tata letak | `L` (grid layar) |
| `world/hazards.js` | 370 | Paku, bola berduri, gergaji, platform runtuh | Hazard |
| `art/uiart.js` | 364 | Bingkai, tombol, dan ornamen UI | Art UI |
| `world/tilemap.js` | 353 | Peta tile, query tabrakan | `map.*` |
| `world/trial.js` | 338 | Lantai trial (arena ujian) | Layout trial |
| `art/backdrop.js` | 324 | Backdrop 2D warisan (dipakai lapisan layar) | Art latar |
| `scenes/cutscene.js` | 316 | Intro pembuka (walk/edge/fall/land) | Progress cutscene |
| `items/generator.js` | 312 | Roll item: rarity, affix, tier peti | Hasil loot |
| `art/icons.js` | 309 | Katalog ikon 1:1 (koin, shard, kunci, skill, senjata) | `DS.Icons` |
| `scenes/camp3d.js` | 298 | Diorama 3D menu (hero, api unggun, pohon) | Kamera menu |
| `art/base.js` | 285 | Palet, `makeSprite`, `scaled`, `flipped`, `silhouette` | Palet global |
| `systems/boons.js` | 266 | Boon (buff antar-lantai) | `inv.perks` |
| `entities/boss.js` | 258 | Slime King: fase, lompatan, spawn anak | King state |
| `core/audio.js` | 257 | Sintesis SFX + musik mood | `isMuted`, music mood |
| `world/parkour.js` | 245 | Gen parkour: platform, tangga, rope | Layout parkour |
| `world/mountain.js` | 235 | Gen gunung (climb) + boss tengah | Layout gunung |
| `core/input.js` | 226 | Keyboard/mouse/gamepad -> aksi bernama | `down`/`pressed`/`released` |
| `ui/pointer.js` | 224 | Kursor gambar sendiri, drag item | `drag`, ukuran kursor |
| `items/armor.js` | 218 | 3 slot armor, 8 material, set bonus, suffix | Armor terpasang |
| `art/font3.js` | 200 | 3 bitmap face (MICRO/BODY/TITLE), **generated** | Glyph |
| `items/affixes.js` | 195 | Prefix/suffix senjata | Affix terpasang |
| `world/bonus.js` | 194 | Peti, gold slime, vault bonus | Pickup |
| `systems/physics.js` | 190 | Tabrakan tile, gerak badan | Posisi+kecepatan entitas |
| `art/fxart.js` | 182 | Sprite efek (ledakan, percikan) | Art FX |
| `systems/difficulty.js` | 159 | Kurva difficulty + tangga biome | **Satu-satunya** sumber angka per-depth |
| `art/biomes.js` | 153 | 10 palet biome + sky + cahaya | Palet biome |
| `systems/modifiers.js` | 148 | 7 modifier lantai + kurva horror | Modifier lantai |
| `art/paperdoll.js` | 140 | Boneka 2D untuk bag & profil | Art paperdoll |
| `items/weapons.js` | 124 | 6 senjata, 5 rarity, 8 elemen (tabel item) | **Sumber angka senjata** |
| `core/rng.js` | 119 | `DS.C`, mulberry32, helper matematika | Konstanta global |
| `art/faces.js` | 111 | Wajah/ekspresi MC | Art wajah |
| `main.js` | 95 | Boot, pergantian scene, loop langkah tetap | `current`/`pending` scene |
| `core/storage.js` | 79 | Rekor di `localStorage['ds_stats']` | Rekor |
| `systems/lighting.js` | 43 | Sisa modul cahaya warisan | (tidak menggambar) |

## 1.7 Repositori dan penerbitan

`[CODE]` Keadaan repo saat buku ini ditulis:

| Hal | Nilai |
|---|---|
| Commit terakhir | `4d12dc9 updated game 1 manuals` |
| Status | bersih, selevel `origin/main` (0 commit tertinggal / 0 di depan) |
| Riwayat | 7 commit, dari `Initial commit` sampai v5.0.0 |
| Riwayat versi | `CHANGELOG.md` memuat v1.0.0 sampai v5.0.0 |
| Host | `wrangler.jsonc`: Worker `dungeon-scrolling`, `assets.directory: "."`, route domain `dungeonscrolling.moneyspender.net` |
| Konfigurasi dev | `python devserver.py [port]` (default 8123) dengan `Cache-Control: no-store` dan `POST /__shot/<nama>` untuk menyimpan screenshot |
| Folder yang tidak dipakai runtime | `assets/` (18 MB, hanya konsep art + 127 screenshot pengembangan), `backup/` (1,7 MB salinan `src` sebelum v5.0.0), `tools/` (generator art Python), `prompts/` |

> **Catatan penerbitan.** `.assetsignore` saat ini hanya mengecualikan
> `node_modules/`, `.git/`, `.claude/`, `.freebuff/`, `backup/` dan file log. Artinya
> `tools/`, `prompts/`, `assets/` (18 MB), seluruh `*.md`, `devserver.py`, `.codex/`
> dan `wrangler.jsonc` ikut diunggah ke Cloudflare. Bab 8.11 membahas perbaikannya.

## 1.8 Glosarium

| Istilah | Arti di proyek ini |
|---|---|
| **Run** | Satu percobaan bermain: 10 lantai, satu nyawa. `g` di dalam kode. |
| **Depth / lantai** | Nomor lantai 1-10. `g.depth`. |
| **Flavor** | Bentuk lantai yang dipilih generator: `plain`, `carved`, `safe`, `flooded`, `mountain`, `boss`. |
| **Biome** | Tema visual lantai (palet tile + langit + warna obor + darkness). 10 entri di `art/biomes.js`. |
| **Rank** | Kelas musuh: `normal`, `elite`, `miniboss`, `colossal`. |
| **Aura** | Elemen yang menempel di musuh selama 200 frame dan bisa direaksikan. |
| **Field** | Cairan/genangan elemen di tanah (api, racun, air, es). |
| **Boon** | Buff yang diberikan antar lantai (`systems/boons.js`). |
| **Modifier** | Aturan yang mengubah seluruh lantai (mis. THICK BLOOD). |
| **Unit logis** | Satuan tata letak internal 320x180; dikalikan skala untuk jadi piksel layar. |
