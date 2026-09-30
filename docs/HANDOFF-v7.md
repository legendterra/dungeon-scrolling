# v7 Handoff (diperbarui 2026-09-30, v7.2.0)

Branch kerja: `claude/modest-rubin-yaqfoa`. Rencana: [PLAN-v7.md](PLAN-v7.md) dan tambahan user [PLAN-v7b.md](PLAN-v7b.md).
Izin dari user: kalau tes, audit, dan review lolos, **merge ke `main` dan deploy dengan wrangler**
(`npx --yes wrangler@4 deploy` dari root; login ada di mesin ini; coba `--dry-run` dulu). Naikkan `?v=` di `index.html` tiap rilis.

## Rilis

- **v7.2.0 sudah live** di https://dungeonscrolling.moneyspender.net (2026-09-30): `main` = commit aa9e2c8, Worker version 86dad585.
  Isi: Act III lengkap (14 monster, 5 boss, ruang harta, arena per boss, Merchant's Camp / Temple of Hestia / Arena of Heroes, ambience,
  tint korupsi Endless). Diverifikasi di produksi: index 200 dengan `?v=7.2.0`, semua berkas baru 200, `/api/board` menjawab, halaman termuat
  tanpa error konsol dan `DS.VERSION` = v7.2.0. Izin rilis dari user: "ya gas rilis setelah review selesai" (2026-09-30).
- v7.1.0 (sebelumnya): `main` = 34b0f4c, Worker version 51091468: sistem karakter, Act II, perbaikan review v7.0.0, tab PLAYER (ganti nama),
  penamaan Scoreboard, perbaikan layout inventory.
- Scoreboard disimpan di D1 (server), dikenali dari nama; karakter, kunci, dan pengaturan hanya di localStorage peramban itu.
- Deploy berikutnya: naikkan `?v=` di `index.html` dan `DS.VERSION` (`core/prefs.js`), jalankan `npm test` dan `tools/qa/*`, lalu
  `git push origin HEAD:main` dan `npx --yes wrangler@4 deploy` dari root.

## Status

| Bagian | Isi | Status |
|---|---|---|
| Fase 0-3 | bug senjata, backdrop diam di world-space, level besar, tekstur CC0 | selesai |
| Fase 4-6 | `DS.Maps` + 30 map (Act I-III), audit 30 lantai hijau (312 cek), poles Warden/Labyrinth/Tartarus/Zeus/Mire | selesai |
| Monster Act I | 13 monster (`enemies4.js`, `voxel-bestiary.js`), roster map 1-10, QA `check-bestiary.js --only v7` | selesai |
| Rencana v7b 5 | notice riset AI (`ui-html/notice.js`) | selesai |
| Rencana v7b 1 | Options lengkap + rebind + controls sheet mengikuti tombol (`ui-html/options.js`, `core/settings.js`, `prefs.js`) | selesai |
| Rencana v7b 2 | leaderboard berhalaman + peringkat sendiri (`/api/board`, `menus.js leaderboard`) | selesai |
| Rencana v7b 3-4 | pembuat karakter (`ui-html/creator.js`, `scenes/lookstage.js`), katalog ~150 skin (`items/look.js`), dua perender satu look (`look3d.js` voxel, `look2d.js` piksel), dompet kunci + toko, limited dari pencapaian, kunci dibank saat run berakhir | selesai (v7.1.0) |
| Rencana v7b 7 | efek portal shader (`fx3d/portal.js`, dipakai di pintu keluar), `tools/qa/shoot-portal.js` | selesai |
| Rencana v7b 6 | cutscene 3D masuk portal (`scenes/intro3d.js`, bisa di-skip), `tools/qa/shoot-intro.js`; memakai hero default sampai pembuat karakter jadi | selesai |
| Monster Act II | 5 A + 3 B (`enemies5.js`, `voxel-bestiary2.js`), roster map 11-19 | selesai (v7.1.0) |
| Monster Act III | 8 A + 6 B, roster map 21-29 (`enemies6.js`, `voxel-bestiary3.js`) | selesai (v7.2.0, live) |
| Boss baru | Hades d25, Zeus d30, Minotaur d21, Medusa d23, Talos d27 (`bosses3.js`, `voxel-bosses.js`), ruang harta (`world/arena.js`), arena per boss, rotasi endless | selesai (v7.2.0) |
| Ruang khusus | Merchant's Camp (Act I-II), Temple of Hestia, Arena of Heroes (`DS.Maps.defineSpecial`), tint korupsi Endless | selesai (v7.2.0) |
| Ambience | 20 jenis (`Audio.setAmbience`), satu per map | selesai (v7.2.0) |
| Fase 7 MC | voxel MC baru (menyatu dengan pembuat karakter) | belum |
| Fase 8 | suara ambience, `docs/11-v7.md`, review per fase | selesai (v7.2.0: review independen Act III, lima temuan diperbaiki) |

## QA yang ada

`npm test` (295), `node tools/qa/audit-world.js <url> --depths 1-30`, `check-bestiary.js <url> --only v7|bosses`, `check-act3.js`, `shoot-bosses.js`, `shoot-special.js`,
`shoot-monsters.js`, `shoot-maps.js`, `check-notice.js`, `check-options.js`, `check-leaderboard.js`, `check-character.js [--tour]`,
`shoot-look.js [--only outfits|heads|traits|weapons]`, `check-review.js`, `check-bag.js`, `measure-hero.js`, `probe-load.js`.
Dev server: `python devserver.py 8124`. Tambahkan `?notice=0` ke URL untuk melewati notice di alat QA.
`check-board.js` lama (memeriksa gambar canvas) sudah dihapus; `npm run qa:board` sekarang menjalankan `check-leaderboard.js`.

## Berikutnya

1. **Dimainkan manusia**: balancing HP/damage Act III dan rasa tiap boss belum pernah dimainkan orang (semua diuji dengan bot dan model gerak);
   catat keluhan pemain lalu setel `KINDS` di `bosses3.js` dan `cfg` di `enemies6.js`.
2. Poles: model voxel boss masih sederhana (Zeus, Talos).
3. Deploy berikutnya: izin harus ditanyakan lagi (izin 2026-09-30 dipakai untuk v7.2.0). Langkah: naikkan `?v=` di `index.html` dan
   `DS.VERSION` (`core/prefs.js`, `ui-html/menus.js`, `ui-html/options.js`), `npm test` dan `tools/qa/*`, `git push origin HEAD:main`,
   `npx --yes wrangler@4 deploy --dry-run` lalu tanpa `--dry-run`, verifikasi produksi (hanya baca).
4. Opsional: set beli (`Look.setPrice` sudah ada, belum ada set yang dijual), toggle "tampilkan armor" di atas look, MC voxel baru (sekarang chibi dasar + look).

## Catatan

- Tekstur dari Poly Haven (CC0), kredit di `ASSETS.md`; `?hdtex=0` mematikannya.
- Worker baru (`worker/index.js`): `GET /api/board?page=&size=&name=` (peringkat sendiri dihitung dengan COUNT, tanpa migrasi).
- Bash tool kadang gagal sementara (classifier); PowerShell bisa dipakai sebagai cadangan.
