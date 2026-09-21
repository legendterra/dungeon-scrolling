# Dungeon Scrolling — Rencana Fase 2

> Armor, profil karakter, monster baru, dan pengetatan atmosfer.
> Dokumen ini melanjutkan [PLAN.md](PLAN.md); yang di sana sudah selesai semua.

---

## 0. Bug yang kamu temukan — terkonfirmasi

Kamu benar, safe room bisa muncul dua kali berturut-turut. Penyebabnya ada di
`advance()` pada [src/scenes/game.js:246](src/scenes/game.js:246):

```js
if (g.pendingSafe) { g.pendingSafe = false; loadLevel(g, 'safe'); return; }
...
if (g.levelKind !== 'safe' && g.depth % C.SAFE_ROOM_EVERY === 0) {
  g.pendingSafe = true;          // <-- diset...
  loadLevel(g, 'safe');          // <-- lalu langsung masuk safe room
}
```

Jadi begitu kedalaman menyentuh kelipatan 3, safe room dimuat **dan** flag
`pendingSafe` diset. Saat kamu keluar dari safe room itu, cabang pertama
langsung memuat safe room **lagi**. Dua ruangan berturut-turut.

**Perbaikan:** buang `pendingSafe` sepenuhnya. Urutan lantai dihitung dari satu
tabel eksplisit, bukan dari flag yang saling mengejar:

```
depth 1 → 2 → 3 → 4 → [SAFE] → 5 → 6 → 7 → 8 → 9 → [SAFE] → 10 (BOSS)
```

Safe room duduk **sebelum** lantai 5 dan sebelum lantai 10, tidak menghitung
sebagai depth, dan tidak bisa dimasuki dua kali karena posisinya ditentukan oleh
tabel, bukan oleh state.

---

## 1. Struktur Run Baru

| Aspek | Sekarang | Jadi |
|---|---|---|
| Jumlah lantai | 6 | **10** |
| Safe room | tiap 3 depth (buggy) | **sebelum lantai 5 dan 10** |
| Biome | 6 | 10 (4 biome baru menyusul, atau 6 biome dipakai ulang dengan modifier) |
| Perkiraan durasi run | 15–25 menit | 30–40 menit |

**Catatan:** ini menggandakan panjang run, padahal keputusan permadeath di
PLAN.md menargetkan 15–25 menit. Aku ikut permintaanmu (tiap 5 lantai), tapi
kalau ternyata kepanjangan saat dimainkan, tinggal turunkan `FINAL_DEPTH` ke 10
→ 8 dengan safe room di 4 dan 8.

**Safe room bukan save.** Permadeath tetap mutlak — ruangan ini cuma tempat
napas, belanja, enchant, dan shrine. Tutup browser = run hilang.

---

## 2. Atmosfer & Obor

### 2.1 Obor — model baru

Yang sekarang: sprite 8x12 menempel tinggi di dinding (baris tile 5), dan
posisinya digeser 1 piksel tiap beberapa frame — itu yang bikin **goyang terus**.

Yang baru:

- **Turun ke bawah**, sejajar seperti di main menu: dipasang di ketinggian dada,
  2 tile di atas lantai, bukan di dekat langit-langit
- **Model ganti jadi obor bertiang**: tiang besi vertikal 3 px menempel ke
  dinding, braket menyamping, lalu mangkuk api di ujungnya. Ada juga varian
  **brazier berdiri** di lantai untuk ruangan besar
- **Berhenti goyang.** Badan obor benar-benar diam. Yang beranimasi cuma
  **nyala apinya**, 3 frame yang berputar pelan (ganti tiap 8 frame), plus
  radius cahayanya yang berkedip halus. Tidak ada lagi offset posisi

### 2.2 Ambiance jadi gelap beneran

| Parameter | Sekarang | Jadi |
|---|---|---|
| Kegelapan dasar | 0.22–0.34 | **0.55–0.80** (makin dalam makin pekat) |
| Radius cahaya pemain | 56–64 px | **40–48 px** |
| Falloff | landai | tajam — ada inti terang, lalu jatuh cepat ke gelap |

Tambahan efek di dekat sumber cahaya supaya terasa intens:

