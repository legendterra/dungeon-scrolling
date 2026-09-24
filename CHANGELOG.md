# Changelog — Dungeon Scrolling

All notable changes to this project across various AI-assisted development iterations are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v5.2.1] - 2026-09-24 - A HUD You Can Measure, And Two Things That Hang

### Fixed
- **The screen going dark when an elemental effect landed** (BUG-023): the light pool from v5.2.0 fixed *how many* lights there were but not *what was in them*. `buildElemRig()` built a rig object with no `phase`, and `animateRig()` phased its glow off `rig.parts[0].phase` — and `parts[0]` is the scar disc, which has no phase. `Math.sin(NaN)` is `NaN`, `NaN` was written to `elemLightPool[i].intensity`, and one NaN `PointLight` poisons the shading of every lit material in the scene, which is a black frame rather than a dim one. Measured at depth 4: frame mean 36-40 → 19-21 and dark share 51% → 70-78% after a single fire field, on exactly the three elements that carry a light (fire, lightning, poison). The rig carries its own `phase` now, `rig.glow` is guarded with `Number.isFinite`, and the pool refuses to write a light it cannot place. `npm run qa:lights` checks both halves: every light's intensity is finite after all eight elements land, and a burning patch does not darken the frame.
- **Ropes and ladders floated instead of hanging** (BUG-024): a rope's strand started at the boundary of its topmost rope tile, which under a wooden platform is 1.02 units below the plank's underside — so every rope under a pijakan kayu began in mid-air with a visible gap. And a ladder: the first pass looked for vertical runs of adjacent platform tiles and found **zero** across all ten floors, because a climb in this game is not a stack — it is a *rung group*, two or more platform tiles spaced exactly `CLIMB_STEP = 2` rows apart down a face, which `systems/reach.js` builds and the parkour generator copies. Measured: 66 climb groups, every one of them 2-3 rungs spaced two rows, 1-4 tiles wide. Ladders are now detected by that shape, are as wide as the rungs they serve, carry one rung under each plank, and start exactly at the underside of the topmost plank. Every hanging prop records `hangTop`, `hangOn` and the `anchorTile` its piton bites into, and `npm run qa:hangs` checks those claims against the geometry's own bounding box and the tile grid: **63 hanging props across ten depths, all attached.**
- **The HUD was disproportionate everywhere** (BUG-025): the currency plate was 78 units wide with 16x16 rows drawn around a 6x6 coin — and its key row hung off the plate's own bottom edge; skill keycaps were half cut off by the frame; the boss bar was drawn at `C.H-14`, which is *inside* the vitals panel, so it read as a red smear across the health bar; and the control sheet was a full-bleed band at `y = 96` that covered the depth banner, the boon column and part of the plate the moment a run started. Every number was reasonable on its own and the totals were not. `src/ui/ui.js` now has one layout table, `hudBoxes(g)`, and every cluster draws strictly inside the box it is handed: `HUD_GUTTER = 4`, `HUD_BAND = 27` for the one baseline the three bottom clusters share, `rowH = 9` currency rows in a 40-unit plate, skill and hand tiles 18x18 with their keycaps in their own row above, and `clipBody`/`clipMicro` to cut a long boss name or momentum tier to its band instead of letting it escape.

### Added
- **`npm run qa:hud` / `qa:paint` / `qa:lights` / `qa:hangs`**: four more browser checks that measure rather than assert. `audit-hud.js` hooks the only two paths HUD pixels take (`DS.UI3.quad` and `DS.UI3.text`), runs the HUD in a bare and an overloaded state, and requires every box inside the frame, no two boxes sharing a pixel, every painted rect inside a declared box, one baseline for the bottom row, and the vitals centred between the corner clusters — 13 boxes and 288 painted rects in the busy state. `check-hud-paint.js` measures the *composited* frame at 1280x720, 1024x768 and 1920x1080, mapping each cluster through `DS.UI3.view`: the currency tile is 160x156 px at scale 4 and 240x234 px at scale 6, exactly 1.5x.

