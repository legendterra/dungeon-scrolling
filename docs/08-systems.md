# Bab 8 - Sistem Internal

## 8.1 `core/renderer3d.js` (3.662 baris) dari dalam

File terbesar di proyek. Isinya, berurutan seperti di kode (angka baris diukur
ulang di v5.2.2, saat latar dipindahkan keluar ke `core/backdrop3d.js`):

| Bagian | Baris | Fungsi |
|---|---|---|
| Preset kamera + rig | 139-175 | `CAM_PRESETS`, `camRig`, `applyCameraPreset` |
| Tabel tema | 177-232 | 16 tema (fog, ambient, hemi, dir, dirI) |
| Anggaran cahaya | 234-281 | konstanta intensitas + ukuran pool |
| Tekstur prosedural | 282-358 | `makeWallTexture`, `makeFloorTexture`, `makePlatformTexture` per biome |
| Tekstur efek | 359-551 | flame, glow, portal, rune |
| Init | 552-752 | Renderer WebGL, kamera, semua lampu, pool |
| `resize` | 753-848 | Ukuran buffer dan scissor play frame |
| Garis horizon | 849-884 | `horizonRow` (median satu level) dan `localHorizonY` (median jendela di sekitar pemain) - lihat 8.3.5 |
| `setupTheme` | 885-951 | Kabut + lampu dari tema, satu panggilan `DS.Backdrop.build`, `backLight` diarahkan `DS.Backdrop.heroLight` |
| Mesh prop level | 952-1546 | Pintu, obor, brazier, gate, tuas, peti, plate, paku, gergaji, platform runtuh, plus `floorAt`/`snapToFloor`/`groundAnchor` |
| `loadLevel` | 1547-2005 | Membangun seluruh dunia untuk satu lantai |
| Registry & audit prop | 2006-2090 | `propRegistry`, `auditAnchors` |
| Aktor | 2091-2534 | `gripWeapon`, `ensureHero`, `ensureEnemyModel`, `actorScale`, `ensureChargeAura` |
| Elemen/FX | 2535-2898 | `buildElemRig`, `animateRig` (rig efek elemen untuk puddle, burst) |
| Puddle & FX dunia | 2899-3248 | `spawnElemPuddle`, `spawnGroundBurst`, `spawnSmokePuff`, `spawnSwingArc` |
| Update & render | 3249-3611 | Sinkron aktor, flicker obor, render + scissor viewport, dan terjemahan horizon |
| Ekspor | 3612-3662 | `DS.R3D` |

`DS.R3D` adalah satu-satunya pintu masuk ke dunia 3D: `loadLevel`, `render`,
`resize`, `spawnElemPuddle/Burst/SmokePuff`, `spawnSwingArc`, `floorAt`,
`snapToFloor`, `groundAnchor`, `auditAnchors`, `rig`, `presets`, `setPreset`,
`lights`, `voxels`, `scene`, `gl`, dan `themeGroup`/`dungeon`/`propsGroup`/
`activeThemeName`/`backdrop` (lima yang terakhir hanya untuk QA: tanpa `dungeon`
dan `propsGroup`, sebuah harness tidak bisa membedakan "horizon tidak ada" dari
"batu level sendiri yang menghalangi").

## 8.2 Rig cahaya: anggaran yang dibalik

`[CODE]` `src/core/renderer3d.js:255`

| Konstanta | Nilai | Peran |
|---|---|---|
| `AMBIENT_I` | 0.12 | Cahaya isian; hanya supaya sisi gelap tidak menjadi hitam murni |
| `HEMI_I` | 0.24 | Gradasi langit-tanah |
| `KEY_GAIN` | 0.34 | Pengali untuk `dirI` tiap tema (mis. `mountain.dirI 0.66 x 0.34 = 0.22`) |
| `LAMP_I` | 1.85 | Lampu yang menempel pada pemain |
| `TORCH_I` | 2.30 | Intensitas dasar obor/brazier |
| `FLAME_LIGHTS` | 4 | Jumlah PointLight untuk obor/brazier |
| `ELEM_LIGHTS` | 2 | Jumlah PointLight untuk patch elemen |
| `backLight` | `0x9fb0d0`, 0.42 | "Bulan": cahaya dari **belakang** semuanya |
| `fillLight` | `0xbfd4ff`, 0.18 | Isian lembut |
| `playerLight` | `0xffe2a0`, `LAMP_I`, jarak 12, decay 1.4 | Lampu hero |

