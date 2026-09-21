# Dungeon Scrolling — Rencana Pengembangan

> Side-scrolling pixel dungeon crawler. Pure HTML5 Canvas + vanilla JavaScript.
> Tanpa game engine, tanpa dependency, tanpa build step. Buka `index.html` → main.

---

## 1. Keputusan Teknis

| Aspek | Pilihan | Alasan |
|---|---|---|
| Platform | HTML5 Canvas 2D + vanilla JS (ES modules) | Zero install, zero dependency, iterasi cepat, gampang dishare |
| Resolusi internal | 320 x 180 px, di-upscale integer ke layar | Look pixel-art autentik, crisp di semua ukuran layar |
| Rendering | `ctx.imageSmoothingEnabled = false` | Pixel tajam, tidak blur |
| Art asset | Digambar dari kode (array warna → `OffscreenCanvas`) | Nol file eksternal. Bisa diganti PNG kapan saja lewat satu loader |
| Audio | Web Audio API, tone digenerate runtime | Nol file `.wav`/`.mp3`, SFX chiptune dari oscillator |
| Save | `localStorage` (JSON) | Simpan progress meta & unlock |
| Game loop | `requestAnimationFrame` + fixed timestep 60Hz + accumulator | Fisika deterministik, tidak terpengaruh framerate monitor |

**Tidak ada** npm, tidak ada Node, tidak ada bundler. Cukup double-click `index.html`.

---

## 2. Struktur Folder

```
4. Dungeon Scrolling/
├── index.html              # entry point, <canvas> + boot script
├── PLAN.md                 # dokumen ini
└── src/
    ├── main.js             # boot, game loop, state machine
    ├── core/
    │   ├── loop.js         # fixed timestep accumulator
    │   ├── input.js        # keyboard + gamepad mapping
    │   ├── renderer.js     # canvas, kamera, layer, upscaling
    │   ├── audio.js        # Web Audio SFX + musik prosedural
    │   ├── rng.js          # seeded RNG (mulberry32) — run bisa direproduksi
    │   └── storage.js      # wrapper localStorage
    ├── scenes/
    │   ├── menuScene.js    # main menu
    │   ├── gameScene.js    # gameplay utama
    │   ├── pauseScene.js   # pause + inventory
    │   └── gameOverScene.js
    ├── entities/
    │   ├── entity.js       # base: posisi, velocity, hitbox, hp
    │   ├── player.js       # gerak, lompat, serang, dash, i-frame
    │   ├── enemy.js        # base AI + state machine
    │   ├── enemies/        # slime.js, zombie.js, bat.js, skeleton.js, boss.js
    │   ├── projectile.js   # panah, bola api, proyektil musuh
    │   └── pickup.js       # koin, heart, item drop
    ├── items/
    │   ├── weaponTypes.js  # definisi archetype senjata
    │   ├── affixes.js      # tabel prefix/suffix enchant
    │   ├── lootTable.js    # drop rate per musuh & per chest
    │   ├── generator.js    # roll item random (tipe + rarity + affix)
    │   └── inventory.js    # slot, equip, compare, drop
    ├── world/
    │   ├── tilemap.js      # grid tile + collision
    │   ├── generator.js    # procedural room-based level gen
    │   ├── room.js         # template ruangan
    │   └── chest.js        # peti + interaksi buka
    ├── systems/
    │   ├── physics.js      # gravitasi, AABB collision, resolve
    │   ├── combat.js       # damage calc, crit, knockback, status effect
    │   ├── enchant.js      # logika enchant table di safe room
    │   └── particles.js    # darah, debu, sparkle, damage number
    └── art/
        ├── palette.js      # palet warna terbatas (32 warna)
        └── sprites.js      # data pixel semua sprite (array string)
```

---

## 3. Core Gameplay

### 3.1 Kontrol
| Aksi | Keyboard | Gamepad |
|---|---|---|
| Gerak kiri/kanan | `A` / `D` atau `←` `→` | Left stick |
| Lompat | `Space` / `W` | A |
| Serang | `J` / klik kiri | X |
| Serangan berat / charge | tahan `J` | tahan X |
| Dash (i-frame) | `Shift` | RB |
| Interaksi (peti, pintu, enchant) | `E` | B |
| Inventory | `Tab` | Y |
| Pause | `Esc` | Start |

