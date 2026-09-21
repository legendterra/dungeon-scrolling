# Changelog — Dungeon Scrolling

All notable changes to this project across various AI-assisted development iterations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v4.0.0] - 2026-09 - Everything Is Three-Dimensional

### Added
- **A Central Difficulty Curve** (`src/systems/difficulty.js`): enemy counts and ranks, hazards, terrain span, puzzle size, torch spacing, chest odds, loot bias and shake budget all read one module, so the whole game moves together when a number moves. Depths 1-2 are pinned as the teaching floors — few enemies, no hazards, no elites, short floors — and growth is front-loaded then flattens, with the ramping challenge carried by enemy *rank* and terrain rather than by body count.
- **The Biome Ladder**: which shape a floor has is decided by depth, not by a dice roll — shore, cave, cave, Torch Hall, Waystation, swamp, mountain, flooded halls, ash reaches, throne. A run now reads as a journey with a geography instead of rolling a lava floor at depth 2 and a beach at depth 9.
- **An Eighth Element And Every Reaction**: `wind` joins fire, ice, lightning, poison, water, earth and leaf, with the **full 28-pair reaction matrix** filled in (13 pairs were missing and silently did nothing). Elemental conversion is now a stat on every weapon, rolled on rarity, and shown in the item tooltip.
- **Per-Weapon Charge FX**: sword, axe, spear, bow and staff each telegraph a heavy attack differently, with a smoke trail behind the charged hero and a charge aura on the model.
- **Elemental Ground Rigs In 3D**: each element grows real geometry out of the floor - flame jets, ice shards, arcing cracks, bubbling vents, ripples, rubble, vines, a dust swirl - replacing the flat glowing plate that read as a puddle for every element, including the dry ones.
- **Terrain Support Pass** (`supportPlatforms` in `src/world/generator.js`): every unsupported ledge is made honest — reached sideways to a wall (balcony), hung from bedrock above, or given a stone leg — and a ledge with no ground anywhere below it is removed rather than left floating.
- **Six New Biome Palettes** (`src/art/biomes.js`): `shore`, `cave`, `swamp`, `mountain`, `flooded`, `volcanic`, one per rung of the biome ladder, each with its own tile palette, sky, torch colour, darkness and dust. `Biomes.forDepth()` now asks `Difficulty.biomeForDepth()` for the palette instead of indexing the list by `depth - 1`, which is why depths 6-10 were previously all lit as the slime throne's gold.
- **A Procedural 3D Backdrop Per Biome** (`BACKDROP_RECIPE` in `src/core/renderer3d.js`): every theme declares what its horizon is made of — rock teeth, mountain ridges with snow caps, cave ceilings and stalactites, crystal clusters, colonnades and arches, ruined wall faces, trees, ice floes, waterfalls, lava falls, bone piles — and one builder turns the recipe into staged, lit, fogged geometry in depth bands.
- **A Real Sky Shell**: a gradient sky plane, a horizon ground slab and a star field, so the terrain never ends in mid-air over a black void. Two outdoor biomes also get a moon.
- **Depth-Staged Parallax From Perspective**: the camera only pans, so the backdrop bands slide against each other by themselves; the old `nearBackdrop.position.x = camX * 0.28` fake is gone.
- **Piranha & Gold Slime Models**: both enemy kinds existed in gameplay and had **no 3D builder**, so `build()` returned `null` and the renderer drew nothing — a fish that bit you invisibly and the one enemy that *is* a reward, also invisible.
- **Enemy Attack Tells Rebuilt In 3D**: the spider's silk thread, the bomber's lit fuse and swell, the shielder's braced rim, the necromancer's rotating rune ring and the golem's opening cracks were `drawExtra` calls inside the 2D enemy draw, which the voxel path skips — they are now model parts driven by the same entity state.
- **Real 3D Water**: pools are translucent volumes with a lit surface sheet and a bright crest, animated. Depth-sorted, so a submerged fish is *tinted* by the water instead of hidden by a flat tint painted over the whole scene.
- **The Black Room** (`src/world/lair.js`): one chamber on a floor where the torches are dead, the veil is pushed to 0.94, and the only light in the room is a rift burning in the far wall — placed **behind** the actors so everything reads as a rimmed silhouette. Announced with a `THE LIGHT DIES HERE` banner on entry, capped at one room per floor and never on a tutorial, safe, trial or boss floor.
- **Hostile Projectile Read** (`buildProjectile(kind, element, friendly)`): enemy shots get a hot white core, a saturated rim, an additive halo sprite and a muzzle flash on the first frames of flight.

### Changed
- **Monster And Hero Facing Is Mirroring, Not Turning**: characters used to be yawed ±66° toward the camera's side, which read as “facing the background” and cost the face. They now keep the face on the camera and **mirror** left/right (`scale.x = ±1`) like the 2D sprites always did, leaning only ±0.22 rad into the walk. Asymmetric details — the weapon hand, the shield arm, the zombie's long arm — swap sides, so left and right are actually different.
- **Character Materials Are Double-Sided** (`src/core/voxel.js`): a mirrored model has a negative determinant, and with front-face culling that renders a solid voxel monster inside out.
- **Plate Density Is Spacing, Not Count**: backdrop recipes specify how many world units apart two objects sit, so a 200-unit floor gets the same horizon on screen as a 40-unit one.
- **Flavour Follows The Biome Ladder** (`src/world/generator.js`): the carved-parkour roll used to fire on every plain floor at ~50%, so the shore (depth 1) was a climb half the time. A `carved` rung is a climb almost always; the tutorial floors are exactly what the ladder says.
- **`disposeGroup` Recurses**: it only freed direct children, so every rebuilt level leaked the whole backdrop subtree.

### Fixed
- **Backdrop Bands Culled Away** (three r128): an `InstancedMesh` is bounded by its *geometry* (a unit box at the group origin), so a band spanning 200 world units vanished as soon as the camera left `x = 0`. All backdrop and water batches set `frustumCulled = false`.
- **Water Batches Silently Invisible**: instance tuples that omitted the rotation slots wrote `NaN` into every instance matrix, and three.js drew nothing at all without a word. Rotation slots are defaulted now.
- **Unknown Enemy Kinds Now Warn Instead Of Vanishing**: `build()` falls back to a placeholder silhouette and logs once, so a missing builder is a nudge rather than an invisible monster.
- **The Piranha Never Rendered**: `BUILDERS.piranha` did not exist.
- **Gold Slime Never Rendered**: `BUILDERS.goldslime` did not exist.
- **The Water Veil Hid What Was In It**: the water body and its surface were painted on the 2D overlay, which sits *above* the WebGL canvas, so anything swimming was covered by it. Water is 3D geometry now and the 2D overlay no longer draws water in voxel mode.

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