Alasan anggaran ini dibalik (kuotasi dari komentar di kode): sebelumnya frame
dijalankan dengan ambient besar plus key yang hampir seperti siang (0.55 dan
sampai ~1.0). Kombinasi itu tidak bisa terlihat seperti apa pun - tanpa arah,
setiap sisi blok menerima jumlah yang hampir sama, sehingga batu, dinding, dan
langit di belakangnya semuanya mendarat di abu-abu pucat yang sama; frame jadi
"terang benderang" dan datar. Sekarang: KEY kuat (berarah), AMBIENT kecil, HEMI
rendah. Perbedaan nilai **adalah** kedalaman visual.

Intensitas obor punya animasi hidup: tiap obor menyimpan `baseIntensity` dan
`smooth`, lalu `bm.smooth` didekati menuju `TORCH_I` dengan keyed flicker, dan
`pass` menentukan apakah obor itu benar-benar menyala.

> **Bug besar yang pernah terjadi (dan pelajarannya).** Sebelum pool tetap, setiap
> obor membuat PointLight-nya sendiri tanpa batas: depth 5 dengan 11 obor berarti
> **14 point light**. Three.js meng-compile shader per jumlah lampu, sehingga tiap
> obor baru = hit dan recompile semua material dunia; begitu jumlahnya melewati
> batas uniform GPU, program gagal dan material yang terdampak digambar **hitam**.
> Skill api menambah lampu lagi di atas itu, jadi gejalanya persis seperti yang
> dilaporkan pemain: "tiba-tiba gelap kalau pakai skill api". Perbaikannya adalah
> pool tetap (`FLAME_LIGHTS + ELEM_LIGHTS` = 6 lampu dunia, konstan): setiap frame
> pool diarahkan ke obor/patch terdekat dari pemain, dan jumlah lampu yang dilihat
> shader **tidak pernah berubah**. Lampu tambahan tidak lagi mengubah apa pun.

> **Iterasi kedua dari bug yang sama (v5.2.1).** Pool tetap menyelesaikan jumlah
> lampu, tapi tidak isinya. `buildElemRig()` membuat objek rig tanpa properti
> `phase`, sementara `animateRig()` menghitung
> `Math.sin(t * 3 + rig.parts[0].phase)` — dan `parts[0]` adalah cakram scar yang
> memang tidak punya `phase`. Hasilnya `Math.sin(NaN)` = `NaN`, `rig.glow` = `NaN`,
> dan `NaN` itu ditulis ke `elemLightPool[i].intensity`. Satu `PointLight`
> berintensitas `NaN` meracuni **seluruh** shading material yang terkena lampu,
> jadi yang terlihat bukan frame yang redup tapi frame yang hitam. Terukur pada
> depth 4: frame mean 36-40 turun ke 19-21 dan bagian gelap naik dari 51% ke
> 70-78%, persis seperti laporan "kalau ngeluarkan skill elemental layar jadi
> gelap". Ini hanya muncul pada tiga elemen yang benar-benar membawa lampu (fire,
> lightning, poison). Perbaikannya di sumber (rig membawa `phase` sendiri) plus dua
> pagar: glow dijaga `Number.isFinite`, dan pool menolak menulis ke lampu kalau
> posisi grup atau glow bukan angka berhingga. Dijaga `npm run qa:lights`, yang
> memeriksa (a) setiap intensitas lampu berhingga setelah tiap elemen mendarat dan
> (b) frame tidak bertambah gelap saat satu patch terbakar.

## 8.3 Latar belakang 3D: `src/core/backdrop3d.js` (1.966 baris, v5.2.2)

`[CODE]` `src/core/backdrop3d.js:1416` (`build`), dipanggil dari
`[CODE:src/core/renderer3d.js:1601]` di dalam `setupTheme()`.

Sampai v5.2.1 latar dibangun **di dalam** `renderer3d.js` sebagai band siluet
berwarna. Sejak v5.2.2 seluruh latar adalah modul sendiri, dan renderer hanya
menyisakan kabut, lampu, dan satu panggilan:

```js
DS.Backdrop.build({ scene, theme, p2u, fogCol, fogDensity }, themeName, w, h, anchorY)
  -> { group, skyRig, hero, report }
DS.Backdrop.update(time, dt)      // denyut band, awan, burung, mote
```