### 3.2 Player
- HP (heart) dan Stamina (dash + serangan berat konsumsi stamina, regen otomatis)
- Coyote time 6 frame + jump buffer 6 frame → lompat terasa responsif
- Variable jump height (lepas tombol lebih awal = lompat lebih pendek)
- Dash memberi 8 frame invulnerability
- Knockback saat kena hit + 30 frame i-frame

### 3.3 Kamera
- Follow player dengan smoothing (lerp) dan deadzone
- Look-ahead ke arah hadap player
- Screen shake saat hit besar / boss slam
- Clamp ke batas level

---

## 4. Sistem Senjata & Loot ⭐ (inti request)

### 4.1 Archetype Senjata

| Tipe | Damage | Speed | Range | Karakter khas |
|---|---|---|---|---|
| **Sword** | Sedang | Sedang | Pendek | Serba bisa, combo 3-hit |
| **Dagger** | Rendah | Sangat cepat | Sangat pendek | Crit rate tinggi, cocok hit-and-run |
| **Greataxe** | Sangat tinggi | Lambat | Sedang | Knockback besar, bisa charge |
| **Bow** | Sedang | Sedang | Jauh | Butuh charge untuk damage penuh, arrow terbatas & bisa dipungut |
| **Staff (Mage)** | Bervariasi | Sedang | Jauh | Konsumsi mana, elemental (fire/ice/lightning) |
| **Spear** | Sedang | Sedang | Panjang | Jangkauan aman, thrust lurus |

Setiap senjata punya: `baseDamage`, `attackSpeed`, `range`, `critChance`, `knockback`, `staminaCost`, `hitboxShape`, dan pola animasi sendiri.

### 4.2 Rarity

| Rarity | Warna | Jumlah affix | Drop rate |
|---|---|---|---|
| Common | Putih | 0 | 55% |
| Uncommon | Hijau | 1 | 27% |
| Rare | Biru | 2 | 13% |
| Epic | Ungu | 3 | 4.5% |
| Legendary | Oranye | 4 + efek unik | 0.5% |

Rarity ikut naik seiring kedalaman dungeon (depth scaling).

### 4.3 Affix / Enchant

**Prefix (kemampuan ofensif):**
- `Flaming` — +burn damage over time
- `Frozen` — slow musuh 40% selama 2 detik
- `Shocking` — chain lightning ke 2 musuh terdekat
- `Vampiric` — lifesteal 8% dari damage
- `Cruel` — +25% damage, -10% attack speed
- `Swift` — +20% attack speed
- `Piercing` — abaikan armor musuh

**Suffix (kemampuan utilitas):**
- `of the Bear` — +max HP
- `of the Cat` — +movement speed, +dash charge
- `of Greed` — +30% coin drop
- `of the Owl` — +max stamina & regen
- `of Thorns` — pantulkan damage ke penyerang

Nama item digenerate otomatis: `Flaming Dagger of the Cat`.

### 4.4 Sumber Loot
1. **Enemy drop** — musuh biasa 12% drop item, elite 40%, boss 100% (dijamin minimal Rare)
2. **Chest** — tiap ruangan punya peluang spawn peti. Ada 3 tier:
   - Wooden Chest — item Common–Rare
   - Iron Chest — item Uncommon–Epic, butuh kunci dari elite
   - Cursed Chest — item Epic–Legendary, tapi spawn 3 musuh saat dibuka
3. **Safe Room** — tiap 3 level ada ruangan aman berisi merchant + enchant table

### 4.5 Enchant Table
Di safe room, player bisa:
- **Reroll affix** — acak ulang affix yang ada (biaya: koin, naik tiap reroll)
- **Add affix** — tambah 1 affix baru kalau slot masih kosong (biaya: koin + shard)
- **Upgrade rarity** — naikkan rarity 1 tingkat, buka 1 slot affix (biaya: shard banyak)
- **Salvage** — hancurkan item jadi shard

**Shard** didapat dari salvage item dan drop boss. Ini mata uang enchant.

