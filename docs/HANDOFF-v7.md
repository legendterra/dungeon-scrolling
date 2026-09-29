# v7 Handoff (diperbarui 2026-09-30)

Branch kerja: `claude/modest-rubin-yaqfoa`. Rencana: [PLAN-v7.md](PLAN-v7.md) dan tambahan user [PLAN-v7b.md](PLAN-v7b.md).
Izin dari user: kalau tes, audit, dan review lolos, **merge ke `main` dan deploy dengan wrangler**
(`npx --yes wrangler@4 deploy` dari root; login ada di mesin ini; coba `--dry-run` dulu). Naikkan `?v=` di `index.html` tiap rilis.

## Status

| Bagian | Isi | Status |
|---|---|---|
| Fase 0-3 | bug senjata, backdrop diam di world-space, level besar, tekstur CC0 | selesai |
| Fase 4-6 | `DS.Maps` + 30 map (Act I-III), audit 30 lantai hijau (312 cek), poles Warden/Labyrinth/Tartarus/Zeus/Mire | selesai |
| Monster Act I | 13 monster (`enemies4.js`, `voxel-bestiary.js`), roster map 1-10, QA `check-bestiary.js --only v7` | selesai |
| Rencana v7b 5 | notice riset AI (`ui-html/notice.js`) | selesai |
| Rencana v7b 1 | Options lengkap + rebind + controls sheet mengikuti tombol (`ui-html/options.js`, `core/settings.js`, `prefs.js`) | selesai |
| Rencana v7b 2 | leaderboard berhalaman + peringkat sendiri (`/api/board`, `menus.js leaderboard`) | selesai |
| Rencana v7b 3-4 | pembuat karakter, katalog skin, dompet kunci, toko | belum |
| Rencana v7b 6-7 | efek portal shader + cutscene masuk portal 3D | belum |
| Monster Act II-III | 9 monster A + 4 B (Act II), 8 A + 6 B (Act III), roster map 11-30 | belum |
| Boss baru | Hades, Zeus, Minotaur, Medusa, Talos; arena per boss; rotasi endless | belum |
| Fase 7 MC | voxel MC baru (menyatu dengan pembuat karakter) | belum |
| Fase 8 | suara ambience, `docs/11-v7.md`, review per fase | sebagian (CHANGELOG v7.0.0 sudah) |

## QA yang ada

`npm test` (173), `node tools/qa/audit-world.js <url> --depths 1-30`, `check-bestiary.js <url> --only v7`,
`shoot-monsters.js`, `shoot-maps.js`, `check-notice.js`, `check-options.js`, `check-leaderboard.js`, `probe-load.js`.
Dev server: `python devserver.py 8124`. Tambahkan `?notice=0` ke URL untuk melewati notice di alat QA.
`check-board.js` lama gagal (memeriksa gambar canvas; UI sekarang HTML) - belum diperbarui.

## Berikutnya

1. Pembuat karakter + katalog skin + dompet kunci (bagian 3-4 di PLAN-v7b: model `look`, dua perender 3D voxel dan piksel 2D,
   harga dari matematika kunci, Limited hanya dari pencapaian) bersama MC voxel baru.
2. Portal shader dan cutscene masuk portal (bagian 6-7).
3. Monster Act II-III, boss baru, ruang khusus (safe room, trial, tint endless), arena boss lebih besar.
4. Suara, `docs/11-v7.md`, `/code-review` per fase.

## Catatan

- Tekstur dari Poly Haven (CC0), kredit di `ASSETS.md`; `?hdtex=0` mematikannya.
- Worker baru (`worker/index.js`): `GET /api/board?page=&size=&name=` (peringkat sendiri dihitung dengan COUNT, tanpa migrasi).
- Bash tool kadang gagal sementara (classifier); PowerShell bisa dipakai sebagai cadangan.
