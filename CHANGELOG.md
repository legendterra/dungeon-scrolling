# Changelog — Dungeon Scrolling

All notable changes to this project across various AI-assisted development iterations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v3.0.0] - 2026-09 - Hybrid 3D Voxel Engine & Multi-AI Overhaul

### Added
- **Dual-Canvas Rendering Engine**: Integrated a split-layer rendering architecture with `#game3d` (`z-index: 1`) serving as the 3D voxel background canvas beneath `#game` (`z-index: 2`) 2D gameplay canvas.
- **Three.js Voxel Integration**:
  - `libs/three.min.js` bundled locally for offline execution.
  - `src/core/voxel.js`: Procedural voxel model loader and parser for backgrounds and environmental props.
  - `src/core/renderer3d.js`: Dedicated Three.js scene manager, dynamic camera sync with 2D player camera, ambient and directional scene lighting.
- **AI Art Generation Assets**:
  - Added concept rosters and AI-generated sprite references (`assets/generated/cute_hero.png`, `cute_monsters.png`, `cute_slime_king.png`).
  - Added screenshot capture bridge in `devserver.py` supporting `POST /__shot/<name>.png`.

### Changed
- **Script Loading Architecture**: Converted all game scripts to ordered classic `<script>` tags in `index.html` to guarantee zero-CORS issues when opened directly from file system or static hosting.
- Enhanced entity update loop to synchronize world coordinates with 3D camera transforms.

---

## [v2.5.0] - 2026-08 - 2X Chibi Pixel-Art Redesign & Boss System

### Added
- **2X Detail Rendering Scale**:
  - Upgraded internal rendering canvas to 640x360 (`C.RS = 2`) while maintaining logical physics at 320x180.
  - Preserved strict collision geometry while allowing doubled pixel-density art.
- **In-Code Procedural Chibi Sprite Redraw**:
  - Redrawn all player, mob, and item sprites directly inside procedural code (`src/art/sprites.js`, `src/art/king.js`, `src/entities/enemies2.js`).
  - Unified `#0d0b14` outline palette across all sprites.
- **Canonical Slime King Boss**:
  - 6-frame canonical sprite animation: Idle, Idle-Squash, Rear-Up, Slam, Hurt, and Death puddle with crown slide.
  - Multi-phase boss battle with custom telegraphing and minion spawns (`src/entities/boss.js`, `src/entities/bosses.js`).

---

## [v2.0.0] - 2026-08 - Atmospheric Lighting, Armor & 10-Floor Progression

### Added
- **Dynamic Lighting & Torch System**:
  - `src/systems/lighting.js`: Dynamic light circles, sharp falloff, and dual-sine wave flicker algorithm.
  - Fixed-height wall torches and freestanding floor braziers with 3-frame animated flame loop.
  - Overexposed heat core in flame centers.
  - Dynamic entity drop shadows angled away from active light sources.
  - Biome-tinted floating dust particle simulation.
  - Glowing monster eyes visible in total darkness prior to silhouette discovery.
- **Equipment & Paperdoll System**:
  - `src/items/armor.js` & `src/art/paperdoll.js`: Equipable armor pieces rendered directly onto character model.
  - `src/ui/profile.js`: Character profile screen with stats preview and face avatars.
- **Expanded Biomes & Mechanics**:
  - Water bodies with buoyancy and swimming mechanics (`src/world/water.js`).
  - Mountain terrain hazards (`src/world/mountain.js`).
  - Interactive puzzle rooms, trial challenges, and secret bonus rooms (`src/world/puzzle.js`, `src/world/trial.js`, `src/world/bonus.js`).

### Fixed
- **Safe Room Chaining Bug**: Eliminated `pendingSafe` race condition in `src/scenes/game.js` that caused duplicate safe rooms. Replaced with an explicit progression table (Safe Rooms strictly before Floor 5 and Floor 10 Boss).

---

## [v1.0.0] - 2026-08 - Initial Engine Foundation

### Added
- **Core Game Loop**: Fixed 60Hz timestep accumulator with deterministic physics (`src/core/loop.js`, `src/systems/physics.js`).
- **Procedural Level Generation**: Seeded room-based dungeon generator with corridors, hazards, and loot chests (`src/core/rng.js`, `src/world/generator.js`, `src/world/tilemap.js`).
- **Player Controller**: Responsive platformer movement, wall slide, jump, dash, attack combos, and i-frame invulnerability.
- **Loot & Affix Engine**: Weapon archetypes (swords, daggers, axes, bows) with procedural prefix/suffix modifiers and stat rolls (`src/items/weapons.js`, `src/items/affixes.js`, `src/items/generator.js`).
- **Synthesized Audio Engine**: Zero-asset procedural sound effects and chiptune synth using browser Web Audio API (`src/core/audio.js`).
- **Local Persistence**: Save/load state, run statistics, and unlocks persisted in `localStorage` (`src/core/storage.js`).