### 4.6 Inventory
- 2 slot equip (weapon utama + secondary/swap dengan `Q`)
- 8 slot tas
- Panel compare: hover item baru → tampil side-by-side dengan yang sedang dipakai
- Item bisa di-drop untuk buka ruang

---

## 5. Musuh

| Musuh | HP | Perilaku |
|---|---|---|
| **Slime** | Rendah | Hop ke arah player, split jadi 2 slime kecil saat mati |
| **Zombie** | Sedang | Jalan lambat tanpa henti, tanky, damage kontak tinggi |
| **Bat** | Sangat rendah | Terbang pola sinusoid, dive attack, sulit dikenai |
| **Skeleton Archer** | Rendah | Jaga jarak, tembak panah, mundur kalau player dekat |
| **Elite (varian)** | 2.5x | Versi lebih besar dari musuh biasa, aura, drop kunci |
| **BOSS: Slime King** | Tinggi | Fase 1: slam + spawn minion. Fase 2 (<50% HP): roll charge + rain proyektil |

Setiap musuh pakai state machine: `IDLE → PATROL → CHASE → ATTACK → HURT → DEAD`.

---

## 6. Level Generation

Procedural, room-based, side-scrolling horizontal:

1. Tentukan jumlah ruangan berdasarkan depth (5–9 ruangan)
2. Pilih template ruangan acak dari pool (platform layout berbeda-beda)
3. Sambungkan horizontal, pastikan tiap gap bisa dilompati (validasi jump-arc)
4. Tempatkan spawn musuh sesuai budget difficulty
5. Tempatkan peti, koin, dan hazard (spike, lubang)
6. Ruangan terakhir = pintu keluar; tiap level ke-3 = boss room
7. Semua pakai seeded RNG → run bisa direproduksi dengan seed yang sama

**Progression:** 5 level dungeon → boss final. Difficulty scaling: HP musuh, jumlah spawn, dan rarity loot naik per depth.

---

## 7. Main Menu & UI

**Main Menu** — logo pixel-art, background dungeon parallax beranimasi, menu: `START RUN` / `HOW TO PLAY` / `STATS` / `OPTIONS`.

**HUD in-game** — heart bar kiri atas, stamina bar di bawahnya, senjata aktif + rarity border kanan bawah, koin & shard kanan atas, depth indicator tengah atas.

**Damage number** floating saat hit, warna beda untuk crit.

**Pause** — resume / inventory / restart / quit to menu.

**Game Over** — statistik run (depth tercapai, musuh dibunuh, item terbaik, waktu), tombol retry.

---

## 8. Roadmap Bertahap

Setiap fase menghasilkan sesuatu yang **bisa langsung dimainkan**, jadi kamu bisa review progresnya tiap fase.

| Fase | Isi | Hasil yang bisa dicoba |
|---|---|---|
| **1. Fondasi** | Canvas, game loop, input, renderer, kamera | Kotak yang bisa digerakkan |
| **2. Platforming** | Fisika, gravitasi, tilemap, collision, lompat | Player lompat-lompat di platform, terasa enak |
| **3. Art & Animasi** | Palette, sprite dari kode, animator, parallax background | Karakter pixel-art beranimasi di dungeon |
| **4. Combat** | Hitbox serangan, damage, knockback, i-frame, partikel | Bisa mukul boneka latihan |
| **5. Musuh** | Slime, zombie, bat, skeleton + AI state machine | Dungeon yang berbahaya |
| **6. Loot & Senjata** ⭐ | 6 archetype, rarity, affix, generator, inventory, drop | Bunuh musuh → dapat senjata random |
| **7. Chest & Enchant** ⭐ | Peti 3 tier, safe room, enchant table, shard, salvage | Loop build-crafting lengkap |
| **8. Level Gen** | Procedural room, hazard, exit, depth scaling | Run yang beda tiap main |
| **9. Boss** | Slime King 2 fase + arena boss | Run punya klimaks |
| **10. Menu & UI** | Main menu, HUD, pause, game over, stats | Game utuh dari awal sampai akhir |
| **11. Audio** | SFX prosedural + musik ambient chiptune | Ada nyawanya |
| **12. Polish** | Screen shake, hitstop, transisi, balancing, save | Rasa produk jadi |

