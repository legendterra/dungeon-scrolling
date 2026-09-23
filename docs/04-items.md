# Bab 4 - Item, Loot, dan Ekonomi

Semua angka tuning item hidup di tiga file saja: `items/weapons.js` (archetype,
rarity, elemen), `items/affixes.js` (prefix/suffix), `items/armor.js` (armor dan
set bonus). Roll loot ada di `items/generator.js`, dan pemakaian/pemindahan ada di
`items/inventory.js`.

## 4.1 Enam archetype senjata

`[CODE]` `src/items/weapons.js:12`. Semua cooldown dan charge dalam frame 60fps.

| Senjata | Damage | Cooldown | Crit | Knockback | Stamina | Combo | Kotak pukul (w x h, oy) | mode tahan | chargeMax | chargeBonus | heavyReach | Blurb |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sword | 8 | 26 | 8% | 2.2 | 6 | 3 | 24 x 16, oy -1 | heavy | 40 | 2.1x | 1.35x | Kombo tiga pukulan seimbang |
| Dagger | 5 | 13 | 26% | 1.1 | 3 | 3 | 18 x 14, oy 0 | heavy | 26 | 2.5x | 1.6x | Cepat, crit tinggi, jangkauan pendek |
| Greataxe | 17 | 46 | 6% | 4.6 | 14 | 1 | 30 x 22, oy -3 | heavy | 48 | 1.9x | 1.3x | Lambat, damage besar, knockback besar |
| Spear | 9 | 30 | 10% | 2.6 | 7 | 2 | 34 x 10, oy +2 | heavy | 36 | 2.0x | 1.45x | Tusukan lurus panjang, jarak aman |
| Bow | 9 | 26 | 14% | 1.4 | 4 | - | proyektil `arrow` | release | 34 | 2.2x | - | Tahan untuk menarik, lepas untuk menembak |
| Staff | 7 | 30 | 8% | 1.8 | 0 | - | proyektil `orb` | release | 40 | 1.9x | - | Memakai mana 9, charge untuk bola lebih besar |

Detail proyektil: **arrow** `speed 4.4`, `gravity 0.045`, `life 150` frame;
**orb** `speed 2.7`, `gravity 0`, `life 120` frame.

## 4.2 Rarity

`[CODE]` `src/items/weapons.js:48`

| Rarity | Warna | Slot affix | Pengali damage | Bobot drop di depth 1 |
|---|---|---|---|---|
| Common | `#d8d5e8` | 0 | 1.00x | 55 |
| Uncommon | `#5cbf62` | 1 | 1.12x | 27 |
| Rare | `#4fb3e0` | 2 | 1.28x | 13 |
| Epic | `#c86ee0` | 3 | 1.50x | 4.5 |
| Legendary | `#e8743b` | 4 | 1.85x | 0.5 |

Bobot ini digeser ke atas seiring kedalaman lewat `rarityBias = (depth-1) * 0.42`
di `systems/difficulty.js`. Semakin dalam, semakin sering yang bagus muncul, tetapi
common tidak pernah hilang sepenuhnya.

## 4.3 Affix (prefix & suffix)

`[CODE]` `src/items/affixes.js` - 8 prefix elemen dan 12 affix statistik.

| Kelompok | Daftar |
|---|---|
| Prefix elemen | Flaming, Frozen, Shocking, Toxic, Drenching, Stony, Verdant, Gale |
| Prefix statistik | Vampiric, Cruel, Swift, Piercing, Heavy, Keen, Reaching |
| Suffix | of the Bear, of the Cat, of Greed, of the Owl, of Thorns, of the Turtle, of the Wind, of Warding |

Jumlah slot affix sebuah item ditentukan rarity-nya (kolom "Slot affix" di 4.2),
jadi item Legendary adalah "mantra yang kebetulan punya gagang".

## 4.4 Armor

`[CODE]` `src/items/armor.js` - tiga slot: `head`, `chest`, `legs`. Delapan
material, dengan set bonus kalau ketiganya satu material:

| Material | Tier | Shield | Berat | Set bonus |
|---|---|---|---|---|
| Cloth | 0 | 2 | 0 | **NIMBLE**: +12% kecepatan gerak |
| Leaf | 1 | 3 | 0 | **GROVE**: +20% kecepatan, +1 lompatan udara |
| Leather | 1 | 5 | 1 | **TANNER**: shield pulih dua kali lebih cepat |
| Bone | 2 | 7 | 1 | **OSSUARY**: +15% damage, -30% shield |
| Iron | 3 | 10 | 3 | **BULWARK**: kebal knockback |
| Gold | 3 | 9 | 2 | **MIDAS**: +40% koin, +1 shard per peti |
| Crystal | 4 | 12 | 2 | **RESONANCE**: +40 mana, skill 25% lebih murah |
| Obsidian | 4 | 14 | 4 | **SHARDSKIN**: memantulkan 50% damage sentuh |

Armor langsung memengaruhi statistik pemain lewat `Inv.applyArmor()`; shield
tampil sebagai bar tipis di HUD, dan potongan armor yang dipakai digambar pada
boneka karakter di tab profil.

## 4.5 Peti dan tier loot

`[CODE]` `src/items/generator.js:205`

| Tier | Label | Rarity min | Rarity maks | Bias | Item | Koin | Terkunci | Ambush |
|---|---|---|---|---|---|---|---|---|
| `wood` | Wooden Chest | 0 | 2 | 0.0 | 1 | 8-18 | tidak | - |
| `iron` | Iron Chest | 1 | 3 | 0.9 | 1 | 18-34 | **ya** (butuh kunci) | - |
| `cursed` | Cursed Chest | 3 | 4 | 2.4 | 1 | 30-55 | tidak | **3 musuh** |
| `vault` | Vault Chest | 2 | 4 | 2.0 | **2** | 45-80 | tidak | - |

Bobot roll acak: wood 62, iron 27, cursed 11. `vault` **tidak pernah** di-roll;
peti itu selalu ditempatkan di dalam vault terkunci (teka-teki atau sayap bonus).

Modifier `STARVED` menambah `chestBonus: 2` ke rarity min dan max, dan gold armor
set menambah 1 shard per peti.

## 4.6 Boon (buff antar-lantai)

`[CODE]` `src/systems/boons.js` - **26 boon**, diberikan dari shrine atau hadiah
lantai. Contoh yang membentuk build:

| Boon | Efek |
|---|---|
| `BLOODTHIRST` | +15% damage, -1 max heart |
| `IRONHIDE` | +2 max heart, -10% kecepatan |
| `FEATHERWEIGHT` | +20% kecepatan, +20 stamina |
| `SHARPSHOOTER` | +12% crit chance |
| `OVERFLOW` | +50 max mana, regen lebih cepat |
| `CONDUIT` | Skill 35% lebih murah |
| `GOLDEN TOUCH` | +30% koin, +1 shard per peti |
| `BERSERKER` | +35% damage saat di bawah 3 hati |
| `MOMENTUM` | Momentum terisi dua kali lebih cepat |
| `BLOOD HARVEST` | Tiap 10 kill memulihkan 1 hati |
| `FLEETFOOT` | +1 mini dash charge |
| `RICOCHET` | Proyektil menembus satu musuh lagi |
| `VIGIL` | +20 frame kebal setelah kena |
| `RUIN` | Heavy attack +50% |
| `WHETSTONE` | +10% damage, -15 stamina |
| `STONEHEART` | +1 max heart, -8% damage |
| `IRONBLOOD` | +2 max heart, -12% damage |
| `DUELIST` | +18% damage saat hati penuh |
| `SIPHON` | Kill memulihkan 8 stamina, 6 mana |
| `THORNMAIL` | Penyerang kena 2 damage, -6% kecepatan |

Semuanya punya trade-off: setiap boon menaikkan satu hal dan menurunkan hal lain,
sehingga tidak ada pilihan yang jelas "terbaik".

## 4.7 Bag: slot dan tindakan

`[CODE]` `src/ui/ui.js` (`drawBag`, `updateBag`, `bagTargets`)