`report` adalah bagian yang membuat modul ini bisa **diukur**: ia membawa `theme`,
`wu` (lebar lantai dalam unit dunia), `anchorY`, `gain`, `window`, `skyValue`,
`haze`, `rungs`, `layers[]` (satu entri per rung: `kind, d, k, n, col, glow, tex,
texRep, mean, solo, dropped`), `textures[]`, `fogLift[]`, dan `hero` yang dibaca
dari objek yang benar-benar dibangun (`getWorldPosition`), bukan dari aritmetika
penempatannya. `heroFit(name)` mengembalikan benda langit yang **akan** didapat
sebuah tema (keinginan penulis setelah dipangkas oleh atap ruangan).

### 8.3.1 Tangga tujuh rung

| Konstanta | Nilai | Arti |
|---|---|---|
| `RUNGS` | 4.5 / 7.5 / 12 / 19 / 30 / 46 / 68 | jarak tujuh band dari kamera, unit dunia |
| `REF_D` | `RUNGS[0]` = 4.5 | jarak acuan: ukuran elemen dan kerapatan tekstur diskalakan dari sini |
| `GROUND_D` | 130 | panjang tanah datar sebelum langit |
| `SKY_Z` / `SKY_H` / `SKY_DROP` | −150 / 240 / 30 | bidang langit: posisi, tinggi, dan seberapa jauh ia turun di bawah garis mata |
| `CAM_DIST` | 26 | menyalin `camRig.dist`, dipakai untuk skala benda langit |
| `TEX_AT` | 19 | rung pada atau lebih dekat dari ini membawa tekstur |
| `ROOM_HERO_D` | −30 | kedalaman benda langit di ruangan beratap |

Setiap tema adalah satu baris `RECIPE` (**13 tema**) dengan **tujuh rung penuh**
dan **tepat satu** `solo: true` di rung 30 — satu landmark unik per lantai
(`wreck` di Shore, `throne` di Throne, dan seterusnya). `BACKDROP_KINDS`
menyediakan **26 bentuk band** (`spires`, `hills`, `ridge`, `rubble`, `bones`,
`columns`, `arches`, `crystals`, `ice`, `reeds`, `wreck`, `throne`, …), dan
`bandCount()` menghitung jumlah elemen dari lebar dunia dibagi `sp`, jadi
kepadatan latar tidak berubah saat lantai bertambah lebar. Sembilan di antaranya
punya tabel `SWAY_KINDS` (denyut opasitas sendiri).

### 8.3.2 Tekstur per rung

`makeBandTexture(family)` menggambar tekstur prosedural ke canvas sekali per
famili lalu di-cache (`texCache`), dan **12 famili** tersedia: `sand`, `wetrock`,
`moss`, `snow`, `brick`, `ash`, `bone`, `ice`, `coral`, `wood`, `marble`,
`tiles`. Yang membuatnya terbaca sebagai kedalaman, bukan sebagai wallpaper:

- hanya rung ≤ `TEX_AT` (19) yang bertekstur; yang lebih jauh tetap siluet;
- `texRep` tiap rung dihitung dari `d / REF_D`, sehingga **kerapatan texel tetap**
  naik tangga — rung jauh tidak berubah menjadi bintik-bintik halus;
- warna rung diangkat terhadap kabut oleh `unfog(col, dist, fogCol, density)`
  dengan `FOG_LIFT_MAX = 5.0`, jadi tekstur tetap terbaca di lantai gelap.

### 8.3.3 Kurva cahaya sepanjang run

`CURVE` punya **13 baris** (satu per tema) yang memberi `gain` langit dan warna
langit atas/tengah/bawah; tema tanpa baris memakai `DEFAULT_GAIN = 0.30`.
Light curve ini **monoton menggelap** dari Depth 1 ke Depth 10 dan diukur dari
piksel, bukan diklaim: `npm run qa:backdrop` menjalankan `build` pada kesepuluh
lantai dan mencetak rata-rata frame per lantai, mis. `shore 79.5` turun sampai
`volcanic 38.0` — rentang 41 poin, dan tidak ada lantai yang jatuh ke layar gelap.