---

## 9. Testing

Karena tidak pakai framework test, verifikasi pakai pendekatan ringan:
- File `test.html` berisi assertion sederhana untuk logika murni: damage calculation, affix rolling, loot table probability, RNG determinism, AABB collision
- Untuk gameplay feel: debug mode (`F1`) yang menampilkan hitbox, FPS, state entity, dan god mode
- Loot table diverifikasi dengan simulasi 100.000 roll → cek distribusi rarity sesuai desain

---

## 10. Risiko & Catatan

| Risiko | Mitigasi |
|---|---|
| Sprite dari kode makan waktu lama untuk banyak animasi | Mulai dari set kecil (idle/run/jump/attack), tambah bertahap. Loader dirancang agar bisa langsung diganti PNG tanpa ubah kode lain |
| Level gen bisa menghasilkan gap yang tidak bisa dilompati | Validasi jump-arc matematis saat generate; regenerate kalau gagal |
| Balancing affix bisa jadi terlalu overpowered | Semua angka ditaruh di satu file konstanta agar gampang di-tune |
| Scope loot+enchant cukup besar | Fase 6 dan 7 dipisah, masing-masing bisa direview terpisah sebelum lanjut |

---

## 10b. Tambahan Setelah Playtest Pertama

Semua sudah diimplementasi dan diverifikasi jalan di browser.

| Permintaan | Solusi |
|---|---|
| Rintangan bergerak otomatis | `src/world/hazards.js` — 3 jenis: **platform bergerak** (bisa dinaiki, membawa pemain), **bandul berduri** naik-turun, **gergaji** menyapu horizontal. Digenerate per ruangan, 0.3–0.8 peluang tergantung depth |
| Jangkauan serangan terlalu pendek | Hitbox sekarang **aktif 9–13 frame** (bukan cek 1 frame), dan mulai 5px di dalam badan pemain supaya musuh yang menempel tetap kena. Jangkauan semua senjata dinaikkan (sword 17→24, spear 26→34, dst) |
| Charge attack saat tombol ditahan | Melee: **tap = serang biasa, tahan = serangan berat** saat dilepas (damage s/d 2.5x, jangkauan lebih jauh, knockback 1.8x). Ranged: tahan untuk menarik busur/mengisi staff, lepas untuk menembak |
| Animasi senjata di karakter | Sprite senjata digambar di tangan dan dirotasi mengikuti ayunan. Tiap archetype punya gerak sendiri: `arc` (sword), `chop` (greataxe), `stab` (dagger), `thrust` (spear), `draw` (bow), `cast` (staff) |
| Efek tiap senjata beda | Trail digambar dari pose senjata itu sendiri — sabit melengkung untuk sword/axe, garis lurus untuk spear/dagger, tali busur untuk bow, cincin elemental di ujung tongkat untuk staff |
| Tidak bisa naik ke atas | **Double jump** (1 lompatan udara) sekarang selalu tersedia |
| Spike terlalu lebar, dilompati tetap mati | Generator memangkas setiap deretan spike jadi maksimal 2 tile dan memasang platform di atasnya |
| Puzzle dungeon | `src/world/puzzle.js` — brankas berpalang yang berisi peti. Dibuka dengan **mendorong peti kayu ke pressure plate**, atau **menarik tuas** (gerbang terbuka 7 detik). Peti kayu juga bisa didorong dan dinaiki untuk mencapai tempat tinggi. Muncul di ~62% level |
| Bingung cara ganti senjata | Senjata kedua tampil di HUD dengan label **Q**, toast saat mengambil item menyebutkan tombolnya, dan kalau tas penuh menekan E langsung **menukar** senjata aktif (yang lama jatuh ke tanah, tidak hilang) |

**Catatan desain brankas:** gerbang puzzle tidak pernah menghalangi jalan maju — hanya menjaga harta. Puzzle yang tidak terpecahkan merugikan loot, tidak pernah mengunci run.

### Putaran kedua

