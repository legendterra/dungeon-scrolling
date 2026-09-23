# Bab 5 - Tempur: Skill, Elemen, dan Reaksi

Tempur punya tiga lapisan: pukulan senjata (Bab 4.1), skill khusus senjata
(`systems/skills.js`), dan sistem elemen (`systems/elements.js`, 952 baris - file
gameplay terbesar kedua setelah renderer).

## 5.1 Skill dan ultimate per senjata

`[CODE]` `src/systems/skills.js:19`

| Konstanta | Nilai |
|---|---|
| `SKILL_COST` | 25 mana |
| `ULT_COST` | 60 mana |
| `SKILL_COOLDOWN` | 100 frame (~1,7 detik) |
| `ULT_COOLDOWN` | 620 frame (~10,3 detik) |
| `power(item)` | `1 + rarity * 0.26` (skill makin kuat per tingkat rarity) |
| `extra(item)` | `floor(rarity / 2)` proyektil/hit tambahan |
| `scaled()` | `item.stats.damage * base * power * Player.damageMult()` |

Dua belas kemampuan:

| Senjata | Skill (E) | Ultimate (X) |
|---|---|---|
| Sword | **STAR BLADE DASH** | **STARFALL TEMPEST** |
| Dagger | **PHANTOM FLURRY** (5 tusukan) | **PHANTOM FLASH** |
| Greataxe | **MEGA SLAM** | **RAGNAROK SPIKES** |
| Spear | **DRAGON PIERCER** | **DRAGON COMET** |
| Bow | **SHOOTING STAR VOLLEY** | **SUPERNOVA ARROW** |
| Staff | **BOUNCY BUBBLE NOVA** | **COSMIC CATACLYSM** |

Mekanisme internal: kemampuan multi-frame memasang sebuah **routine** pada pemain
(`routine(p, frames, fn)`) yang dipanggil tiap frame sampai habis. Ini menjaga
logika timing keluar dari `update()` utama. Hit berulang dilindungi daftar `hits`
supaya sapuan berjalan tidak mengenai musuh yang sama dua kali per tick.

Kemampuan mewarisi bonus damage global pemain dan juga **proc enchant senjatanya**,
jadi senjata api legendaris benar-benar melepas lebih banyak api.

## 5.2 Delapan elemen

`[CODE]` `src/systems/elements.js:20` dan tabel yang sama di `items/weapons.js:75`

| Elemen | Warna | SFX | Efek dasar pada target |
|---|---|---|---|
| Fire | `#e8743b` | `fire` | `burn` 150 frame, tick tiap 22 frame, damage `0.16 x power`; meninggalkan field api |
| Ice | `#4fb3e0` | `ice` | `chill` 140 frame, lambat 45%; **tiga chill berturut menahan beku** (`freeze` 100 frame) |
| Lightning | `#f2c14e` | `lightning` | `shock` 34 frame, memicu `arc()` damage 45% ke 2 musuh sekitar |
| Poison | `#5cbf62` | `cast` | `poison` 240 frame, tick tiap 30 frame, damage `0.12 x power` |
| Water | `#2f6fa8` | `ice` | `wet` 260 frame, lambat 15% |
| Earth | `#b98d5c` | `slam` | `brittle` 300 frame (armor pecah) + memantul ke atas `vy = -2.2` |
| Leaf | `#a3e86b` | `swing` | `root` 90 frame (musuh tidak bisa bergerak) |
| Wind | `#cfe8e0` | `swing` | Tidak memberi status sendiri; **mengaduk** aura yang sudah ada dan melemparnya ke tetangga |

Aura bertahan `AURA_FRAMES = 200` frame di target dan hanya selama itu bisa
direaksikan. Angka ini adalah inti pacing combat elemental: cukup lama untuk
menyusun kombo dua elemen, tidak cukup lama untuk menumpuk semua.

## 5.3 Ground field

`[CODE]` `src/systems/elements.js:670` - saat skill elemen mendarat, lantai di
titik itu menjadi field yang punya perilakunya sendiri:

| Field | Warna | Umur | Radius | Tick | Damage | Menyebar | Catatan |
|---|---|---|---|---|---|---|---|
| fire | `rgba(232,116,59,0.20)` | 300 | 22 | 20 | 0.14 | 0.10 | Menyalakan cahaya (`lights: true`) |
| poison | `rgba(92,191,98,0.20)` | 420 | 30 | 30 | 0.10 | 0.06 | Berbentuk kabut (`mist`) |
| water | `rgba(47,111,168,0.22)` | 480 | 26 | 0 | 0 | 0 | Genangan: membuat basah |
| ice | `rgba(79,179,224,0.18)` | 360 | 26 | 0 | 0 | 0 | Area lambat |
| lightning | `rgba(242,193,78,0.20)` | 170 | 20 | 20 | 0.10 | 0 | Menyalakan cahaya, umur pendek |
| earth | `rgba(185,141,92,0.22)` | 340 | 24 | 40 | 0.08 | 0.05 | Gundukan |
| wind | `rgba(207,232,224,0.14)` | 200 | 26 | 0 | 0 | 0.09 | Mendorong |
| leaf | - | 300 | 22 | 20 | 0.10 | 0.08 | Tumbuh |