Langit bukan lampu kedua. Ia tetap **satu** `DirectionalLight` (`backLight`) yang
**dibidikan dan diwarnai oleh benda langit tema itu sendiri** lewat
`DS.Backdrop.heroLight(themeName, yaw)`, sehingga benda yang menyala di langit dan
tepi cahaya di batu adalah sumber yang sama. Jumlah lampu di scene tetap 13 di
semua lantai — itu yang dijaga `qa:lights`, karena lampu tambahan adalah bug layar
hitam v5.2.1.

### 8.3.4 Benda langit, ruangan, dan "jendela"

Setiap tema menulis satu `HEROES` entry: `kind` (matahari, bulan, kristal, obor,
kubah, …), `col`, `glow`, `az` (azimut 0..1 dari lebar lantai), `elev`, dan `r`.
Penempatannya:

1. **Di langit terbuka** benda digantung di `skyRig`, pada `heroZ = 2`, di
   `(az − 0.5) × WU × 0.9` — jadi azimut adalah pecahan dari rentang yang
   direntangkan atas 90% lantai, dan `qa:backdrop` **memeriksa ulang** bahwa benda
   itu benar-benar berada di garis tengah lantai pada azimutnya (toleransi 0,05).
2. **Di ruangan beratap** `roomRig` berdiri di `(WU × 0.5, 0, 0)` dan benda
   digantung di `ROOM_HERO_D = −30`, tetapi lebih dulu `fitRoomHero()` memangkas
   jari-jari dan ketinggiannya agar muat: `room = max(2.4, ceiling.y − 1.6)`,
   `cap = max(1.6, (room − 0.2) / 2)`. Tanpa itu benda setinggi 4,3 unit menembus
   atap 10 unit dan halo-nya jadi coreng di tanah.
3. **Jendela.** Band yang berada **di depan** benda langit akan menutupinya, dan
   inilah bug yang tersembunyi paling lama: laporan tetap benar, tetapi yang
   difoto pemain adalah batu. Karena itu lapisan di depan menghitung satu
   "jendela" (`windowBodyZ`, `windowFeetY`, `windowGap`) dan **membuang** kotak
   yang menutupi badan benda; report mencatat jumlahnya di `report.window`.
   Terukur: tanpa jendela, pusat piringan benda di lantai `throne` terbaca
   **5** dari 255; dengan jendela **106**.

### 8.3.5 Horizon yang mengikuti tanah (v5.2.2)

`horizonRow(map)` mengambil **median** baris tanah seluruh level, dan itulah yang
menjadi `anchorY` saat tema dibangun. Median itu cukup untuk level datar dan salah
untuk game ini: diukur pada kedalaman 1..10, tanah bergerak **6 sampai 20 tile**
(10–32 unit dunia) di sekitar garis itu, dan dua-duanya terlihat:

- **naik ke bukit** → kamera berakhir **di atas atap tema itu sendiri** (terukur
  14,2 unit di atas anchor di bawah plafon 10 unit), sehingga horizon tertutup
  atapnya sendiri;
- **turun ke cekungan** → bidang tanah latar berada **di atas kepala pemain**, dan
  seluruh latar berdiri di balik lantai.

Perbaikannya bukan membangun ulang latar tiap frame, melainkan **menerjemahkan
grup yang sudah dibangun**:

```js
// renderer3d.js, di dalam render()
if ((g.frames & 7) === 0) {
  const target = localHorizonY(g.map, DS.Ent.centerX(g.player));
  if (target != null) horizonY = horizonSettled ? horizonY + (target - horizonY) * 0.22 : target;
}
themeGroup.position.y = horizonY - themeAnchorY;   // themeAnchorY = garis saat build
```

`localHorizonY()` adalah median yang sama, tetapi atas **jendela ±16 tile di
sekitar pemain** (langkah 2, kolom tanpa lantai dilewatkan supaya lubang tidak
menarik garis ke bawah): cukup tahan-uji untuk satu lubang, cukup lokal untuk
bukit. Frame pertama sebuah level **menempatkan** garis, frame berikutnya
**menggerakkannya** dengan `0.22` per 8 frame, jadi satu langkah tile tidak
memunculkan pop pada seluruh latar.

