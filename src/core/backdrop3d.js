/* The horizon, in one file.

   This used to live inside core/renderer3d.js, which is the file that owns the
   dungeon, the actors, the effects and the camera. Nothing about a horizon needs
   that file: a backdrop is built ONCE per floor out of a recipe and then only
   animated. Keeping it there meant every change to a sky risked the renderer,
   and it meant the one question that matters -- "does every theme show a light,
   a landmark and a texture?" -- could not be asked without booting the game.

   So the backdrop is a module with a narrow door:

     build(env, themeName, w, h, anchorY)  ->  { group, skyRig, hero, report }
     update(time, dt)                      // air, sway, flight, the body's pulse
     recipe(name) / hero(name) / curve(name) / rungs()
     heroLight(name, yaw)                  // where the far light comes FROM

   `report` is the introspection half: the resolved hero position, every layer's
   final colour, its texel repeat and its instance count. The QA pass reads that
   instead of guessing, which is what makes the checks in tools/qa/audit-backdrop
   possible at all.

   --- what changed in v5.2.2 ---

   1. HERO. Three of thirteen themes had a celestial body -- a flat unlit circle
      with no halo -- and ten had none at all. Every theme now owns one: a sun on
      the shore, a moon over the climb, an arcane sigil in the vault, a lava dome
      in the ash, and for the themes under a stone roof a glow that fits UNDER
      that roof. Each is a voxel-stepped disc (a canvas disc, NearestFilter, two
      tones) with two halos, a fan of rays, and a wide glow wall behind it, so
      the sky itself brightens around the body.

   2. NO NEW LAMP. The obvious way to make a horizon glow is to add a light. That
      is exactly the bug that blacked the screen in v5.2.1: three.js bakes the
      light count into every material's shader, so a new light recompiles the
      world and a failed link draws black. The hero is MeshBasicMaterial geometry
      (unlit, `fog:false`, additive) plus the ONE back light the rig already had,
      steered toward the body and tinted by it. heroLight() is that steering, and
      the QA asserts the scene's light count never moves.

   3. SEVEN RUNGS, to 68 units. The old ladder stopped at 44 and read as one
      plane with paint on it. The rungs are geometric (each about 1.55x the last)
      because depth is read as a RATIO: at 68 the far ridge slides past the near
      rock at a third of its screen speed, which is the parallax that reads as
      zoom. The ground runs to 130 and the sky sits at -150.

   4. FOG COMPENSATION. A band at 68 units sits in 43% fog, so without help every
      far rung collapses into the fog colour and the seven-rung ladder renders as
      one flat wash -- the classic way a layered backdrop stops looking layered.
      unfog() divides the fog back out of the authored colour, with a ceiling, so
      what reaches the eye is the value the recipe asked for.

   5. TEXTURE. Every rung out to 19 units and every ground slab carries a 32x32
      NearestFilter texture, and the repeat is solved from the rung's own scale
      factor so texel density is constant: the far bands do not come out as one
      stretched smear of the near band's rock.

   6. LANDMARK. One large voxel object per theme, placed once per floor (a
      `solo` layer), at 30 units: a wrecked hull on the shore, a buried colossus
      in the cave, a broken gatehouse in the torch hall, a drowned temple, a
      caldera, an empty throne. A horizon of repeated trees and rocks is a
      pattern; a horizon with one thing you can name is a place.
*/
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;

  /* --- the depth ladder -----------------------------------------------------

     Every rung is authored at ONE size (the same shapes, the same heights) and
     the builder scales a band by (CAM_DIST + d) / (CAM_DIST + REF_D), so moving
     a band further out grows it in world units while it keeps its size on
     screen. Screen size is therefore authored, and only the PARALLAX changes
     when a rung moves -- which is the knob this file exists to turn. */
  const RUNGS = [4.5, 7.5, 12, 19, 30, 46, 68];
  const REF_D = RUNGS[0];
  const GROUND_D = 130;       // how far the flat ground runs before the sky
  const SKY_Z = -150;         // the sky plane, behind the far ground edge
  const SKY_H = 240;          // sky plane height, in world units
  const SKY_DROP = 30;        // sky extends this far below the eye line
  const CAM_DIST = 26;        // mirrors the renderer's camRig.dist: the scale maths
  const CLOUD_DRIFT = 0.55;
  const TEX_AT = 19;          // rungs at or nearer than this carry a texture
  const ROOM_HERO_D = -30;    // where a body hangs in a ROOFED room (see build)
  const DEFAULT_GAIN = 0.30;  // sky value for a theme without a curve row
  const DEFAULT_FOG = 0.008;  // the renderer's FogExp2 density, for unfog()
  const FOG_LIFT_MAX = 5.0;   // how far a colour may be lifted against the fog

  /* --- the light curve ------------------------------------------------------

     One number used to scale every sky: SKY_GAIN 0.28, night, for all thirteen
     themes. That is why no floor looked like its own place -- a beach at dawn
     and a caldera were mixed to the same value.

     The run now has a light curve. It opens bright on the shore, closes down as
     the cave mouth swallows the sky, and each dark rung carries its OWN light
     (a furnace, a sigil, a drowned sun). The climb reopens it widest of all, the
     sunk halls close to almost nothing, and the last two rungs are lit from
     below and from gold: the run ends brighter than the cave it went through. */
  const CURVE = {
    shore:    { gain: 0.56, warm: 0.34 },
    cave:     { gain: 0.30, warm: 0.22 },
    prison:   { gain: 0.26, warm: 0.20 },
    vault:    { gain: 0.30, warm: 0.22 },
    swamp:    { gain: 0.38, warm: 0.24 },
    mountain: { gain: 0.62, warm: 0.18 },
    flooded:  { gain: 0.24, warm: 0.20 },
    volcanic: { gain: 0.34, warm: 0.30 },
    throne:   { gain: 0.48, warm: 0.30 },
    /* The four themes a run cannot reach (they are flavour fallbacks in
       renderer3d's resolveTheme). Kept, because an unreachable theme with no
       sky in it would still be a theme with no sky in it. */
    forest:   { gain: 0.30, warm: 0.18 },
    caves:    { gain: 0.26, warm: 0.22 },
    nest:     { gain: 0.30, warm: 0.24 },
    trial:    { gain: 0.32, warm: 0.26 }
  };

  /* --- the body each theme hangs its light on ---------------------------------

     A hero is: a DISC (voxel-stepped, always visible), up to three HALOS, a fan
     of RAYS or a set of SHAFTS down from a roof, an optional RING, and a GLOW
     WALL that floods the sky behind it.

     `az`   where it hangs across the floor's width (0..1)
     `elev` world units above the eye line, in the sky rig's own frame
     `r`    the disc's radius, in world units at the sky's distance
     `glow` the glow wall's alpha -- how much sky the body owns
     `gain` how far the back light leans toward this body (0 = ignore it)

     An underground theme's body is placed low, and fitRoomHero() sizes it: a
     light under a stone roof has to fit under the roof AND above the floor, or
     it is either an invisible lamp or a disc buried in the ground. So a room's
     `r` is a WISH -- it is authored at the largest disc the roof allows, and the
     fit trims it to the room it is actually in. Ten of these thirteen themes
     have a roof over them; every one of them is authored at r >= 4.0, and the
     fit is what decides whether it survives.

     WHERE, on the other hand, is exact and not a wish. A themed body hangs
     across the FLOOR's own width, so it is placed on the level's mid-line the
     same way the ladder, the ground, the shafts and the ceiling slab are -- see
     the room rig in build(). That was the last of this file's placement bugs and
     the largest: see build() for what it measured. */
  const HEROES = {
    /* The shore opens the run: a low dawn sun, the widest halo in the game. */
    shore:    { kind: 'sun', col: 0xffd9a0, core: 0xfff6e0, edge: 0xef8f2c,
                az: 0.36, elev: 19, r: 12, halos: [1.45, 2.35], rays: 16,
                glow: 0.32, gain: 1.00 },
    /* Under the cave's roof: the mouth's dawn coming through a hole, plus the
       wet-rock bloom the crystals throw. */
    cave:     { kind: 'shaft', col: 0x6ee7d0, core: 0xd8fff6, edge: 0xffd9a0,
                az: 0.42, elev: 5.9, r: 4.3, halos: [1.7, 3.0], shafts: 3,
                glow: 0.26, gain: 0.75 },
    /* The torch hall: a forge glow at the far end of the colonnade, low and hot. */
    prison:   { kind: 'furnace', col: 0xfb923c, core: 0xffe0b0, edge: 0xc24a10,
                az: 0.32, elev: 5.2, r: 4.1, halos: [1.6, 2.8], rays: 10,
                glow: 0.30, gain: 0.90 },
    /* The waystation: an arcane sigil, deliberately off-centre and small. */
    vault:    { kind: 'sigil', col: 0x8a66e0, core: 0xe8dcff, edge: 0x4b2f9a,
                az: 0.54, elev: 5.9, r: 4.3, halos: [1.6, 2.8], ring: true,
                glow: 0.24, gain: 0.85 },
    /* The swamp: a sun that never finished setting, half of it behind the ridge. */
    swamp:    { kind: 'drowned', col: 0xb8e06a, core: 0xf2ffcf, edge: 0x5d7a2c,
                az: 0.44, elev: 9, r: 8, halos: [1.6, 2.8], rays: 12,
                glow: 0.30, gain: 0.86 },
    /* The climb: the run's second open sky, and the brightest thing in it. */
    mountain: { kind: 'moon', col: 0xdceaff, core: 0xffffff, edge: 0x8fa8d0,
                az: 0.30, elev: 26, r: 11, halos: [1.5, 2.5], aurora: true,
                glow: 0.30, gain: 1.00 },
    /* The sunk halls: light coming DOWN through the surface, four shafts of it. */
    flooded:  { kind: 'shaft', col: 0x8fd8ff, core: 0xe8fbff, edge: 0x2f7ea0,
                az: 0.48, elev: 5.9, r: 4.3, halos: [1.6, 2.8], shafts: 4,
                glow: 0.28, gain: 0.80 },
    /* The ash reaches: the light is below the horizon, not above it. */
    volcanic: { kind: 'dome', col: 0xff7a3c, core: 0xffd9a0, edge: 0xa02408,
                az: 0.50, elev: 4.4, r: 4.0, halos: [1.5, 2.6], plume: true,
                glow: 0.34, gain: 0.95 },
    /* The throne: gold, and the largest ring in the game before the King. */
    throne:   { kind: 'crown', col: 0xfde047, core: 0xfff8d0, edge: 0xc08a10,
                az: 0.44, elev: 5.3, r: 4.3, halos: [1.5, 2.6], rays: 18, ring: true,
                glow: 0.32, gain: 1.00 },

    forest:   { kind: 'moon', col: 0xfff0cc, core: 0xffffff, edge: 0xb8a878,
                az: 0.34, elev: 22, r: 9, halos: [1.5, 2.5], rays: 10,
                glow: 0.26, gain: 0.85 },
    caves:    { kind: 'sigil', col: 0x5eead4, core: 0xd8fff6, edge: 0x1f7a6a,
                az: 0.46, elev: 5.9, r: 4.3, halos: [1.7, 3.0], ring: true,
                glow: 0.24, gain: 0.80 },
    /* Both of these live under a ten-unit roof, so their bodies hang low: a
       blood moon rising out of the nest's floor, an eclipse low behind the
       obelisk. Same rule as the reachable underground rungs -- a light under a
       stone roof has to fit under the roof. */
    nest:     { kind: 'moon', col: 0xf43f5e, core: 0xffd0d8, edge: 0x7a1024,
                az: 0.40, elev: 5.2, r: 4.1, halos: [1.6, 2.8], rays: 8,
                glow: 0.28, gain: 0.88 },
    trial:    { kind: 'eclipse', col: 0xff8a6a, core: 0x2a0d12, edge: 0xffb08a,
                az: 0.48, elev: 5.2, r: 4.1, halos: [1.5, 2.6], ring: true,
                glow: 0.30, gain: 0.92 }
  };

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

  /* --- texture -----------------------------------------------------------------

     One 32x32 canvas per family, NearestFilter, drawn with 2-pixel tools so it
     belongs to the same pixel grid the rest of the game does. The three colours
     are the family's base, its shadow and its lit edge; the motif is which
     pattern of those three to lay down. A one-pixel lit edge along the top of
     every tile is what keeps a texture readable in a dark theme: it gives the
     rock a lit lip without lifting the rock's value. */
  const TEX_FAMILIES = {
    sand:    { base: 0x6d6350, dark: 0x4a4234, light: 0x8f8368, motif: 'speck' },
    wetrock: { base: 0x2f4744, dark: 0x1b2c2a, light: 0x476a64, motif: 'speck' },
    brick:   { base: 0x4a3520, dark: 0x2a1d10, light: 0x664a2c, motif: 'brick' },
    blood:   { base: 0x4a2020, dark: 0x2a0e10, light: 0x6d2b26, motif: 'brick' },
    marble:  { base: 0x3b3059, dark: 0x221b39, light: 0x5a4b84, motif: 'veins' },
    moss:    { base: 0x2b3a1e, dark: 0x16200e, light: 0x43582a, motif: 'strata' },
    granite: { base: 0x424a58, dark: 0x282e37, light: 0x606b7c, motif: 'speck' },
    ceramic: { base: 0x1d3a44, dark: 0x0f262e, light: 0x2e5763, motif: 'brick' },
    basalt:  { base: 0x2a1a14, dark: 0x140b07, light: 0x40261a, motif: 'cracks' },
    gild:    { base: 0x5a4416, dark: 0x35250b, light: 0x8e6f24, motif: 'veins' },
    bark:    { base: 0x33291c, dark: 0x1b150e, light: 0x4a3b2b, motif: 'strata' },
    bone:    { base: 0x54494a, dark: 0x312a2b, light: 0x716365, motif: 'speck' }
  };

  const texCache = {};

  function cssOf(hex) {
    return '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
  }

  /* Draw one tile of a family. Deterministic: the same family is the same
     pixels on every floor, so a texture never becomes a moving part. */
  function makeBandTexture(family) {
    const f = TEX_FAMILIES[family] || TEX_FAMILIES.granite;
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');
    const rng = DS.makeRng(0xB4D7E + family.length * 7919);
    const base = cssOf(f.base), dark = cssOf(f.dark), light = cssOf(f.light);

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 32, 32);

    if (f.motif === 'brick') {
      /* A running bond of 8x4 blocks with a dark joint, and every other row
         offset by half a block: the one pattern the eye reads as MASONRY at a
         glance, which is what a prison wall and a flooded hall are made of. */
      ctx.fillStyle = dark;
      for (let y = 0; y < 32; y += 8) ctx.fillRect(0, y, 32, 1);
      for (let y = 0; y < 32; y += 8) {
        const off = (y / 8) % 2 ? 8 : 0;
        for (let x = off; x < 32 + off; x += 16) ctx.fillRect(x & 31, y, 1, 8);
      }
      ctx.fillStyle = light;
      for (let y = 0; y < 32; y += 8) {
        const off = (y / 8) % 2 ? 8 : 0;
        for (let x = off; x < 32 + off; x += 16) ctx.fillRect(x & 31, y + 1, 15, 1);
      }
    } else if (f.motif === 'strata') {
      /* Horizontal bands of varying thickness: moss on stone, bark on a trunk. */
      let y = 0;
      while (y < 32) {
        const h = 2 + Math.floor(rng.float(0, 3)) * 2;
        ctx.fillStyle = rng.chance(0.5) ? dark : base;
        ctx.fillRect(0, y, 32, Math.min(h, 32 - y));
        if (rng.chance(0.45)) {
          ctx.fillStyle = light;
          ctx.fillRect(0, y, 32, 1);
        }
        y += h;
      }
    } else if (f.motif === 'veins') {
      /* Diagonal seams: marble, gilded stone. */
      ctx.strokeStyle = light;
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const x0 = rng.float(0, 32);
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0 - 10, 32);
        ctx.stroke();
      }
      ctx.fillStyle = dark;
      for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rng.float(0, 30)), Math.floor(rng.float(0, 30)), 2, 2);
    } else if (f.motif === 'cracks') {
      /* Open seams with an ember-lit floor: basalt over lava. */
      ctx.fillStyle = dark;
      for (let i = 0; i < 4; i++) {
        let x = Math.floor(rng.float(0, 32));
        for (let y = 0; y < 32; y += 4) {
          ctx.fillRect(x & 31, y, 2, 4);
          x += rng.chance(0.5) ? 2 : -2;
        }
      }
      ctx.fillStyle = light;
      for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(rng.float(0, 30)), Math.floor(rng.float(0, 30)), 2, 2);
    } else {
      /* speck: grit. Sand, granite, bone, wet rock. */
      ctx.fillStyle = dark;
      for (let i = 0; i < 14; i++) ctx.fillRect(Math.floor(rng.float(0, 30)), Math.floor(rng.float(0, 30)), 2, 2);
      ctx.fillStyle = light;
      for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rng.float(0, 30)), Math.floor(rng.float(0, 30)), 2, 2);
    }

    /* The lit lip. Every tile gets a brighter top row, because a rock lit from
       above is a rock whose top edge is the brightest thing on it -- and at two
       pixels tall it survives the downscale the far rungs go through. */
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, 32, 1);

    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function bandTexture(family) {
    const key = family || 'granite';
    if (!texCache[key]) texCache[key] = makeBandTexture(key);
    return texCache[key];
  }
  /* --- the vocabulary a recipe is written in ---------------------------------

     Each builder is handed the layer's box list, an x along the map's width, a
     seeded rng and its own layer entry, and writes y from the GROUND LINE UP --
     the band's own base is zero, not the map's bottom row -- which is what lets
     one builder scale a whole band up for the far rungs without the base sliding
     off. Everything it emits is a BOX, a CONE (a stalactite) or an OCTAHEDRON (a
     crystal), so a whole band collapses into one or two InstancedMeshes. */
  function box(list, x, y, z, sx, sy, sz, rz, ry) {
    list.push([x, y, z, sx, sy, sz, rz || 0, ry || 0]);
  }

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
      const y = rng.float(L.y0 || 6.5, L.y1 || 9.5);
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
    },

    /* --- landmarks ----------------------------------------------------------

       One per floor, placed by a `solo` layer, at 30 units. These are the only
       shapes in the file that are allowed to be COMPOSED -- eight to twenty
       boxes arranged into something the player can name -- and they exist
       because a horizon of repeated trees, rocks and columns is a texture, not
       a place. The eye needs one object in the middle distance it can point at.

       Every landmark's base is its own ground line and it grows upward, exactly
       like a band, so the far rungs scale it without lifting it off the floor. */

    /* A wrecked hull, listed over: keel, four ribs, a broken mast. */
    wreck: function (o, x, rng, L) {
      const len = rng.float(9, 13);
      const lean = rng.float(0.20, 0.42) * (rng.chance(0.5) ? 1 : -1);
      box(o.boxes, x, 1.4, 0, len, 1.3, 3.2, lean * 0.35, 0);
      for (let i = 0; i < 4; i++) {
        const rx = x - len * 0.36 + len * 0.24 * i;
        const h = rng.float(2.4, 4.6) * (1 - Math.abs(i - 1.5) * 0.16);
        box(o.boxes, rx, 1.1 + h * 0.5, 0.3, 0.7, h, 2.4, lean, rng.float(-0.2, 0.2));
      }
      box(o.boxes, x + len * 0.34, 3.2, 0, len * 0.42, 0.9, 0.6, lean * 0.6, 0);
      box(o.boxes, x - len * 0.16, 7.8, 0, 0.55, 6.4, 0.55, lean * 1.5, 0);
      box(o.boxes, x - len * 0.16 - 2.4, 9.6, 0, 5.0, 0.24, 0.24, lean * 1.5 - 0.45, 0);
    },
    /* A colossal head half buried in the cave floor, and what is left of it. */
    colossus: function (o, x, rng, L) {
      box(o.boxes, x, 3.4, 0, 6.4, 6.8, 6.0, 0, rng.float(-0.16, 0.16));
      box(o.boxes, x, 7.6, 0, 7.2, 1.6, 6.6, 0, 0);
      box(o.boxes, x - 1.9, 4.0, 3.4, 1.5, 1.1, 0.5, 0, 0);
      box(o.boxes, x + 1.9, 4.0, 3.4, 1.5, 1.1, 0.5, 0, 0);
      box(o.boxes, x, 2.2, 3.5, 2.6, 0.5, 0.4, 0, 0);
      box(o.boxes, x + 5.4, 2.6, -1.2, 1.9, 5.2, 1.9, rng.float(-0.2, 0.2), rng.float(-0.3, 0.3));
      box(o.boxes, x - 6.0, 2.0, -1.8, 2.1, 4.0, 2.1, rng.float(-0.3, 0.1), rng.float(-0.4, 0.2));
      box(o.boxes, x - 8.4, 0.7, -0.6, 3.4, 1.4, 2.6, rng.float(-0.2, 0.2), 0);
    },
    /* A broken gatehouse: two towers, a splintered arch and a portcullis. */
    gatehouse: function (o, x, rng, L) {
      box(o.boxes, x - 3.2, 4.6, 0, 2.4, 9.2, 3.2, rng.float(-0.03, 0.03), 0);
      box(o.boxes, x + 3.2, 4.0, 0, 2.4, 8.0, 3.2, rng.float(-0.03, 0.03), 0);
      box(o.boxes, x - 3.2, 9.6, 0, 3.0, 0.7, 3.8, 0, 0);
      box(o.boxes, x, 8.2, 0, 8.8, 1.0, 1.2, 0.05, 0);
      for (let i = 0; i < 5; i++) {
        const th = rng.float(1.6, 3.4);
        box(o.boxes, x - 3.4 + i * 1.7, 8.0 - th * 0.5, 0.5, 0.45, th, 0.45, 0, 0);
      }
      box(o.boxes, x + 1.4, 2.4, 1.4, 3.6, 4.8, 0.8, rng.float(-0.05, 0.05), 0);
    },
    /* Three slabs held up by nothing, with a rune ring around the lowest. */
    monolith: function (o, x, rng, L) {
      box(o.boxes, x, 3.2, 0, 2.6, 6.4, 1.4, rng.float(-0.05, 0.05), rng.float(-0.2, 0.2));
      box(o.boxes, x + 3.4, 5.6, -0.8, 2.2, 5.2, 1.2, -0.08, rng.float(-0.3, 0.1));
      box(o.boxes, x - 3.6, 4.4, -0.6, 2.4, 4.4, 1.2, 0.10, rng.float(-0.1, 0.3));
      const n = 10, r = 4.6;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        box(o.boxes, x + Math.cos(a) * r, 3.0 + Math.sin(a) * r * 0.62, 1.2,
            0.7, 0.7, 0.5, a, 0);
      }
      box(o.boxes, x, 0.4, 0, 8.4, 0.8, 2.6, 0, 0);
    },
    /* One enormous dead tree with roots and hanging branches. */
    deadtree: function (o, x, rng, L) {
      const h = rng.float(11, 15);
      box(o.boxes, x, h * 0.5, 0, 1.7, h, 1.7, rng.float(-0.02, 0.02), 0);
      for (let i = 0; i < 6; i++) {
        const y = h * (0.45 + i * 0.09);
        const side = rng.chance(0.5) ? 1 : -1;
        const b = rng.float(3.0, 6.2);
        box(o.boxes, x + side * (1.6 + b * 0.5), y, rng.float(-0.6, 0.6),
            b, 0.55, 0.55, side * rng.float(-0.1, 0.5), rng.float(-0.5, 0.5));
      }
      for (let i = 0; i < 4; i++) {
        box(o.boxes, x + rng.float(-3.0, 3.0), 0.5, rng.float(-0.4, 0.6),
            rng.float(2.4, 4.4), 1.0, 0.9, 0, rng.float(-0.8, 0.8));
      }
      box(o.boxes, x + 2.6, h * 0.82, 0, 6.4, 1.0, 0.4, 0.18, 0);
    },
    /* A stepped voxel peak with a snow cap, and a rope bridge to its shoulder. */
    peak: function (o, x, rng, L) {
      let w = 12.0, y = 0;
      for (let i = 0; i < 5; i++) {
        const h = rng.float(2.2, 3.4);
        box(o.boxes, x + rng.float(-0.5, 0.5), y + h * 0.5, 0, w, h, 6.0 - i * 0.6);
        y += h; w *= 0.72;
      }
      box(o.boxes, x, y + 0.6, 0, w * 1.1, 1.4, 3.4);
      box(o.boxes, x - 7.4, 6.0, 0, 4.2, 12.0, 5.0, -0.04, 0.1);
      box(o.boxes, x - 4.2, 11.9, 0, 6.8, 0.5, 1.2);
      for (let i = 0; i < 5; i++) {
        box(o.boxes, x - 2.6 - i * 0.55, 11.4 - i * 0.22, 0, 0.3, 0.9, 0.3);
      }
    },
    /* A colonnade gone under the water, with one lamp still burning in it. */
    drownedtemple: function (o, x, rng, L) {
      for (let i = 0; i < 5; i++) {
        const cx = x - 6.4 + i * 3.2;
        const h = rng.float(5.0, 7.0);
        box(o.boxes, cx, h * 0.5 + 0.6, 0, 1.0, h, 1.0, 0, 0);
        box(o.boxes, cx, 0.35, 0, 1.7, 0.7, 1.7, 0, 0);
      }
      box(o.boxes, x, 5.4, 0, 13.0, 1.2, 2.4, 0, 0);
      box(o.boxes, x, 6.6, 0, 12.0, 1.2, 1.6, 0, 0);
      box(o.boxes, x, 2.4, 0.9, 1.4, 1.4, 1.4, 0.4, 0.4);
      box(o.boxes, x + 7.4, 3.4, -0.6, 2.6, 3.0, 2.6, rng.float(-0.2, 0.1), 0.3);
    },
    /* A caldera rim with lava finding its way over it. */
    caldera: function (o, x, rng, L) {
      for (let i = 0; i < 7; i++) {
        const a = -1.15 + i * 0.38;
        const cx = x + Math.sin(a) * 8.0;
        const h = 3.4 + Math.cos(a) * 3.6;
        box(o.boxes, cx, h * 0.5, Math.cos(a) * 3.0, 2.6, h, 2.6, rng.float(-0.06, 0.06), a);
      }
      box(o.boxes, x, 3.6, 0, 5.2, 7.2, 1.4, 0, 0);
      box(o.boxes, x - 3.0, 1.4, 0.6, 1.2, 2.8, 0.5, 0.08, 0);
      box(o.boxes, x + 3.4, 1.9, 0.6, 1.0, 3.8, 0.5, -0.06, 0);
      box(o.boxes, x, 9.4, 0, 7.4, 1.2, 3.0, 0, 0);
      box(o.boxes, x, 12.0, 0, 5.0, 4.2, 2.4, 0, 0.4);
    },
    /* A huge empty throne, and two obelisks that have outlived it. */
    thronehall: function (o, x, rng, L) {
      box(o.boxes, x, 4.6, 0, 5.6, 9.2, 1.2, 0, 0);
      box(o.boxes, x, 1.6, 1.4, 6.8, 1.4, 3.2, 0, 0);
      box(o.boxes, x - 3.0, 2.6, 2.0, 0.9, 3.4, 2.4, 0, 0);
      box(o.boxes, x + 3.0, 2.6, 2.0, 0.9, 3.4, 2.4, 0, 0);
      box(o.boxes, x, 9.4, 0, 6.4, 1.2, 1.6, 0, 0);
      box(o.boxes, x, 10.6, 0, 7.4, 1.2, 2.2, 0, 0);
      box(o.boxes, x - 8.6, 5.6, -1.0, 2.2, 11.2, 2.2, rng.float(-0.02, 0.02), 0.2);
      box(o.boxes, x + 8.6, 5.6, -1.0, 2.2, 11.2, 2.2, rng.float(-0.02, 0.02), -0.2);
      box(o.boxes, x - 8.6, 11.6, -1.0, 2.6, 1.0, 2.6, 0, 0.2);
      box(o.boxes, x + 8.6, 11.6, -1.0, 2.6, 1.0, 2.6, 0, -0.2);
    },
    /* A tapering obelisk with a lit cap - the trial's own marker. */
    obelisk: function (o, x, rng, L) {
      box(o.boxes, x, 6.4, 0, 2.4, 12.8, 2.4, 0, 0.1);
      box(o.boxes, x, 14.2, 0, 1.6, 2.6, 1.6, 0, 0.1);
      box(o.boxes, x, 0.6, 0, 4.2, 1.2, 4.2, 0, 0.1);
      for (let i = 0; i < 4; i++) {
        box(o.boxes, x + rng.float(-1.4, 1.4), rng.float(2, 11), 1.4, 0.8, 1.6, 0.3, 0, 0);
      }
    },
    /* A tower of skulls and long bones, nest-style. */
    bonetower: function (o, x, rng, L) {
      let y = 0;
      for (let i = 0; i < 6; i++) {
        const w = 4.6 - i * 0.45;
        const h = rng.float(1.4, 2.0);
        box(o.boxes, x + rng.float(-0.4, 0.4), y + h * 0.5, 0, w, h, w * 0.8, rng.float(-0.06, 0.06), rng.float(-0.4, 0.4));
        y += h;
      }
      for (let i = 0; i < 6; i++) {
        box(o.boxes, x + rng.float(-3.4, 3.4), rng.float(0.2, 1.0), 0,
            rng.float(1.4, 3.0), 0.22, 0.22, rng.float(-1.1, 1.1), rng.float(0, 1.5));
      }
    }
  };

  /* --- the recipes ----------------------------------------------------------

     `sp` is SPACING, not a count: how many world units apart two objects of this
     band sit, in REFERENCE units. A floor is 100-200 units long and the camera
     only ever sees about 14 of them, so a fixed count is a trap -- eight trees
     spread over 200 units is one tree every few screens. Asking for spacing
     instead means every floor, long or short, gets the same density on screen.

     Heights are authored in the same reference units, and the framing budget is
     tight because the camera looks 7 degrees down: the eye line sits about a
     sixth of the way down the screen, so everything a backdrop may show lives in
     the band from the horizon up to roughly 13 degrees above it -- and under a
     ceiling, only up to the roof line.

     `col` values are the value the recipe WANTS on screen: the builder takes the
     fog back out of them (see unfog) and mixes them toward the horizon haze by
     distance. Near rungs are the dark ones -- that order is what makes the depth
     read -- but they carry a texture now, so a dark foreground rock has an edge
     to be seen by instead of being a flat silhouette. */
  const RECIPE = {
    /* --- the reachable run: depth 1 to 10 ---------------------------------- */

    /* 1 - The Shore. The run's brightest sky and its only sunrise. */
    shore: {
      tex: 'sand', skyGlow: 0.85, haze: 0.85, ground: 0x1b2730,
      stars: { sp: 1.3, size: 0.13, alpha: 0.55 },
      mist: { sp: 2.8, size: 0.26, alpha: 0.14, col: 0xa8c8e0 },
      motes: { col: 0xa8c8e0, size: 0.26, alpha: 0.4, rise: 0.2 },
      layers: [
        { kind: 'rubble', sp: 2.6, d: 4.5, col: 0x2f3d49, s0: 0.25, s1: 0.9 },
        { kind: 'spires', sp: 3.0, d: 7.5, col: 0x28343f, h0: 3.0, h1: 5.8 },
        { kind: 'hills',  sp: 3.6, d: 12,  col: 0x1d2833, h0: 2.0, h1: 3.6 },
        { kind: 'ridge',  sp: 3.2, d: 19,  col: 0x151f28, h0: 1.8, h1: 3.2 },
        { kind: 'wreck',  solo: true, d: 30, col: 0x121a22 },
        { kind: 'ridge',  sp: 3.6, d: 46,  col: 0x0f1720, h0: 1.3, h1: 2.4 },
        { kind: 'ridge',  sp: 3.8, d: 68,  col: 0x0b1119, h0: 1.0, h1: 1.8 }
      ]
    },

    /* 2 and 3 - The Cave. A roof over everything, so the body is light coming
       down through it rather than a sun standing in the sky. */
    cave: {
      tex: 'wetrock', ceiling: { y: 10.5, col: 0x04100f },
      skyGlow: 0.42, haze: 0.62, ground: 0x081614,
      mist: { sp: 3.6, size: 0.2, alpha: 0.14, col: 0x4c8c86 },
      motes: { col: 0x6ee7d0, size: 0.24, alpha: 0.4, rise: -0.3 },
      layers: [
        { kind: 'rubble',      sp: 2.2, d: 4.5, col: 0x1b423c, s0: 0.25, s1: 0.9 },
        { kind: 'crystals',    sp: 3.0, d: 7.5, col: 0x2f8b7f, glow: true, s0: 1.4, s1: 3.2 },
        { kind: 'stalactites', sp: 2.0, d: 12,  col: 0x113332, top: 8.5, h0: 3.0, h1: 5.6 },
        { kind: 'spires',      sp: 3.2, d: 19,  col: 0x0a201f, h0: 2.2, h1: 4.0 },
        { kind: 'colossus',    solo: true, d: 30, col: 0x081a19 },
        { kind: 'spires',      sp: 3.4, d: 46,  col: 0x071614, h0: 1.8, h1: 3.2 },
        { kind: 'bricks',      sp: 3.4, d: 68,  col: 0x051210, rows: 5 }
      ]
    },

    /* 4 - The Torch Hall. A puzzle floor built of masonry, and a forge at the
       end of it. */
    prison: {
      tex: 'brick', ceiling: { y: 10, col: 0x150e04 },
      skyGlow: 0.46, haze: 0.68, ground: 0x140c03,
      motes: { col: 0xf97316, size: 0.3, alpha: 0.5, rise: 0.7 },
      layers: [
        { kind: 'rubble',  sp: 2.4, d: 4.5, col: 0x412c11, s0: 0.3, s1: 1.0 },
        { kind: 'columns', sp: 3.4, d: 7.5, col: 0x38250c, h0: 3.8, h1: 6.6 },
        { kind: 'arches',  sp: 4.2, d: 12,  col: 0x2a1a09, h0: 3.0, h1: 5.0 },
        { kind: 'bricks',  sp: 3.0, d: 19,  col: 0x1e1206, rows: 6 },
        { kind: 'gatehouse', solo: true, d: 30, col: 0x180e05 },
        { kind: 'columns', sp: 3.6, d: 46,  col: 0x140b03, h0: 2.4, h1: 4.0 },
        { kind: 'bricks',  sp: 3.2, d: 68,  col: 0x100902, rows: 6 }
      ]
    },

    /* 5 - The Waystation. Violet, arcane, and the only floor where the player
       is meant to feel safe. */
    vault: {
      tex: 'marble', ceiling: { y: 10.5, col: 0x120722 },
      skyGlow: 0.48, haze: 0.68, ground: 0x140728,
      motes: { col: 0xc084fc, size: 0.32, alpha: 0.5, rise: 0.15 },
      layers: [
        { kind: 'rubble',   sp: 2.4, d: 4.5, col: 0x2f1d57, s0: 0.3, s1: 1.0 },
        { kind: 'crystals', sp: 3.0, d: 7.5, col: 0x8a66e0, glow: true, s0: 1.6, s1: 3.8 },
        { kind: 'columns',  sp: 3.6, d: 12,  col: 0x241548, h0: 3.0, h1: 5.2 },
        { kind: 'crystals', sp: 3.2, d: 19,  col: 0x4a3690, s0: 0.9, s1: 2.2 },
        { kind: 'monolith', solo: true, d: 30, col: 0x1a0e33 },
        { kind: 'arches',   sp: 4.5, d: 46,  col: 0x150a2c, h0: 2.4, h1: 4.0 },
        { kind: 'bricks',   sp: 3.4, d: 68,  col: 0x100720, rows: 6 }
      ]
    },

    /* 6 - The Rot Swamp. Open sky, a sun that never finished setting, and a
       tree big enough to be the floor's landmark from anywhere on it. */
    swamp: {
      tex: 'moss', skyGlow: 0.6, haze: 0.7, ground: 0x101c0a,
      mist: { sp: 3.0, size: 0.3, alpha: 0.2, col: 0x9fd06a },
      motes: { col: 0xb8e06a, size: 0.28, alpha: 0.4, rise: -0.1 },
      layers: [
        { kind: 'reeds',   sp: 1.6, d: 4.5, col: 0x233a15 },
        { kind: 'trees',   sp: 2.6, d: 7.5, col: 0x152409, bare: true, h0: 4.2, h1: 7.0 },
        { kind: 'trees',   sp: 3.0, d: 12,  col: 0x0f1c08, bare: true, h0: 2.8, h1: 4.8 },
        { kind: 'hills',   sp: 3.4, d: 19,  col: 0x0c1606, h0: 1.8, h1: 3.2 },
        { kind: 'deadtree', solo: true, d: 30, col: 0x081003 },
        { kind: 'spires',  sp: 3.0, d: 46, col: 0x070d04, h0: 1.5, h1: 2.6 },
        { kind: 'ridge',   sp: 4.0, d: 68, col: 0x050a03, h0: 1.2, h1: 2.2 }
      ]
    },

    /* 7 - The Climb. The run's widest sky: a cold moon, snow on the ridges, and
       the only clouds in the game. */
    mountain: {
      tex: 'granite', skyGlow: 0.72, haze: 0.85, ground: 0x1a2028,
      stars: { sp: 1.4, size: 0.13, alpha: 0.6 },
      motes: { col: 0xdceaff, size: 0.24, alpha: 0.35, rise: -0.15 },
      layers: [
        { kind: 'rubble', sp: 2.4, d: 4.5, col: 0x4a5566, s0: 0.3, s1: 1.0 },
        { kind: 'spires', sp: 2.8, d: 7.5, col: 0x40495a, h0: 3.0, h1: 5.6 },
        { kind: 'ridge',  sp: 3.0, d: 12,  col: 0x323c4c, h0: 2.8, h1: 4.8, snow: true },
        { kind: 'ridge',  sp: 3.2, d: 19,  col: 0x28313f, h0: 2.4, h1: 4.2, snow: true },
        { kind: 'peak',   solo: true, d: 30, col: 0x1f2734 },
        { kind: 'ridge',  sp: 3.4, d: 46,  col: 0x1a2130, h0: 1.9, h1: 3.4, snow: true },
        { kind: 'clouds', sp: 9,   d: 68,  col: 0x46536c, glow: true, alpha: 0.32 }
      ]
    },

    /* 8 - The Sunk Halls. The darkest rung of the run, lit from the surface
       through four shafts of water light. */
    flooded: {
      tex: 'ceramic', ceiling: { y: 10.5, col: 0x05121c },
      skyGlow: 0.58, haze: 0.66, ground: 0x0a1a24,
      mist: { sp: 3.0, size: 0.22, alpha: 0.14, col: 0x8fd8ff },
      motes: { col: 0x8fd8ff, size: 0.26, alpha: 0.4, rise: -0.25 },
      layers: [
        { kind: 'ice',     sp: 5.5, d: 4.5, col: 0x376c85 },
        { kind: 'columns', sp: 3.4, d: 7.5, col: 0x1a3c4d, h0: 3.6, h1: 6.2 },
        { kind: 'arches',  sp: 4.0, d: 12,  col: 0x133142, h0: 2.8, h1: 4.6 },
        { kind: 'falls',   sp: 14,  d: 12,  col: 0x8fd8ff, glow: true, h0: 3.0, h1: 5.2 },
        { kind: 'bricks',  sp: 3.0, d: 19,  col: 0x0e2634, rows: 6 },
        { kind: 'drownedtemple', solo: true, d: 30, col: 0x0b1e2a },
        { kind: 'arches',  sp: 4.5, d: 46,  col: 0x081b26, h0: 2.2, h1: 3.6 },
        { kind: 'bricks',  sp: 3.6, d: 68,  col: 0x061520, rows: 6 }
      ]
    },

    /* 9 - The Ash Reaches. The light is below the horizon here, and it is
       coming up. */
    volcanic: {
      tex: 'basalt', ceiling: { y: 10, col: 0x150604 },
      skyGlow: 0.9, haze: 0.8, ground: 0x1a0a06,
      mist: { sp: 2.6, size: 0.32, alpha: 0.16, col: 0xff8a3c },
      ember: { sp: 2.8, size: 0.11, alpha: 0.5, col: 0xff8a3c },
      motes: { col: 0xff8a3c, size: 0.2, alpha: 0.45, rise: 0.55 },
      layers: [
        { kind: 'rubble', sp: 2.4, d: 4.5, col: 0x4d1e0c, s0: 0.3, s1: 1.0 },
        { kind: 'spires', sp: 2.8, d: 7.5, col: 0x3f1809, h0: 3.2, h1: 6.0 },
        { kind: 'falls',  sp: 13,  d: 12,  col: 0xff7a3c, glow: true, h0: 3.2, h1: 5.6 },
        { kind: 'ridge',  sp: 3.2, d: 19,  col: 0x280e07, h0: 2.2, h1: 3.8 },
        { kind: 'caldera', solo: true, d: 30, col: 0x1f0a05 },
        { kind: 'ridge',  sp: 3.4, d: 46,  col: 0x180903, h0: 1.8, h1: 3.0 },
        { kind: 'spires', sp: 3.6, d: 68,  col: 0x120602, h0: 1.6, h1: 2.8 }
      ]
    },

    /* 10 - The Throne. Gold, and the largest thing in the sky all run. */
    throne: {
      tex: 'gild', ceiling: { y: 10.5, col: 0x1a1205 },
      skyGlow: 0.5, haze: 0.68, ground: 0x221806,
      motes: { col: 0xfde047, size: 0.32, alpha: 0.5, rise: 0.15 },
      layers: [
        { kind: 'rubble',  sp: 2.4, d: 4.5, col: 0x523a14, s0: 0.3, s1: 1.0 },
        { kind: 'columns', sp: 3.4, d: 7.5, col: 0x4a3410, h0: 3.8, h1: 6.8 },
        { kind: 'arches',  sp: 4.4, d: 12,  col: 0x3b280b, h0: 3.0, h1: 5.2 },
        { kind: 'spires',  sp: 3.4, d: 19,  col: 0x2f1f08, h0: 2.2, h1: 3.8 },
        { kind: 'thronehall', solo: true, d: 30, col: 0x271906 },
        { kind: 'arches',  sp: 4.6, d: 46,  col: 0x201405, h0: 2.0, h1: 3.4 },
        { kind: 'columns', sp: 3.8, d: 68,  col: 0x1a1004, h0: 1.8, h1: 3.0 }
      ]
    },

    /* --- themes a run cannot reach -----------------------------------------
       Kept playable: resolveTheme can still fall back to them, and a fallback
       theme with no body, no landmark and no texture would be a hole in the
       frame. */

    forest: {
      tex: 'bark', skyGlow: 1.0, haze: 0.8, ground: 0x0e1d13,
      stars: { sp: 1.6, size: 0.12, alpha: 0.5 },
      motes: { col: 0x86efac, size: 0.30, alpha: 0.45, rise: 0.2 },
      layers: [
        { kind: 'rubble', sp: 2.6, d: 4.5, col: 0x203a26, s0: 0.25, s1: 0.9 },
        { kind: 'trees',  sp: 2.8, d: 7.5, col: 0x182f1c, h0: 4.0, h1: 6.6 },
        { kind: 'trees',  sp: 3.2, d: 12,  col: 0x132817, h0: 2.8, h1: 4.6 },
        { kind: 'hills',  sp: 3.6, d: 19,  col: 0x0e2011, h0: 2.0, h1: 3.6 },
        { kind: 'deadtree', solo: true, d: 30, col: 0x0b1a0e },
        { kind: 'trees',  sp: 3.0, d: 46,  col: 0x0b1a0e, h0: 1.8, h1: 3.0 },
        { kind: 'ridge',  sp: 3.4, d: 68,  col: 0x081309, h0: 1.3, h1: 2.2 }
      ]
    },
    caves: {
      tex: 'wetrock', ceiling: { y: 10.5, col: 0x050f0e },
      skyGlow: 0.44, haze: 0.66, ground: 0x0a1a17,
      mist: { sp: 3.2, size: 0.22, alpha: 0.16, col: 0x4f8078 },
      motes: { col: 0x5eead4, size: 0.26, alpha: 0.4, rise: -0.35 },
      layers: [
        { kind: 'rubble',      sp: 2.4, d: 4.5, col: 0x1a3c36, s0: 0.25, s1: 0.9 },
        { kind: 'stalactites', sp: 2.2, d: 7.5, col: 0x163a34, top: 8.5, h0: 3.0, h1: 6.0 },
        { kind: 'spires',      sp: 3.0, d: 12,  col: 0x102927, h0: 2.8, h1: 4.8 },
        { kind: 'spires',      sp: 3.2, d: 19,  col: 0x0b1d1c, h0: 2.2, h1: 3.8 },
        { kind: 'colossus',    solo: true, d: 30, col: 0x081817 },
        { kind: 'bricks',      sp: 3.4, d: 46,  col: 0x081715, rows: 5 },
        { kind: 'bricks',      sp: 3.6, d: 68,  col: 0x061311, rows: 5 }
      ]
    },
    nest: {
      tex: 'bone', ceiling: { y: 10, col: 0x170508 },
      skyGlow: 0.44, haze: 0.66, ground: 0x1a060a,
      motes: { col: 0xfb7185, size: 0.28, alpha: 0.5, rise: 0.1 },
      layers: [
        { kind: 'bones',       sp: 3.0, d: 4.5, col: 0x4a2b33 },
        { kind: 'trees',       sp: 3.0, d: 7.5, col: 0x250a0f, bare: true, h0: 3.8, h1: 6.4 },
        { kind: 'stalactites', sp: 2.2, d: 12,  col: 0x341117, top: 8.5, h0: 2.6, h1: 5.0 },
        { kind: 'bricks',      sp: 3.2, d: 19,  col: 0x1d070c, rows: 6 },
        { kind: 'bonetower',   solo: true, d: 30, col: 0x170609 },
        { kind: 'spires',      sp: 3.4, d: 46,  col: 0x160609, h0: 2.0, h1: 3.4 },
        { kind: 'bricks',      sp: 3.6, d: 68,  col: 0x100406, rows: 6 }
      ]
    },
    trial: {
      tex: 'blood', ceiling: { y: 10, col: 0x180607 },
      skyGlow: 0.46, haze: 0.66, ground: 0x1c0709,
      motes: { col: 0xff8a6a, size: 0.28, alpha: 0.45, rise: 0.3 },
      layers: [
        { kind: 'rubble',  sp: 2.2, d: 4.5, col: 0x471b18, s0: 0.3, s1: 1.0 },
        { kind: 'columns', sp: 3.4, d: 7.5, col: 0x3d1513, h0: 3.8, h1: 6.6 },
        { kind: 'arches',  sp: 4.2, d: 12,  col: 0x320f0f, h0: 3.0, h1: 5.0 },
        { kind: 'bricks',  sp: 3.0, d: 19,  col: 0x220a0b, rows: 6 },
        { kind: 'obelisk', solo: true, d: 30, col: 0x1c0809 },
        { kind: 'arches',  sp: 4.5, d: 46,  col: 0x180506, h0: 2.4, h1: 4.0 },
        { kind: 'bricks',  sp: 3.6, d: 68,  col: 0x120405, rows: 6 }
      ]
    }
  };

  /* How many of a band to place across a floor of this width. A `solo` layer is
     a landmark: exactly one, and never at the very edge of the floor. */
  function bandCount(spec, WU) {
    if (spec.solo) return 1;
    const n = Math.round(WU / Math.max(0.5, spec.sp || 6));
    return Math.max(1, Math.min(400, n));
  }
  /* --- colour helpers -------------------------------------------------------- */

  /* Accepts a hex NUMBER or a colour string, because mixHex() is nested: the
     haze colour for a theme is a mix of a mix, and the inner call hands the
     outer one an 'rgb(...)' string.

     That nesting was broken for the whole life of this file. A string hit the
     `>> 16` path, which is 0 for a string, so the inner colour read as BLACK and
     every haze mix came out at rgb(20, 20, 20) whatever the theme was. The
     visible cost: the horizon band of the sky and every far rung were being
     pulled toward black instead of toward a lit haze, which INVERTS aerial
     perspective -- the far bands came out darker than the near ones, the exact
     opposite of what the code and its comments said they were doing. Measured
     before the fix, at depth 1: near rung 66.8, far rung 8.1. */
  function hexToRgb(col) {
    if (typeof col === 'string') {
      const m = col.match(/(\d+)\D+(\d+)\D+(\d+)/);
      if (m) return { r: +m[1], g: +m[2], b: +m[3] };
      const n = parseInt(col.replace('#', ''), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    return { r: (col >> 16) & 255, g: (col >> 8) & 255, b: col & 255 };
  }

  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(A.r + (B.r - A.r) * t);
    const g = Math.round(A.g + (B.g - A.g) * t);
    const bl = Math.round(A.b + (B.b - A.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* A cheap deterministic hash, used for per-instance value jitter: forty
     identical rocks in one band would otherwise render as a single flat mass,
     and breaking that mass up into objects is the cheapest realism there is. */
  function hash01(n) {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /* What the fog will do to a colour at this distance, undone.

     three.js mixes a fogged fragment toward the fog colour by
     1 - exp(-(density * depth)^2). At 68 units -- the far rung -- that is 43%
     for the game's own 0.008, which is enough to pull every far band to within
     a few values of the fog colour: the seven-rung ladder then renders as one
     flat wash, which is the classic way a layered backdrop stops looking
     layered. Dividing the fog back out means the value that reaches the eye is
     the value the recipe asked for.

     It is not magic and it is not free: a channel the fog has already driven to
     zero cannot come back, so the result is clamped into range, and the ceiling
     (FOG_LIFT_MAX) stops a mis-authored colour from turning into a floodlight.
     What the QA can then assert is what the recipe meant. */
  function unfog(col, dist, fogCol, density) {
    const f = 1 - Math.exp(-Math.pow(density * dist, 2));
    if (f <= 0.02) return col.clone();
    const inv = 1 / Math.max(1 - f, 1 / FOG_LIFT_MAX);
    return new THREE.Color(
      M.clamp((col.r - fogCol.r * f) * inv, 0, 1),
      M.clamp((col.g - fogCol.g * f) * inv, 0, 1),
      M.clamp((col.b - fogCol.b * f) * inv, 0, 1));
  }

  /* --- instanced batches ------------------------------------------------------

     Everything a band emits is the same unit box or the same shard geometry, so
     a whole band of 120 rocks is one InstancedMesh. `tint` is per-instance value
     jitter. */
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
       the camera pans away from x=0 -- which read as "the background is missing
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

  /* --- the sky itself ---------------------------------------------------------

     A sky is not a backdrop painting: it is the far shell of the world, and the
     whole job of it is the bright haze band that sits ON the horizon line. Four
     stops, canvas top to bottom: dark overhead, the theme's mid sky, a still-hazy
     band, and the haze itself at the ground line. */
  function makeSkyTexture(topHex, midHex, lowHex, hazeHex) {
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 128;
    const ctx = cv.getContext('2d');
    /* The stops are placed against what the camera can actually see, not
       against the plane: the plane runs SKY_DROP units below the eye line, so
       its very bottom (and the pure haze colour on it) is hidden behind the far
       ground. The haze plateau therefore starts at 0.9 - about seven degrees
       above the horizon - which is the band the eye reads as "there is distance
       there". */
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

  /* --- the hero ---------------------------------------------------------------

     The body is drawn, not modelled: a 32x32 canvas disc stepped in 2-pixel
     blocks, so at any distance it reads as voxel art rather than as the one
     vector circle in a game made of cubes. Three tones -- core, body, rim -- are
     what give it the lit side a painted sun has, and they cost nothing because
     they are three fillRect colours in the same canvas. */
  function makeHeroTexture(hero) {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 32, 32);
    const core = cssOf(hero.core != null ? hero.core : hero.col);
    const body = cssOf(hero.col);
    const rim = cssOf(hero.edge != null ? hero.edge : hero.col);
    /* An eclipse inverts: a dark core with a hot rim, because that is the one
       celestial body whose shape is told by its edge and not by its middle. */
    const invert = hero.kind === 'eclipse';
    for (let y = 0; y < 32; y += 2) {
      for (let x = 0; x < 32; x += 2) {
        const nx = (x + 1) / 16 - 1, ny = (y + 1) / 16 - 1;
        const d = Math.sqrt(nx * nx + ny * ny);
        if (d > 1) continue;
        ctx.fillStyle = invert
          ? (d > 0.86 ? rim : core)
          : (d > 0.88 ? rim : d > 0.66 ? body : core);
        ctx.fillRect(x, y, 2, 2);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  /* The glow wall's own texture: a soft horizontal falloff, wide and low, drawn
     once and shared by every theme. This is the sky the body owns. */
  let glowBarTex = null;
  function makeGlowBarTexture() {
    if (glowBarTex) return glowBarTex;
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(64, 58, 2, 64, 58, 62);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 64);
    glowBarTex = new THREE.CanvasTexture(cv);
    glowBarTex.magFilter = THREE.LinearFilter;
    glowBarTex.minFilter = THREE.LinearFilter;
    return glowBarTex;
  }

  let heroRef = null;         // the live body: { group, rays, halos, glow, plume }
  let backdropAir = [];       // mist / ember motes with their own drift
  let backdropSway = [];      // bands that sway about their own base
  let backdropLife = [];      // silhouettes crossing the sky
  let lastReport = null;

  /* Build one theme's body. Everything here is MeshBasicMaterial: unlit, so no
     lamp is added (see the header: a new lamp is the black-screen bug), and
     `fog: false`, so the body is the one thing in the world the weather cannot
     eat. */
  function buildHero(parent, hero, WU, heroZ, rng, yBase) {
    const g = new THREE.Group();
    const tex = makeHeroTexture(hero);
    const geo = new THREE.PlaneGeometry(hero.r * 2, hero.r * 2);
    const add = function (geo2, scale, alpha, col) {
      const m = new THREE.Mesh(geo2, new THREE.MeshBasicMaterial({
        map: tex, color: col != null ? col : 0xffffff, transparent: true,
        opacity: alpha, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false
      }));
      m.scale.setScalar(scale);
      m.frustumCulled = false;
      return m;
    };

    /* The body itself is opaque-ish: it is the one silhouette in the sky that
       is meant to be read as an object, not as a bloom. */
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false
    }));
    core.frustumCulled = false;
    g.add(core);

    /* Halos: the same disc, enlarged and faded, twice. Two is the number that
       reads as light rather than as a smudge -- one is a sticker, three is fog. */
    const halos = [];
    const hr = hero.halos || [1.5, 2.5];
    for (let i = 0; i < hr.length; i++) {
      const h = add(geo, hr[i], i === 0 ? 0.34 : 0.17, hero.col);
      h.position.z = 0.2 + i * 0.2;
      g.add(h);
      halos.push(h);
    }

    /* Rays: a fan of thin boxes turning around the body. It is the difference
       between a sun and a moon -- and both of them are cheaper as one batch of
       16 boxes than as a shader. */
    let rays = null;
    if (hero.rays) {
      const list = [];
      const n = hero.rays, len = hero.r * 1.35;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + 0.12;
        const rr = hero.r * 1.18 + len * 0.5;
        box(list, Math.cos(a) * rr, Math.sin(a) * rr, 0.1,
            len * rng.float(0.7, 1.25), 0.34, 0.1, a, 0);
      }
      rays = instancedBoxes(list, new THREE.MeshBasicMaterial({
        color: hero.col, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }), 0);
      g.add(rays);
    }

    /* A ring of small blocks around the body: the sigil, the eclipse, the
       crown. Read as runes at distance, which is all it needs to be. */
    if (hero.ring) {
      const list = [];
      const n = 12, rr = hero.r * 1.45;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        box(list, Math.cos(a) * rr, Math.sin(a) * rr, 0.3,
            hero.r * 0.22, hero.r * 0.22, 0.2, a, 0);
      }
      g.add(instancedBoxes(list, new THREE.MeshBasicMaterial({
        color: hero.core != null ? hero.core : 0xffffff, transparent: true,
        opacity: 0.55, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false
      }), 0));
    }

    /* A plume: the caldera's smoke, rising in front of the dome. Dark, not
       additive, because smoke lit from below is still smoke. */
    let plume = null;
    if (hero.plume) {
      const list = [];
      for (let i = 0; i < 7; i++) {
        const y = hero.r * 1.1 + i * hero.r * 0.42;
        box(list, rng.float(-1, 1) * hero.r * 0.3, y, 0.4,
            hero.r * (1.5 - i * 0.13), hero.r * 0.42, hero.r * 0.5,
            0, rng.float(-0.3, 0.3));
      }
      plume = instancedBoxes(list, new THREE.MeshBasicMaterial({
        color: 0x1a0a06, transparent: true, opacity: 0.55, fog: false
      }), 0.3);
      g.add(plume);
    }

    /* The aurora: three flat bands a long way above the moon. Pale, additive,
       and the only moving thing a night sky needs to prove it is a sky. */
    if (hero.aurora) {
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(WU * 1.6, hero.r * 3.6),
          new THREE.MeshBasicMaterial({
            map: makeGlowBarTexture(), color: i === 1 ? 0x86efac : hero.col,
            transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending,
            depthWrite: false, fog: false
          }));
        b.position.set(hero.r * (i - 1) * 1.4, hero.r * (2.1 + i * 0.35), 1.2);
        b.frustumCulled = false;
        b.userData.aurora = { sway: 0.5 + i * 0.3, ph: i * 1.7 };
        g.add(b);
      }
    }

    g.position.set((hero.az - 0.5) * WU * 0.9, (yBase || 0) + hero.elev, heroZ);
    parent.add(g);
    return { group: g, halos: halos, rays: rays, plume: plume, kind: hero.kind };
  }

  /* The shafts an underground theme gets instead of a sun: light coming DOWN
     through a hole in the roof. They live in world space (not the sky rig),
     because what they hang from is the ceiling, and the ceiling belongs to the
     floor. */
  function buildShafts(parent, hero, WU, anchorY, ceilY, rng) {
    const n = hero.shafts || 3;
    const top = anchorY + (ceilY != null ? ceilY - 0.6 : 9);
    const bottom = anchorY + 0.4;
    const mat = new THREE.MeshBasicMaterial({
      color: hero.col, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    for (let i = 0; i < n; i++) {
      const x = WU * (0.16 + i * (0.68 / Math.max(1, n - 1)) * (n > 1 ? 1 : 0)) + rng.float(-6, 6);
      const g = new THREE.Group();
      const h = top - bottom;
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const t = k / (steps - 1);
        const w = 1.1 + t * 2.6;
        const y = top - h * (k + 0.5) / steps;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, h / steps * 1.05, w), mat);
        seg.position.set(0, y - anchorY, -18 - i * 5);
        seg.frustumCulled = false;
        g.add(seg);
      }
      g.rotation.z = rng.float(-0.10, 0.10);
      g.position.x = x;
      parent.add(g);
    }
    /* And the pool of light it lands in, so the shaft has somewhere to arrive. */
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(WU * 0.5, 9),
      new THREE.MeshBasicMaterial({
        map: makeGlowBarTexture(), color: hero.col, transparent: true,
        opacity: 0.34, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false
      }));
    pool.position.set(WU * 0.5, anchorY + 0.3, -30);
    pool.frustumCulled = false;
    parent.add(pool);
  }

  /* The glow wall: the whole reason a horizon can read as LIT rather than as
     painted. A soft additive sheet in the body's own colour, standing behind
     every band, so the sky brightens around the sun and the far ridges stay dark
     in front of it -- which is the one arrangement the eye reads as backlight. */
  function buildGlowWall(parent, hero, WU, heroZ, yBase) {
    const w = WU * 2.4;
    const h = hero.r * 3.4 + 74;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: makeGlowBarTexture(), color: hero.col, transparent: true,
        opacity: hero.glow != null ? hero.glow * 0.55 : 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
    m.position.set((hero.az - 0.5) * WU * 0.9, (yBase || 0) + hero.elev * 0.75, heroZ + 22);
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  /* Where the far light comes FROM, for the back light the renderer already
     owns. The rig can be turned (F6), so the angle is rotated with it: the light
     has to come from where the body is ON SCREEN, not from where it sits in
     world coordinates. */
  function heroLight(themeName, yaw) {
    const hero = HEROES[themeName] || HEROES.forest;
    const x = (hero.az - 0.5) * 92;
    const z = -26;
    const yw = (yaw || 0) * 0.85;
    return {
      x: x * Math.cos(yw) - z * Math.sin(yw),
      y: 12 + Math.min(hero.elev || 14, 30) * 0.6,
      z: x * Math.sin(yw) + z * Math.cos(yw),
      col: hero.col,
      gain: hero.gain != null ? hero.gain : 1
    };
  }

  /* Slow, sparse motes in the backdrop air - mist over a swamp, embers in an
     ash field. Separate from ScreenParticleManager, which drifts with the
     camera: this belongs to the horizon, so it is strung over the near half of
     the ladder and anchored to the same ground line as the bands. */
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

  /* ---------------------------------------------------------------------------
     build
     --------------------------------------------------------------------------- */
  /* The largest disc a room can hold, and where it has to sit.

     Two constraints, and they pull in opposite directions: the body has to be
     ABOVE THE FLOOR (a disc at zero elevation is a lamp inside the ground slab,
     and its halo is a smear under the terrain) and UNDER THE ROOF (a disc under
     a stone slab is an invisible light, which is the same as having no body at
     all -- that is the failure this file started with). With `room` the usable
     height, both survive only while r <= (room - 0.2) / 2, so the radius is
     capped there and the elevation is then pinned inside what is left.

     Authored `elev` is a wish as much as `r` is: it is what the theme WOULD hang
     its sun at if the room were open, and the fit brings it down into the room.
     A ten-unit roof lands a 4-unit body about 4.3 above the floor: low enough
     that its light is the room's, high enough that the bands walk in front of
     it. */
  function fitRoomHero(hon, rec) {
    const out = Object.assign({}, hon);
    if (!rec || !rec.ceiling) return out;
    const room = Math.max(2.4, rec.ceiling.y - 1.6);   // clearance under the slab
    const cap = Math.max(1.6, (room - 0.2) / 2);
    const r = Math.min(hon.r, cap);
    out.r = Math.round(r * 100) / 100;
    out.elev = Math.round(Math.max(out.r + 0.2, Math.min(hon.elev, room - out.r)) * 100) / 100;
    return out;
  }

  function build(env, themeName, w, h, anchorY) {
    if (typeof THREE === 'undefined') return null;
    const rec = RECIPE[themeName] || RECIPE.forest;
    const theme = (env && env.theme) || { fog: 0x0e2417, hemiSky: 0x6a8166 };
    const p2u = (env && env.p2u) || 0.1;
    const WU = w * 16 * p2u;
    const rng = DS.makeRng((0x5EEDBA5E ^ hashStr(themeName) ^ (w * 131)) >>> 0);
    const curve = CURVE[themeName] || { gain: DEFAULT_GAIN, warm: 0.18 };
    const hon = HEROES[themeName] || HEROES.forest;
    const skyGain = curve.gain;
    const fogCol = new THREE.Color((env && env.fogCol) != null ? env.fogCol : theme.fog);
    const fogK = (env && env.fogDensity) != null ? env.fogDensity : DEFAULT_FOG;

    backdropAir = [];
    backdropSway = [];
    backdropLife = [];
    heroRef = null;
    /* The glow texture is shared by the wall, the aurora and the shaft pools, and
       the renderer disposes every map in the group when the level tears down --
       so it is rebuilt per floor rather than cached across them, or the second
       floor would draw with a texture whose GPU side has already been freed. */
    glowBarTex = null;

    const group = new THREE.Group();
    const glow = rec.skyGlow != null ? rec.skyGlow : 0.75;
    const heroHazeRep = mixHex(theme.fog, hon.col, (CURVE[themeName] || CURVE.forest).warm * 0.5);
    const hazeHexRep = mixHex(mixHex(theme.fog, heroHazeRep, 0.15 + 0.95 * glow), 0xffffff, 0.08);
    const report = {
      theme: themeName, w: w, anchorY: anchorY, gain: skyGain,
      /* Boxes dropped to open the window the body is seen through (see the layer
         loop): 0 is legal and means nothing in front of the light was tall
         enough to need cutting. */
      window: 0,
      /* The floor's width in world units. It is in the report because it is the
         invariant the QA holds the body against: a body is authored at an
         AZIMUTH (a fraction of the floor) and must be found at that fraction of
         the floor's mid-line, in the horizon group's own frame. The bug that
         kept every roofed theme dark was this offset going missing -- the body
         was parented a rig short, so it sat half a floor to the LEFT of where
         the report said, and the report, being arithmetic, agreed with itself. */
      wu: WU,
      haze: hazeHexRep,
      skyValue: new THREE.Color(hazeHexRep).multiplyScalar(skyGain).getHex(),
      rungs: RUNGS.slice(), layers: [], hero: null, textures: [], fogLift: []
    };

    /* The haze the horizon fades into. The sky's lowest band IS this colour,
       and every distant band is mixed toward a darkened copy of it, because a
       Lambert surface is lit by the ambient + hemisphere rig (about 1.4x) and
       an unlit sky is not: mixing a band toward the raw sky haze comes out
       BRIGHTER than the sky behind it, which is exactly the washed-out, inverted
       horizon this rework exists to kill. Silhouettes must sit below the haze. */
    /* The body's own colour is mixed into the haze before anything else: a sky
       with a sun in it is not a neutral sky, and that one mix is what makes a
       shore dawn and a caldera read as two different places at the same gain. */
    const heroHaze = mixHex(theme.fog, hon.col, curve.warm * 0.5);
    const hazeHex = hazeHexRep;
    const skyHaze = new THREE.Color(hazeHex).multiplyScalar(skyGain);
    /* What a band converges to with distance. The bands are silhouettes, so
       their own haze target sits BELOW the sky's horizon value -- a ridge that
       matches the sky it stands against is not a ridge, it is a smear -- but it
       has to sit close enough that distance still reads as "lost my colour to
       the air". At 0.45*gain + 0.16 the target for a gain-0.56 shore came out at
       41% of the sky, and a far rung mixed toward it landed 40 luminance below
       the near one: the far end of the ladder came out DARKER, which is the
       inverse of what the code said it was doing. */
    const bandHaze = new THREE.Color(hazeHex).multiplyScalar(0.72 * skyGain + 0.10);
    const topHex = new THREE.Color(mixHex(theme.fog, 0x000000, 0.35)).multiplyScalar(skyGain);
    if (env && env.scene) env.scene.background = new THREE.Color(topHex);

    /* --- the sky rig -------------------------------------------------------
       Gradient, stars and the body live in one group whose origin is the EYE
       LINE (the renderer pins it there every frame), so the haze band lands on
       the horizon whatever the camera's height - which is what keeps a floor's
       horizon from drifting as the player walks up and down. It also means the
       body is fixed in the sky: a climb moves the ground past a sun that does
       not move, which is the correct behaviour for something at infinity. */
    const skyRig = new THREE.Group();
    skyRig.position.set(WU * 0.5, 0, SKY_Z);

    const skyCss = function (col, k) {
      return '#' + (k === 1 ? col : col.clone().multiplyScalar(k)).getHexString();
    };
    const skyMat = new THREE.MeshBasicMaterial({
      map: makeSkyTexture(skyCss(new THREE.Color(topHex), 1),
                          skyCss(new THREE.Color(mixHex(theme.fog, heroHaze, 0.18 * glow)), skyGain),
                          skyCss(new THREE.Color(mixHex(theme.fog, heroHaze, 0.52 * glow)), skyGain),
                          '#' + skyHaze.getHexString()),
      fog: false, depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(WU * 4, SKY_H + SKY_DROP), skyMat);
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

    /* --- the body ---------------------------------------------------------- */
    const heroZ = 2;
    const heroObj = fitRoomHero(hon, rec);
    /* WHERE the body hangs is a design decision with a geometric answer:

         - Open theme: it belongs to the SKY. It rides the eye line with the sky
           rig, so walking up a mountain moves the ground past a moon that does
           not move -- which is what something at infinity does.

         - Theme with a roof: it belongs to the ROOM. Hung on the eye line its
           elevation is measured from the camera while the roof's height is
           measured from the floor line, and on a floor whose walking surface
           sits high above the anchor the two frames disagree by ten units: the
           disc ends up BEHIND the ceiling slab. Measured on depth 4, the torch
           hall's furnace was occluded by its own roof and its patch of screen
           read 30.9 against 46.7 on the far side of the frame. Anchored to the
           anchor, the body sits above the horizon line it is lighting and under
           the roof it is lighting the room with. */
    const inRoom = !!rec.ceiling;
    /* And WHICH LINE it hangs on, which is the bug that outlived all the others.

       `az` is a fraction of the FLOOR's width, and everything else in this file
       is authored in the floor's own coordinates: the bands spread from 0 to WU,
       the ground segments sit at WU * 0.5, the shafts stand at 0.16..0.84 of WU,
       the ceiling slab is centred on WU * 0.5. A sky body inherits that line for
       free, because skyRig is already parked on WU * 0.5 -- but a ROOM body was
       parented straight to the group, so its x came out as (az - 0.5) * WU * 0.9,
       a fraction of a floor to the LEFT of the level it is in. Measured at depth
       10, the throne's crown sat at world x -24.2 while the floor's middle was
       224: ten times the frame's half-width away and permanently off screen, so
       the eight roofed themes had NO visible light at all -- while the QA report
       claimed one at 199.8, i.e. the report and the picture had never agreed.
       The rig below is that missing line, and it is the reason the reference in
       the report is now read off the object instead of re-derived (see below). */
    const roomRig = new THREE.Group();
    roomRig.position.set(WU * 0.5, 0, 0);
    group.add(roomRig);
    const heroParent = inRoom ? roomRig : skyRig;
    const yBase = inRoom ? anchorY : 0;
    /* And at WHAT distance, which is the other half of the same decision. A new
       moon stands at the sky's own distance because the sky is what you see
       behind a treeline. A room shows you no horizon at all: there are near
       bands and a roof, and a body hung out where the sky would be is simply
       behind every one of them -- measured on depth 3, its patch of screen read
       20.7 against 18.6 opposite, i.e. nothing. A furnace belongs where a band
       is, so it hangs at ROOM_HERO_D and the bands stand in front of it, which
       is the read a torch hall actually has. */
    const heroDist = inRoom ? ROOM_HERO_D : heroZ;
    const glowWall = buildGlowWall(heroParent, heroObj, WU,
      inRoom ? heroDist - 16 : heroZ + 22, yBase);
    const heroBuilt = buildHero(heroParent, heroObj, WU, heroDist, rng, yBase);
    heroRef = heroBuilt;
    heroRef.glow = glowWall;
    group.add(skyRig);

    /* --- the ground --------------------------------------------------------
       Not one slab but four, each a little paler than the last in toward the
       horizon, so the plain carries its own depth ramp. Without it the bands
       stand in a void and the walkway floats over nothing; with it the terrain
       runs from under the player's feet to the sky, which is most of what makes
       a horizon read as a place. A single flat plane at one value would read as
       a wall lying down - and it would also hand the bands nothing to be told
       apart from. */
    const groundHex = mixHex(rec.ground != null ? rec.ground : theme.fog, hazeHex, 0.3);
    const GSEG = [
      { near: 1.2, far: 16, tone: 0.34 },
      { near: 16, far: 46, tone: 0.52 },
      { near: 46, far: 88, tone: 0.70 },
      { near: 88, far: GROUND_D, tone: 0.86 }
    ];
    for (let gi = 0; gi < GSEG.length; gi++) {
      const s = GSEG[gi];
      const segCol = new THREE.Color(groundHex).multiplyScalar(s.tone);
      let segMat;
      if (gi <= 1) {
        const t = bandTexture(rec.tex).clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(2, Math.round(WU * 2 / 12)), Math.max(1, Math.round((s.far - s.near) / 8)));
        segMat = new THREE.MeshLambertMaterial({ color: segCol, map: t });
        report.textures.push({ where: 'ground' + gi, family: rec.tex || 'granite', rep: [t.repeat.x, t.repeat.y] });
      } else {
        segMat = new THREE.MeshLambertMaterial({ color: segCol });
      }
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(WU * 2, 2.6, s.far - s.near), segMat);
      seg.position.set(WU * 0.5, anchorY - 1.3, -(s.near + s.far) * 0.5);
      seg.frustumCulled = false;
      group.add(seg);
    }

    /* --- the ladder --------------------------------------------------------- */
    const layers = rec.layers || [];
    /* Nothing in a roofed room may poke through the roof.

       A band is authored in REFERENCE units and then scaled by its rung's own
       factor, and the far rungs' factor is 3: so the cave's five-row brick wall
       was authored at 4.9 and arrived 15 world units tall under a 10.5 roof.
       The result is a horizon that has been drawn straight through the ceiling
       -- on screen the far wall's top sits ABOVE the roof line, which measures
       as "the room has no sky strip left" and reads as a backdrop that does not
       belong to the room it is in. A row that would breach the roof is dropped,
       and a row that only grazes it is pushed down: both are cheaper and more
       honest than retuning thirteen recipes by hand. */
    const roofAuth = rec.ceiling ? (rec.ceiling.y - 1.6) : 0;
    /* --- the window the body is seen through --------------------------------
       Measured, not guessed. On a floor that reads dark at the body, hiding the
       layers that stand in front of it lifts the disc's centre from 5 to 106:
       the light is there and a band is standing over it. The bands are dense
       rows of boxes whose tops reach well above a body hung 4.3 units over the
       floor line, and whether a given floor's sight line passes through a box or
       through a gap between two of them is a coin toss -- it depends on the row
       the player happens to be standing on, which is the one thing a harness
       cannot choose. So the window is cut here, once, at build time.

       THE GEOMETRY, because it is the whole trick: a layer is scaled by k about
       the horizon's middle, so a point that must line up at distance d sits at
       WU/2 + (its world offset)/k in that layer's authored units, and its
       APPARENT size there is the same fraction of k on every rung -- which is
       what the ladder already does with heights. The gap is therefore the body's
       own radius, magnified from where the body hangs (30 units for a room, the
       sky for an open theme) and taken with a margin, measured in authored units
       and applied on every rung alike.

       Only boxes that are actually IN FRONT of the body go: the ones behind it
       are the depth the light is meant to be sitting in front of. And only the
       ones rising above the body's FEET: the near rubble below it is the
       parallax and it stays. */
    const windowBodyZ = inRoom ? ROOM_HERO_D : SKY_Z;
    const windowFeetY = anchorY + (inRoom ? heroObj.elev : hon.elev) - heroObj.r;
    const windowGap = heroObj.r * (CAM_DIST + REF_D) / (CAM_DIST - windowBodyZ) * 1.6;
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const d = L.d != null ? L.d : REF_D;
      const k = L.k != null ? L.k : (CAM_DIST + d) / (CAM_DIST + REF_D);
      const o = { boxes: [], shards: [] };
      const kind = BACKDROP_KINDS[L.kind];
      if (!kind) continue;
      const n = bandCount(L, WU);
      for (let j = 0; j < n; j++) {
        const x = L.solo ? rng.float(0.24, 0.78) * WU : rng.float(-0.06, 1.06) * WU;
        kind(o, x, rng, L);
      }
      if (roofAuth) {
        const cap = roofAuth / k;             // the roof, in authored units
        const kept = [];
        for (let bi = 0; bi < o.boxes.length; bi++) {
          const b = o.boxes[bi];
          if (b[1] - b[4] * 0.5 > cap) continue;              // wholly above it
          if (b[1] + b[4] * 0.5 > cap) b[1] = cap - b[4] * 0.5; // clipped to it
          kept.push(b);
        }
        o.boxes = kept;
        const sk = [];
        for (let si = 0; si < o.shards.length; si++) {
          if (o.shards[si][1] - o.shards[si][4] * 0.5 <= cap) sk.push(o.shards[si]);
        }
        o.shards = sk;
      }

      /* Cut the window (see above): a box goes if it is in front of the body,
         rises above its feet, and overlaps the body's own column. */
      const winX = WU * 0.5 + (hon.az - 0.5) * WU * 0.9 / k;
      const beforeWindow = o.boxes.length;
      const winKept = [];
      for (let bi = 0; bi < o.boxes.length; bi++) {
        const b = o.boxes[bi];
        const frontZ = -d + k * (b[2] + (b[5] != null ? b[5] : 0) * 0.5);
        const topY = anchorY + k * (b[1] + b[4] * 0.5);
        const inWindow = Math.abs(b[0] - winX) - Math.abs(b[3]) * 0.5 < windowGap;
        if (frontZ > windowBodyZ + 0.6 && topY > windowFeetY && inWindow) continue;
        winKept.push(b);
      }
      o.boxes = winKept;

      /* Aerial perspective. Two silhouettes of the same value at 6 and 44 units
         read as one flat cut-out, so every far band is mixed toward the horizon
         haze until it is a pale ghost of the near one. A band that is its own
         light source (lava, a light shaft) keeps most of its colour, because a
         washed-out torch stops reading as a light. The fog is taken back out
         FIRST, so the mix is against the value the recipe meant. */
      const far = M.clamp((d - REF_D) / 34, 0, 1);
      const hazeT = far * (rec.haze != null ? rec.haze : 0.75) * (L.glow ? 0.35 : 1);
      const raw = new THREE.Color(L.col);
      const col = unfog(raw, CAM_DIST + d, fogCol, fogK).lerp(bandHaze, hazeT);
      /* The near rung keeps a touch more of its own light (the torch is right
         there), and no more than a touch: the whole depth read depends on the
         near band being the DARK one. */
      const matOpts = {};
      if (!L.glow) matOpts.color = col.multiplyScalar(1 + (1 - far) * 0.12);
      else matOpts.color = col;

      /* The texture. Every rung out to TEX_AT carries one, and its repeat is
         solved from this rung's own scale factor and the size of the objects it
         actually emitted, so texel density is constant up the ladder instead of
         the far bands becoming one stretched smear of the near band's rock. */
      let texRep = 0, meanSize = 0;
      const useTex = !L.glow && d <= TEX_AT;
      if (useTex) {
        let sum = 0;
        const sample = o.boxes.length ? o.boxes : o.shards;
        const stride = Math.max(1, Math.floor(sample.length / 24));
        let c = 0;
        for (let i = 0; i < sample.length; i += stride) {
          sum += Math.abs(sample[i][3]) + Math.abs(sample[i][5] != null ? sample[i][5] : sample[i][3]);
          c++;
        }
        meanSize = c ? sum / c * 0.5 : 1;
        texRep = M.clamp(Math.round(meanSize * k / 2.4), 1, 16);
        const t = bandTexture(L.tex || rec.tex).clone();
        t.needsUpdate = true;
        t.repeat.set(texRep, texRep);
        matOpts.map = t;
      }

      /* A glow layer is transparent, and its alpha is authored: the mountain's
         cloud band sits in front of the moon, so at a solid 0.85 it PAINTED THE
         MOON OUT -- measured, the moon's own patch of sky came back at 79.6
         against 71.4 on the far side of the frame, which is a smudge, not a
         moon. Thin clouds crossing a moon are the point; opaque ones are a
         wall. */
      const mat = L.glow
        ? new THREE.MeshBasicMaterial(Object.assign(
            { transparent: true, opacity: L.alpha != null ? L.alpha : 0.85 }, matOpts))
        : new THREE.MeshLambertMaterial(matOpts);

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

      report.layers.push({
        kind: L.kind, d: d, k: +k.toFixed(3), n: o.boxes.length + o.shards.length,
        dropped: beforeWindow - o.boxes.length,
        col: '#' + col.getHexString(), glow: !!L.glow, tex: useTex ? (L.tex || rec.tex || 'granite') : '',
        texRep: texRep, mean: +meanSize.toFixed(3), solo: !!L.solo
      });

      report.window += beforeWindow - o.boxes.length;

      const sway = SWAY_KINDS[L.kind];
      if (sway && !L.solo) {
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
       once it has receded -- and it now runs PAST the sky, because a roof that
       stops short shows a stripe of daylight past its own end, which reads as a
       hole in the level. */
    if (rec.ceiling) {
      const c = rec.ceiling;
      const cmat = new THREE.MeshLambertMaterial({ color: mixHex(c.col, hazeHex, 0.14) });
      const cg = new THREE.Group();
      cg.position.y = anchorY;
      const depth = GROUND_D + 46;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(WU * 1.6, 2.0, depth), cmat);
      slab.position.set(WU * 0.5, c.y + 1.0, -depth * 0.5 + 2);
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

    /* The shafts, for the two themes whose body is a hole in the roof. */
    if (hon.kind === 'shaft') {
      buildShafts(group, hon, WU, anchorY, rec.ceiling ? rec.ceiling.y : null, rng);
    }

    if (rec.mist) { const m = backdropMotes(rec.mist, WU, anchorY, rng); m.frustumCulled = false; group.add(m); }
    if (rec.ember) { const m = backdropMotes(rec.ember, WU, anchorY, rng); m.frustumCulled = false; group.add(m); }

    /* Living silhouettes belong to a sky. An underground theme has a roof over
       its head (rec.ceiling), so it keeps the drifting air instead and gets no
       flock -- birds under a stone ceiling would be the one thing that breaks
       the read of the room. */
    if (!rec.ceiling) buildSkyLife(group, rec, WU, anchorY, rng);

    /* Where the body IS, read off the object that was just built rather than
       re-derived from the same arithmetic that placed it: the QA projects this
       point onto the screen and then measures the pixels around it, so a report
       that drifts from the picture does not fail -- it passes, against the wrong
       patch of sky, which is exactly what happened for the whole of v5.2.2's
       testing. One getWorldPosition() and the two can never disagree again. */
    group.updateMatrixWorld(true);
    const heroWorld = new THREE.Vector3();
    heroBuilt.group.getWorldPosition(heroWorld);
    report.hero = {
      kind: hon.kind, col: '#' + hon.col.toString(16).padStart(6, '0'),
      az: hon.az, elev: heroObj.elev, r: heroObj.r,
      /* Absolute height when the body is anchored to the room (see above); the
         QA projects from this. The sky version has no fixed height at all -- it
         is measured from the camera every frame -- and reports null. */
      z: heroWorld.z,
      worldX: heroWorld.x,
      worldY: inRoom ? heroWorld.y : null,
      room: inRoom,
      clamped: heroObj.r !== hon.r || heroObj.elev !== hon.elev,
      glow: heroObj.glow != null ? heroObj.glow : 0.14
    };
    lastReport = report;
    return { group: group, skyRig: skyRig, hero: heroRef, report: report };
  }

  /* One step of every backdrop motion. Called once a frame with the render
     clock so the horizon keeps its own time (the bands are not simulated). */
  function update(time, dt) {
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

    /* The body. A sun's rays turn, a moon's halo breathes, a caldera's smoke
       leans, the aurora drifts: four numbers, and the sky stops being a still
       image behind a game. Nothing here writes to a light or a material's
       `needsUpdate`, so none of it can cost a shader rebuild. */
    if (heroRef) {
      if (heroRef.rays) heroRef.rays.rotation.z = time * 0.045;
      for (let i = 0; i < heroRef.halos.length; i++) {
        const h = heroRef.halos[i];
        h.material.opacity = (i === 0 ? 0.34 : 0.17)
          * (1 + Math.sin(time * 0.5 + i * 0.9) * 0.10);
      }
      if (heroRef.glow) {
        const base = heroRef.glowBase != null ? heroRef.glowBase : heroRef.glow.material.opacity;
        heroRef.glowBase = base;
        heroRef.glow.material.opacity = base * (1 + Math.sin(time * 0.23) * 0.08);
      }
      if (heroRef.plume) {
        heroRef.plume.position.x = Math.sin(time * 0.19) * 1.6;
        heroRef.plume.rotation.z = Math.sin(time * 0.13) * 0.05;
      }
    }
    for (let i = 0; i < backdropSway.length; i++) {
      const s = backdropSway[i];
      if (s.obj.userData && s.obj.userData.aurora) {
        s.obj.rotation.z = Math.sin(time * s.obj.userData.aurora.sway * 0.1
          + s.obj.userData.aurora.ph) * 0.02;
      }
    }
  }

  DS.Backdrop = {
    build: build,
    update: update,
    recipe: function (name) { return RECIPE[name] || RECIPE.forest; },
    hero: function (name) { return HEROES[name] || HEROES.forest; },
    /* The body a theme will ACTUALLY get: authored radius trimmed to the room it
       hangs in, elevation pinned inside what is left. The structural QA check
       runs against this rather than against the wish, because the wish is not
       what gets built. */
    heroFit: function (name) {
      return fitRoomHero(HEROES[name] || HEROES.forest, RECIPE[name] || RECIPE.forest);
    },
    curve: function (name) { return CURVE[name] || { gain: DEFAULT_GAIN, warm: 0.18 }; },
    heroLight: heroLight,
    themeNames: function () { return Object.keys(RECIPE); },
    rungs: RUNGS,
    groundD: GROUND_D,
    skyZ: SKY_Z,
    skyH: SKY_H,
    skyDrop: SKY_DROP,
    texAt: TEX_AT,
    families: TEX_FAMILIES,
    kinds: BACKDROP_KINDS,
    get report() { return lastReport; },
    /* Shared with the renderer: the water batches build their own instanced
       boxes and must not grow a second copy of the same helper. */
    instancedBoxes: instancedBoxes,
    instancedShards: instancedShards
  };

})(window.DS);