Field juga **bereaksi satu sama lain**: api yang jatuh ke genangan air berubah
menjadi uap. Field yang mendarat dibatasi `maxR`, sehingga tidak menyebar tak
terbatas.

> **Pelajaran dari bug yang pernah terjadi.** Field dulu menggambar cakram nyaris
> hitam (`0x17131f`, opasitas 0.5) sebesar radius field-nya, sehingga setiap kali
> skill elemen mendarat muncul **bercak gelap** di lantai yang terlihat seperti
> lubang. Sekarang field menggambar glow berwarna elemennya sendiri.

## 5.4 Dua puluh delapan reaksi

`[CODE]` `src/systems/elements.js:239-620`. Setiap pasangan elemen punya nama dan
efeknya sendiri - tidak ada pasangan yang tidak didefinisikan. Daftar lengkap
namanya:

**ELECTROCUTE, DEEP FREEZE, STEAM, SHATTER, TOXIC BLAST, WILDFIRE, CONDUCT,
PERMAFROST, CONTAGION, OVERGROWTH, SUPERCONDUCT, MAGMA, BLOOM, BLIGHT, BRUSHFIRE,
OVERLOAD, FIRESTORM, WITHER, TOXIC FROST, BLIZZARD, GALE SEED, VENOM ARC,
THUNDERSTORM, MIASMA, PLAGUE WIND, MUDSLIDE, MISTRAL, SANDSTORM.**

Reaksi adalah inti dari sistem ini, bukan bonus kecil: petir ke musuh yang basah
bukan "petir + cipratan", melainkan ELECTROCUTE yang melompat ke **semua** musuh
basah di lantai itu. Ini yang membuat kombinasi senjata-aura-skill terasa seperti
build, bukan sekadar angka lebih besar.

## 5.5 Bagaimana pemain mendapat elemen

`[CODE]` `items/weapons.js:100`

| Jalur | Keterangan |
|---|---|
| Prefix affix | `Flaming`, `Frozen`, `Shocking`, `Toxic`, `Drenching`, `Stony`, `Verdant`, `Gale` |
| Senjata staff | Selalu elemental, memakai mana |
| Rarity | `ELEMENT_SHARE = [0.15, 0.26, 0.38, 0.50, 0.62]` - proporsi damage senjata yang keluar sebagai elemen, per tingkat rarity |

Konsekuensi desainnya disengaja: senjata common adalah senjata fisik dengan
sedikit rasa, senjata legendary adalah mantra yang kebetulan punya gagang.

## 5.6 Efek visual serangan (FX)

`[CODE]` `src/systems/particles.js` (454 baris) + `src/art/fxart.js`

| Efek | Pemicu |
|---|---|
| `DS.FX.element(elemen, x, y, opts)` | Skill/proyektil elemen mendarat, dengan warna spark per elemen (`spark[0..2]`) |
| `DS.FX.dust(x, y, n)` | Mendarat, ledakan, kaki melangkah |
| `DS.FX.trail(x, y, color)` | Jejak proyektil dan dash |
| Gore partikel | Musuh mati; warna diambil dari `cfg.gore` masing-masing monster |
| `DS.R.shake()` | Heavy attack, ultimate, ambience lantai dalam |

Charge attack punya gaya per senjata (`CHARGE_STYLE` di `player.js:650`) dan
diperbarui oleh `chargeFx()`: aura di sekitar senjata yang tumbuh sesuai rasio
charge. Efek khusus heavy sudah ada untuk tiap archetype (ayunan sword, tusukan
spear, tarik bow, cast staff).

Animasi serangan tersinkron dengan `swingTimer`: durasi ayunan senjata menentukan
kapan kotak pukul aktif, sehingga hitbox dan animasi tidak pernah berbeda.

## 5.7 Audio tempur

`[CODE]` `src/core/audio.js` - 30 lebih SFX disintesis, termasuk yang khusus
elemen: `fire`, `ice`, `lightning`, `cast`, `shoot`, `slam`, `swing`, `hit`,
`crit`, `block`, `hurt`, `die`. Empat mood musik (`MOODS`) dipilih per konteks
(`calm` di menu, berubah saat boss, dan seterusnya).
