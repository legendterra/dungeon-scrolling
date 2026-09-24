# Bab 9 - Register Isu

Inilah bagian yang diminta sebagai acuan kerja: **setiap isu punya nomor tetap**
supaya bisa disebut di commit, changelog, dan percakapan. Kolom **Bukti** memakai
label dari Bab 1: `[CODE:file:baris]` berarti dibaca dari sumber, `[RUNTIME]`
berarti diukur sambil game berjalan.

## Tingkat keparahan

| Tingkat | Arti |
|---|---|
| **S1** | Blocker: fitur tidak bisa dipakai, atau data/progres pemain bisa hilang. |
| **S2** | Mayor: fitur terlihat rusak, janji ke pemain tidak ditepati, atau build yang terbit salah isi. |
| **S3** | Minor: kualitas kode/aset, bloat repo, kode mati. |
| **S4** | Kosmetik/kerapian. |

## 9.1 Ringkasan

**Kolom Status** diperbarui pada **v5.2.0** (commit `feat(board)`): `SELESAI` berarti
perbaikannya sudah ada di kode **dan** sudah diukur/dijalankan lewat tool QA yang
disebut, bukan sekadar ditulis. Isu yang belum tersentuh tetap `TERBUKA`.

| ID | Judul singkat | Area | Tingkat | Bukti | Status (v5.2.0) |
|---|---|---|---|---|---|
| BUG-001 | Deploy mengunggah source tooling + 18 MB aset pengembangan | Penerbitan | S2 | CODE | **SELESAI** v5.1.0 |
| BUG-002 | Cache-bust tidak konsisten di `index.html` | Build/runtime | S2 | CODE | **SELESAI** v5.2.0 (semua `?v=5.2.0`) |
| BUG-003 | `camp3d.js` (298 baris) modul mati; menu tetap 2D | Scene | S2 | CODE | **SELESAI** v5.2.0 (dipakai; diukur `qa:menu`) |
| BUG-004 | `art/backdrop.js` (324 baris) modul mati | Art | S3 | CODE | **SELESAI** v5.2.0 (dihapus) |
| BUG-005 | `systems/lighting.js` sisa modul tanpa fungsi | Sistem | S3 | CODE | **SELESAI** v5.2.0 (dihapus) |
| BUG-006 | `updatePause`/`drawPause` kode mati di `game.js` | Scene | S3 | CODE | TERBUKA |
| BUG-007 | `ELEMENT_SHORT` tidak punya elemen `wind` | UI | S2 | CODE | **SELESAI** v5.2.0 (`wind`, `steam`) |
| BUG-008 | Tidak ada nama pemain, leaderboard, atau cloud save | Fitur | S2 | CODE | **SELESAI** v5.2.0 (`core/board.js` + Worker + D1) |
| BUG-009 | `Kit.audit()` tidak pernah dijalankan otomatis | QA | S2 | CODE | **TIDAK RELEVAN** v5.2.0 (kit dihapus; digantikan `npm run qa:frame`/`qa:menu`) |
| BUG-010 | `package.json` tanpa `scripts`, tidak ada `npm test` | DX | S4 | CODE | **SELESAI** v5.2.0 (`dev`, `solve`, `qa:*`, `docs:*`) |
| BUG-011 | `backup/` 1,4 MB (dua salinan penuh `src`) ter-commit | Repo | S3 | CODE | **SELESAI** v5.2.0 (untracked) |
| BUG-012 | `.codex/config.toml` (konfigurasi agen) ter-commit | Repo | S4 | CODE | **SELESAI** v5.2.0 (untracked) |
| BUG-013 | 127 screenshot pengembangan + art konsep ter-commit | Repo | S3 | CODE | **SELESAI** v5.2.0 (untracked) |
| BUG-014 | `drawControls` mengubah state di jalur gambar | UI/loop | S3 | CODE | **SELESAI** v5.2.0 (hitung mundur di `update()`) |
| BUG-015 | Readout kamera F6 ikut terkirim ke pemain | UI | S4 | CODE | **BUKAN BUG** v5.2.0 (muncul hanya setelah F6) |
| BUG-016 | Route custom domain hardcoded di `wrangler.jsonc` | Penerbitan | S3 | CODE | TERBUKA |
| BUG-017 | Jaminan "lantai bisa diselesaikan" belum diverifikasi ulang di runtime | Worldgen | S2 | perlu uji | **SELESAI** v5.2.0 (0/400 lantai, `qa:climb`) |
| BUG-018 | Latar belum bertekstur sesuai tema | Visual | S2 | CODE | TERBUKA |
| BUG-019 | UI seluruhnya huruf kapital bitmap: tidak ada jalur aksesibilitas | UI | S4 | CODE | TERBUKA |
| BUG-020 | Teks UI hardcoded bahasa Inggris, tidak ada sistem lokalisasi | UI | S3 | CODE | TERBUKA |
| BUG-021 | Frame main hanya mengisi 29% jendela di layar non-16:9 | UI/skala | S2 | RUNTIME | **SELESAI** v5.2.0 (`fitScale` hybrid, `qa:frame`) |
| BUG-022 | Lampu per obor tak terbatas: shader gagal link, layar hitam saat skill api | Render | S1 | RUNTIME | **SELESAI** v5.2.0 (pool cahaya tetap 8 titik) |

