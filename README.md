# Dungeon Scrolling ⚔️🏰

> Side-scrolling pixel action roguelite with hybrid 3D voxel background.
> Built with pure HTML5 Canvas, Vanilla JavaScript, and Three.js. Zero build step, zero dependencies.

---

## ✨ Fitur Utama

- **Hybrid 2D/3D Rendering**: Gameplay aksi 2D yang presisi dan tajam di atas latar belakang 3D voxel dinamis berbasis Three.js.
- **Procedural Dungeon**: Layout dungeon prosedural (seeded random mulberry32) dengan jebakan, peti harta, ruangan teka-teki, dan safe room.
- **Dynamic Lighting & Atmosphere**: Sistem pencahayaan dinamis, obor berapi hidup, bayangan miring, partikel debu sesuai biome, dan mata musuh yang menyala di kegelapan.
- **Loot & Paperdoll Armor**: Beragam varian senjata dengan affix magis (prefix/suffix), slot perlengkapan armor yang langsung tergambar pada tubuh karakter.
- **Boss Fights**: Pertarungan boss dengan fase dan mekanik unik (seperti Slime King dengan sprite sheet animasi 6-frame).
- **Procedural Chiptune Audio**: Seluruh sound effect dan synthesizer musik digenerate secara realtime lewat Web Audio API tanpa perlu file audio eksternal.
- **Zero Build**: Tanpa bundler atau compiler. Cukup buka `index.html` langsung di browser atau host di static server mana pun.

---

## 🎮 Kontrol

| Aksi | Keyboard | Gamepad |
|---|---|---|
| Gerak Kiri / Kanan | `A` / `D` atau `←` `→` | Left Stick / D-Pad |
| Lompat | `Space` atau `W` / `↑` | A (Xbox) / Cross (PlayStation) |
| Dash | `Shift` | Trigger / B (Xbox) |
| Serang | `J` atau `Klik Kiri` | X (Xbox) / Square (PlayStation) |
| Interaksi | `E` | Y (Xbox) / Triangle (PlayStation) |
| Profil & Karakter | `C` atau `Tab` | View / Select |
| Inventory | `I` | Menu / Start |

---

## 🚀 Cara Menjalankan

### Cara 1: Menggunakan Python Dev Server (Rekomendasi)
```bash
python devserver.py 8123
```
Buka browser di `http://127.0.0.1:8123/index.html`. Server ini memiliki konfigurasi `Cache-Control: no-store` agar setiap perubahan script langsung ter-update tanpa hard-refresh.

### Cara 2: Langsung dari Browser
Buka file `index.html` langsung dengan klik dua kali di File Explorer.

---

## 📖 Dokumentasi Lengkap

- [CHANGELOG.md](CHANGELOG.md): Riwayat pembaruan antar-versi dan catatan iterasi AI.
- [NOTES.md](NOTES.md): Arsitektur kode, detail sistem, dan panduan deployment.
- [PLAN.md](PLAN.md): Rencana awal arsitektur fondasi (Fase 1).
- [PLAN-2.md](PLAN-2.md): Desain ekspansi 10 lantai, obor, dan atmosfer (Fase 2).
- [ASSETS.md](ASSETS.md) & [SPRITE_PLAN.md](SPRITE_PLAN.md): Spesifikasi palet warna, resolusi, dan manifest sprite.
