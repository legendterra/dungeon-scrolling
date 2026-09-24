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
   landscape (see BACKDROP_RECIPE) out of boxes and cones in real depth bands,
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

  /* Emitters, not lights: { group, smooth } read each frame to point the pool. */
  let torchLights = [];
  let flamePool = [];
  let elemLightPool = [];
  let flameSprites = [];

  let dungeonGroup = null;
  let shadowGroup = null;
  let propsGroup = null;
  let themeGroup = null;

  /* --- backdrop life -------------------------------------------------------

     Building the horizon out of geometry fixed its parallax and left it
     motionless, and a motionless horizon reads as a painting no matter how
     many bands it has. Three cheap motions fix that without touching the
     ladder: the air drifts, the near bands breathe, and the sky carries
     something crossing it. All three are rebuilt with the theme. */
  let backdropAir = [];    // mist / ember motes with their own drift and spin
  let backdropSway = [];   // bands that sway about their own base
  let backdropLife = [];   // silhouettes crossing the sky

  /* Which band kinds move, and how much. A tree sways, a column does not; a
     cloud slides, a mountain does not. Amplitude is scaled down with distance
     inside the build, so the far rungs stay nearly still and the near ones
     carry the motion -- the same aerial perspective the values already use. */
  const SWAY_KINDS = {
    trees:   { amp: 0.018, spd: 0.62 },
    reeds:   { amp: 0.030, spd: 1.05 },
    bones:   { amp: 0.009, spd: 0.48 },
    columns: { amp: 0.005, spd: 0.38 },
    spires:  { amp: 0.006, spd: 0.44 },
    arches:  { amp: 0.004, spd: 0.34 },
    crystals:{ amp: 0.014, spd: 0.85 },
    ice:     { amp: 0.010, spd: 0.52 },
    rubble:  { amp: 0.004, spd: 0.70 }
  };
  /* Clouds are the one band that should travel rather than lean, so they get a
     drift instead of a sway. */
  const CLOUD_DRIFT = 0.55;

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
    { key: 'film',  label: 'FILM 20/16',   yaw: 0.35, pitch: 0.28, dist: 30, fov: 36 }
  ];
  /* The view ships STRAIGHT, and that is deliberate: the dungeon is a side-on
     platformer, so a turned camera slides the whole level diagonally and the
     frame stops agreeing with the physics the player is reading -- ledges look
     slanted, a wall you can stand on reads as a slope, and the level itself
     looks broken. SIDE 0/7 is exactly the shot the game has always had
     (CAM_DIST 26, FOV 39.5, 7 degrees down), and it is the default.
     The other presets are one keypress away for looking at a room, but nothing
     slanted is ever restored on boot: the pick is not persisted, so a fresh
     launch cannot come up crooked. */
  const camRig = { yaw: 0, pitch: 0.12, dist: 26, fov: 39.5, preset: 0, show: 0 };

  function applyCameraPreset(i) {
    const p = CAM_PRESETS[M.clamp(i, 0, CAM_PRESETS.length - 1)];
    camRig.preset = M.clamp(i, 0, CAM_PRESETS.length - 1);
    camRig.yaw = p.yaw;
    camRig.pitch = p.pitch;
    camRig.dist = p.dist;
    camRig.fov = p.fov;
    camRig.show = 240;                 // frames the readout stays up
    if (camera) {
      camera.fov = camRig.fov;
      camera.updateProjectionMatrix();
    }
  }

  /* --- the depth ladder -----------------------------------------------------

     Every backdrop band is authored at ONE distance (BACKDROP_REF_D, the near
     rung) whatever rung of the ladder it actually sits on: the builder scales a
     band by (CAM_DIST + d) / (CAM_DIST + BACKDROP_REF_D), so moving a band
     further away grows it in world units while it keeps its size on screen.
     That is what buys depth rather than a flat painting - the camera only pans,
     so two bands 4 and 44 units out slide against each other at very different
     rates, and haze separates them by value the way the eye expects.

     The rungs are geometric (each one about 1.5x the last) because that is how
     depth reads: what matters is the RATIO between planes, not the gap. */
  const BACKDROP_REF_D = 4.5;
  const BACKDROP_GROUND_D = 90;   // how far the flat ground runs to the horizon
  const BACKDROP_SKY_Z = -92;     // just behind the far ground edge
  const SKY_H = 150;              // sky plane height, in world units
  const SKY_DROP = 8;             // sky extends this far below the eye line

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
  /* Night sky, not daylight. Everything the backdrop draws is scaled by this
     before it reaches the screen, because the sky used to bottom out at the
     hemisphere colour at FULL brightness -- a pale grey band across the middle
     of the frame that read as overexposure and drowned the horizon in it. */
  const SKY_GAIN = 0.28;
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

  /* --- the biome backdrop, built out of geometry -----------------------------

     This used to be two flat textured planes: the 2D backdrop art baked into a
     canvas and hung at z=-8 and z=-2.6. It read as wallpaper - a painting of a
     room pinned behind a room, with no parallax of its own and no relationship
     to the level's lights. The next version turned it into geometry but packed
     every band into a 6-unit shell (-3 to -9), so the whole horizon crowded the
     walkway and read as a jumble of boxes rather than as distance.

     Every biome now owns a LADDER: five or six bands spread from 4.5 to 44
     units out, with the near rungs carrying ground clutter and the far rungs
     carrying the silhouette of the place - a treeline, a coast, a colonnade.
     One builder turns a recipe into real, lit, fogged geometry: parallax comes
     from perspective (the camera only pans, so the bands slide against each
     other by themselves), haze separates them by value, and the same torch that
     lights the walkway lights the near rock.

     Everything a layer emits is a BOX (a rock tooth, a pillar, a tree, a plank)
     or a CONE (a stalactite) or an OCTAHEDRON (a crystal), so a whole band
     collapses into one or two InstancedMeshes. */
  /*
     `sp` is SPACING, not a count: how many world units apart two objects of
     this band sit, in REFERENCE units (see BACKDROP_REF_D). A floor is 100-200
     units long and the camera only ever sees about 14 of them, so a fixed count
     is a trap - eight trees spread over 200 units is one tree every few screens.
     Asking for spacing instead means every floor, long or short, gets the same
     density on screen.

     Heights are authored in the same reference units, and the framing budget is
     tight because the camera looks 7 degrees down: the eye line sits about a
     sixth of the way down the screen, so everything a backdrop may show lives in
     the band from the horizon up to roughly 13 degrees above it. At the far rung
     (44 units up the ladder, 70 from the eye) that is about 19 world units, so a
     far ridge is authored around 4.5-8 and scaled up to 10-18. A band authored
     at 20-30 - which is what the previous pass did - is a rock face with its
     summit far above the top of the frame.
  */
  const BACKDROP_RECIPE = {
    forest: {
      skyGlow: 1.0, haze: 0.8, ground: 0x0e1d13,
      stars: { sp: 1.6, size: 0.12, alpha: 0.5 },
      moon: { col: 0xfff0cc, r: 4.6 },
      motes: { col: 0x86efac, size: 0.30, alpha: 0.45, rise: 0.2 },
      layers: [
        { kind: 'rubble', sp: 2.6, d: 4.5, col: 0x16281a, s0: 0.25, s1: 0.9 },
        { kind: 'trees',  sp: 2.8, d: 8,   col: 0x101f14, h0: 4.0, h1: 6.6 },
        { kind: 'trees',  sp: 3.2, d: 13,  col: 0x0d1a11, h0: 2.8, h1: 4.6 },
        { kind: 'hills',  sp: 3.6, d: 20,  col: 0x0a150e, h0: 2.0, h1: 3.6 },
        { kind: 'trees',  sp: 3.0, d: 30,  col: 0x0a140e, h0: 1.8, h1: 3.0 },
        { kind: 'ridge',  sp: 3.4, d: 44,  col: 0x060f0a, h0: 1.3, h1: 2.2 }
      ]
    },
    caves: {
      ceiling: { y: 10.5, col: 0x050f0e },
      skyGlow: 0.44, haze: 0.66, ground: 0x0a1a17,
      mist: { sp: 3.2, size: 0.22, alpha: 0.16, col: 0x4f8078 },
      motes: { col: 0x5eead4, size: 0.26, alpha: 0.4, rise: -0.35 },
      layers: [
        { kind: 'rubble',      sp: 2.4, d: 4.5, col: 0x14302b, s0: 0.25, s1: 0.9 },
        { kind: 'stalactites', sp: 2.2, d: 8,   col: 0x11302c, top: 8.5, h0: 3.0, h1: 6.0 },
        { kind: 'spires',      sp: 3.0, d: 13,  col: 0x0c211f, h0: 2.8, h1: 4.8 },
        { kind: 'spires',      sp: 3.2, d: 20,  col: 0x081716, h0: 2.2, h1: 3.8 },
        { kind: 'bricks',      sp: 3.4, d: 28,  col: 0x061311, rows: 4 }
      ]
    },
    cave: {
      ceiling: { y: 10.5, col: 0x04100f },
      skyGlow: 0.42, haze: 0.62, ground: 0x081614,
      mist: { sp: 3.6, size: 0.2, alpha: 0.14, col: 0x4c8c86 },
      motes: { col: 0x6ee7d0, size: 0.24, alpha: 0.4, rise: -0.3 },
      layers: [
        { kind: 'rubble',      sp: 2.2, d: 4.5, col: 0x123430, s0: 0.25, s1: 0.9 },
        { kind: 'crystals',    sp: 3.0, d: 8,   col: 0x2a7f74, glow: true, s0: 1.4, s1: 3.2 },
        { kind: 'stalactites', sp: 2.0, d: 13,  col: 0x0e2c2a, top: 8.5, h0: 3.0, h1: 5.6 },
        { kind: 'spires',      sp: 3.2, d: 20,  col: 0x071a19, h0: 2.2, h1: 4.0 },
        { kind: 'bricks',      sp: 3.4, d: 28,  col: 0x05130f, rows: 4 }
      ]
    },
    prison: {
      ceiling: { y: 10, col: 0x150e04 },
      skyGlow: 0.46, haze: 0.68, ground: 0x140c03,
      motes: { col: 0xf97316, size: 0.3, alpha: 0.5, rise: 0.7 },
      layers: [
        { kind: 'rubble',  sp: 2.4, d: 4.5, col: 0x2e1f0c, s0: 0.3, s1: 1.0 },
        { kind: 'columns', sp: 3.4, d: 8,   col: 0x291a09, h0: 3.8, h1: 6.6 },
        { kind: 'arches',  sp: 4.2, d: 13,  col: 0x1f1307, h0: 3.0, h1: 5.0 },
        { kind: 'bricks',  sp: 3.0, d: 20,  col: 0x150d04, rows: 5 },
        { kind: 'columns', sp: 3.6, d: 28,  col: 0x100903, h0: 2.4, h1: 4.0 }
      ]
    },
    vault: {
      ceiling: { y: 10.5, col: 0x120722 },
      skyGlow: 0.48, haze: 0.68, ground: 0x140728,
      motes: { col: 0xc084fc, size: 0.32, alpha: 0.5, rise: 0.15 },
      layers: [
        { kind: 'rubble',   sp: 2.4, d: 4.5, col: 0x241645, s0: 0.3, s1: 1.0 },
        { kind: 'crystals', sp: 3.0, d: 8,   col: 0x8a66e0, glow: true, s0: 1.6, s1: 3.8 },
        { kind: 'columns',  sp: 3.6, d: 13,  col: 0x1c1038, h0: 3.0, h1: 5.2 },
        { kind: 'crystals', sp: 3.2, d: 20,  col: 0x3b2a72, s0: 0.9, s1: 2.2 },
        { kind: 'arches',   sp: 4.5, d: 28,  col: 0x120726, h0: 2.4, h1: 4.0 }
      ]
    },
    nest: {
      ceiling: { y: 10, col: 0x170508 },
      skyGlow: 0.44, haze: 0.66, ground: 0x1a060a,
      motes: { col: 0xfb7185, size: 0.28, alpha: 0.5, rise: 0.1 },
      layers: [
        { kind: 'bones',       sp: 3.0, d: 4.5, col: 0x3a2028 },
        { kind: 'trees',       sp: 3.0, d: 8,   col: 0x1c070b, bare: true, h0: 3.8, h1: 6.4 },
        { kind: 'stalactites', sp: 2.2, d: 13,  col: 0x2a0d12, top: 8.5, h0: 2.6, h1: 5.0 },
        { kind: 'bricks',      sp: 3.2, d: 20,  col: 0x160508, rows: 5 },
        { kind: 'spires',      sp: 3.4, d: 28,  col: 0x120506, h0: 2.0, h1: 3.4 }
      ]
    },
    trial: {
      ceiling: { y: 10, col: 0x180607 },
      skyGlow: 0.46, haze: 0.66, ground: 0x1c0709,
      motes: { col: 0xff8a6a, size: 0.28, alpha: 0.45, rise: 0.3 },
      layers: [
        { kind: 'rubble',  sp: 2.2, d: 4.5, col: 0x361412, s0: 0.3, s1: 1.0 },
        { kind: 'columns', sp: 3.4, d: 8,   col: 0x30100f, h0: 3.8, h1: 6.6 },
        { kind: 'arches',  sp: 4.2, d: 13,  col: 0x260c0c, h0: 3.0, h1: 5.0 },
        { kind: 'bricks',  sp: 3.0, d: 20,  col: 0x1a0708, rows: 5 },
        { kind: 'arches',  sp: 4.5, d: 28,  col: 0x120405, h0: 2.4, h1: 4.0 }
      ]
    },
    throne: {
      ceiling: { y: 10.5, col: 0x1a1205 },
      skyGlow: 0.5, haze: 0.68, ground: 0x221806,
      motes: { col: 0xfde047, size: 0.32, alpha: 0.5, rise: 0.15 },
      layers: [
        { kind: 'rubble',  sp: 2.4, d: 4.5, col: 0x3d2a0e, s0: 0.3, s1: 1.0 },
        { kind: 'columns', sp: 3.4, d: 8,   col: 0x38270c, h0: 3.8, h1: 6.8 },
        { kind: 'arches',  sp: 4.4, d: 13,  col: 0x2c1e08, h0: 3.0, h1: 5.2 },
        { kind: 'spires',  sp: 3.4, d: 20,  col: 0x241806, h0: 2.2, h1: 3.8 },
        { kind: 'arches',  sp: 4.6, d: 30,  col: 0x1a1204, h0: 2.0, h1: 3.4 }
      ]
    },
    /* --- the ladder rungs --------------------------------------------------- */
    shore: {
      skyGlow: 0.85, haze: 0.85, ground: 0x1b2730,
      stars: { sp: 1.3, size: 0.13, alpha: 0.55 },
      moon: { col: 0xfff0cc, r: 5.0 },
      mist: { sp: 2.8, size: 0.26, alpha: 0.14, col: 0xa8c8e0 },
      motes: { col: 0xa8c8e0, size: 0.26, alpha: 0.4, rise: 0.2 },
      layers: [
        { kind: 'rubble', sp: 2.6, d: 4.5, col: 0x2b3742, s0: 0.25, s1: 0.9 },
        { kind: 'spires', sp: 3.0, d: 8,   col: 0x1f2b36, h0: 3.0, h1: 5.8 },
        { kind: 'hills',  sp: 3.6, d: 13,  col: 0x16212b, h0: 2.0, h1: 3.6 },
        { kind: 'ridge',  sp: 3.2, d: 22,  col: 0x111a24, h0: 1.4, h1: 2.6 },
        { kind: 'ridge',  sp: 3.6, d: 34,  col: 0x0d151e, h0: 1.1, h1: 2.0 }
      ]
    },
    swamp: {
      skyGlow: 0.6, haze: 0.7, ground: 0x101c0a,
      mist: { sp: 3.0, size: 0.3, alpha: 0.2, col: 0x9fd06a },
      motes: { col: 0xb8e06a, size: 0.28, alpha: 0.4, rise: -0.1 },
      layers: [
        { kind: 'reeds', sp: 1.6, d: 4.5, col: 0x1b2c10 },
        { kind: 'trees', sp: 2.6, d: 8,   col: 0x0e1a09, bare: true, h0: 4.2, h1: 7.0 },
        { kind: 'trees', sp: 3.0, d: 13,  col: 0x0a1407, bare: true, h0: 2.8, h1: 4.8 },
        { kind: 'hills', sp: 3.4, d: 20,  col: 0x081005, h0: 1.8, h1: 3.2 },
        { kind: 'spires', sp: 3.0, d: 30, col: 0x060d04, h0: 1.5, h1: 2.6 }
      ]
    },
    mountain: {
      skyGlow: 0.72, haze: 0.85, ground: 0x1a2028,
      stars: { sp: 1.4, size: 0.13, alpha: 0.6 },
      moon: { col: 0xdceaff, r: 5.0 },
      motes: { col: 0xdceaff, size: 0.24, alpha: 0.35, rise: -0.15 },
      layers: [
        { kind: 'rubble', sp: 2.4, d: 4.5, col: 0x3a4351, s0: 0.3, s1: 1.0 },
        { kind: 'spires', sp: 2.8, d: 8,   col: 0x323b48, h0: 3.0, h1: 5.6 },
        { kind: 'ridge',  sp: 3.0, d: 13,  col: 0x28313e, h0: 2.8, h1: 4.8, snow: true },
        { kind: 'ridge',  sp: 3.2, d: 20,  col: 0x1e2634, h0: 2.4, h1: 4.2, snow: true },
        { kind: 'ridge',  sp: 3.4, d: 32,  col: 0x161d2a, h0: 1.9, h1: 3.4, snow: true },
        { kind: 'clouds', sp: 6,   d: 32,  col: 0x3a465c, glow: true }
      ]
    },
    flooded: {
      ceiling: { y: 10.5, col: 0x05121c },
      skyGlow: 0.58, haze: 0.66, ground: 0x0a1a24,
      mist: { sp: 3.0, size: 0.22, alpha: 0.14, col: 0x8fd8ff },
      motes: { col: 0x8fd8ff, size: 0.26, alpha: 0.4, rise: -0.25 },
      layers: [
        { kind: 'ice',     sp: 5.5, d: 4.5, col: 0x2d5a70 },
        { kind: 'columns', sp: 3.4, d: 8,   col: 0x14313f, h0: 3.6, h1: 6.2 },
        { kind: 'arches',  sp: 4.0, d: 13,  col: 0x0f2836, h0: 2.8, h1: 4.6 },
        { kind: 'falls',   sp: 14,  d: 13,  col: 0x8fd8ff, glow: true, h0: 3.0, h1: 5.2 },
        { kind: 'bricks',  sp: 3.0, d: 20,  col: 0x0a1e2b, rows: 5 },
        { kind: 'arches',  sp: 4.5, d: 28,  col: 0x071823, h0: 2.2, h1: 3.6 }
      ]
    },
    volcanic: {
      ceiling: { y: 10, col: 0x150604 },
      skyGlow: 0.9, haze: 0.8, ground: 0x1a0a06,
      mist: { sp: 2.6, size: 0.32, alpha: 0.16, col: 0xff8a3c },
      ember: { sp: 2.8, size: 0.11, alpha: 0.5, col: 0xff8a3c },
      motes: { col: 0xff8a3c, size: 0.2, alpha: 0.45, rise: 0.55 },
      layers: [
        { kind: 'rubble', sp: 2.4, d: 4.5, col: 0x3a1608, s0: 0.3, s1: 1.0 },
        { kind: 'spires', sp: 2.8, d: 8,   col: 0x2f1207, h0: 3.2, h1: 6.0 },
        { kind: 'falls',  sp: 13,  d: 13,  col: 0xff7a3c, glow: true, h0: 3.2, h1: 5.6 },
        { kind: 'ridge',  sp: 3.2, d: 20,  col: 0x1c0a05, h0: 2.2, h1: 3.8 },
        { kind: 'ridge',  sp: 3.4, d: 30,  col: 0x140703, h0: 1.8, h1: 3.0 }
      ]
    }
  };

  /* How many of a band to place across a floor of this width. */
  function bandCount(spec, WU) {
    const n = Math.round(WU / Math.max(0.5, spec.sp || 6));
    return Math.max(1, Math.min(400, n));
  }

  /* One box: [x, y, z, sx, sy, sz, rotZ, rotY]. */
  function box(list, x, y, z, sx, sy, sz, rz, ry) {
    list.push([x, y, z, sx, sy, sz, rz || 0, ry || 0]);
  }

  /* The vocabulary a recipe is written in. Each builder is handed the layer's
     box list, an x along the map's width, the map's floor line, a seeded rng,
     and its own layer entry. */
  /* Every builder writes y from the GROUND LINE UP - the band's own base is
     zero, not the map's bottom row - which is what lets one builder scale a
     whole band up for the far rungs without the base sliding off. */
  const BACKDROP_KINDS = {
    /* Rock teeth: a tapered block with a smaller one leaning on it. */
    spires: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 6, L.h1 || 12);
      const wd = h * rng.float(0.32, 0.62);
      box(o.boxes, x, h * 0.5, 0, wd, h, wd, rng.float(-0.05, 0.05), rng.float(-0.4, 0.4));
      if (rng.chance(0.55)) {
        const h2 = h * rng.float(0.35, 0.7);
        box(o.boxes, x + rng.float(-1.2, 1.2), h2 * 0.5, rng.float(-0.5, 0.5),
            wd * 0.6, h2, wd * 0.6, rng.float(-0.12, 0.12), rng.float(-0.5, 0.5));
      }
    },
    /* Rolling ground: wide, low, overlapping mounds with a shoulder on them.
       The one shape every open horizon needs, because it is what stops a
       distant band from reading as isolated boxes in a void. */
    hills: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 2, L.h1 || 4);
      const wd = rng.float(2.4, 5.0);
      box(o.boxes, x, h * 0.5, rng.float(-0.4, 0.4), wd, h, rng.float(1.6, 3.0), 0, rng.float(-0.25, 0.25));
      if (rng.chance(0.5)) {
        const h2 = h * rng.float(0.45, 0.85);
        box(o.boxes, x + rng.float(-2.2, 2.2), h2 * 0.5, rng.float(-0.5, 0.5),
            wd * 0.6, h2, 2.0, 0, rng.float(-0.3, 0.3));
      }
    },
    /* A mountain ridge: wide overlapping blocks with optional snow caps. */
    ridge: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 3, L.h1 || 6);
      const wd = rng.float(3.2, 7.5);
      box(o.boxes, x, h * 0.5, 0, wd, h, rng.float(2, 4), rng.float(-0.03, 0.03), rng.float(-0.25, 0.25));
      if (L.snow) box(o.boxes, x, h * 0.94, 0, wd * 0.42, h * 0.14, 2.4, 0, rng.float(-0.2, 0.2));
    },
    /* A colonnade: pillar, base, capital. Width follows height, so a two-tile
       far colonnade is as slender as a twenty-unit one was. */
    columns: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 3, L.h1 || 5);
      const wd = h * rng.float(0.09, 0.15);
      box(o.boxes, x, h * 0.5, 0, wd, h, wd);
      box(o.boxes, x, 0.06, 0, wd * 1.6, 0.12, wd * 1.6);
      box(o.boxes, x, h - 0.05, 0, wd * 1.5, 0.14, wd * 1.5);
    },
    /* Pillars with a lintel across them - halls, vaults, prisons. */
    arches: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 3, L.h1 || 5);
      const span = h * rng.float(0.22, 0.4);
      const wd = h * rng.float(0.05, 0.09);
      box(o.boxes, x - span * 0.5, h * 0.5, 0, wd, h, h * 0.3);
      box(o.boxes, x + span * 0.5, h * 0.5, 0, wd, h, h * 0.3);
      box(o.boxes, x, h + h * 0.06, 0, span + wd * 1.6, h * 0.12, h * 0.36);
      if (rng.chance(0.5)) box(o.boxes, x, h + h * 0.2, 0, span * 0.5, h * 0.12, h * 0.32);
    },
    /* A ruined wall face: slabs with gaps where the mortar fell out. */
    bricks: function (o, x, rng, L) {
      const rows = L.rows || 8;
      for (let r = 0; r < rows; r++) {
        if (rng.chance(0.22)) continue;
        const y = 0.9 + r * 1.0;
        box(o.boxes, x + rng.float(-0.5, 0.5), y, 0, rng.float(2.6, 5.2), 0.9, 1.1, 0, 0);
      }
    },
    /* Trees. `bare` drops the canopy and keeps dead branches instead, and the
       canopy is sized off the trunk so a far treeline is still a treeline. */
    trees: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 3, L.h1 || 5);
      const trunkW = h * rng.float(0.06, 0.11);
      box(o.boxes, x, h * 0.5, 0, trunkW, h, trunkW, rng.float(-0.03, 0.03));
      if (L.bare) {
        for (let b = 0; b < 3; b++) {
          box(o.boxes, x + rng.float(-1.2, 1.2), h * rng.float(0.45, 0.9), rng.float(-0.4, 0.4),
              h * rng.float(0.3, 0.55), 0.16, 0.16, rng.float(-0.5, 0.5));
        }
        return;
      }
      const cw = h * rng.float(0.6, 0.95);
      box(o.boxes, x, h + cw * 0.25, 0, cw, cw * 0.42, cw * 0.8);
      box(o.boxes, x + rng.float(-0.8, 0.8), h + cw * 0.75, 0, cw * 0.7, cw * 0.36, cw * 0.6);
    },
    /* Reeds: thin blades in a clump, the swamp and the shore's near rung. */
    reeds: function (o, x, rng, L) {
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        const h = rng.float(0.5, 1.5);
        box(o.boxes, x + rng.float(-1.1, 1.1), h * 0.5, rng.float(-0.4, 0.4),
            rng.float(0.09, 0.18), h, 0.14, rng.float(-0.12, 0.12));
      }
    },
    /* Cloud bands, well above the ground line: the only thing a backdrop may
       put ABOVE the horizon, so they stay flat, pale and unlit. */
    clouds: function (o, x, rng, L) {
      const y = rng.float(6.5, 9.5);
      const wd = rng.float(3.5, 8.0);
      box(o.boxes, x, y, rng.float(-6, 0), wd, rng.float(0.5, 1.1), rng.float(1.5, 2.6));
      if (rng.chance(0.6)) {
        box(o.boxes, x + rng.float(-3, 3), y + rng.float(-1.2, 1.2), rng.float(-6, 0),
            wd * rng.float(0.5, 0.9), rng.float(0.35, 0.8), rng.float(1.2, 2.2));
      }
    },
    /* Stalactites hanging off a ceiling line. */
    stalactites: function (o, x, rng, L) {
      /* Hanging teeth are the one shape where a repeated row reads as a
         pattern in a heartbeat: the drop point varies by a couple of units and
         one in four is a long one, so the fringe has a profile. */
      const top = (L.top || 8.5) + rng.float(-1.2, 1.2);
      const h = rng.float(L.h0 || 1.4, L.h1 || 3.4) * (rng.chance(0.26) ? 1.45 : 1);
      o.shards.push([x, top - h * 0.5, rng.float(-0.9, 0.9), h * rng.float(0.2, 0.52), h, 0.0]);
    },
    /* Crystal clusters - octahedra, the only non-box primitive with a glow. */
    crystals: function (o, x, rng, L) {
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const s = rng.float(L.s0 || 0.5, L.s1 || 1.6);
        o.shards.push([x + rng.float(-1.1, 1.1), s * rng.float(0.5, 1.3), rng.float(-0.5, 0.5), s, s, rng.float(0, 3.14)]);
      }
    },
    /* Ice: flat angular slabs standing and lying in the water light. */
    ice: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 1.2, L.h1 || 2.6);
      box(o.boxes, x, h * 0.5, 0, rng.float(2, 4) * (h / 5), h, rng.float(0.5, 1.2), rng.float(-0.3, 0.3), rng.float(-0.5, 0.5));
      box(o.boxes, x + rng.float(-2, 2), 0.2, 0, rng.float(2, 4) * (h / 5), 0.5, rng.float(1.5, 3), 0, rng.float(-0.6, 0.6));
    },
    /* A falling sheet of water (or lava) against the far wall. */
    falls: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 3, L.h1 || 6);
      box(o.boxes, x, h * 0.5, 0, h * rng.float(0.16, 0.3), h, 0.25);
      box(o.boxes, x, 0.35, 0, h * rng.float(0.35, 0.6), 0.8, rng.float(1.6, 3));
    },
    /* Loose stone at the foot of the wall. */
    rubble: function (o, x, rng, L) {
      for (let i = 0; i < 3; i++) {
        const s = rng.float(L.s0 || 0.25, L.s1 || 1.0);
        box(o.boxes, x + rng.float(-1.2, 1.2), s * 0.45, rng.float(-0.3, 0.8), s, s * 0.9, s, rng.float(-0.4, 0.4), rng.float(0, 1.5));
      }
    },
    /* Bone piles: crossed long bones and a skull-sized block. */
    bones: function (o, x, rng, L) {
      for (let i = 0; i < 3; i++) {
        box(o.boxes, x + rng.float(-1.4, 1.4), rng.float(0.15, 0.5), rng.float(-0.2, 0.6),
            rng.float(0.8, 1.6), 0.18, 0.18, rng.float(-1.2, 1.2), rng.float(0, 1.5));
      }
      box(o.boxes, x + rng.float(-0.6, 0.6), 0.3, 0, rng.float(0.4, 0.6), 0.5, 0.5);
    }
  };

  /* A cheap deterministic hash, used for per-instance value jitter: forty
     identical rocks in one band would otherwise render as a single flat mass,
     and breaking that mass up into objects is the cheapest realism there is. */
  function hash01(n) {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  /* `tint` is how much per-instance value jitter to apply (0 = none). Only the
     backdrop asks for it; the dungeon's own batches stay uniform. */
  function instancedBoxes(list, mat, tint) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const d = new THREE.Object3D();
    const inst = tint ? new THREE.Color() : null;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      d.position.set(b[0], b[1], b[2]);
      /* Defaulted, not read raw: a caller that omits the rotation slots (the
         water batches do) would otherwise write NaN into every instance matrix
         and three would silently draw nothing at all. */
      d.rotation.set(0, b[7] || 0, b[6] || 0);
      d.scale.set(b[3], b[4], b[5]);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      if (inst) {
        const j = 1 - tint * 0.5 + tint * hash01(b[0] * 0.37 + b[1] * 0.11 + b[2] * 0.71);
        inst.setRGB(j, j, j);
        mesh.setColorAt(i, inst);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    /* Culling is switched OFF on every backdrop batch. three r128 bounds an
       InstancedMesh by its GEOMETRY (a unit box at the group origin), not by
       the instances, so a band spanning 200 world units disappears the moment
       the camera pans away from x=0 — which read as "the background is missing
       past the first room". */
    mesh.frustumCulled = false;
    return mesh;
  }

  function instancedShards(list, mat, geo, flip, tint) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const d = new THREE.Object3D();
    const inst = tint ? new THREE.Color() : null;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      d.position.set(s[0], s[1], s[2]);
      // A cone points +y by default; a stalactite has to point at the floor.
      d.rotation.set(flip ? Math.PI : 0, s[5], 0);
      d.scale.set(s[3], s[4], s[3]);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      if (inst) {
        const j = 1 - tint * 0.5 + tint * hash01(s[0] * 0.53 + s[1] * 0.29 + s[2] * 0.61);
        inst.setRGB(j, j, j);
        mesh.setColorAt(i, inst);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* Slow, sparse motes in the backdrop air - mist over a swamp, embers in an
     ash field. Separate from ScreenParticleManager, which drifts with the
     camera: this belongs to the horizon, so it is strung over the near half of
     the ladder and anchored to the same ground line as the bands. */
  /* Motes that MOVE. The spec now carries a rise (a plume going up) and a
     drift (a bank of mist sliding sideways); both default to a slow sideways
     wander so even a spec authored without either still has air in it. */
  function backdropMotes(spec, WU, anchorY, rng) {
    const n = bandCount(spec, WU);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const rise = spec.rise != null ? spec.rise : 0;
    const drift = spec.drift != null ? spec.drift : 0.35;
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 0] = rng.float(-0.05, 1.05) * WU;
      pos[i * 3 + 1] = anchorY + rng.float(0.5, 14);
      pos[i * 3 + 2] = rng.float(-34, -4);
      vel[i * 3 + 0] = drift * rng.float(0.6, 1.4);
      vel[i * 3 + 1] = rise * rng.float(0.5, 1.5);
      vel[i * 3 + 2] = 0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: spec.col || 0xffffff, size: spec.size, transparent: true,
      opacity: spec.alpha, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    backdropAir.push({
      pts: pts, vel: vel, spanX: WU * 1.25, topY: anchorY + 16,
      botY: anchorY, pulse: spec.pulse != null ? spec.pulse : 0.18
    });
    return pts;
  }

  /* A flock, as silhouettes. Deliberately the cheapest possible bird: two
     wing plates on a body, flown across the far sky at the ladder's outer
     depth and lit by nothing, so the eye reads only a shape crossing a lit
     background -- which is exactly what makes a still horizon feel alive. */
  function buildSkyLife(parent, rec, WU, anchorY, rng) {
    const n = 3 + Math.floor(rng.float(0, 3));
    /* A silhouette is the theme's own ground colour taken down, so a bird on a
       pale shore sky and a bird over a volcanic ash field are the same shape in
       the same place and still belong to their own palette. */
    const col = new THREE.Color(rec.ground != null ? rec.ground : 0x101018).multiplyScalar(0.6);
    const mat = new THREE.MeshBasicMaterial({ color: col, fog: false });
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.16, 0.2);
    const wingGeo = new THREE.BoxGeometry(0.42, 0.07, 0.18);
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, mat);
      b.add(body);
      const lw = new THREE.Mesh(wingGeo, mat);
      lw.position.set(-0.32, 0, 0);
      const rw = new THREE.Mesh(wingGeo, mat);
      rw.position.set(0.32, 0, 0);
      b.add(lw); b.add(rw);
      b.position.set(rng.float(0, WU), anchorY + rng.float(9, 17), rng.float(-40, -26));
      b.scale.setScalar(rng.float(0.7, 1.15));
      backdropLife.push({
        obj: b, lw: lw, rw: rw,
        speed: rng.float(1.6, 3.1) * (rng.chance(0.5) ? 1 : -1),
        flap: rng.float(6.5, 9.5), phase: rng.float(0, 6.28),
        bob: rng.float(0.25, 0.6), spanX: WU * 1.2
      });
      parent.add(b);
    }
  }

  /* A sky is not a backdrop painting: it is the far shell of the world, and the
     whole job of it is the bright haze band that sits ON the horizon line.
     Four stops, canvas top to bottom: dark overhead, the theme's mid sky, a
     still-hazy band, and the haze itself at the ground line. */
  function makeSkyTexture(topHex, midHex, lowHex, hazeHex) {
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 128;
    const ctx = cv.getContext('2d');
    /* The stops are placed against what the camera can actually see, not
       against the plane: the plane runs 8 units below the eye line, so its very
       bottom (and the pure haze colour on it) is hidden behind the far ground.
       The haze plateau therefore starts at 0.9 - about seven degrees above the
       horizon - which is the band the eye reads as "there is distance there". */
    const grd = ctx.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, topHex);
    grd.addColorStop(0.5, midHex);
    grd.addColorStop(0.78, lowHex);
    grd.addColorStop(0.9, hazeHex);
    grd.addColorStop(1, hazeHex);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 2, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  function hexToRgb(hex) {
    return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
  }

  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(A.r + (B.r - A.r) * t);
    const g = Math.round(A.g + (B.g - A.g) * t);
    const bl = Math.round(A.b + (B.b - A.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function buildBackdrop(themeName, w, h, anchorY) {
    /* Every motion list belongs to the theme that built it. */
    backdropAir = [];
    backdropSway = [];
    backdropLife = [];

    const rec = BACKDROP_RECIPE[themeName] || BACKDROP_RECIPE.forest;
    const theme = THEMES[themeName] || THEMES.forest;
    const WU = w * 16 * P2U;
    const rng = DS.makeRng((0x5EEDBA5E ^ (themeName.length * 7919) ^ (w * 131)) >>> 0);
    const group = new THREE.Group();
    const glow = rec.skyGlow != null ? rec.skyGlow : 0.75;

    /* The haze the horizon fades into. The sky's lowest band IS this colour,
       and every distant band is mixed toward a darkened copy of it, because a
       Lambert surface is lit by the ambient + hemisphere rig (about 1.4x) and
       an unlit sky is not: mixing a band toward the raw sky haze comes out
       BRIGHTER than the sky behind it, which is exactly the washed-out, inverted
       horizon this rework exists to kill. Silhouettes must sit below the haze. */
    const hazeHex = mixHex(mixHex(theme.fog, theme.hemiSky, 0.15 + 0.95 * glow), 0xffffff, 0.08);
    /* The sky is scaled down as a whole (SKY_GAIN) so the horizon haze is a
       night value and the banded landforms in front of it can still be darker
       than it -- the order that makes aerial perspective read. */
    const skyHaze = new THREE.Color(hazeHex).multiplyScalar(SKY_GAIN);
    const bandHaze = new THREE.Color(hazeHex).multiplyScalar(0.45 * SKY_GAIN + 0.16);
    const topHex = new THREE.Color(mixHex(theme.fog, 0x000000, 0.35)).multiplyScalar(SKY_GAIN);
    scene.background = new THREE.Color(topHex);

    /* --- the sky rig -------------------------------------------------------
       Gradient, stars and moon live in one group whose origin is the EYE LINE
       (render() pins it there every frame), so the haze band lands on the
       horizon whatever the camera's height - which is what keeps a floor's
       horizon from drifting as the player walks up and down. */
    skyRig = new THREE.Group();
    skyRig.position.set(WU * 0.5, 0, BACKDROP_SKY_Z);

    const skyCss = function (col, k) {
      return '#' + (k === 1 ? col : col.clone().multiplyScalar(k)).getHexString();
    };
    const skyMat = new THREE.MeshBasicMaterial({
      map: makeSkyTexture(skyCss(new THREE.Color(topHex), 1),
                          skyCss(new THREE.Color(mixHex(theme.fog, theme.hemiSky, 0.18 * glow)), SKY_GAIN),
                          skyCss(new THREE.Color(mixHex(theme.fog, theme.hemiSky, 0.52 * glow)), SKY_GAIN),
                          '#' + skyHaze.getHexString()),
      fog: false, depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(WU * 3, SKY_H + SKY_DROP), skyMat);
    sky.position.set(0, (SKY_H - SKY_DROP) * 0.5, 0);
    sky.frustumCulled = false;
    skyRig.add(sky);

    if (rec.stars) {
      const starN = bandCount(rec.stars, WU);
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(starN * 3);
      for (let i = 0; i < starN; i++) {
        pos[i * 3 + 0] = rng.float(-0.5, 1.5) * WU;
        pos[i * 3 + 1] = rng.float(18, SKY_H - 12);
        pos[i * 3 + 2] = 1;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xcfe0ff, size: rec.stars.size, transparent: true,
        opacity: rec.stars.alpha, sizeAttenuation: true, depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const stars = new THREE.Points(geo, mat);
      stars.frustumCulled = false;
      skyRig.add(stars);
    }

    if (rec.moon) {
      const moonMat = new THREE.MeshBasicMaterial({ color: rec.moon.col, fog: false });
      const moon = new THREE.Mesh(new THREE.CircleGeometry(rec.moon.r || 4.5, 20), moonMat);
      moon.position.set(WU * 0.26, rng.float(60, 100), 0.5);
      moon.frustumCulled = false;
      skyRig.add(moon);
    }

    group.add(skyRig);

    /* --- the ground --------------------------------------------------------
       Not one slab but three, each a little paler than the last in toward the
       horizon, so the plain carries its own depth ramp. Without it the bands
       stand in a void and the walkway floats over nothing; with it the terrain
       runs from under the player's feet to the sky, which is most of what makes
       a horizon read as a place. A single flat plane at one value would read as
       a wall lying down - and it would also hand the bands nothing to be told
       apart from. */
    const groundHex = mixHex(rec.ground != null ? rec.ground : theme.fog, hazeHex, 0.3);
    const GSEG = [
      { near: 1.2, far: 13, tone: 0.34 },
      { near: 13, far: 40, tone: 0.52 },
      { near: 40, far: BACKDROP_GROUND_D, tone: 0.72 }
    ];
    for (let gi = 0; gi < GSEG.length; gi++) {
      const s = GSEG[gi];
      const segMat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(groundHex).multiplyScalar(s.tone)
      });
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(WU * 2, 2.6, s.far - s.near), segMat);
      seg.position.set(WU * 0.5, anchorY - 1.3, -(s.near + s.far) * 0.5);
      seg.frustumCulled = false;
      group.add(seg);
    }

    /* --- the ladder -------------------------------------------------------- */
    const layers = rec.layers || [];
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const d = L.d != null ? L.d : BACKDROP_REF_D;
      const k = L.k != null ? L.k : (CAM_DIST + d) / (CAM_DIST + BACKDROP_REF_D);
      const o = { boxes: [], shards: [] };
      const kind = BACKDROP_KINDS[L.kind];
      if (!kind) continue;
      const n = bandCount(L, WU);
      for (let j = 0; j < n; j++) {
        kind(o, rng.float(-0.06, 1.06) * WU, rng, L);
      }

      /* Aerial perspective. Two silhouettes of the same value at 6 and 44 units
         read as one flat cut-out, so every far band is mixed toward the horizon
         haze until it is a pale ghost of the near one. A band that is its own
         light source (lava, a light shaft) keeps most of its colour, because a
         washed-out torch stops reading as a light. */
      const far = M.clamp((d - BACKDROP_REF_D) / 34, 0, 1);
      const hazeT = far * (rec.haze != null ? rec.haze : 0.75) * (L.glow ? 0.35 : 1);
      const col = new THREE.Color(L.col).lerp(bandHaze, hazeT);
      const mat = L.glow
        ? new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 })
        : new THREE.MeshLambertMaterial({ color: col });
      /* The near rung keeps a touch more of its own light (the torch is right
         there), and no more than a touch: the whole depth read depends on the
         near band being the DARK one. */
      if (!L.glow) mat.color.multiplyScalar(1 + (1 - far) * 0.12);

      /* One scale for the whole band about its base: authored in reference
         units, enlarged by exactly the factor that its distance grew by. */
      const layerGroup = new THREE.Group();
      layerGroup.position.set(WU * 0.5 * (1 - k), anchorY, -d);
      layerGroup.scale.setScalar(k);
      if (o.boxes.length) layerGroup.add(instancedBoxes(o.boxes, mat, 0.44));
      if (o.shards.length) {
        const isCrystal = L.kind === 'crystals';
        const geo = isCrystal
          ? new THREE.OctahedronGeometry(0.5)
          : new THREE.ConeGeometry(0.6, 1, 5);
        layerGroup.add(instancedShards(o.shards, mat, geo, !isCrystal, 0.4));
      }
      group.add(layerGroup);
      const sway = SWAY_KINDS[L.kind];
      if (sway) {
        backdropSway.push({
          obj: layerGroup, base: layerGroup.position.x,
          amp: sway.amp * (1 - far * 0.65), spd: sway.spd,
          phase: rng.float(0, 6.28)
        });
      } else if (L.kind === 'clouds') {
        backdropSway.push({
          obj: layerGroup, base: layerGroup.position.x,
          amp: 0, spd: 0.2, phase: rng.float(0, 6.28),
          drift: CLOUD_DRIFT * (1 - far * 0.5), spanX: WU * 1.2
        });
      }
    }

    /* An underground theme gets a roof: one long slab with teeth under it, which
       is what tells the eye "this room has a roof" instead of "this room has a
       painting on the back wall". It starts a few units out, because a ceiling
       directly overhead is above the top of the frame and only comes into view
       once it has receded. */
    if (rec.ceiling) {
      const c = rec.ceiling;
      const cmat = new THREE.MeshLambertMaterial({ color: mixHex(c.col, hazeHex, 0.14) });
      const cg = new THREE.Group();
      cg.position.y = anchorY;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(WU * 1.6, 2.0, BACKDROP_GROUND_D * 0.85), cmat);
      slab.position.set(WU * 0.5, c.y + 1.0, -BACKDROP_GROUND_D * 0.42);
      slab.frustumCulled = false;
      cg.add(slab);
      const teeth = [];
      const toothCount = bandCount({ sp: 4.5 }, WU);
      for (let i = 0; i < toothCount; i++) {
        const th = rng.float(1.0, 2.6);
        box(teeth, rng.float(-0.04, 1.04) * WU, c.y - th * 0.5, rng.float(-26, -2),
            rng.float(0.7, 1.6), th, rng.float(0.7, 1.6));
      }
      cg.add(instancedBoxes(teeth, cmat, 0.3));
      group.add(cg);
    }

    if (rec.mist) { const m = backdropMotes(rec.mist, WU, anchorY, rng); m.frustumCulled = false; group.add(m); }
    if (rec.ember) { const m = backdropMotes(rec.ember, WU, anchorY, rng); m.frustumCulled = false; group.add(m); }

    /* Living silhouettes belong to a sky. An underground theme has a roof over
       its head (rec.ceiling), so it keeps the drifting air instead and gets no
       flock -- birds under a stone ceiling would be the one thing that breaks
       the read of the room. */
    if (!rec.ceiling) buildSkyLife(group, rec, WU, anchorY, rng);

    return group;
  }

  /* One step of every backdrop motion. Called once a frame with the render
     clock so the horizon keeps its own time (the bands are not simulated). */
  function updateBackdropLife(time, dt) {
    const step = dt > 0 && dt < 0.1 ? dt : 0.016;

    for (let i = 0; i < backdropAir.length; i++) {
      const a = backdropAir[i];
      const pos = a.pts.geometry.attributes.position.array;
      for (let j = 0; j < pos.length; j += 3) {
        pos[j]     += a.vel[j]     * step;
        pos[j + 1] += a.vel[j + 1] * step;
        if (a.vel[j] > 0 && pos[j] > a.spanX) pos[j] = -a.spanX * 0.05;
        else if (a.vel[j] < 0 && pos[j] < -a.spanX * 0.05) pos[j] = a.spanX;
        if (a.vel[j + 1] > 0 && pos[j + 1] > a.topY) pos[j + 1] = a.botY;
      }
      a.pts.geometry.attributes.position.needsUpdate = true;
      /* A slow swell in the opacity, so a bank of mist reads as air rather
         than as a fixed scattering of dots. */
      a.pts.material.opacity = a.pts.material.opacity * (1 - a.pulse * step * 2)
        + a.pulse * (1 + Math.sin(time * 0.6 + i) * 0.5) * step * 2;
    }

    for (let i = 0; i < backdropSway.length; i++) {
      const s = backdropSway[i];
      if (s.amp) s.obj.rotation.z = Math.sin(time * s.spd + s.phase) * s.amp;
      if (s.drift) {
        s.obj.position.x += s.drift * step;
        if (s.obj.position.x > s.base + s.spanX * 0.5) s.obj.position.x = s.base - s.spanX * 0.5;
      }
    }

    for (let i = 0; i < backdropLife.length; i++) {
      const b = backdropLife[i];
      b.obj.position.x += b.speed * step;
      if (b.speed > 0 && b.obj.position.x > b.spanX) b.obj.position.x = -b.spanX * 0.15;
      else if (b.speed < 0 && b.obj.position.x < -b.spanX * 0.15) b.obj.position.x = b.spanX;
      b.obj.position.y += Math.sin(time * b.bob + b.phase) * 0.004;
      const flap = Math.sin(time * b.flap + b.phase) * 0.55;
      b.lw.rotation.z = flap;
      b.rw.rotation.z = -flap;
    }
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
      renderer.setPixelRatio(window.devicePixelRatio || 1);
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
          applyCameraPreset(0);   // back to the shipped side-on shot
        }
      });
      /* Straight side-on, always. `ds.cameraPreset` is cleared rather than
         read: an older build saved the angled preset, and restoring it is what
         made a returning player's game come up crooked. */
      try { localStorage.removeItem('ds.cameraPreset'); } catch (e) { /* private mode */ }
      applyCameraPreset(0);
      camRig.show = 0;   // the readout is for F6, not for boot
    } catch (err) {
      console.warn('WebGL init failed:', err);
      return false;
    }

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(THEMES.forest.fog, FOG_DENSITY);

    camera = new THREE.PerspectiveCamera(FOV, DS.C.W / DS.C.H, 0.5, 160);

    ambientLight = new THREE.AmbientLight(THEMES.forest.ambient, AMBIENT_I);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(THEMES.forest.hemiSky, THEMES.forest.hemiGround, HEMI_I);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(THEMES.forest.dir, THEMES.forest.dirI * KEY_GAIN);
    dirLight.position.set(15, 30, 25);
    scene.add(dirLight);

    playerLight = new THREE.PointLight(0xffe2a0, LAMP_I, 12, 1.4);

    /* The back light. It used to be a 0.16 nudge that only kept a monster from
       matching the wall behind it; with voxel models and a lit backdrop, light
       coming from BEHIND is what gives every block two visible faces, so it is
       a real light now -- the moon behind the dungeon, and the reason a monster
       reads as a silhouette against the horizon. */
    backLight = new THREE.DirectionalLight(0x9fb0d0, 0.42);
    backLight.position.set(-12, 18, -26);
    scene.add(backLight);

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

    // The camera must join the scene graph for its vignette child to render.
    scene.add(camera);
    vignetteMesh = buildVignette();

    resize();
    enabled = true;
    return true;
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
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    camera.aspect = DS.C.W / DS.C.H;
    camera.updateProjectionMatrix();
  }

  /* The play frame in device pixels: the same centred 16:9 rectangle the screen
     layer draws into (ui3/screen.js computes it in CSS pixels), so the world and
     its HUD share one coordinate system. */
  function playViewport() {
    const el = renderer.domElement;
    const v = DS.UI3 && DS.UI3.view;
    if (!v) return { x: 0, y: 0, w: el.width, h: el.height };
    const dpr = el.width / Math.max(1, el.clientWidth || el.width);
    return {
      x: Math.round(v.x * dpr),
      y: Math.round(el.height - (v.y + v.h) * dpr),
      w: Math.max(1, Math.round(v.w * dpr)),
      h: Math.max(1, Math.round(v.h * dpr))
    };
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

  /* Mood + backdrop. Everything big and distant lives here; the walkway
     architecture is built in loadLevel(). */
  function setupTheme(themeName, w, h, biome, anchorY) {
    const t = THEMES[themeName] || THEMES.forest;
    activeTheme = t;

    scene.fog = new THREE.FogExp2(t.fog, FOG_DENSITY);
    ambientLight.color.setHex(t.ambient);
    ambientLight.intensity = AMBIENT_I;
    hemiLight.color.setHex(t.hemiSky);
    hemiLight.groundColor.setHex(t.hemiGround);
    hemiLight.intensity = HEMI_I;      dirLight.color.setHex(t.dir);
      dirLight.intensity = t.dirI * KEY_GAIN;
    dirLight.position.set(15, 30, 25);

    /* A second, weak key from BEHIND. Everything in the game was lit from the
       camera's side, which flattens voxel models into coloured stickers; one
       dim back light picks out their edges and makes the silhouettes separate
       from the walls behind them. */
    if (backLight) {
      backLight.color.setHex(t.hemiSky);
      backLight.intensity = 0.42;
      backLight.position.set(-12, 18, -26);
    }
    if (fillLight) {
      fillLight.color.setHex(t.ambient);
      fillLight.intensity = 0.18;
    }

    disposeGroup(themeGroup);
    skyRig = null;

    /* The horizon is geometry now (see BACKDROP_RECIPE), standing on the
       level's own walking surface. It goes into the same group the old planes
       lived in, so teardown is unchanged. */
    const backdrop = buildBackdrop(themeName, w, h, anchorY);
    if (backdrop) themeGroup.add(backdrop);

    if (screenParticleManager) {
      screenParticleManager.setTheme(themeName, BACKDROP_RECIPE[themeName]);
    }
  }

  function createDoorwayMesh() {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x3d384c });
    const archMat = new THREE.MeshLambertMaterial({ color: 0x564d72 });

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

    const pLight = new THREE.PointLight(0x4ee2ec, 1.3, 8.0, 2.0);
    pLight.position.set(0, 1.6, 0.8);
    group.add(pLight);

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

    const iron = new THREE.MeshLambertMaterial({ color: 0x2a2733 });
    const ironLight = new THREE.MeshLambertMaterial({ color: 0x4a4658 });

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

    const fMat = new THREE.SpriteMaterial({
      map: flameTex,
      blending: THREE.AdditiveBlending,
      transparent: true
    });
    const flame = new THREE.Sprite(fMat);
    flame.position.set(0, 0.08 + segH * 3 + 0.44, 0);
    flame.scale.set(0.9, 1.2, 1.1);
    group.add(flame);

    /* No light of its own. It registers as an EMITTER: `smooth` is its live
       intensity, and the shared pool lights whichever emitters are nearest the
       player (see FLAME_LIGHTS). */
    group.position.set(x, y, 0.2);
    propsGroup.add(group);
    return {
      sprite: flame,
      seed: Math.random() * 20,
      baseIntensity: TORCH_I,
      flickerOffset: Math.random() * 20,
      smooth: TORCH_I,
      lift: 0.08 + segH * 3 + 0.5,     // where the fire actually is, in the group
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
    const iron = new THREE.MeshLambertMaterial({ color: 0x55506a });
    const ironLight = new THREE.MeshLambertMaterial({ color: 0x8a84a8 });
    const coalMat = new THREE.MeshLambertMaterial({ color: 0x2a1a18 });

    part(group, 0.34, 0.1, 0.34, 0, 0.05, 0, iron);         // foot
    part(group, 0.12, 1.0, 0.12, 0, 0.6, 0, iron);          // post
    part(group, 0.22, 0.08, 0.22, 0, 1.1, 0, ironLight);    // collar
    part(group, 0.52, 0.26, 0.52, 0, 1.24, 0, iron);        // bowl
    part(group, 0.6, 0.06, 0.6, 0, 1.39, 0, ironLight);     // lip
    part(group, 0.42, 0.07, 0.42, 0, 1.4, 0, coalMat);      // coals

    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.95
    }));
    flame.position.set(0, 1.66, 0);
    flame.scale.set(0.85, 1.2, 1);
    flame.visible = false;
    group.add(flame);

    // b.y marks the top of an 18px-tall brazier, so its floor line is y + 18.
    const bottom = (b.y || 0) + 18;
    const floor = groundAnchor(map, b.x, bottom);    group.position.set(b.x * P2U, -floor * P2U, 0.2);
    propsGroup.add(group);
    return { group, flame, coalMat, ref: b, smooth: 0, lift: 1.75 };
  }

  // --- puzzle hardware in 3D: gate bars, lever, crates -----------------------
  function part(parent, sx, sy, sz, x, y, z, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function createGateMesh(gate) {
    const group = new THREE.Group();
    const barMat = new THREE.MeshLambertMaterial({ color: 0x6f6a90 });
    const barDark = new THREE.MeshLambertMaterial({ color: 0x3a3654 });
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
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x3a3654 });
    const stickMat = new THREE.MeshLambertMaterial({ color: 0x8a6340 });
    part(group, 0.42, 0.12, 0.42, 0, 0.06, 0, baseMat);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.12, 0);
    group.add(pivot);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), stickMat);
    stick.position.y = 0.31;
    pivot.add(stick);
    const knobMat = new THREE.MeshLambertMaterial({ color: 0xc0303c });
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
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a6340 });
    const woodDark = new THREE.MeshLambertMaterial({ color: 0x5c3f2a });
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

    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2c2838 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x6f6a90 });
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x8a84a8 });

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
    const group = model ? model.root : new THREE.Group();

    // Fallback so chests still exist if the voxel layer ever goes away.
    let lidGroup = model && model.lid;
    if (!model) {
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x5c3d26 });
      const trimMat = new THREE.MeshLambertMaterial({ color: 0xd4a046 });
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
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x24202c });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.06, 0);
    group.add(base);

    const coneGeo = new THREE.ConeGeometry(0.18, 0.72, 4);
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xc8c3d8 });
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
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x1a060a });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.08, 0);
    group.add(base);

    const spikeGeo = new THREE.ConeGeometry(0.24, 1.28, 5);
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x6e1b24, emissive: 0x3d0a10, emissiveIntensity: 0.45 });

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
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x7a5634 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.17, 0);
    group.add(slab);

    const chainGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6);
    const chainMat = new THREE.MeshLambertMaterial({ color: 0x484256 });
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
    const ballMat = new THREE.MeshLambertMaterial({ color: 0x3e3a4e });
    const sphere = new THREE.Mesh(sphereGeo, ballMat);
    group.add(sphere);

    const spikeGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0xd0cce0 });
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
    const chainMat = new THREE.MeshLambertMaterial({ color: 0x484256 });
    const chain = new THREE.Mesh(chainGeo, chainMat);
    group.add(chain);

    propsGroup.add(group);
    return { group, sphere, chain, kind: 'ball' };
  }

  function createSawMesh() {
    const group = new THREE.Group();
    const diskGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.08, 16);
    const sawMat = new THREE.MeshLambertMaterial({ color: 0xa8a4be });
    const disk = new THREE.Mesh(diskGeo, sawMat);
    disk.rotation.x = Math.PI / 2;
    group.add(disk);

    // Hub cap
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x3d394e });
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
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x6e5239 });
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
    clearElemRigs();
    elemBolts.forEach(function (eb) { if (eb.mesh.parent) eb.mesh.parent.remove(eb.mesh); });
    elemBolts = [];
    groundBursts.forEach(function (gb) { if (gb.group.parent) gb.group.parent.remove(gb.group); });
    groundBursts = [];
    swingFx.forEach(function (s) { if (s.group.parent) s.group.parent.remove(s.group); });
    swingFx = [];
    shrineMesh = null;
    if (fxGroup) fxGroup.children.length = 0;

    torchLights = [];   // the pool they point at outlives the level, by design

    flameSprites.forEach(fs => scene.remove(fs.sprite));
    flameSprites = [];

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
          torchLights.push(torchObj);
          flameSprites.push(torchObj);
        } else if (DS.Voxel && (d.kind === 'merchant' || d.kind === 'table')) {
          // NPCs and furniture: blocky models, so the safe room reads 3D too.
          // decor y marks the sprite top (floor minus sprite height); plant
          // the model on the floor instead so nothing hovers.
          const model = DS.Voxel.build(d.kind, {});
          if (model) {
            const mFloor = snapToFloor(map, d.x + 8, d.y);
            model.root.position.set((d.x + 8) * P2U, -mFloor * P2U, 0.3);
            actorGroup.add(model.root);
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
          if (pz.braziers) {
            for (let j = 0; j < pz.braziers.length; j++) {
              brazierMeshes.push(createBrazierMesh(pz.braziers[j], map));
            }
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

    if (g && g.shrine && DS.Voxel) {
      shrineMesh = DS.Voxel.build('shrine', {});
      // Sit on the real floor under the shrine marker (marker y is a tile row,
      // not a surface) so the plinth never floats or drowns.
      const sFloor = snapToFloor(g.map, g.shrine.x + 8, g.shrine.y);
      shrineMesh.root.position.set((g.shrine.x + 8) * P2U, -sFloor * P2U, 0.12);
      actorGroup.add(shrineMesh.root);
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
        const m = instancedBoxes(bodies, bodyMat);
        m.renderOrder = 2;
        dungeonGroup.add(m);
      }
      if (surfaces.length) {
        const m = instancedBoxes(surfaces, surfMat);
        m.renderOrder = 3;
        waterSurfaceMesh = m;
        dungeonGroup.add(m);
      }
      if (crests.length) {
        const m = instancedBoxes(crests, crestMat);
        m.renderOrder = 4;
        waterCrestMesh = m;
        dungeonGroup.add(m);
      }
    }

    // Ropes as real 3D geometry: one knotted strand per run of rope tiles.
    // The mountain shafts live or die by these reading as climbable lines.
    if (map.isRope) {
      const ropeMat = new THREE.MeshLambertMaterial({ color: 0xa87848 });
      const ropeDark = new THREE.MeshLambertMaterial({ color: 0x5c3f2a });
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
            const uH = (y1 - ty + 1) * TILE_SIZE;
            const group = new THREE.Group();
            const cx = ((tx + x1 + 1) * 0.5 * 16) * P2U;
            // Strand: a vertical box column per tile-wide rope.
            const strandW = Math.min(uW, 0.14);
            part(group, strandW, uH, strandW, 0, 0, 0, ropeDark);
            // Inner lit core slightly forward so the braid reads in fog.
            part(group, strandW * 0.5, uH * 0.96, strandW * 0.5, 0, 0, strandW * 0.45, ropeMat);
            // Knots every tile and an anchor block at the top.
            for (let ky = 0; ky < y1 - ty + 1; ky++) {
              part(group, strandW * 2.2, 0.09, strandW * 2.2, 0, uH * 0.5 - (ky + 0.5) * TILE_SIZE, 0, ropeMat);
            }
            if (!map.isRope(tx, ty - 1)) {
              part(group, 0.4, 0.14, 0.4, 0, uH * 0.5 + 0.05, 0, ropeDark);
            }
            group.position.set(cx, -(ty * 16) * P2U - uH * 0.5, 0.25);
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
    mesh.position.y = -0.34;   // the hand, at arm's end
    /* Hold it like a tool, not a plank glued to the forearm: blades rise over
       the shoulder with a slight forward cant, and the broad face yaws back
       toward the camera. Bow/staff stay near-vertical in the fist. */
    const release = base && base.holdMode === 'release';
    mesh.rotation.set(release ? 0.2 : 0.35, release ? 0 : -0.55, release ? 0 : -0.18);
    if (offhand) mesh.rotation.y = 0.55;    // mirrored cant for the other fist
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
      actorGroup.add(heroModel.root);
      heroWeaponRef = null;
      heroWeaponMesh = null;
    } else if (key !== heroArmorKey) {
      heroArmorKey = key;
      const wpn = heroWeaponMesh;
      actorGroup.remove(heroModel.root);
      disposeModel(heroModel);
      heroModel = DS.Voxel.build('hero', { armor: p.inv.armor });
      actorGroup.add(heroModel.root);
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
        if (auraEl && DS.Weapons.ELEMENTS[auraEl]) {
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
      actorGroup.add(model.root);
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

    const E = base.element ? DS.Weapons.ELEMENTS[base.element] : null;
    const tint = new THREE.Color(full ? '#fff0a8' : (E ? E.color : '#a8e4ff'));
    aura.mat.color.copy(tint);
    for (let i = 0; i < aura.motes.length; i++) aura.motes[i].material.color.copy(tint);

    aura.group.visible = true;
    const pulse = full ? 1 + Math.sin(time * 9) * 0.12 : 1;
    aura.core.scale.setScalar((0.35 + ratio * 0.75) * pulse);
    aura.mat.opacity = 0.1 + ratio * 0.35 + (full ? 0.12 : 0);

    for (let i = 0; i < aura.motes.length; i++) {
      const a = time * (2.2 + ratio * 3) + (i / aura.motes.length) * Math.PI * 2;
      const r = 0.34 + ratio * 0.3;
      aura.motes[i].position.set(Math.cos(a) * r, 0.55 + Math.sin(a * 1.7) * 0.16, Math.sin(a) * r * 0.5);
      aura.motes[i].material.opacity = 0.25 + ratio * 0.6;
    }
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
    const walkSign = (p.facing || 1) < 0 ? -1 : 1;
    let targetRy = moving ? WALK_YAW * walkSign : IDLE_YAW;
    // The mirror itself. Nothing else writes root.scale on the hero, so a
    // straight assignment per frame is safe (the enemy path has to multiply,
    // because it still sets its own scalar for rank size).
    m.root.scale.x = p.facing < 0 ? -1 : 1;

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

    // Attack: arm sweeps through the 2D game's pose curve.
    if (p.swingTimer > 0 && p.pending) {
      const item = DS.Inv.weapon(p.inv);
      const base = item ? DS.Weapons.WEAPONS[item.type] : null;
      const t = 1 - (p.swingTimer / Math.max(1, p.swingMax));
      const heavy = p.attackHeavy;
      const arc = base && (base.key === 'sword' || base.key === 'greataxe');
      if (arc) {
        m.armR.rotation.x = M.lerp(-2.3, 1.4, heavy ? t * t : t);
        m.torso.rotation.y = M.lerp(0.5, -0.4, t);
      } else if (base && (base.key === 'dagger' || base.key === 'spear')) {
        const out = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        m.armR.rotation.x = -1.5;
        m.armR.rotation.z = M.lerp(0.4, -0.4, out);
      } else {
        m.armR.rotation.x = M.lerp(-2.6, -0.7, Math.sin(t * Math.PI));
      }
    } else if (p.aim) {
      /* Ranged aiming: the shooting arm follows the cursor's pitch, the other
         steadies the weapon, and the shoulders open toward the target. The
         pitch is smoothed so a jittery cursor does not vibrate the model. */
      const pitch = M.clamp(-p.aim.y, -1, 1);        // screen-down is +y
      m.aimPitch = M.approach(m.aimPitch || 0, pitch, 0.18);
      const ap = m.aimPitch;
      const charging2 = p.charging
        ? M.clamp(p.holdFrames / 30, 0, 1) : 0;
      m.armR.rotation.x = -1.4 + ap * 1.05 + charging2 * 0.25;
      m.armL.rotation.x = -1.3 + ap * 0.85 - charging2 * 0.2;
      m.torso.rotation.y = M.lerp(m.torso.rotation.y, 0.26, 0.22);
    } else if (p.charging) {
      const item2 = DS.Inv.weapon(p.inv);
      const base2 = item2 ? DS.Weapons.WEAPONS[item2.type] : null;
      const ratio = M.clamp(p.holdFrames / ((base2 && base2.chargeMax) || 30), 0, 1);
      m.armR.rotation.x = M.lerp(-0.6, 0.9, ratio);
      m.torso.rotation.y = M.lerp(0, 0.45, ratio);
    } else if (!p.onRope && !airborne) {
      m.torso.rotation.y *= 0.8;
    }

    // A 3D body pivots toward where it walks — no sprite-style mirror snap.
    let dRy = targetRy - m.root.rotation.y;
    while (dRy > Math.PI) dRy -= Math.PI * 2;
    while (dRy < -Math.PI) dRy += Math.PI * 2;
    m.root.rotation.y += dRy * 0.35;

    // Elemental weapon aura: motes orbit the blade while it is held.
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

    // Death: topple over.
    if (p.dead) {
      m.root.rotation.z = M.lerp(m.root.rotation.z, Math.PI / 2 * (p.facing < 0 ? -1 : 1), 0.12);
    } else m.root.rotation.z = 0;
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
    if (e.hurtFlash > 0) {
      model.root.rotation.z = Math.sin(time * 44) * 0.09;
    } else model.root.rotation.z = 0;

    // Tier crown: elites get a faint ember, minibosses a red glow child.
    // (The 2D overlay still draws the HP bar; here only presence matters.)
    if (e.tier === 'colossal') model.root.scale.setScalar(1.0 * (e.sizeScale || 3) * 0.95);
    else model.root.scale.setScalar(actorScale(e));

    /* Mirror after the scale is set, because setScalar would undo it. */
    if (e.facing < 0) model.root.scale.x *= -1;

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
    for (let i = 0; i < count; i++) {
      const p = g.projectiles[i];
      const pm = ensureProjMesh(p, i);
      pm.mesh.visible = true;
      pm.mesh.position.set((p.x + p.w * 0.5) * P2U, -(p.y + p.h * 0.5) * P2U, 0.35);
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
      glowMat(rec.core, 0.30)
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
          new THREE.MeshLambertMaterial({ color: col }));
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
    const rig = { group: group, parts: parts, element: el, rec: rec, glow: 0, fade: 1, key: null };

    fxGroup.add(group);
    return rig;
  }

  function acquireRig(el) {
    const pool = elemPool[el] || (elemPool[el] = []);
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].key === null) {
        pool[i].group.visible = true;
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
        mesh.material.opacity = 0.30 * fade;
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
    rig.glow = rec && rec.light
      ? (0.35 + 0.2 * (Math.sin(t * 3 + rig.parts[0].phase) * 0.5 + 0.5)) * fade
      : 0;
  }

  function animateLiveRigs(t) {
    for (let i = 0; i < liveRigs.length; i++) animateRig(liveRigs[i], t);
  }

  // Ground field: the burning patch / poison cloud the player stood in.
  function syncElemFields(g, time) {
    if (!g.fields) g.fields = [];
    const fields = g.fields;

    // Retire rigs whose field is gone (fields are compacted, so match by index
    // through the record we stored on the field itself).
    for (let i = 0; i < elemFields.length; i++) {
      const entry = elemFields[i];
      if (entry && entry.field && fields.indexOf(entry.field) < 0) {
        releaseRig(entry.rig);
        elemFields[i] = null;
      }
    }

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
        l.userData.rig = rig;
        l.position.set(rig.group.position.x, rig.group.position.y + 0.6, 0.3);
        l.color.setHex(rig.rec.light);
        l.intensity = rig.glow;
      } else {
        l.userData.rig = null;
      }
    }
  }

  /* Skill FX on the floor, in 3D: a short-lived ring of glowing voxel shards
     that scatter along the ground from an elemental hit. Called automatically
     from the FX.element hook so every 2D emitter also dirties the 3D floor. */
  function spawnGroundBurst(element, px, py, power) {
    if (!fxGroup || !DS.Voxel) return;
    const elCol = DS.Voxel.elementColorHex(element) || 0xffffff;
    const group = new THREE.Group();
    const n = Math.min(14, 7 + Math.round((power || 1) * 3));
    for (let i = 0; i < n; i++) {
      const s = 0.09 + Math.random() * 0.1;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s * 0.55, s),
        new THREE.MeshBasicMaterial({ color: elCol, transparent: true,
          opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = 0.3 + Math.random() * 0.9 * (power || 1);
      m.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d * 0.45);
      m.userData.vx = Math.cos(a) * (0.014 + Math.random() * 0.024);
      m.userData.vz = Math.sin(a) * (0.007 + Math.random() * 0.012);
      m.userData.vy = 0.025 + Math.random() * 0.06;
      group.add(m);
    }
    group.position.set(px * P2U, -py * P2U, 0.1);
    fxGroup.add(group);
    groundBursts.push({ group: group, life: 26, maxLife: 26 });
  }

  function updateGroundBursts() {
    for (let i = groundBursts.length - 1; i >= 0; i--) {
      const gb = groundBursts[i];
      gb.life--;
      const t = gb.life / gb.maxLife;
      gb.group.children.forEach(function (m) {
        m.position.x += m.userData.vx;
        m.position.z += m.userData.vz;
        m.userData.vy -= 0.004;              // gravity back to the floor
        m.position.y += m.userData.vy;
        if (m.position.y < 0.03) { m.position.y = 0.03; m.userData.vy = 0; }
        m.material.opacity = 0.95 * t;
      });
      if (gb.life <= 0) {
        if (gb.group.parent) gb.group.parent.remove(gb.group);
        gb.group.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        groundBursts.splice(i, 1);
      }
    }
  }

  /* Smoke, in 3D: a puff of drifts that rises and slows. Emitted by the charge
     wind-up (FX.smoke) so holding an attack leaves a real wake in the world
     instead of only 2D dots on top of it. Pooled boxes, no allocation per hit. */
  let smokePuffs = [];
  const MAX_SMOKE = 90;

  function spawnSmokePuff(px, py, vx, vy, opts) {
    if (!fxGroup || smokePuffs.length >= MAX_SMOKE) return;
    opts = opts || {};
    const s = (opts.size || 2) * 0.055;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(opts.color || '#9b96b8'),
        transparent: true, opacity: 0.5, depthWrite: false
      })
    );
    mesh.position.set(px * P2U, -py * P2U, 0.28);
    fxGroup.add(mesh);
    smokePuffs.push({
      mesh: mesh,
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
      p.mesh.scale.setScalar(1 + (1 - t) * p.grow);
      p.mesh.material.opacity = 0.5 * t * t;
      if (p.life <= 0) {
        if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        smokePuffs.splice(i, 1);
      }
    }
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
     on an actual hit so the blow reads in 3D the way the 2D trail did. */
  function spawnSwingArc(x, y, dir, heavy) {
    const col = heavy ? 0xfff0a8 : 0xe8e8f4;
    const group = new THREE.Group();
    const R = heavy ? 2.3 : 1.7;
    const count = heavy ? 6 : 5;
    for (let i = 0; i < count; i++) {
      const a = (-0.95 + (i / (count - 1)) * 1.9) * dir;
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, heavy ? 0.17 : 0.11, 0.03),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      seg.position.set(Math.sin(a) * R, Math.cos(a) * R * 0.6, 0);
      seg.rotation.z = -a;
      group.add(seg);
    }
    group.position.set(x * P2U, -y * P2U, 0.4);
    fxGroup.add(group);
    swingFx.push({ group: group, life: 10, maxLife: 10 });
  }

  function updateSwingFx() {
    for (let i = swingFx.length - 1; i >= 0; i--) {
      const s = swingFx[i];
      s.life--;
      const t = Math.max(0, s.life / s.maxLife);
      s.group.traverse(function (o) {
        if (o.material) o.material.opacity = 0.85 * t;
        if (o.geometry && s.life <= 0) o.geometry.dispose();
      });
      s.group.scale.setScalar(1 + (1 - t) * 0.45);
      if (s.life <= 0) { fxGroup.remove(s.group); swingFx.splice(i, 1); }
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
      const mesh = DS.Voxel.buildPickup(pk.kind,
        pk.kind === 'item' ? DS.Weapons.rarityColor(pk.item.rarity) : null);
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
      bm.flame.visible = bm.smooth > 0.05;
      bm.flame.scale.set(0.85 + bm.smooth * 0.25, 1.05 + bm.smooth * 0.5, 1);
      bm.light.intensity = bm.smooth * TORCH_I;
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

  /* Scratch for the nearest-flame selection: fixed size, no allocation per
     frame, because this runs on every frame of every level. */
  const flameBestD2 = [];
  const flameBestX = [];
  const flameBestY = [];
  const flameBestI = [];

  /* Point the fixed pool at the nearest flames. Pure SELECTION: nothing is
     created, added or removed, so the light count the shaders were compiled
     for is the same on a floor with one torch and a floor with twenty, and a
     fire skill landing mid-fight cannot push the scene over the driver's
     uniform budget (which is what turned the screen black). */
  function assignFlameLights(camX, camY) {
    const n = flamePool.length;
    if (!n) return;
    for (let k = 0; k < n; k++) flameBestD2[k] = Infinity;

    /* Two emitter lists, one rule: the closest lit ones win. A brazier's
       brightness is its own smooth ramp times the torch intensity. */
    for (let pass = 0; pass < 2; pass++) {
      const list = pass ? brazierMeshes : torchLights;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        const gp = e.group && e.group.position;
        if (!gp) continue;
        const lit = pass ? e.smooth * TORCH_I : e.smooth;
        if (lit <= 0.02) continue;
        const dx = gp.x - camX;
        const dy = gp.y + (e.lift || 1.6) - camY;
        const d2 = dx * dx + dy * dy;
        let worst = 0;
        for (let k = 1; k < n; k++) if (flameBestD2[k] > flameBestD2[worst]) worst = k;
        if (d2 < flameBestD2[worst]) {
          flameBestD2[worst] = d2;
          flameBestX[worst] = gp.x;
          flameBestY[worst] = gp.y + (e.lift || 1.6);
          flameBestI[worst] = lit;
        }
      }
    }

    for (let k = 0; k < n; k++) {
      const l = flamePool[k];
      if (flameBestD2[k] === Infinity) {
        l.intensity = 0;
        l.position.set(0, -999, 0.3);
        continue;
      }
      l.position.set(flameBestX[k], flameBestY[k], 0.3);
      l.intensity = flameBestI[k];
    }
  }

  function render(g) {
    if (!enabled || !renderer || !camera || !g) return;

    /* Lay the frame out before anything is drawn: wipe the whole window in the
       theme's own background colour (the letterbox bars are this colour, not
       yesterday's pixels), then clip the world pass to the 16:9 play frame. */
    const el = renderer.domElement;
    const pv = playViewport();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, el.width, el.height);
    renderer.setScissor(0, 0, el.width, el.height);
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

      // Spawn models for any new enemy; retire models whose entity is gone.
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        if (e.dead) continue;
        const model = ensureEnemyModel(g, e);
        if (model) poseEnemy(e, model, time, g.map);
      }
      enemyModels.forEach(function (model, e) {
        if (e.dead || g.enemies.indexOf(e) < 0) {
          disposeModel(model);
          enemyModels.delete(e);
        }
      });

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
    }

    /* The rig: orbit the eye around the camera target by (yaw, pitch) at the
       preset's distance, and always aim back at the target. With yaw at 0 and
       pitch at 7 degrees this is exactly the shot the game shipped before. */
    const cp = Math.cos(camRig.pitch);
    camera.position.set(camX + Math.sin(camRig.yaw) * camRig.dist * cp,
                        camY + Math.sin(camRig.pitch) * camRig.dist,
                        Math.cos(camRig.yaw) * camRig.dist * cp);
    camera.lookAt(camX, camY, 0);
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
    if (ambientLight) ambientLight.intensity = AMBIENT_I * fill;
    if (hemiLight) hemiLight.intensity = HEMI_I * sky;
    if (dirLight) dirLight.intensity = t.dirI * KEY_GAIN * (1 - 0.50 * mood);
    if (backLight) {
      /* The moon behind the room. This is the light the user asked to come
         from the BACKGROUND, so it does not dim with depth -- it grows. */
      backLight.intensity = 0.55 + 0.35 * mood;
      backLight.color.setHex(t.hemiSky);
    }

    /* The sky rides the eye line (see the sky rig in buildBackdrop). */
    if (skyRig) skyRig.position.y = camera.position.y;
    /* The backdrop ladder is built along -Z, so a turned camera would look past
       its edge. Turning the theme group with the rig keeps the horizon framed:
       the bands are rigid, the eye orbits them. */
    if (themeGroup) themeGroup.rotation.y = camRig.yaw * 0.85;

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
    for (let i = 0; i < torchLights.length; i++) {
      const tl = torchLights[i];
      const fo = tl.flickerOffset;
      const rawTarget = (tl.baseIntensity * lamp)
        + Math.sin(time * 0.71 + fo)         * 0.03
        + Math.sin(time * 1.37 + fo * 0.61) * 0.02
        + Math.sin(time * 2.83 + fo * 1.19) * 0.01;
      tl.smooth = tl.smooth + (rawTarget - tl.smooth) * 0.14;
    }
    assignFlameLights(camX, camY);

    for (let i = 0; i < flameSprites.length; i++) {
      const fs = flameSprites[i];
      const s = 1 + Math.sin(time * 4.0 + fs.seed) * 0.15;
      fs.sprite.scale.set(1.1 * s, 1.4 * (2 - s), 1.1);
    }

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
        if (hm) hazardMeshes.push(hm);
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
    /* The horizon keeps its own clock: drifting air, breathing bands and the
       silhouettes crossing the sky (see updateBackdropLife). */
    updateBackdropLife(time, 0.016);

    /* No parallax scroll to drive any more: the backdrop bands are solid
       geometry at fixed depth, so the camera's own pan produces the parallax. */

    let sIdx = 0;
    if (g.player) {
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

    for (let i = 0; i < g.enemies.length; i++) {
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

    renderer.render(scene, camera);
    /* Hand the full canvas back for the screen layer and its overlay. */
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, el.width, el.height);
  }

  DS.R3D = {
    init: init,
    resize: resize,
    /* Camera rig: presets + the live readout the HUD shows. */
    get rig() { return camRig; },
    presets: CAM_PRESETS,
    setPreset: applyCameraPreset,
    loadLevel: loadLevel,
    render: render,
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
    get scene() { return scene; }
  };
})(window.DS);
