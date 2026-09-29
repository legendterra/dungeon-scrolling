/* 2.5D WebGL layer for Dungeon Scrolling using Three.js — the hybrid renderer.

   Division of labour between the two canvases:

     THREE (this file)  the dungeon ARCHITECTURE: wall slabs, floor pavers,
                        platforms, spikes, torches, chests, the exit portal,
                        pressure plates and the moving hazards. Also the staged
                        horizon - see the backdrop ladder below - and the
                        fog/ambient mood.
     Canvas 2D          every gameplay SPRITE (hero, enemies, pickups, FX),
                        water and ropes, and the darkness/lighting composite.

   The horizon is geometry, not art: every biome stages its own distant
   landscape (see src/core/backdrop3d.js) out of boxes and cones in real depth
   bands,
   anchored on the level's own walking surface. Fog and the theme's own ambient
   and key lights are what make the mood, and every light in the world is drawn
   from one fixed pool (see the flame pool below) -- the old module that
   composited a darkness veil over the finished frame is gone, because a veil
   over a 3D scene is a black screen with extra steps. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;   // math helpers (clamp/lerp/approach)

  let enabled = false;
  let scene, camera, renderer, canvas;
  let playerLight = null;
  let ambientLight = null;
  let hemiLight = null;
  let dirLight = null;
  let fillLight = null;
  let activeTheme = null;           // the THEMES row in force this floor
  let activeThemeName = null;       // and its name, which the horizon keys off

  /* Emitters, not lights: { group, smooth } read each frame to point the pool. */
  let torchLights = [];
  let flamePool = [];
  let elemLightPool = [];
  /* The fire layer. Every flame on a floor is one instance of ONE shader
     batch, every floor pool one instance of another (src/core/flame.js); the
     batches are built once at boot and refilled per level. The tile materials
     read a per-level torch light map through torchMapUniforms, so every torch
     lights its area whether or not the point-light pool is on it. `emitters`
     is the pool's view of every flame (src/core/torchlight.js). */
  let flameBatch = null;
  let poolBatch = null;
  let torchMapUniforms = null;
  let torchMapTex = null;
  let lightPool = null;
  let emitters = [];
  let emittersDirty = true;
  let noFlamePool = false;           // QA only: see DS.R3D.noFlamePool
  const FLAME_CAP = 96;              // flames + pools a floor can carry
  const TORCH_MAP_TEXEL = 8;         // level px per light-map texel (half a tile)
  const TORCH_MAP_RADIUS = 66;       // level px one torch reaches on the stone
  const TORCH_MAP_LIFT = 13;         // the flame's height over its floor, px
  const TORCH_MAP_GAIN = 2.3;        // irradiance at full map value (times the mood's lamp)
  const TORCH_MAP_RGB = [1.0, 0.50, 0.18];
  const FLAME_REACH2 = 20 * 20;      // units^2 from the camera centre a pool light may serve
  const EMBER_EVERY = 17;            // frames between embers per visible torch
  const SMOKE_EVERY = 43;            // frames between smoke wisps per visible torch

  let dungeonGroup = null;
  let shadowGroup = null;
  let propsGroup = null;
  let themeGroup = null;
  /* The horizon's vertical life: themeAnchorY is the line the theme was built
     around, horizonY is where that line is being carried now. See render(). */
  let themeAnchorY = null;
  let horizonY = 0;
  let horizonSettled = false;   // false until the first frame of a level has placed it
  /* The locked horizon's slow drift on tall floors (see render). */
  let horizonGoal = 0;          // median ground around the hero, re-read every 16 frames
  let horizonVel = 0;           // units per second, smoothed
  let horizonAway = 0;          // seconds the goal has sat outside the dead zone
  const HORIZON_DEAD = 7;       // units: inside this, the horizon never moves
  const HORIZON_WAIT = 2.5;     // seconds outside it before any drift starts
  const HORIZON_SPEED = 0.9;    // units per second, at most
  const HORIZON_DT = 1 / 60;

  /* The horizon -- its sky, its light body, its landmarks, its texture and all
     of their motion -- lives in src/core/backdrop3d.js (DS.Backdrop). What stays
     here is the one thing this file owns: the reference to the sky rig it pins
     to the eye line every frame, and the group the whole thing tears down with. */
  let backdropRef = null;    // { group, skyRig, hero, report }

  let flameTex = null;
  let portalTex = null;
  let runeTex = null;
  let glowTex = null;      // soft round falloff for drop light pools

  let doorPortalObj = null;
  let chestMeshes = [];
  let plateMeshes = [];
  /* Both are dead: the backdrop is geometry now. Kept as null guards for the
     teardown path, which predates the recipe builder. */
  let hazardMeshes = [];
  let spikeMeshes = [];

  // --- voxel chibi actors -----------------------------------------------------
  // Every gameplay character is a blocky 3D model (src/core/voxel.js); the 2D
  // canvas keeps only FX, telegraphs, UI bars and the lighting composite.
  let actorGroup = null;     // hero + monster models
  let fxGroup = null;        // projectiles + pickup meshes
  let heroModel = null;
  let heroArmorKey = '';
  let heroWeaponMesh = null;
  let heroWeaponAura = null;   // orbiting element motes on an elemental weapon
  let heroWeaponRef = null;
  const enemyModels = new Map();   // entity -> model
  let projMeshes = [];
  let pickupMeshes = [];
  let gateMeshes = [];
  let leverMeshes = [];
  let brazierMeshes = [];   // trial hall braziers: { group, flame, ref, smooth }
  let ropeMeshes = [];      // 3D ropes: { x0,y0,x1,y1 (units), group }
  let ladderMeshes = [];    // 3D ladders built from vertical runs of platforms
  let elemPuddles = [];     // per-enemy status puddles: { mesh, key }
  let elemFields = [];      // ground field plates: { mesh, key }
  let elemBolts = [];       // lightning bolts: { mesh }
  let groundBursts = [];    // 3D skill FX hugging the floor: { group, life, maxLife, vy[] }
  let swingFx = [];         // melee swing arcs: { group, life, maxLife }
  let crateMeshes = [];
  let shrineMesh = null;
  let vignetteMesh = null;
  /* The sky (gradient + stars + moon) rides the camera's eye line every frame,
     which is the only way the horizon stays where the horizon is: the eye level
     in world units moves with the player, so a sky pinned to a fixed y drifts
     away from the horizon it is supposed to explain. */
  let skyRig = null;

  // 1 world pixel = 0.1 Three.js units (1 tile of 16px = 1.6 units)
  const P2U = 0.1;
  const TILE_SIZE = 16 * P2U; // 1.6 units

  /* How far below a platform tile's top edge its slab's underside sits: the
     slab is 0.35 of a tile tall and hangs 0.3 above the tile's centre (see the
     platform instances in loadLevel). Anything that hangs from a platform --
     a rope, a ladder -- has to start exactly here or it starts in mid-air. */
  const PLATFORM_UNDER = 0.58;

  // Camera: a gentle downward tilt so the floor slabs read as 3D, without
  // tipping far enough to shove the walkway off the bottom of the frame.
  const CAM_DIST = 26;
  const FOV = 39.5;
  const TILT_ANGLE = 0.12; // ~7 degrees

  /* --- the camera rig --------------------------------------------------------

     The view used to be one hardcoded side-on shot: yaw 0, pitch 7 degrees.
     Voxel models and a 3D backdrop behind a camera with no angle at all is why
     the world read as a painted wall with toys in front of it, so the rig is
     now four numbers and a preset list.

     preset.yaw is the turn toward the level (0 = straight side-on, 60 degrees =
     the three-quarter RPG shot), preset.pitch the downward tilt. There is a
     real trade-off here and it is MEASURED, not guessed: a yaw of A degrees
     shows cos(A) of the level's width, so 40 degrees keeps 77% of the play
     field while 60 degrees keeps 50% -- and a turned rig also slides the level
     diagonally on screen, which a side-on platformer cannot afford: a ledge
     stops being a horizontal line and the frame stops agreeing with the physics
     under the player's feet. So the DEFAULT is 0/7 -- the straight shot the
     game has always had -- and the angled presets stay one keypress away (F6)
     for looking at a room, never as the state the game boots into. Gameplay
     physics are untouched either way. */
  const CAM_PRESETS = [
    { key: 'left',  label: 'SIDE 0/7',     yaw: 0,    pitch: 0.12, dist: 26, fov: 39.5 },
    { key: 'foot',  label: 'THREE-Q 40/24', yaw: 0.70, pitch: 0.42, dist: 26, fov: 39.5 },
    { key: 'wide',  label: 'STEEP 60/35',  yaw: 1.05, pitch: 0.61, dist: 24, fov: 42 },
    { key: 'film',  label: 'FILM 20/16',   yaw: 0.35, pitch: 0.28, dist: 30, fov: 36 },
    /* The 2.5D action shot, and the one the game boots into. Still yaw 0 --
       everything said above about a turned rig stands -- but closer, a little
       more tilt so the floor slabs read as floor, a longer lens so the voxel
       bodies are not bent by perspective at the frame edges, and the eye aimed
       a touch above the hero so the head room is where the action is. It is
       appended rather than inserted so the older presets keep their indices
       (tools/qa/shoot-backdrop.js addresses them by number). */
    { key: 'cine',  label: 'ACTION 0/11',  yaw: 0,    pitch: 0.19, dist: 18, fov: 35, lift: 0.45 }
  ];
  const DEFAULT_PRESET = CAM_PRESETS.length - 1;

  /* Dynamic framing on top of the preset: the rig eases IN when a fight is
     close (a boss on the floor, or anything hostile within ENGAGE_PX of the
     hero). It used to ease OUT on vertical speed and on ropes too, which meant
     every jump pumped the lens out and back in -- the whole frame, backdrop and
     all, breathing with the hero's feet. Vertical motion is now the follow's
     job (src/core/camfollow.js: a dead band around the grounded height), so the
     lens only answers the fight. A critically damped spring, slow enough to
     read as a decision rather than a reaction. Only the action preset
     breathes; the F6 presets are for looking at a room and hold still. */
  const ZOOM_IN = 0.88;
  const ENGAGE_PX = 120;
  const ZOOM_OMEGA = 1.7;       // spring stiffness (rad/s): about two seconds to settle

  /* Screen shake and hit punch, now in the WORLD. DS.R.shake/punch used to move
     only the 2D quad layer, so a hit shook the HUD numbers over a scene that
     stood perfectly still. The amounts (world px) and their decay stay owned by
     DS.R; the rig reads them each frame and moves the eye, and the 2D overlay
     follows because it is projected through this same camera. */
  const SHAKE_GAIN = 1.0;       // world px of shake -> world px of eye offset
  const SHAKE_ROLL = 0.004;     // radians of roll per px of shake
  /* The plane the gameplay bodies stand in: actors, pickups and projectiles all
     sit at z = 0.3, so the 2D overlay (labels, damage numbers, FX) projects onto
     it to stay glued to what it annotates. */
  const ACTOR_Z = 0.3;
  /* Retina-class screens: the post chain runs at device resolution, and past 2x
     the fill cost buys nothing the eye can see at this art scale. */
  const MAX_DPR = 2;
  /* The view ships STRAIGHT, and that is deliberate: the dungeon is a side-on
     platformer, so a turned camera slides the whole level diagonally and the
     frame stops agreeing with the physics the player is reading -- ledges look
     slanted, a wall you can stand on reads as a slope, and the level itself
     looks broken. SIDE 0/7 is exactly the shot the game has always had
     (CAM_DIST 26, FOV 39.5, 7 degrees down), and it is the default.
     The other presets are one keypress away for looking at a room, but nothing
     slanted is ever restored on boot: the pick is not persisted, so a fresh
     launch cannot come up crooked. */
  const camRig = { yaw: 0, pitch: 0.12, dist: 26, fov: 39.5, lift: 0, preset: 0, show: 0,
                   zoom: 1, zoomV: 0, zoomTarget: 1 };

  function applyCameraPreset(i) {
    const p = CAM_PRESETS[M.clamp(i, 0, CAM_PRESETS.length - 1)];
    camRig.preset = M.clamp(i, 0, CAM_PRESETS.length - 1);
    camRig.yaw = p.yaw;
    camRig.pitch = p.pitch;
    camRig.dist = p.dist;
    camRig.fov = p.fov;
    camRig.lift = p.lift || 0;
    camRig.show = 240;                 // frames the readout stays up
    if (camera) {
      camera.fov = camRig.fov;
      camera.updateProjectionMatrix();
    }
  }

  /* The horizon's own depth ladder -- seven rungs from 4.5 to 68 units, the
     ground running to 130 and the sky behind all of it -- lives with the horizon,
     in DS.Backdrop (rungs(), groundD, skyZ). This file keeps only the camera that
     looks down it. */

  /* Per-theme mood. Deliberately restrained: the 2D darkness veil does the
     heavy lifting, so ambient stays low and warm/cool shifts carry the biome. */
  const THEMES = {
    forest: { fog: 0x0e2417, ambient: 0x5a6a50, hemiSky: 0x6a8166, hemiGround: 0x2a3320, dir: 0xfff3d6, dirI: 0.55 },
    caves:  { fog: 0x0a1e1c, ambient: 0x3f6a60, hemiSky: 0x4f8078, hemiGround: 0x182825, dir: 0x5eead4, dirI: 0.42 },
    prison: { fog: 0x1a1006, ambient: 0x6e5638, hemiSky: 0x846845, hemiGround: 0x241810, dir: 0xfbbf24, dirI: 0.50 },
    vault:  { fog: 0x140728, ambient: 0x5c4290, hemiSky: 0x745aa8, hemiGround: 0x201335, dir: 0xd8b4fe, dirI: 0.48 },
    nest:   { fog: 0x1a060a, ambient: 0x6e323c, hemiSky: 0x86404a, hemiGround: 0x24100f, dir: 0xf43f5e, dirI: 0.45 },
    /* The gods hate you: clamped, blood-lit stone, and no green in it at all. */
    trial:  { fog: 0x1c0709, ambient: 0x6e2f2c, hemiSky: 0x8a3a34, hemiGround: 0x26100f, dir: 0xff8a6a, dirI: 0.52 },
    throne: { fog: 0x221806, ambient: 0x74613a, hemiSky: 0x8d7a48, hemiGround: 0x26200f, dir: 0xfde047, dirI: 0.55 },

    /* --- the biome ladder (see systems/difficulty.js) ---------------------
       One theme per rung of the journey, so a run's geography reads in the
       light as well as in the terrain: salt air on the shore, wet crystal in
       the cave, methane green in the swamp, thin blue at altitude, cold
       underwater grey in the sunk halls, and ash and ember at the end. */
    shore:    { fog: 0x101c26, ambient: 0x64788a, hemiSky: 0x88a6c0, hemiGround: 0x2a3238, dir: 0xfff0cc, dirI: 0.62 },
    cave:     { fog: 0x081614, ambient: 0x3c6a64, hemiSky: 0x4c8c86, hemiGround: 0x121e1c, dir: 0x6ee7d0, dirI: 0.40 },
    swamp:    { fog: 0x0d1a0c, ambient: 0x4e6a3a, hemiSky: 0x6d8a4c, hemiGround: 0x141a10, dir: 0xb8e06a, dirI: 0.42 },
    mountain: { fog: 0x141a26, ambient: 0x6a7288, hemiSky: 0x9fb0d0, hemiGround: 0x2a2e38, dir: 0xdceaff, dirI: 0.66 },
    flooded:  { fog: 0x08161f, ambient: 0x3a6a86, hemiSky: 0x4c8cb0, hemiGround: 0x102028, dir: 0x8fd8ff, dirI: 0.44 },
    volcanic: { fog: 0x1a0a06, ambient: 0x7a3a28, hemiSky: 0x9a4a2c, hemiGround: 0x241008, dir: 0xff7a3c, dirI: 0.58 }
  };
  /* --- the light rig, in four numbers -------------------------------------

     The previous pass lit the dungeon with a big ambient and a level hemi and
     left the key weak, which is the one combination that cannot look like
     anything: with no direction in the light, every face of a block receives
     almost the same amount, so a rock, a wall and the sky behind them all land
     on the same pale grey -- the frame reads washed out and flat, and at the
     top of the ambient range it literally glares.

     So the budget is inverted: a strong KEY (directional, per theme, boosted by
     KEY_GAIN) that gives every block a lit face and a dark face, a small
     AMBIENT to keep the dark faces from going to pure black, and a low HEMI for
     the sky-ground gradient. Sun/ambient/hemi is the classic outdoor ratio and
     it is why the frame suddenly has depth: value difference IS depth here. */
  /* Lit by its lamps, not by the sky.

     The frame used to run on a large ambient plus a near-daylight key (0.55 and
     up to ~1.0). That flattens every block to the same value, and it is why a
     floor read as "terang benderang" whatever the theme was: the light was not
     coming from anywhere in the room. The fill is now small enough that the
     torches and the hero's lamp are what you see by, and updateLighting scales
     it per depth -- open surface floors take more, the flooded halls and the
     volcanic deep take almost none and live on their fires. */
  /* Where the light COMES FROM, measured rather than assumed. The previous
     numbers failed a simple test: a torch is a 1.2 point light at distance 10
     with decay 2, which at its own 4-unit falloff lands around 0.55 -- and the
     flat ambient was 0.55. A lamp exactly as strong as the fill is not a lamp,
     it is a slightly warmer fill, so nothing in the frame could read as lit by
     the fire and every floor came out evenly bright whatever it contained.

     The budget now has three tiers and a rule: the FLAT floor (ambient) is the
     smallest number in the rig; the SKY (hemisphere + the moon behind you) is
     what washes a room from the background; and the FIRE (torch, brazier, the
     lamp the hero carries) is two to four times the ambient, so it wins inside
     its own radius and the floor visibly belongs to the lamps you can see. */
  const AMBIENT_I = 0.12;
  const HEMI_I = 0.24;
  const KEY_GAIN = 0.34;
  /* On the presets with a real shadow pass the key is lifted and the sky wash
     trimmed to pay for it (see render). */
  const KEY_SHADOW_BOOST = 2.1;
  const SKY_SHADOW_TRIM = 0.78;
  /* The two lamps that matter: what the hero carries, and what a torch throws. */
  const LAMP_I = 1.85;
  const TORCH_I = 2.30;

  /* --- the light pools: a FIXED count, always ---------------------------------

     Every torch, brazier and elemental patch used to bring its own Three.js
     point light, so a floor with eleven torches ran fourteen point lights and a
     fire skill added more on top of that. Two things follow from a light count
     that grows while you play, and both are the same report:

       1. Three.js bakes the light count into each material's shader, so every
          new emitter recompiles every world material. That is the hitch.
       2. Past the driver's uniform budget the program fails to link, three.js
          keeps the failed program and the affected materials draw BLACK. That
          is the screen that goes dark the moment a fire skill lands on a
          torch-heavy floor.

     So the lights are pooled and the pool is created once, at boot, and never
     added to or taken from. Each frame the nearest emitters are pointed at the
     pool entries. A floor with twenty torches costs exactly what a floor with
     one costs, and the count cannot drift into the failure case mid-fight. */
  const FLAME_LIGHTS = 4;        // torches and braziers
  const ELEM_LIGHTS = 2;         // burning patches, poison vents, fire rigs

  /* How a body is staged on this stage: standing still it faces the camera, so
     you see the face, the eyes and the weapon in hand; walking it turns side-on
     -- 72 degrees, not a flat 90, which keeps a sliver of the face and reads as
     a stride instead of a paper cut-out. The left/right mirror below turns the
     same angle into a left turn or a right turn, so one number serves both. */
  const IDLE_YAW = 0;
  const WALK_YAW = 1.26;
  /* How thick the air is. The horizon needs this number too: it is what a far
     band is compensated against (see DS.Backdrop), so the two files have to
     agree on it. The one sky value that used to live here is now a curve, per
     theme, beside the recipes it belongs to. */
  const FOG_DENSITY = 0.008;

  function createTexture(cv) {
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  function makeWallTexture(biome) {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    const baseColor = (biome && biome.pal && biome.pal.D) || '#3e3752';
    const darkColor = (biome && biome.pal && biome.pal.d) || '#221c32';
    const lightColor = (biome && biome.pal && biome.pal.g) || '#564d72';

    ctx.fillStyle = darkColor;
    ctx.fillRect(0, 0, 32, 32);

    const drawBrick = (x, y, w, h) => {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = lightColor;
      ctx.fillRect(x + 1, y + 1, w - 2, 1);
      ctx.fillRect(x + 1, y + 1, 1, h - 2);
      ctx.fillStyle = darkColor;
      ctx.fillRect(x + Math.floor(w * 0.5), y + Math.floor(h * 0.4), 2, 2);
    };

    drawBrick(0, 0, 16, 16);
    drawBrick(16, 0, 16, 16);
    drawBrick(-8, 16, 16, 16);
    drawBrick(8, 16, 16, 16);
    drawBrick(24, 16, 16, 16);

    return createTexture(cv);
  }

  function makeFloorTexture(biome) {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    const baseColor = (biome && biome.pal && biome.pal.D) || '#484060';
    const darkColor = (biome && biome.pal && biome.pal.d) || '#2a233b';
    const lightColor = (biome && biome.pal && biome.pal.G) || '#786c9b';

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 32, 32);

    ctx.fillStyle = darkColor;
    ctx.fillRect(0, 15, 32, 2);
    ctx.fillRect(15, 0, 2, 32);

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, 32, 2);
    ctx.fillRect(0, 16, 32, 1);

    return createTexture(cv);
  }

  function makePlatformTexture(biome) {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 8;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#65482e';
    ctx.fillRect(0, 0, 32, 8);

    ctx.fillStyle = '#8a6442';
    ctx.fillRect(0, 0, 32, 1);
    ctx.fillRect(0, 4, 32, 1);

    ctx.fillStyle = '#3d2919';
    ctx.fillRect(0, 7, 32, 1);
    ctx.fillRect(15, 0, 1, 8);

    ctx.fillStyle = '#ffd56b';
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(19, 3, 2, 2);

    return createTexture(cv);
  }

  function makeFlameTexture() {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    const grd = ctx.createRadialGradient(16, 18, 1, 16, 16, 14);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.3, '#ffe066');
    grd.addColorStop(0.65, '#ff7711');
    grd.addColorStop(1, 'rgba(255, 60, 0, 0)');

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(cv);
  }

  /* A soft round falloff for the light pool under a drop. A flat disc reads as
     a stain on the floor; a gradient reads as light. Painted white so each
     material can tint it to the drop's own colour. */
  function makeGlowTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.42)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  function makePortalTexture() {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    const ctx = cv.getContext('2d');

    const grd = ctx.createRadialGradient(32, 64, 4, 32, 64, 48);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.25, '#7df5ff');
    grd.addColorStop(0.55, '#3a88e9');
    grd.addColorStop(0.85, '#221155');
    grd.addColorStop(1.0, 'rgba(10, 5, 30, 0)');

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 128);

    ctx.strokeStyle = '#a8ffff';
    ctx.lineWidth = 2;
    for (let r = 8; r <= 36; r += 9) {
      ctx.beginPath();
      ctx.ellipse(32, 64, r * 0.65, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function makeRuneTexture() {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#1c1828';
    ctx.fillRect(0, 0, 32, 32);

    ctx.strokeStyle = '#4ee2ec';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(16, 16, 11, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(16, 7); ctx.lineTo(16, 25);
    ctx.moveTo(10, 13); ctx.lineTo(22, 19);
    ctx.moveTo(10, 19); ctx.lineTo(22, 13);
    ctx.stroke();

    return createTexture(cv);
  }

  // --- Screen-Space Camera Particle System ---------------------------------
  // Ambient motes (spores, embers, fireflies) floating between the backdrop
  // and the walkway. Kept sparse and translucent so they read as atmosphere.
  class ScreenParticleManager {
    constructor(parentScene) {
      this.scene = parentScene;
      this.group = new THREE.Group();
      this.scene.add(this.group);
      this.particles = null;
      this.currentTheme = null;
      this.velocities = null;
      this.count = 110;
      this.time = 0;
    }

    /* One theme table drives the air as well as the horizon: a biome names its
       own motes (spores, drip, ash, dust) in the same recipe entry its bands
       live in, so adding a biome can never again leave the air on the default.
       The old version had an if-chain over six themes and silently gave the
       other seven blue dust. */
    setTheme(themeName, rec) {
      if (this.particles) {
        this.group.remove(this.particles);
        if (this.particles.geometry) this.particles.geometry.dispose();
        if (this.particles.material) this.particles.material.dispose();
        this.particles = null;
      }
      this.currentTheme = themeName;

      const count = this.count;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const velocities = [];

      const m = (rec && rec.motes) || {};
      const color = m.col != null ? m.col : 0x98d4ff;
      const size = m.size != null ? m.size : 0.26;
      const opacity = m.alpha != null ? m.alpha : 0.45;
      const rise = m.rise || 0;

      for (let i = 0; i < count; i++) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 44;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 26;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 10;

        velocities.push({
          x: (Math.random() - 0.5) * (rise ? 0.7 : 0.5),
          y: rise + (Math.random() - 0.5) * 0.4,
          z: (Math.random() - 0.5) * 0.3,
          wobble: Math.random() * 6.28
        });
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: color,
        size: size,
        transparent: true,
        opacity: opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      this.particles = new THREE.Points(geo, mat);
      this.velocities = velocities;
      this.group.add(this.particles);
    }

    update(camX, camY, dt) {
      if (!this.particles || !this.velocities) return;
      this.time += dt;
      this.group.position.set(camX, camY, 0);

      const pos = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < this.velocities.length; i++) {
        const v = this.velocities[i];
        let px = pos[i * 3 + 0];
        let py = pos[i * 3 + 1];
        let pz = pos[i * 3 + 2];

        const sway = Math.sin(this.time * 2.5 + v.wobble) * 0.02;
        px += (v.x + sway) * dt * 8;
        py += v.y * dt * 8;
        pz += v.z * dt * 8;

        if (py < -14) py = 14;
        if (py > 14) py = -14;
        if (px < -24) px = 24;
        if (px > 24) px = -24;

        pos[i * 3 + 0] = px;
        pos[i * 3 + 1] = py;
        pos[i * 3 + 2] = pz;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
  }

  let screenParticleManager = null;
  let waterSurfaceMesh = null;      // the lit surface of every pool, animated
  let backLight = null;             // the moon: light from behind everything
  let waterCrestMesh = null;        // the bright line where water meets air

  function init() {
    if (typeof THREE === 'undefined') return false;

    canvas = document.getElementById('game3d');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'game3d';
      document.body.appendChild(canvas);
    }

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      /* Real shadows from the key light. Whether they are ON is the quality
         preset's call (see applyQuality): the low preset keeps the blob
         shadows and never pays for a shadow pass. */
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      /* Filmic response and linear-correct output: without these, every
         material the scene lights is a Lambert face whose highlights clip to
         white and whose shadows sit on one flat value. */
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      /* ACES compresses the highlights, which would otherwise read as a darker
         frame than the linear one it replaced; the exposure lifts it back. */
      renderer.toneMappingExposure = 0.95;
      /* F6 cycles the camera preset (see the rig above). */
      window.addEventListener('keydown', function (e) {
        if (e.code === 'F6') {
          e.preventDefault();
          applyCameraPreset((camRig.preset + 1) % CAM_PRESETS.length);
        } else if (e.code === 'F7') {
          e.preventDefault();
          applyCameraPreset(DEFAULT_PRESET);   // back to the shipped shot
        }
      });
      /* Straight side-on, always. `ds.cameraPreset` is cleared rather than
         read: an older build saved the angled preset, and restoring it is what
         made a returning player's game come up crooked. */
      try { localStorage.removeItem('ds.cameraPreset'); } catch (e) { /* private mode */ }
      applyCameraPreset(DEFAULT_PRESET);
      camRig.show = 0;   // the readout is for F6, not for boot
    } catch (err) {
      console.warn('WebGL init failed:', err);
      return false;
    }

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(THEMES.forest.fog, FOG_DENSITY);

    /* The far plane has to reach PAST the sky: the sky plane stands at z=-150 and
       the camera orbits 26 units out on the other side of the world, so a 160
       unit far plane clips it and the top of the frame comes up empty. */
    camera = new THREE.PerspectiveCamera(FOV, DS.C.W / DS.C.H, 0.5, 320);

    ambientLight = new THREE.AmbientLight(THEMES.forest.ambient, AMBIENT_I);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(THEMES.forest.hemiSky, THEMES.forest.hemiGround, HEMI_I);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(THEMES.forest.dir, THEMES.forest.dirI * KEY_GAIN);
    dirLight.position.set(15, 30, 25);
    scene.add(dirLight);
    /* The target has to live in the graph: the key is re-aimed at the hero
       every frame so its shadow frustum follows the play area. */
    scene.add(dirLight.target);
    configureKeyShadow();

    playerLight = new THREE.PointLight(0xffe2a0, LAMP_I, 12, 1.4);

    /* The back light. It used to be a 0.16 nudge that only kept a monster from
       matching the wall behind it; with voxel models and a lit backdrop, light
       coming from BEHIND is what gives every block two visible faces, so it is
       a real light now -- the moon behind the dungeon, and the reason a monster
       reads as a silhouette against the horizon. */
    backLight = new THREE.DirectionalLight(0x9fb0d0, 0.42);
    backLight.position.set(-12, 18, -26);
    scene.add(backLight);
    scene.add(backLight.target);

    /* A soft fill from the camera side, so front faces are read rather than
       guessed. Deliberately weaker than the back light: the volume cue is the
       value difference between them. */
    fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.18);
    fillLight.position.set(6, 8, 22);
    scene.add(fillLight);
    playerLight.position.set(0, 0, 1.2);
    scene.add(playerLight);

    /* The pools. Created here once and never added to again -- see the note on
       FLAME_LIGHTS. Intensity 0 is still a light as far as the shader is
       concerned, which is exactly what makes the count stable. */
    for (let i = 0; i < FLAME_LIGHTS; i++) {
      const l = new THREE.PointLight(0xff9e38, 0, 11, 2.0);
      l.position.set(0, -999, 0.3);
      scene.add(l);
      flamePool.push(l);
    }
    for (let i = 0; i < ELEM_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 5.5, 2.0);
      l.position.set(0, -999, 0.3);
      scene.add(l);
      elemLightPool.push(l);
    }
    if (DS.TorchLight) lightPool = DS.TorchLight.createPool(FLAME_LIGHTS);
    /* The fire batches live in the scene itself, not in propsGroup: a level
       teardown disposes propsGroup, and these outlive every level. */
    if (DS.Flame) {
      flameBatch = DS.Flame.createFlameBatch(FLAME_CAP);
      poolBatch = DS.Flame.createPoolBatch(FLAME_CAP);
      scene.add(poolBatch.mesh);
      scene.add(flameBatch.mesh);
      torchMapUniforms = DS.Flame.createLightMapUniforms();
    }

    dungeonGroup = new THREE.Group();
    scene.add(dungeonGroup);

    themeGroup = new THREE.Group();
    scene.add(themeGroup);

    propsGroup = new THREE.Group();
    scene.add(propsGroup);

    shadowGroup = new THREE.Group();
    scene.add(shadowGroup);

    flameTex = makeFlameTexture();
    portalTex = makePortalTexture();
    runeTex = makeRuneTexture();
    glowTex = makeGlowTexture();

    screenParticleManager = new ScreenParticleManager(scene);

    actorGroup = new THREE.Group();
    scene.add(actorGroup);

    fxGroup = new THREE.Group();
    scene.add(fxGroup);

    /* The pooled 3D effects layer (src/fx3d/): sparks, trails, crescents,
       debris and every element's look, in six draw calls. */
    if (DS.FX3D) DS.FX3D.init(scene, camera);

    // The camera must join the scene graph for its vignette child to render.
    scene.add(camera);
    vignetteMesh = buildVignette();

    /* The post chain and the quality ladder. Without the module (or without
       half-float targets) the game renders exactly as the low preset does. */
    if (DS.PostFX) {
      DS.PostFX.init(renderer, scene, camera);
      DS.PostFX.onChange(applyQuality);
    } else {
      applyQuality('low');
    }

    resize();
    enabled = true;
    return true;
  }

  /* --- quality: what each rung switches in the WORLD ------------------------

     DS.PostFX owns the chain and the pick; the scene-side half lives here:
     real shadows (and their map size) or the old blob discs, and the camera-
     parented vignette plane, which the grade pass replaces on med/high. */
  let blobShadows = true;
  function applyQuality(q) {
    const size = (DS.PostFX && DS.PostFX.SHADOW_SIZE[q]) || 0;
    const real = size > 0;
    blobShadows = !real;
    if (shadowGroup) shadowGroup.visible = !real;
    renderer.shadowMap.enabled = real;
    dirLight.castShadow = real;
    if (real && dirLight.shadow.mapSize.x !== size) {
      dirLight.shadow.mapSize.set(size, size);
      if (dirLight.shadow.map) { dirLight.shadow.map.dispose(); dirLight.shadow.map = null; }
      shadowExtent.r = 0;   // force the frustum to be re-fitted at the new texel size
    }
    if (vignetteMesh) vignetteMesh.visible = q === 'low';
    /* Shadow state is compiled into every lit program; one recompile per
       switch, never per frame. */
    scene.traverse(function (o) {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) m.forEach(function (x) { x.needsUpdate = true; });
      else m.needsUpdate = true;
    });
  }

  /* --- the key light's shadow ------------------------------------------------

     One directional light casts, and its orthographic frustum is fitted to the
     box the camera can actually see around the actor plane -- not to the level,
     which would spread 2048 texels over two hundred tiles. The box is re-centred
     on the camera target every frame and its centre is SNAPPED to whole shadow
     texels in the light's own axes, which is what keeps a standing wall's
     shadow edge from crawling as the camera pans.

     Bias for voxels: a small negative depth bias plus a normal offset of a few
     hundredths of a unit. Boxes are flat-faced, so the normal offset alone
     kills acne on lit faces, and it is small enough against a 0.2-unit limb
     that nothing peter-pans off the floor. */
  /* Mostly overhead, a little from the camera side and from the right: in a
     side-on view the only surface a body's shadow can land on is the strip of
     floor it stands on, so a key coming from the front (the old 15/30/25)
     threw every shadow off the back edge of the paver into the void. From
     here a hero's shadow lies on the walkway beside his feet, where it reads. */
  const KEY_DEFAULT = new THREE.Vector3(0.36, 1, 0.3).normalize();
  const keyDir = KEY_DEFAULT.clone();
  const shadowAxisR = new THREE.Vector3();
  const shadowAxisU = new THREE.Vector3();
  const shadowFocus = new THREE.Vector3();
  const shadowExtent = { r: 0, u: 0 };
  const SHADOW_BACKOFF = 40;          // light distance from the focus, units
  const SHADOW_DEPTH = 2.2;           // half-depth of the receiving slab (z)
  const SHADOW_MARGIN = 1.35;         // casters just off screen still cast in

  function configureKeyShadow() {
    const s = dirLight.shadow;
    s.camera.near = 1;
    s.camera.far = SHADOW_BACKOFF * 2 + 20;
    s.bias = -0.0005;
    s.normalBias = 0.035;
    s.mapSize.set(1024, 1024);
    setKeyAxes();
  }

  /* The shadow map's own axes, from the key's direction. Re-derived whenever
     the key is re-aimed (once per level, see aimKeyAtBody) and the frustum is
     re-fitted, so the texel snap below always works in the light's real axes. */
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  function setKeyAxes() {
    shadowAxisR.crossVectors(WORLD_UP, keyDir).normalize();
    shadowAxisU.crossVectors(keyDir, shadowAxisR).normalize();
    shadowExtent.r = 0;
  }

  /* --- the key comes FROM the backdrop's light ---------------------------------

     The key used to be a fixed direction (overhead, a little right, a little
     from the camera) whatever was burning in the sky, so a dawn sun low on the
     left and a moon on the right cast the same shadow. It is now aimed from the
     backdrop's own body -- sun, moon, furnace mouth, a room's opening or portal
     -- via DS.Backdrop.heroInfo(), relative to the play area the camera frames.

     The composition is BACKLIT (the body hangs behind the stage), so the key
     arrives from behind and shadows fall toward the camera, down-screen. Two
     clamps keep that readable in a side-on game whose walkway is a strip less
     than two units deep:
       - ELEVATION is held to KEY_ELEV_MIN..KEY_ELEV_MAX (about 34-60 degrees):
         a real low sun would throw every shadow three bodies long and straight
         off the paver's front edge, where nothing receives it;
       - the SIDEWAYS share of the direction is at least KEY_SIDE_MIN, so a
         body dead centre behind the stage still rakes across the walkway (it
         keeps the side it is on; centred counts as the right).
     The body rides the camera (see DS.Backdrop's follow), so its direction
     from the play area is fixed for the floor: the key is aimed ONCE, a few
     frames into the level when the rig has settled, and never wobbles the
     shadow map. Colour and strength follow the body too: the theme's key hue
     leans toward it (warm dawn, cool moon, red lava), and its own intensity
     scales the key within KEY_SUN_GAIN_MIN..MAX. With the key behind, front
     faces would get nothing from it, so the camera-side fill picks up the
     share the key used to give them (see render). */
  const KEY_ELEV_MIN = 0.60;
  const KEY_ELEV_MAX = 1.05;
  const KEY_SIDE_MIN = 0.55;
  const KEY_HUE_LEAN = 0.6;
  const KEY_SUN_GAIN_MIN = 0.75;
  const KEY_SUN_GAIN_MAX = 1.3;
  const KEY_AIM_FRAME = 3;          // frames into a level before the key is aimed
  const FRONT_FILL = 0.32;          // fill added per unit of key, when fully behind
  const keyAim = { frame: 0, done: false, gain: 1, behind: 0 };
  const keyBodyCol = new THREE.Color();

  function aimKeyAtBody(info, ax, ay) {
    const dx = info.worldPos.x - ax;
    const dy = info.worldPos.y - ay;
    const dz = info.worldPos.z - ACTOR_Z;
    const horiz = Math.sqrt(dx * dx + dz * dz);
    if (!(horiz > 1e-3) || !Number.isFinite(dy)) return false;
    let hx = dx / horiz, hz = dz / horiz;
    if (Math.abs(hx) < KEY_SIDE_MIN) {
      hx = (hx < 0 ? -1 : 1) * KEY_SIDE_MIN;
      hz = (hz > 0 ? 1 : -1) * Math.sqrt(1 - hx * hx);
    }
    const elev = M.clamp(Math.atan2(dy, horiz), KEY_ELEV_MIN, KEY_ELEV_MAX);
    const ce = Math.cos(elev);
    keyDir.set(hx * ce, Math.sin(elev), hz * ce).normalize();
    setKeyAxes();
    const t = activeTheme || THEMES.forest;
    dirLight.color.setHex(t.dir);
    if (info.color) {
      keyBodyCol.copy(info.color);
      dirLight.color.lerp(keyBodyCol, KEY_HUE_LEAN);
    }
    keyAim.gain = M.clamp(Number.isFinite(info.intensity) ? info.intensity : 1,
                          KEY_SUN_GAIN_MIN, KEY_SUN_GAIN_MAX);
    keyAim.behind = M.clamp(-keyDir.z / 0.5, 0, 1);
    return true;
  }

  function updateKeyShadow(cx, cy) {
    if (!dirLight.castShadow) {
      dirLight.position.copy(keyDir).multiplyScalar(40);
      dirLight.target.position.set(0, 0, 0);
      return;
    }
    const s = dirLight.shadow;
    /* The visible half-extents at the actor plane, at the widest the dynamic
       zoom can reach, with margin. Quantised to whole units so a zoom ease
       does not change the texel size every frame (that would shimmer too). */
    const dist = camRig.dist * Math.max(camRig.zoom, 1) + 2;
    const hh = Math.tan(camRig.fov * Math.PI / 360) * dist * SHADOW_MARGIN;
    const hw = hh * (DS.C.W / DS.C.H);
    const R = shadowAxisR, U = shadowAxisU;
    const er = Math.ceil(Math.abs(R.x) * hw + Math.abs(R.y) * hh + Math.abs(R.z) * SHADOW_DEPTH);
    const eu = Math.ceil(Math.abs(U.x) * hw + Math.abs(U.y) * hh + Math.abs(U.z) * SHADOW_DEPTH);
    if (er !== shadowExtent.r || eu !== shadowExtent.u) {
      shadowExtent.r = er; shadowExtent.u = eu;
      s.camera.left = -er; s.camera.right = er;
      s.camera.top = eu; s.camera.bottom = -eu;
      s.camera.updateProjectionMatrix();
    }
    const texR = (2 * er) / s.mapSize.x;
    const texU = (2 * eu) / s.mapSize.y;
    shadowFocus.set(cx, cy, ACTOR_Z);
    const fr = shadowFocus.dot(R), fu = shadowFocus.dot(U);
    shadowFocus.addScaledVector(R, Math.round(fr / texR) * texR - fr);
    shadowFocus.addScaledVector(U, Math.round(fu / texU) * texU - fu);
    dirLight.target.position.copy(shadowFocus);
    dirLight.position.copy(shadowFocus).addScaledVector(keyDir, SHADOW_BACKOFF);
  }

  /* Everything solid in a model casts and receives; glows, beams, sprites and
     anything see-through do neither (an additive halo with a shadow is a dark
     disc on the floor). Called once per model, when it is built. */
  function shadowize(root) {
    if (!root) return root;
    root.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.isMeshBasicMaterial || m.transparent || m.blending !== THREE.NormalBlending) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return root;
  }

  /* Props: the same physically based response the voxel models get, so a torch
     pole and the hero standing next to it answer the light the same way. The
     TILES stay Lambert: there are thousands of them and they are lit well
     enough per vertex. */
  function propMat(opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, opts));
  }

  /* A soft screen-edge darkening, parented to the camera so it frames every
     shot. Purely cosmetic: it stops the frame corners from reading as flat
     and gives the scene the same vignetted look the 2D renderer's darkness
     veil gives the sprite view. */
  function buildVignette() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 144;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(128, 66, 40, 128, 72, 150);
    grd.addColorStop(0, 'rgba(5,4,10,0)');
    grd.addColorStop(0.62, 'rgba(5,4,10,0.08)');
    grd.addColorStop(1, 'rgba(5,4,10,0.52)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 144);
    // A little extra weight along the top, like a low dungeon ceiling.
    const top = ctx.createLinearGradient(0, 0, 0, 40);
    top.addColorStop(0, 'rgba(5,4,10,0.35)');
    top.addColorStop(1, 'rgba(5,4,10,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, 256, 40);

    const tex = new THREE.CanvasTexture(cv);
    // Size the frame to exactly overfill the frustum at 2 units out, so the
    // baked gradient maps to the screen edges whatever the aspect is.
    const dist = 2;
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.04;
    const vw = vh * (DS.C.W / DS.C.H) * 1.04;
    const geo = new THREE.PlaneGeometry(vw, vh);
    const m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(0, 0, -dist);
    mesh.renderOrder = 990;
    camera.add(mesh);
    return mesh;
  }

  /* Voxel models share a small material cache, so teardown frees geometry
     only — the materials stay for the next model that wants them. */
  function disposeModel(model) {
    if (!model || !model.root) return;
    model.root.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
    });
    // Flash variants are shared (see flashModel); only the bookkeeping goes.
    model.flash = null;
    if (model.root.parent) model.root.parent.remove(model.root);
  }

  function clearActors() {
    enemyModels.forEach(function (model) { disposeModel(model); });
    enemyModels.clear();
    if (heroModel) { disposeModel(heroModel); heroModel = null; heroArmorKey = ''; }
    heroWeaponMesh = null;
    heroWeaponAura = null;
    heroWeaponRef = null;
    projMeshes.forEach(function (pm) {
      pm.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      if (pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
    });
    projMeshes = [];
    pickupMeshes.forEach(function (pm) {
      pm.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      if (pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
    });
    pickupMeshes = [];
  }

  function resize() {
    if (!renderer || !canvas) return;
    /* One canvas fills the window, and the 16:9 play frame is letterboxed inside
       it (see playViewport). The world is projected at the PLAY FRAME's aspect,
       never the window's: the level, the aiming, the jump arcs and the HUD were
       all authored for 320x180, and a window-shaped projection is what made the
       game and its own UI disagree -- the world stretched to the window while
       the HUD sat in a letterboxed band, so the reticle, the bars and the level
       stopped lining up on anything but an exactly 16:9 screen. */
    const w = window.innerWidth || (DS.C.W * (DS.C.RS || 2));
    const h = window.innerHeight || (DS.C.H * (DS.C.RS || 2));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = DS.C.W / DS.C.H;
    camera.updateProjectionMatrix();
  }

  /* The play frame: the same centred 16:9 rectangle the screen layer draws into
     (ui3/screen.js), so the world and its HUD share one coordinate system.

     x/y/w/h are CSS pixels from the bottom-left, because that is what
     setViewport/setScissor take -- three.js multiplies by the pixel ratio
     itself. (This used to hand it device pixels, which at any ratio other than
     1 put the world at twice the size and off-centre.) dw/dh is the same
     rectangle in device pixels, which is what the post chain's targets need. */
  const pvScratch = { x: 0, y: 0, w: 1, h: 1, dw: 1, dh: 1, cw: 1, ch: 1 };
  function playViewport() {
    const el = renderer.domElement;
    const v = DS.UI3 && DS.UI3.view;
    const pr = renderer.getPixelRatio();
    const cw = el.clientWidth || Math.round(el.width / pr);
    const ch = el.clientHeight || Math.round(el.height / pr);
    const out = pvScratch;
    out.cw = cw; out.ch = ch;
    if (!v) {
      out.x = 0; out.y = 0; out.w = cw; out.h = ch;
    } else {
      out.x = v.x; out.y = ch - (v.y + v.h);
      out.w = Math.max(1, v.w); out.h = Math.max(1, v.h);
    }
    out.dw = Math.max(1, Math.round(out.w * pr));
    out.dh = Math.max(1, Math.round(out.h * pr));
    return out;
  }

  /* Frees a subtree. It has to recurse: the backdrop is a group of groups, and
     disposing only the top level left every backdrop's geometry and materials
     alive for the rest of the session, once per level. */
  function disposeGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if (obj.children && obj.children.length) {
        disposeGroup(obj);
        continue;
      }
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        // Textures are rebuilt per level, so they go with the meshes.
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    }
  }

  function resolveTheme(depth, biome, flavor) {
    /* The trial chamber has to look like a place that wants you dead, not like
       whichever depth it was reached from. */
    if (flavor === 'trial') return 'trial';
    /* The biome ladder comes FIRST. resolveTheme used to key off the art biome,
       which is a separate depth table, so the mood of a floor and the shape of
       a floor were chosen by two different systems that could disagree. */
    if (DS.Difficulty) {
      const rung = DS.Difficulty.biomeForDepth(depth);
      if (rung && rung.theme && THEMES[rung.theme]) return rung.theme;
    }
    if (biome && biome.key) {
      if (biome.key === 'halls') return 'forest';
      if (biome.key === 'caves') return 'caves';
      if (biome.key === 'prison') return 'prison';
      if (biome.key === 'vault') return 'vault';
      if (biome.key === 'nest') return 'nest';
      if (biome.key === 'throne') return 'throne';
    }
    if (flavor === 'flooded') return 'caves';
    if (depth === 1) return 'forest';
    if (depth === 2) return 'caves';
    if (depth === 3) return 'prison';
    if (depth === 4) return 'vault';
    if (depth === 5) return 'nest';
    if (depth === 6) return 'throne';
    return 'forest';
  }

  /* Where a floor's horizon is, in pixels: the median of the level's own
     WALKING surface, sampled across the map.

     The backdrop used to be anchored to the map's bottom row, which is a
     different place on every floor: a 22-tile corridor put the horizon just
     under the eye line and a 44-tile carved floor put it 70 units down, so the
     same theme's horizon moved between rooms and the bands ended up either
     buried or towering. The walking surface is the one line that means the same
     thing everywhere, and the player is standing on it. */
  function horizonRow(map) {
    const rows = [];
    for (let tx = 2; tx < map.w - 2; tx += 3) {
      const g = map.groundBelow(tx);
      if (g < map.pixelH) rows.push(g);
    }
    if (!rows.length) return map.pixelH;
    rows.sort(function (a, b) { return a - b; });
    return rows[rows.length >> 1];
  }

  /* The ground line the horizon is standing on, right now.

     A MEDIAN over a window either side of the player, in the level's own pixels,
     returned in world units. horizonRow() already trusts the median -- but over
     the WHOLE level, which is one line for terrain that moves 6 to 20 tiles, and
     that is what used to hide the horizon on any floor with a hill on it. A
     window keeps the same robustness (a pit is a narrow feature and cannot drag
     the median down) while letting the line follow the ground the player is
     actually on. Columns with no floor at all (a pit, the level's edge) are left
     out rather than counted as the bottom of the world. */
  function localHorizonY(map, px) {
    const t0 = Math.round(px / 16);
    const rows = [];
    for (let t = t0 - 16; t <= t0 + 16; t += 2) {
      if (t < 2 || t > map.w - 3) continue;
      const gy = map.groundBelow(t);
      if (gy < map.pixelH) rows.push(gy);
    }
    if (!rows.length) return null;
    rows.sort(function (a, b) { return a - b; });
    return -rows[rows.length >> 1] * P2U;
  }

  /* Mood + backdrop. Everything big and distant lives here; the walkway
     architecture is built in loadLevel(). */
  function setupTheme(themeName, w, h, biome, anchorY) {
    const t = THEMES[themeName] || THEMES.forest;
    activeTheme = t;
    /* The grade is derived from the same row: shadows lean to the fog's hue,
       highlights to the key's (see DS.PostFX.setTheme). */
    if (DS.PostFX) DS.PostFX.setTheme(t, themeName);

    scene.fog = new THREE.FogExp2(t.fog, FOG_DENSITY);
    ambientLight.color.setHex(t.ambient);
    ambientLight.intensity = AMBIENT_I;
    hemiLight.color.setHex(t.hemiSky);
    hemiLight.groundColor.setHex(t.hemiGround);
    hemiLight.intensity = HEMI_I;
    dirLight.color.setHex(t.dir);
    dirLight.intensity = t.dirI * KEY_GAIN;
    /* Re-aimed from this floor's body a few frames in (see aimKeyAtBody);
       until then, and on a floor with no body, the old overhead key. */
    keyDir.copy(KEY_DEFAULT);
    setKeyAxes();
    keyAim.frame = 0; keyAim.done = false; keyAim.gain = 1; keyAim.behind = 0;

    /* The key from BEHIND. It used to be a fixed dim key at (-12, 18, -26) tinted
       with the hemisphere colour, which kept a monster from matching the wall it
       stood in front of and did nothing else. It is now aimed at -- and tinted by
       -- the theme's own celestial body, so the thing burning in the sky and the
       rim on the stone are the same light, which is what "lit from behind"
       actually looks like. Still exactly ONE lamp: see DS.Backdrop.heroLight,
       and the fixed pool below for why nothing may add a second. */
    if (backLight) {
      const H = DS.Backdrop ? DS.Backdrop.heroLight(themeName, camRig.yaw) : null;
      if (H) {
        backLight.color.setHex(H.col);
        backLight.position.set(H.x, H.y, H.z);
      } else {
        backLight.color.setHex(t.hemiSky);
        backLight.position.set(-12, 18, -26);
      }
      backLight.intensity = 0.42;
    }
    if (fillLight) {
      fillLight.color.setHex(t.ambient);
      fillLight.intensity = 0.18;
    }

    disposeGroup(themeGroup);
    skyRig = null;
    backdropRef = null;
    activeThemeName = themeName;
    /* The line this theme is built around, and where that line starts. render()
       carries it to the ground the player is walking on (see localHorizonY). */
    themeAnchorY = anchorY;
    horizonY = anchorY;
    horizonSettled = false;
    themeGroup.position.y = 0;
    themeGroup.rotation.y = camRig.yaw * 0.85;

    /* The horizon is its own module now (src/core/backdrop3d.js), standing on the
       level's own walking surface. It goes into the same group the old planes
       lived in, so teardown is unchanged; what comes back is the group, the sky
       rig this file pins to the eye line, and the report the QA pass reads. */
    if (DS.Backdrop) {
      backdropRef = DS.Backdrop.build({
        scene: scene, theme: t, p2u: P2U,
        fogCol: t.fog, fogDensity: FOG_DENSITY
      }, themeName, w, h, anchorY);
      if (backdropRef && backdropRef.group) themeGroup.add(backdropRef.group);
      skyRig = backdropRef ? backdropRef.skyRig : null;
    }

    if (screenParticleManager) {
      screenParticleManager.setTheme(themeName, DS.Backdrop.recipe(themeName));
    }
  }

  function createDoorwayMesh() {
    const group = new THREE.Group();

    const stoneMat = propMat({ color: 0x3d384c });
    const archMat = propMat({ color: 0x564d72 });

    const pillarGeo = new THREE.BoxGeometry(0.5, 3.2, 0.65);
    const leftPillar = new THREE.Mesh(pillarGeo, stoneMat);
    leftPillar.position.set(-0.9, 1.6, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, stoneMat);
    rightPillar.position.set(0.9, 1.6, 0);
    group.add(leftPillar);
    group.add(rightPillar);

    const lintelGeo = new THREE.BoxGeometry(2.5, 0.6, 0.75);
    const lintel = new THREE.Mesh(lintelGeo, archMat);
    lintel.position.set(0, 3.2, 0);
    group.add(lintel);

    const keystoneGeo = new THREE.BoxGeometry(0.6, 0.7, 0.85);
    const keystone = new THREE.Mesh(keystoneGeo, archMat);
    keystone.position.set(0, 3.25, 0.05);
    group.add(keystone);

    const stepGeo = new THREE.BoxGeometry(2.3, 0.25, 0.9);
    const step = new THREE.Mesh(stepGeo, stoneMat);
    step.position.set(0, 0.12, 0);
    group.add(step);

    const portalGeo = new THREE.PlaneGeometry(1.5, 2.8);
    const portalMat = new THREE.MeshBasicMaterial({
      map: portalTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(0, 1.6, 0.08);
    group.add(portal);

    const ringGeo = new THREE.RingGeometry(0.35, 0.65, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4ee2ec,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const runeRing = new THREE.Mesh(ringGeo, ringMat);
    runeRing.position.set(0, 1.6, 0.14);
    group.add(runeRing);

    /* No light of its own. A PointLight added per doorway changed the scene's
       light count on every level load, which recompiles every lit material --
       the hitch on entering a floor. The doorway is an EMITTER now, like a
       torch: `light` carries the colour and brightness it wants, and the fixed
       flame pool lights it when it is among the nearest (see assignFlameLights). */
    const pLight = { color: new THREE.Color(0x4ee2ec), intensity: 1.3 };

    return {
      group: group,
      portal: portal,
      ring: runeRing,
      light: pLight
    };
  }

  /* The old torch hung from a bracket that no wall held, so the flame
     floated beside an invisible stem. Rebuilt as a standing braziere pole:
     a base plate, a dark iron pole, a collar, and a cup that catches the
     flame — everything the eye needs to believe in the light it casts.
     Pole height was cut down so the flame sits near the walkway, where
     its light can actually reach the player. */
  function createTorchMesh(x, y) {
    const group = new THREE.Group();

    const iron = propMat({ color: 0x2a2733 });
    const ironLight = propMat({ color: 0x4a4658 });

    // Base plate and three stacked pole segments, each nudged a hair so the
    // pole reads as smith-made rather than extruded.
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.44), iron);
    base.position.y = 0.04;
    group.add(base);
    const segH = 0.34;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.12 - (i % 2) * 0.015, segH, 0.12),
                                 i % 2 ? ironLight : iron);
      seg.position.set((i % 2 ? 0.008 : -0.006), 0.08 + segH * (i + 0.5), 0);
      group.add(seg);
    }

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.2), ironLight);
    collar.position.y = 0.08 + segH * 3 + 0.03;
    group.add(collar);
    // The cup, flaring open to hold the flame.
    const cup = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.26), iron);
    cup.position.y = 0.08 + segH * 3 + 0.14;
    group.add(cup);
    const cupLip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), ironLight);
    cupLip.position.y = 0.08 + segH * 3 + 0.23;
    group.add(cupLip);

    /* The fire is not a sprite any more: it is one instance of the level's
       shader-flame batch (src/core/flame.js), its wick in the cup, plus a soft
       pool of light on the paver under it. Both flicker with the torch's own
       phase, as does its light (see DS.TorchLight.flicker). */
    const wick = 0.08 + segH * 3 + 0.20;
    const phase = Math.random();
    const flameIdx = flameBatch
      ? flameBatch.add(x, y + wick, 0.2, 0.72, 1.32, phase, 0.9 + Math.random() * 0.25) : -1;
    const poolIdx = poolBatch ? poolBatch.add(x, y + 0.012, 0.2, 3.4, 1.7, 0xff8a34, 0.42) : -1;

    /* No light of its own. It registers as an EMITTER: `smooth` is its live
       intensity, and the shared pool lights the most relevant emitters (see
       FLAME_LIGHTS and assignFlameLights). */
    group.position.set(x, y, 0.2);
    propsGroup.add(group);
    return {
      phase: phase,
      flameIdx: flameIdx,
      poolIdx: poolIdx,
      emberOff: Math.floor(phase * 997),
      baseIntensity: TORCH_I,
      flick: 1,
      smooth: TORCH_I,
      lift: wick + 0.3,                // where the fire actually is, in the group
      group: group
    };
  }

  /* A standing brazier. The trial hangs one over every pressure plate, so its
     flame is the progress bar for the whole hall — and until this existed, the
     hall had no lights at all in voxel mode and read as an empty corridor.
     Built here rather than in voxel.js because it needs its own flame sprite
     and point light, exactly like a wall torch. */
  function createBrazierMesh(b, map) {
    const group = new THREE.Group();
    const iron = propMat({ color: 0x55506a });
    const ironLight = propMat({ color: 0x8a84a8 });
    const coalMat = propMat({ color: 0x2a1a18 });

    part(group, 0.34, 0.1, 0.34, 0, 0.05, 0, iron);         // foot
    part(group, 0.12, 1.0, 0.12, 0, 0.6, 0, iron);          // post
    part(group, 0.22, 0.08, 0.22, 0, 1.1, 0, ironLight);    // collar
    part(group, 0.52, 0.26, 0.52, 0, 1.24, 0, iron);        // bowl
    part(group, 0.6, 0.06, 0.6, 0, 1.39, 0, ironLight);     // lip
    part(group, 0.42, 0.07, 0.42, 0, 1.4, 0, coalMat);      // coals

    // b.y marks the top of an 18px-tall brazier, so its floor line is y + 18.
    const bottom = (b.y || 0) + 18;
    const floor = groundAnchor(map, b.x, bottom);
    group.position.set(b.x * P2U, -floor * P2U, 0.2);
    propsGroup.add(group);
    /* The same shader flame as a torch, hidden (size 0) until the brazier is
       lit; syncPuzzles grows it with the brazier's own ramp. */
    const phase = Math.random();
    const flameIdx = flameBatch
      ? flameBatch.add(b.x * P2U, -floor * P2U + 1.40, 0.2, 0, 0, phase, 1.05) : -1;
    const poolIdx = poolBatch
      ? poolBatch.add(b.x * P2U, -floor * P2U + 0.012, 0.2, 3.8, 1.8, 0xff8a34, 0.5) : -1;
    if (poolIdx >= 0) poolBatch.setLevel(poolIdx, 0);
    return { group, flameIdx, poolIdx, phase, coalMat, ref: b, smooth: 0, lift: 1.75 };
  }

  // --- puzzle hardware in 3D: gate bars, lever, crates -----------------------
  function part(parent, sx, sy, sz, x, y, z, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /* A bar between two points, in the LOCAL space of the parent. Used for the
     anchor arms below: a rope has to be tied to something, and the something is
     usually beside it rather than above it. */
  function beamBetween(parent, x1, y1, x2, y2, w, material) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, w), material);
    m.position.set((x1 + x2) * 0.5, (y1 + y2) * 0.5, 0.02);
    m.rotation.z = Math.atan2(dy, dx);
    parent.add(m);
    return m;
  }

  /* Where does a hanging thing hang FROM?

     Ropes and ladders are placed by the generator against a FACE -- the rope
     down a cliff, the ladder up a stack of ledges -- so there is usually
     nothing directly above them, which is exactly why they read as floating.
     The physical answer is a piton in the nearest solid thing: straight up
     first, then the faces beside the head, then a couple of rows down beside
     it. Returns the tile it bit into, or null when the prop truly stands in
     open air -- which is a level-design error to report, not to decorate. */
  function anchorFor(map, tx, ty) {
    const solidAt = function (x, y) {
      if (x < 1 || y < 1 || x >= map.w - 1 || y >= map.h - 1) return false;
      return map.isSolid(x, y) || map.isPlatform(x, y);
    };
    if (solidAt(tx, ty - 1)) return { x: tx, y: ty - 1, kind: 'above' };
    for (let d = 1; d <= 3; d++) {
      if (solidAt(tx - d, ty)) return { x: tx - d, y: ty, kind: 'side' };
      if (solidAt(tx + d, ty)) return { x: tx + d, y: ty, kind: 'side' };
    }
    for (let dy = 1; dy <= 3; dy++) {
      for (let d = 0; d <= 3; d++) {
        if (d === 0) {
          if (solidAt(tx, ty + dy)) return { x: tx, y: ty + dy, kind: 'below' };
          continue;
        }
        if (solidAt(tx - d, ty + dy)) return { x: tx - d, y: ty + dy, kind: 'below' };
        if (solidAt(tx + d, ty + dy)) return { x: tx + d, y: ty + dy, kind: 'below' };
      }
    }
    return null;
  }

  /* The hardware: a piton buried in the solid tile, and an arm from it to the
     head of the strand, so the two read as one piece of rigging. Drawn in WORLD
     units (the caller passes world coordinates), so the arm lands where the
     anchor actually is rather than in the rope group's local space. */
  function hangHardware(map, tileX, tileY, headX, headY, armMat, pitonMat) {
    const a = anchorFor(map, tileX, tileY);
    if (!a) return null;
    const ax = (a.x * 16 + 8) * P2U;
    const ay = -(a.y * 16 + 8) * P2U;
    const group = new THREE.Group();
    const dir = (headX === ax) ? (tileX >= a.x ? 1 : -1) : Math.sign(headX - ax) || 1;
    part(group, 0.18, 0.18, 0.18, ax + dir * 0.55, ay, 0.06, pitonMat);
    beamBetween(group, ax + dir * 0.55, ay, headX, headY, 0.075, armMat);
    propsGroup.add(group);
    return a;
  }

  function createGateMesh(gate) {
    const group = new THREE.Group();
    const barMat = propMat({ color: 0x6f6a90 });
    const barDark = propMat({ color: 0x3a3654 });
    const uW = Math.max(0.5, gate.w * P2U);
    const uH = Math.max(0.8, gate.h * P2U);
    const bars = Math.max(3, Math.round(uW / 0.28));
    for (let i = 0; i < bars; i++) {
      const bx = -uW / 2 + (i + 0.5) * (uW / bars);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.09, uH, 0.09), barMat);
      bar.position.set(bx, 0, 0);
      group.add(bar);
    }
    // Two cross rails so it reads as forged, not extruded.
    for (let r = 0; r < 2; r++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(uW, 0.08, 0.12), barDark);
      rail.position.set(0, (r === 0 ? 0.32 : -0.32) * uH, 0);
      group.add(rail);
    }
    // Spiked foot edge.
    for (let i = 0; i < bars; i++) {
      const bx = -uW / 2 + (i + 0.5) * (uW / bars);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), barDark);
      spike.position.set(bx, -uH / 2 - 0.06, 0);
      spike.rotation.x = Math.PI;
      group.add(spike);
    }
    propsGroup.add(group);
    return { group, gate, kind: 'gate' };
  }

  function createLeverMesh(lever, map) {
    const group = new THREE.Group();
    const baseMat = propMat({ color: 0x3a3654 });
    const stickMat = propMat({ color: 0x8a6340 });
    part(group, 0.42, 0.12, 0.42, 0, 0.06, 0, baseMat);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.12, 0);
    group.add(pivot);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), stickMat);
    stick.position.y = 0.31;
    pivot.add(stick);
    const knobMat = propMat({ color: 0xc0303c });
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), knobMat);
    knob.position.y = 0.66;
    pivot.add(knob);
    // Anchor on the lever's floor through the shared helper: the marker row is
    // not a surface, and guessing at it left the base buried and the stick
    // floating whenever the lever's column had a ledge or a pit in it.
    const lFloor = map && map.floorBelow
      ? snapToFloor(map, lever.x + 8, lever.y)
      : lever.y + 16;
    group.position.set(lever.x * P2U + 0.4, -lFloor * P2U, 0.2);
    propsGroup.add(group);
    return { group, pivot, knob, knobMat, lever, kind: 'lever' };
  }

  function createCrateMesh(crate) {
    const group = new THREE.Group();
    const uS = Math.max(0.6, crate.w * P2U);
    const wood = propMat({ color: 0x8a6340 });
    const woodDark = propMat({ color: 0x5c3f2a });
    part(group, uS, uS, uS, 0, uS / 2, 0, wood);
    // Frame edges + a cross plank per face reads as a shipping crate.
    for (let i = -1; i <= 1; i += 2) {
      part(group, uS + 0.02, 0.07, uS + 0.02, 0, uS / 2 + i * (uS / 2 - 0.035), 0, woodDark);
      part(group, 0.07, uS + 0.02, uS + 0.02, i * (uS / 2 - 0.035), uS / 2, 0, woodDark);
    }
    part(group, 0.1, uS, 0.06, 0, uS / 2, uS / 2 + 0.01, woodDark);
    propsGroup.add(group);
    return { group, crate, kind: 'crate' };
  }

  /* A pressure plate that reads as hardware from the camera's shallow angle:
     a proud bezel frame, a raised button slab, corner posts, and the rune
     sigil floating upright facing the player instead of lying flat unseen. */
  function createPressurePlateMesh(px, py, map) {
    const group = new THREE.Group();

    const frameMat = propMat({ color: 0x2c2838 });
    const rimMat = propMat({ color: 0x6f6a90 });
    const slabMat = propMat({ color: 0x8a84a8 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.7), frameMat);
    frame.position.y = 0.08;
    group.add(frame);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), slabMat);
    slab.position.set(0, 0.3, 0);
    group.add(slab);

    const postOffsets = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
    for (let i = 0; i < postOffsets.length; i++) {
      part(group, 0.16, 0.3, 0.16, postOffsets[i][0], 0.15, postOffsets[i][1], rimMat);
    }

    const runeGeo = new THREE.PlaneGeometry(0.7, 0.7);
    const runeMat = new THREE.MeshBasicMaterial({
      map: runeTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const rune = new THREE.Mesh(runeGeo, runeMat);
    rune.position.set(0, 0.65, 0.2);   // upright, between the posts, facing play
    group.add(rune);

    /* py is the plate's OWN bottom edge (a plate is 4px tall and rests on the
       surface). Anchoring through the map keeps it honest instead of adding a
       magic tile: the old +16 planted the hardware a full tile underground. */
    const floor = map ? groundAnchor(map, px, py) : py;
    group.position.set(px * P2U, -floor * P2U, 0);
    propsGroup.add(group);

    return {
      group: group,
      slab: slab,
      rune: rune,
      px: px,
      py: py,
      currentY: 0.3,
      targetY: 0.3,
      emissiveIntensity: 0.2
    };
  }

  /* --- prop anchoring: ONE source of truth ----------------------------------

     Two marker conventions live in the game data: entities whose own box
     carries a bottom edge (crate, chest, pickup - y + h), and map markers whose
     y is only a TILE ROW (decor, shrine, lever, torch, brazier). Every
     clip-through-the-floor bug AND every floating prop so far came from one
     call site guessing instead of asking, so there are exactly three questions
     a prop may ask, and nothing else in this file may compute a floor itself:

       floorAt(map, px, py)         -> the surface under a point, or null
       snapToFloor(map, px, marker) -> where a MARKER prop's footprint belongs
       groundAnchor(map, px, bottom)-> where a BOX prop's own bottom belongs

     Marker props have no box to trust, so they snap to the floor under them
     unconditionally. Box props keep their own bottom unless the floor is right
     there - a crate may be standing on another crate. */
  function floorAt(map, px, py) {
    if (!map || !map.floorBelow) return null;
    const tx = Math.floor(px / 16);
    const ty = Math.floor((py - 1) / 16);
    const fb = map.floorBelow(tx, ty);
    if (fb == null || fb >= map.pixelH) return null;
    return fb;
  }

  function groundAnchor(map, px, bottomPx) {
    const fb = floorAt(map, px, bottomPx);
    if (fb == null) return bottomPx;
    /* Snap only when the surface is right there: a prop placed on a ledge or a
       crate must not be dragged down through what it is standing on. */
    return Math.abs(fb - bottomPx) <= 20 ? fb : bottomPx;
  }

  /* Marker props: the marker's y is a tile row, never a surface, so the only
     correct answer is the floor under the marker column. */
  function snapToFloor(map, px, markerPx) {
    const fb = floorAt(map, px, markerPx + 8);
    return fb == null ? markerPx : fb;
  }

  /* Chests: one voxel model per tier (see voxel.js buildChest), planted on the
     actual floor.

     The old anchor was cy + 16, but a chest's floor line is its own box bottom
     — cy + h = cy + 11.5 for the 14x11.5 sprite — so EVERY chest sat about
     half a world unit below the walkway, buried to its lid. The anchor is now
     the box bottom confirmed against the map surface. */
  function createChestMesh(cx, cy, chestRef, map) {
    const model = (DS.Voxel && DS.Voxel.build)
      ? DS.Voxel.build('chest', { tier: chestRef && chestRef.tier })
      : null;
    const group = shadowize(model ? model.root : new THREE.Group());

    // Fallback so chests still exist if the voxel layer ever goes away.
    let lidGroup = model && model.lid;
    if (!model) {
      const woodMat = propMat({ color: 0x5c3d26 });
      const trimMat = propMat({ color: 0xd4a046 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.85), woodMat);
      base.position.set(0, 0.3, 0);
      group.add(base);
      lidGroup = new THREE.Group();
      lidGroup.position.set(0, 0.6, -0.42);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.4, 0.88), woodMat);
      lid.position.set(0, 0.2, 0.44);
      lidGroup.add(lid);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.42, 0.18), trimMat);
      band.position.set(0, 0.2, 0.16);
      lidGroup.add(band);
      group.add(lidGroup);
    }

    const beamGeo = new THREE.CylinderGeometry(0.3, 0.7, 4.0, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffea77,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 2.2, 0);
    group.add(beam);

    const bottom = cy + ((chestRef && chestRef.h) || 11);
    const floor = groundAnchor(map, cx + 8, bottom);
    group.position.set((cx + 8) * P2U, -floor * P2U, 0.05);
    propsGroup.add(group);

    return {
      group: group,
      lidGroup: lidGroup,
      beam: beam,
      ref: chestRef,
      openAngle: 0
    };
  }

  // --- 3D Traps & Hazards System ---
  function createFloorSpikesMesh(ux, uy) {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(1.5, 0.12, 1.4);
    const baseMat = propMat({ color: 0x24202c });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.06, 0);
    group.add(base);

    const coneGeo = new THREE.ConeGeometry(0.18, 0.72, 4);
    const coneMat = propMat({ color: 0xc8c3d8 });
    const offsets = [[-0.4, -0.3], [0.4, -0.3], [-0.2, 0.3], [0.3, 0.2]];
    offsets.forEach(([ox, oz]) => {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(ox, 0.42, oz);
      cone.rotation.y = Math.PI / 4;
      group.add(cone);
    });

    group.position.set(ux, uy - (TILE_SIZE * 0.5), 0.1);
    return group;
  }

  function createDeathSpikesMesh(ux, uy) {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(1.5, 0.16, 1.4);
    const baseMat = propMat({ color: 0x1a060a });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.08, 0);
    group.add(base);

    const spikeGeo = new THREE.ConeGeometry(0.24, 1.28, 5);
    const spikeMat = propMat({ color: 0x6e1b24, emissive: 0x3d0a10, emissiveIntensity: 0.45 });

    const offsets = [[-0.45, -0.2], [0.0, 0.22], [0.45, -0.15]];
    offsets.forEach(([ox, oz]) => {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(ox, 0.72, oz);
      group.add(spike);
    });

    group.position.set(ux, uy - (TILE_SIZE * 0.5), 0.12);
    return group;
  }

  function createMovingPlatformMesh(w) {
    const group = new THREE.Group();
    const uW = w * P2U;
    const slabGeo = new THREE.BoxGeometry(uW, 0.34, 1.25);
    const slabMat = propMat({ color: 0x7a5634 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.17, 0);
    group.add(slab);

    const chainGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6);
    const chainMat = propMat({ color: 0x484256 });
    const leftChain = new THREE.Mesh(chainGeo, chainMat);
    const rightChain = new THREE.Mesh(chainGeo, chainMat);
    leftChain.position.set(-uW * 0.4, 0, -0.1);
    rightChain.position.set(uW * 0.4, 0, -0.1);
    group.add(leftChain);
    group.add(rightChain);

    propsGroup.add(group);
    return { group, slab, leftChain, rightChain, kind: 'platform' };
  }

  function createSpikedBallMesh() {
    const group = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(0.55, 8, 8);
    const ballMat = propMat({ color: 0x3e3a4e });
    const sphere = new THREE.Mesh(sphereGeo, ballMat);
    group.add(sphere);

    const spikeGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
    const spikeMat = propMat({ color: 0xd0cce0 });
    const dirs = [
      [1,0,0], [-1,0,0], [0,1,0], [0,-1,0],
      [0.7,0.7,0], [-0.7,0.7,0], [0.7,-0.7,0], [-0.7,-0.7,0],
      [0,0,1], [0,0,-1]
    ];
    dirs.forEach(([dx, dy, dz]) => {
      const sp = new THREE.Mesh(spikeGeo, spikeMat);
      sp.position.set(dx * 0.52, dy * 0.52, dz * 0.52);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
      group.add(sp);
    });

    const chainGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6);
    const chainMat = propMat({ color: 0x484256 });
    const chain = new THREE.Mesh(chainGeo, chainMat);
    group.add(chain);

    propsGroup.add(group);
    return { group, sphere, chain, kind: 'ball' };
  }

  function createSawMesh() {
    const group = new THREE.Group();
    const diskGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.08, 16);
    const sawMat = propMat({ color: 0xa8a4be });
    const disk = new THREE.Mesh(diskGeo, sawMat);
    disk.rotation.x = Math.PI / 2;
    group.add(disk);

    // Hub cap
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8);
    const hubMat = propMat({ color: 0x3d394e });
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);

    // Teeth
    const toothGeo = new THREE.ConeGeometry(0.12, 0.28, 3);
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, sawMat);
      tooth.position.set(Math.cos(angle) * 0.68, Math.sin(angle) * 0.68, 0);
      tooth.rotation.z = angle - Math.PI / 2 + 0.3;
      group.add(tooth);
    }

    propsGroup.add(group);
    return { group, disk, kind: 'saw' };
  }

  function createCrumbleMesh(w) {
    const group = new THREE.Group();
    const uW = w * P2U;
    const slabGeo = new THREE.BoxGeometry(uW, 0.32, 1.2);
    const slabMat = propMat({ color: 0x6e5239 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.16, 0);
    group.add(slab);

    propsGroup.add(group);
    return { group, slab, kind: 'crumble' };
  }

  function loadLevel(map, biome, g) {
    waterSurfaceMesh = null;
    waterCrestMesh = null;
    if (!enabled || !dungeonGroup) return;

    disposeGroup(dungeonGroup);
    disposeGroup(propsGroup);
    disposeGroup(themeGroup);

    clearActors();
    gateMeshes = [];
    leverMeshes = [];
    brazierMeshes = [];
    crateMeshes = [];
    ropeMeshes = [];
    ladderMeshes = [];
    clearElemRigs();
    elemBolts.forEach(function (eb) { if (eb.mesh.parent) eb.mesh.parent.remove(eb.mesh); });
    elemBolts = [];
    /* Pooled FX go back to their pools rather than to the garbage collector. */
    releasePooledFx();
    shrineMesh = null;
    /* Detached properly (parent cleared), not by truncating the children array:
       a truncated child kept `parent === fxGroup`, so a pooled element rig
       reacquired on the next floor believed it was still in the scene and was
       never drawn again. */
    if (fxGroup) while (fxGroup.children.length) fxGroup.remove(fxGroup.children[0]);

    torchLights = [];   // the pool they point at outlives the level, by design

    /* The fire batches are refilled from nothing; the pool forgets its
       owners (they were this floor's emitters); the light map is rebuilt. */
    if (flameBatch) flameBatch.mesh.count = 0;
    if (poolBatch) poolBatch.mesh.count = 0;
    if (lightPool && DS.TorchLight) DS.TorchLight.clearPool(lightPool);
    emitters = [];
    emittersDirty = true;

    hazardMeshes.forEach(hm => {
      if (hm.group && hm.group.parent) hm.group.parent.remove(hm.group);
    });
    hazardMeshes = [];

    spikeMeshes.forEach(sm => {
      if (sm.parent) sm.parent.remove(sm);
    });
    spikeMeshes = [];

    chestMeshes = [];
    plateMeshes = [];
    doorPortalObj = null;

    if (!map) return;

    const w = map.w, h = map.h;
    const depth = (g && g.depth) || 1;
    /* Every level's theme keys off the flavor the level builder wrote; the
       trial writes 'trial' and must not be mistaken for a normal floor. */
    const flavor = (g && g.flavor) || '';
    const themeName = resolveTheme(depth, biome, flavor);

    setupTheme(themeName, w, h, biome, -horizonRow(map) * P2U);

    const wallTex = makeWallTexture(biome);
    const floorTex = makeFloorTexture(biome);
    const platTex = makePlatformTexture(biome);

    const wallFrontMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const wallTopMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const platMat = new THREE.MeshLambertMaterial({ map: platTex });
    /* Every torch lights the stone around it through these three materials
       (the light map is built once the torches are placed; see
       buildTorchMap). */
    if (torchMapUniforms) {
      DS.Flame.lightMapPatch(wallFrontMat, torchMapUniforms);
      DS.Flame.lightMapPatch(wallTopMat, torchMapUniforms);
      DS.Flame.lightMapPatch(platMat, torchMapUniforms);
    }

    const wallMats = [
      wallFrontMat, wallFrontMat,
      wallTopMat, wallFrontMat,
      wallFrontMat, wallFrontMat
    ];

    // Thin slabs: clearly 3D from the tilt, without jutting into the play area.
    const blockGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, 0.9);
    const platGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE * 0.35, 0.7);

    let wallCount = 0, platCount = 0, paverCount = 0;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = map.get(tx, ty);
        if (t === 1) {
          wallCount++;
          if (map.get(tx, ty - 1) !== 1) paverCount++;
        } else if (t === 2) {
          platCount++;
        }
      }
    }

    const wallMesh = new THREE.InstancedMesh(blockGeo, wallMats, wallCount);
    const platMesh = new THREE.InstancedMesh(platGeo, platMat, platCount);

    const paverGeo = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.32, 1.8);
    const paverMesh = new THREE.InstancedMesh(paverGeo, wallTopMat, paverCount);

    const dummy = new THREE.Object3D();
    let wi = 0, pi = 0, pvi = 0;

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = map.get(tx, ty);
        const ux = (tx * 16 + 8) * P2U;
        const uy = -(ty * 16 + 8) * P2U;

        if (t === 1) {
          dummy.position.set(ux, uy, -0.3);
          dummy.updateMatrix();
          wallMesh.setMatrixAt(wi++, dummy.matrix);

          if (map.get(tx, ty - 1) !== 1) {
            dummy.position.set(ux, uy + (TILE_SIZE * 0.5 - 0.16), 0.18);
            dummy.updateMatrix();
            paverMesh.setMatrixAt(pvi++, dummy.matrix);
          }
        } else if (t === 2) {
          dummy.position.set(ux, uy + (5 * P2U), -0.15);
          dummy.updateMatrix();
          platMesh.setMatrixAt(pi++, dummy.matrix);
        } else if (t === 3) {
          const sm = createFloorSpikesMesh(ux, uy);
          propsGroup.add(sm);
          spikeMeshes.push(sm);
        } else if (t === 5) {
          const dm = createDeathSpikesMesh(ux, uy);
          propsGroup.add(dm);
          spikeMeshes.push(dm);
        }
      }
    }

    wallMesh.instanceMatrix.needsUpdate = true;
    platMesh.instanceMatrix.needsUpdate = true;
    paverMesh.instanceMatrix.needsUpdate = true;
    /* The level casts everywhere and receives where things STAND: the paver
       caps and the platforms take the actors' shadows and an overhang's, three
       instanced draws in the shadow pass whatever the size of the floor. The
       wall FACES do not receive. The paver juts almost a unit in front of them,
       so under a key that is mostly overhead its lip threw a shadow two tiles
       down every wall front (the whole level went dark), and every actor's
       shadow that missed the paver landed on the face below it as a smudge. */
    wallMesh.castShadow = true;
    platMesh.castShadow = platMesh.receiveShadow = true;
    paverMesh.castShadow = paverMesh.receiveShadow = true;
    dungeonGroup.add(wallMesh);
    dungeonGroup.add(platMesh);
    dungeonGroup.add(paverMesh);

    // Exit doorway portal.
    let doorTileX = -1, doorTileY = -1;
    if (g && g.doorPos) {
      doorTileX = Math.floor(g.doorPos.x / 16);
      doorTileY = Math.floor(g.doorPos.y / 16);
    } else {
      for (let ty = 0; ty < h; ty++) {
        for (let tx = 0; tx < w; tx++) {
          if (map.get(tx, ty) === 4) {
            doorTileX = tx;
            doorTileY = ty;
            break;
          }
        }
        if (doorTileX >= 0) break;
      }
    }

    if (doorTileX >= 0) {
      doorPortalObj = createDoorwayMesh();
      const dx = (doorTileX * 16 + 8) * P2U;
      const dy = -((doorTileY + 2) * 16) * P2U;
      doorPortalObj.group.position.set(dx, dy, 0.1);
      propsGroup.add(doorPortalObj.group);
    }

    if (map.decor) {
      for (let i = 0; i < map.decor.length; i++) {
        const d = map.decor[i];
        if (d.kind === 'torch' || d.kind === 'candle') {
          const lx = (d.x + 8) * P2U;
          // Plant the pole on the floor below its decor marker through the
          // shared helper: markers carry their sprite-height offset, and both
          // of the old guesses (floorBelow here, groundBelow there) disagreed.
          const floorPx = snapToFloor(map, d.x + 8, d.y);
          const torchObj = createTorchMesh(lx, -floorPx * P2U);
          torchObj.px = d.x + 8;
          torchObj.floorPx = floorPx;
          torchLights.push(torchObj);
        } else if (DS.Voxel && (d.kind === 'merchant' || d.kind === 'table')) {
          // NPCs and furniture: blocky models, so the safe room reads 3D too.
          // decor y marks the sprite top (floor minus sprite height); plant
          // the model on the floor instead so nothing hovers.
          const model = DS.Voxel.build(d.kind, {});
          if (model) {
            const mFloor = snapToFloor(map, d.x + 8, d.y);
            model.root.position.set((d.x + 8) * P2U, -mFloor * P2U, 0.3);
            actorGroup.add(shadowize(model.root));
            if (d.kind === 'merchant') d.vox3d = model;
          }
        }
      }
    }

    if (g && g.puzzles) {
      for (let i = 0; i < g.puzzles.length; i++) {
        const pz = g.puzzles[i];
        if (pz.kind === 'plate') {
          // The coords live on pz.plate, not on the puzzle itself — using
          // pz.x produced NaN and the plate never appeared anywhere.
          const plateObj = createPressurePlateMesh(pz.plate.x + 8, pz.plate.y + 4, map);
          plateObj.ref = pz;
          plateMeshes.push(plateObj);
        }
        /* The trial's hall is a SET of plates that all have to be held at once.
           It is a different puzzle kind from a vault plate, and because only
           'plate' was known here the whole hall — hardware, braziers and all —
           was invisible in voxel mode. That is why "the gods hate you" looked
           like an empty corridor with no puzzle in it. */
        if (pz.kind === 'plateset' && pz.plates) {
          for (let j = 0; j < pz.plates.length; j++) {
            const pl = pz.plates[j];
            const plateObj = createPressurePlateMesh(pl.x + 8, pl.y + 4, map);
            plateObj.ref = pl;          // pl.pressed is the live held state
            plateMeshes.push(plateObj);
          }
        }
        /* Braziers belong to more than the trial: a barrier can be opened by
           lighting them (and the Torch Hall's beacons stand on the barrier
           wall), so any puzzle that carries them gets their meshes. */
        if (pz.braziers) {
          for (let j = 0; j < pz.braziers.length; j++) {
            brazierMeshes.push(createBrazierMesh(pz.braziers[j], map));
          }
        }
        if (pz.gate) gateMeshes.push(createGateMesh(pz.gate));
        if (pz.lever) leverMeshes.push(createLeverMesh(pz.lever, map));
      }
    }

    if (g && g.crates) {
      for (let i = 0; i < g.crates.length; i++) {
        crateMeshes.push(createCrateMesh(g.crates[i]));
      }
    }

    buildTorchMap(map);

    if (g && g.shrine && DS.Voxel) {
      shrineMesh = DS.Voxel.build('shrine', {});
      // Sit on the real floor under the shrine marker (marker y is a tile row,
      // not a surface) so the plinth never floats or drowns.
      const sFloor = snapToFloor(g.map, g.shrine.x + 8, g.shrine.y);
      shrineMesh.root.position.set((g.shrine.x + 8) * P2U, -sFloor * P2U, 0.12);
      actorGroup.add(shadowize(shrineMesh.root));
    }

    if (g && g.chests) {
      for (let i = 0; i < g.chests.length; i++) {
        const c = g.chests[i];
        const chestObj = createChestMesh(c.x, c.y, c, map);
        chestMeshes.push(chestObj);
      }
    }

    /* WATER, as a volume instead of a decal.

       It used to be a flat per-tile rect painted on the 2D overlay — and since
       the 2D canvas sits ON TOP of the WebGL one, that tint was drawn over
       whatever was living in the water. A piranha was not obscured by water, it
       was hidden by it. Real translucent boxes in the depth-sorted scene tint
       what is inside them and nothing else, so the fish reads through the water
       the way it should. */
    if (map.isWater && map.hasWater) {
      /* Water has to LIGHT ITSELF here. The dungeon is deliberately dark, and a
         Lambert body at a third opacity over a black backdrop is
         indistinguishable from no water at all — the pool has to be visible the
         way the torches are, so it gets its own emissive lift and an unlit
         surface. */
      const bodyMat = new THREE.MeshLambertMaterial({
        color: 0x3f8fc8, emissive: 0x0d2a44, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.42, depthWrite: false
      });
      const surfMat = new THREE.MeshBasicMaterial({
        color: 0x9fdcff, transparent: true, opacity: 0.55, depthWrite: false
      });
      const crestMat = new THREE.MeshBasicMaterial({
        color: 0xe8f6ff, transparent: true, opacity: 0.85, depthWrite: false
      });
      const bodies = [], surfaces = [], crests = [];
      for (let tx = 0; tx < w; tx++) {
        let ty = 0;
        while (ty < h) {
          if (!map.isWater(tx, ty)) { ty++; continue; }
          const top = ty;
          while (ty < h && map.isWater(tx, ty)) ty++;
          const bot = ty - 1;
          const cx = (tx * 16 + 8) * P2U;
          const depth = (bot - top + 1) * TILE_SIZE;
          bodies.push([cx, -((top + bot + 1) * 0.5 * 16) * P2U, -0.2,
                       TILE_SIZE, depth, 1.6]);
          surfaces.push([cx, -(top * 16) * P2U - 0.02, 0.25, TILE_SIZE, 0.12, 1.9]);
          crests.push([cx, -(top * 16) * P2U + 0.06, 0.3, TILE_SIZE, 0.05, 1.95]);
        }
      }
      if (bodies.length) {
        const m = DS.Backdrop.instancedBoxes(bodies, bodyMat);
        m.renderOrder = 2;
        dungeonGroup.add(m);
      }
      if (surfaces.length) {
        const m = DS.Backdrop.instancedBoxes(surfaces, surfMat);
        m.renderOrder = 3;
        waterSurfaceMesh = m;
        dungeonGroup.add(m);
      }
      if (crests.length) {
        const m = DS.Backdrop.instancedBoxes(crests, crestMat);
        m.renderOrder = 4;
        waterCrestMesh = m;
        dungeonGroup.add(m);
      }
    }

    /* Ropes as real 3D geometry: one knotted strand per run of rope tiles.
       The mountain shafts live or die by these reading as climbable lines.

       A strand HANGS. It used to start at the boundary of its topmost rope
       tile, which is 1.02 units below the underside of a wooden platform --
       the plank slab only fills the top part of its own tile -- so every rope
       under a platform began in mid-air with a visible gap to the thing it was
       supposed to be tied to. The strand now runs up to whatever is above it,
       and it says what that was, so a QA pass can check the claim. */
    if (map.isRope) {
      const ropeMat = propMat({ color: 0xa87848 });
      const ropeDark = propMat({ color: 0x5c3f2a });
      let ty = 0;
      while (ty < h) {
        let tx = 0;
        while (tx < w) {
          if (map.isRope(tx, ty) && !map.isRope(tx, ty - 1) && !map.isRope(tx - 1, ty)) {
            // Walk right to find the strand width, then down for its length.
            let x1 = tx;
            while (map.isRope(x1 + 1, ty)) x1++;
            let y1 = ty;
            while (map.isRope(tx, y1 + 1)) y1++;
            const uW = (x1 - tx + 1) * TILE_SIZE;
            const tileTop = -(ty * 16) * P2U;
            const above = map.get(tx, ty - 1);
            const hang = above === 2 ? PLATFORM_UNDER : 0;
            const uH = (y1 - ty + 1) * TILE_SIZE + hang;
            const group = new THREE.Group();
            const cx = ((tx + x1 + 1) * 0.5 * 16) * P2U;
            // Strand: a vertical box column per tile-wide rope.
            const strandW = Math.min(uW, 0.14);
            part(group, strandW, uH, strandW, 0, 0, 0, ropeDark);
            // Inner lit core slightly forward so the braid reads in fog.
            part(group, strandW * 0.5, uH * 0.96, strandW * 0.5, 0, 0, strandW * 0.45, ropeMat);
            // Knots every tile, measured down from the strand's own top.
            for (let ky = 0; ky < y1 - ty + 1; ky++) {
              part(group, strandW * 2.2, 0.09, strandW * 2.2, 0,
                   uH * 0.5 - (ky + 0.5) * TILE_SIZE - hang, 0, ropeMat);
            }
            // The knot it is tied off with, at the very top of the strand.
            part(group, 0.4, 0.14, 0.4, 0, uH * 0.5 - 0.07, 0, ropeDark);
            group.position.set(cx, tileTop + hang - uH * 0.5, 0.25);
            const headY = tileTop + hang;
            /* One anchoring rule for every hanging prop: a piton in the nearest
               solid face and an arm from it to the strand's head, with the tile
               it bit into recorded on the group so a QA pass can check the
               claim against the map instead of trusting this code. */
            const anchor = hangHardware(map, tx, ty, cx, headY, ropeDark, ropeMat);
            group.userData.hangTop = headY;
            group.userData.hangKind = 'rope';
            group.userData.hangOn = anchor ? anchor.kind : 'none';
            group.userData.anchorTile = anchor ? [anchor.x, anchor.y] : null;
            propsGroup.add(group);
            ropeMeshes.push({ group: group, x: tx, y0: ty, y1: y1 });
            tx = x1 + 1;
          } else {
            tx++;
          }
        }
        ty++;
      }
    }

    /* Ladders. A climb in this game is not a column of stacked slabs -- it is a
       RUNG GROUP: two or more platform tiles placed two rows apart in the same
       columns, repeated down a face. `systems/reach.js` builds every climb that
       way (CLIMB_STEP = 2) and the parkour generator copies the shape; measured
       over the ten floors there are 66 groups and every one of them is 2-3
       rungs spaced exactly two rows, 1-4 tiles wide. Bare, a group reads as
       planks hovering in the air -- which is the report this answers. Dressed,
       it is the way up.

       It has to be detected by SHAPE rather than by adjacency: two rows apart
       means the tiles never touch, so a "vertical run" test finds nothing at
       all and the whole dungeon comes out with zero ladders. */
    if (map.get) {
      const railMat = propMat({ color: 0x9a7444 });
      const railDark = propMat({ color: 0x5b452c });
      const platAt = function (tx, ty) {
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) return 0;
        return map.get(tx, ty);
      };
      for (let ty = 1; ty < h - 2; ty++) {
        let tx = 1;
        while (tx < w - 1) {
          if (platAt(tx, ty) !== 2) { tx++; continue; }
          let x1 = tx;
          while (x1 + 1 < w - 1 && platAt(x1 + 1, ty) === 2) x1++;

          /* Only the top rung of a group builds a ladder, and only when no rung
             of a wider climb already covers these columns. The check has to
             look TWO rows up, not one: rungs are two rows apart, so a row test
             finds the empty gap between them and every rung of every climb
             builds its own shorter ladder over the one above it. Measured at
             depth 10 that is 13 climbs becoming 31 overlapping ladders. */
          let continues = false;
          for (let x = tx; x <= x1 && !continues; x++) {
            continues = platAt(x, ty - 1) === 2 || platAt(x, ty - 2) === 2;
          }

          if (!continues) {
            const rows = [ty];
            let row = ty;
            while (true) {
              let next = -1;
              for (let step = 1; step <= 2 && next < 0; step++) {
                const r = row + step;
                if (r >= h - 1) break;
                let hit = false;
                for (let x = tx; x <= x1 && !hit; x++) hit = platAt(x, r) === 2;
                if (hit) next = r;
              }
              if (next < 0) break;
              rows.push(next);
              row = next;
            }

            if (rows.length >= 2) {
              const topY = -(rows[0] * 16) * P2U - PLATFORM_UNDER;
              const botY = -((rows[rows.length - 1] + 1) * 16) * P2U;
              const group = new THREE.Group();
              /* The ladder is as wide as the rungs it serves, so it reads as the
                 framework the planks are bolted to rather than as a pipette
                 beside a staircase. Capped at four tiles so a long landing does
                 not become a wall. */
              const span = Math.min(x1 - tx + 1, 4) * TILE_SIZE;
              const railX = span * 0.5 - 0.10;
              const mid = (topY + botY) * 0.5;
              part(group, 0.06, topY - botY, 0.08, -railX, 0, 0, railDark);
              part(group, 0.06, topY - botY, 0.08, railX, 0, 0, railDark);
              /* One rung under each plank, kept BELOW the slab's underside so
                 the rigging never pokes through the platform it hangs from and
                 the top of the whole ladder is exactly where the group says. */
              for (let r = 0; r < rows.length; r++) {
                const y = -(rows[r] * 16) * P2U - PLATFORM_UNDER - 0.06;
                part(group, span + 0.12, 0.05, 0.07, 0, y - mid, 0, railMat);
              }
              const ladderX = (tx * 16 + (x1 + 1) * 16) * 0.5 * P2U;
              group.position.set(ladderX, mid, 0.32);
              const anchor = hangHardware(map, tx, rows[0], ladderX, topY, railDark, railMat);
              group.userData.hangTop = topY;
              group.userData.hangKind = 'ladder';
              group.userData.hangOn = anchor ? anchor.kind : 'none';
              group.userData.anchorTile = anchor ? [anchor.x, anchor.y] : null;
              propsGroup.add(group);
              ladderMeshes.push({ group: group, x: tx, y0: rows[0], y1: rows[rows.length - 1] });
            }
          }
          tx = x1 + 1;
        }
      }
    }

    /* Every solid prop built above casts and takes the key's shadow. */
    shadowize(propsGroup);
    /* Uploads and first-use compiles make a level's opening seconds slow on
       any machine; they are not a reason to lower the quality. */
    if (DS.PostFX) DS.PostFX.warm();
  }

  /* Every prop this renderer built, tagged with what it is. The audit below
     walks it, so a new prop is covered the moment it registers itself here. */
  function propRegistry() {
    const list = [];
    function add(arr, name, boxed) {
      for (let i = 0; i < arr.length; i++) {
        const obj = arr[i];
        const group = obj && (obj.group || obj.root || obj.mesh || obj);
        if (group && group.position) list.push({ name: name, group: group, boxed: !!boxed });
      }
    }
    /* Ropes and ladders are deliberately NOT in this list: they hang, so
       "how far is its footprint from the surface below it" is the wrong
       question for them. What they must satisfy is written on the group itself
       (userData.hangTop / userData.hangOn) and checked by
       tools/qa/check-hangs.js, which asks the question that fits: is the top of
       this strand attached to something solid? */
    add(chestMeshes, 'chest', true);
    add(pickupMeshes, 'pickup', true);
    add(plateMeshes, 'plate', false);
    add(brazierMeshes, 'brazier', false);
    add(leverMeshes, 'lever', false);
    add(torchLights, 'torch', false);
    /* Crates and gates are DYNAMIC: their transform is written every frame from
       the 2D body (a crate is pushed, a gate lifts), so they are not anchored
       to terrain at all and auditing them would only report their live state. */
    if (shrineMesh && shrineMesh.root) list.push({ name: 'shrine', group: shrineMesh.root, boxed: false });
    if (doorPortalObj && doorPortalObj.group) {
      list.push({ name: 'doorway', group: doorPortalObj.group, boxed: false });
    }
    return list;
  }

  /* Prop audit: for every prop, how far is its footprint from the surface it
     claims to stand on? A gap means it hovers; a negative gap means it is
     buried. Neither is allowed to ship - this is the gate for the whole
     "nothing floats" rule, and it names the prop so the fix is never a guess.

     Exposed on DS.R3D so a headless QA pass can assert it is empty for every
     depth and seed without taking a single screenshot. */
  function auditAnchors(g, tolerance) {
    const tol = tolerance == null ? 3 : tolerance;
    const map = g && g.map;
    const out = [];
    if (!map || !map.floorBelow) return out;

    const list = propRegistry();
    const box = new THREE.Box3();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const group = item.group;
      const worldX = group.position.x / P2U;
      /* The model's REAL bottom, not its origin: several builders centre their
         group (the doorway is a 32px door about a centre origin), so measuring
         the origin would report a perfectly planted prop as floating a tile. */
      box.setFromObject(group);
      const bottom = isFinite(box.min.y) ? -box.min.y / P2U : -group.position.y / P2U;
      const surface = floorAt(map, worldX, bottom + 2);
      let gap = null;
      if (surface != null) gap = surface - bottom;
      /* A boxed prop standing on another box (crate on crate, pickup on crate)
         legitimately has no floor under it - that is not a float. */
      if (gap == null && item.boxed) continue;
      if (gap == null || Math.abs(gap) > tol) {
        out.push({
          prop: item.name,
          x: Math.round(worldX),
          gap: gap == null ? null : Math.round(gap)
        });
      }
    }
    return out;
  }

  // --- voxel actor sync ------------------------------------------------------

  function terrainHeight(map, px, py, h) {
    if (!map) return py + h;
    const tx = Math.floor(px / 16);
    const fb = map.floorBelow(tx, Math.floor((py + h - 1) / 16));
    return fb < map.pixelH ? fb : py + h;
  }

  /* (Re)build the hero when the loadout changes. The paper-doll palette the
     2D renderer keys on is the same signal the 3D model recolours from. */
  /* Grip a weapon in a hand. Identical in the world and on the inventory doll,
     so the blade in the bag is literally the blade that gets swung. */
  function gripWeapon(arm, item, offhand) {
    if (!arm || !item) return null;
    const base = DS.Weapons.WEAPONS[item.type];
    const mesh = DS.Voxel.buildWeapon(item.type, DS.Weapons.rarityColor(item.rarity));
    shadowize(mesh);
    mesh.position.y = -0.34;   // the hand, at arm's end
    /* Hold it like a tool, not a plank glued to the forearm: blades rise over
       the shoulder with a slight forward cant, and the broad face yaws back
       toward the camera. Bow/staff stay near-vertical in the fist. */
    const release = base && base.holdMode === 'release';
    mesh.rotation.set(release ? 0.2 : 0.35, release ? 0 : -0.55, release ? 0 : -0.18);
    if (offhand) mesh.rotation.y = 0.55;    // mirrored cant for the other fist
    // The at-rest grip, which a swing blends away from and back to.
    mesh.userData.rest = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
    arm.add(mesh);
    return mesh;
  }

  function ensureHero(g) {
    const p = g.player;
    if (!p || !DS.Voxel) return;
    const key = DS.Paperdoll ? DS.Paperdoll.keyFor(p.inv.armor) : '';
    if (!heroModel) {
      heroModel = DS.Voxel.build('hero', { armor: p.inv.armor });
      heroArmorKey = key;
      actorGroup.add(shadowize(heroModel.root));
      heroWeaponRef = null;
      heroWeaponMesh = null;
    } else if (key !== heroArmorKey) {
      heroArmorKey = key;
      const wpn = heroWeaponMesh;
      actorGroup.remove(heroModel.root);
      disposeModel(heroModel);
      heroModel = DS.Voxel.build('hero', { armor: p.inv.armor });
      actorGroup.add(shadowize(heroModel.root));
      heroWeaponMesh = wpn;   // reattach below on the next pose pass
    }

    const item = DS.Inv.weapon(p.inv);
    if (item !== heroWeaponRef) {
      heroWeaponRef = item;
      if (heroWeaponMesh && heroWeaponMesh.parent) {
        heroWeaponMesh.parent.remove(heroWeaponMesh);
      }
      heroWeaponMesh = null;
      heroWeaponAura = null;
      if (item && heroModel.armR) {
        heroWeaponMesh = gripWeapon(heroModel.armR, item, false);
        // Elemental weapons carry a visible aura: tiny glowing motes orbit
        // the blade, tinted by the element. Melee weapons hold their element
        // in procs.element (the Flaming/Frozen prefix), staffs in item.element.
        const auraEl = item.element || (item.procs && item.procs.element);
        // With the pooled FX layer the aura is emitted per frame (heroFx).
        if (auraEl && DS.Weapons.ELEMENTS[auraEl] && !(DS.FX3D && DS.FX3D.ready)) {
          const elCol = DS.Voxel.elementColorHex(auraEl);
          const aura = new THREE.Group();
          for (let a = 0; a < 3; a++) {
            const mote = new THREE.Mesh(
              new THREE.BoxGeometry(0.05, 0.05, 0.05),
              new THREE.MeshBasicMaterial({ color: elCol, transparent: true,
                opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
            mote.userData.angle = a * (Math.PI * 2 / 3);
            mote.userData.r = 0.24 + (a % 2) * 0.08;
            aura.add(mote);
          }
          aura.position.y = 0.4;
          heroWeaponMesh.add(aura);
          heroWeaponAura = aura;
        }
      }
    }
  }

  function ensureEnemyModel(g, e) {
    if (!DS.Voxel) return null;
    let model = enemyModels.get(e);
    if (!model) {
      const key = DS.Voxel.keyFor(e);
      model = DS.Voxel.build(key, { tier: e.tier, tint: e.barColor });
      if (!model) return null;
      enemyModels.set(e, model);
      actorGroup.add(shadowize(model.root));
    }
    return model;
  }

  function actorScale(e) {
    if (!e) return 1;
    // Tier scale rides the entity already (size 1/2/3 for normal/miniboss/colossus).
    return (e.sizeScale || 1) * 0.95;
  }

  /* The charge aura lives on the hero model, built once and re-tinted rather
     than rebuilt per frame. It is the 3D half of the charge read: the smoke
     trail is the other half. */
  function ensureChargeAura(model) {
    if (!model || model.chargeAura) return model && model.chargeAura;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff0a8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const group = new THREE.Group();
    // A core glow in the chest, plus two motes that orbit the grip.
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), mat);
    core.position.y = 0.55;
    group.add(core);
    const motes = [];
    for (let i = 0; i < 3; i++) {
      const mote = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), mat.clone());
      group.add(mote);
      motes.push(mote);
    }
    group.visible = false;
    model.root.add(group);
    model.chargeAura = { group: group, core: core, mat: mat, motes: motes };
    return model.chargeAura;
  }

  function updateChargeAura(model, p, time) {
    const aura = ensureChargeAura(model);
    if (!aura) return;
    const base = p.inv ? DS.Inv.weapon(p.inv) : null;
    if (!p.charging || !base) { aura.group.visible = false; return; }

    const cfg = DS.Weapons.WEAPONS[base.type];
    const max = cfg ? cfg.chargeMax : 40;
    const ratio = M.clamp((p.holdFrames || 0) / max, 0, 1);
    const full = ratio >= 0.999;

    const elc = weaponElement(base);
    const E = elc ? DS.Weapons.ELEMENTS[elc] : null;
    aura.mat.color.set(full ? '#fff0a8' : (E ? E.color : '#a8e4ff'));
    for (let i = 0; i < aura.motes.length; i++) aura.motes[i].material.color.copy(aura.mat.color);

    aura.group.visible = true;
    const pulse = full ? 1 + Math.sin(time * 9) * 0.12 : 1;
    aura.core.scale.setScalar((0.35 + ratio * 0.75) * pulse);
    aura.mat.opacity = 0.04 + ratio * 0.14 + (full ? 0.06 : 0);

    for (let i = 0; i < aura.motes.length; i++) {
      const a = time * (2.2 + ratio * 3) + (i / aura.motes.length) * Math.PI * 2;
      const r = 0.34 + ratio * 0.3;
      aura.motes[i].position.set(Math.cos(a) * r, 0.55 + Math.sin(a * 1.7) * 0.16, Math.sin(a) * r * 0.5);
      aura.motes[i].material.opacity = 0.25 + ratio * 0.6;
    }
  }

  /* --- full-body attack animation --------------------------------------------

     Every melee combo step (DS.Combos key) has three keys: A the anticipation
     the body winds into, S where the strike lands, F the follow-through it
     settles into. Channels, all in the model's own space (it faces +z while
     it swings, see ATTACK_YAW):
       ax ay az  sword arm: pitch (0 down, -PI/2 forward, -PI up), yaw across
                 the body (- toward the camera), roll
       lx lz     off-hand arm: pitch and roll (the counter-swing)
       ty tx tz  torso twist (+ winds the sword shoulder back), forward lean,
                 side lean
       hy        head turn
       gl gr     legs: the brace (- is a leg stepping forward)
       dx dy     root lunge forward / crouch (world units)
       spin      extra turn of the whole body (a full 2*PI is a spin move)
     The arm uses YXZ order so ay sweeps a RAISED arm horizontally. */
  const ATTACK_YAW = 0.95;
  const HERO_POSES = {
    slashH: {
      A: { ax: -1.45, ay: 1.7, ty: 0.6, tx: 0.02, lx: -0.5, gl: -0.35, gr: 0.3, hy: 0.25 },
      S: { ax: -1.5, ay: -1.2, ty: -0.6, tx: 0.18, lx: 0.55, gl: -0.55, gr: 0.45, dx: 0.14, hy: -0.15 },
      F: { ax: -1.2, ay: -1.55, ty: -0.72, tx: 0.12, lx: 0.35, gl: -0.45, gr: 0.4, dx: 0.1, hy: -0.2 }
    },
    slashUp: {
      A: { ax: 0.55, ay: 0.2, ty: 0.35, tx: 0.1, lx: -0.4, gl: -0.25, gr: 0.25, dy: -0.07 },
      S: { ax: -2.7, ay: -0.35, ty: -0.35, tx: -0.12, lx: 0.65, gl: -0.5, gr: 0.5, dx: 0.12, dy: 0.06 },
      F: { ax: -2.95, ay: -0.45, ty: -0.4, tx: -0.14, lx: 0.45, gl: -0.4, gr: 0.4, dx: 0.1, dy: 0.04 }
    },
    spin: {
      A: { ax: -3.0, ay: -0.2, ty: 0.25, tx: -0.18, lx: -0.9, gl: -0.3, gr: 0.3, dy: 0.06 },
      S: { ax: -0.35, ay: -0.35, ty: -0.2, tx: 0.5, lx: 0.7, gl: -0.75, gr: 0.65, dx: 0.28, dy: -0.13, spin: Math.PI * 2 },
      F: { ax: -0.1, ay: -0.35, ty: -0.25, tx: 0.42, lx: 0.5, gl: -0.7, gr: 0.6, dx: 0.26, dy: -0.11, spin: Math.PI * 2 }
    },
    heavySword: {
      A: { ax: -3.0, ay: 0.25, ty: 0.5, tx: -0.18, lx: -0.7, gl: -0.4, gr: 0.4, dy: -0.07, hy: 0.2 },
      S: { ax: -0.25, ay: -0.3, ty: -0.5, tx: 0.55, lx: 0.8, gl: -0.85, gr: 0.75, dx: 0.38, dy: -0.16 },
      F: { ax: 0.15, ay: -0.3, ty: -0.55, tx: 0.45, lx: 0.6, gl: -0.8, gr: 0.7, dx: 0.34, dy: -0.14 }
    },
    crossA: {
      A: { ax: -2.5, ay: 0.5, ty: 0.3, lx: -1.4, gl: -0.3, gr: 0.3 },
      S: { ax: -0.55, ay: -0.55, ty: -0.35, tx: 0.25, lx: 0.3, gl: -0.5, gr: 0.45, dx: 0.1 },
      F: { ax: -0.35, ay: -0.65, ty: -0.35, tx: 0.2, lx: 0.2, gl: -0.45, gr: 0.4, dx: 0.08 }
    },
    crossB: {
      A: { ax: -0.3, ay: 0.75, ty: 0.35, tx: 0.2, lx: 0.3, gl: -0.35, gr: 0.35 },
      S: { ax: -2.55, ay: -0.5, ty: -0.3, tx: -0.05, lx: -0.5, gl: -0.5, gr: 0.45, dx: 0.1 },
      F: { ax: -2.75, ay: -0.6, ty: -0.3, tx: -0.08, lx: -0.4, gl: -0.45, gr: 0.4, dx: 0.08 }
    },
    dashStab: {
      A: { ax: 0.6, ay: 0.15, ty: 0.55, tx: 0.12, lx: -0.8, gl: -0.2, gr: 0.45, dy: -0.1 },
      S: { ax: -1.6, ay: -0.05, ty: -0.45, tx: 0.4, lx: 0.85, gl: -0.95, gr: 0.85, dx: 0.32, dy: -0.06 },
      F: { ax: -1.5, ay: -0.05, ty: -0.4, tx: 0.32, lx: 0.7, gl: -0.85, gr: 0.75, dx: 0.28, dy: -0.05 }
    },
    heavyDagger: {
      A: { ax: 0.7, ay: 0.15, ty: 0.65, tx: 0.18, lx: -0.9, gl: -0.2, gr: 0.5, dy: -0.14 },
      S: { ax: -1.6, ay: -0.05, ty: -0.5, tx: 0.5, lx: 0.95, gl: -1.0, gr: 0.9, dx: 0.42, dy: -0.08 },
      F: { ax: -1.5, ay: -0.05, ty: -0.45, tx: 0.4, lx: 0.8, gl: -0.9, gr: 0.8, dx: 0.36, dy: -0.06 }
    },
    cleave: {
      A: { ax: -1.6, ay: 1.9, ty: 0.8, tx: -0.05, lx: -1.2, gl: -0.45, gr: 0.4, dy: -0.05, hy: 0.3 },
      S: { ax: -1.3, ay: -1.4, ty: -0.75, tx: 0.22, lx: 0.3, gl: -0.65, gr: 0.55, dx: 0.16, hy: -0.2 },
      F: { ax: -1.05, ay: -1.75, ty: -0.85, tx: 0.16, lx: 0.2, gl: -0.55, gr: 0.5, dx: 0.12 }
    },
    slam: {
      A: { ax: -3.1, ay: 0.05, ty: 0.15, tx: -0.28, lx: -2.8, gl: -0.3, gr: 0.3, dy: 0.09 },
      S: { ax: -0.4, ay: -0.2, tx: 0.62, lx: -0.7, gl: -0.85, gr: 0.85, dx: 0.2, dy: -0.24 },
      F: { ax: -0.3, ay: -0.2, tx: 0.56, lx: -0.6, gl: -0.8, gr: 0.8, dx: 0.2, dy: -0.22 }
    },
    heavyAxe: {
      A: { ax: -3.15, ay: 0.05, ty: 0.2, tx: -0.35, lx: -2.9, gl: -0.35, gr: 0.35, dy: 0.12 },
      S: { ax: -0.35, ay: -0.2, tx: 0.72, lx: -0.6, gl: -0.95, gr: 0.95, dx: 0.28, dy: -0.3 },
      F: { ax: -0.25, ay: -0.2, tx: 0.66, lx: -0.5, gl: -0.9, gr: 0.9, dx: 0.26, dy: -0.28 }
    },
    thrust: {
      A: { ax: -1.45, ay: 0.35, ty: 0.65, tx: -0.05, lx: -1.3, gl: -0.2, gr: 0.35, dx: -0.12 },
      S: { ax: -1.6, ay: -0.1, ty: -0.45, tx: 0.3, lx: 0.6, gl: -0.85, gr: 0.75, dx: 0.36, dy: -0.06 },
      F: { ax: -1.55, ay: -0.1, ty: -0.4, tx: 0.25, lx: 0.45, gl: -0.75, gr: 0.65, dx: 0.3, dy: -0.05 }
    },
    sweep: {
      A: { ax: -2.85, ay: 0.3, ty: 0.4, tx: -0.12, lx: -0.8, gl: -0.3, gr: 0.3 },
      S: { ax: -0.15, ay: -0.45, ty: -0.5, tx: 0.38, lx: 0.5, gl: -0.65, gr: 0.55, dx: 0.16, dy: -0.08 },
      F: { ax: 0.3, ay: -0.5, ty: -0.55, tx: 0.32, lx: 0.4, gl: -0.6, gr: 0.5, dx: 0.14, dy: -0.07 }
    },
    heavySpear: {
      A: { ax: -1.45, ay: 0.4, ty: 0.8, tx: -0.08, lx: -1.4, gl: -0.2, gr: 0.4, dx: -0.2 },
      S: { ax: -1.6, ay: -0.1, ty: -0.5, tx: 0.4, lx: 0.7, gl: -0.95, gr: 0.85, dx: 0.5, dy: -0.08 },
      F: { ax: -1.55, ay: -0.1, ty: -0.45, tx: 0.32, lx: 0.55, gl: -0.85, gr: 0.75, dx: 0.44, dy: -0.07 }
    }
  };
  const HEAVY_KEY = { sword: 'heavySword', dagger: 'heavyDagger', greataxe: 'heavyAxe', spear: 'heavySpear' };
  // Wrist during a swing: the blade continues the arm (x ~ PI flips it outward).
  const ATTACK_GRIP = {
    sword: [2.95, 0, 0.12], dagger: [3.0, 0, 0], greataxe: [2.85, 0, 0.1], spear: [3.1, 0, 0]
  };
  const POSE_CH = ['ax', 'ay', 'az', 'lx', 'lz', 'ty', 'tx', 'tz', 'hy', 'gl', 'gr', 'dx', 'dy', 'spin'];
  const POSE_OUT = {};
  for (let i = 0; i < POSE_CH.length; i++) POSE_OUT[POSE_CH[i]] = 0;

  function smooth01(x) {
    const t = M.clamp(x, 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* The pose at swing time t: holds A until the windup ends, snaps A -> S with
     a fast-out curve (the strike), then eases S -> F. */
  function samplePose(key, t, ta, ts, out) {
    const P = HERO_POSES[key] || HERO_POSES.slashH;
    let seg, e;
    if (t < ts) {
      seg = 0;
      const u = t <= ta ? 0 : (t - ta) / Math.max(0.001, ts - ta);
      e = 1 - Math.pow(1 - u, 3);
    } else {
      seg = 1;
      const u = (t - ts) / Math.max(0.001, 1 - ts);
      e = 1 - (1 - u) * (1 - u);
    }
    for (let i = 0; i < POSE_CH.length; i++) {
      const c = POSE_CH[i];
      const a = P.A[c] || 0, s = P.S[c] || 0, f = P.F[c] || 0;
      out[c] = seg === 0 ? a + (s - a) * e : s + (f - s) * e;
    }
    return out;
  }

  // Channels only a swing writes, returned to neutral before each pose pass.
  function resetAttackChannels(m) {
    if (m.armR.rotation.order !== 'YXZ') { m.armR.rotation.order = 'YXZ'; m.armL.rotation.order = 'YXZ'; }
    m.armR.rotation.y = 0; m.armR.rotation.z = 0;
    m.armL.rotation.z = 0;
    m.torso.rotation.x = 0; m.torso.rotation.z = 0;
    m.head.rotation.y = 0;
  }

  function applyPose(m, o, w, face) {
    const L = M.lerp;
    m.armR.rotation.x = L(m.armR.rotation.x, o.ax, w);
    m.armR.rotation.y = o.ay * w;
    m.armR.rotation.z = o.az * w;
    m.armL.rotation.x = L(m.armL.rotation.x, o.lx, w);
    m.armL.rotation.z = o.lz * w;
    m.torso.rotation.y = L(m.torso.rotation.y, o.ty, w);
    m.torso.rotation.x = o.tx * w;
    m.torso.rotation.z = o.tz * w;
    m.head.rotation.y = o.hy * w;
    m.legL.rotation.x = L(m.legL.rotation.x, o.gl, w);
    m.legR.rotation.x = L(m.legR.rotation.x, o.gr, w);
    m.root.position.x += o.dx * w * (face < 0 ? -1 : 1);
    m.root.position.y += o.dy * w;
  }

  /* --- hero FX: weapon trail, element aura, dash ribbon ---------------------- */

  // Blade sample points in the weapon's own space: [innerX, innerY, tipX, tipY].
  const WEAPON_TIP = {
    sword: [0, 0.34, 0, 0.84], dagger: [0, 0.16, 0, 0.47], greataxe: [0.12, 0.72, 0.44, 1.02],
    spear: [0, 1.05, 0, 1.76], staff: [0, 0.92, 0, 1.2], bow: [0, -0.5, 0, 0.6]
  };
  const TRAIL_STYLE = {
    sword: { core: 0xffffff, edge: 0x5f9dff, life: 9 },
    dagger: { core: 0xffffff, edge: 0xa070ff, life: 7 },
    greataxe: { core: 0xfff4d8, edge: 0xff7a20, life: 12 },
    spear: { core: 0xffffff, edge: 0x40c0ff, life: 8 }
  };
  let heroTrail = 0;
  let heroTrailSwing = -1;
  let heroDashTrail = 0;
  let heroAuraEl = null;
  let heroFxFrame = -1;
  const fxHilt = new THREE.Vector3();
  const fxTip = new THREE.Vector3();

  /* The weapon's element right now. Infusion (DS.Elements.activeElement) wins
     when it exists; otherwise the weapon's own element or enchant. */
  function weaponElement(item) {
    if (!item) return null;
    if (DS.Elements && typeof DS.Elements.activeElement === 'function') {
      const el = DS.Elements.activeElement(item);
      if (el) return el;
    }
    return item.element || (item.procs && item.procs.element) || null;
  }

  function heroFx(g, p, m, item, base, swinging) {
    const F = DS.FX3D;
    if (!F || !F.ready || !heroWeaponMesh || p.dead) return;
    // Emit and sample only when the game actually advanced a frame.
    if (g.frames === heroFxFrame) return;
    heroFxFrame = g.frames;

    m.root.updateMatrixWorld(true);
    const key = base ? base.key : 'sword';
    const tip = WEAPON_TIP[key] || WEAPON_TIP.sword;
    fxHilt.set(tip[0], tip[1], 0);
    heroWeaponMesh.localToWorld(fxHilt);
    fxTip.set(tip[2], tip[3], 0);
    heroWeaponMesh.localToWorld(fxTip);
    const el = weaponElement(item);

    // The swing's trail: from the strike until the follow-through settles.
    if (swinging) {
      if (p.swingId !== heroTrailSwing) {
        heroTrailSwing = p.swingId;
        if (heroTrail) F.rib.release(heroTrail);
        heroTrail = 0;
      }
      const t = 1 - p.swingTimer / Math.max(1, p.swingMax);
      const ta = (p.attackWindup || 0) / Math.max(1, p.swingMax);
      if (t >= ta * 0.7 && t < 0.88) {
        if (!heroTrail) {
          const st = TRAIL_STYLE[key] || TRAIL_STYLE.sword;
          const tr = el ? F.kit(el).trail : st;
          heroTrail = F.rib.acquire(false, st.life + (p.attackHeavy ? 3 : 0), tr.core, tr.edge,
                                    p.attackHeavy ? 1.9 : 1.5, 1);
        }
        if (heroTrail > 0) F.rib.pushBlade(heroTrail, fxHilt.x, fxHilt.y, fxHilt.z, fxTip.x, fxTip.y, fxTip.z);
      }
    } else if (heroTrail) {
      F.rib.release(heroTrail);
      heroTrail = 0;
    }

    // Dashes and lunges drag a streak of light behind the body.
    const dashing = p.dashFrames > 0 || p.lungeFrames > 0;
    if (dashing) {
      if (!heroDashTrail || !F.rib.isLive(heroDashTrail)) {
        const c = p.miniActive ? 0xa3e86b : (el ? F.kit(el).pal.main : 0xa8e4ff);
        heroDashTrail = F.rib.acquire(true, 10, 0xffffff, c, 1.0, 0.7);
      }
      if (heroDashTrail > 0) {
        F.rib.pushLine(heroDashTrail, (p.x + p.w * 0.5) * P2U, -(p.y + p.h * 0.55) * P2U, ACTOR_Z - 0.05, 1.0);
      }
    } else if (heroDashTrail) {
      F.rib.release(heroDashTrail);
      heroDashTrail = 0;
    }

    // The element aura the weapon wears.
    if (el !== heroAuraEl) {
      if (heroAuraEl === 'earth') F.releasePebbles();
      heroAuraEl = el;
    }
    if (el) {
      const kit = F.kit(el);
      kit.aura(fxHilt.x, fxHilt.y, fxHilt.z, fxTip.x, fxTip.y, fxTip.z, g.frames, swinging ? 2 : 1);
      /* A tinted halo round the blade in the ALPHA layer: additive light alone
         vanishes on a bright floor, a coloured haze reads everywhere. */
      if ((g.frames & 1) === 0) {
        const s = F.soft.spec();
        s.x = (fxHilt.x + fxTip.x) * 0.5; s.y = (fxHilt.y + fxTip.y) * 0.5; s.z = (fxHilt.z + fxTip.z) * 0.5;
        const dx = fxTip.x - fxHilt.x, dy = fxTip.y - fxHilt.y;
        s.cell = 0; s.size = 0.8 + Math.sqrt(dx * dx + dy * dy) * 1.5; s.size1 = s.size;
        s.life = 4; F.col(s, kit.pal.main, 1); s.a = 0.4; s.a1 = 0.15;
        F.soft.emit(s);
      }
    }

    // A full charge crackles on the blade.
    if (p.charging && base && p.holdFrames >= base.chargeMax && g.frames % 3 === 0) {
      F.glowAt(fxTip.x, fxTip.y, fxTip.z, 0.55, el ? F.kit(el).pal.main : 0xfff0a8, 1.6, 6);
      F.sparkAt(fxTip.x, fxTip.y, fxTip.z, F.rnd(-0.05, 0.05), F.rnd(0.02, 0.08), 0,
                0xfff0a8, 2.2, 8, 0.04, 2, 0, 0.9);
    }
  }

  /* --- enemy hit flash --------------------------------------------------------

     The voxel materials are a SHARED cache, so an emissive pulse written to
     them would light every monster in the room. A flashing model instead
     swaps its meshes onto FLASH VARIANTS of their materials - clones with a
     white-hot emissive at three strengths, cached per source material and
     shared by every monster - and swaps straight back to the originals when
     the flash ends. Nothing per model is allocated after its first hit. */
  const FLASH_LEVELS = [0.05, 0.12, 0.22];
  const flashVariants = new Map();   // source material -> [variant per level]

  function flashVariant(src, level) {
    let list = flashVariants.get(src);
    if (!list) {
      list = FLASH_LEVELS.map(function (i) {
        const c = src.clone();
        c.emissive.setRGB(1, 0.93, 0.84);
        c.emissiveIntensity = i;
        return c;
      });
      flashVariants.set(src, list);
    }
    return list[level];
  }

  function flashModel(model, k) {
    const level = k <= 0.02 ? -1 : (k < 0.4 ? 0 : (k < 0.75 ? 1 : 2));
    if (!model.flash) {
      if (level < 0) return;
      const meshes = [], orig = [];
      model.root.traverse(function (o) {
        if (!o.isMesh || !o.material || !o.material.emissive) return;
        meshes.push(o); orig.push(o.material);
      });
      model.flash = { meshes: meshes, orig: orig, level: -1 };
    }
    const f = model.flash;
    if (level === f.level) return;
    f.level = level;
    for (let i = 0; i < f.meshes.length; i++) {
      f.meshes[i].material = level < 0 ? f.orig[i] : flashVariant(f.orig[i], level);
    }
  }

  /* --- friendly projectile trails and impacts ---------------------------------- */

  let projPrev = [];
  let projNow = [];
  let projFrame = -1;
  const SHOT = { dir: 1, el: null, kind: 'arrow' };

  function projFx(g, p, X, Y, Z) {
    const F = DS.FX3D;
    p.fxSeen = g.frames;
    p.fxX = X; p.fxY = Y;
    projNow.push(p);
    if (p.fxRib === undefined) {
      const k = F.kit(p.element);
      const orb = p.kind !== 'arrow';
      const core = p.element ? k.trail.core : (orb ? 0xe0f4ff : 0xfff6dc);
      const edge = p.element ? k.trail.edge : (orb ? 0x6fb8ff : (p.trailColor ? F.cssHex(p.trailColor) : 0xffd890));
      p.fxRib = F.rib.acquire(true, orb ? 12 : (p.pierce > 0 ? 12 : 8), core, edge, orb ? 1.5 : 1.3, 1);
    }
    const width = p.kind === 'arrow' ? (p.pierce > 0 ? 0.3 : 0.14) : 0.42;
    if (p.fxRib > 0) F.rib.pushLine(p.fxRib, X, Y, Z, width);
    if (p.kind !== 'arrow') {
      const a = g.frames * 0.5;
      const k = F.kit(p.element || 'water');
      const s = F.add.spec();
      s.x = X + Math.cos(a) * 0.2; s.y = Y + Math.sin(a) * 0.2; s.z = Z + Math.sin(a * 0.7) * 0.1;
      s.vx = -Math.sin(a) * 0.02; s.vy = Math.cos(a) * 0.02; s.drag = 0.9;
      s.cell = 13; s.size = 0.09; s.size1 = 0.02; s.life = 14;
      F.col(s, k.pal.main, 2); s.a = 1; s.a1 = 0;
      F.add.emit(s);
      if (p.element && g.frames % 3 === 0) k.ambient(X, Y, Z, 0.5);
    } else if (p.pierce > 0) {
      F.sparkAt(X, Y, Z, -p.vx * P2U * 0.3, p.vy * P2U * 0.3, 0, 0xfff6dc, 2, 6, 0.04, 2, 0, 0.9);
    }
  }

  // Shots that vanished since last frame with life left hit something.
  function projImpacts(g) {
    const F = DS.FX3D;
    for (let i = 0; i < projPrev.length; i++) {
      const q = projPrev[i];
      if (q.fxSeen === g.frames) continue;
      SHOT.dir = M.sign(q.vx) || 1;
      SHOT.el = q.element || null;
      SHOT.kind = q.kind;
      if (q.life > 0) F.at('shotImpact', q.fxX, q.fxY, ACTOR_Z, SHOT);
    }
    const t = projPrev; projPrev = projNow; projNow = t;
    projNow.length = 0;
  }

  /* --- body-weight animation (DS.Anim) -----------------------------------------
     One state per body, stepped once per GAME frame (draw runs faster than the
     sim, and a spring stepped per draw would ring at the wrong rate). */
  let heroAnim = null;
  let heroAnimFrame = -1;
  let heroPrevHp = 0;
  let animFrames = -1;            // the game frame the enemy rigs are being posed for

  function stepHeroAnim(g, p) {
    const A = DS.Anim;
    if (!heroAnim) heroAnim = A.create();
    if (g.frames === heroAnimFrame) return heroAnim.out;
    if (g.frames < heroAnimFrame) A.reset(heroAnim);
    heroAnimFrame = g.frames;
    const inp = A.input;
    inp.grounded = !!p.onGround || !!p.onRope || !!p.inWater;
    inp.vy = p.vy || 0;
    inp.dashing = (p.dashFrames || 0) > 0;
    inp.hurt = p.hp < heroPrevHp && !p.dead;
    inp.dead = !!p.dead;
    inp.wind = 0;
    inp.strike = false;
    heroPrevHp = p.hp;
    const o = A.step(heroAnim, inp);
    if (o.justLanded && DS.FX3D && DS.FX3D.ready && o.landPower > 0.3) {
      const F = DS.FX3D;
      const X = (p.x + p.w * 0.5) * P2U, Y = (-p.y - p.h) * P2U;
      for (let i = 0; i < 4; i++) {
        const dir = i < 2 ? -1 : 1;
        F.puffAt(X + dir * 0.15, Y + 0.05, ACTOR_Z, dir * F.rnd(0.01, 0.03), 0.006, 0,
                 0.14, 0.4, 0x8a8078, 0.18 * o.landPower + 0.05, 22);
      }
    }
    return o;
  }

  function stepEnemyAnim(e, model) {
    const A = DS.Anim;
    if (!model.anim) model.anim = A.create();
    if (model.animFrame === animFrames) return model.anim.out;
    model.animFrame = animFrames;
    const inp = A.input;
    inp.grounded = e.flying ? true : !!e.onGround;
    inp.vy = e.vy || 0;
    inp.dashing = false;
    inp.hurt = e.hurtFlash > 0;
    inp.dead = false;
    inp.wind = e.attackState === 'wind'
      ? 1 - (e.attackTimer || 0) / Math.max(1, e.cfg && e.cfg.wind || 20) : 0;
    inp.strike = e.attackState === 'strike';
    return A.step(model.anim, inp);
  }

  /* Burst a model into voxel chunks tinted like its own meshes. Chunks tumble
     on the pooled FX layer, so nothing here owns geometry afterward. */
  const shatterPos = new THREE.Vector3();
  function shatterModel(model, count, sizeMul) {
    const F = DS.FX3D;
    if (!F || !F.ready || !model || !model.root) return;
    const meshes = [];
    model.root.traverse(function (o) {
      if (o.isMesh && o.material && o.material.color && o.visible) meshes.push(o);
    });
    if (!meshes.length) return;
    model.root.updateMatrixWorld(true);
    const step = Math.max(1, meshes.length / count);
    for (let i = 0, k = 0; i < meshes.length && k < count; i += step, k++) {
      const mesh = meshes[Math.floor(i)];
      shatterPos.setFromMatrixPosition(mesh.matrixWorld);
      const a = F.rnd(0, Math.PI * 2);
      const sp = F.rnd(0.02, 0.06);
      F.chunkAt(shatterPos.x, shatterPos.y, shatterPos.z + 0.05,
        Math.cos(a) * sp, F.rnd(0.03, 0.09), Math.sin(a) * sp * 0.4,
        F.rnd(0.1, 0.2) * sizeMul, mesh.material.color.getHex(), F.rnd(34, 58), shatterPos.y - 0.6);
    }
    F.puffAt(model.root.position.x, model.root.position.y + 0.5, ACTOR_Z, 0, 0.006, 0,
             0.3 * sizeMul, 0.6, 0xb8b0a8, 0.14, 26);
  }

  function poseHero(g, p, time) {
    if (!p) return;
    ensureHero(g);
    const model = heroModel;
    if (!model) return;

    const m = heroModel;
    const walk = Math.abs(p.vx || 0);
    const speedRatio = M.clamp(walk / 2.2, 0, 1);
    const cyc = time * 11;
    const bob = p.onGround && walk < 0.25 ? Math.sin(time * 2.4) * 0.015 : 0;
    // Root: world position, facing flip, squash on landing.
    // Origin sits at the FEET, not the hitbox top: the model stands on the
    // floor line and death topples it around its heels, not mid-air.
    m.root.position.set((p.x + p.w * 0.5) * P2U, (-p.y - p.h) * P2U, 0.3);
    /* Facing: the model is MIRRORED left or right (like the 2D sprites this game
       was built on) and turned by the staged angle above -- camera-facing when
       still, side-on while walking. Mirroring keeps the face on the camera and
       makes left and right different (the sword hand swaps, the shoulder
       leads). */
    /* The walk turn is SIGNED by the direction of travel. Scaling the root by
       -1 flips the model's own X axis -- which hand leads, which way the fringe
       parts -- but it does not flip where the face points, because the face is
       on +Z and a mirror about X leaves +Z where it was. So the mirror alone
       gave both directions the same yaw and a hero walking LEFT showed a
       right-facing profile. The mirror is still the mirror; the sign of the
       yaw is what aims the face. */
    const moving = Math.abs(p.vx || 0) > 0.35;
    /* A melee swing (or its wind-up) owns the facing: the body turns side-on
       toward the swing so the arm sweeps across the screen, not at the lens. */
    const heldItem = DS.Inv.weapon(p.inv);
    const heldBase = heldItem ? DS.Weapons.WEAPONS[heldItem.type] : null;
    const meleeHeld = !!heldBase && heldBase.holdMode !== 'release';
    const swinging = meleeHeld && p.swingTimer > 0 && !!p.pending;
    const winding = meleeHeld && p.charging && !swinging;
    const face = swinging ? (p.attackDir || p.facing || 1) : (p.facing || 1);
    const walkSign = face < 0 ? -1 : 1;
    let targetRy = moving ? WALK_YAW * walkSign : IDLE_YAW;
    if (swinging || winding) targetRy = ATTACK_YAW * walkSign;
    // The mirror itself. Nothing else writes root.scale on the hero, so a
    // straight assignment per frame is safe (the enemy path has to multiply,
    // because it still sets its own scalar for rank size).
    const ha = stepHeroAnim(g, p);
    m.root.scale.set((face < 0 ? -1 : 1) * ha.sxz, ha.sy, ha.sxz);
    resetAttackChannels(m);

    const airborne = !p.onGround && !p.onRope;
    const rising = airborne && p.vy < 0;

    if (p.onRope) {
      const climb = Math.abs(p.vy) > 0.1 ? Math.sin(time * 10) * 0.5 : 0;
      m.armL.rotation.x = -2.6 + climb;
      m.armR.rotation.x = -2.6 - climb;
      m.legL.rotation.x = climb * 0.4;
      m.legR.rotation.x = -climb * 0.4;
      targetRy = 2.75;                // face the wall the rope hangs on
    } else if (airborne) {
      m.armL.rotation.x = rising ? -0.7 : -1.9;
      m.armR.rotation.x = rising ? -0.7 : -1.9;
      m.legL.rotation.x = rising ? 0.5 : -0.3;
      m.legR.rotation.x = rising ? -0.35 : 0.15;
    } else {
      const swing = Math.sin(cyc) * speedRatio;
      m.legL.rotation.x = swing * 0.7;
      m.legR.rotation.x = -swing * 0.7;
      m.armL.rotation.x = -swing * 0.6;
      if (!p.swingTimer) m.armR.rotation.x = swing * 0.6;
      if (!p.swingTimer) m.torso.rotation.y = swing * 0.08;
    }

    /* Charge aura. Held attacks charge in the hand, so the model has to show
       it: a glow that swells with the wind-up and snaps to full-bright when
       the charge tops out, tinted by whatever element the weapon carries. The
       smoke wake itself is emitted from the 2D side (FX.smoke) so both layers
       read the same charge value. */
    updateChargeAura(m, p, time);

    /* Attack: the whole body, keyed per weapon per combo step (HERO_POSES).
       Anticipation -> strike -> follow-through, blended over the locomotion
       pose so a swing eases in and hands the body back without a pop. */
    let spin = 0;
    let attackW = 0;
    if (swinging) {
      const t = 1 - (p.swingTimer / Math.max(1, p.swingMax));
      const key = p.attackKey || (p.attackHeavy ? 'heavySword' : 'slashH');
      const ta = M.clamp((p.attackWindup || 0) / Math.max(1, p.swingMax), 0.04, 0.5);
      const ts = M.clamp(ta + Math.max(3, (p.attackStrike || 5)) / Math.max(1, p.swingMax), ta + 0.08, 0.85);
      samplePose(key, t, ta, ts, POSE_OUT);
      attackW = t < ta ? 1 - (1 - t / ta) * (1 - t / ta)
              : (t > 0.8 ? 1 - smooth01((t - 0.8) / 0.2) : 1);
      applyPose(m, POSE_OUT, attackW, face);
      spin = POSE_OUT.spin * attackW;
    } else if (winding) {
      /* A heavy wind-up holds the heavy blow's anticipation, trembling harder
         as the charge fills. */
      const ratio = M.clamp(p.holdFrames / ((heldBase && heldBase.chargeMax) || 30), 0, 1);
      const key = HEAVY_KEY[heldBase.key] || 'heavySword';
      samplePose(key, 0, 0.1, 0.5, POSE_OUT);
      const tremble = Math.sin(time * 38) * 0.05 * ratio;
      POSE_OUT.ax += tremble; POSE_OUT.ty += tremble * 0.5;
      attackW = smooth01(Math.min(1, ratio * 2.5));
      applyPose(m, POSE_OUT, attackW, face);
    } else if (p.aim) {
      /* Ranged aiming: the shooting arm follows the cursor's pitch, the other
         steadies the weapon, and the shoulders open toward the target. The
         pitch is smoothed so a jittery cursor does not vibrate the model. */
      const pitch = M.clamp(-p.aim.y, -1, 1);        // screen-down is +y
      m.aimPitch = M.approach(m.aimPitch || 0, pitch, 0.18);
      const ap = m.aimPitch;
      const charging2 = p.charging
        ? M.clamp(p.holdFrames / 30, 0, 1) : 0;
      // The shot kicks the bow arm back for a few frames after release.
      const kick = p.swingTimer > 0 ? Math.sin((1 - p.swingTimer / Math.max(1, p.swingMax)) * Math.PI) * 0.35 : 0;
      m.armR.rotation.x = -1.4 + ap * 1.05 + charging2 * 0.25 + kick;
      m.armL.rotation.x = -1.3 + ap * 0.85 - charging2 * 0.2 - kick * 0.5;
      m.torso.rotation.y = M.lerp(m.torso.rotation.y, 0.26, 0.22);
      m.torso.rotation.x = -kick * 0.2;
    } else if (p.charging) {
      const item2 = DS.Inv.weapon(p.inv);
      const base2 = item2 ? DS.Weapons.WEAPONS[item2.type] : null;
      const ratio = M.clamp(p.holdFrames / ((base2 && base2.chargeMax) || 30), 0, 1);
      m.armR.rotation.x = M.lerp(-0.6, 0.9, ratio);
      m.torso.rotation.y = M.lerp(0, 0.45, ratio);
    } else if (p.swingTimer > 0 && !meleeHeld) {
      // Keyboard shot or cast with no cursor: a quick raise-and-release.
      const t = 1 - p.swingTimer / Math.max(1, p.swingMax);
      m.armR.rotation.x = -1.5 - Math.sin(t * Math.PI) * 0.9;
      m.armL.rotation.x = -1.2 + Math.sin(t * Math.PI) * 0.4;
    } else if (!p.onRope && !airborne) {
      m.torso.rotation.y *= 0.8;
    }

    /* Weight layer (DS.Anim): dash lean, hit recoil and the coil before a
       strike pitch the torso; the legs draw up at the jump apex and bend after
       a landing. Skipped while a swing owns the body so the authored attack
       poses stay exact. */
    m.torso.rotation.x += ha.pitch * (1 - attackW);
    if (airborne && !p.onRope && ha.tuck > 0.01) {
      m.legL.rotation.x = M.lerp(m.legL.rotation.x, 0.75, ha.tuck * 0.7);
      m.legR.rotation.x = M.lerp(m.legR.rotation.x, 0.55, ha.tuck * 0.7);
      m.armL.rotation.x = M.lerp(m.armL.rotation.x, -1.2, ha.tuck * 0.5);
      m.armR.rotation.x = M.lerp(m.armR.rotation.x, -1.2, ha.tuck * 0.5 * (1 - attackW));
    }
    if (ha.knees > 0.01 && p.onGround) {
      m.legL.rotation.x += ha.knees * 0.35;
      m.legR.rotation.x += ha.knees * 0.35;
    }

    /* A 3D body pivots toward where it walks -- no sprite-style mirror snap.
       The smoothed yaw lives on the model; a spin finisher rides on top of it
       and never feeds back into the smoothing. A swing snaps faster. */
    if (m.baseRy == null) m.baseRy = m.root.rotation.y;
    let dRy = targetRy - m.baseRy;
    while (dRy > Math.PI) dRy -= Math.PI * 2;
    while (dRy < -Math.PI) dRy += Math.PI * 2;
    m.baseRy += dRy * (swinging || winding ? 0.6 : 0.35);
    m.root.rotation.y = m.baseRy + spin * walkSign;

    /* The weapon's wrist: during a swing the blade swings out to continue the
       arm, so the whole arm-and-blade lever sweeps a clean arc from the
       shoulder -- the arc the trail and the crescent both follow. */
    if (heroWeaponMesh && heroWeaponMesh.userData.rest) {
      const rest = heroWeaponMesh.userData.rest;
      const grip = ATTACK_GRIP[heldBase ? heldBase.key : 'sword'] || ATTACK_GRIP.sword;
      heroWeaponMesh.rotation.set(M.lerp(rest.x, grip[0], attackW), M.lerp(rest.y, grip[1], attackW),
                                  M.lerp(rest.z, grip[2], attackW));
    }

    heroFx(g, p, m, heldItem, heldBase, swinging);

    // Legacy motes: only when the pooled FX layer is missing.
    if (heroWeaponAura) {
      const t = time * 2.6;
      for (let a = 0; a < heroWeaponAura.children.length; a++) {
        const mote = heroWeaponAura.children[a];
        const ang = mote.userData.angle + t;
        mote.position.set(Math.cos(ang) * mote.userData.r,
          Math.sin(t * 1.3 + a * 2.1) * 0.1, Math.sin(ang) * mote.userData.r);
      }
    }

    // Cast/charge glow on the staff tip handled by the emissive material.
    m.head.rotation.z = p.hurtFlash > 0 ? Math.sin(time * 40) * 0.15 : 0;
    m.root.position.y += bob + (p.onRope ? 0.05 : 0);

    // Death: topple over, and burst into chunks the moment it starts.
    if (p.dead) {
      m.root.rotation.z = Math.PI / 2 * (p.facing < 0 ? -1 : 1) * ha.death;
      if (ha.death > 0 && !m.shattered) { m.shattered = true; shatterModel(m, 12, 1); }
    } else { m.root.rotation.z = 0; m.shattered = false; }
  }

  function poseEnemy(e, model, time, map) {
    const cx = e.x + e.w * 0.5;
    const isSlimey = model.kind === 'slime' || model.kind === 'slimeking';
    const groundY = e.flying ? e.y + e.h : terrainHeight(map, cx, e.y, e.h);
    // Feet on the floor: a ground walker anchors at the surface below it, a
    // flier at the bottom of its own hitbox (plus the hover bob further down).
    const baseY = -(e.flying ? e.y + e.h : groundY);

    model.root.position.set(cx * P2U, baseY * P2U, 0.3);
    // Same staging as the hero: mirror the model left/right, face the camera
    // when still, turn side-on while walking.
    /* Same signed turn as the hero: the mirror flips the model, the yaw aims
       it (see poseHero). */
    const moving = Math.abs(e.vx || 0) > 0.06;
    const targetRy = moving ? WALK_YAW * ((e.facing || 1) < 0 ? -1 : 1) : IDLE_YAW;
    let dRy = targetRy - model.root.rotation.y;
    while (dRy > Math.PI) dRy -= Math.PI * 2;
    while (dRy < -Math.PI) dRy += Math.PI * 2;
    model.root.rotation.y += dRy * 0.35;
    if (e.flying) {
      model.root.position.y += Math.sin(time * 3.2 + (e.x || 0) * 0.02) * 0.08;
    }
    // Delegate limb animation to the shared poser, then layer state on top.
    DS.Voxel.pose(model, e, time);
    const ea = stepEnemyAnim(e, model);
    /* Weight layer (DS.Anim): the recoil pitches the whole body back with a
       little shake on top; a wind-up coils it. Fliers keep their hover, so
       only ground walkers squash on landing. */
    model.root.rotation.z = e.hurtFlash > 0 ? Math.sin(time * 44) * 0.09 : 0;
    model.root.rotation.x = ea.pitch * (e.flying ? 0.5 : 1);

    // Tier crown: elites get a faint ember, minibosses a red glow child.
    // (The 2D overlay still draws the HP bar; here only presence matters.)
    if (e.tier === 'colossal') model.root.scale.setScalar(1.0 * (e.sizeScale || 3) * 0.95);
    else model.root.scale.setScalar(actorScale(e));

    if (!e.flying) {
      model.root.scale.x *= ea.sxz;
      model.root.scale.y *= ea.sy;
      model.root.scale.z *= ea.sxz;
    }
    /* Mirror after the scale is set, because setScalar would undo it. */
    if (e.facing < 0) model.root.scale.x *= -1;

    /* Hit flash: the body glows white-hot for the frames after a blow (and
       through the hitstop, which freezes hurtFlash with everything else) and
       squashes against the impact. */
    const hf = e.hurtFlash > 0 ? Math.min(1, e.hurtFlash / 6) : 0;
    if (DS.FX3D && DS.FX3D.ready) flashModel(model, hf);
    if (hf > 0) {
      model.root.scale.x *= 1 + hf * 0.12;
      model.root.scale.y *= 1 - hf * 0.1;
      model.root.scale.z *= 1 + hf * 0.12;
    }

    if (isSlimey) {
      // Slimes have no legs; the whole body squashes on landing.
      const squash = e.onGround ? 1 : 1.12;
      model.body.scale.y = (model.body.scale.y || 1) * 0 + (1 / squash) * (1 + Math.sin(time * 7) * 0.05);
    }

    if (e.dead) model.root.visible = false;
  }

  /* Projectile meshes live in a small pool keyed by insertion order; the 2D
     sim stays authoritative, this only mirrors position/angle. */
  /* A soft radial dot, used for the halo every projectile carries and for the
     muzzle flash. One texture, made once. */
  let glowTexture = null;
  function makeGlowTexture() {
    if (glowTexture) return glowTexture;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    glowTexture = createTexture(cv);
    return glowTexture;
  }

  function makeGlowSprite(color, scale) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), color: color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9
    }));
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  function ensureProjMesh(p, i) {
    let pm = projMeshes[i];
    const friendly = !!p.friendly;
    if (!pm || pm.kind !== p.kind || pm.element !== (p.element || null) || pm.friendly !== friendly) {
      if (pm && pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
      const mesh = DS.Voxel.buildProjectile(p.kind, p.element, friendly);
      /* Halo + flash ride along as sprite children, so they always face the
         camera and cost nothing to place. */
      const col = friendly ? 0x9fd8ff : 0xff6a4a;
      const halo = makeGlowSprite(col, 1.5);
      mesh.add(halo);
      const flash = makeGlowSprite(0xffd8a0, 3.2);
      flash.visible = false;
      mesh.add(flash);
      pm = { mesh: mesh, halo: halo, flash: flash, kind: p.kind,
             element: p.element || null, friendly: friendly };
      projMeshes[i] = pm;
      fxGroup.add(mesh);
    }
    return pm;
  }

  function syncProjectiles(g, time) {
    const count = g.projectiles.length;
    // Trails and impacts feed the pooled FX once per GAME frame, not per draw.
    const fxStep = DS.FX3D && DS.FX3D.ready && g.frames !== projFrame;
    if (fxStep) projFrame = g.frames;
    for (let i = 0; i < count; i++) {
      const p = g.projectiles[i];
      const pm = ensureProjMesh(p, i);
      pm.mesh.visible = true;
      pm.mesh.position.set((p.x + p.w * 0.5) * P2U, -(p.y + p.h * 0.5) * P2U, 0.35);
      if (fxStep && p.friendly) projFx(g, p, pm.mesh.position.x, pm.mesh.position.y, 0.35);
      const angle = Math.atan2(p.vy, p.vx);
      if (p.kind === 'arrow') {
        pm.mesh.rotation.z = -angle;
      } else {
        /* Orbs are pointed down their own flight path instead of spinning: an
           orb that always faces where it is going tells you where it is going. */
        pm.mesh.rotation.z = -angle;
        pm.mesh.rotation.y = Math.sin(time * 4 + i) * 0.3;
      }
      if (pm.halo) {
        const pulse = 0.85 + Math.sin(time * 9 + i) * 0.15;
        const size = (p.friendly ? 1.4 : 1.9) * pulse;
        pm.halo.scale.set(size, size, 1);
        pm.halo.material.opacity = p.friendly ? 0.45 : 0.75;
      }
      /* Muzzle flash: the first frames of a hostile shot, so the player reads
         WHERE it came from before the projectile arrives. */
      if (pm.flash) {
        const age = p.frame || 0;
        const shown = !p.friendly && age < 9;
        pm.flash.visible = shown;
        if (shown) {
          const k = 1 - age / 9;
          const s = 3.4 - k * 2.2;
          pm.flash.scale.set(s, s, 1);
          pm.flash.material.opacity = 0.35 + k * 0.6;
        }
      }
    }
    for (let i = count; i < projMeshes.length; i++) projMeshes[i].mesh.visible = false;
    if (fxStep) projImpacts(g);
  }

  /* --- elemental ground FX, built out of real geometry ----------------------

     A flat glowing slab on the floor was never going to sell "the ground is on
     fire": it read as a sticker (and as a puddle for every element, including
     the ones that are not wet). Every element now has a RECIPE saying what
     grows OUT of the floor, in which colours, and how it moves - flame jets,
     ice shards, arcing cracks, bubbling vents, ripples, rubble, vines, a dust
     swirl. One builder turns a recipe into a rig, so an enemy's burning feet
     and a 40px fire patch are the same hardware at different scales, and adding
     an element is a table entry rather than another special case. */
  const ELEM_RECIPE = {
    fire:      { core: 0xe8743b, accent: 0xfff0a8, shape: 'jets',    n: 5, h: 0.66, light: 0xff7a2a, rise: 1.6 },
    ice:       { core: 0x4fb3e0, accent: 0xcdefff, shape: 'shards',  n: 7, h: 0.86, light: 0x4fb3e0, rise: 0 },
    lightning: { core: 0xf2c14e, accent: 0xfff0a8, shape: 'arcs',    n: 5, h: 0.58, light: 0xf2c14e, rise: 0 },
    poison:    { core: 0x5cbf62, accent: 0xa3e86b, shape: 'vents',   n: 5, h: 0.34, light: 0x5cbf62, rise: 1.2 },
    water:     { core: 0x2f6fa8, accent: 0x4fb3e0, shape: 'ripples', n: 3, h: 0.05, light: 0,        rise: 0 },
    earth:     { core: 0xb98d5c, accent: 0x8a6340, shape: 'rubble',  n: 8, h: 0.44, light: 0,        rise: 0 },
    leaf:      { core: 0xa3e86b, accent: 0x5cbf62, shape: 'vines',   n: 6, h: 0.50, light: 0,        rise: 0 },
    wind:      { core: 0xcfe8e0, accent: 0xffffff, shape: 'swirl',   n: 7, h: 0.55, light: 0,        rise: 0 },
    steam:     { core: 0xd8d5e8, accent: 0xffffff, shape: 'vents',   n: 4, h: 0.30, light: 0,        rise: 1.0 }
  };

  /* Rigs are pooled PER ELEMENT, because the geometry differs per element -
     recycling a fire rig as an ice rig would just be a rebuilt rig. */
  let elemPool = {};
  let liveRigs = [];

  function glowMat(color, opacity) {
    return new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
  }

  function buildElemRig(el) {
    const rec = ELEM_RECIPE[el] || ELEM_RECIPE.fire;
    const group = new THREE.Group();
    const parts = [];
    function rnd(a, b) { return a + Math.random() * (b - a); }

    /* Every element starts with a patch on the floor for the effect to come OUT
       of, so the ground visibly reacts instead of being decorated.

       It used to be a near-black disc at half opacity, scaled to the field's
       radius -- which is a dark blob the size of the skill, painted on the
       floor, every single time an elemental skill landed. That reads as the
       ground going black where the effect hit (and as a puddle for every
       element, including the ones that are not wet). It is a GLOW in the
       element's own colour now: the floor lights up where the element burns,
       which is what the effect is supposed to say in the first place. */
    const scar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 0.03, 12),
      glowMat(rec.core, 0.14)
    );
    scar.position.y = 0.015;
    group.add(scar);
    parts.push({ mesh: scar, kind: 'scar', base: 0.5 });

    for (let i = 0; i < rec.n; i++) {
      const a = (i / rec.n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const r = rnd(0.06, 0.44);
      const col = (i % 2) ? rec.accent : rec.core;
      let mesh = null;
      let kind = rec.shape;

      if (rec.shape === 'jets') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(0.11, rec.h, 5), glowMat(col, 0.8));
        mesh.position.set(Math.cos(a) * r, rec.h * 0.5, Math.sin(a) * r);
      } else if (rec.shape === 'shards') {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(0.085, rec.h, 4), glowMat(col, 0.72));
        mesh.position.set(Math.cos(a) * r, rec.h * 0.5, Math.sin(a) * r);
        mesh.rotation.set(rnd(-0.3, 0.3), a, rnd(-0.3, 0.3));
      } else if (rec.shape === 'arcs') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, rec.h, 0.05), glowMat(col, 0.9));
        mesh.position.set(Math.cos(a) * r, rec.h * 0.5, Math.sin(a) * r);
        mesh.rotation.set(rnd(-0.6, 0.6), a, rnd(-0.6, 0.6));
      } else if (rec.shape === 'vents') {
        // A bubble that climbs the vent and fades out at the top.
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), glowMat(col, 0.75));
        mesh.position.set(Math.cos(a) * r, rnd(0, rec.h), Math.sin(a) * r);
      } else if (rec.shape === 'ripples') {
        mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.3, 0.5, 16),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5,
            side: THREE.DoubleSide, depthWrite: false })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, 0.03 + i * 0.012, 0);
        kind = 'ripple';
      } else if (rec.shape === 'rubble') {
        const s = rnd(0.07, 0.16);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * 1.3, s),
          propMat({ color: col }));
        mesh.position.set(Math.cos(a) * r, s * 0.65, Math.sin(a) * r);
        mesh.rotation.set(rnd(-0.4, 0.4), a, rnd(-0.4, 0.4));
      } else if (rec.shape === 'vines') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, rec.h, 0.05), glowMat(col, 0.85));
        mesh.position.set(Math.cos(a) * r, rec.h * 0.5, Math.sin(a) * r);
        mesh.rotation.z = rnd(-0.45, 0.45);
      } else { // swirl
        mesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), glowMat(col, 0.5));
        mesh.position.set(Math.cos(a) * r, rnd(0.1, rec.h), Math.sin(a) * r);
      }

      group.add(mesh);
      parts.push({
        mesh: mesh, kind: kind, base: mesh.position.y,
        phase: rnd(0, Math.PI * 2), r: r, a: a, speed: rnd(0.6, 1.4)
      });
    }

    /* Fire, ice, lightning and poison glow their own patch of floor. The rig
       does not own a light: `glow` is what it wants, and the fixed element
       pool lights the nearest few patches (see ELEM_LIGHTS), so a churning
       fight cannot grow the scene's light count. */
    /* Every rig carries its OWN phase. The glow below used to be phased off
       parts[0], which is the scar disc -- and the scar is the one part with no
       phase of its own, so `Math.sin(t * 3 + undefined)` made the rig's glow
       NaN. That NaN went straight into a point light's intensity, and a NaN
       light poisons the shading of every lit material in the scene: the frame
       went dark the moment fire, lightning or poison landed. A per-rig phase is
       what the animation wanted in the first place. */
    const rig = { group: group, parts: parts, element: el, rec: rec, glow: 0, fade: 1,
                  key: null, phase: rnd(0, Math.PI * 2) };

    fxGroup.add(group);
    return rig;
  }

  function acquireRig(el) {
    const pool = elemPool[el] || (elemPool[el] = []);
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].key === null) {
        pool[i].group.visible = true;
        if (pool[i].group.parent !== fxGroup) fxGroup.add(pool[i].group);
        liveRigs.push(pool[i]);
        return pool[i];
      }
    }
    const rig = buildElemRig(el);
    pool.push(rig);
    liveRigs.push(rig);
    return rig;
  }

  function releaseRig(rig) {
    if (!rig) return;
    rig.key = null;
    rig.group.visible = false;
    const i = liveRigs.indexOf(rig);
    if (i >= 0) liveRigs.splice(i, 1);
  }

  /* Sit a rig on the floor at a world position, scaled to a radius in pixels.
     The rig's own scar is a 0.58-unit disc, so the scale is r / 0.58. */
  function placeRig(rig, x, y, radius) {
    const g2 = rig.group;
    g2.position.x = x * P2U;
    g2.position.z = 0.06;
    g2.position.y = -Math.max(0.5, (y - 1) * P2U) + 0.02;
    const s = Math.max(0.35, (radius * P2U) / 0.58);
    g2.scale.set(s, 1, s);
  }

  /* Per-shape animation. Everything is driven from the rig's own parts, so the
     look of each element is data, not a branch per call site. */
  function animateRig(rig, t) {
    const fade = rig.fade;
    const rec = rig.rec;
    for (let i = 0; i < rig.parts.length; i++) {
      const p = rig.parts[i];
      const mesh = p.mesh;
      if (!mesh.material) continue;
      const wob = Math.sin(t * p.speed * 2 + p.phase);

      if (p.kind === 'scar') {
        mesh.material.opacity = 0.14 * fade;   // a floor glow, not a floodlight
      } else if (p.kind === 'jets') {
        mesh.scale.y = 0.75 + 0.35 * (wob * 0.5 + 0.5);
        mesh.material.opacity = (0.55 + 0.3 * (wob * 0.5 + 0.5)) * fade;
      } else if (p.kind === 'shards') {
        mesh.material.opacity = (0.55 + 0.22 * (wob * 0.5 + 0.5)) * fade;
      } else if (p.kind === 'arcs') {
        // Arcs snap on and off rather than glowing steadily.
        const blip = (Math.sin(t * 9 + p.phase * 3) > 0.25) ? 1 : 0;
        mesh.material.opacity = (blip ? 0.95 : 0.15) * fade;
      } else if (p.kind === 'vents') {
        const climb = ((t * p.speed * 0.55 + p.phase) % 1);
        mesh.position.y = 0.05 + climb * rec.h;
        mesh.material.opacity = (1 - climb) * 0.8 * fade;
      } else if (p.kind === 'ripple') {
        const cyc = ((t * 0.4 + p.phase / 6.28) % 1);
        const s = 0.35 + cyc * 0.85;
        mesh.scale.set(s, s, 1);
        mesh.material.opacity = (1 - cyc) * 0.55 * fade;
      } else if (p.kind === 'rubble') {
        mesh.material.opacity = 1;   // solid rock, nothing to fade
      } else if (p.kind === 'vines') {
        mesh.rotation.z = p.base * 0 + Math.sin(t * 0.9 + p.phase) * 0.12;
        mesh.material.opacity = (0.7 + 0.2 * (wob * 0.5 + 0.5)) * fade;
      } else if (p.kind === 'swirl') {
        const a = p.a + t * p.speed * 0.9;
        mesh.position.x = Math.cos(a) * p.r;
        mesh.position.z = Math.sin(a) * p.r;
        mesh.rotation.y = a;
        mesh.material.opacity = 0.5 * fade;
      }
    }
    /* What the rig WANTS the fixed element pool to shine at. Never allowed to
       be non-finite: a light's intensity is one of the few values that can take
       the whole frame down with it (see the note on the rig's phase). */
    const glow = rec && rec.light
      ? (0.35 + 0.2 * (Math.sin(t * 3 + rig.phase) * 0.5 + 0.5)) * fade
      : 0;
    rig.glow = Number.isFinite(glow) ? glow : 0;
  }

  function animateLiveRigs(t) {
    for (let i = 0; i < liveRigs.length; i++) animateRig(liveRigs[i], t);
  }

  const liveFieldSet = new Set();

  // Ground field: the burning patch / poison cloud the player stood in.
  function syncElemFields(g, time) {
    if (!g.fields) g.fields = [];
    const fields = g.fields;

    // Retire rigs whose field is gone (fields are compacted, so match by index
    // through the record we stored on the field itself).
    liveFieldSet.clear();
    for (let i = 0; i < fields.length; i++) liveFieldSet.add(fields[i]);
    let holes = 0;
    for (let i = 0; i < elemFields.length; i++) {
      const entry = elemFields[i];
      if (entry && entry.field && !liveFieldSet.has(entry.field)) {
        releaseRig(entry.rig);
        elemFields[i] = null;
      }
      if (!elemFields[i]) holes++;
    }
    if (holes > 16) elemFields = elemFields.filter(Boolean);

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      let entry = f.__rig;
      if (!entry) {
        const rig = acquireRig(f.element);
        rig.key = 'f' + i;
        entry = { rig: rig, field: f };
        f.__rig = entry;
        elemFields.push(entry);
      }
      entry.rig.fade = Math.min(1, f.life / 40);
      placeRig(entry.rig, f.x, f.y, f.r);
    }

    animateLiveRigs(time || 0);

    /* The element pool, pointed at the closest lit patches. Constant count,
       like the flame pool: two lights exist from boot and are only ever moved
       and re-coloured (see FLAME_LIGHTS for why that matters). */
    const p2 = g.player;
    const px = p2 ? (p2.x + p2.w * 0.5) * P2U : 0;
    const py = p2 ? -(p2.y + p2.h) * P2U : 0;
    for (let i = 0; i < elemLightPool.length; i++) {
      const l = elemLightPool[i];
      l.intensity = 0;
      l.position.set(0, -999, 0.3);
      let bestI = -1, bestD = Infinity;
      for (let j = 0; j < liveRigs.length; j++) {
        const rig = liveRigs[j];
        if (!rig.rec || !rig.rec.light || rig.glow <= 0.02) continue;
        const gp = rig.group.position;
        const dx = gp.x - px, dy = gp.y - py;
        const d2 = dx * dx + dy * dy;
        let taken = false;
        for (let k = 0; k < i; k++) {
          if (elemLightPool[k].userData.rig === rig) { taken = true; break; }
        }
        if (!taken && d2 < bestD) { bestD = d2; bestI = j; }
      }
      if (bestI >= 0) {
        const rig = liveRigs[bestI];
        const gpx = rig.group.position.x, gpy = rig.group.position.y;
        /* The last gate before a value becomes light. A non-finite intensity
           does not dim a frame, it BLACKS it out, so it is refused here even if
           everything upstream is already careful. */
        if (!Number.isFinite(gpx) || !Number.isFinite(gpy) ||
            !Number.isFinite(rig.glow) || rig.glow <= 0) {
          l.userData.rig = null;
          continue;
        }
        l.userData.rig = rig;
        l.position.set(gpx, gpy + 0.9, 0.6);
        l.color.setHex(rig.rec.light);
        // Half strength: a monster standing in its own patch was lit chalk-white.
        l.intensity = rig.glow * 0.5;
      } else {
        l.userData.rig = null;
      }
    }
  }

  /* --- pooled one-shot FX ------------------------------------------------------

     Ground bursts, swing arcs and smoke used to build a fresh BoxGeometry and a
     fresh material for every piece of every hit, and dispose them twenty frames
     later -- hundreds of GPU buffer uploads a second in a busy fight, and the
     GC sawtooth that came with them. They now share ONE unit box (scaled per
     piece) and come from free lists; a burst or an arc owns one material for all
     its pieces because its pieces always fade together. */
  const unitBox = new THREE.BoxGeometry(1, 1, 1);   // shared, never disposed

  function fxMaterial(color, opacity, additive) {
    return new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
  }

  function attachFx(obj) {
    if (obj.parent !== fxGroup) fxGroup.add(obj);
    obj.visible = true;
  }

  /* Skill FX on the floor, in 3D: a short-lived ring of glowing voxel shards
     that scatter along the ground from an elemental hit. Called automatically
     from the FX.element hook so every 2D emitter also dirties the 3D floor. */
  const BURST_PIECES = 14;
  const burstFree = [];

  function makeBurst() {
    const mat = fxMaterial(0xffffff, 0.95, true);
    const group = new THREE.Group();
    const pieces = [];
    for (let i = 0; i < BURST_PIECES; i++) {
      const m = new THREE.Mesh(unitBox, mat);
      m.userData.vx = 0; m.userData.vy = 0; m.userData.vz = 0;
      group.add(m);
      pieces.push(m);
    }
    return { group: group, mat: mat, pieces: pieces, n: 0, life: 0, maxLife: 26 };
  }

  function spawnGroundBurst(element, px, py, power) {
    // The pooled layer draws this as the element's own ambient burst.
    if (DS.FX3D && DS.FX3D.ready) {
      DS.FX3D.kit(element).ambient(px * P2U, -py * P2U + 0.05, ACTOR_Z, power || 1);
      return;
    }
    if (!fxGroup || !DS.Voxel) return;
    const gb = burstFree.pop() || makeBurst();
    gb.mat.color.setHex(DS.Voxel.elementColorHex(element) || 0xffffff);
    gb.mat.opacity = 0.95;
    const n = Math.min(BURST_PIECES, 7 + Math.round((power || 1) * 3));
    for (let i = 0; i < BURST_PIECES; i++) {
      const m = gb.pieces[i];
      m.visible = i < n;
      if (i >= n) continue;
      const s = 0.09 + Math.random() * 0.1;
      m.scale.set(s, s * 0.55, s);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = 0.3 + Math.random() * 0.9 * (power || 1);
      m.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d * 0.45);
      m.userData.vx = Math.cos(a) * (0.014 + Math.random() * 0.024);
      m.userData.vz = Math.sin(a) * (0.007 + Math.random() * 0.012);
      m.userData.vy = 0.025 + Math.random() * 0.06;
    }
    gb.n = n;
    gb.life = gb.maxLife = 26;
    gb.group.position.set(px * P2U, -py * P2U, 0.1);
    attachFx(gb.group);
    groundBursts.push(gb);
  }

  function updateGroundBursts() {
    for (let i = groundBursts.length - 1; i >= 0; i--) {
      const gb = groundBursts[i];
      gb.life--;
      const t = Math.max(0, gb.life / gb.maxLife);
      for (let k = 0; k < gb.n; k++) {
        const m = gb.pieces[k];
        m.position.x += m.userData.vx;
        m.position.z += m.userData.vz;
        m.userData.vy -= 0.004;              // gravity back to the floor
        m.position.y += m.userData.vy;
        if (m.position.y < 0.03) { m.position.y = 0.03; m.userData.vy = 0; }
      }
      gb.mat.opacity = 0.95 * t;
      if (gb.life <= 0) {
        gb.group.visible = false;
        fxGroup.remove(gb.group);
        burstFree.push(gb);
        groundBursts.splice(i, 1);
      }
    }
  }

  /* Smoke, in 3D: a puff of drifts that rises and slows. Emitted by the charge
     wind-up (FX.smoke) so holding an attack leaves a real wake in the world
     instead of only 2D dots on top of it. Each puff fades on its own clock, so
     each pooled puff keeps its own material -- created once, reused forever. */
  let smokePuffs = [];
  const smokeFree = [];
  const MAX_SMOKE = 90;

  function spawnSmokePuff(px, py, vx, vy, opts) {
    opts = opts || {};
    /* One soft billboard in the pooled alpha layer instead of a box mesh (and
       a draw call) per puff. */
    const F = DS.FX3D;
    if (F && F.ready) {
      const size = (opts.size || 2) * 0.06;
      F.puffAt(px * P2U, -py * P2U, ACTOR_Z - 0.05, (vx || 0) * P2U * 0.4, -(vy || 0) * P2U * 0.4 + 0.008, 0,
               size, size * 2.6, F.cssHex(opts.color || '#9b96b8'), 0.5, opts.life || 22);
      return;
    }
    if (!fxGroup || smokePuffs.length >= MAX_SMOKE) return;
    const s = (opts.size || 2) * 0.055;
    const mesh = smokeFree.pop() || new THREE.Mesh(unitBox, fxMaterial(0x9b96b8, 0.5, false));
    mesh.material.color.set(opts.color || '#9b96b8');
    mesh.material.opacity = 0.5;
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(s);
    mesh.position.set(px * P2U, -py * P2U, 0.28);
    attachFx(mesh);
    smokePuffs.push({
      mesh: mesh,
      size: s,
      // Screen px per frame -> world units, and a slow rise.
      vx: (vx || 0) * P2U * 0.05,
      vy: -(vy || 0) * P2U * 0.05 + 0.012,
      life: opts.life || 22,
      maxLife: opts.life || 22,
      grow: 1 + Math.random() * 0.6
    });
  }

  function updateSmokePuffs() {
    for (let i = smokePuffs.length - 1; i >= 0; i--) {
      const p = smokePuffs[i];
      p.life--;
      const t = Math.max(0, p.life / p.maxLife);
      p.mesh.position.x += p.vx * (1.6 - t);
      p.mesh.position.y += p.vy * (1.6 - t);
      p.mesh.rotation.y += 0.03;
      p.mesh.scale.setScalar(p.size * (1 + (1 - t) * p.grow));
      p.mesh.material.opacity = 0.5 * t * t;
      if (p.life <= 0) {
        p.mesh.visible = false;
        fxGroup.remove(p.mesh);
        smokeFree.push(p.mesh);
        smokePuffs.splice(i, 1);
      }
    }
  }

  /* A level swap hands every live one-shot back to its pool. */
  function releasePooledFx() {
    if (DS.FX3D) DS.FX3D.clear();
    heroTrail = 0;
    heroDashTrail = 0;
    heroAuraEl = null;
    projPrev.length = 0;
    projNow.length = 0;
    for (let i = 0; i < groundBursts.length; i++) {
      groundBursts[i].group.visible = false;
      burstFree.push(groundBursts[i]);
    }
    groundBursts = [];
    for (let i = 0; i < swingFx.length; i++) {
      swingFx[i].group.visible = false;
      swingFree.push(swingFx[i]);
    }
    swingFx = [];
    for (let i = 0; i < smokePuffs.length; i++) {
      smokePuffs[i].mesh.visible = false;
      smokeFree.push(smokePuffs[i].mesh);
    }
    smokePuffs = [];
  }

  // Per-enemy status puddle API used by Elements.tick.
  /* Per-enemy status aura: the same rig at foot scale, so a burning monster
     stands IN flames instead of on a coloured sticker. */
  function spawnElemPuddle(el, x, y) {
    const rig = acquireRig(el);
    rig.fade = 1;
    placeRig(rig, x, y, 9);
    return rig;
  }
  function updateElemPuddle(rig, x, y) {
    if (rig) placeRig(rig, x, y, 9);
  }
  function removeElemPuddle(rig) {
    releaseRig(rig);
  }

  /* A level swap builds a new world under the same rigs; anything still live
     belongs to the floor it was planted on, so it all goes back to the pool. */
  function clearElemRigs() {
    for (let i = liveRigs.length - 1; i >= 0; i--) releaseRig(liveRigs[i]);
    elemFields = [];
    elemPuddles = [];
    for (let i = 0; i < elemLightPool.length; i++) {
      elemLightPool[i].intensity = 0;
      elemLightPool[i].userData.rig = null;
      elemLightPool[i].position.set(0, -999, 0.3);
    }
  }

  // Lightning: a jagged additive strip from a to b, rebuilt while alive.
  function syncElemBolts(g) {
    if (!g.bolts) g.bolts = [];
    const bolts = g.bolts;
    /* Pooled path: a fresh jagged bolt every other frame of a bolt's life, so
       it crackles and re-forks instead of sitting there as one straight bar. */
    const F = DS.FX3D;
    if (F && F.ready) {
      for (let i = 0; i < bolts.length; i++) {
        const b = bolts[i];
        if (g.frames - (b.fxAt == null ? -99 : b.fxAt) < 2) continue;
        b.fxAt = g.frames;
        const w = b.life > 6 ? 0.06 : 0.035;
        F.bolt(b.x1 * P2U, -b.y1 * P2U, ACTOR_Z, b.x2 * P2U, -b.y2 * P2U, ACTOR_Z,
               6, 0.22, w, F.cssHex(b.color || '#fff0a8'), 3, 2.4);
        if (b.life > 6) F.glowAt(b.x2 * P2U, -b.y2 * P2U, ACTOR_Z, 0.9, F.cssHex(b.color || '#fff0a8'), 1.4, 4);
      }
      for (let i = 0; i < elemBolts.length; i++) {
        if (elemBolts[i].mesh.visible) elemBolts[i].mesh.visible = false;
      }
      return;
    }
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      let entry = elemBolts[i];
      if (!entry) {
        const geo = new THREE.BoxGeometry(1, 0.05, 0.05);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xfff0a8, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        fxGroup.add(m);
        entry = { mesh: m };
        elemBolts[i] = entry;
      }
      const x1 = b.x1 * P2U, y1 = -b.y1 * P2U, x2 = b.x2 * P2U, y2 = -b.y2 * P2U;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
      entry.mesh.visible = true;
      entry.mesh.scale.set(len, 1, 1);
      entry.mesh.position.set(x1 + dx * 0.5, y1 + dy * 0.5, 0.35);
      entry.mesh.rotation.z = Math.atan2(dy, dx);
      entry.mesh.material.opacity = b.life > 6 ? 0.9 : 0.4;
    }
    for (let i = bolts.length; i < elemBolts.length; i++) {
      if (elemBolts[i].mesh.visible) elemBolts[i].mesh.visible = false;
    }
  }

  /* Melee swing arc: a fan of additive boxes sweeping the hit area, spawned
     on an actual hit so the blow reads in 3D the way the 2D trail did. Pooled:
     one group of segments and one material per arc, reused. */
  const SWING_SEGS = 6;
  const swingFree = [];

  function makeSwing() {
    const mat = fxMaterial(0xe8e8f4, 0.85, true);
    const group = new THREE.Group();
    const segs = [];
    for (let i = 0; i < SWING_SEGS; i++) {
      const seg = new THREE.Mesh(unitBox, mat);
      group.add(seg);
      segs.push(seg);
    }
    return { group: group, mat: mat, segs: segs, life: 0, maxLife: 10 };
  }

  function spawnSwingArc(x, y, dir, heavy) {
    // Superseded by the per-step crescents in src/fx3d/presets.js.
    if (DS.FX3D && DS.FX3D.ready) return;
    if (!fxGroup) return;
    const sw = swingFree.pop() || makeSwing();
    sw.mat.color.setHex(heavy ? 0xfff0a8 : 0xe8e8f4);
    sw.mat.opacity = 0.85;
    const R = heavy ? 2.3 : 1.7;
    const count = heavy ? 6 : 5;
    for (let i = 0; i < SWING_SEGS; i++) {
      const seg = sw.segs[i];
      seg.visible = i < count;
      if (i >= count) continue;
      const a = (-0.95 + (i / (count - 1)) * 1.9) * dir;
      seg.scale.set(0.3, heavy ? 0.17 : 0.11, 0.03);
      seg.position.set(Math.sin(a) * R, Math.cos(a) * R * 0.6, 0);
      seg.rotation.set(0, 0, -a);
    }
    sw.group.scale.setScalar(1);
    sw.group.position.set(x * P2U, -y * P2U, 0.4);
    sw.life = sw.maxLife = 10;
    attachFx(sw.group);
    swingFx.push(sw);
  }

  function updateSwingFx() {
    for (let i = swingFx.length - 1; i >= 0; i--) {
      const sw = swingFx[i];
      sw.life--;
      const t = Math.max(0, sw.life / sw.maxLife);
      sw.mat.opacity = 0.85 * t;
      sw.group.scale.setScalar(1 + (1 - t) * 0.45);
      if (sw.life <= 0) {
        sw.group.visible = false;
        fxGroup.remove(sw.group);
        swingFree.push(sw);
        swingFx.splice(i, 1);
      }
    }
  }

  /* What colour a drop glows: its own metal or its rarity, so a legendary sword
     on the floor is visibly a legendary find from across the room. */
  function dropColor(pk) {
    if (pk.kind === 'item' && pk.item && DS.Weapons.rarityColor) {
      return new THREE.Color(DS.Weapons.rarityColor(pk.item.rarity));
    }
    if (pk.kind === 'heart') return new THREE.Color(0xc0303c);
    if (pk.kind === 'shard') return new THREE.Color(0x4fb3e0);
    if (pk.kind === 'key') return new THREE.Color(0xffe066);
    return new THREE.Color(0xd4a046);
  }

  // Identity of a drop's look, so a re-tint only happens when it changes.
  function dropKey(pk) {
    return pk.kind === 'item' && pk.item ? pk.kind + ':' + pk.item.rarity : pk.kind;
  }

  /* Rarities that earn a light shaft. The chest beam already taught the player
     to read one as "something worth walking to".

     NOTE: item.rarity is an INDEX into Weapons.RARITY, not a name — comparing
     it to 'epic' silently matched nothing and no drop ever got a beam. */
  const BEAM_KEYS = { epic: true, legendary: true };

  function rarityKeyOf(item) {
    if (!item || !DS.Weapons.RARITY) return null;
    const cfg = DS.Weapons.RARITY[item.rarity];
    return cfg ? cfg.key : null;
  }

  function wantsBeam(pk) {
    if (pk.kind !== 'item' || !pk.item) return false;
    return !!BEAM_KEYS[rarityKeyOf(pk.item)];
  }

  /* Drops are read across a room, and the models are authored small — so each
     kind is blown up to roughly the footprint its 2D sprite used to occupy
     (coin 6px, heart 8, shard 7, key 8, item icon 12). Without this the loot
     was three logical pixels of nothing on a 320x180 screen. */
  const DROP_SCALE = { coin: 1.5, heart: 2.1, shard: 2.1, key: 1.7, item: 3.0 };

  const dropGlowGeo = new THREE.PlaneGeometry(1.9, 1.9);

  function ensurePickupMesh(pk, i) {
    let pm = pickupMeshes[i];
    if (!pm || pm.kind !== pk.kind) {
      if (pm && pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
      const mesh = shadowize(DS.Voxel.buildPickup(pk.kind,
        pk.kind === 'item' ? DS.Weapons.rarityColor(pk.item.rarity) : null));
      const col = dropColor(pk);

      // A pool of light on the floor, so the drop is not a speck lost in the
      // dark. Flat, additive, and it never writes depth — it is a glow, not
      // an object.
      const glow = new THREE.Mesh(dropGlowGeo, new THREE.MeshBasicMaterial({
        map: glowTex, color: col, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.03;
      mesh.add(glow);

      /* The shaft, for the drops that deserve one. A sprite, not a cylinder:
         the glow texture fades out at the edges, so it reads as a column of
         light instead of a brown post, and it always faces the camera. */
      const beam = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: col, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      beam.scale.set(1.0, 3.8, 1);
      beam.position.y = 1.85;
      beam.visible = wantsBeam(pk);
      mesh.add(beam);

      pm = { mesh, kind: pk.kind, glow, beam, age: 0, dye: dropKey(pk) };
      pickupMeshes[i] = pm;
      fxGroup.add(mesh);
    }

    // An item whose rarity changed re-tints its glow, and a drop that becomes
    // worth a shaft (or stops being) toggles its beam.
    const want = wantsBeam(pk);
    if (pm.beam && pm.beam.visible !== want) pm.beam.visible = want;
    const key = dropKey(pk);
    if (pm.dye !== key) {
      pm.dye = key;
      const col = dropColor(pk);
      if (pm.glow) pm.glow.material.color.copy(col);
      if (pm.beam) pm.beam.material.color.copy(col);
    }
    return pm;
  }

  function syncPickups(g, time) {
    const count = g.pickups.length;
    for (let i = 0; i < count; i++) {
      const pk = g.pickups[i];
      const pm = ensurePickupMesh(pk, i);
      const blink = pk.life < 60 && Math.floor(pk.life / 5) % 2 === 0;
      pm.mesh.visible = !blink;
      /* Anchor at the pickup's own BOTTOM edge and follow the 2D physics: the
         sim's bounce settles it on the floor, so the mesh lands with it. The
         old centre anchor read as half-buried; a big floor probe read as
         floating. A shallow shimmer bob plays only once it has settled. */
      const settled = Math.abs(pk.vy || 0) < 0.06 && pk.onGround !== false;
      const bobY = settled ? Math.sin(time * 3 + i) * 0.045 + 0.04 : 0.03;
      pm.mesh.position.set((pk.x + pk.w * 0.5) * P2U,
                           -(pk.y + pk.h) * P2U + bobY,
                           0.3);
      pm.mesh.rotation.y = time * 2.4 + i;

      /* Landing pop: the drop scales up out of nothing over ~4 frames and
         overshoots slightly, which is what pulls the eye to where it fell. */
      pm.age = (pm.age || 0) + 1;
      const pop = M.clamp(pm.age / 6, 0, 1);
      const over = 1 + Math.sin(pop * Math.PI) * 0.25;
      const size = DROP_SCALE[pk.kind] || 1.4;
      pm.mesh.scale.setScalar(Math.max(0.05, pop * over) * size);

      // Breathing glow + a slow turn on the shaft so it reads as light.
      if (pm.glow) {
        pm.glow.material.opacity = 0.7 + Math.sin(time * 2.6 + i) * 0.16;
      }
      if (pm.beam && pm.beam.visible) {
        pm.beam.material.opacity = 0.42 + Math.sin(time * 2.0 + i * 1.7) * 0.12;
      }
    }
    for (let i = count; i < pickupMeshes.length; i++) pickupMeshes[i].mesh.visible = false;
  }

  /* Puzzles: mirrors the lever state and slides the gates with their lift. */
  function syncPuzzles(g) {
    if (!g.puzzles) { gateMeshes.forEach(gm => { gm.group.visible = false; }); return; }

    // Gates (vault gates and barrier keygates both).
    for (let i = 0; i < gateMeshes.length; i++) {
      const gm = gateMeshes[i];
      const gate = gm.gate;
      gm.group.visible = gate.lift < gate.h - 2;
      const gy = -(gate.y + gate.h * 0.5) * P2U;
      gm.group.position.set((gate.x + gate.w * 0.5) * P2U, gy, 0.05);
    }
    for (let i = 0; i < leverMeshes.length; i++) {
      const lm = leverMeshes[i];
      const on = lm.lever.on;
      const target = on ? 0.85 : -0.85;
      lm.pivot.rotation.z = M.approach(lm.pivot.rotation.z, target, 0.12);
      lm.knobMat.color.setHex(on ? 0x5cbf62 : 0xc0303c);
    }
    for (let i = 0; i < crateMeshes.length; i++) {
      const cm = crateMeshes[i];
      const c = cm.crate;
      cm.group.position.set((c.x + c.w * 0.5) * P2U, -(c.y + c.h) * P2U, 0.12);
    }

    // Trial braziers: the flame comes up as each plate is held, so the hall's
    // progress is legible from the far end of the room.
    for (let i = 0; i < brazierMeshes.length; i++) {
      const bm = brazierMeshes[i];
      const lit = !!(bm.ref && bm.ref.lit);
      bm.smooth += ((lit ? 1 : 0) - bm.smooth) * 0.12;
      if (flameBatch) {
        const on = bm.smooth > 0.05 ? bm.smooth : 0;
        flameBatch.setSize(bm.flameIdx, on ? 0.56 + on * 0.18 : 0, on ? 0.7 + on * 0.62 : 0);
      }
      if (poolBatch) {
        poolBatch.setLevel(bm.poolIdx, bm.smooth * (DS.TorchLight ? DS.TorchLight.flicker(frameSec, bm.phase) : 1));
      }
      /* A brazier has no light of its own (the flame pool lights it; see
         assignFlameLights), so there is no `light` to write -- this line used
         to throw on every floor that had one. */
      if (bm.light) bm.light.intensity = bm.smooth * TORCH_I;
      bm.coalMat.emissive.setRGB(bm.smooth * 0.85, bm.smooth * 0.3, 0);
    }
  }

  function syncShrine(g, time) {
    if (!shrineMesh) return;
    if (!g.shrine) { shrineMesh.root.visible = false; return; }
    const s = g.shrine;
    shrineMesh.root.visible = true;
    shrineMesh.root.position.set((s.x + 8) * P2U, -(s.y + 16) * P2U, 0.12);
    if (shrineMesh.rune) {
      shrineMesh.rune.position.y = 1.75 + Math.sin(time * 2.2) * 0.06;
      shrineMesh.rune.rotation.y = time * 1.4;
      shrineMesh.rune.visible = !s.used;
    }
  }

  function w0(g) { return g.map ? g.map.pixelW : 0; }

  const shadowPool = [];
  const shadowGeo = new THREE.PlaneGeometry(1.2, 0.4);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
  });

  function getShadowMesh(idx) {
    if (idx < shadowPool.length) return shadowPool[idx];
    const m = new THREE.Mesh(shadowGeo, shadowMat);
    m.position.z = 0.05;
    shadowGroup.add(m);
    shadowPool.push(m);
    return m;
  }

  const TORCH_COL = 0xff9e38;
  let frameSec = 0;             // the flicker clock: game frames / 60

  /* Every emitter on the floor, as the pool sees it: torches, braziers and the
     exit portal. Rebuilt once per level (lazily, on the first frame), then
     only its numbers are written. */
  function rebuildEmitters() {
    emitters = [];
    const TL = DS.TorchLight;
    for (let i = 0; i < torchLights.length; i++) {
      emitters.push(TL.resetEmitter({ x: 0, y: 0, lit: 0, kind: 0, src: torchLights[i] }));
    }
    for (let i = 0; i < brazierMeshes.length; i++) {
      emitters.push(TL.resetEmitter({ x: 0, y: 0, lit: 0, kind: 1, src: brazierMeshes[i] }));
    }
    if (doorPortalObj) emitters.push(TL.resetEmitter({ x: 0, y: 0, lit: 0, kind: 2, src: doorPortalObj }));
    emittersDirty = false;
  }

  /* Point the fixed pool at the most relevant flames. Pure SELECTION: nothing
     is created, added or removed, so the light count the shaders were compiled
     for is the same on a floor with one torch and a floor with twenty, and a
     fire skill landing mid-fight cannot push the scene over the driver's
     uniform budget (which is what turned the screen black).

     Relevance is distance from the camera centre, with hysteresis, and every
     hand-over fades (DS.TorchLight.assignPool): a light never jumps from one
     torch to the next in a single frame. A torch outside the pool is not
     dark -- the light map and its floor pool still light its area. */
  function assignFlameLights(camX, camY) {
    const n = flamePool.length;
    if (!n || !lightPool || !DS.TorchLight) return;
    if (emittersDirty) rebuildEmitters();
    for (let i = 0; i < emitters.length; i++) {
      const e = emitters[i], src = e.src;
      const gp = src.group.position;
      e.x = gp.x;
      e.y = gp.y + (src.lift || 1.6);
      e.lit = e.kind === 0 ? src.smooth
        : (e.kind === 1 ? src.smooth * TORCH_I * DS.TorchLight.flicker(frameSec, src.phase)
          : src.light.intensity);
    }
    if (DS.Audio && DS.Audio.torchNear && DS.currentGame && DS.currentGame.player) {
      const hp = DS.currentGame.player;
      const hx = (hp.x + hp.w * 0.5) * P2U, hy = (-hp.y - hp.h * 0.5) * P2U;
      let nearest = 1e9;
      for (let i = 0; i < emitters.length; i++) {
        if (emitters[i].kind === 2) continue;
        const dx = emitters[i].x - hx, dy = emitters[i].y - hy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearest) nearest = d2;
      }
      DS.Audio.torchNear(Math.sqrt(nearest) / P2U);
    }
    DS.TorchLight.assignPool(lightPool, emitters, emitters.length, camX, camY, 1 / 60,
                             noFlamePool ? -1 : FLAME_REACH2);
    for (let k = 0; k < n; k++) {
      const l = flamePool[k];
      const o = lightPool.owner[k];
      if (o < 0) {
        l.intensity = 0;
        l.position.set(0, -999, 0.3);
        continue;
      }
      const e = emitters[o];
      if (e.kind === 2) l.color.copy(e.src.light.color);
      else l.color.setHex(TORCH_COL);
      l.position.set(e.x, e.y, 0.3);
      /* Same gate as the element pool: an intensity that is not a finite
         number is worse than no light at all. */
      const lit = e.lit * lightPool.weight[k];
      l.intensity = Number.isFinite(lit) && lit > 0 ? lit : 0;
    }
  }

  /* The per-level torch light map: every wall torch's falloff, baked into a
     small texture the tile materials add as irradiance (see flame.js). */
  function buildTorchMap(map) {
    if (!torchMapUniforms || !DS.TorchLight) return;
    if (torchMapTex) { torchMapTex.dispose(); torchMapTex = null; }
    const cols = Math.max(1, Math.ceil(map.pixelW / TORCH_MAP_TEXEL));
    const rows = Math.max(1, Math.ceil(map.pixelH / TORCH_MAP_TEXEL));
    const sources = [];
    for (let i = 0; i < torchLights.length; i++) {
      const t = torchLights[i];
      if (t.px == null) continue;
      sources.push({ x: t.px, y: t.floorPx - TORCH_MAP_LIFT, phase: t.phase,
                     r: TORCH_MAP_RGB[0], g: TORCH_MAP_RGB[1], b: TORCH_MAP_RGB[2] });
    }
    const lm = DS.TorchLight.buildLightMap({ cols: cols, rows: rows, texel: TORCH_MAP_TEXEL,
                                            radius: TORCH_MAP_RADIUS, sources: sources });
    torchMapTex = DS.Flame.lightMapTexture(lm);
    torchMapUniforms.uTorchMap.value = torchMapTex;
    /* World (x, y) -> map uv: x px = X / P2U, y px = -Y / P2U, row 0 at the top. */
    torchMapUniforms.uTorchXf.value.set(0, 0, 1 / (P2U * cols * TORCH_MAP_TEXEL),
                                        -1 / (P2U * rows * TORCH_MAP_TEXEL));
  }

  /* Embers and a smoke wisp off a flame the camera can see, through the pooled
     FX layer (no allocation: the pools recycle). */
  function torchEmbers(x, y, frame, off) {
    const FX = DS.FX3D;
    if (!FX || !FX.ready || !FX.add || !FX.live()) return;
    if ((frame + off) % EMBER_EVERY === 0) {
      const s = FX.add.spec();
      s.x = x + FX.rnd(-0.07, 0.07); s.y = y + 0.30; s.z = 0.2 + FX.rnd(-0.05, 0.05);
      s.vx = FX.rnd(-0.004, 0.004); s.vy = FX.rnd(0.012, 0.024); s.vz = 0;
      s.grav = -0.00025; s.drag = 0.985;
      s.life = FX.rnd(38, 66); s.size = FX.rnd(0.035, 0.055); s.size1 = 0.012;
      s.cell = DS.FX3DAtlas ? DS.FX3DAtlas.CELL.ember : 0;
      FX.col(s, 0xffa040, 1.7);
      s.a = 1; s.a1 = 0;
      FX.add.emit(s);
    }
    if ((frame + off * 3) % SMOKE_EVERY === 0) {
      FX.puffAt(x + FX.rnd(-0.04, 0.04), y + 0.85, 0.1, FX.rnd(-0.002, 0.002), 0.009, 0,
                0.16, 0.5, 0x2c2624, 0.09, 80);
    }
  }

  const liveEnemySet = new Set();
  function retireEnemyModel(model, e) {
    if (!liveEnemySet.has(e)) {
      // Killed (not merely cleared with the level): the body bursts into chunks.
      if (e.dead && model.root.visible !== false) {
        shatterModel(model, e.isBoss ? 30 : (e.tier ? 16 : 10), e.isBoss ? 1.8 : Math.min(1.6, (e.sizeScale || 1)));
      }
      disposeModel(model);
      enemyModels.delete(e);
    }
  }

  /* --- the camera rig, per frame ----------------------------------------------

     Preset + dynamic zoom + DS.R's shake and punch, then the projection the 2D
     overlay goes through. Everything that maps a world point to the screen this
     frame reads `viewProj`, so a damage number and the monster it came off are
     projected by the same matrix. */
  const viewProj = new THREE.Matrix4();
  const viewProjInv = new THREE.Matrix4();

  function fightIsClose(g, p) {
    const px = p.x + p.w * 0.5, py = p.y + p.h * 0.5;
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;
      if (e.isBoss) return true;
      if (Math.abs(e.x + e.w * 0.5 - px) < ENGAGE_PX && Math.abs(e.y + e.h * 0.5 - py) < ENGAGE_PX) return true;
    }
    return false;
  }

  function updateRig(g, camX, camY) {
    const dt = 1 / 60;
    const p = g.player;
    let target = 1;
    if (p && camRig.preset === DEFAULT_PRESET && !p.dead) {
      if (fightIsClose(g, p)) target = ZOOM_IN;
    }
    camRig.zoomTarget = target;
    /* Critically damped: x'' = w^2 (target - x) - 2 w x'. */
    const w = ZOOM_OMEGA;
    camRig.zoomV += (w * w * (target - camRig.zoom) - 2 * w * camRig.zoomV) * dt;
    camRig.zoom += camRig.zoomV * dt;
    const dist = camRig.dist * camRig.zoom;

    const R = DS.R;
    const sv = R && R.shakeOffset ? R.shakeOffset() : null;
    const shx = sv ? sv.x * SHAKE_GAIN : 0;
    const shy = sv ? sv.y * SHAKE_GAIN : 0;
    /* The punch is a lens change, not a dolly: the FOV narrows by the punch
       factor, so the whole frame kicks in around its centre. */
    const punch = R && R.zoom ? Math.max(1, R.zoom()) : 1;
    const fov = 2 * Math.atan(Math.tan(camRig.fov * Math.PI / 360) / punch) * 180 / Math.PI;
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    const tx = camX + shx * P2U;
    const ty = camY + camRig.lift - shy * P2U;
    const cp = Math.cos(camRig.pitch);
    camera.position.set(tx + Math.sin(camRig.yaw) * dist * cp,
                        ty + Math.sin(camRig.pitch) * dist,
                        Math.cos(camRig.yaw) * dist * cp);
    const roll = shx * SHAKE_ROLL;
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(tx, ty, 0);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    viewProjInv.copy(viewProj).invert();
  }

  /* A point in the level's own pixels (on the actor plane) -> logical 320x180
     screen coordinates, plus `k`, how many logical pixels one world pixel spans
     THERE (the perspective scale, so a sprite drawn at that point is sized the
     way the models around it are). Allocation-free: pass `out` to reuse. */
  function worldToScreen(x, y, out) {
    out = out || { x: 0, y: 0, k: 1 };
    const e = viewProj.elements;
    const wx = x * P2U, wy = -y * P2U, wz = ACTOR_Z;
    const cx = e[0] * wx + e[4] * wy + e[8] * wz + e[12];
    const cy = e[1] * wx + e[5] * wy + e[9] * wz + e[13];
    const cw = e[3] * wx + e[7] * wy + e[11] * wz + e[15];
    const iw = cw > 1e-5 ? 1 / cw : 1e5;
    out.x = (cx * iw * 0.5 + 0.5) * DS.C.W;
    out.y = (0.5 - cy * iw * 0.5) * DS.C.H;
    out.k = camera.projectionMatrix.elements[5] * 0.5 * DS.C.H * P2U * iw;
    return out;
  }

  /* What the rig can see on the actor plane, in level pixels, around the point
     it aims at: half the width, how far up and how far down (a tilted lens
     does not see the same distance both ways), and the aim's lift above
     DS.R.cam. Analytic, from the rig's own numbers, so it is valid before the
     frame's camera is placed and carries no shake. DS.R.clampCam uses it. */
  function visibleExtent(out) {
    out = out || {};
    const f = camRig.fov * Math.PI / 180, p = camRig.pitch;
    const dist = camRig.dist * camRig.zoom;
    const D = dist * Math.cos(p) - ACTOR_Z;
    out.up = (dist * Math.sin(p) - D * Math.tan(p - f / 2)) / P2U;
    out.down = (D * Math.tan(p + f / 2) - dist * Math.sin(p)) / P2U;
    out.half = dist * Math.tan(f / 2) * (DS.C.W / DS.C.H) * Math.cos(camRig.yaw) / P2U;
    out.lift = camRig.lift / P2U;
    return out;
  }

  /* The inverse: a logical screen point -> the level pixel on the actor plane
     under it (the aim reticle's question). */
  const rayA = new THREE.Vector3(), rayB = new THREE.Vector3();
  function screenToWorld(sx, sy, out) {
    out = out || { x: 0, y: 0 };
    const nx = (sx / DS.C.W) * 2 - 1, ny = 1 - (sy / DS.C.H) * 2;
    rayA.set(nx, ny, -1).applyMatrix4(viewProjInv);
    rayB.set(nx, ny, 1).applyMatrix4(viewProjInv);
    const dz = rayB.z - rayA.z;
    const t = Math.abs(dz) > 1e-6 ? (ACTOR_Z - rayA.z) / dz : 0;
    out.x = (rayA.x + (rayB.x - rayA.x) * t) / P2U;
    out.y = -(rayA.y + (rayB.y - rayA.y) * t) / P2U;
    return out;
  }

  /* --- the backdrop's hero light: rim + god rays --------------------------------

     The horizon module can say where its celestial body is (heroInfo(): world
     position, colour, intensity). When it can, the back light is aimed FROM the
     body TOWARD the eye, so every silhouette between the two catches a rim in
     the body's colour, and the post chain smears a few rays out of the body
     while it is on screen. When it cannot (older backdrop, or a theme with no
     body), the back light keeps the direction setupTheme gave it and no rays
     are drawn. */
  const sunNdc = new THREE.Vector3();
  const sunView = new THREE.Vector3();
  const RAYS_STRENGTH = 0.55;
  const RAYS_EDGE = 1.15;            // NDC reach where the rays have faded out

  function heroInfoSource() {
    if (DS.Backdrop3D && typeof DS.Backdrop3D.heroInfo === 'function') return DS.Backdrop3D;
    if (DS.Backdrop && typeof DS.Backdrop.heroInfo === 'function') return DS.Backdrop;
    return null;
  }

  function updateHeroLight(ax, ay) {
    const src = heroInfoSource();
    let info = null;
    if (src) {
      try { info = src.heroInfo(); } catch (err) { info = null; }
    }
    if (!info || !info.worldPos || !Number.isFinite(info.worldPos.x)) {
      if (DS.PostFX) DS.PostFX.setRays(null);
      return;
    }
    if (!keyAim.done && ++keyAim.frame >= KEY_AIM_FRAME) keyAim.done = aimKeyAtBody(info, ax, ay) || keyAim.frame > 30;
    const gain = M.clamp(Number.isFinite(info.intensity) ? info.intensity : 1, 0, 2);
    if (backLight) {
      backLight.position.copy(info.worldPos);
      backLight.target.position.copy(camera.position);
      if (info.color) backLight.color.copy(info.color);
      backLight.intensity *= gain;
    }
    if (!DS.PostFX) return;
    sunView.copy(info.worldPos).applyMatrix4(camera.matrixWorldInverse);
    if (sunView.z >= 0) { DS.PostFX.setRays(null); return; }   // behind the eye
    sunNdc.copy(info.worldPos).applyMatrix4(viewProj);
    const edge = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y));
    if (edge > RAYS_EDGE) { DS.PostFX.setRays(null); return; }
    const fade = M.clamp((RAYS_EDGE - edge) / 0.35, 0, 1);
    DS.PostFX.setRays(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5,
                      info.color || null, RAYS_STRENGTH * gain * fade);
  }

  function render(g) {
    if (!enabled || !renderer || !camera || !g) return;

    /* Lay the frame out before anything is drawn: wipe the whole window in the
       theme's own background colour (the letterbox bars are this colour, not
       yesterday's pixels), then clip the world pass to the 16:9 play frame. */
    const pv = playViewport();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, pv.cw, pv.ch);
    renderer.setScissor(0, 0, pv.cw, pv.ch);
    renderer.setClearColor(scene.background || 0x000000, 1);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    renderer.setViewport(pv.x, pv.y, pv.w, pv.h);
    renderer.setScissor(pv.x, pv.y, pv.w, pv.h);

    const R = DS.R;
    const camX = R.cam.x * P2U;
    const camY = -R.cam.y * P2U;
    const time = g.frames * 0.055;

    if (DS.Voxel) {
      if (g.player) poseHero(g, g.player, time);
      else if (heroModel) heroModel.root.visible = false;

      /* Spawn models for any new enemy; retire models whose entity is gone.
         Membership is a Set built in the same pass, not an indexOf per model:
         that was O(models x enemies) every frame of every fight. */
      animFrames = g.frames;
      liveEnemySet.clear();
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        if (e.dead) continue;
        liveEnemySet.add(e);
        const model = ensureEnemyModel(g, e);
        if (model) poseEnemy(e, model, time, g.map);
      }
      enemyModels.forEach(retireEnemyModel);

      syncProjectiles(g, time);

      /* The water breathes: the whole surface sheet lifts and settles, and its
         sheen pulses. Cheap, and it is the difference between a pool and a
         blue glass slab. */
      if (waterSurfaceMesh) {
        waterSurfaceMesh.position.y = Math.sin(time * 2.2) * 0.035;
        waterSurfaceMesh.material.opacity = 0.48 + Math.sin(time * 1.7) * 0.10;
      }
      if (waterCrestMesh) {
        waterCrestMesh.position.y = Math.sin(time * 2.2) * 0.035;
        waterCrestMesh.material.opacity = 0.72 + Math.sin(time * 3.1) * 0.16;
      }
      syncPickups(g, time);
      syncPuzzles(g);
      syncShrine(g, time);
      syncElemFields(g, time);
      syncElemBolts(g);
      updateGroundBursts();
      updateSmokePuffs();
      updateSwingFx();
      /* Last: everything above has emitted or fed its trails for this frame,
         so the pooled layer steps and repacks once. */
      if (DS.FX3D) {
        DS.FX3D.hook(g);
        DS.FX3D.update(g.frames, g.hitstop || 0);
      }
    }

    /* The rig: orbit the eye around the camera target by (yaw, pitch) at the
       preset's distance (breathing with the dynamic zoom, kicked by shake and
       punch), and always aim back at the target. The 2D overlay projects
       through the result from here on (DS.R.attach3D). */
    updateRig(g, camX, camY);
    if (DS.R && DS.R.attach3D) DS.R.attach3D(true);
    if (camRig.show > 0) camRig.show--;

    const t = activeTheme || THEMES.forest;
    /* Per-depth mood. `biome.darkness` (0.50 at the shore, 0.72 in the flooded
       halls and the volcanic deep) was authored for the old 2D veil; here it
       decides how much of the frame is room air and how much is lamplight. The
       deeper rungs go dark and torch-lit rather than dark and unreadable: the
       fill drops while the lamps come UP by the same number. */
    const mood = M.clamp(((g.biome && g.biome.darkness) - 0.5) / 0.22, 0, 1);
    /* Deep rungs are darker as a ROOM but not darker to read: the flat fill
       drops hard (that is the "terang benderang" the floors had) while the sky
       wash and the lamps rise by the same amount, because a deep floor is lit
       by its fires and by whatever is behind it, not by nothing. */
    const fill = 1 - 0.58 * mood;
    const lamp = 1 + 0.62 * mood;
    const sky = 1 - 0.20 * mood;
    /* With real shadows the key has to carry enough of the light for its
       shadow to read -- a shadow cast by a fifth of the illumination is a
       smudge. The sky wash gives back what the key takes, so the frame keeps
       its exposure and only the direction of the light changes. */
    const keyBoost = blobShadows ? 1 : KEY_SHADOW_BOOST;
    if (ambientLight) ambientLight.intensity = AMBIENT_I * fill;
    if (hemiLight) hemiLight.intensity = HEMI_I * sky * (blobShadows ? 1 : SKY_SHADOW_TRIM);
    if (dirLight) dirLight.intensity = t.dirI * KEY_GAIN * (1 - 0.50 * mood) * keyBoost * keyAim.gain;
    /* A key from behind gives the front faces nothing, so the camera-side fill
       takes over the share it used to give them (see aimKeyAtBody). */
    if (fillLight && dirLight) fillLight.intensity = 0.18 + FRONT_FILL * dirLight.intensity * keyAim.behind;
    if (backLight) {
      /* The light from the BACKGROUND. Its direction and colour were set once per
         level (see setupTheme: it follows the theme's celestial body), so the only
         thing to do here is let it grow with depth. It does not dim with depth
         like the fill does -- it grows, because a deep floor is lit by its fires
         and by whatever is behind it. */
      backLight.intensity = 0.55 + 0.35 * mood;
    }
    /* Aim the rim at the eye from the backdrop's body (when it can say where
       that is), and fit the key's shadow to what the camera sees. */
    updateHeroLight(camX, camY + camRig.lift);
    updateKeyShadow(camX, camY + camRig.lift);

    /* The sky rides the eye line (see the sky rig in buildBackdrop) -- in the
       THEME GROUP'S OWN SPACE, not the world's.

       This line used to write the camera's world height straight into a child of
       themeGroup, which was correct only while the group sat at y = 0. The group
       is translated to the level's locked horizon (and, on a tall climb, drifts
       slowly from it; see the horizon block below), and a child pinned in world
       units then rides the eye line PLUS the horizon shift -- up to 30 units. What that looks like: the
       moon at depth 7 measured 3% of a frame half-height ABOVE the top edge,
       from the one place on the floor where it is supposed to be overhead. The
       group only ever translates in y and turns about y, so the conversion is a
       subtraction. */
    if (skyRig) {
      skyRig.position.y = camera.position.y - (themeGroup ? themeGroup.position.y : 0);
    }
    /* The backdrop ladder is built along -Z, so a turned camera would look past
       its edge. Turning the theme group with the rig keeps the horizon framed:
       the bands are rigid, the eye orbits them. */
    if (themeGroup) themeGroup.rotation.y = camRig.yaw * 0.85;
    /* The horizon STAYS PUT.

       It used to be re-seated onto the ground around the player every eighth
       frame and eased there at 0.22 a step. On a floor that rolls, that line
       moves whenever the window of columns under the player does, in eighth-
       frame steps -- and with the old follow lifting the camera on every jump,
       the whole backdrop stepped up and down under the hero: the "blinking"
       the player reported. A background is something at a distance; it does
       not follow your feet.

       So the line is LOCKED once per level, on the first frame, to the median
       ground in a window around where the hero starts (localHorizonY: a pit
       cannot drag a median down). Horizontal parallax needs nothing from here:
       the bands stand at their own depths and the camera's pan parallaxes them.

       The one concession is a long climb (the Climb floors, 7/22/26): when the
       ground around the hero has been more than HORIZON_DEAD units from the
       locked line for HORIZON_WAIT seconds, the line DRIFTS toward it -- a
       smoothed velocity capped at HORIZON_SPEED units a second, stopping as
       soon as it is back inside the dead zone. The ground median does not move
       when the hero jumps, so this can never answer a jump; it reads as the
       far horizon catching up, not as a cut. Until then the horizon may sit
       partly out of frame -- which is what a real one does when you climb. */
    if (themeGroup && themeAnchorY !== null && g && g.map && g.player) {
      const hx = DS.Ent.centerX(g.player);
      if (!horizonSettled) {
        const start = localHorizonY(g.map, hx);
        horizonY = start != null ? start : themeAnchorY;
        horizonGoal = horizonY;
        horizonVel = 0;
        horizonAway = 0;
        horizonSettled = true;
      } else if ((g.frames & 15) === 0) {
        const goal = localHorizonY(g.map, hx);
        if (goal != null) horizonGoal = goal;
      }
      const off = horizonGoal - horizonY;
      horizonAway = Math.abs(off) > HORIZON_DEAD ? horizonAway + HORIZON_DT : 0;
      const wantVel = horizonAway > HORIZON_WAIT
        ? M.clamp(off * 0.35, -HORIZON_SPEED, HORIZON_SPEED) : 0;
      horizonVel += (wantVel - horizonVel) * HORIZON_DT * 1.2;
      horizonY += horizonVel * HORIZON_DT;
      themeGroup.position.y = horizonY - themeAnchorY;
    }

    if (g.player && playerLight) {
      playerLight.position.x = (g.player.x + g.player.w * 0.5) * P2U;
      playerLight.position.y = -(g.player.y + g.player.h * 0.5) * P2U;
      /* The carried lamp, guttering down to an ember in the black room. It is
         the readable pool of light in a deep floor, so it grows with the mood. */
      playerLight.intensity = LAMP_I * lamp * (0.95 + Math.sin(g.frames * 0.035) * 0.05);
    }

    /* Every flame's own intensity, smoothed. Nothing is written to a light
       here: the emitters only tell the pool how bright they are, and the pool
       hands that brightness to the four nearest of them (see FLAME_LIGHTS). */
    /* One flicker per torch, from the function the flame shader, its floor
       pool and the light map all share (DS.TorchLight.flicker), so the fire
       and the light it throws move together. */
    frameSec = g.frames / 60;
    const TL = DS.TorchLight;
    for (let i = 0; i < torchLights.length; i++) {
      const tl = torchLights[i];
      tl.flick = TL ? TL.flicker(frameSec, tl.phase) : 1;
      tl.smooth = tl.baseIntensity * lamp * tl.flick;
      if (poolBatch) poolBatch.setLevel(tl.poolIdx, tl.flick * (0.8 + 0.2 * lamp));
      const gp = tl.group.position;
      const fy = gp.y + tl.lift;
      if (Math.abs(gp.x - camX) < 13 && Math.abs(fy - camY) < 9) torchEmbers(gp.x, fy - 0.3, g.frames, tl.emberOff);
    }
    if (flameBatch) flameBatch.update(frameSec);
    if (torchMapUniforms) {
      torchMapUniforms.uTorchTime.value = frameSec;
      torchMapUniforms.uTorchGain.value = TORCH_MAP_GAIN * lamp;
    }
    assignFlameLights(camX, camY);

    if (doorPortalObj) {
      doorPortalObj.portal.rotation.z += 0.02;
      doorPortalObj.ring.rotation.z -= 0.015;

      const isDoorUnlocked = !g.lockedDoor || g.bossDown;
      if (isDoorUnlocked) {
        doorPortalObj.portal.material.color.setHex(0xffffff);
        doorPortalObj.ring.material.color.setHex(0x4ee2ec);
        doorPortalObj.light.color.setHex(0x4ee2ec);
        doorPortalObj.light.intensity = 1.3 + Math.sin(time * 3.0) * 0.3;
      } else {
        doorPortalObj.portal.material.color.setHex(0x882233);
        doorPortalObj.ring.material.color.setHex(0xff2244);
        doorPortalObj.light.color.setHex(0xff2244);
        doorPortalObj.light.intensity = 0.8 + Math.sin(time * 5.0) * 0.2;
      }
    }

    if (g.hazards) {
      while (hazardMeshes.length < g.hazards.length) {
        const h = g.hazards[hazardMeshes.length];
        let hm = null;
        if (h.kind === 'platform') hm = createMovingPlatformMesh(h.w);
        else if (h.kind === 'ball') hm = createSpikedBallMesh();
        else if (h.kind === 'saw') hm = createSawMesh();
        else if (h.kind === 'crumble') hm = createCrumbleMesh(h.w);
        if (hm) { shadowize(hm.group); hazardMeshes.push(hm); }
        else break;
      }

      for (let i = 0; i < hazardMeshes.length; i++) {
        const hm = hazardMeshes[i];
        if (i < g.hazards.length) {
          const h = g.hazards[i];
          hm.group.visible = true;
          const hx = (h.x + h.w * 0.5) * P2U;
          const hy = -(h.y + h.h * 0.5) * P2U;
          hm.group.position.set(hx, hy, 0.15);

          if (hm.kind === 'platform') {
            const anchorY = -(h.baseY - h.range - 8) * P2U;
            const chainLen = Math.max(0.2, Math.abs(hy - anchorY));
            hm.leftChain.scale.y = chainLen;
            hm.leftChain.position.y = chainLen * 0.5;
            hm.rightChain.scale.y = chainLen;
            hm.rightChain.position.y = chainLen * 0.5;
          } else if (hm.kind === 'ball') {
            const anchorY = -(h.baseY - h.range - 10) * P2U;
            const chainLen = Math.max(0.2, Math.abs(hy - anchorY));
            hm.chain.scale.y = chainLen;
            hm.chain.position.y = chainLen * 0.5;
            hm.sphere.rotation.z += 0.04;
          } else if (hm.kind === 'saw') {
            hm.disk.rotation.z += 0.28;
          } else if (hm.kind === 'crumble') {
            if (h.broken > 0) {
              hm.group.visible = false;
            } else {
              hm.group.visible = true;
              if (h.triggered > 0) {
                hm.group.position.x += (Math.random() - 0.5) * 0.08;
              }
            }
          }
        } else {
          hm.group.visible = false;
        }
      }
    }

    for (let i = 0; i < plateMeshes.length; i++) {
      const pm = plateMeshes[i];
      let isSteppedOn = false;

      /* A vault plate hands us the puzzle (state on ref.plate); a trial plate
         hands us the plate itself (state on ref.pressed). */
      const heldRef = pm.ref && (pm.ref.plate ? pm.ref.plate.pressed : pm.ref.pressed);
      if (heldRef) {
        isSteppedOn = true;
      } else if (g.player) {
        const dx = Math.abs(g.player.x + g.player.w * 0.5 - pm.px);
        const dy = Math.abs(g.player.y + g.player.h - pm.py);
        if (dx < 12 && dy < 8) isSteppedOn = true;
      }

      if (!isSteppedOn && g.crates) {
        for (let c = 0; c < g.crates.length; c++) {
          const cr = g.crates[c];
          if (Math.abs(cr.x + cr.w * 0.5 - pm.px) < 12 && Math.abs(cr.y + cr.h - pm.py) < 8) {
            isSteppedOn = true;
            break;
          }
        }
      }

      pm.targetY = isSteppedOn ? 0.16 : 0.3;
      pm.currentY += (pm.targetY - pm.currentY) * 0.22;
      pm.slab.position.y = pm.currentY;
      pm.rune.position.y = pm.currentY + 0.35;

      const targetEmissive = isSteppedOn ? 1.0 : 0.25;
      pm.emissiveIntensity += (targetEmissive - pm.emissiveIntensity) * 0.2;
      pm.rune.material.opacity = 0.4 + pm.emissiveIntensity * 0.6;
      pm.rune.material.color.setHex(isSteppedOn ? 0x5cbf62 : 0x9b96b8);
    }

    for (let i = 0; i < chestMeshes.length; i++) {
      const cm = chestMeshes[i];
      const isOpened = cm.ref && cm.ref.opened;
      const targetAngle = isOpened ? -1.22 : 0;
      cm.openAngle += (targetAngle - cm.openAngle) * 0.14;
      cm.lidGroup.rotation.x = cm.openAngle;

      if (isOpened) {
        cm.beam.material.opacity = Math.min(0.65, cm.beam.material.opacity + 0.04);
        cm.beam.rotation.y += 0.02;
      } else {
        cm.beam.material.opacity = 0;
      }
    }

    if (screenParticleManager) {
      screenParticleManager.update(camX, camY, 0.016);
    }
    /* The horizon keeps its own clock: drifting air, breathing bands, the
       silhouettes crossing the sky, and the pulse of the body in it. */
    if (DS.Backdrop) DS.Backdrop.update(time, 0.016);

    /* No parallax scroll to drive any more: the backdrop bands are solid
       geometry at fixed depth, so the camera's own pan produces the parallax. */

    /* Blob shadows: the low preset's stand-in for a shadow pass. With real
       shadows on they are not drawn at all (their group is hidden by
       applyQuality), so none of this runs. */
    let sIdx = 0;
    if (blobShadows && g.player) {
      const p = g.player;
      const pcx = p.x + p.w * 0.5;
      const ptx = Math.floor(pcx / 16);
      let groundY = p.y + p.h;
      if (g.map) {
        const pty = Math.floor((p.y + p.h - 1) / 16);
        const fb = g.map.floorBelow(ptx, pty);
        if (fb < g.map.pixelH) groundY = fb;
      }
      const dist = groundY - (p.y + p.h);
      if (dist >= 0 && dist < 72) {
        const sm = getShadowMesh(sIdx++);
        sm.visible = true;
        sm.position.x = pcx * P2U;
        sm.position.y = -groundY * P2U;
        const fade = Math.max(0.2, 1 - dist / 72);
        sm.scale.set(Math.max(0.6, 1 - dist * 0.008) * fade, Math.max(0.35, 0.5 - dist * 0.005) * fade, 1);
      }
    }

    for (let i = 0; blobShadows && i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;

      const ecx = e.x + e.w * 0.5;
      const etx = Math.floor(ecx / 16);
      let groundY = e.y + e.h;
      if (g.map) {
        const ety = Math.floor((e.y + e.h - 1) / 16);
        const fb = g.map.floorBelow(etx, ety);
        if (fb < g.map.pixelH) groundY = fb;
      }
      const dist = groundY - (e.y + e.h);
      if (dist >= 0 && dist < 64) {
        const sm = getShadowMesh(sIdx++);
        sm.visible = true;
        sm.position.x = ecx * P2U;
        sm.position.y = -groundY * P2U;

        let ew = (e.w * P2U) / 1.2;
        let eh = ew * 0.4;
        if (e.kind === 'slime') {
          const bounce = Math.sin(time * 4.5 + e.x) * 0.15;
          ew *= (1 + bounce);
          eh *= (1 - bounce * 0.5);
        }
        const fade = Math.max(0.2, 1 - dist / 64);
        sm.scale.set(ew * fade, eh * fade, 1);
      }
    }

    for (let i = sIdx; i < shadowPool.length; i++) {
      shadowPool[i].visible = false;
    }

    /* Through the post chain when the preset has one (it writes into the play
       viewport only), otherwise the plain render into the same viewport. */
    if (!(DS.PostFX && DS.PostFX.render(pv, pv.dw, pv.dh))) {
      renderer.render(scene, camera);
    }
    if (DS.PostFX) DS.PostFX.track();
    /* Hand the full canvas back for the screen layer and its overlay. */
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, pv.cw, pv.ch);
  }

  DS.R3D = {
    init: init,
    resize: resize,
    /* Camera rig: presets + the live readout the HUD shows. */
    get rig() { return camRig; },
    presets: CAM_PRESETS,
    defaultPreset: DEFAULT_PRESET,
    setPreset: applyCameraPreset,
    /* The 2D overlay's projection: level pixels on the actor plane <-> logical
       320x180 screen pixels, through this frame's camera (see updateRig). */
    worldToScreen: worldToScreen,
    screenToWorld: screenToWorld,
    visibleExtent: visibleExtent,
    loadLevel: loadLevel,
    render: render,
    /* QA handle: the hero's root object (tools/qa/shoot-phase8.js). */
    heroRoot: function () { return heroModel ? heroModel.root : null; },
    spawnElemPuddle: spawnElemPuddle,
    spawnGroundBurst: spawnGroundBurst,
    spawnSmokePuff: spawnSmokePuff,
    updateElemPuddle: updateElemPuddle,
    removeElemPuddle: removeElemPuddle,
    spawnSwingArc: spawnSwingArc,
    /* Anchoring + the audit that enforces it. floorAt is the ONLY way a prop
       may learn where the ground is; auditAnchors is the gate that proves none
       of them guessed. */
    floorAt: floorAt,
    snapToFloor: snapToFloor,
    groundAnchor: groundAnchor,
    auditAnchors: auditAnchors,
    get isEnabled() { return enabled; },
    /* The single WebGL renderer, shared with the screen layer (ui3/screen.js). */
    get gl() { return renderer; },
    get canvas() { return canvas; },
    get camera() { return camera; },
    get lights() {
      return { ambient: ambientLight, hemi: hemiLight, dir: dirLight,
               back: backLight, player: playerLight };
    },
    /* True when gameplay characters are 3D models — every sprite-drawing
       call site keys off this so the 2D canvas draws only FX/UI. */
    get voxels() { return enabled && !!(DS.Voxel); },
    get scene() { return scene; },
    /* Everything the horizon built lives in here, so the QA pass can walk it and
       a teardown has one group to dispose. */
    get themeGroup() { return themeGroup; },
    /* The LEVEL's own geometry, and the props standing on it. Exposed for one
       reason: the QA has to tell "the horizon is not there" apart from "the
       player is standing behind the level's own rock", and those two look
       identical from a screenshot. */
    get dungeon() { return dungeonGroup; },
    get propsGroup() { return propsGroup; },
    get activeThemeName() { return activeThemeName; },
    /* The horizon's own build report: the resolved body, every rung's final
       colour, its texel repeat. Read by tools/qa/audit-backdrop.js, which is the
       only reason a build result is kept rather than dropped after the add. */
    get backdrop() { return backdropRef ? backdropRef.report : null; },
    /* Light introspection for tools/qa/shoot-phase6.js: the key's aimed
       direction, the locked horizon, every torch and which pool slot (if any)
       is lighting it. `noFlamePool` darkens the pool so a shot can show what a
       torch looks like on its baked light alone. */
    get lightRig() {
      return { keyDir: keyDir, keyAimed: keyAim.done, keyBehind: keyAim.behind,
               keyColor: dirLight ? dirLight.color.getHexString() : null,
               horizonY: horizonY, horizonShift: themeGroup ? themeGroup.position.y : 0,
               torches: torchLights.map(function (t) {
                 return { x: t.group.position.x, y: t.group.position.y, lift: t.lift,
                          slot: -1, lit: t.smooth };
               }),
               pool: lightPool ? { owner: Array.from(lightPool.owner), weight: Array.from(lightPool.weight) } : null,
               emitters: emitters.map(function (e) { return { kind: e.kind, x: e.x, y: e.y, slot: e.slot }; }) };
    },
    set noFlamePool(v) { noFlamePool = !!v; }
  };
})(window.DS);