### Changed
- **The documentation is rebuilt at v5.2.1**: chapter 2.7 documents the new box table and both measuring tools, chapter 8.2 carries the NaN-light post-mortem beside the light-pool one, and 8.6 gains the "nothing floats" rule for things that are *supposed* to hang. The issue register's summary table gains BUG-023, BUG-024 and BUG-025.

## [v5.2.0] - 2026-09-24 - A Name, A Ladder, And Terrain You Can Actually Climb

### Added
- **A player name and an online ladder** (`src/core/board.js`, `worker/`, D1): START RUN asks who you are once, the name rides over the hero's head in both render modes, and every finished run is posted to a leaderboard shown beside the run summary on the death screen. The ladder is a 140-line Cloudflare Worker over a D1 table on the same free account that already hosts the game — a page load never invokes it (`run_worker_first` matches only `/api/*`), nothing is waited on, and when `/api/*` cannot be reached the run is kept locally and the screen says `THIS DEVICE` instead of pretending to be online. Fields are clamped server-side (depth to the ten the dungeon has), so a stale client cannot poison the table.
- **`tools/qa/` — four browser checks that measure instead of assert**: `measure-frame.js` (the play frame at nine window sizes, recomputing the old rule from the same live numbers), `measure-menu.js` (decodes the composited frame in-page and compares the 3D diorama against its 2D fallback), `check-board.js` (the name prompt, typed text, the label over the hero, the offline ladder) and `check-api.js` (one real run on the deployed site, read back out of D1).
- **`npm run …` scripts at last** (`package.json`): `dev`, `solve`, `qa:*`, `docs:*` — the commands that had been typed by hand all along.

### Fixed
- **The play frame was 29% of the window** (BUG-021): `fitScale()` only ever used whole multiples of the 2x art scale, so a 1280×630 window played in 640×360 and a 1024×768 window in 1024×576 — the "everything is tiny, I have to zoom to 200%" report. The fill now wins unless a whole multiple wastes 3% or less of the binding axis: 1280×630 goes 29% → 88%, 1366×660 26% → 86%, 1024×768 29% → 75%, while 1920×1080 stays pixel-exact at 100%.
- **Ledges you could not climb** (BUG-017): reachability was a repair pass bolted on after the terrain — 23.6 emergency platforms per floor, and any face taller than four rows was skipped on the theory that a long climb was authored on purpose, which is exactly the ledge that stranded the player. The pass now journals every edit and rolls a repair back if it severs the level, knows that ropes and the mountain shafts are routes, and steps the ledge ladder two rows at a time. On 400 floors: **0 unreachable**, patch platforms down 23.6 → 8.2 per floor.
- **The black screen when fire skills fired** (BUG-022): every torch created its own `PointLight`, so the shader was recompiled per torch and, past the GPU uniform limit, affected materials drew black. The world now uses one fixed pool of eight point lights, re-aimed at the nearest torches and fields each frame; measured at 9 torches, 0 torches and 12 fire fields it stays at 8. The darkness veil module and the `DARKNESS` modifier are gone with it.
- **The menu is a 3D diorama now** (BUG-003): `scenes/camp3d.js` was written and never called. It renders as a pre-pass inside the play frame — voxel hero at a voxel fire, three rows of trees, lantern flies, a camera that breathes — with the painted forest kept only as the fallback for a frame the diorama cannot build.
- **1,127 lines of dead code removed** (BUG-004, BUG-005, BUG-009): `ui/kit.js`, `art/icons.js`, `art/backdrop.js` and `systems/lighting.js` were loaded by `index.html` and called by nothing; the layout audit they advertised never ran once. The chapters that documented them now say what the game actually does.
- **Smaller ones**: the cache-buster is one version again, so a stale `player.js` cannot survive a deploy (BUG-002); `ELEMENT_SHORT` has `wind` and `steam`, which used to print as `UNDEFINED` on a weapon card (BUG-007); the control sheet's countdown ticks in `update()` instead of in the draw path (BUG-014); `backup/`, `assets/preview/` and `.codex/` are untracked (BUG-011…013).