- **Inti panas** — lingkaran kecil overexposed di tengah nyala api
- **Kedip halus** pada radius (bukan pada sprite), pakai dua gelombang sinus
  beda frekuensi supaya tidak terasa berpola
- **Bayangan miring** — entitas yang berdiri dekat obor dapat bayangan gelap
  memanjang menjauhi sumber cahaya
- **Debu melayang** di dalam kerucut cahaya, warna mengikuti biome
- **Mata musuh menyala** di kegelapan sebelum badannya kelihatan — kamu tahu ada
  sesuatu di sana sebelum tahu itu apa

Konsekuensi gameplay: kamu jadi bergerak dari pulau cahaya ke pulau cahaya, dan
lantai dengan modifier `DARKNESS` (lihat §4) benar-benar menakutkan.

### 2.3 NPC & pernak-pernik turun ke tanah

Masalah sekarang: merchant, enchant table, dan shrine dipasang di koordinat
marker template, bukan di permukaan lantai — makanya kelihatan mengambang.

Perbaikan: satu helper `snapToFloor(map, x, height)` yang memakai
`map.floorBelow()` untuk menaruh **setiap** decor dan NPC persis di atas lantai.
Dipakai untuk merchant, enchant table, shrine, obor brazier, dan peti.

---

## 3. Monster Baru

Yang ada sekarang: slime, zombie, bat, skeleton. Tambahan (semua pakai state
machine `wind → strike → recover` yang sama):

| Monster | Muncul | Perilaku | Telegraph |
|---|---|---|---|
| **Spitter** | depth 2+ | Berakar di tanah, memuntahkan asam melengkung. Tidak bisa dikejar, harus didekati atau ditembak | Mulut membuka, lengkungan lintasan digambar samar |
| **Spider** | depth 3+ | Menggantung di langit-langit, turun di benang saat kamu lewat, cepat di tanah | Benang memanjang + badan bergetar sebelum jatuh |
| **Bomber** | depth 3+ | Berlari lurus ke arahmu lalu menggembung dan meledak | Badan membengkak, kedip makin cepat, bunyi naik |
| **Shielder** | depth 4+ | Perisai depan memantulkan serangan ringan. Harus dipukul dari belakang, atau dengan serangan berat / skill | Perisai berkilau saat memantulkan |
| **Wraith** | depth 5+ | Menembus tembok, lambat, tidak bisa dihentikan terrain. Menguras mana saat menyentuh | Badan memudar-muncul saat mau menerjang |
| **Necromancer** | depth 6+ | Memanggil 2 skeleton, lalu teleport menjauh | Lingkaran sihir di tanah sebelum summon |
| **Golem** | depth 7+ | HP sangat tebal, lambat, ground pound bergelombang | Angkat tangan tinggi, retakan muncul di tanah |

Spawn table digeser per depth supaya lantai dalam tidak lagi berisi slime.

---

## 4. Kesulitan Naik per Depth

Dua lapis.

### 4.1 Skala datar (yang sudah ada, dipertajam)

| | Sekarang | Jadi |
|---|---|---|
| HP musuh | +38% per depth | **+45% per depth** |
| Damage musuh | +1 di elite saja | +1 flat tiap 3 depth |
| Jumlah spawn | tetap | +1 tiap 2 depth |
| Kegelapan | tetap per biome | naik bertahap sampai 0.80 |

### 4.2 Floor Modifier — inti dari "makin dalam makin susah"

Mulai depth 4, tiap lantai bisa mendapat **satu** modifier acak, diumumkan di
banner saat masuk. Peluangnya: 0% di depth 1–3, 35% di 4–6, 60% di 7–9, dan
**100% di depth 10**.

| Modifier | Efek |
|---|---|
| **DARKNESS** | Tidak ada obor sama sekali. Cuma cahayamu sendiri |
| **THICK BLOOD** | HP semua musuh +80% |
| **FRENZY** | Musuh +25% kecepatan, wind-up -20% (waktu reaksimu memendek) |
| **HORDE** | Jumlah spawn +50% |
| **HONOR GUARD** | Semua musuh naik jadi elite |
| **BRITTLE** | Setiap serangan yang kena kamu +1 damage |
| **FAMINE** | Tidak ada drop darah sama sekali |
| **STARVED** | Tidak ada drop koin, tapi isi peti naik dua tingkat rarity |

