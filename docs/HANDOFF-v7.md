# v7 Handoff (dijeda 2026-09-29)

Branch: `claude/modest-rubin-yaqfoa` (tanpa merge ke `main`). Plan: [PLAN-v7.md](PLAN-v7.md).
Lanjut di rumah: `git pull origin claude/modest-rubin-yaqfoa`, lalu bilang ke Claude
"baca docs/HANDOFF-v7.md dan lanjutkan dari 'Berikutnya'".

## Status

| Fase | Isi | Status |
|---|---|---|
| 0 | bug senjata hilang, jam menu, `shoot-maps.js` | selesai |
| 1 | backdrop diam di world-space, terisi penuh, akar atap | selesai (audit 30 depth lulus) |
| 2 | level diperbesar (corridor x1.8, carved 32 baris, danau 30, gunung 128x60, trial 144) | selesai sebagian |
| 3 | tekstur CC0 (Poly Haven, 58 tekstur, 1,25 MB) untuk backdrop dan tile | selesai |
| 4-6 | `DS.Maps` + 30 map (Act I-III) dengan backdrop, palet, cahaya, tile masing-masing | **visual selesai, belum dipoles** |
| monster/boss baru | 22 monster A + 13 B, boss Hades/Zeus/Minotaur/Medusa/Talos | belum |
| 7 | MC baru (voxel lebih detail) | belum |
| 8 | suara, dokumen, `CHANGELOG`, cache-buster 7.0.0, review | belum |

## Yang ada sekarang

- `src/world/maps.js` + `src/world/maps/act1|2|3.js`: satu entri per map (rung ladder, palet, tema cahaya, grade,
  backdrop, affinity spawn, tile). Endless memakai 30 map itu lagi (`rung.lap` ada, tint korupsi belum dipasang).
- Kind backdrop baru: `src/core/backdrop/kinds-arch.js` (wall berbukaan, celltier, catwalk, hangcage, watchtower,
  statue, biggate, chandelier, lighthouse, stilthouse, spiralstair, scales, belltower), `kinds-nature.js`
  (mushrooms, ropebridge, cloudsea, mangrove, lilies, glowthreads, webs, eggs, ghostlamps, icefall, skeleton),
  `kinds-greek.js` (colonnade, temple, bullhead, bigchain, titan, boat, thrones, chariot, stormcloud, anvil,
  automaton, furnace, olive, asphodel).
- Map tertutup = dinding blok di belakang level (`wall`) dengan jendela/lengkung; cahaya masuk lewat bukaan.
- QA: `npm test` (139 hijau), `node tools/qa/audit-world.js <url> --depths 1-30`,
  `node tools/qa/shoot-maps.js <url> --tag X --depths 21,24`, `node tools/qa/shoot-kinds.js <url>`,
  `npm run solve 14` (0 exit tak terjangkau). Dev server: `python devserver.py 8124`.

## Masalah terbuka (kerjakan dulu)

1. `audit-world.js --depths 11-30` terakhir gagal 5 cek. Sudah diperbaiki tanpa dijalankan ulang: `ghostlamps` dan
   `stormcloud` jadi kind bebas, `chariot` diberi pijakan, lapisan `cloudsea` m28 dipindah ke d 12
   (sebelumnya menembus ke z +3.6, di depan bidang main). **Belum dicek:** satu mesh masih di z -0.65
   (`BoxGeometry[198]`) di salah satu depth Act II/III. Jalankan audit lagi untuk menemukannya.
2. Poles visual (lihat `tools/qa/out/maps/a2`, `a3` setelah menjalankan `shoot-maps`): Labyrinth terlalu seragam,
   Tartarus dan Zeus terlalu gelap, tiang `mangrove` terlalu besar, `wall` boss Warden masih gelap.
3. Arena boss dan safe room masih 40x22 dan 20x22; segmen dua lantai di corridor dan atap tile opsional belum ada.
4. Act III belum punya boss barunya: rotasi masih Lich (d25) dan Magma Colossus (d30).

## Berikutnya

1. Audit ulang, perbaiki sisa z-front, poles visual di atas.
2. `roster` per map (ganti `affinity`) dan monster baru: template ada di `src/entities/enemies3.js` (behavior + config),
   model di `src/core/voxel.js` (`BUILDERS` + `HEIGHT`; tambahkan API `register` supaya model baru bisa di file lain),
   rencana per monster di PLAN-v7.md bagian "Monster baru". Hook yang perlu: `p.slowT` dan `p.pullT` di
   `player.js` `move()` (tatapan Gorgonite, rantai Jailer), `e.hidden` di pose renderer (Bogman).
3. Boss baru (Hades, Zeus, Minotaur, Medusa, Talos), termasuk mekanisme floor boss horizontal (d21/23/27) dan arena per boss.
4. Ruang khusus: safe room Act I-II (kemah) dan Temple of Hestia, trial Act III (Arena of Heroes), tint korupsi endless.
5. Fase 7 (MC) dan Fase 8 (suara, `docs/11-v7.md`, `CHANGELOG`, `?v=7.0.0`, `/code-review`).

## Catatan

- Tekstur bukan dari ambientCG tapi Poly Haven (CC0, diffuse 1k JPG langsung, md5 dicek). Kredit di `ASSETS.md`;
  ulangi dengan `npm run assets:fetch` lalu `npm run assets:bake`. `?hdtex=0` mematikan semua tekstur HD.
- Cek user di lokal: frame time (`npm run qa:frame`) di level besar, ekonomi koin (musuh per lantai naik ~1.7x), suara.