> **Satu jebakan yang baru ketahuan setelah garis ini mulai bergerak.** Rig langit
> (`skyRig`) adalah **anak** dari grup yang sekarang diterjemahkan, tetapi ia dipin
> ke tinggi kamera dalam **koordinat dunia** (`skyRig.position.y = camera.position.y`).
> Selama grup ada di `y = 0` kedua angka itu sama; begitu grup bergeser, langit
> beserta benda langitnya ikut naik/turun sebesar pergeseran itu - dan pergeseran
> bisa 30 unit. Terukur: bulan Depth 7 berada **3% tinggi setengah frame di atas
> tepi atas frame**, tepat dari satu-satunya tempat di lantai itu yang seharusnya
> melihatnya di atas kepala. Pin-nya sekarang dikonversi ke ruang grup:
> `skyRig.position.y = camera.position.y - themeGroup.position.y`. Aturan umumnya:
> setiap angka **dunia** yang ditulis ke anak dari grup ini harus dikurangi dulu -
> satu-satunya yang boleh tetap dunia adalah kamera.

`npm run qa:backdrop` menunggu garis itu **sampai di tanah pemain** (bukan
menunggu durasi) lalu menuntut `garis == tanah di bawah pemain` (toleransi 0,75
unit) di dua tempat yang berjauhan — dan menuntut bahwa garis itu memang **pernah**
bergerak lebih dari satu unit, karena horizon yang tidak pernah lepas dari garis
bangunannya adalah bug yang baru saja dihapus.

### 8.3.6 Cara mengukurnya

| Alat | Yang diukur |
|---|---|
| `npm run qa:backdrop` (`tools/qa/audit-backdrop.js`, `lib/backdrop-page.js`) | **346 pemeriksaan**: struktur 13 resep, anggaran lampu, 4×3 sinar dari tiga tempat di lantai (0/36 lubang), benda langit di dalam frame dan **lebih terang dari bingkainya**, laporan ≡ objek di scene, garis horizon di atas tanah pemain, kerapatan texel, dan biaya frame |
| `npm run shots:backdrop` (`tools/qa/shoot-backdrop.js`) | kontak-sheet: 10 lantai × 3 posisi kamera, dipotong ke play frame, HUD mati, plus kolom **before** dari build yang sedang terbit kalau `--before URL` diberikan |

Pelajaran yang mahal dan sudah ditulis di dalam tool-nya: harness ini mengukur
objek **hidup**, bukan report. `underBody()` mengambil kolom dari objek yang benar-
benar dipakai (`getWorldPosition`), `vantage()` mencari kolom tempat level sendiri
tidak menghalangi (batu level memang tidak bisa dilihat tembus), dan
`levelInTheWay()` hanya me-raycast grup dungeon — raycast ke seluruh scene pernah
melempar `Cannot read properties of null` pada mesh yang sudah di-dispose.

## 8.4 Kamera

`[CODE]` `src/core/renderer3d.js:145`

| Preset | Label | yaw | pitch | dist | fov |
|---|---|---|---|---|---|
| 0 (default) | `SIDE 0/7` | 0 | 0.12 | 26 | 39.5 |
| 1 | `THREE-Q 40/24` | 0.70 | 0.42 | 26 | 39.5 |
| 2 | `STEEP 60/35` | 1.05 | 0.61 | 24 | 42 |
| 3 | `FILM 20/16` | 0.35 | 0.28 | 30 | 36 |

Trade-off-nya diukur dan tercatat: yaw A derajat menampilkan `cos(A)` dari lebar
level - 40 derajat menyisakan 77% lapangan, 60 derajat hanya 50% - dan kamera
miring menggeser level secara diagonal di layar, sehingga langkan berhenti menjadi
garis horizontal. Karena itu **default-nya tetap 0/7** (tembakan samping lurus)
dan preset lain hanya satu tombol (F6), tidak pernah menjadi keadaan saat boot:
pilihannya tidak disimpan, jadi game tidak mungkin mulai dalam keadaan miring.

## 8.5 Model voxel

`[CODE]` `src/core/voxel.js` (1.206 baris) + `DS.Voxel.build(key, opts)` dipanggil
dari renderer3d untuk: `chest` (dengan `tier`, termasuk gembok untuk peti
terkunci), semua jenis monster (`DS.Voxel.build(e.kind)`, dengan `tier` dan
`tint`), `hero` (dengan seluruh armor yang dipakai), `shrine`, `weapon`
(`buildWeapon(type, rarityColor)`), `floor`, `wall`, `platform`, puddle/shards FX.
Model dibangun dari kotak (`box`) dan shard (`instancedShards`) - itulah sebabnya
siluetnya blocky, bukan low-poly halus.

## 8.6 Aturan "tidak ada yang mengambang" sebagai gerbang otomatis