## 9.2 Detail per isu

### BUG-001 - Deploy mengunggah source tooling dan 18 MB aset pengembangan (S2)

**Area:** penerbitan. **Bukti:** `[CODE:.assetsignore:1]` hanya mengecualikan
`node_modules/`, `.git/`, `.claude/`, `.freebuff/`, `backup/` dan `*.log`;
`[CODE:wrangler.jsonc:1]` memakai `assets.directory: "."`.
**Dampak pemain:** situs menjadi berat (18 MB+ sebelum gameplay dimuat pada kunjungan
pertama), dan seluruh source pengembangan (`tools/`, `prompts/`, `devserver.py`,
`docs/`) jadi publik.
**Perbaikan:** tambahkan pengecualian seperti di Bab 8.11, lalu verifikasi dengan
`npx wrangler deploy --dry-run` sebelum deploy nyata supaya daftar file yang naik
bisa dibaca angkanya.

### BUG-002 - Cache-bust tidak konsisten (S2)

**Area:** build/runtime. **Bukti:** `[CODE:index.html:79]`
`<script src="./src/entities/player.js?t=123">` sementara 59 script lain memakai
`?v=2`.
**Dampak pemain:** setelah update, browser/CDN bisa menyajikan `player.js` versi
lama sementara seluruh file lain baru - gejalanya bug yang aneh dan tidak
konsisten ("kadang perilaku lama"), dan sangat sulit didiagnosis.
**Perbaikan:** samakan menjadi satu versi (mis. `?v=5.1.0`) untuk **semua** script,
dan naikkan angka itu setiap rilis.

### BUG-003 - `camp3d.js` modul mati (S2)

**Area:** scene. **Bukti:** `[CODE:src/scenes/camp3d.js:290]` mendefinisikan
`DS.Camp3D`, dan `grep -rn "DS.Camp3D" src/` hanya menemukan definisi itu -
**tidak ada** pemanggil. Menu masih menggambar kamp 2D lewat
`[CODE:src/scenes/menu.js:157]` (`camp(state)`: hero sprite, api, ember).
**Dampak pemain:** layar menu utama tidak mendapat diorama 3D yang sudah ditulis,
jadi menu masih terasa 2D sementara gameplay-nya 3D - persis keluhan "utamakan 3D".
**Perbaikan:** pilih satu: (a) pasang `Camp3D` sebagai pre-pass menu seperti
rancangan aslinya, atau (b) hapus modulnya supaya tidak ada dua implementasi.
Rekomendasi: (a), karena `Kit.addPrePass` dan `DS.UI3.addPrePass` sudah tersedia
untuk itu.

### BUG-004 - `art/backdrop.js` modul mati (S3)

**Bukti:** `[CODE:src/art/backdrop.js:319]` mendefinisikan `DS.Backdrop`, tidak ada
pemakaian lain. File ini masih dimuat `index.html`.
**Perbaikan:** hapus file + tag script-nya (324 baris lebih ringan), atau jelaskan
perannya kalau masih akan dipakai.