### Changed
- **The documentation is rebuilt at v5.2.0**: `dist/Dungeon-Scrolling-GDD-v5.2.0.docx` (20 figures) and `.pdf`, with the issue register's new **Status** column marking what v5.2.0 closed — plus two new entries, BUG-021 (the frame) and BUG-022 (the light limit), and a section on the Worker and the ladder.

## [v5.1.0] - 2026-09 - The Book, And A Site That Ships Only The Game

### Added
- **The Game Design & Technical Bible** (`docs/`, `dist/`): nine chapters built from a read-only audit of all 57 source files (29,004 lines) — the render/UI foundation and its scale rule, the three bitmap faces, every screen and the four HUD clusters with their exact coordinates, the player and its sixteen actions, weapons/rarity/affixes/armor/chests/shop/enchant/shrine, the twelve skills and the eight elements with their twenty-eight reactions, the full bestiary with rank scaling and the three bosses, the world generator with the biome ladder and the difficulty curve per depth, the renderer's light rig, and a **numbered issue register** (BUG-001..BUG-020) so the next pass can work from a list instead of re-reading the codebase. Output: `dist/Dungeon-Scrolling-GDD-v5.1.0.docx` (Word, 19 figures) and `.pdf` (52 pages).
- **A documentation toolchain with no dependencies** (`tools/docs/`): `mdparse.py` parses the chapters once and two renderers consume it — `build_docx.py` writes a real .docx out of Python's stdlib (cover, TOC field, four heading levels, shaded code blocks, grid tables, embedded PNGs, footer page numbers) and `build_html.py` writes the print sheet; `cdp.js` + `build_pdf.js` print it through headless Chrome's DevTools Protocol over a hand-rolled WebSocket, because `Word.Application` Automation hangs on this machine (Office is installed but never activated) — that dead end is documented in `build_pdf.ps1` so nobody tries it twice.
- **`check_docx.py`**: validates the generated .docx the way Word's loader does — property elements in schema order, every style/numbering/relationship/content-type reference resolvable — so a hand-written OOXML package can be trusted without the Word that would normally open it.
- **`shoot_game.js`**: captures the document's 19 figures by driving the real game in headless Chrome (real key presses for the menu flow, the debug handles only for what a player cannot jump to instantly), and in doing so exercises the whole loop — menu, help, records, loadout, intro, seven depths, combat, bag, three profile tabs, death, cleared — with **0 console errors**.

### Changed
- **Only the game is published now** (`.assetsignore`): the Cloudflare Worker's assets directory is the project root, and it had been uploading the development tooling with it — `tools/` (Python art generators and the level solver), `prompts/`, `assets/` (18 MB of concept art and 127 development screenshots), `docs/`, `dist/`, every `*.md`, `devserver.py`, `.codex/` and `wrangler.jsonc` itself. The ignore list now leaves `index.html`, `libs/` and `src/` — about 1.3 MB — and nothing else.

### Fixed
- **The PDF printed without a single figure** (`build_html.py`): figure `src` was written relative to the project root while the sheet lives in `dist/`, so every image resolved to `dist/docs/img/...` and failed silently — the probe reported 19 broken images while the PDF looked merely text-heavy. The paths are relative to the sheet now, and the probe's `brokenImages` is 0.
- **The layout probe measured the wrong page** (`build_pdf.js --probe`): it compared element widths against A4 inside a 1400px-wide window and reported the cover, the titles and all 62 tables as overflow. It now emulates print media at A4 width first, and reports `overflow: []` against a real 790px body.

---

## [v5.0.0] - 2026-09 - One Renderer: The 2D Canvas Is Gone

