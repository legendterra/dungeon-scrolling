# Dungeon Scrolling — Overhaul Plan v6

## Context
User mau game voxel three.js ini jadi 3D penuh dengan POV 2.5D (ref: Prometheus/Genmu, Elsword, Honkai), semua karakter tetap voxel.
Keluhan: armor tidak auto-replace, background kurang tema & bukan sumber cahaya, VFX serangan/elemen monoton, parkour/ladder/rope
generator rusak, boss jarang muncul, mentok depth 10, UI tidak proporsional, belum ada shadow/post-FX.
Keputusan user: **fondasi dulu → grafis → VFX → UI**, semua voxel, **Act system (3×10) + Endless**, **UI HTML overlay**.
Tetap three.js (bukan Qt). Tiap fase = branch + commit sendiri, bisa dimainkan di akhir tiap fase.

## Temuan audit (akar masalah)
- **Depth 10**: `FINAL_DEPTH:10` di `src/core/rng.js:18`; tabel difficulty di-clamp 10 (`src/systems/difficulty.js:31,36,65`); HUD "10/10" (`profile.js:346`); worker leaderboard cap 10 (`worker/index.js:21`).
- **Boss**: Slime King hanya depth 10, Stone Warden hanya depth 7 mountain, Arbiter hanya di trial 22% (`game.js:199,318,508-536`). Armor boss flat 4 → senjata lemah cuma 1–4 dmg (`base.js:66`).
- **Worldgen**: solver lulus tapi rata-rata ~8 rung + ~3 tali "tambalan" per floor. Penyebab:
  1. ledge `==` di corridor dipasangi pilar oleh `supportPlatforms` (`generator.js:597-613`) → reach menggantung tali di sampingnya;
  2. batu loncatan di atas jurang dihapus (`generator.js:604-610`) lalu ditambal generik;
  3. tambalan reach dipasang *setelah* pass "no floating" → pasti melayang;
  4. `groundBelow` menganggap platform = tanah (`tilemap.js:219`), `ensureClimbs` hanya cek tebing naik ke kanan (`reach.js:483`);
  5. tangga setengah jadi (`reach.js:495` `continue`);
  6. `parkour.js:162-179` tangga kepotong & ledge tertanam di batu;
  7. `mountain.js:67,86,89-96` tali 3 tile di atas bibir, tali terpotong ledge, tali + tangga dobel (`reach.js:423`);
  8. puzzle/barrier/bonus/hazard mengedit terrain *setelah* validasi (`game.js:247-254`, `puzzle.js:385`, `bonus.js:136`).
- **Puzzle**: barrier selalu keygate (plates/braziers dead code, `puzzle.js:439`), bisa dilompati (tinggi 4), Torch Hall "SHOOT THE SWITCH" tanpa switch (`game.js:343`).
- **Musuh**: 11 tipe, tabel spawn hanya per-depth (tak per-bioma, `enemies.js:59`); musuh numpuk di awal (`game.js:369`); batas 1 colossus bocor (`difficulty.js:91`).
- **Combat/VFX**: 8 elemen + 28 reaksi sudah ada (`elements.js`) — yang kurang identitas visual. Di mode voxel semua art serangan 2D dilewati (`game.js:872`); miss = tanpa visual; hit = kipas putih sama (`renderer3d.js:2958`); `comboStep` tidak dipakai (`player.js:725`); animasi cuma lengan kanan (`renderer3d.js:2301`). FX utama 2D canvas (`particles.js`).
- **Render**: three r128 vendored (`libs/three.min.js`), Lambert, 3 directional + pool point light, tanpa shadow/post-FX/AO; shake & zoom tidak menggerakkan dunia 3D (`renderer.js:124-140`); overlay 2D drift ~4% dari anchor 3D; alokasi geometry per-frame di `spawnSwingArc/GroundBurst/SmokePuff`; `indexOf` O(n²) (`renderer3d.js:3282`); doorway PointLight ekstra (`:1005`) memicu recompile shader.
- **UI**: semua di kanvas logis 320×180 + font bitmap (`ui3/screen.js`, `ui/ui.js:66-128`) → akar UI kebesaran/buram.
- **Armor**: tidak ada perbandingan rarity; hook di `takeItem` `src/scenes/game.js:627-656`.
- **Test**: tidak ada unit test; hanya `tools/qa/*` (CDP headless) dan `tools/solve-levels.js`.