### BUG-005 - `systems/lighting.js` sisa modul (S3)

**Bukti:** `[CODE:src/systems/lighting.js]` tinggal 43 baris dan tidak menggambar
apa pun; `[CODE:src/core/renderer3d.js:17]` masih berkomentar bahwa cahaya
"dikomposit di atas kanvas ini di `src/systems/lighting.js`" - komentar yang sudah
salah.
**Perbaikan:** hapus modul dan perbaiki komentarnya, atau kembalikan fungsinya.
Selama komentar itu salah, pembaca berikutnya akan mencari sistem yang tidak ada.

### BUG-006 - Kode pause mati (S3)

**Bukti:** `[CODE:src/scenes/game.js:784]` (`updatePause`) dan `:811`
(`drawPause`) tidak pernah dipanggil; `g.paused` sebenarnya adalah keadaan "layar
profil terbuka" (`[CODE:src/ui/profile.js:51]`, `[CODE:src/scenes/game.js:705]`
dan `:895`).
**Perbaikan:** hapus keduanya, atau sambungkan kembali bila memang pause terpisah
dari profil yang diinginkan (perlu keputusan pemilik game).

### BUG-007 - Elemen `wind` tidak punya label pendek (S2)

**Bukti:** `[CODE:src/ui/ui.js:22]` - `ELEMENT_SHORT` memuat `fire, ice, lightning,
poison, water, earth, leaf`, **tidak ada `wind`**.
**Dampak pemain:** senjata berprefix `Gale` (angin) menampilkan kartu tanpa label
elemen, jadi pemain kehilangan petunjuk bahwa senjatanya elemental - dan angin
adalah elemen yang justru butuh penjelasan (ia mengaduk aura, bukan menambahkan
status).
**Perbaikan:** tambahkan `wind: 'GALE'` (atau `WIND`) dan sesuaikan lebar kolom
kartu bila perlu.

### BUG-008 - Tidak ada nama pemain, leaderboard, atau cloud save (S2)

**Bukti:** `[CODE:src/core/storage.js]` hanya menyimpan enam angka rekor; tidak ada
permukaan input teks sama sekali di `src/` (tidak ada `<input>`, tidak ada prompt
nama). Fitur ini pernah diminta tetapi belum pernah dibangun.
**Perbaikan:** butuh satu modul baru (mis. `core/profile.js`) untuk nama + identitas
run, satu layar entri nama sebelum loadout, penampilan nama di atas kepala pemain
(billboard 3D), dan satu backend penyimpanan. Rekomendasi backend: **Cloudflare D1
atau KV lewat Worker yang sudah ada** - gratis, satu akun dengan hosting, dan
latensinya rendah karena Worker + database berada di edge yang sama; Supabase
(bonus fitur lebih banyak: auth, realtime) menjadi pilihan kedua kalau nanti butuh
akun pengguna sungguhan dan dasbor admin.

### BUG-009 - Audit tata letak tidak pernah dijalankan (S2)

**Bukti:** `[CODE:src/ui/kit.js:105]` menyediakan `audit()`, tetapi tidak ada
skrip/CI yang memanggilnya (`package.json` kosong dari `scripts`).
**Dampak:** gerbang yang dirancang mencegah panel saling menimpa tidak menahan apa
pun; bug tata letak hanya ketahuan kalau ada yang melihat screenshot.
**Perbaikan:** tambahkan satu skrip headless (`node tools/qa/audit-ui.js`) yang
membuka tiap layar dan meng-assert `audit()` kosong.

### BUG-010 - Tidak ada skrip di `package.json` (S4)

**Bukti:** `[CODE:package.json:1]` hanya berisi `dependencies: { jsdom }`.
**Dampak:** kontributor (dan agen) mencoba `npm run dev` / `npm test`, gagal, lalu
mencari cara lain. `devserver.py` dan skrip dokumen ini sebaiknya didaftarkan
sebagai script.

### BUG-011 - `backup/` ter-commit (S3)

**Bukti:** `[CODE]` `git ls-files backup` = 1.481.255 byte (dua salinan penuh:
`src_backup_20260819/` dan `src_pre_5.0.0/`).
**Perbaikan:** keluarkan dari repo (masih ada di riwayat git) dan taruh di luar
folder kerja, atau pindahkan ke satu release/tag. `.gitignore` sudah memuat
`backup/`? Tidak - hanya `.assetsignore` yang mengecualikannya, jadi ia masih
ter-track.