### Changed
- **The Screen Layer Is Three.js Now** (`src/ui3/screen.js`, `src/core/renderer.js`): the game shipped two canvases — a WebGL one for the dungeon and a 2D one stacked on top for the HUD, the menus and every world FX mark. That is why world-anchored things (drop labels, damage numbers, enemy HP bars) were painted over the 3D scene regardless of depth, and why the darkness veil dimmed the 3D rift along with the level. There is one canvas now, and no 2D context is created after boot. The `DS.R` API is unchanged — `rect`, `panelS`, `text`, `spr`, `bar`, `fade` and the rest append quads to a batched screen layer that flushes as a handful of instanced meshes after the world pass — so roughly three thousand call sites across the HUD, the bag, the shop, the shrine, the title screen and the intro kept working while the backend underneath them changed.
- **A New Font, Cuts Of The Game's Own Face** (`tools/art/font3.py` -> `src/art/font3.js`): three faces at twice the old detail — BODY (10x14) for prose, MICRO (6x10) for key caps and labels, and a genuinely new TITLE face (20x28, serif foot and shoulder) for headings. MICRO is the 3x5 face doubled with NEAREST rather than Scale2x, which is what fixes the old "SHIFT reads as SHIFY" blob problem: EPX rounds a single-pixel diagonal into a smear, a hard doubling does not. Text metrics are byte-identical to the 2D faces, so no layout moved; text is drawn as glyph quads from one baked atlas with a pre-baked outline ring, so a label is a quad instead of a few hundred `fillRect` calls.
- **A HUD In The Action Arrangement** (`src/ui/ui.js`): vitals are one plate along the bottom centre (health as a bar with a number, shield, mana, stamina, dash charges as pips) instead of a wrapping row of hearts with three bars and a skill pair crowded into the top-left corner — the corner that now has a voxel dungeon behind it. Skills and the ultimate hug the bottom-right, currency moved to the top-right inside the same panel the bag uses, and the floor's name is the only thing across the top.
- **A Camera Rig** (`src/core/renderer3d.js`): the view was one hardcoded side-on shot (yaw 0, pitch 7 degrees), which is why voxel models in front of a 3D backdrop still read as flat. The camera now orbits its target on four numbers with four presets — SIDE 0/7, THREE-Q 40/24 (default), STEEP 60/35 and FILM 20/16 — cycled with **F6** (F7 resets), persisted, with an on-screen readout naming the preset and its angles. The yaw is a real trade-off and it is printed rather than hidden: a yaw of A degrees shows `cos(A)` of the level's width, so 60 degrees is 50% of the play field. Gameplay physics are untouched; only the eye moves.
- **The Black Room Is Backlit, Not Black** (`src/core/renderer3d.js`, `src/world/lair.js`, `src/systems/lighting.js`): the room's look was a veil at 0.94 alpha composited over the frame, which is a black screen with a small glow in it. The veil is deleted (darkness is real lights plus fog plus a capped post curve now), the room's rig lerps toward "lamp guttering, moon behind the rift as the key light, backdrop left bright", and the monsters read as silhouettes in front of a lit background — which is what the room was always described as being. The entry ramp went from 12 world pixels (three quarters of a tile, so the mood swung in about a tenth of a second and read as a glitch) to 8 tiles, with hysteresis so standing on the threshold cannot make it flicker.
- **Lighting: Filmic Response And A Real Back Light** (`src/core/renderer3d.js`): `sRGBEncoding` + `ACESFilmicToneMapping` (exposure 1.25, which puts back what the filmic curve compresses out of the midtones), the back light raised from a 0.16 nudge to a 0.42 moon so a block has two visible faces, and a weak camera-side fill so front faces are read rather than guessed. The post overlay now carries fade, hit flash, tint, vignette and grain in one shader instead of four paint passes.
- **`src/art/font3.js` and `src/ui3/screen.js` join `index.html`; `#game` and its CSS are gone.**

