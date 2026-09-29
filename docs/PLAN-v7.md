# Plan v7: Dunia Raksasa, Level Lebih Besar, Map Berkonsep, Monster Baru, MC Baru

## Konteks

Feedback setelah v6 (2 screenshot dari lokal, depth 2 dan 3, tema cave):

1. **Kamera nembus backdrop.** Di parkour tinggi, pita gelap selebar layar menutupi tengah layar dan
   kepala MC. Saat MC rendah, backdrop "clip ke bawah". Stalaktit cave mengambang. Setelah naik
   tinggi, horizon menyusul **pelan sekali**.
2. Backdrop harus jadi **dunia raksasa di luar kamera**; MC hanya "di-zoom" di satu batu. Level
   yang dimainkan juga harus **lebih besar**.
3. Backdrop warnanya flat. Pakai **tekstur open source**.
4. Semua map dirombak dengan konsep jelas (Rusted Prison malah seperti gurun). Prison = ruang
   tertutup tanpa matahari, cahaya dari sela jeruji. Tambah map **dewa Yunani**. Map lebih banyak.
5. Monster ditambah. MC di-refactor karena terlihat "lifeless".

### Keputusan user (2026-09-29)

| Topik | Pilihan |
|---|---|
| Ukuran map | **Dua-duanya**: dunia backdrop raksasa **dan** jalur level diperbesar |
| Tekstur | **Semi-realistis HD**: foto-scan CC0 dikecilkan ke ~256 px, halus, bermipmap |
| Susunan map | **Tetap 3 act x 10 depth**, tiap depth konsep unik, **Act III = dewa Yunani**; endless memutar semua |
| Gaya MC | **Voxel natural lebih detail**, tanpa toon atau outline |

Semua kerja di branch `claude/modest-rubin-yaqfoa`, commit + push per fase, tanpa merge ke `main`.
Langkah pertama implementasi: salin plan ini ke `docs/PLAN-v7.md`, dan setiap akhir fase perbarui
`docs/HANDOFF-v7.md` (supaya sesi lokal dan cloud bisa saling lanjut).

## Akar masalah (terbaca di kode dan dihitung)

- **Pita gelap = slab langit-langit backdrop.** `backdrop3d.js:2883-2901` membuat
  `BoxGeometry(WU*1.6+200, 2.0, 176)` di `z ∈ [-174, +2]`, tinggi `[L+10.5, L+12.5]` (L = garis
  horizon yang dikunci). Rentang z itu **melingkupi bidang main** (tile z -0.75..+1.08, aktor 0.3).
  Ada di 6 tema: cave, caves, prison, vault, throne, nest. Mata kamera = kaki MC + 5.35 u; slab masuk
  frame begitu MC ~3.1 u (2 tile) di atas L. Karena dead zone drift 7 u, **setelah memanjat apa pun
  mata berhenti ~11.6 u di atas L, tepat di dalam slab**.
- **Stalaktit mengambang, dijamin kode.** `capToRoof` (`:2501`) menaruh akar stalaktit maksimal di
  `ceiling.y - 1.6`, jadi selalu ada celah 1.6 sampai 4.9 u di bawah slab.
- **"Clip ke bawah".** `settleStage` (`:2987`) menahan tanah backdrop di `mata - 4.4` = kaki MC
  + 0.95 u, jadi lantai dan rung dekat backdrop muncul **di atas** jalur MC saat MC rendah.
- **Menyusul pelan.** Drift baru mulai kalau selisih > 7 u selama 2.5 detik, kecepatannya selalu
  terpotong 0.9 u/detik, lalu berhenti ~6.3 u sebelum sampai. Di The Climb: **~26 detik**.
- **Prison seperti gurun.** Recipe `prison` (`:1217-1247`): rubble, columns, arches, ruins,
  gatehouse dalam coklat pasir di bawah benda langit `furnace` oranye (`:179`).
- **Tekstur.** 12 family tekstur prosedural **32x32** Nearest (`:245-352`), beberapa family memakai
  layout sama (sand = bone, wetrock = granite, moss = bark), dan hanya dipasang sampai rung 19.
- **Tema berulang.** Ladder 30 depth (`difficulty.js:67-102`) hanya memakai 13 recipe; volcanic 6x,
  flooded 5x, swamp 4x. Varian dipilih dengan **hash depth**, bukan nama, jadi depth 12, 13, 15, 16,
  18, 20, 25, 28, 30 mendapat varian yang tidak cocok dengan labelnya.
- **Map "tertutup" tidak bisa terlihat tertutup.** Corridor, carved, boss, dan safe tidak punya atap
  tile maupun dinding belakang, dan renderer tidak menggambar apa pun di belakang tile kosong
  (`renderer3d.js:1955-2006`). Backdrop terlihat lewat setiap sel kosong.
- **Map banjir kontradiktif.** `water.js` selalu membuat gua beratap batu (baris 0-2), sementara
  backdrop swamp dan flooded berupa langit terbuka (depth 6, 8, 12, 13, 18).
- **Nama di HUD salah.** HUD menampilkan nama **palet** (`biomes.js`), bukan label ladder; depth 3
  "Deep Cave" dan 14 "Glowworm Caves" sama-sama tertulis THE CAVE MOUTH. Semua biome memakai blok bata
  yang sama yang hanya diwarnai ulang; papan platform, pintu, dan air (`0x3f8fc8`) sama di semua map.
- **Menambah satu map butuh edit di 6 tempat:** LADDER, palet `biomes.js`, THEMES `renderer3d.js`,
  CURVE/HEROES/RECIPE `backdrop3d.js`, `BIOME_AFFINITY`, dan `GRADE_TWEAK` `postfx.js`.