`[CODE]` `src/core/renderer3d.js:2594` + `2626`

- `floorAt(map, px, py)` adalah **satu-satunya** cara sebuah prop boleh mengetahui
  di mana tanahnya; `snapToFloor` dan `groundAnchor` dibangun di atasnya.
- `propRegistry()` mendaftarkan setiap prop: `chest` (boxed), `pickup` (boxed),
  `plate`, `brazier`, `lever`, `torch`, `shrine`, `doorway`. Crate dan gate
  **sengaja tidak** di-anchor karena transformasinya ditulis ulang setiap frame dari
  badan 2D (peti didorong, gerbang terangkat), jadi mengauditnya hanya akan
  melaporkan keadaan sesaat.
- `auditAnchors(g, tolerance)` mengukur jarak kaki setiap prop dari permukaan yang
  ia klaim: celah positif berarti melayang, negatif berarti terbenam. Keduanya
  dilarang, dan laporannya menyebut nama prop-nya. Gerbang ini diekspos di
  `DS.R3D` supaya pass QA headless bisa memastikan hasilnya kosong untuk setiap
  kedalaman dan seed tanpa mengambil satu screenshot pun.

### 8.6.1 Aturan yang sama untuk yang MENGGANTUNG (v5.2.1)

`auditAnchors` mengukur jarak kaki prop dari permukaan di bawahnya. Untuk tali dan
tangga pertanyaan itu salah: keduanya **memang** tidak menyentuh tanah. Karena itu
keduanya sengaja tidak masuk `propRegistry()`, dan jawabannya ditulis pada grup
masing-masing:

| `userData` | Isi |
|---|---|
| `hangTop` | tinggi ujung atas rigging, di unit dunia |
| `hangOn` | `above` / `side` / `below` — dari mana ia diikat |
| `anchorTile` | `[tx, ty]` tile solid tempat piton menancap |
| `hangKind` | `rope` / `ladder` |

`anchorFor(map, tx, ty)` mencari tempat menancap dengan urutan yang masuk akal:
lurus ke atas dulu, lalu sisi kiri/kanan 1-3 tile, lalu beberapa baris ke bawah
sisi kiri/kanan. `hangHardware()` menggambar piton di tile itu plus lengan yang
menghubungkannya ke ujung rigging, jadi keduanya terbaca sebagai **satu alat**, dan
tile yang ditancap dicatat di grup supaya bisa diperiksa terhadap peta.

**Tali** digantung dari bawah pijakan kayu. Sebelumnya ujung atas tali mulai di
batas tile rope paling atas — 1,02 unit di bawah sisi bawah slab pijakan (slab
hanya mengisi bagian atas tilenya sendiri) — sehingga setiap tali di bawah pijakan
mulai di udara dengan celah yang kelihatan. `PLATFORM_UNDER = 0.58` adalah offset
sisi bawah slab, dan `hang` memakainya saat tile di atas adalah platform (kode 2);
`group.userData.hangTop` mencatat di mana ujung itu mendarat.

**Tangga** tidak dibangun dari tumpukan slab, karena tumpukan itu tidak ada:
sebuah pendakian di game ini adalah **rung group** — dua tile platform atau lebih
yang berjarak **dua baris** di kolom yang sama, diulang sepanjang tebing
(`CLIMB_STEP = 2` di `systems/reach.js`; generator parkour memakai bentuk yang
sama). Diukur pada sepuluh lantai: 66 grup, semuanya 2-3 rung berjarak tepat dua
baris, lebar 1-4 tile. Versi pertama v5.2.1 mencari "run vertikal" tile platform
yang bersebelahan, dan karena rung tidak pernah bersebelahan, hasilnya nol tangga
di seluruh dungeon. Sekarang grup dideteksi dari **bentuknya**: lebar tangga
mengikuti lebar rung (maksimum 4 tile), dua rel vertikal di tepinya, satu rung di
bawah setiap papan, dan bagian atasnya tepat di sisi bawah papan paling atas.
Rel hanya dibangun oleh rung **teratas** sebuah grup, dan pengecekannya melihat
dua baris ke atas — rung berjarak dua baris, jadi tes satu baris menemukan celah di
antaranya dan setiap rung membangun tangga pendeknya sendiri di atas tangga di
atasnya (terukur di depth 10: 13 pendakian menjadi 31 tangga yang saling tumpang).