### Fixed
- **Stone Teeth Punched Through Every Lake** (`supportPlatforms` in `src/world/generator.js`): the hang-anchor search for a floating ledge stopped six rows up, and a flooded floor's step stones sit nine rows under their ceiling — so every one of them missed its anchor by a row and fell through to the "legs" branch, which columned stone from the platform down to the lake bed. That is the "water isn't generated where the pillars are" report: a one-tile rock tooth standing out of the surface with a dry slot beside it. Measured on a dumped flooded floor: **17 to 93 teeth per level, now 0 on the surface**; the anchor search runs to the ceiling, and supports refuse to write through water (a ledge with only water above it is dropped rather than roofed over).
- **`DS.R.canvas` Pointer Mapping** (`src/core/input.js`, `src/core/renderer.js`): with the canvas sized to the window and the 16:9 play frame letterboxed inside it, a bare client-to-canvas ratio put the aim reticle on the wrong tile whenever the window was not exactly 16:9. `DS.R.pointerToGame` maps through the live viewport.
- **The Inventory Doll Draws On Top** (`renderDoll` in `src/core/renderer3d.js`): the bag used to punch a hole in the 2D canvas for the WebGL pass behind it. With the bag panel drawn in WebGL there is no rectangle to erase, so the doll is a scissored pass after the UI, mapped through the letterboxed viewport.

---

## [v4.1.0] - 2026-09 - A Horizon Worth Looking At

### Changed
- **The Horizon Is The Floor's Own Walking Surface** (`horizonRow` in `src/core/renderer3d.js`): every backdrop band used to stand on the map's bottom row, which is a different place on every floor — a 22-tile corridor put the horizon just under the eye and a 44-tile carved floor put it 70 units down, so the same theme's horizon jumped between rooms and its bands were either buried or towering. The horizon is now the median of the level's surface across the map, so a floor's horizon is a property of the floor.
- **A Depth Ladder Instead Of A 6-Unit Shell** (`BACKDROP_RECIPE`): the bands used to be packed between 3 and 9 units behind the walkway, which read as a jumble of boxes crowding the corridor. Every theme now declares five or six rungs from 4.5 to 44 units out, each authored in *reference* units and scaled by exactly the factor its distance grew by, so parallax, haze and occlusion all do depth work at once. Everything in the recipes was retuned to the lens: the eye line sits about two thirds down the frame and everything a backdrop may show lives in the 13 degrees above the horizon, so a far ridge is authored around 2 units, not 8.
- **Aerial Perspective, By Value** (`buildBackdrop`): a distant band is mixed toward the horizon haze in proportion to its distance, and the haze itself is darkened for the bands because a lit Lambert surface and an unlit sky do not render a shared colour the same way — the old single haze made far bands *brighter* than the sky behind them, which is what "washed out and flat" looked like. Near bands are now the dark silhouettes (the torch is right there) and far ones are pale ghosts of them.
- **The Sky Is Rigged To The Eye Line** (`skyRig`): the gradient sky, its stars and its moon hang in one group whose origin is pinned to the camera's own height every frame, so the bright haze band lands on the horizon wherever the player is standing instead of drifting away from it as the camera rises and falls. The gradient's stops are placed against what the camera can see *above* the far ground, not against the plane, so the haze plateau is actually on screen.
- **Ground With Its Own Distance Ramp** (`GSEG`): the horizon floor is three slabs, each a little paler than the last in toward the sky, rather than one flat plane at one value — the plain now carries depth instead of reading as a wall lying down, and the bands standing on it have something to be told apart from.
- **Landforms, Not Lone Boxes**: band spacing was far too wide on the far rungs (up to 15 degrees of empty horizon between objects), which is why distance read as scattered blocks. Far rungs are dense enough for their wide shapes to overlap into coastlines, treelines and ridges, and every band gets a per-instance value jitter (`instancedBoxes` tint) so forty rocks stop rendering as one flat mass.
- **Every Biome Rides One Table** (`BACKDROP_RECIPE` + `ScreenParticleManager.setTheme`): a biome's sky glow, haze strength, ground colour, ceiling, atmosphere motes and per-rung composition all live in the same entry. Three new shapes fill the horizons out — `hills` (overlapping rolling ground, the one silhouette every open theme needs between its clutter and its skyline), `reeds` and `clouds` — and `stalactites` now varies its drop point and length so a cave roof is a profile rather than a repeating tooth pattern.