| Permintaan | Solusi |
|---|---|
| Iron chest dijaga mini boss pembawa kunci | Tiap level yang punya peti terkunci otomatis dapat satu **keybearer**: musuh biasa berukuran 2x dengan palet merah darah, HP 6.5x, armor +2. Ditempatkan sejauh mungkin dari pintu masuk. Kunci **dijamin** drop darinya (elite biasa cuma 35% peluang) |
| Tanda kunci di atas kepalanya | Sprite kunci melayang naik-turun di atas keybearer dengan glow emas, terlihat dari jauh |
| Musuh kadang drop darah 1-2 | Peluang 9% per musuh biasa, isi 1–2 heart (terverifikasi: 8.8%, rata-rata 1.55) |
| Klik kanan = mini dash, 2 isi, cooldown 2 detik | Aksi terpisah dari dash utama. Jarak lebih pendek (7 frame @ 3.1 px), 5 frame i-frame, 8 stamina. Dua isi habis bersamaan lalu **keduanya terisi ulang sekaligus** setelah 120 frame. Ditampilkan sebagai dua pip hijau di bawah bar stamina, yang mengisi progresif saat recharge. Alt keyboard: `C` |

---

### Putaran ketiga

| Permintaan | Solusi |
|---|---|
| Koin & shard harus berguna | **Pedagang** di tiap safe room, berdiri di sebelah enchant table. Jualan: Bread (+2 heart), Quiver (+15 arrow), Shard Pouch (+4 shard), satu senjata acak, dan satu barang mewah acak — Heart Vessel (+1 max heart) atau Swift Boots (+1 dash charge) atau Green Flask (+30 stamina). Stok di-roll ulang tiap kunjungan. Semua upgrade bersifat run-scoped, ikut hilang saat mati |
| Pit of doom / parkour | 3 template ruang jurang dengan rantai platform. Jatuh = mati seketika. Muncul 35–85% per level tergantung depth (terukur: 14 dari 25 level). Validator gap otomatis **tidak** menjembatani jurang yang sudah punya rantai platform, jadi desainnya tidak diratakan |
| Pit random itu zonk | **Platform retak**: 1–2 pijakan di tiap jurang punya retakan halus sebagai petunjuk, runtuh 26 frame setelah diinjak, lalu terbentuk lagi setelah 2.5 detik. Karena selalu balik, jurang tidak pernah jadi buntu permanen — cuma bikin timing-mu mahal |
| Mana + skill E dan ultimate X | Bar mana sekarang selalu tampil. **E = skill** (25 mana, cooldown ~1.7 detik), **X = ultimate** (60 mana, cooldown ~10 detik). Interact pindah ke **F** karena E sudah dipakai skill |
| Skill beda tiap senjata | Sword: Blade Dash / Tempest Blade · Dagger: Shadow Flurry / Assassinate (teleport ke tiap musuh) · Greataxe: Earthshatter / Ragnarok · Spear: Piercing Lunge / Dragon Charge · Bow: Arrow Rain / Storm of Arrows · Staff: Elemental Nova / Elemental Storm (mengikuti elemen senjata) |
| Rarity senjata bikin skill lebih wah | Damage skill dikali `1 + rarity × 0.26`, dan tiap 2 tingkat rarity menambah jumlah proyektil/hit/radius. Skill juga **mewarisi enchant senjata** — Flaming Bow bikin Arrow Rain membakar. Nama skill di HUD diwarnai sesuai rarity |

**Catatan cadence toko:** kamu minta tiap 5 lantai, tapi run-nya cuma 6 lantai — itu berarti cuma 1 kali belanja seumur run. Aku pakai cadence yang sudah ada (safe room tiap 3 lantai = 2 kali belanja). Kalau mau dungeon-nya diperpanjang jadi 10 lantai supaya benar-benar tiap 5, tinggal bilang.

---

### Putaran keempat — membuang kesan jadul

Diagnosis: yang bikin terasa kuno bukan pixel art-nya, tapi lima hal ini.