Dijaga `npm run qa:hangs` (`tools/qa/check-hangs.js`), yang berjalan di sepuluh
kedalaman dan memeriksa tiga klaim sekaligus terhadap hal yang tidak dikontrol
renderer: (1) bounding box geometrinya sendiri mencapai `hangTop`, (2) tile yang
ditulis di `anchorTile` benar-benar solid atau platform di peta, (3) tidak ada yang
`hangOn: 'none'`. Hasil: 63 prop menggantung di sepuluh lantai, semuanya lolos.

## 8.7 Audio

`[CODE]` `src/core/audio.js` (257 baris). Tidak ada file audio: seluruh suara
adalah osilator dan noise dari Web Audio API.

| Kelompok | SFX |
|---|---|
| Gerak | `jump`, `land`, `dash` |
| Tempur | `swing`, `hit`, `crit`, `block`, `hurt`, `die`, `slam` |
| Elemen | `fire`, `ice`, `lightning`, `cast`, `shoot` |
| Item | `coin`, `shard`, `heal`, `pickup`, `enchant`, `salvage`, `upgrade` |
| Sistem | `menuMove`, `menuPick`, `locked`, `error`, `stairs`, `victory` |
| Ambience | `drip`, `whisper`, (detak jantung memakai `slam`) |

Musik berjalan sebagai mood (`MOODS`) yang berubah sesuai konteks - mis. `calm`
di menu dan setelah Slime King mati. `Audio.unlock()` dipanggil pada input pertama
karena browser memblokir audio sebelum ada interaksi.

## 8.8 Simpan dan rekor

`[CODE]` `src/core/storage.js` - satu kunci `localStorage['ds_stats']`:

| Field | Arti |
|---|---|
| `bestDepth` | Kedalaman terbaik |
| `totalKills` | Total kill seluruh run |
| `runs` | Jumlah run |
| `bestItemName`, `bestItemRarity` | Item terbaik yang pernah didapat |
| `fastestClearFrames` | Waktu clear tercepat (hanya diisi bila run tamat) |

Filosofinya tertulis di komentar file: game ini roguelike murni, **tidak ada
meta-progression, tidak ada unlock, tidak ada statistik yang dibawa antar-run**;
penyimpanan ini kosmetik dan hanya memberi makan menu serta layar akhir. Kalau
localStorage dimatikan (mode privat), game menurunkan diri ke nilai default dan
menulis peringatan, bukan gagal.

## 8.9 Input (ringkas teknis)

Sudah dirinci di Bab 3.4. Yang perlu dicatat di level sistem: `Input.poll()` +
`Input.endFrame()` dipanggil per langkah simulasi dari `main.js`, sehingga status
"baru ditekan" hanya berlaku satu langkah; menekan dan melepas di antara frame
tetap tertangkap karena `pressed`/`released` adalah set, bukan boolean.

## 8.10 Kinerja

| Hal | Nilai / catatan |
|---|---|
| Payload runtime | `index.html` + `libs/three.min.js` (603 KB) + `src/` (1,3 MB) |
| Langkah simulasi | Tetap 60 Hz, maksimal 5 langkah per frame; tab tidak aktif dipangkas |
| Lampu dunia | 6 point light tetap + 3 directional + ambient (jumlah tidak pernah berubah) |
| Pool bayangan | `shadowPool` - mesh blob shadow dipakai ulang, sisanya `visible = false` |
| Instancing | `instancedBoxes` / `instancedShards` untuk detail yang banyak |
| Tekstur | Dibuat prosedural saat muat (`makeWallTexture` dll.), tidak ada file gambar |
| Viewport | Dunia dirender dengan `scissor` ke frame bermain, lalu canvas diserahkan ke lapisan UI |

## 8.11 Penerbitan (Cloudflare) dan masalah payload-nya

`[CODE]` `wrangler.jsonc`:

```jsonc
{
  "name": "dungeon-scrolling",
  "compatibility_date": "2026-09-21",
  "assets": { "directory": "." },
  "routes": [{ "pattern": "dungeonscrolling.moneyspender.net", "custom_domain": true }]
}
```

Artinya seluruh folder proyek diunggah sebagai aset statis. `.assetsignore`
**hanya** mengecualikan `node_modules/`, `.git/`, `.claude/`, `.freebuff/`,
`backup/` dan file log. Yang ikut terunggah karena itu: `tools/` (generator art
Python + solver), `prompts/`, `assets/` (**18 MB** art konsep + 127 screenshot
pengembangan), `docs/` dan `dist/`, semua `*.md`, `devserver.py`, `.codex/`,
`skills-lock.json`, `.mcp.json`, dan `wrangler.jsonc` itu sendiri.