### Fixed
- **The Same Air In Seven Biomes**: `ScreenParticleManager.setTheme` was an if-chain over six themes, so `shore`, `cave`, `swamp`, `mountain`, `flooded` and `volcanic` silently animated as the same generic blue dust. Motes are read out of the biome's own recipe entry now, with the drift (spores rising, drip falling, ash climbing) declared beside the colour.

---

## [v4.0.1] - 2026-09 - Every Floor Is Finishable

### Fixed
- **A Hop Onto A Platform Was Rejected By The Reach Model** (`src/systems/reach.js`): the one-way-platform check compared the platform's *tile row* against the landing's *feet row*, which are one apart, so every hop that ended on a platform failed its own validity test. The flood could therefore only ever walk on solid rock, and no ladder, ledge or crossing the generator built was ever used — which is why a wall of platforms read as unclimbable in game. Levels now climb.
- **The Reach Model Put Its Feet One Tile Above The Floor**: the body box and the surface it stands on were measured a row apart from how `levels` actually place props and doors, so headroom and landing checks were all computed one row high. Both the generator's model and the QA solver now use the same convention as `world/generator.js` (`feetY(row) = (row + 1) * TILE`).
- **Hops Were Judged With The Stick Held Down**: the trajectory model assumed the player holds a direction for the whole flight and must land within half a tile of the aimed-for column, which made a one-tile step up a wall a rejected move. The model now steers toward the target column and lets go when it is over it — which is what the 0.14 air friction in `entities/player.js` actually allows.
- **The Exit Repair Could Give Up Holding A Half-Built Level** (`src/systems/reach.js`): a step was placed, declared a failure, and the map was left with the platform in it and the level reported unsolvable. The repair is now step → tunnel → bridge, each accepted only after the hop model agrees, and the bridge can always be built, so no floor can be declared unwinnable while there is ground to stand on.
- **Swimming Was Not Part Of Reachability**: a flooded hall is crossed by swimming, and the model could not swim, so the repair pass cut tunnels through flooded pillars instead. Water is a move now.
- **Floating Trap Pits** (`closeTraps` in `src/world/generator.js`): a pit with a crossing platform over it hid itself from `sealPits`, and the support pass then took the crossing away — leaving a bottomless column that a player could fall into and never leave alive or dead. **Roughly a third of all generated floors had at least one**, twelve columns wide on average. Every bottomless column now gets the killing floor as the last word on the terrain, so a bad jump costs the run instead of stranding it under the level.
- **Ledges Three Rows Above Their Own Floor** (`ensureLedges` in `src/systems/reach.js`): a platform three or four rows above the surface beneath it was a move needing the air jump at the exact apex, which reads as "I cannot get up there". Those gaps get a rung placed between them; taller ones are left as the climb the level meant to build.
- **Rungs Placed Under Existing Ledges**: a rung whose body cell was already occupied was placed anyway and did nothing. Rungs now check the cell the hero would stand in, and if the column has no room, the one beside it does the job.

### Changed
- **`tools/solve-levels.js` Is A QA Harness Now**: one CLI (`[seeds]`, `--seed/--depth`, `--no-reach`) that builds floors through the real generator, walks them with an independently written physics model, and reports unreachable exits, trap columns and generator repairs per floor. `npm test`-able evidence for every future terrain change: **0 unreachable exits and 0 trap columns across 400 floors, depths 1-10**.

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
