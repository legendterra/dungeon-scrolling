# v7 Handoff

Plan: [PLAN-v7.md](PLAN-v7.md). Branch kerja: `claude/modest-rubin-yaqfoa` (tanpa merge ke `main`).
Perbarui file ini di akhir setiap fase.

## Status

| Fase | Isi | Status |
|---|---|---|
| 0 | Persiapan, bug senjata, jam menu, `shoot-maps.js`, baseline | **selesai** (18e7331) |
| 1 | Backdrop world-space (diam, terisi penuh, tanpa mesh di depan bidang main) | **selesai** |
| 2 | Level diperbesar | **sebagian** (lihat di bawah) |
| 3 | Tekstur CC0 HD | belum |
| 4-6 | Map per act + monster | belum |
| 7 | MC baru | belum |
| 8 | Suara, dokumen, review | belum |

## Cara jalan

- Dev server: `python devserver.py 8124` (port yang dipakai `.claude/launch.json`).
- `node tools/qa/shoot-maps.js http://127.0.0.1:8124/ --tag NAMA [--depths 2,3|all]` menulis contact sheet
  ke `tools/qa/out/maps/NAMA/` (gitignored). Baseline: tag `before-v7`.
- `npm test`, `npm run solve 50`, `node tools/qa/probe-load.js`.

## Fase 1: yang dikirim dan yang sengaja ditunda

Dikirim:
- `src/core/worldframe.js` (murni, diuji): jangkauan kamera per level dan persegi coverage tiap bidang
  `z = -D`. `tests/worldframe.test.js` juga membaca `renderer3d.js` supaya konstanta yang ditirunya tidak
  bisa menyimpang diam-diam.
- Backdrop berdiri diam (`themeGroup.position.y = 0`). Blok HORIZON_* / drift / `settleStage` dihapus.
  Jangkar ground = **kaki level** (`footRow`, persentil-85 tinggi kolom), bukan median.
- Tidak ada mesh backdrop di depan `FRONT_Z = -1.6`. Atap map tertutup: dasar `max(y resep, mata tertinggi + 3)`,
  gigi stalaktit berakar DI atap (`L.roof`), pondasi di bawah dataran, langit menyesuaikan tinggi level.
- `Backdrop.update(time, simDt)`: nol saat sim dijeda.
- Audit deterministik `tools/qa/audit-world.js` (`npm run qa:world`): 30 depth, 0 gagal. Audit lama
  `audit-backdrop.js` kehilangan cek "horizon berdiri di tanah pemain" (usang).

Ditunda ke Fase 4-6 (perlu resep per map): rung raksasa tambahan (110/180/300 u), fog per map, dinding belakang
menerus untuk map tertutup, matahari di balik jendela berjeruji, pemecahan `backdrop3d.js` menjadi
`src/core/backdrop/`.

Catatan visual: sheet `after-p1` memperlihatkan Rusted Prison masih seperti gurun dan blok bata level Climb
menutupi backdrop di tengah/atas; keduanya adalah pekerjaan Fase 2 dan 4.

## Fase 2: yang dikirim dan yang ditunda

Dikirim (`src/world/levelsize.js` adalah satu-satunya tabel ukuran, diuji di `tests/levelsize.test.js`):
- corridor 260-480 x 22 (rooms x 1.8), carved 240-440 x **32** (`parkour.js` memakai `map.h - 2` sebagai dasar),
  flooded 160-220 x **30** (danau lebih dalam, gundukan dan dive diperbanyak), mountain **128 x 60**
  (sembilan plateau, sumur dan vault sama besar), trial **144** x 22 (gauntlet dan hall lebih panjang, arena tetap).
- Jangkar backdrop = lantai tempat hero mulai (`footRow`), atau permukaan air di danau (`g.waterRow`).
- `npm run solve 14`: 0 exit tak terjangkau di 532 lantai, keempat metrik anti-melayang 0. `check-climb.js` lulus
  (tali di gunung baru dipanjat sungguhan). `audit-world.js` lulus di depth 3/7/9/13/22.

Ditunda (dengan alasan):
- **Arena boss dan safe room** (40 -> 64-80 dan 20 -> 40): arena dibuat per boss di Fase 4-6 bersama boss barunya,
  supaya tidak dikerjakan dua kali.
- **Segmen dua lantai di corridor** dan **atap tile opsional per map**: keduanya dibaca dari definisi map
  (Fase 4-6), jadi dibuat bersama definisi itu.
- Frame time di level besar (`qa:frame`) dan ekonomi koin (musuh per lantai naik ~1.7x, harga toko belum
  disetel ulang) harus dicek user di lokal.
