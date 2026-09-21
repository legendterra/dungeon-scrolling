# Notes & Developer Guide — Dungeon Scrolling

> Catatan arsitektur, evolusi pembaruan antar-AI, struktur kode, dan panduan deployment untuk Dungeon Scrolling.

---

## 1. Ringkasan Proyek

**Dungeon Scrolling** adalah game aksi platformer/dungeon crawler roguelite berkecepatan tinggi yang menggabungkan:
- **Gameplay 2D Pixel-Art**: Logika aksi, platforming, kombat, dan partikel pada resolusi retro tajam.
- **3D Voxel Backdrop (Hybrid)**: Menggunakan Three.js lokal untuk merender background dan elemen voxel 3D di belakang layer 2D.
- **Zero Build / Zero Dependencies**: Tanpa Webpack, Vite, npm build, atau compiler. Langsung jalan di browser (bahkan via double-click `index.html` atau static server).
- **Procedural Sound**: Seluruh sound effect dan synthesizer musik digenerate realtime melalui browser Web Audio API tanpa perlu file `.mp3` atau `.wav`.

---

## 2. Riwayat Pembaruan & Kolaborasi Antar-AI

Proyek ini telah mengalami beberapa siklus pembaruan besar yang dikerjakan oleh beberapa AI:

1. **Fase 1 (Engine Foundation & Core Mechanics)**
   - Pembentukan loop fixed-timestep 60Hz (`requestAnimationFrame`).
   - Sistem fisika AABB, collision tilemap, kontrol player (jump, dash, attack, i-frame).
   - Procedural dungeon generator berbasis seed mulberry32.
   - Generator senjata, affix prefix/suffix, dan drop table.

2. **Fase 2 (Atmosphere, Safe Rooms & 10 Floors)**
   - Perbaikan bug safe room ganda dengan sistem tabel lantai terstruktur (10 lantai, safe room sebelum lantai 5 & 10).
   - Rework total sistem pencahayaan (lighting system): obor bertiang dengan nyala 3-frame, heat core, dual sine wave flicker, drop shadow miring, ambient darkness pekat, dan mata musuh yang menyala di kegelapan.
   - Sistem armor, visual paperdoll dinamis, UI profile, dan biome variatif (water/mountain/trials/puzzle).

3. **Fase 2.5 (2X Chibi Pixel-Art Redraw)**
   - Peningkatan rendering detail 2x (`C.RS = 2` -> canvas 640x360 di atas logika 320x180).
   - Seluruh sprite digambar ulang via kode prosedural menjadi chibi pixel art dengan outline `#0d0b14`.
   - Implementasi boss Slime King dengan sprite sheet animasi 6-frame dan state machine bertahap.

4. **Fase 3 (Hybrid 3D Voxel Three.js)**
   - Penambahan `three.min.js` lokal di folder `libs/`.
   - Arsitektur dual-canvas: `#game3d` di belakang `#game` untuk kedalaman visual 3D voxel.
   - Modul `voxel.js` dan `renderer3d.js` untuk parsing model dan sinkronisasi kamera 2D/3D.

---

## 3. Struktur Direktori