- **MC pucat dan kaku.** Kepala satu kotak kulit `0xffd9b0`, mata 0.07x0.09 tanpa putih mata,
  rambut 2 kotak (`voxel.js:100-193`). Lampu yang dibawa MC ada di `z = 1.2` tepat di depan wajah
  (`renderer3d.js:683, 701`, 1.85 x lamp sampai 1.62) plus ACES, jadi kulit dan baju meledak putih.
  Idle cuma bob 1.4 px; tidak ada napas, kedip, atau ekspresi; rambut dan jubah kaku.

## Batasan

- **`file://` wajib jalan** (`index.html:42`). Chrome menolak gambar file:// untuk WebGL, jadi
  tekstur dikirim sebagai data URI di dalam file `.js` biasa.
- **`.assetsignore` membuang `assets/`, `docs/`, `tools/` dari deploy.** Hasil bake masuk ke `src/`.
- `chibiSkeleton` dipakai 15 monster; fitur khusus MC harus di builder MC sendiri.
- **Kontrak rig MC** dipakai `poseHero`, `HERO_POSES`, `gripWeapon`, `shatterModel`: `root` (kaki),
  `torso` (pinggul), `head` (leher), `armL/armR` (bahu, tangan di -0.34), `legL/legR` (pinggul).
- Potret HUD, bag, profile, dan cutscene memakai **sprite 2D** (`sprites.js` heroRows). Doll 3D di
  bag pernah dicoba lalu **dibatalkan atas permintaan user** (`ui/ui.js:1231-1235`), jadi tetap 2D.
- Pemakai API backdrop: `R3D.themeGroup`, `R3D.backdrop` (report), `R3D.lightRig.horizonY/Shift`
  (dipakai `shoot-phase6.js`), `DS.Backdrop.*`, dan `tools/qa/lib/backdrop-page.js:28-41`.
- `BOSS_ROTATION` (`difficulty.js:147`) hanya punya 6 slot act; `tests/acts.test.js:61-70` mengikatnya.
- Mesin cloud tanpa GPU (~1 fps): semua alat QA baru harus **menjeda loop dan menggerakkan sim
  frame demi frame** (pola `shoot-phase6.js`).

---

## Fase 0: Persiapan dan perbaikan cepat

- `docs/PLAN-v7.md` dari plan ini; `docs/HANDOFF-v7.md`. Temuan agen peninjau yang masih berjalan
  (daftar konstanta generator yang terikat tinggi 22 baris, dan semua pemakai `horizonY`,
  `settleStage`, `lightRig`, `skyRig` di `backdrop3d.js`/`renderer3d.js`/`shoot-phase6.js`) dimasukkan
  ke `PLAN-v7.md` sebelum Fase 1 dan 2 dikerjakan.
- **Bug senjata hilang setelah ganti armour** (`renderer3d.js:2476-2487`): `disposeModel` ikut
  membuang senjata, dan karena `heroWeaponRef` tidak berubah senjata tidak di-grip ulang. Fix:
  reset `heroWeaponRef` di cabang rebuild.
- **Jam diorama menu beku** (`menu.js:207` mengirim `1/60` konstan; `camp3d.js:215` memakai `dt`
  sebagai waktu absolut): semua animasi menu diam. Fix: waktu akumulatif.
- **Alat QA baru `tools/qa/shoot-maps.js`**: per depth, kamera ditaruh langsung (sim dijeda) di
  posisi **terbawah / tengah / teratas** jangkauan kamera x kiri / tengah / kanan, lalu satu
  contact sheet. Dijalankan sekarang sebagai **baseline "sebelum"**, dan dipakai di setiap fase.

## Fase 1: Backdrop jadi diorama world-space raksasa (fix screenshot 1-2)

Prinsip, menggantikan "horizon dikunci lalu menyusul":

1. **Diam di world-space, dibangun dari ukuran level.** Modul murni baru `src/core/worldframe.js`
   (diuji di `tests/worldframe.test.js`):
   - `cameraRange(map, rig)`: min/max posisi kamera di level itu, dari `clampCam`
     (`renderer.js:107-115`) dan `updateRig`.
   - `coverageAt(D)`: persegi di bidang `z = -D` yang terlihat dari frustum kamera di semua posisi
     itu. Dihitung dengan memotong 4 sinar sudut frustum di posisi ekstrem, untuk semua preset
     kamera dan zoom 0.88..1.
   Setiap recipe **wajib mengisi penuh** persegi itu per rung: strata bawah (tanah, laut, jurang)
   sampai di bawah batas bawah, lalu tengah, lalu atas (tebing, dinding, puncak), lalu "tutup"
   (langit untuk map terbuka, kubah atau langit-langit untuk map tertutup) di atas batas atas.
   `themeGroup.position.y` tetap 0, jadi tidak ada lock, drift, atau menyusul. Naik tinggi berarti
   melihat bagian atas dunia; turun berarti melihat bagian bawahnya.
2. **Skala raksasa.** Ladder rung (`[4.5 .. 68]`) ditambah 2-3 rung jauh (~110, 180, 300 u)
   untuk landmark raksasa, sehingga naik 50 u hanya menggeser latar jauh sedikit. Far plane kamera
   320 dinaikkan (~800), dan densitas `FogExp2` di-tune per map.
3. **Tidak ada geometri backdrop di depan bidang main.** Aturan keras: semua mesh backdrop
   `z < -1.5` (di belakang tile). Slab langit-langit dihapus. Map tertutup memakai kubah atau
   langit-langit **per rung**, di belakang bidang main dan di atas batas coverage rung itu.