### BUG-012 - `.codex/config.toml` ter-commit (S4)

**Bukti:** `[CODE]` `git ls-files .codex` → `config.toml`.
**Perbaikan:** tambahkan `.codex/` ke `.gitignore` dan hapus dari index.

### BUG-013 - Screenshot pengembangan ter-commit (S3)

**Bukti:** `[CODE]` `assets/preview/` memuat 127 PNG pengembangan dan seluruh
folder itu ter-track (mis. `assets/preview/bg_2x.png`), padahal `.gitignore`
memuat pola `assets/preview/`. Artinya file-file itu masuk sebelum aturan ignore
dibuat.
**Dampak:** repo membengkak dan setiap `git status`/clone menanggungnya.
**Perbaikan:** `git rm -r --cached assets/preview` (file tetap ada di disk, dan
dokumen ini justru memakainya sebagai bahan).

### BUG-014 - State berubah di dalam jalur gambar (S3)

**Bukti:** `[CODE:src/ui/ui.js:166]` - `drawControls(g)` menurunkan
`g.controlsTimer` saat menggambar.
**Dampak:** timer bergantung pada berapa kali frame digambar, bukan pada waktu
simulasi; saat frame drop atau pause, durasi hint berubah. Ini juga melanggar
aturan "update mengubah state, draw hanya menggambar".
**Perbaikan:** pindahkan penurunan timer ke `update()`.

### BUG-015 - Readout kamera ikut terkirim (S4)

**Bukti:** `[CODE:src/ui/ui.js:143]` (`drawCamReadout`) dipanggil dari `hud()` saat
`R3D.rig.show > 0`.
**Perbaikan:** bungkus dengan flag debug (`g.debug`) supaya hanya muncul saat F1
aktif. Berguna bagi pengembang, membingungkan bagi pemain.

### BUG-016 - Route domain hardcoded (S3)

**Bukti:** `[CODE:wrangler.jsonc:6]` memuat `routes` untuk
`dungeonscrolling.moneyspender.net`.
**Dampak:** `wrangler deploy` gagal total bila zone itu tidak ada di akun
Cloudflare yang sedang login - dan pesannya tidak menyebut bahwa penyebabnya
adalah route.
**Perbaikan:** dokumentasikan sebagai prasyarat, atau deploy dulu ke
`*.workers.dev` lalu pasang domain dari dashboard.

### BUG-017 - Jaminan "lantai bisa diselesaikan" belum diuji ulang (S2, perlu uji)

**Bukti:** `[CODE:src/systems/reach.js:1]` menerapkan rungs + step darurat, dan
`tools/solve-levels.js` ada sebagai solver. Namun sejak pass terakhir yang gagal
di tengah jalan, **belum ada bukti runtime** bahwa lantai yang di-roll sekarang
selalu bisa dituntaskan, sementara keluhan pemain terakhir justru "masih belum
bisa naik".
**Perbaikan (prioritas tertinggi untuk pass berikutnya):** jalankan
`node tools/solve-levels.js` untuk depth 1-10 dengan beberapa seed, lalu
verifikasi satu tanjakan yang gagal sebelumnya **di browser**: catat `p.y` sebelum
dan sesudah percobaan naik. Kalau rungs tidak muncul, periksa urutan pemanggilan
`Reach.ensureExit()` terhadap `supportPlatforms()` di `generator.js:686`.

### BUG-018 - Latar belum bertekstur sesuai tema (S2)

**Bukti:** `[CODE:src/core/renderer3d.js:924]` - latar dibangun dari band siluet,
warna, dan mote; tidak ada tekstur bergambar per tema.
**Dampak:** pemain memintanya dua kali: "background harus sesuai DAN bertekstur".
**Perbaikan:** tambahkan lapisan tekstur per tema (shore: pasir/karang, cave:
batuan basah, swamp: lumut/akar, mountain: batu bersalju, flooded: keramik bawah
air, volcanic: bara) pada band terjauh, plus pencahayaan tepi (`backLight` sudah
ada) supaya tekstur tetap terbaca saat gelap.