```text
4. Dungeon Scrolling/
├── index.html              # Entry point HTML & susunan script
├── devserver.py            # Local HTTP server dengan no-cache & shot endpoint
├── libs/
│   └── three.min.js        # Bundled Three.js (offline)
├── src/
│   ├── main.js             # Inisialisasi game & loop utama
│   ├── art/                # Gambar sprite & background dalam kode
│   │   ├── backdrop.js     # Backdrop 2D & parallax
│   │   ├── biomes.js       # Palet & tema biome
│   │   ├── king.js         # Sprite sheet procedural Slime King
│   │   ├── paperdoll.js    # Render armor pada karakter
│   │   └── sprites.js      # Definisi pixel art karakter, mob, item
│   ├── core/               # Engine inti
│   │   ├── audio.js        # Web Audio chiptune synth
│   │   ├── input.js        # Keyboard & gamepad handler
│   │   ├── renderer.js     # 2D Canvas renderer
│   │   ├── renderer3d.js   # Three.js 3D voxel renderer
│   │   ├── rng.js          # Mulberry32 seeded random
│   │   ├── storage.js      # LocalStorage wrapper
│   │   └── voxel.js        # Voxel mesh data & generator
│   ├── entities/           # Entitas game
│   │   ├── player.js       # Kontrol & state pemain
│   │   ├── enemies.js      # AI monster dasar (slime, bat, skeleton, zombie)
│   │   ├── enemies2.js     # AI monster tingkat lanjut & varian
│   │   └── boss.js         # Logika dan fase pertarungan boss
│   ├── items/              # Sistem item
│   │   ├── armor.js        # Database & stat armor
│   │   ├── weapons.js      # Tipe senjata & animasi serangan
│   │   ├── affixes.js      # Magic prefix & suffix
│   │   ├── generator.js    # Random roll drop item
│   │   └── inventory.js    # Slot & equip system
│   ├── scenes/             # Alur scene
│   │   ├── menu.js         # Title screen
│   │   ├── game.js         # Gameplay loop & room transition
│   │   └── cutscene.js     # Transisi & intro cutscene
│   ├── systems/            # Sistem pendukung
│   │   ├── lighting.js     # Ray, torch light, shadow, darkness
│   │   ├── particles.js    # Partikel debu, darah, hit spark
│   │   ├── physics.js      # Gravitasi & tabrakan AABB
│   │   └── skills.js       # Skill pohon & ability
│   ├── ui/                 # Antarmuka
│   │   ├── ui.js           # HUD, HP bar, hotbar
│   │   └── profile.js      # Karakter stat & visual paperdoll
│   └── world/              # Pembuatan dungeon
│       ├── generator.js    # Procedural dungeon layout
│       ├── tilemap.js      # Grid tile collision
│       ├── hazards.js      # Trap, duri, lava
│       └── water.js        # Mekanik air & monster air
├── assets/                 # Concept art & generated sprite references
├── prompts/                # Prompt acuan AI untuk sprite & asset
├── ASSETS.md               # Spesifikasi palet & ukuran sprite
├── PLAN.md                 # Desain awal Fase 1
├── PLAN-2.md               # Desain ekspansi Fase 2
├── SPRITE_PLAN.md          # Rencana produksi sprite
└── CHANGELOG.md            # Riwayat perubahan per versi
```

---

## 4. Kontrol Permainan

| Aksi | Keyboard | Gamepad |
|---|---|---|
| Gerak Kiri / Kanan | `A` / `D` atau `Panah Kiri` / `Kanan` | Left Stick / D-Pad |
| Lompat | `Space` atau `W` / `Panah Atas` | Tombol A (Xbox) / Cross |
| Dash | `Shift` | Trigger / Tombol B |
| Serang | `J` atau `Klik Kiri` | Tombol X |
| Interaksi (Peti, Pintu, NPC) | `E` | Tombol Y |
| Buka Karakter / Profil | `C` atau `Tab` | View / Select |
| Buka Inventory | `I` | Menu / Start |

---

## 5. Menjalankan di Lokal

### Opsi 1: Python Server (Rekomendasi)
Menyediakan fitur auto-refresh tanpa cache dan endpoint screenshot:
```bash
python devserver.py 8123
```
Buka browser di: `http://127.0.0.1:8123/index.html`

### Opsi 2: Langsung Buka File
Klik dua kali `index.html` pada File Explorer. Script diatur sebagai classic scripts agar tidak terhalang kebijakan CORS lokal.

---

## 6. Panduan Deployment

Karena game ini bersifat **100% Static HTML5/JS**:

1. **Cloudflare Pages (Direkomendasikan)**:
   - Bandwidth gratis tanpa batas.
   - Hubungkan ke repo GitHub ini, set *Build output directory* ke root `/`, tanpa build command.
2. **Itch.io**:
   - Kompres seluruh isi folder menjadi `.zip` (pastikan `index.html` di root zip).
   - Unggah sebagai game web HTML5.
3. **GitHub Pages**:
   - Buka repo GitHub $\rightarrow$ *Settings* $\rightarrow$ *Pages* $\rightarrow$ Pilih branch `main` $\rightarrow$ Simpan.

---

## 7. Rencana Integrasi Masa Depan (Opsional)

- **Supabase**: Menambahkan tabel PostgreSQL via Supabase JavaScript SDK untuk sistem **Global Leaderboard** (High Score) dan **Cloud Save**.
- **Eksternal PNG Texture Pack**: Mengonversi kode procedural di `src/art/` ke file PNG menggunakan atlas sprite sheets yang sudah didefinisikan di `SPRITE_PLAN.md`.