4. **Tidak ada yang mengambang.** Setiap band kind mendeklarasikan anchor: `ground`, `ceiling`,
   `wall`, atau `free` (hanya awan, burung, debu, kristal sihir). Stalaktit dan es gantung dibangun
   dari permukaan langit-langit rung itu sendiri. `capToRoof` dan `settleStage` dihapus.
5. **Benda langit tetap menempel ke kamera** (matahari "tak terhingga" memang tidak berparalaks).
   Di map tertutup matahari berada di balik dinding jauh berjendela jeruji, jadi ia hanya
   **kadang terlihat di sela jeruji** tergantung posisi kamera. God rays dan key light diarahkan
   dari jendela.
6. **Waktu:** `Backdrop.update` diberi `simDt`, bukan `0.016` per render (`renderer3d.js:4855`).
7. **Performa:** geometri dibangun sekali per level, merge atau instancing per rung per material,
   target build di bawah ~100 ms dan anggaran draw call tetap (`DRAW_BUDGET`, dinaikkan kalau perlu
   dengan angka terukur).

File: `src/core/worldframe.js` (baru); `src/core/backdrop3d.js` (build baru menerima `extents` dan
coverage per rung); `src/core/renderer3d.js` (hapus blok `HORIZON_*`, `horizonY/Vel/Goal`,
`settleStage`; far plane; pertahankan `R3D.lightRig.horizonY/horizonShift` sebagai nilai tetap
supaya QA lama tetap jalan); `index.html` (script baru).

Verifikasi:
- `tools/qa/audit-backdrop.js` ditulis ulang (deterministik): (a) **coverage** dari grid posisi
  kamera di seluruh jangkauan level, termasuk puncak dan dasar; setiap sinar harus mengenai
  backdrop atau langit; (b) **tidak ada mesh backdrop dengan z > -1.5**; (c) **anchor**: sinar dari
  puncak setiap ornamen gantung mengenai langit-langitnya dalam epsilon, dan dari dasar ornamen
  berdiri mengenai tanahnya; (d) transform backdrop **konstan** selama memanjat; (e) waktu build dan
  draw call.
- `shoot-maps.js` di depth 2, 3, 7, 8, 13, 22: **tidak ada pita gelap, tidak ada stalaktit
  mengambang, tidak ada backdrop di atas jalur MC**, dibandingkan baseline Fase 0.
- `npm test`, `node tools/qa/probe-load.js`, `shoot-phase6.js` (kamera tetap diam saat lompat).

## Fase 2: Level diperbesar

Ukuran sekarang (tile) dan target:

| Flavor | Sekarang | Target | Catatan |
|---|---|---|---|
| corridor | 180-280 x 22 | ~320-480 x 28 | beberapa segmen dua lantai (jalur atas dan bawah) |
| carved (parkour) | 180-260 x 22 | ~300-440 x 32 | baris jalan 5-20 menjadi rentang yang diskalakan |
| flooded | 120 x 22 | ~220 x 30 | air lebih dalam, lebih banyak ruang renang |
| mountain (The Climb) | 96 x 34 | ~128 x 60 | pendakian hampir 2x lebih tinggi |
| boss arena | 40 x 22 | ~64-80 x 30 | arena bertema per boss dengan platform |
| safe | 20 x 22 | ~40 x 22 | kemah pedagang |
| trial | 112 x 22 | ~160 x 26 | |

- Tabel ukuran baru `DS.LevelSize` (per flavor) dikonsumsi generator; konstanta yang sekarang
  ditulis mati di-parameterkan: `ROOM_H 22` (`generator.js:18`), `TOP_ROW/BASE_ROW`
  (`parkour.js`), baris pantai 12 (`water.js`), `MAP_W/MAP_H` (`mountain.js:23-24`,
  `trial.js:28-35`), jumlah ruang (`generator.js:491, 888`).
- Dua langkah supaya aman: **2a** lebarkan semua flavor (risiko rendah, `solve` harus tetap 0),
  lalu **2b** tinggikan carved, mountain, flooded, dan boss.
- **Opsi atap per map:** corridor dan carved mendapat atap tile opsional (seperti trial) untuk map
  tertutup (penjara, gua, Tartarus). Atap batu `water.js` dibuat opsional supaya rawa terbuka tidak
  lagi beratap gua. Opsi ini dibaca dari definisi map (Fase 4-6).
- Spawn, peti, dan hazard sudah per segmen, jadi ikut naik. Kepadatan dijaga, bukan totalnya.
  Harga toko dan ekonomi koin dicek ulang.
- Tile level sudah `InstancedMesh` (`renderer3d.js:1967-1971`), jadi level besar tidak menambah
  draw call. Coverage backdrop Fase 1 otomatis mengikuti ukuran baru.

Verifikasi: `npm run solve 50` (0 exit tak terjangkau, 4 metrik anti-melayang tetap 0; waktu per
floor dicatat); `tests/worldgen.test.js` ditambah asersi ukuran; `check-climb.js`, `check-hangs.js`;
`shoot-maps.js`. Frame time lokal (`qa:frame`) harus dicek user karena cloud tanpa GPU.

## Fase 3: Tekstur CC0 HD

- **Sumber** (sudah dicek bisa diunduh dari sesi ini): ambientCG (utama) dan Poly Haven (cadangan),
  keduanya CC0. Contoh aset dari katalog: logam karat `MetalPlates013`, `Rust009`,
  `CorrugatedSteel007A`; marmer `Marble012/016/021`, `Travertine009`; bata `Bricks075A/097`; batu
  `Rock030/035/051/058/063`; paving `PavingStones138/150`; lava `Lava001..005`; es/salju `Ice002`,
  `Snow006/014`; lumut `Moss002`; pasir `Ground054/080`; kulit kayu `Bark012`; papan `Planks037A`;
  emas `Metal048A`; ubin `Tiles074/141`.