### BUG-019 - Tidak ada jalur aksesibilitas teks (S4)

**Bukti:** `[CODE]` seluruh teks memakai font bitmap kapital 3x5/5x7; tidak ada opsi
ukuran atau mode teks sistem.
**Perbaikan:** tambahkan opsi "besar" yang menaikkan face teks atau menyediakan
HUD ringkas. Ini juga membantu pemain di monitor kecil.

### BUG-020 - Tidak ada sistem lokalisasi (S3)

**Bukti:** `[CODE]` semua string UI hardcoded (mis. `START RUN`, `DEPTH`,
`THE DUNGEON IS CLEARED`) di 20+ file.
**Perbaikan:** kumpulkan string ke satu tabel (`src/core/text.js`) dengan kunci,
lalu tambahkan bahasa Indonesia sebagai pilihan. Ini pekerjaan mekanis yang lebih
baik dilakukan **sebelum** menambah banyak teks baru.

### BUG-021 - Frame main hanya mengisi 29% jendela (S2) - SELESAI v5.2.0

**Bukti:** `[RUNTIME]` diukur `npm run qa:frame` pada v5.1.0: aturan lama
`floor(fill / C.RS) * C.RS` memberi frame 640x360 di jendela 1280x630 (29%), dan
1024x576 di 1024x768 (29%). Inilah keluhan "ukuran layar kekecilan, aku harus zoom
sampai 200".
**Perbaikan:** `fitScale()` di `src/ui3/screen.js` sekarang memilih kelipatan bulat
hanya kalau sisa pembulatan <= 3% sumbu pengikat; selain itu memakai fill fraksional.
Hasil terukur: 1280x630 29% -> 88%, 1024x768 29% -> 75%, 1920x1080 tetap 100%
(skala 6, piksel sempurna).

### BUG-022 - Lampu per obor tak terbatas, layar jadi hitam (S1) - SELESAI v5.2.0

**Bukti:** `[RUNTIME]` diukur di run hidup: biji kedalaman 1 dengan 10 obor = 13
light (8 point), kedalaman 5 = 19 light (14 point). Three.js meng-compile shader per
jumlah light, jadi setiap obor baru = recompile semua material, dan begitu melewati
batas uniform GPU, material yang terdampak digambar **hitam**. Skill api menambah
light di atas batas itu, yang menjelaskan laporan "tiba-tiba gelap, ketrigger karena
skill api".
**Perbaikan:** pool cahaya tetap (4 flame + 2 element + lampu hero + portal = 8 point
light), tiap frame pool diarahkan ke obor/field terdekat dari pemain. Terukur: 9
obor, 0 obor, dan 12 fire field semuanya tetap `13/8` light. Modul veil kegelapan
(`systems/lighting.js`) dan modifier `DARKNESS` dihapus.

## 9.3 Fitur yang diminta tetapi belum ada

| Permintaan | Status | Rujukan |
|---|---|---|
| Nama pemain + tampil di atas kepala pemain | **Ada** (v5.2.0) | BUG-008, Bab 2.6 |
| Leaderboard saat mati, nama tetap tersimpan | **Ada** (v5.2.0): nama di `localStorage`, ladder D1 di layar kematian | BUG-008, Bab 2.6 & 8.12 |
| Penyimpanan online (Cloudflare/Supabase) | **Ada** (v5.2.0): Worker + D1 di akun Cloudflare yang sama, tanpa akun baru | BUG-008, Bab 8.12 |
| Latar bertekstur per tema | Belum ada | BUG-018 |
| Ruangan gelap dengan cahaya dari latar (backlight) | Dihapus atas permintaan "ilangin aja"; `backLight` tetap ada sebagai cahaya bulan. Pemicunya bukan setting gelap melainkan batas light GPU (BUG-022) | Bab 7.4, 8.2 |
| Animasi serang 3D per senjata (swing/trail, thrust, draw, cast) | Ada (Bab 5.6); perlu penajaman visual | - |
| Kamera: lookahead + shake + zoom boss | Sebagian: shake ada (`R.shake`), lookahead/zoom boss belum | - |