## Fase 0 — Harness test
- `tests/` + `node --test` (tanpa dependency). Loader `tests/_load.js` memakai pola vm dari `tools/solve-levels.js` untuk memuat modul IIFE `window.DS`.
- Script `npm test`. Setiap fase berikut mulai dari test RED.

## Fase 1 — Fondasi gameplay
1. **Armor auto-replace** — `takeItem` (`game.js:627`): kalau slot terisi dan `item.rarity > current.rarity` → pakai item baru, yang lama ke bag (bag penuh → drop via `Ent.addPickup`), `player.refreshStats()`, toast "Equipped ▲". Rarity sama/lebih rendah → perilaku lama. Shop (`inventory.js:448`) ikut aturan yang sama.
2. **Worldgen rapi**
   - Tandai tile desain (`designed`) → dikecualikan `supportPlatforms`; ledge corridor ditempel ke dinding/diturunkan, tidak dipilari.
   - Urutan baru: assemble → puzzle/barrier/bonus/hazard edit → support → `Reach.ensureExit` → **pass anti-melayang terakhir** yang menambatkan setiap tambalan (tangga dari tanah ke bibir, tali dari bibir ke bawah).
   - `ensureClimbs` dua arah; tangga atomik (penuh atau batal); `groundBelow` bedakan platform vs solid.
   - Fix `parkour.js` (stair squeeze, ledge di batu) dan `mountain.js` (tali mulai di bibir, ledge tidak memotong tali, tidak ada tali+tangga dobel).
   - **Solver**: semua tipe floor (safe, boss, trial, act baru) + edit pasca-generate; metrik baru `floatingRungs`, `orphanRopes`, `halfLadders`, `pillarsInCorridor` dengan ambang gagal (target 0 / ≤1 per floor).
3. **Puzzle** — hidupkan varian plates & braziers; barrier setinggi ruangan (atap); Torch Hall dapat target switch yang bisa ditembak.
4. **Musuh** — tabel spawn per-bioma × depth; distribusi marker merata sepanjang level (stratified per segmen); cap colossus benar; +4 tipe baru untuk act 2–3 (mis. ice wisp, magma crab, harpy, cultist) dari builder voxel yang ada.
5. **Act system + boss**
   - Ganti `FINAL_DEPTH` dengan `ACTS` (3×10) di `rng.js`/`difficulty.js`; difficulty jadi formula (tak di-clamp), bioma berputar per act.
   - Boss di depth 5 & 10 tiap act (6 boss): Slime King, Stone Warden, Arbiter (dipindah jadi boss tetap) + 3 baru (Frost Wyrm, Lich, Magma Colossus) dengan pola serangan sederhana berbasis state machine `boss.js`.
   - Safe room sebelum tiap boss; pintu boss room lanjut ke act berikutnya; setelah depth 30 → **Endless** (scaling + boss tiap 5 depth). HUD "Act II · 3/10", leaderboard worker cap dinaikkan.
   - Armor flat dibatasi (min 25% damage tembus) agar boss tidak terasa "tidak bisa mati".

## Fase 2 — Grafis 3D / kamera 2.5D
- **Post-processing**: vendor `examples/js` three@0.128.0 (EffectComposer, RenderPass, SAOPass, UnrealBloomPass, SMAAPass, ShaderPass + shader-nya) ke `libs/post/` (**unduhan dari jsdelivr, minta izin dulu**). Pipeline di `render()` `renderer3d.js`: Render → SSAO → Bloom → color grading/LUT per tema → SMAA → layar, lalu `screen.js` menggambar UI di atasnya. Preset kualitas Low/Med/High + auto-turun via frame time.
- **Shadow map**: key light directional `PCFSoftShadowMap`, frustum ketat mengikuti player; aktor cast, tile receive; blob shadow hanya di Low.
- **Material**: karakter/prop → `MeshStandardMaterial` (roughness tinggi) + PMREM dari warna langit tema; tile tetap Lambert (murah).
- **Kamera 2.5D**: preset default baru lebih dekat & sinematik (distance ~18, pitch ~11°, FOV ~35), zoom dinamis (masuk saat combat/boss, keluar saat vertikal), look-ahead halus; **shake & punch dipindah ke kamera 3D**; FX/label diproyeksikan pakai kamera (hapus drift).
- **Backdrop = sumber cahaya (backlight)**: benda langit/sigil di belakang stage jadi key light yang menyorot *ke arah kamera* → rim light di tepi karakter, siluet, god rays (pass radial blur), fog diwarnai matahari, bloom pada sumber.
- **Backdrop bertema**: tambah set-piece voxel berlapis (3 gunung berbaris, danau/air berkilau dengan pantulan, air terjun, hutan, reruntuhan, kristal) per bioma tiap act di `RECIPE` `backdrop3d.js:672`.
- **Perf**: pool geometry/material untuk swing/burst/smoke, `Map` ganti `indexOf`, doorway light masuk pool. `qa:frame` harus tetap 60 fps di High pada GPU menengah.

