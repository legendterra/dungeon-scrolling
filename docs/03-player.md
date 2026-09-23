# Bab 3 - Pemain, Gerak, dan Kontrol

Semua yang ada di bab ini dimiliki oleh `src/entities/player.js` (1.075 baris)
untuk perilaku, `src/items/inventory.js` untuk statistik, dan `src/systems/physics.js`
untuk tabrakan.

## 3.1 Statistik dasar

`[CODE]` `src/items/inventory.js:20`

| Stat | Nilai awal | Catatan |
|---|---|---|
| `maxHp` | 6 | Ditampilkan sebagai bar, bukan deretan hati |
| `hp` | 6 | Angka di atas bar |
| `maxStamina` | 100 | Serangan & dash memakainya |
| `staminaRegen` | 0.55 /frame | ~33 per detik |
| `maxMana` | 100 | Hanya skill (E/X) dan staff yang memakainya |
| `manaRegen` | 0.28 /frame | ~17 per detik |
| `moveSpeed` | 1.45 px/frame | ~87 px/detik |
| `dashCharges` | 1 | Dash besar, bukan mini-dash |
| `iframes` | 34 frame | ~0.57 detik kebal setelah kena |
| `jumpVel` | 5.3 | Kecepatan lompat |
| `coinBonus`, `thorns` | 0 | Diisi boon/armor |
| `arrows` | 20 | Amunisi bow; tidak dipakai staff |

## 3.2 Konstanta gerak

`[CODE]` `src/entities/player.js:20`

| Konstanta | Nilai | Artinya |
|---|---|---|
| `COYOTE` | 6 frame | Masih boleh lompat setelah keluar dari tepi |
| `JUMP_BUFFER` | 6 frame | Tekanan lompat tetap antre sesaat sebelum mendarat |
| `DASH_FRAMES` | 12 | Lama dash |
| `DASH_SPEED` | 4.2 | Kecepatan dash (2,9x lari) |
| `DASH_IFRAMES` | 10 | Dash punya kebal sendiri |
| `DASH_COOLDOWN` | 34 | ~0.57 detik |
| `AIR_JUMPS` | 1 | Lompat ganda = 1 lompatan tambahan di udara |
| `MINI_CHARGES` | 2 | Mini-dash (klik kanan) |
| `MINI_RECHARGE` | 120 | 2 detik per charge |
| `MINI_FRAMES` | 7 | Lama mini-dash |
| `MINI_SPEED` | 3.1 | Kecepatan mini-dash |
| `MINI_IFRAMES` | 5 | Kebal singkat |
| `MINI_STAMINA` | 8 | Biaya stamina |
| `ROPE_CLIMB` | 1.35 | Kecepatan naik tali |
| `BODY_OVERLAP` | 5 | Toleransi tabrakan badan |
| `AIM_MAX_PITCH` | 1.0 rad (~57 derajat) | Batas atas/bawah arah bidik |

Fisika dunia `[CODE]` `src/core/rng.js:11`: `GRAVITY = 0.34` px/frame² dan
`MAX_FALL = 6.4` px/frame. Nilai gravitasi inilah yang dipakai ulang oleh
`systems/reach.js` saat memutuskan apakah sebuah tanjakan bisa dijangkau - satu
angka, dua pemakai, sehingga level yang lolos pemeriksaan pasti bisa diselesaikan.

## 3.3 Shield (barier dari armor)

`[CODE]` `player.js:40`

| Konstanta | Nilai | Artinya |
|---|---|---|
| `SHIELD_PER_HEART` | 6 | 1 poin shield = 1/6 hati |
| `SHIELD_DELAY` | 360 frame (6 detik) | Tenang dulu sebelum shield kembali |
| `SHIELD_RATE` | 1/20 | Satu poin per 20 frame setelah delay |

Shield berasal dari armor yang dipakai (Bab 4.4) dan digambar sebagai bar tipis
3 px tepat di bawah bar HP.

## 3.4 Empat belas aksi dan peta tombolnya

`[CODE]` `src/core/input.js:12` - game tidak pernah melihat kode tombol; ia hanya
bertanya "apakah aksi `jump` ditekan?".