Aturan: modifier tidak pernah ditumpuk, dan `DARKNESS` tidak pernah muncul
bersama lantai yang punya pit of doom (parkour dalam gelap total = tidak adil).

---

## 5. Bonus Round

Dua bentuk, keduanya sengaja kecil supaya ekonomi tidak rusak.

**Coin Vault** — sekitar 30% lantai punya ruang rahasia **di atas** area utama,
dijangkau lewat rantai platform naik. Isinya 15–30 koin dan kadang 1 shard. Tidak
ada musuh, tidak ada item. Murni hadiah buat yang mau memanjat.

**Golden Slime** — 8% peluang per lantai. Slime emas muncul, langsung kabur
melompat menjauh, dan menghilang setelah 10 detik. Kalau berhasil dibunuh: 25–40
koin. Cepat, licin, dan sengaja sulit dipojokkan.

Total tambahan pemasukan per run diperkirakan +60–120 koin, sekitar setengah
harga satu barang mewah pedagang. Cukup terasa, tidak merusak.

---

## 6. Sistem Armor ⭐ (fitur terbesar)

### 6.1 Slot & material

Tiga slot, bebas dicampur:

| Slot | Contoh |
|---|---|
| **HEAD** | topi daun, helm besi, mahkota emas, tudung obsidian |
| **CHEST** | tunik kain, rompi kulit, zirah besi, jubah kristal |
| **LEGS** | celana kain, celana kulit, pelindung besi, legging obsidian |

Tujuh material, dari lemah ke kuat:

| Material | Warna | Shield | Berat | Sifat |
|---|---|---|---|---|
| Cloth | abu terang | 2 | 0 | Awal permainan |
| Leaf | hijau | 3 | 0 | Ringan, cepat |
| Leather | coklat | 5 | 1 | Seimbang |
| Bone | tulang | 7 | 1 | Murah, rapuh |
| Iron | abu biru | 10 | 3 | Tanky |
| Gold | emas | 9 | 2 | Bonus koin |
| Obsidian | ungu gelap | 14 | 4 | Paling kuat, paling berat |
| Crystal | biru muda | 12 | 2 | Bonus mana |

Kamu benar-benar bisa pakai **baju gold + helm obsidian + celana daun**, dan
ketiganya akan kelihatan di karakter.

### 6.2 Shield — cara armor melindungi

Damage reduction flat tidak cocok di game ini (HP cuma 6 heart, 1 damage per
hit — reduksi flat langsung bikin kebal). Jadi armor memberi **bar Shield**
terpisah:

- Shield adalah lapisan biru-abu di atas bar hati
- Semua damage masuk ke Shield dulu, baru ke hati
- Shield **regen otomatis** 6 detik setelah terakhir kena pukul, dengan
  kecepatan 1 poin per 20 frame
- Momentum meter tidak hangus kalau yang kena cuma Shield — jadi armor bagus
  juga melindungi streak-mu

Ini bikin armor terasa seperti stamina bertahan, bukan tombol kebal.

### 6.3 Berat & set bonus

Total berat mengurangi kecepatan gerak (-2% per poin) dan jarak dash. Zirah
obsidian penuh = -24% kecepatan. Ada harganya.

Set bonus kalau ketiga slot pakai material sama:

| Set | Bonus |
|---|---|
| Leaf | +20% kecepatan, +1 lompatan udara |
| Leather | Regen shield 2x lebih cepat |
| Bone | +15% damage, shield -30% |
| Iron | Kebal knockback |
| Gold | +40% koin, +1 shard per peti |
| Crystal | Skill -25% mana, +40 max mana |
| Obsidian | Damage kontak dipantulkan 50% |

### 6.4 Drop & rarity

Armor ikut sistem rarity dan affix yang sama seperti senjata, tapi memakai
kolam suffix bertahan sendiri (`of the Turtle` +shield, `of the Wind` -berat,
`of Warding` +regen, dst). Peti dan musuh bisa drop armor maupun senjata;
enchant table bisa reroll dan upgrade armor persis seperti senjata.