Tiga jenis tujuan pemindahan item:

| `ref.kind` | Arti |
|---|---|
| `weapon` (index 0/1) | Dua slot senjata yang bisa di-Q untuk bertukar |
| `armor` (slot head/chest/legs) | Tiga slot armor |
| `bag` (index) | Tas; hanya menerima item apa pun |

Aturan yang ditegakkan `Inv`:

1. Slot senjata hanya menerima senjata (bukan armor); slot armor hanya menerima
   armor dengan `slot` yang cocok. Kalau salah → pesan `NOT A WEAPON` /
   `WRONG SLOT`.
2. Memindahkan dari luar bag ke bag saat bag penuh → `BAG FULL`.
3. Item yang jatuh (tombol `F` di bag) menjadi pickup di dunia, bukan hilang.
4. Enter pada item di bag = pakai/equip; hasil equip ditukar dengan isi tangan.

Boneka karakter di bag digambar dengan `drawDoll()` memakai art paperdoll 2D pada
jendela berukuran tetap. Posisi jendela itu sekarang identik dengan sebelum pass
UI terakhir (sprite 24x68 di dalam jendela 48x86), jadi tidak ada tata letak yang
bergeser.

![Bag: dua slot senjata, tiga slot armor, dan jendela boneka](docs/img/bag.png)

## 4.8 Toko (safe room) dan harga

`[CODE]` `src/items/inventory.js:405` - harga naik mengikuti kedalaman
(`depth` = kedalaman lantai saat toko itu muncul):

| Barang | Efek | Harga (koin) |
|---|---|---|
| BREAD | Pulihkan 2 hati | `20 + depth*5` |
| QUIVER | +15 anak panah | `16 + depth*3` |
| SHARD POUCH | +4 shard | `50 + depth*12` |
| HEART VESSEL | +1 max heart | `80 + depth*20` |
| SWIFT BOOTS | +1 dash charge | `95 + depth*22` |
| GREEN FLASK | +30 max stamina | `45 + depth*10` |

Semua pembelian bersifat **per-run**: mati berarti semuanya hilang, sesuai
prinsip roguelike murni di `core/storage.js` (tidak ada meta-progression).

## 4.9 Enchant (upgrade senjata)

`[CODE]` `src/ui/ui.js` (`openEnchant`, `updateEnchant`, `applyEnchant`,
`priceTag`). Biaya dibayar dengan **shard**, bukan koin. Layar ini menampilkan
senjata aktif, slot affix yang tersedia, dan harga tiap rite. `actionCost()`
menghitung biaya sesungguhnya termasuk diskon boon.

## 4.10 Shrine (kartu pilihan)

`[CODE]` `src/ui/ui.js:474`

- Tiga kartu ditawarkan (`rollOffers`), pemain mengambil **satu**.
- Isi kartu bisa berupa boon (satu dari 26) atau hadiah item (`kind: 'gift'`).
- Kartu yang ditolak bisa di-roll ulang dengan koin:
  `rerollCost() = REROLL_BASE + REROLL_STEP * rerolls`.
- Setelah dipakai, shrine menjadi `spent` dan menampilkan `THE SHRINE IS SPENT`.

## 4.11 Kunci: fitur yang sudah ada di data, belum ada di layar

`[CODE]` `inv.keys` sudah terdefinisi, sudah dihitung di HUD (baris ketiga plate
mata uang muncul **hanya** kalau `keys > 0`), dan `iron` chest sudah bertanda
`locked: true`. Ini berarti rantai "kunci → peti besi" sudah setengah jadi; yang
belum ada adalah (a) sumber kunci di dunia, dan (b) indikator kunci di daftar tab
profil. Ini masuk register isu sebagai `BUG-014` (Bab 9).

> **Catatan desain.** Ekonomi punya dua mata uang dengan peran berbeda: **koin**
> membeli kenyamanan jangka pendek (toko, reroll shrine) dan **shard** membeli
> kekuatan jangka panjang pada senjata (enchant). Karena keduanya per-run, tidak
> ada inflasi antar-run.