## Fase 3 — VFX serangan & elemen (tetap three.js, berbasis shader GPU — bukan DOM/CSS)
- Modul baru `src/fx3d/`: sistem partikel GPU bersama (InstancedMesh voxel + billboard soft), **ribbon trail** di ujung senjata (shader gradient + noise dissolve), mesh **slash crescent** shader, shockwave ring, debris voxel, decal tanah, hit-flash emissive di musuh, damage number 3D. Semua pooled.
- **Gerakan**: pakai `comboStep` → combo nyata per senjata (sword 3-hit: horizontal/diagonal/overhead; dagger flurry kembar; greataxe slam + shockwave; spear thrust + streak; bow arrow trail + impact; staff orb cast). Animasi seluruh tubuh (torso twist, lunge kaki), trail tetap muncul saat miss. Heavy/charge punya finisher sendiri.
- **Elemen**: 8 elemen × 6 senjata — tiap elemen punya aura senjata, warna/tekstur trail, efek hit, dan efek reaksi 3D sendiri (wind dapat emitter yang selama ini tidak ada); reaksi 28 yang sudah ada dipertahankan, cuma divisualkan ulang. FX 2D `particles.js` dipensiunkan untuk mode 3D.

## Fase 4 — UI HTML overlay ala anime RPG
- `src/ui-html/` + `styles/ui.css`: HUD di atas canvas (portrait + HP/MP/stamina kiri-bawah, skill & hand kanan-bawah dengan cooldown radial, depth/act + minimap kanan-atas, boss bar tengah-atas), bag/equipment dengan tooltip & perbandingan stat, menu utama/loadout/pause/game over.
- Skala via `clamp()`/`vh`; font di-vendor lokal (tetap jalan `file://`); animasi CSS ringan; kursor custom disembunyikan di atas panel HTML.
- `ui.js` HUD 320×180 dihapus bertahap per layar; nama musuh & angka damage tetap di 3D.

## Fase 6 — Fix kamera, background & lighting (feedback user setelah Fase 2)
1. **Background diam**: horizon dikunci satu ketinggian per level (hapus re-seat tiap 8 frame + easing 22% di `renderer3d.js` ~3887-3900 yang bikin patah-patah); parallax horizontal tetap (band jauh bergeser lebih lambat).
2. **Kamera tidak "blinking" saat loncat**: dead zone vertikal (loncat biasa tidak menggeser kamera, hanya panjat/jatuh jauh); hapus zoom-out karena kecepatan vertikal, zoom dinamis hanya untuk boss/musuh dekat.
3. **Arah cahaya mengikuti matahari**: key light directional diarahkan dari posisi `DS.Backdrop3D.heroInfo().worldPos` (warna & intensitas ikut sumber), shadow jatuh menjauhi matahari; fill light dari sisi kamera diseimbangkan supaya sisi depan karakter tidak gelap total. Tema indoor: key light dari arah bukaan/portal.
4. **Setiap obor menerangi sekitarnya**: pool point light dinamis (N terdekat ke kamera, fade in/out halus, jumlah light tetap → tanpa recompile shader) + cahaya "baked" murah untuk obor di luar pool (vertex-color/light decal di dinding & lantai sekitar), jadi semua obor yang di-generate terlihat menyala dan menerangi.
5. **Api obor realistis**: ganti sprite blob dengan api shader (billboard/cross-quad dengan noise bergulir, gradien putih-kuning-oranye-merah, alpha lidah api), partikel bara naik + asap tipis, flicker intensitas & posisi light sinkron dengan api; bloom hanya di inti api (bukan bulatan besar).
Verifikasi: screenshot loncat berurutan (background tidak bergerak vertikal, kamera stabil), arah bayangan konsisten dengan posisi matahari di tiap tema, obor di luar pool tetap menyala, frame time tidak naik > 1 ms di High.