### 6.5 Tampilan karakter

Ini bagian teknisnya. Hero saat ini satu sprite 10x14 utuh. Akan dipecah jadi:

```
base hero (badan + kulit)
  + overlay HEAD   (baris 0-5)
  + overlay CHEST  (baris 6-10)
  + overlay LEGS   (baris 10-13)
  = sprite jadi, dibakar sekali dan di-cache
```

Supaya tidak perlu menggambar 7 material × 3 slot × 8 frame animasi satu per
satu, tiap slot punya **3 siluet** (ringan / sedang / berat) yang diwarnai
ulang lewat palet material. Jadi 9 bentuk × 8 palet = 72 tampilan, dari 9 sprite
yang benar-benar digambar tangan.

Komposit dibakar ulang **hanya saat equipment berubah**, bukan tiap frame, lalu
disimpan di cache — jadi tidak ada biaya runtime.

Sprite yang sama dipakai di dunia game **dan** di layar profil (di sana diperbesar 4x).

---

## 7. Layar Profil (= Pause)

`ESC` sekarang membuka **Profil**, bukan menu pause polos. Ada juga tombol
potret kecil di HUD kiri atas yang bisa diklik, dan tombol `C` untuk pintas.

Tiga tab, ganti dengan `Q` / `E` atau panah kiri-kanan:

### Tab CHARACTER
- Paper doll karakter diperbesar 4x di tengah kiri, memakai armor yang sedang dipakai
- Enam slot di sekelilingnya: HEAD, CHEST, LEGS, WEAPON A, WEAPON B
- Indikator set bonus, menyala kalau lengkap
- Tas 8 slot di bawah

### Tab STATS
Bukan cuma angka jadi, tapi **dari mana angkanya datang**:

```
DAMAGE          31   ( 18 base  +5 rarity  +4 boon  +4 momentum )
CRIT            34%  ( 8% base  +14% affix  +12% boon )
MAX HEARTS       7   ( 6 base   +2 armor   -1 boon )
SHIELD          24   ( 10 iron chest  +14 obsidian helm )
MOVE SPEED     1.19  ( 1.45 base  +20% boon  -24% weight )
ARMOR WEIGHT     9   ( iron 3  gold 2  obsidian 4 )
MANA           150   ( 100 base  +50 boon )
SKILL COST      16   ( 25 base  -35% conduit )
```

### Tab RUN
- Boon yang sudah diambil, lengkap dengan deskripsi
- Statistik run: kill, depth, koin, waktu, momentum tertinggi
- Modifier lantai yang sedang aktif
- Menu pause lama (RESUME / MUTE / ABANDON RUN) pindah ke bawah tab ini

---

## 8. File yang Disentuh

**Baru:**
```
src/items/armor.js        definisi slot, material, set bonus, generator
src/art/armorSprites.js   9 siluet overlay + palet material
src/art/paperdoll.js      komposit hero + armor, dengan cache
src/systems/modifiers.js  floor modifier
src/entities/enemies2.js  7 monster baru
src/ui/profile.js         layar profil 3 tab
src/world/bonus.js        coin vault + golden slime
```

**Diubah:**
```
src/scenes/game.js        urutan lantai (bug fix), modifier, bonus round
src/world/generator.js    safe room dari tabel, coin vault, brazier
src/art/biomes.js         kegelapan naik, 4 biome tambahan
src/systems/lighting.js   falloff tajam, inti panas, bayangan, debu
src/art/sprites.js        obor model baru + 3 frame api, hero dipecah
src/world/tilemap.js      snapToFloor untuk semua decor
src/items/inventory.js    slot armor, shield, berat
src/entities/player.js    shield + regen, penalti berat
src/ui/ui.js              bar shield, tombol potret, banner modifier
src/core/input.js         tombol profil
```

---

## 9. Urutan Kerja

Tiap fase menghasilkan sesuatu yang bisa langsung kamu coba.