| Aksi | Keyboard | Mouse | Gamepad |
|---|---|---|---|
| `left` / `right` | A / D, panah kiri-kanan | - | PAD14/PAD15, stik kiri |
| `up` / `down` | W / S, panah atas-bawah | - | PAD12/PAD13 |
| `jump` | Space, W, panah atas | - | PAD0 |
| `attack` | J | Klik kiri | PAD2 |
| `dash` | Shift kiri/kanan | - | PAD5/PAD7 |
| `minidash` | C | Klik kanan | PAD10 |
| `interact` | F | - | PAD1 |
| `skill` | E | - | PAD3 |
| `ult` | X | - | PAD11 |
| `swap` | Q | - | PAD4/PAD6 |
| `bag` | Tab, **B** | - | - |
| `reroll` | R | - | PAD8 |
| `pause` | Escape, **P** | - | PAD9 |
| `confirm` | Enter, NumpadEnter | - | PAD0 |
| `back` | Escape, P, Backspace | - | PAD1 |
| `debug` | F1 | - | - |

Dua keputusan desain yang tercatat di kode:

1. **`B` dan `P` adalah tombol cadangan** untuk bag dan menu. `Tab` dan `Escape`
   adalah dua tombol yang diinginkan halaman inang (urutan fokus, tutup panel);
   karena game ini bisa berjalan di dalam panel preview atau shell, kedua aksi itu
   juga tersedia di tombol yang tidak diperebutkan siapa pun.
2. **Enter yang mengonfirmasi, bukan Space.** Sebelumnya Space juga memilih entri
   menu, sehingga tombol lompat mengonfirmasi dialog - membingungkan begitu layar
   menampilkan hint.

Handler keyboard dipasang di fase **capture** dan 10 tombol masuk daftar
`SWALLOW` (`Space`, `Tab`, `Escape`, panah, `Backspace`, `F1`, `Slash`, `Quote`);
untuk tombol itu game memanggil `preventDefault()` + `stopImmediatePropagation()`
supaya halaman inang tidak ikut bereaksi. Kombinasi dengan Ctrl/Cmd/Alt
**dilewatkan** seluruhnya, sehingga `Ctrl+Tab`, `Cmd+R`, dan `Alt+F4` tetap milik
browser.

> **Risiko yang perlu diketahui.** Karena handler ini menelan 10 kode tombol di
> fase capture, aplikasi/host tempat game dibenamkan tidak akan menerima tombol
> tersebut selama game berjalan. Ini konsekuensi yang disengaja, bukan bug.

## 3.5 Serangan: tap, tahan, dan heavy

`[CODE]` `player.js:592` (`handleAttack`). Perilaku ditentukan `holdMode` senjata
(Bab 4.1):

- **`heavy`** (semua senjata jarak dekat): tap langsung memukul; menahan tombol
  menabung charge sampai `chargeMax` frame, lalu melepas memicu **heavy attack**
  dengan pengali `chargeBonus` dan jangkauan `heavyReach` kali lebih jauh.
- **`release`** (bow, staff): tidak ada yang dilepas sampai tombol diangkat, dan
  makin lama ditahan makin kuat tembakannya. Anak panah terkena gravitasi
  (`shot.gravity = 0.045`), bola staff tidak terkena gravitasi.

Charge baru dihitung sebagai charge nyata setelah `CHARGE_MIN = 10` frame.

![Serangan, skill, dan ult pada lantai hidup: reticle, efek, dan HUD](docs/img/combat.png)

## 3.6 Membidik dengan kursor (bow & staff)

`[CODE]` `player.js:554` (`aimVector`)

- Vektor bidik dihitung dari posisi kursor ke posisi pemain, dibatasi
  `AIM_MAX_PITCH = 1.0` rad (~57 derajat) ke atas maupun ke bawah.
- `refreshAim(p)` menyimpan hasilnya; proyektil memakai vektor ini, jadi arah
  tembakan mengikuti kursor dalam batas fisika yang masuk akal (tidak bisa
  menembak lurus ke atas atau ke bawah).
