# Changelog — Dungeon Scrolling

All notable changes to this project across various AI-assisted development iterations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v3.1.0] - 2026-09 - Grounding Pass, Cursor Aiming & True Fullscreen

### Added
- **Cursor Aiming for Ranged Weapons**: Bows and staves now fire along the cursor instead of the character's facing.
  - `aimVector()` in `src/entities/player.js` converts the pointer to a world point through `R.toWorldX/Y` and returns a unit direction toward it.
  - Fire cone clamped to ±57° (`AIM_MAX_PITCH`), so a shot can never leave straight down or backwards through the player; muzzle speed, charge bonus and `shot.gravity` are untouched, so arrows still arc and range is still earned.
  - The 3D arm pitch follows the same aim vector (smoothed), and keyboard-only play keeps the original facing-based shot.
- **Real Fullscreen Toggle**: `F2` requests fullscreen on the document root (`DS.R.toggleFullscreen()`), re-fitting the canvas on `fullscreenchange`.
- **3D Inventory Armory**: The character doll in the bag screen is now a live WebGL viewport (scissored region of the same Three.js render) showing the equipped armor pieces **and** main/off-hand weapons, replacing the flat 2D paperdoll.
- **Drop Readability Pass**: Loot and coins got larger voxel models, a floor glow pool, a rarity-coloured beam, a landing pop, and a floating rarity label for high tiers.
- **Per-Tier Chest Models**: Wood, iron, cursed and vault chests each have their own voxel silhouette (banding, locks, gem) instead of one shared box.
- **Trial Chamber 3D Hardware**: `THE GODS HATE YOU` now builds real 3D pressure plates and braziers, plus a dedicated trial theme in the 3D renderer.
- **Plate Progress Readout**: `PLATES n / N` under the depth header, so it is clear how many plates must be held at once.

### Changed
- **Fit-To-Window Scaling** (`src/core/renderer.js`): the old rule floored the scale to a multiple of `RS` after subtracting a 24px pad, so a 1920×1080 window rendered at 1280×720 — two thirds of the screen, and players had to reach for browser zoom. The canvas now fills the window exactly (1920×1080 → 1920×1080) and only falls back to an even multiple when it wastes under 8% of the viewport.
- **All Props Share One Floor Anchor**: chests, shrines, levers, pressure plates, pickups and braziers are placed from the tile's real floor line rather than per-object offsets, which is what let them sink into or hover above the ground.

### Fixed
- **Chests Clipping Into The Floor**: `createChestMesh` planted the model at `cy + 16` while the floor line is `cy + 11.5`, burying half of every chest.
- **Bow / Staff Ignoring The Cursor**: shots always flew along the facing direction, so aiming the pointer did nothing.
- **Trial Puzzle Invisible**: the 3D proxy layer only understood `kind: 'plate'`, while the trial hall is a `kind: 'plateset'` — its plates and braziers were never built at all, leaving a locked gate with no visible puzzle behind it.
- **Plate Counter Never Drawn**: the readout sat after the wall inscription's off-screen early-return, so it vanished exactly where the player needed it (in the hall).
- **Dropped Items Half-Buried**: pickups were anchored to the middle of their hitbox instead of their feet, so they sank into the tile they landed on.

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