| # | Isi | Kenapa duluan |
|---|---|---|
| 1 | **Bug fix safe room** + struktur 10 lantai | Bug nyata, dan semua sisanya bergantung pada struktur lantai |
| 2 | **Obor model baru + NPC turun ke tanah + ambiance gelap** | Perubahan paling terasa, paling murah |
| 3 | **Floor modifier** | Kesulitan naik langsung terasa tanpa perlu monster baru |
| 4 | **Monster baru** (7 jenis) | Paling banyak pekerjaan AI |
| 5 | **Sistem armor** — data, drop, shield, berat | Fondasi sebelum visualnya |
| 6 | **Paper doll** — armor kelihatan di karakter | Bagian visual armor |
| 7 | **Layar profil 3 tab** | Butuh armor & stat sudah jadi |
| 8 | **Bonus round** | Paling ringan, ditaruh terakhir |

---

## 9b. Tambahan Putaran Ini

### Bug tambahan yang kamu temukan

**Jurang tidak mematikan.** `map.get(tx, ty)` mengembalikan `WALL` untuk setiap
`ty >= map.h`, jadi dasar peta adalah tembok padat. Pemain yang jatuh ke jurang
mendarat di lantai tak terlihat di y=192 dan tidak pernah mencapai ambang
kematian di y=232. Perbaikan: baris paling bawah tiap kolom jurang diisi
**duri maut** (`TILE.DEATHSPIKE`), digambar merah dan langsung mematikan —
untuk pemain maupun musuh yang terjatuh.

**Chest bertabrakan dengan tuas.** Peti bawaan template kadang di-generate di
petak yang sama dengan brankas puzzle. Perbaikan: saat brankas dibangun, semua
peti di dalam radius ruangan itu dihapus dulu, dan tuas digeser menjauh dari
sisa peti terdekat.

**Kunci iron chest harus benar-benar ada.** Sudah ada keybearer, tapi ada dua
celah: keybearer bisa muncul di atas jurang, dan kalau ia mati terjatuh maka
kuncinya ikut hilang ke dalam void. Perbaikan: titik spawn keybearer wajib di
atas lantai padat, dan drop kunci selalu dipindahkan ke tanah padat terdekat.

### Puzzle penghalang jalan

Sampai sekarang puzzle cuma menjaga harta. Sekarang ada juga yang **menghalangi
jalan maju**, dengan syarat setiap solusinya tidak bisa hilang permanen:

| Puzzle | Cara buka | Pengaman |
|---|---|---|
| **Gerbang Kunci** | Bunuh monster pembawa kunci di ruangan yang sama | Monsternya tidak bisa jatuh ke jurang |
| **Dua Plat** | Taruh peti di plat A, berdiri di plat B | Peti yang jatuh ke jurang muncul lagi di tempat asalnya setelah 3 detik |
| **Urutan Tuas** | Tarik 3 tuas sesuai simbol di dinding | Salah urutan cuma mereset, tidak mengunci |
| **Api Padam** | Nyalakan 3 brazier — pukul dengan senjata apa pun | Tidak butuh elemen tertentu |

### Horor bertingkat

Makin dalam makin mencekam, dikendalikan satu nilai `horror = (depth-3)/7`:

| Kedalaman | Yang berubah |
|---|---|
| 1–3 | Bersih, terang, seperti sekarang |
| 4–6 | Vignette mulai muncul, kegelapan naik, tetes air dan gema langkah |
| 7–8 | Bercak darah di dinding, bisikan sesekali, musik jadi disonan, mata musuh menyala duluan sebelum badannya terlihat |
| 9–10 | Butiran gelap di layar, denyut jantung saat HP rendah, bayangan lewat di latar belakang, kamera bergetar halus terus-menerus |

---

## 10. Yang Perlu Kamu Putuskan

1. **Panjang run.** 10 lantai = 30–40 menit per run dengan permadeath. Itu lama
   untuk kehilangan segalanya. Mau tetap 10, atau 8 lantai dengan safe room di
   4 dan 8?
2. **Armor drop menggantikan atau menambah?** Kalau musuh bisa drop armor
   *dan* senjata dengan rate sekarang, tasmu akan penuh terus. Usulku: rate drop
   total tetap sama, isinya dibagi 55% senjata / 45% armor.
