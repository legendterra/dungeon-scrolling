# Plan v7b: Options, Papan Peringkat, Karakter, Skin, Notice, Portal

Tambahan dari user (2026-09-29, malam). Berlaku setelah / bersama PLAN-v7. Keputusan yang user serahkan
ke Claude ("rekomendasiin aja, bisa direvisi") ditandai **[rekomendasi]**.

## Izin berdiri dari user

- Kalau sudah lolos cek (tes, audit, review, tanpa error konsol): **merge ke `main` dan deploy ke Cloudflare
  dengan wrangler** (`npx --yes wrangler@4 deploy`, dari root proyek; login wrangler sudah ada di mesin ini,
  Worker `dungeon-scrolling`, domain `dungeonscrolling.moneyspender.net`). Cek dulu dengan `--dry-run`.
- Cache-buster: satu string `?v=` di `index.html` (sekarang 7.0.0). Naikkan tiap rilis.
- Kalau ada yang belum oke, jangan deploy; tinggalkan di branch dan catat di HANDOFF.

## Daftar fitur

| # | Fitur | Isi |
|---|---|---|
| 1 | **Options lengkap** | Slider grafis esensial, ganti kontrol (rebind), audio, gameplay, aksesibilitas, legal. Dari menu utama dan menu pause. |
| 2 | **Papan peringkat berhalaman** | Di menu utama: tabel 10 baris per halaman (1-10, 11-20, ...), baris "YOU" ditempel di bawah dengan peringkat sendiri (misal #11). "How to play" mengikuti tombol yang sedang dipakai (dari Options). |
| 3 | **Kustomisasi karakter** | Layar pembuatan karakter saat pertama main, lalu bisa dibuka lagi dari menu. Tersimpan di cache peramban (`localStorage`). |
| 4 | **Toko skin** | Armor, tubuh/wajah/rambut, topi, baju, celana, sepatu, jubah, senjata. Permanen (tidak tertimpa armor in-game). Bayar dengan **kunci** peti hasil main. |
| 5 | **Notice awal (riset AI)** | Modal ala Terms and Conditions, bahasa Inggris, harus dibaca. Setuju atau tolak, dua-duanya masuk game; tolak memunculkan popup permintaan maaf. "Do not show again", bisa dihidupkan lagi di Options. |
| 6 | **Cutscene baru** | Ganti intro "jatuh ke lubang" menjadi masuk portal, 3D real-time seperti game sungguhan, memakai karakter buatan pemain. |
| 7 | **Efek portal baru** | Ganti PNG yang berputar. Pusaran shader, cincin rune, partikel tersedot, cahaya. Dipakai di pintu keluar dan di cutscene. |

## Jawaban user untuk pertanyaan Claude

1. Kustomisasi banyak pilihan tetapi **esensial** (bukan ala The Sims): wajah, ukuran badan, rambut, warna, banyak baju dan celana, topi.
2. Karakter 2D di ESC dan inventory harus sama dengan karakter 3D, dalam versi piksel.
3. Skin punya rarity: Common, Rare, Epic, Legendary, Mythic, Limited. **Limited hanya dari game** (contoh: kalahkan boss 10x), tidak bisa dibeli. Konsepnya diserahkan ke Claude.
4. Sisanya rekomendasi Claude.

## Rancangan

### 1. Options (`src/core/settings.js`, `src/ui-html/options.js`)

Toko satu pintu: `DS.Settings` (localStorage `ds_settings`, versi skema, nilai di-clamp, gagal simpan tidak fatal).
Setiap perubahan langsung diterapkan lewat hook ke modul pemilik (Audio, PostFX, Renderer, Input).

| Tab | Isi |
|---|---|
| Graphics | Preset kualitas (Low/Medium/High), render scale 50-100%, bloom, shadows, vignette dan grain, partikel, tekstur HD, batas FPS (30/60/bebas), tampilkan FPS, gamma/brightness, UI scale |
| Audio | Master, Music, SFX, bisukan saat tab tidak fokus |
| Controls | Rebind semua aksi (dua slot per aksi), deteksi bentrok, reset default, sensitivitas kursor |
| Gameplay | Damage numbers, hint kontekstual, camera shake (0-100%), auto-equip |
| Accessibility | Reduce motion (mematikan shake dan flash), high contrast HUD, ukuran teks |
| About | Tampilkan notice lagi, versi, kredit aset (CC0 Poly Haven), reset progres |

Navigasi keyboard/gamepad penuh (kiri/kanan mengubah slider), mouse juga.

### 2. Papan peringkat berhalaman

Worker: `GET /api/board?page=0&size=10&name=NAME` mengembalikan `{ rows, total, page, pages, me: { rank, row } }`.
Urutan sama dengan `/api/top` (kedalaman lalu kill lalu waktu). Peringkat sendiri dihitung dengan
`COUNT(*) + 1` atas baris yang lebih baik (tanpa migrasi skema). UI: tabel di menu utama, tombol halaman
sebelumnya/berikutnya, baris "YOU" ditempel. Offline: pakai baris lokal, diberi label lokal.

### 3-4. Karakter, skin, dompet kunci

Model tunggal `look` (JSON kecil) yang dibaca **dua** perender:

```
look = { skin, build, height, eyes, eyeColor, brows, mouth, facial, mark,
         hair, hairColor, hat, top, topColor, pants, pantsColor, boots, cape,
         gloves, extra, weaponSkin: { sword, dagger, greataxe, spear, bow, staff } }
```

- 3D: `DS.Voxel` hero builder membaca `look` (MC baru Fase 7: wajah, rambut berlapis, siku dan lutut, gaya armor).
- 2D piksel: `DS.Look.drawPixel(ctx, look)` (panel ESC/inventory, layar karakter) dari katalog yang sama.
- Katalog `DS.Skins.CATALOG`: `{ id, slot, name, rarity, price | earn, art }`. Gratis: set dasar. Berbayar: sisanya.
- **Transmog**: skin terpasang menang atas armor in-game; armor tetap memberi stat, hanya tampilan yang tidak berubah.
- Penyimpanan: `localStorage` `ds_profile` = `{ look, owned[], wallet, counters }` (+ tombol Export/Import kode profil agar bisa pindah peramban).

**Dompet kunci.** Kunci yang tidak dipakai membuka peti dibawa keluar saat run berakhir (mati atau abandon): `DS.Wallet.bank(g.inv.keys)`.
Ini satu-satunya meta-progres dan hanya kosmetik (tidak masuk ke gameplay), jadi aturan "roguelike murni" untuk kekuatan tetap benar.

**Hitungan kunci** (dari `generator.js` dan `difficulty.js`):

- Kunci selalu jatuh dari miniboss (satu keybearer per lantai yang punya peti terkunci). Elite 35%.
- Perkiraan per lantai (jumlah musuh, bobot rank, `rankWeights`): d1-4 sekitar 1,0 sampai 1,5; d6-9 sekitar 2,9 sampai 5,4; boss floor tanpa kunci.
  Act I lengkap yang semua pembawa kuncinya dibunuh: sekitar 20. Pemain yang juga membuka semua peti terkunci membelanjakan sekitar 1,3 per lantai.
- Jadi **10 lantai sekitar 10 kunci** bersih setelah belanja peti (angka user), dan pemain dalam (Act II-III) menabung 40-80 per run.

**Harga [rekomendasi]** (kunci; item lengkap ×2, senjata ×1,5, topi ×0,8, rambut ×0,6, wajah ×0,5, dibulatkan 5):

| Rarity | Dasar | Sekitar run 10 lantai |
|---|---|---|
| Common | 30 | 3 |
| Rare | 90 | 9 |
| Epic | 240 | 24 |
| Legendary | 600 | 60 |
| Mythic | 1500 | 150 |
| Limited | tidak dijual | dari pencapaian |

**Limited (dari game saja) [rekomendasi]:** tiap boss punya penghitung; **10 kill** membuka satu set bertema
(Warden's Oath, Slime Regalia, Arbiter's Verdict, Wyrm-Frost Mantle, Hades' Shroud, Zeus' Thunderhide,
Minotaur, Medusa, Talos), ditambah Portal Walker (bersihkan Act I), Endless Wanderer (kedalaman 40).

### 5. Notice awal (`src/ui-html/notice.js`)

Modal di atas semua layar pada peluncuran pertama (dan selalu jika belum "do not show again"):
teks bahasa Inggris (tujuan riset, gratis, tanpa uang sungguhan, data yang disimpan, tidak berafiliasi dengan
pengembang game asli, kredit), area gulir yang harus dibaca sampai bawah sebelum tombol aktif.
`I AGREE` masuk game. `DECLINE` membuka popup permohonan maaf (tujuan riset, tidak bermaksud merendahkan
pengembang game asli), lalu tombol `CONTINUE TO GAME`: kedua jalur masuk game. Keputusan dan checkbox
disimpan di `DS.Settings` (`notice.ack`, `notice.hide`); Options > About > "Show startup notice" mengaktifkannya lagi.

### 6-7. Portal dan cutscene

- Efek portal `src/fx3d/portal.js`: shader pusaran spiral (kutub, derau, gradasi radial), cincin rune berputar,
  partikel tersedot, sinar dan cahaya titik berdenyut, keadaan **terkunci** (merah, redup, rantai) dan **terbuka** (terang);
  reaksi saat pemain dekat; ledakan cahaya saat masuk. Menggantikan `createDoorwayMesh` (renderer3d.js).
- Cutscene `src/scenes/intro3d.js`: adegan 3D nyata (reruntuhan gelap, obor, portal), kamera dolly, karakter buatan pemain
  berjalan ke portal, teks pendek, tersedot lewat terowongan cahaya, potong ke lantai 1. Bisa di-skip.

## Urutan kerja dan rilis

| Rilis | Isi | Syarat deploy |
|---|---|---|
| 1 | Notice (5) + Settings dasar | tes hijau, probe-load bersih, audit, review |
| 2 | Options lengkap (1) + papan peringkat berhalaman (2) + Worker baru | tes UI, QA layar, `wrangler deploy --dry-run` |
| 3 | Karakter, katalog, dompet, toko (3-4) + MC voxel baru (Fase 7) | uji simpan/muat, harga, tampilan 2D dan 3D sama |
| 4 | Portal (7) + cutscene (6) | screenshot, frame time, tanpa error |
| 5 | Sisa monster dan boss (Act II-III), ruang khusus, suara, dokumen | seperti PLAN-v7 |

Tiap rilis: `npm test`, `audit-world`, `probe-load`, contact sheet bila visual, lalu merge ke `main` dan deploy.