| Masalah | Solusi |
|---|---|
| **Musuh melukai dengan menyentuh** — mekanik paling kuno di game-nya | Contact damage dibuang sebagai ancaman utama. Semua musuh sekarang punya state machine serangan `wind → strike → recover`. Zombie menanam kaki lalu mengayun (wind 30 frame), slime jongkok lalu menerjang, bat mengunci sasaran dengan garis bidik lalu menukik, skeleton menarik busur dengan garis bidik. Hanya badan slime saat menerjang dan bat saat menukik yang masih melukai saat bersentuhan — dan keduanya sedang bergerak dengan cara yang bisa dibaca. Ada window `recover` di tiap serangan sebagai kesempatan balas |
| **Pencahayaan rata** | `src/systems/lighting.js` — layer gelap per frame yang dilubangi radial di tiap sumber cahaya. Obor, proyektil, skill, item drop, shrine, dan musuh yang sedang wind-up semuanya menerangi ruangan. Kegelapan berbeda per biome |
| **Enam lantai satu tileset** | `src/art/biomes.js` — 6 biome: Stone Halls, Damp Caves, Rusted Prison, Crystal Vault, The Nest, Throne of Slime. Tile geometri sama, di-bake ulang lewat palet berbeda, plus gradasi latar, warna cahaya, dan tingkat kegelapan masing-masing |
| **Feedback datar** | Umpan balik berskala: slime biasa cuma hitstop 2 frame, elite dapat zoom-punch + ring, mini boss dapat kilat merah + hitstop 14, boss dapat kilat putih + hitstop 24. Ditambah kamera zoom-punch, kilat layar, dan banner judul saat masuk lantai |
| **Kamera diam** | `R.punch()` — dorongan zoom singkat yang mengendur balik, dipakai saat kill besar dan naik tier momentum |

**Sistem tambahan (pilihanku):**

| Sistem | Isi |
|---|---|
| **Shrine boon** (ala Hades) | Obelisk yang menawarkan 3 boon, ambil 1. Ada di tiap safe room, plus 45% peluang di lantai biasa. 14 boon: Bloodthirst (+15% damage, -1 heart), Ironhide, Featherweight, Sharpshooter, Overflow, Conduit (skill -35% mana), Golden Touch, Berserker (+35% damage di bawah 3 heart), Momentum, Blood Harvest, Fleetfoot, Ricochet, Vigil, Ruin. Boon yang diambil tampil sebagai inisial berwarna di tepi kanan HUD |
| **Momentum meter** | Kill beruntun tanpa kena hit menumpuk multiplier: SHARP → FEROCIOUS → MERCILESS → UNSTOPPABLE, sampai +30% damage. Meluruh sendiri setelah 5,5 detik tanpa kill, dan **hangus seketika begitu kamu kena hit**. Bikin agresi punya harga dan hati-hati punya harga juga |

Difficulty tidak dinaikkan — permintaanmu, sudah pas.

**Bug yang ketemu saat verifikasi:** array lampu tidak pernah dikosongkan, jadi tiap obor digambar ulang menumpuk ratusan kali per frame dengan blend aditif sampai layar putih total. Ditambah palet biome yang terlalu gelap sebelum layer kegelapan. Keduanya sudah diperbaiki.

---

## 11. Keputusan Yang Sudah Diambil

| Topik | Keputusan | Tanggal |
|---|---|---|
| **Permadeath** | **Roguelike murni.** Mati = restart dari level 1, semua item hilang, tidak ada meta-progression yang terbawa. Yang disimpan di `localStorage` hanya statistik rekor (best depth, total kill, item terbaik yang pernah didapat) — murni untuk pamer, tidak memberi keuntungan gameplay. | 2026-08-18 |
| Elemental staff | 3 elemen: fire / ice / lightning | 2026-08-18 |
| Mana | Bar terpisah dari stamina, khusus staff | 2026-08-18 |
| Nama game | Dungeon Scrolling | 2026-08-18 |

**Konsekuensi desain dari permadeath:**
- Run harus cukup pendek supaya kematian tidak terasa menghukum berlebihan — target 15–25 menit per run penuh
- Loot harus terasa cepat dan sering di awal run, supaya tiap run langsung punya "identitas build"
- Enchant table di safe room jadi momen keputusan penting: habiskan koin sekarang, atau simpan untuk item lebih bagus nanti
- Tidak ada save mid-run. Tutup browser = run hilang