3. **Tombol profil.** `ESC` untuk profil dan pause sekaligus sudah oke, atau mau
   `ESC` tetap pause polos dan profil di tombol terpisah?

---

## 11. Status Implementasi

### Sudah jadi dan terverifikasi

| Item | Bukti |
|---|---|
| Bug safe room ganda | Urutan lantai sekarang `1 2 3 4 [SAFE] 5 6 7 8 9 [SAFE] 10=BOSS`, tanpa duplikat |
| Run 10 lantai | `FINAL_DEPTH=10`, `SAFE_BEFORE=[5,10]` |
| Jurang mematikan | 7 dari 7 level berjurang tersegel duri maut di baris dasar |
| Obor tidak goyang | Badan diam total, hanya nyala api yang beranimasi 3 frame |
| Obor berdiri di tanah | Jadi brazier bertiang setinggi 24px, dasarnya menempel lantai |
| Pintu berpijak di tanah | Tinggi 2 petak, `doorY + 32 === floorY` |
| Pintu bervariasi | 3 siluet — arch, cave, gate — dibagi per biome |
| NPC & properti menempel lantai | Merchant y=146 dan shrine y=144 dengan lantai di y=160 |
| Keybearer aman | Wajib spawn di atas lantai padat; drop kunci digeser ke tanah terdekat |
| Chest bentrok tuas | Peti di area brankas dihapus dulu, tuas digeser sampai bebas |
| Sistem elemen 7 macam | fire, ice, lightning, poison, water, earth, leaf |
| Reaksi elemen | 14 reaksi; terverifikasi ELECTROCUTE (water+lightning) dan SHATTER (fire+ice) |
| Ground field | fire, poison, water, ice, leaf, steam — menyebar, saling bereaksi, merusak yang berdiri di dalamnya |
| Status melumpuhkan | frozen / rooted / shocked benar-benar menghentikan musuh |

### Putaran ini

| Item | Bukti |
|---|---|
| 7 monster baru | `types=slime,zombie,bat,skeleton,spitter,spider,bomber,shielder,wraith,necromancer,golem` — semuanya muncul lintas depth 1-10 dan jalan tanpa error |
| Musuh nyangkut di tembok | `walkToward()` dengan penjaga anti-macet: 30 frame mentok -> melompat, 70 frame -> putar balik. Sebelumnya pengejar tidak pernah boleh berbalik jadi terus mendorong tembok |
| Model senjata baru | 6 archetype digambar ulang jadi siluet berbeda, bukan tongkat beda warna |
| Rarity mengubah model | 5 skin logam per senjata; `iconFor(type, rarity)` dipakai HUD, tas, toko, drop di tanah, dan senjata di tangan |
| NEW RECORD | Pindah ke badge berbingkai di bawah judul, tidak lagi menabrak nama senjata |
| Shielder memantulkan | Serangan ringan dari depan jadi BLOCK; serangan berat, skill, dan pukulan dari belakang tetap tembus |

### Putaran ini (armor)

| Item | Bukti |
|---|---|
| Armor 3 slot, 8 material | Campuran bebas terverifikasi: `Obsidian Helm of Mending / Gold Chestplate of Focus / Leaf Greaves of the Ox` -> shield 67, berat 6, kecepatan 1.28 |
| Set bonus | Obsidian penuh -> `shardskin` aktif, thorns 0.75, shield 117, kecepatan turun ke 1.16 |
| Shield menyerap duluan | Satu pukulan: shield 117 -> 111, hati tetap 6/6 |
| Paper doll | Sprite hero dibangun ulang 10x17 dengan lift 3 untuk jambul helm; helm ungu, badan emas, celana hijau tampil di karakter |
| Drop armor | 188 armor / 212 senjata dari 400 drop, sesuai target 45/55 |
| Layar profil | 3 tab (CHARACTER / STATS / RUN), ESC membuka dan menggantikan pause lama |

### Belum dikerjakan — antrian berikutnya

1. Floor modifier (DARKNESS, THICK BLOOD, FRENZY, dst)
3. Sistem armor + paper doll
4. Layar profil 3 tab
5. Bonus round (Coin Vault, Golden Slime)
6. Puzzle penghalang jalan
7. Horor bertingkat per kedalaman
