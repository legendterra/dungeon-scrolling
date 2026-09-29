# v7 Handoff

Plan: [PLAN-v7.md](PLAN-v7.md). Branch kerja: `claude/modest-rubin-yaqfoa` (tanpa merge ke `main`).
Perbarui file ini di akhir setiap fase.

## Status

| Fase | Isi | Status |
|---|---|---|
| 0 | Persiapan, bug senjata, jam menu, `shoot-maps.js`, baseline | **selesai** (18e7331) |
| 1 | Backdrop world-space (diam, terisi penuh, tanpa mesh di depan bidang main) | **selesai** |
| 2 | Level diperbesar | belum |
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