- Untuk senjata jarak dekat, reticle tetap berguna sebagai penunjuk arah hadap.

## 3.7 Arah hadap (facing)

`[CODE]` `renderer3d.js` + `player.js`

| Keadaan | `rotation.y` model | `scale.x` |
|---|---|---|
| Diam (idle) | `0` (menghadap depan) | `+1` |
| Jalan ke kiri | `-72` derajat | `-1` (dicerminkan) |
| Jalan ke kanan | `+72` derajat | `+1` |
| Berhenti | kembali `0` | `+1` |

Aturan ini **sama** untuk MC dan monster: `p.facing` (MC) dan `e.facing` (monster)
sama-sama menandatangani yaw saat berjalan. Bug yang pernah ada: pencerminan
`scale.x = -1` membalik badan tetapi tidak membalik muka (muka ada di sumbu +Z,
cermin X tidak menyentuhnya), sehingga kiri dan kanan mendapat yaw yang sama dan
monster tampak "menghadap ke dalam layar". Perbaikannya adalah menandatangani yaw
dengan arah gerak, bukan mengandalkan cermin.

## 3.8 Rantai damage ke pemain

`[CODE]` `player.js:111` (`hurt`)

1. `iframes > 0` → tidak ada damage (dash dan mini-dash memberi iframe sendiri).
2. Damage masuk ke **shield** lebih dahulu, baru ke hati.
3. `iframes` di-set ulang ke `stats.iframes` (34 frame, bisa ditambah boon `VIGIL`
   +20 frame).
4. `SHIELD_DELAY` di-set 360 frame: shield baru mulai tumbuh lagi setelah 6 detik
   tanpa damage.
5. Thorns armor/boon membalas ke penyerang (`THORNMAIL`, set `OBSIDIAN` 50%).
6. Ambience horror menambahkan detak jantung saat `hp <= 2` (Bab 7.5).

## 3.9 Tali dan panjat

- `updateRope()` (`player.js:294`) menangani naik-turun tali dengan kecepatan
  `ROPE_CLIMB = 1.35`. Karena itu, lantai yang memuat tali sebagai satu-satunya
  jalan naik **wajib** menempatkan tali sampai ke dasar lantai yang akan ditinggalkan.
- Panjat tepi tidak otomatis; yang membuat tanjakan bisa dilewati adalah "rungs"
  yang dicetak `systems/reach.js` (Bab 7.7), bukan animasi khusus.

## 3.10 Alur satu frame pemain

`[CODE]` `player.js:190` (`update`) secara berurutan:

1. Baca input aksi (`In.isDown('left')` dsb.).
2. `move()` - kecepatan horizontal, akselerasi, gesekan.
3. `handleJump()` - coyote time, jump buffer, lompat ganda.
4. `handleDash()` / `startMiniDash()` / `updateDash()`.
5. `updateRope()` bila sedang di tali.
6. `checkWater()` - menentukan status berenang/lembab (memengaruhi elemen air).
7. `refreshAim()` - arah bidik dari kursor.
8. `handleAttack()` / `handleReleaseWeapon()` / `handleSkills()`.
9. Tegakkan gravity + `MAX_FALL` lewat `systems/physics.js`.
10. `checkHazards()` - paku, bola berduri, gergaji, platform runtuh.
11. `regen()` - stamina, mana, shield.
12. Update cooldown skill/ult, iframe, dan animasi.
13. Mati: `dead = true` → `scenes/game.js` menyerahkan ke layar game over.

## 3.11 Pause dan modal

`[CODE]` `scenes/game.js:784` (`updatePause`) + `g.modal`

| Keadaan | Efek |
|---|---|
| `g.paused` | Update dunia berhenti; layar pause digambar |
| `g.modal` | Modal aktif (`bag`, `enchant`, `shop`, `shrine`); dunia berhenti, prompt interaksi disembunyikan |
| Keduanya kosong | Dunia berjalan normal |

Saat modal terbuka, HUD tidak lagi digambar di belakangnya (satu layar satu
momen) - ini menghilangkan kebocoran visual berupa banner lantai yang terlihat
menembus panel bag.