Perbaikan yang diusulkan (dan sudah dilakukan di pass ini):

```
# tambahan .assetsignore
.agents/
.codex/
docs/
dist/
prompts/
tools/
assets/
*.md
*.py
package.json
package-lock.json
skills-lock.json
.mcp.json
wrangler.jsonc
```

Setelah itu yang naik ke Cloudflare hanya `index.html`, `libs/` dan `src/` -
sekitar 1,3 MB, dan source code pengembangan tidak ikut publik.

## 8.12 Nama dan ladder online (v5.2.0)

`[CODE]` Nama pemain disimpan lokal (`localStorage['ds_name']`), tapi peringkatnya
butuh satu tempat bersama. Itu satu-satunya bagian game yang tidak statis, dan
bentuknya sengaja sekecil mungkin:

| Berkas | Isi |
|---|---|
| `worker/index.js` (140 baris) | `GET /api/top` -> 10 baris teratas; `POST /api/score` -> validasi, INSERT, balas `rank` + tabel baru. Sisanya `env.ASSETS.fetch(req)` |
| `worker/schema.sql` | Satu tabel `scores` (+ indeks `scores_ladder`), tanpa kolom pemain/akun |
| `wrangler.jsonc` | `main: worker/index.js`, `assets.binding: ASSETS`, `run_worker_first: ["/api/*"]`, `d1_databases: DB` |
| `src/core/board.js` (190 baris) | Klien: nama, `submit()`, `refresh()`, `rows()`, fallback lokal, `rankFor()` |

**Prinsipnya, dan alasannya:**

- **Kunjungan halaman tidak menyentuh Worker.** `run_worker_first` hanya cocok
  untuk `/api/*`, jadi `index.html`, `src/` dan `libs/` tetap dilayani sebagai aset
  statis — latensi nol, dan kuota Worker hanya terpakai saat ada run yang mati.
- **Jaringan tidak pernah ditunggu.** `submit()` dan `refresh()` fire-and-forget;
  layar kematian sudah tampil sebelum jawaban tiba, dan baris ladder diisi saat
  jawaban datang.
- **Tanpa server tetap benar.** Kalau `/api/*` mengembalikan apa pun selain baris
  (dev server lokal, `file://`, D1 sedang mati), run disimpan di
  `localStorage['ds_runs']` dan layar kematian menulis `THIS DEVICE` — bukan tabel
  kosong, dan bukan klaim online palsu.
- **Input diperlakukan sebagai tidak tepercaya.** Nama disaring ke ASCII tercetak
  2-12 karakter; `depth` di-clamp ke 10, `kills`/`coins` ke 9999, `frames` ke batas
  12 jam; run dengan `depth < 1` ditolak. Bukan pertahanan terhadap cheater
  (tidak ada yang client-side bisa), tapi menjaga tabel dari build basi.
- **Tabel tidak tumbuh tanpa batas.** Setelah insert, `trim()` menyisakan 500
  baris terbaik — dan hanya kalau jumlahnya sudah melewatinya.

**Verifikasi:** `npm run qa:board` (nama, label kepala, ladder offline di browser
nyata) dan `npm run qa:api` (satu run di situs live sampai terbaca lagi dari D1).

## 8.13 Cara meregenerasi dokumen ini

```bash
# 1. Word (super detail)
python tools/docs/build_docx.py

# 2. HTML untuk PDF (parser yang sama)
python tools/docs/build_html.py

# 3. PDF lewat Chrome headless (nol dependensi)
node tools/docs/build_pdf.js dist/Dungeon-Scrolling-GDD-v5.2.1.html

# 4. cek tata letak tanpa mencetak (0 overflow, 0 gambar rusak)
node tools/docs/build_pdf.js dist/Dungeon-Scrolling-GDD-v5.2.1.html --probe
```

> Nama berkas memakai versi dari `docs/meta.json`, jadi ganti versinya di sana
> sebelum membangun ulang.

Isi dokumen ada di `docs/NN-*.md` (markdown, satu bab per file), metadatanya di
`docs/meta.json`, gambarnya di `docs/img/`. Urutan bab mengikuti nama file.