- **Manifest** `tools/assets/textures.json` (id internal, sumber, asset id, lisensi, ukuran bake,
  opsi desaturasi supaya bisa di-tint per map). Kredit di `ASSETS.md`.
- **Unduh:** `tools/assets/fetch-textures.sh` (curl + unzip, albedo saja) ke `tools/assets/cache/`
  (gitignored).
- **Bake:** `tools/assets/bake-textures.js` lewat headless Chromium (`tools/docs/cdp.js` + canvas),
  tanpa dependency baru: resize ke 256 px (128 px untuk rung jauh), JPEG, lalu tulis data URI ke
  `src/art/textures/common.gen.js` plus satu file per act (`act1.gen.js` dst.) yang dimuat saat act
  dimulai (script tag dinamis, tetap jalan di file://). Target total di bawah ~1.5 MB.
- **Runtime:** modul baru `src/core/texlib.js` (`DS.TexLib.get(id, repeat)`): cache per id,
  `RepeatWrapping`, mipmap, anisotropy. Kerapatan texel konstan per kedalaman (`d / REF_D`).
  Dipasang di **semua rung**, bukan hanya sampai rung 19. Kalau data gagal dimuat, fallback ke
  tekstur prosedural lama.
- **Tile level** (dinding, lantai, platform) ikut memakai tekstur HD per map supaya serasi dengan
  backdrop, di balik satu flag (`DS.TexLib.tiles`) sehingga bisa dimatikan kalau user kurang suka.

Verifikasi: `shoot-maps.js` sebelum dan sesudah; ukuran file gen dicatat; `probe-load.js` tanpa
error; tes bahwa setiap id di manifest ada di file gen (`tests/textures.test.js`).

## Fase 4-6: Semua map dirombak, per act

Dikerjakan **per act** supaya setiap akhir fase bisa dimainkan: **Fase 4 = Act I**, **Fase 5 =
Act II**, **Fase 6 = Act III Yunani**. Monster khas tiap map (daftar di bawah) dikerjakan di fase
act yang sama.

### Definisi map tunggal

- **Satu map = satu entri** di `src/world/maps/act1.js`, `act2.js`, `act3.js`, `special.js`
  (safe room, trial). Isinya semua yang sekarang tersebar di 6 tempat: label (bahasa Inggris seperti
  UI sekarang), flavor generator, opsi atap, ukuran, palet tile dan tekstur HD (dinding, lantai,
  platform), warna air, gaya pintu, fog, ambient/hemi/key light, grade, recipe backdrop, benda
  langit, roster monster, boss, dan ambience suara. LADDER, `biomes.js`, THEMES, CURVE/HEROES/RECIPE,
  `BIOME_AFFINITY`, dan `GRADE_TWEAK` diturunkan dari definisi ini, jadi menambah map cukup satu entri.
- **Tidak ada lagi varian hash:** setiap depth punya map-nya sendiri. HUD dan banner menampilkan
  **nama map** itu, bukan nama palet.
- `backdrop3d.js` (3139 baris) dipecah menjadi `src/core/backdrop/`: `core.js` (builder, strata,
  anchor, coverage) dan `kinds-*.js` (band kind per keluarga: alam, gua, arsitektur, penjara,
  Yunani). Tetap classic script di `index.html`.
- `light` per map: `sun | moon | window | crystal | lava | soulfire | storm | none`, dengan arah,
  warna, dan apakah langit terlihat. Key light dan god rays datang dari sumber itu.
- **Map tertutup mendapat dinding belakang yang menerus** tepat di belakang level (rung terdekat):
  blok sel dan jendela jeruji di penjara, dinding batu di gua. Backdrop jauh hanya terlihat lewat
  jendela, mulut gua, atau retakan. Ini yang membuat penjara benar-benar terasa tertutup.
- **Trial** memakai palet act-nya sendiri, bukan palet depth yang diselanya.
- Band kind baru yang dibutuhkan (contoh): blok sel bertingkat, jendela berjeruji + matahari,
  rantai dan sangkar gantung, catwalk, menara jaga; pilar Doria/Ionia, kuil berpedimen, patung
  dewa raksasa, dinding labirin, fresko; landasan dan automaton; titan terantai; sungai Styx dan
  perahu; singgasana; lautan awan; benang cacing bercahaya; akar bakau; rumah panggung; tangga
  spiral; air terjun beku; kerangka raksasa; jaring; mulut gua yang membingkai dunia luar.

### Act I: Turun ke Bumi (Fase 4)

Kolom **Atas/Bawah** adalah yang terlihat saat MC naik tinggi atau turun jauh.

| D | Map | Konsep | Cahaya | Atas / Bawah | Landmark | Tekstur |
|---|---|---|---|---|---|---|
| 1 | **The Shore** (Pantai Senja) | Pantai berbatu senja, tumpukan batu laut, tebing | Matahari rendah di atas laut, backlight | Atas: tebing, sarang camar, mercusuar jauh. Bawah: dasar laut dangkal | Bangkai kapal | pasir, batu basah, papan |
| 2 | **The Cave Mouth** | Di dalam lengkung pintu gua raksasa; lubang gua di belakang membingkai laut | Matahari **hanya lewat mulut gua** | Atas: kubah gua, stalaktit menempel. Bawah: kolam, stalagmit | Air terjun dari retakan atap | batu gua, lumut |
| 3 | **The Deep Cave** | Jamur bercahaya, urat kristal, sungai bawah tanah | Pendar jamur/kristal, tanpa langit | Atas: pilar alam + jembatan tali tertambat. Bawah: sungai | Jamur raksasa | batu gelap, kristal |
| 4 | **The Rusted Prison** (teka-teki) | Blok sel bertingkat (panopticon), jeruji, catwalk, rantai, sangkar gantung | **Tanpa langit**; matahari hanya di balik jendela berjeruji, sinar menembus masuk | Atas: balok atap, rantai, sangkar. Bawah: selokan, jeruji drainase | Menara jaga di tengah | besi karat, bata, paving basah |
| 5 | **The Warden's Gate** (boss Stone Warden) | Aula gerbang benteng dipahat di gunung, patung penjaga, portcullis | Brazier + celah cahaya di atas gerbang | Atas: relief raksasa. Bawah: parit | Gerbang raksasa | granit, bata benteng |
| 6 | **The Rot Swamp** | Pohon mati berlumut gantung, kabut, will-o-wisp, gubuk panggung | Bulan di balik kabut | Atas: kanopi ranting mati. Bawah: air keruh, akar | Pohon mati raksasa | kulit kayu, lumpur, papan lapuk |
| 7 | **The Climb** (floor boss Warden) | Gunung alpen: pinus di bawah, puncak salju | Matahari terang | Atas: **lautan awan**, puncak jauh, elang. Bawah: lembah pinus | Puncak utama | batu gunung, salju |
| 8 | **The Sunk Halls** | Istana kebanjiran, kolonade terendam, lampu gantung berantai | Sinar dari kubah pecah, kaustik | Atas: kubah retak. Bawah: aula bawah air | Kubah pecah | marmer kusam, paving |
| 9 | **The Ash Reaches** | Dataran vulkanik, badai abu, menara obsidian, sungai lava | Matahari merah di balik abu + lava | Atas: awan abu. Bawah: sungai lava | Gunung berapi meletus | batu vulkanik, lava |
| 10 | **The Slime Throne** (boss Slime King) | Aula singgasana dikuasai lendir, pilar menetes, air terjun lendir | Pendar lendir + jendela katedral | Atas: kubah. Bawah: kolam lendir | Singgasana raja | marmer, emas kusam |

### Act II: Kedalaman Tenggelam (Fase 5)

| D | Map | Konsep | Cahaya | Atas / Bawah | Landmark | Tekstur |
|---|---|---|---|---|---|---|
| 11 | **The Wet Dark** | Gua hitam menetes, hujan dari retakan | Hampir hanya lampu MC dan obor | Atas: retakan berair. Bawah: genangan | Retakan besar | batu basah |
| 12 | **The Mire** (rawa bakau) | Akar bakau melengkung, kunang-kunang, teratai raksasa | Senja hijau berkabut | Atas: kanopi bakau. Bawah: akar di air | Bakau raksasa | kulit kayu, lumut |
| 13 | **The Drowned Stair** | Tangga spiral raksasa turun ke kota tenggelam | Cahaya dari mulut sumur | Atas: bibir sumur. Bawah: kota terendam | Tangga spiral | batu kota, paving |
| 14 | **The Glowworm Caves** | Atap penuh benang cacing bercahaya seperti langit berbintang, danau cermin | Pendar biru dari atap | Atas: benang tertambat di atap. Bawah: pantulan danau | Danau cermin | batu gua |
| 15 | **The Arbiter's Court** (boss) | Aula pengadilan, timbangan emas, barisan patung hakim | Kaca patri | Atas: kubah kaca patri. Bawah: marmer | Timbangan emas | marmer, emas |
| 16 | **The Sinking Fen** | Desa panggung miring tenggelam, menara lonceng | Lentera + bulan | Atas: menara lonceng. Bawah: rumah tenggelam | Lonceng miring | papan, genteng |
| 17 | **The Brood Nest** | Jaring tertambat antar dinding, kantong telur, kepompong | Pendar hijau telur | Atas: jaring di atap. Bawah: telur | Bangkai ratu sarang | batu, jaring |
| 18 | **The Black Lake** | Danau bawah tanah luas, pulau kuil runtuh, lampu hantu | Lampu hantu pucat | Atas: atap gua jauh. Bawah: air hitam | Kuil di pulau | batu |
| 19 | **The Frost Caves** | Gua es, air terjun beku, es gantung, mamut dalam es | Cahaya es kebiruan | Atas: es gantung tertambat. Bawah: danau beku | Air terjun beku | es, salju |
| 20 | **The Wyrm's Hollow** (boss Frost Wyrm) | Gua gletser dengan kerangka wyrm purba | Aurora menembus atap es tipis | Atas: atap es. Bawah: jurang es | Kerangka raksasa | es, tulang |

### Act III: Mahkota Para Dewa, Yunani (Fase 6)

| D | Map | Konsep | Cahaya | Atas / Bawah | Landmark | Tekstur |
|---|---|---|---|---|---|---|
| 21 | **The Labyrinth of Minos** (floor boss Minotaur) | Istana Knossos: pilar merah Minoa, fresko banteng, dinding labirin sampai cakrawala | Matahari Mediterania | Atas: dinding labirin tanpa ujung. Bawah: lorong gelap | Kepala banteng batu | batu kapur, plester |
| 22 | **The Slopes of Olympus** | Tangga marmer mendaki gunung berawan, reruntuhan kuil, petir di awan | Matahari keemasan | Atas: kota emas Olympus. Bawah: lautan awan | Kuil di tebing | marmer, batu |
| 23 | **The Gorgon's Garden** (floor boss Medusa) | Taman prajurit yang membatu, pohon zaitun, kuil pecah | Senja kehijauan | Atas: kuil di bukit. Bawah: kolam | Patung korban | marmer retak, lumut |
| 24 | **Tartarus** (penjara para Titan) | Titan raksasa dirantai di latar, rantai sebesar menara hilang ke gelap, gerbang perunggu | **Tanpa langit**, merah dari jurang | Atas: rantai ke gelap. Bawah: jurang menyala | Titan terantai | perunggu, batu hitam |
| 25 | **The Halls of Hades** (boss Hades) | Sungai Styx, perahu Charon, padang asphodel, api jiwa biru | Api jiwa biru | Atas: atap dunia bawah. Bawah: Styx | Gerbang Cerberus | obsidian, batu hitam |
| 26 | **The Storm Summit** | Puncak Olympus dalam badai, jembatan marmer antar puncak (tertambat) | Kilat + matahari di sela awan | Atas: awan badai. Bawah: jurang awan | Pilar petir | marmer, batu |
| 27 | **The Forge of Hephaestus** (floor boss Talos) | Dalam gunung berapi: landasan raksasa, automaton setengah jadi, katrol, kanal lava | Lava + tungku | Atas: katrol, rantai. Bawah: kanal lava | Tungku raksasa | perunggu, batu vulkanik |
| 28 | **The Golden Halls** | Aula para dewa, 12 singgasana raksasa, lantai awan | Matahari keemasan | Atas: kubah emas. Bawah: awan | Singgasana 12 dewa | marmer putih, emas |
| 29 | **The Temple of Apollo** | Kuil emas, kereta matahari, kolom menyilaukan | Matahari besar (bloom dibatasi) | Atas: kereta matahari. Bawah: tangga kuil | Kereta matahari | marmer, emas |
| 30 | **The Throne of Zeus** (boss Zeus) | Puncak Olympus di atas badai, singgasana dan patung Zeus | Kilat + langit badai | Atas: langit badai. Bawah: awan | Patung Zeus | marmer, emas |

### Ruang khusus

- **Safe room**: Act I-II kemah pedagang di ceruk gua; Act III **Temple of Hestia** (dewi perapian).
- **Trial**: Act I-II arena sang Arbiter; Act III **Arena of Heroes** (koloseum).
- **Endless**: memutar 30 map dengan tint "korupsi" yang makin tebal per putaran.

Verifikasi per act: `shoot-maps.js` (bawah/tengah/atas) untuk setiap depth act itu;
`audit-backdrop.js` untuk depth itu; map tertutup (4, 24, gua): **tidak ada mesh langit**, dan
benda langit hanya terlihat di dalam bukaan jendela atau mulut gua; HUD dan banner menampilkan nama
map yang benar; test baru bahwa setiap depth 1-30 punya definisi map lengkap (label, recipe,
palet, roster, light); `npm test`; `npm run solve 50`; `probe-load.js`.

## Monster baru (di Fase 4-6, bersama map-nya)

- **Spawn per map, bukan per depth global.** Sekarang setiap jenis dengan `minDepth` mendapat bobot
  `min(60, 8 + (d - minDepth) * 5)`, jadi ~10 depth setelah terbuka semua jenis mentok 60 dan saling
  mengencerkan (`enemies.js:86-115`). Diganti roster eksplisit per map (4-7 jenis berbobot).
  Rumus lama tetap dipakai untuk endless.
- **Visual rank:** elite, miniboss, dan colossal sekarang hanya beda skala. Tambah penanda
  (aura, mahkota, tanduk) sesuai rank.
- **Telegraf 3D:** penanda SMITE boss, kunci keybearer, dan busur wind-up hanya digambar di 2D,
  jadi tidak terlihat di mode voxel (`bosses.js:397, 421-432`; `enemies.js:771, 809-852`).
  Dibuat versi 3D.
- **Ukuran boss:** model Slime King ~1.0 u untuk hitbox 2.4x1.8 u; boss belum punya `sizeScale`.
- **Titik sentuh per monster** (dari audit): config + `behavior` (pakai ulang `beginAttack`,
  `strikePlayer`, `meleeBox`, `walkToward`, `flyerBrain`), builder voxel + `BUILDERS/HEIGHT`, roster
  map, `TELL_SFX` + suara, `tests/spawn.test.js`, `tests/acts-bosses.test.js`,
  `tools/qa/check-bestiary.js`, `docs/06-bestiary.md`. Sprite 2D tidak dibutuhkan, tetapi
  `cfg.sprite` harus menunjuk pack yang ada.

Roster (**A** = prioritas, satu identitas per map; **B** = variasi tambahan):

| Map | Sudah ada | Baru |
|---|---|---|
| 1 Shore | slime, bat | **A** kepiting (menjepit, blok dari depan), B camar penukik |
| 2 Cave Mouth | bat, zombie, spitter | **A** jamur spora (awan racun saat didekati) |
| 3 Deep Cave | spider, bat, skeleton | **A** kumbang kristal (menggulung lalu menerjang) |
| 4 Rusted Prison | skeleton, shielder | **A** sipir kerangka (lentera, rantai penarik), **A** tahanan terantai (menerjang sejauh rantainya), B kawanan tikus got |
| 6 Rot Swamp | zombie, spitter, bomber | **A** penghuni rawa (menyergap dari lumpur), B katak dukun |
| 7 The Climb | golem, skeleton, bat | **A** kambing gunung (menyeruduk, mendorong dari tebing), B elang |
| 8 Sunk Halls | piranha, wraith, shielder | **A** ksatria tenggelam |
| 9 Ash Reaches | bomber, golem, necromancer | **A** anjing abu (berkelompok, jejak api) |
| 11 Wet Dark | spider, wraith | **A** belut gua |
| 12 Mire | spitter, bomber | B nyamuk raksasa, B katak dukun |
| 13 Drowned Stair | piranha, harpy, icewisp | ksatria tenggelam (dari map 8) |
| 14 Glowworm Caves | spider, icewisp | **A** cacing kunang (menggantung di atap, menjerat) |
| 16 Sinking Fen | zombie, wraith, necromancer | **A** penenggelam (hantu desa) |
| 17 Brood Nest | spider | **A** kantong telur (menetaskan anak laba-laba) |
| 18 Black Lake | wraith, piranha, cultist | B roh danau |
| 19 Frost Caves | icewisp, golem | **A** troll es, B serigala es (berkelompok) |
| 21 Labyrinth | shielder | **A** hoplite kerangka (formasi perisai, tusukan tombak) |
| 22 Olympus Slopes | harpy | **A** centaur pemanah (menjaga jarak), B satir (melompat) |
| 23 Gorgon's Garden | hoplite | **A** gorgonit (tatapan membatu = lambat), B ular batu |
| 24 Tartarus | cultist, magmacrab | **A** furia/Erinyes (terbang, cambuk), B budak titan |
| 25 Halls of Hades | wraith | **A** bayangan (shade), B anak Cerberus (3 gigitan) |
| 26 Storm Summit | harpy, centaur | B roh badai |
| 27 Forge of Hephaestus | magmacrab, golem, bomber | **A** automaton perunggu (bisa overheat) |
| 28 Golden Halls | hoplite | **A** cyclops (hantaman + lempar batu) |
| 29 Temple of Apollo | cultist | **A** pendeta matahari (caster), B griffin |

Total: **22 monster prioritas A** dan **13 variasi B** (katak dukun dan ksatria tenggelam dipakai
di dua map). Depth boss (5, 10, 15, 20, 25, 30) tidak
punya spawn biasa, hanya tambahan yang dipanggil boss.

Boss:
- **Act boss:** d5 Warden, d10 Slime King, d15 Arbiter, d20 Frost Wyrm (tetap); d25 **Hades** (baru:
  api jiwa, panggil bayangan, sapuan bident) dan d30 **Zeus** (baru: sambaran petir, awan badai,
  hantaman guntur, fase 2 di tengah badai). `BOSS_ROTATION` dan `tests/acts.test.js` diperbarui.
- **Floor boss Act III** (seperti Warden di The Climb): **Minotaur** (d21, terjang + putaran kapak),
  **Medusa** (d23, sinar membatu + panah ular), **Talos** (d27, gerakan Magma Colossus dengan skin
  perunggu).
- **Lich dan Magma Colossus** pindah ke rotasi boss endless, tidak dibuang.
- Arena boss dibuat bertema per boss (bukan satu template datar `generator.js:267-280`).

## Fase 7: MC baru (voxel natural, lebih detail)

- **Builder khusus MC** di `voxel.js` (tidak mengubah `chibiSkeleton`), dengan kontrak rig yang
  sama. Siku dan lutut ditambahkan sebagai anak `armL/armR/legL/legR`, jadi `poseHero` lama tetap
  jalan; `HERO_POSES` dan `gripWeapon` di-tune ulang ke proporsi baru.
- **Proporsi:** kepala ~35% tinggi, leher, bahu, dada lebih lebar dari pinggang, tangan, sepatu bot.
- **Wajah voxel:** mata 2x3 (putih mata, iris, pupil, highlight), alis, hidung, mulut, pipi.
  Kedip tiap 2-6 detik, iris mengikuti arah bidikan atau hadap, ekspresi saat serang, kena hit, mati,
  dan dapat loot (`src/art/faces.js` yang tidak pernah dipakai bisa jadi acuan emosinya).
- **Rambut berlapis** (massa atas, poni 3 helai, samping, ekor rambut 3 segmen, ahoge) dan **baju**
  (jaket berkerah, kemeja, sabuk bergesper dan kantong, **syal merah** 3 segmen, pelindung lengan,
  celana, bot). Acuan: `assets/generated/cute_hero.png` dan head 2D di `sprites.js:27-48`.
- **Gerak:** napas idle, fidget sesekali, lari dengan counter-rotation, dan **rantai pegas** untuk
  syal, ekor rambut, dan poni (helper murni baru di `src/core/anim.js`, diuji). Hit flash dan
  kedip i-frame untuk MC (sekarang `flashModel` hanya dipakai musuh).
- **Draw call:** voxel per segmen di-merge jadi satu geometri ber-vertex-color (helper merge kecil;
  `BufferGeometryUtils` tidak di-vendor). Target ~12 draw call untuk seluruh MC.
- **Armour gaya 3D:** `DS.Armor.styleFor` (plume, horns, crown, dst.) sekarang diabaikan di 3D, jadi
  semua helm terlihat sama. Setiap gaya dapat bentuk sendiri; helm menggantikan massa rambut atas
  tetapi poni tetap. Armour bone (`#d8d5e8`) diredam supaya tidak putih.
- **Pencahayaan:** lampu MC dipindah dari depan wajah (lebih jauh dan lebih tinggi, decay lebih
  tajam); warna kulit lebih hangat.
- **Diorama menu:** MC ikut bernapas dan berkedip (handle model disimpan di `camp3d.js`).
- **2D ikut diselaraskan:** baris sprite hero, palet, dan crest di `sprites.js` / `paperdoll.js`
  disesuaikan dengan desain baru (syal, rambut), jadi potret HUD, bag, profile, dan cutscene cocok.
- Name tag dinaikkan kalau rambut atau plume lebih tinggi (`ui-html/world.js:299`).

Verifikasi: `tests/hero-model.test.js` (kontrak rig lengkap, jumlah draw call di bawah target,
setiap gaya armour menghasilkan geometri berbeda); tes rantai pegas di `tests/anim.test.js`;
`shoot-phase8.js` dan tangkapan close-up wajah (idle, kedip, serang, kena hit) di 720/1080p;
cek bahwa senjata tetap ada setelah ganti armour.

## Fase 8: Suara, dokumen, review

- Suara monster dan boss baru (`TELL_SFX`, `ROARS`), ambience per map (tetes air gua, rantai dan
  gema penjara, angin gunung, guntur Zeus, bisikan Styx) lewat `DS.Audio` prosedural.
- Dokumen: `docs/11-v7.md`, perbarui `docs/08-systems.md` §8.3 (basi), `06-bestiary.md`,
  `07-world.md`; `CHANGELOG.md` v7.0.0; cache-buster `?v=7.0.0`.
- `/code-review` per fase sebelum commit.

## Verifikasi keseluruhan

- `npm test` hijau di setiap commit; test baru: `worldframe`, `textures`, `hero-model`, roster
  spawn per map, dan asersi ukuran level.
- `npm run solve 50`: 0 exit tak terjangkau; `floatingRungs`, `orphanRopes`, `halfLadders`,
  `pillarsInCorridor` tetap 0.
- `tools/qa/audit-backdrop.js` (versi baru) untuk depth 1-30 dan contoh endless.
- `tools/qa/shoot-maps.js`: contact sheet sebelum dan sesudah per fase, dikirim ke user.
- `probe-load.js`, `check-climb.js`, `check-hangs.js`, `check-bestiary.js` (dibuat deterministik,
  karena sekarang time out di cloud).
- Yang harus dicek user di lokal (tanpa GPU di cloud): frame time `qa:frame`, dan suara.

## Hal terbuka untuk user

- Level lebih besar berarti run lebih lama. Perlu checkpoint di tengah level atau tidak?
- Opsional: tombol "lihat dunia" (tahan untuk zoom out sesaat) supaya dunia raksasa bisa
  dinikmati; coverage Fase 1 akan dihitung untuk zoom terjauhnya bila disetujui.

---

## Lampiran Fase 0: temuan pemakai API (dikumpulkan sebelum Fase 1-2)

### Yang harus diubah atau dihapus di Fase 1 (semuanya di `renderer3d.js`)

| Baris | Isi | Nasib |
|---|---|---|
| 69-82 | `themeGroup`, `horizonY/Goal/Vel`, `HORIZON_DEAD/WAIT/SPEED/DT` | dihapus; `horizonY` jadi nilai tetap untuk QA lama |
| 1230-1256 | `buildTheme`: reset `horizonY = anchorY`, `themeGroup.position.y = 0`, `Backdrop.build`, `skyRig` | diganti: `Backdrop.build(env, themeName, extents)` |
| 4647-4648 | `skyRig.position.y = camera.position.y - themeGroup.y` (langit ikut kamera) | tetap, tetapi hanya untuk benda langit dan bintang |
| 4670-4696 | blok drift horizon (`horizonAway`, `wantVel`, `themeGroup.position.y = horizonY - themeAnchorY`) | dihapus |
| 4857 | `Backdrop.update(time, 0.016)` | diganti `simDt` |
| 4978, 4994-4997 | getter `themeGroup`, `lightRig.horizonY/horizonShift` | dipertahankan (nilai tetap) |

### Pemakai API backdrop di luar `backdrop3d.js`

- `renderer3d.js:1215` `DS.Backdrop.heroLight(themeName, yaw)`; `:1256` `DS.Backdrop.recipe(themeName)`
  (untuk `screenParticleManager`); `:2183-2194` `DS.Backdrop.instancedBoxes` (dipakai **tile level**, jadi
  helper ini harus tetap ada setelah `backdrop3d.js` dipecah); `:4484-4485` `heroInfo()`.
- `tools/qa/audit-backdrop.js`: `DS.Backdrop.themeNames/rungs/drawBudget/heroSpan`, `DS.R3D.backdrop`
  (`draws`, `variant`, `hero`, `anchorY`, `wu`). Ditulis ulang di Fase 1.
- `tools/qa/lib/backdrop-page.js`: menelusuri `themeGroup` (cakram benda = plane lebar `2 * hero.r`) dan
  `R3D.backdrop.hero.worldX`. Harus diadaptasi kalau bentuk report berubah.
- `tools/qa/shoot-backdrop.js:87-90`, `shoot-phase6.js:58-61, 173-195` (`lightRig.horizonShift`,
  `keyDir`, `keyAimed`, `torches`, `emitters`).

### Konstanta generator yang terikat tinggi 22 baris

- `generator.js:18` `ROOM_H = 22`; dipakai `:289` (padding boss), `:382` `floorRow = ROOM_H - 2`,
  `:426` `ROOM_H - 3`, `:493`, `:846`, `:855`, `:909` (`DS.Map.create(..., ROOM_H)`), diekspor `:975`.
- `parkour.js:23-24` `TOP_ROW = 5`, `BASE_ROW = 20`; `:49-50` `rowFor` memakai keduanya.
- `water.js:22` `ROOM_H = 22`, `:24` `SHORE = 12` (lebar tepi kering, bukan baris).
- `mountain.js:23-24` `MAP_W = 96`, `MAP_H = 34`; `:248` `roomCount = floor(MAP_W / 20)`.
- `trial.js:28, 35` `MAP_H = 22`, `MAP_W = 112`; `:221` `roomCount`.

### Catatan alat QA

- `shoot-maps.js` memindahkan **hero bersama kamera** ke titik ekstrem. Level hanya diterangi lampu MC dan
  obor, jadi kamera yang diparkir jauh dari MC memotret hitam pekat. Akibatnya MC melayang atau berada
  di dalam batu di sebagian tangkapan: itu disengaja (sim dijeda).
- Baseline "sebelum" (`tools/qa/out/maps/before-v7/`, gitignored) sudah memperlihatkan bug plan ini:
  baris atas dan tengah di depth 2 hampir seluruhnya pita gelap dan slab, level hanya ada di baris bawah.