## Fase 7 — Rapikan UI di dalam game (in-world UI, satu design system dengan Fase 4)
Fase 4 menangani HUD & menu layar; fase ini semua UI yang menempel di dunia game, yang sekarang terlihat seperti "tempelan".
1. **Design system bersama**: token warna, font, radius, bayangan, animasi masuk/keluar dipakai sama oleh HUD (Fase 4) dan UI in-world.
2. **Prompt interaksi** ("F TAKE ...", chest, lever, shop, door): chip kecil kontekstual di atas objek, ikon tombol + teks pendek, fade-in saat dekat.
3. **Label item drop**: nama + warna rarity + beam cahaya rarity; perbandingan stat singkat (▲/▼) saat didekati.
4. **Musuh**: HP bar tipis di atas kepala (muncul saat terkena/elite), nama hanya untuk elite/miniboss, ikon status elemen (burn, freeze, dll.).
5. **Damage number**: angka bergaya (outline, pop + arc), warna per elemen, crit lebih besar, reaksi elemen jadi label bergaya (mis. "OVERLOAD").
6. **Banner & notifikasi**: title card depth/act/bioma sinematik; toast pickup/equip ditumpuk rapi di satu sudut; intro boss (nama + bar) bergaya.
7. **Panel kontrol/tutorial**: ganti kotak besar di tengah layar dengan hint kontekstual kecil yang muncul sekali saat aksi pertama relevan.
8. **Panel dunia** (shop, shrine, enchant table, chest reward): pakai komponen panel yang sama dengan Fase 4.
Verifikasi: screenshot 720p/1080p/1440p di depth 1, boss, shop; tidak ada teks tumpang tindih; ukuran proporsional di semua resolusi.

## Tambahan (disetujui user 2026-09-28 malam)
- **Fase 3 + Element Infusion**: senjata tidak lagi terkunci 1 elemen. Elemen yang ditemukan selama run (dari senjata berelemen yang diambil, shrine, boss) masuk ke "essence" run; tombol **R** memutar infusion senjata aktif ke elemen yang sudah terbuka (cooldown singkat, biaya mana kecil). Rarity tetap menentukan `ELEMENT_SHARE`. Tiap elemen mengubah efek hit + varian E-skill. HUD menampilkan roda/ikon elemen aktif.
- **Fase 6 + polish**: matahari tidak silau berlebihan (bloom di-clamp per sumber), gunung jauh bentuknya lebih organik (bukan piramida bertingkat), tes serangan harpy di browser.
- **Fase 8 — Animasi karakter**: rig voxel penuh untuk player & musuh: idle bernapas, jalan/lari dengan ayunan tangan-kaki, loncat (anticipation/apex/fall), mendarat (squash), dash, panjat, kena hit (flinch + knockback), mati (ragdoll voxel pecah); blending antar state; boss punya animasi serangan telegraph.
- **Fase 9 — Suara**: SFX untuk combo per senjata, 8 elemen + reaksi, boss baru & musuh baru, obor, UI baru (lewat `DS.Audio` yang ada; generate prosedural bila tidak ada aset).
Urutan kerja otomatis: 3 → 4+7 → 6 → 8 → 9. Tiap fase: test + cek browser + commit di `feat/v6-foundation`, tanpa push/merge.

## File kritis
`src/core/rng.js`, `src/systems/difficulty.js`, `src/scenes/game.js`, `src/world/generator.js`, `src/systems/reach.js`, `src/world/parkour.js`, `src/world/mountain.js`, `src/world/puzzle.js`, `src/entities/{enemies,enemies2,boss}.js`, `src/core/renderer3d.js`, `src/core/backdrop3d.js`, `src/core/voxel.js`, `src/entities/player.js`, `src/systems/{elements,skills,particles}.js`, `src/ui3/screen.js`, `src/ui/ui.js`, `index.html`, `tools/solve-levels.js`, `worker/index.js`.

## Verifikasi
- `npm test` (unit: armor rule, act/difficulty table, spawn distribusi, metrik worldgen).
- `npm run solve 50` → 0 unreachable, metrik anti-melayang di bawah ambang, semua tipe floor termasuk depth 1–30 + endless.
- `qa:climb`, `qa:hangs`, `qa:frame`, `qa:hud`, `shots:backdrop` terhadap devserver (`npm run dev`, port 8123).
- Preview di browser pane: main depth 1 → boss act 1, cek kamera/shadow/bloom/backlight, combo & elemen, UI di 720p/1080p/1440p; screenshot sebelum/sesudah per fase.
- `/code-review` tiap fase sebelum commit; bump cache-buster di `index.html`.
