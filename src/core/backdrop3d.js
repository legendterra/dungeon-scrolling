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
     heroInfo()                            // where the light IS, this frame
     recipe(name) / hero(name) / curve(name) / rungs()
     heroLight(name, yaw)                  // where the far light comes FROM

   `report` is the introspection half: the resolved hero position, every layer's
   final colour, its texel repeat and its instance count. The QA pass reads that
   instead of guessing, which is what makes the checks in tools/qa/audit-backdrop
   possible at all.

   --- v7: the horizon stands still ---

   The backdrop no longer follows the hero. It is built once per floor to FILL
   what the camera can ever see on that floor (src/core/worldframe.js), and then
   it stands in world space while the rig moves through it: nothing is locked,
   nothing drifts to catch up, nothing is lowered when the eye gets close.
   Rules the QA holds (tools/qa/audit-backdrop.js):
     - no mesh in front of FRONT_Z, so nothing can cross the play plane;
     - a roof is never lower than the highest the eye reaches plus ROOF_CLEAR,
       and whatever hangs from it is anchored TO it (no floating teeth);
     - the ground carries on below its own line, so a floor that dips under its
       horizon looks at the face of the ground and not at the void.

   --- v6: the backlit side-scroller horizon ---

   The brief, in the player's own words: the background should be the light,
   and the camera should be looking INTO it. That is the classic anime
   side-scroller shot -- the hero walks left to right in front of three
   mountains in a row, each paler than the last, all of them dark against a
   low sun, with a bright line along every ridge where the light wraps round.

   1. THE LIGHT IS AHEAD. Every theme's body now rides the camera: the sky rig
      (and a room's light rig) follows the camera's aim across the floor every
      frame, so the sun, the moon, the furnace mouth or the sigil hangs low and
      roughly centred in front of the eye, BEHIND the whole stage. Something at
      infinity does not scroll, and a light you have walked away from is not the
      light of the scene. heroInfo() hands the renderer that body's live world
      position, colour and strength, so its one back light and its god rays come
      from the thing on screen.

   2. BACKLIT BANDS. Every Lambert band carries a RIM: a few lines of vertex
      shader that light the faces turned toward the body (and the tops, which a
      low light wraps over) in the body's colour, strongest on the grazing faces.
      It rides the material's own emissive slot, so it costs no lamp, no uniform
      and no second pass -- the black-screen rule in (2) of v5.2.2 still holds:
      the scene's light count never moves. The haze each band fades into is
      tinted by the body more with every rung, the sky brightens in a wide glow
      around it, and a fan of soft additive shafts spreads out of it.

   3. SET PIECES. The vocabulary grew from rocks and trees to places: multi-peak
      mountains with snow and strata, mesas, waterfalls that fall (a scrolling
      additive strip and a plume of mist), sea stacks, pines and broadleaf
      woods, ruins, crystal spires, volcanoes with lava running down the steps,
      floating islands and castles with lit windows. Each is still boxes, cones
      and octahedra in ONE instanced batch per band -- plus one additive batch
      for whatever in the band glows -- and each box now carries a TONE (base,
      shadow, lit, cap, accent), so snow, strata, trunks and foliage share a
      batch instead of costing one each.

   4. WATER. A theme may lay a sheet of water (or lava) over the far ground: it
      reflects the sky's own horizon value, shimmers, and carries a glitter
      path under the body that follows it across the floor.

   5. VARIANTS. A theme is no longer one picture. Recipes carry variants picked
      by the act (the drowned deep and the burning crown reuse the same thirteen
      themes) and by the depth, so two floors of the same theme in a row do not
      show the same horizon.

   6. DRAW CALLS. The flock is one batch, the shafts are one batch, the aurora
      is one batch; the whole horizon is budgeted at about forty draws and the
      report counts them (report.draws), so the budget is a number the QA holds,
      not a hope.
*/
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;

  /* --- the depth ladder -----------------------------------------------------

     Every rung is authored at ONE size (the same shapes, the same heights) and
     the builder scales a band by (camDist + d) / (camDist + REF_D), so moving
     a band further out grows it in world units while it keeps its size on
     screen. Screen size is therefore authored, and only the PARALLAX changes
     when a rung moves -- which is the knob this file exists to turn.

     camDist is read off the LIVE camera rig at build time (DS.R3D.rig.dist):
     the action preset sits at 18 units, the older side-on shot at 26, and a
     ladder solved for the wrong one comes out a fifth too small at its far end.
     The rig's dynamic zoom breathes around that value (+-15%) and the ladder is
     deliberately not rebuilt for it: the breathing IS the parallax. */
  const RUNGS = [4.5, 7.5, 12, 19, 30, 46, 68];
  const REF_D = RUNGS[0];
  const GROUND_D = 130;       // how far the flat ground runs before the sky
  const SKY_Z = -150;         // the sky plane, behind the far ground edge
  const SKY_H = 240;          // sky plane height, in world units
  const SKY_DROP = 64;        // sky extends this far below the eye line
  const CAM_DIST = 26;        // fallback when there is no live rig to read
  const CLOUD_DRIFT = 0.55;
  const TEX_AT = 19;          // rungs at or nearer than this carry a texture
  const ROOM_HERO_D = -58;    // where a body hangs in a ROOFED room (see build)
  const SKY_HERO_SPAN = 36;   // how far `az` moves a sky body off the aim, units
  const ROOM_HERO_SPAN = 14;  // the same for a room's light
  const EYE_ABOVE = 4.8;      // the action rig's eye over the ground line, units
  /* v7: nothing of the backdrop may stand in front of this depth. The tiles
     occupy z -0.75..+1.08 and bodies stand at 0.3; a backdrop mesh nearer than
     FRONT_Z can cross the play plane and show up as a slab over the hero. */
  const FRONT_Z = -1.6;
  const ROOF_CLEAR = 3.0;     // a roof stays this far over the highest the eye ever gets
  /* Where the sky's colour stops sit, in units over the eye line (the plane
     itself grows with the floor: see the sky rig in build). Taken from the
     v6 gradient so the shipped look is unchanged. */
  const SKY_MID_U = 79;
  const SKY_LOW_U = 21;
  const SKY_HAZE_U = -3;
  const DEFAULT_GAIN = 0.30;  // sky value for a theme without a curve row
  const DEFAULT_FOG = 0.008;  // the renderer's FogExp2 density, for unfog()
  const FOG_LIFT_MAX = 5.0;   // how far a colour may be lifted against the fog
  const DRAW_BUDGET = 40;     // what the whole horizon may cost, in draws

  /* --- the light curve ------------------------------------------------------

     One number used to scale every sky: SKY_GAIN 0.28, night, for all thirteen
     themes. That is why no floor looked like its own place -- a beach at dawn
     and a caldera were mixed to the same value.

     The run now has a light curve. It opens bright on the shore, closes down as
     the cave mouth swallows the sky, and each dark rung carries its OWN light
     (a furnace, a sigil, a drowned sun). The climb reopens it widest of all, the
     sunk halls close to almost nothing, and the last two rungs are lit from
     below and from gold: the run ends brighter than the cave it went through.
     `warm` is how much of the body's colour the haze takes: the backlit look
     is a sky that belongs to its light. */
  const CURVE = {
    shore:    { gain: 0.58, warm: 0.40 },
    cave:     { gain: 0.30, warm: 0.26 },
    prison:   { gain: 0.28, warm: 0.28 },
    vault:    { gain: 0.32, warm: 0.28 },
    swamp:    { gain: 0.42, warm: 0.34 },
    mountain: { gain: 0.62, warm: 0.26 },
    flooded:  { gain: 0.36, warm: 0.30 },
    volcanic: { gain: 0.40, warm: 0.42 },
    throne:   { gain: 0.46, warm: 0.32 },
    /* The four themes the first act never reaches directly (the drowned deep
       reaches `caves` and `nest`; the trial flavour reaches `trial`). */
    forest:   { gain: 0.40, warm: 0.26 },
    caves:    { gain: 0.28, warm: 0.26 },
    nest:     { gain: 0.30, warm: 0.28 },
    trial:    { gain: 0.36, warm: 0.36 }
  };

  /* --- the body each theme hangs its light on ---------------------------------

     A hero is: a DISC (voxel-stepped, always visible), up to three HALOS, a fan
     of RAYS, a FAN of soft shafts, a BLOOM, an optional RING, and a GLOW WALL
     that floods the horizon behind it.

     `az`   where it hangs across the VIEW (0..1, 0.5 = straight ahead): the
            body rides the camera, so this is an offset from the aim, not a
            fraction of the floor any more
     `elev` world units above the eye line (open sky) or the floor line (room)
     `r`    the disc's radius, in world units at the body's distance
     `glow` the glow wall's alpha -- how much sky the body owns
     `gain` how far the back light leans toward this body (0 = ignore it)
     `fan`  how many soft shafts spread out of it

     Open skies hang the body LOW: just over the far ridges, so the last rank of
     mountains cuts into its lower edge and every ridge in front of it is a
     silhouette. A body high in the sky lights nothing the player looks at.

     An underground theme's body is the far end of the room: a smaller disc
     hung just ABOVE the eye line, so the near colonnades pass under it and the
     far ones stand across it. fitRoomHero() still sizes it: a light under a
     stone roof has to fit under the roof AND above the floor, so a room's `r`
     and `elev` are WISHES that the fit trims to the room it is actually in. */
  const HEROES = {
    /* The shore opens the run: a dawn sun sitting on the sea. */
    shore:    { kind: 'sun', col: 0xffa860, core: 0xfff0d0, edge: 0xe06a20,
                az: 0.46, elev: 7.4, r: 6.8, halos: [1.5, 2.6], rays: 14, fan: 14,
                glow: 0.40, gain: 1.00 },
    /* Under the cave's roof: the mouth's daylight at the far end, and the
       shafts that come down through the cracks on the way to it. */
    cave:     { kind: 'shaft', col: 0x7eecd8, core: 0xe0fff8, edge: 0xffd9a0,
                az: 0.50, elev: 6.2, r: 3.2, halos: [1.7, 3.0], shafts: 3, fan: 10,
                glow: 0.30, gain: 0.80 },
    /* The torch hall: a forge mouth at the far end of the colonnade. */
    prison:   { kind: 'furnace', col: 0xfb923c, core: 0xffe0b0, edge: 0xc24a10,
                az: 0.46, elev: 6.2, r: 3.2, halos: [1.6, 2.8], rays: 10, fan: 10,
                glow: 0.34, gain: 0.92 },
    /* The waystation: an arcane sigil, a portal standing open. */
    vault:    { kind: 'sigil', col: 0x9a76f0, core: 0xece2ff, edge: 0x4b2f9a,
                az: 0.54, elev: 6.2, r: 3.2, halos: [1.6, 2.8], ring: true, fan: 12,
                glow: 0.30, gain: 0.88 },
    /* The swamp: a sun that never finished setting, sunk in the fen haze. */
    swamp:    { kind: 'drowned', col: 0xd8e07a, core: 0xfbffd8, edge: 0x7a8a2c,
                az: 0.44, elev: 7.0, r: 6.6, halos: [1.6, 2.8], rays: 12, fan: 12,
                glow: 0.36, gain: 0.90 },
    /* The climb: a huge cold moon behind the ranges, and an aurora over it. */
    mountain: { kind: 'moon', col: 0xdceaff, core: 0xffffff, edge: 0x8fa8d0,
                az: 0.42, elev: 8.6, r: 7.0, halos: [1.5, 2.5], aurora: true, fan: 10,
                glow: 0.34, gain: 1.00 },
    /* The sunk halls: a drowned city under a low green-white moon. */
    flooded:  { kind: 'moon', col: 0x9fe4ff, core: 0xf0fcff, edge: 0x2f7ea0,
                az: 0.52, elev: 7.2, r: 6.2, halos: [1.6, 2.8], fan: 12,
                glow: 0.34, gain: 0.86 },
    /* The ash reaches: a swollen red sun sinking into the smoke. */
    volcanic: { kind: 'dome', col: 0xff6a2c, core: 0xffd9a0, edge: 0xa02408,
                az: 0.50, elev: 7.8, r: 7.2, halos: [1.5, 2.6], rays: 12, fan: 14,
                glow: 0.42, gain: 1.00 },
    /* The throne: gold, the great window behind the dais. */
    throne:   { kind: 'crown', col: 0xfde047, core: 0xfff8d0, edge: 0xc08a10,
                az: 0.50, elev: 6.2, r: 3.2, halos: [1.5, 2.6], rays: 18, ring: true, fan: 14,
                glow: 0.36, gain: 1.00 },

    forest:   { kind: 'moon', col: 0xfff0cc, core: 0xffffff, edge: 0xb8a878,
                az: 0.40, elev: 8.0, r: 6.4, halos: [1.5, 2.5], rays: 10, fan: 10,
                glow: 0.32, gain: 0.90 },
    caves:    { kind: 'sigil', col: 0x5eead4, core: 0xd8fff6, edge: 0x1f7a6a,
                az: 0.48, elev: 6.2, r: 3.2, halos: [1.7, 3.0], ring: true, fan: 10,
                glow: 0.28, gain: 0.82 },
    /* A blood moon rising at the far end of the nest's gallery. */
    nest:     { kind: 'moon', col: 0xf43f5e, core: 0xffd0d8, edge: 0x7a1024,
                az: 0.46, elev: 6.2, r: 3.2, halos: [1.6, 2.8], rays: 8, fan: 10,
                glow: 0.32, gain: 0.90 },
    /* The trial is outdoors: an eclipse over a plain of obelisks. */
    trial:    { kind: 'eclipse', col: 0xff8a6a, core: 0x2a0d12, edge: 0xffb08a,
                az: 0.50, elev: 7.6, r: 6.4, halos: [1.5, 2.6], ring: true, fan: 16,
                glow: 0.38, gain: 0.95 }
  };

  /* Which band kinds move. Bands used to SWAY by turning their whole group
     about its base, which for a band two hundred units wide swung the far end
     of it up and down by metres -- a range that breathes is a range that pops.
     What moves now moves as itself: a floating island bobs, a cloud drifts. */
  /* Which band kinds hang free of the ground (everything else is anchored to
     it, and a roofed theme's stalactites to its roof). The audit reads the
     anchor each layer group declares and measures it against the geometry. */
  const FREE_KINDS = { clouds: true, islands: true, cloudsea: true, hangcage: true, chandelier: true,
                       ghostlamps: true, stormcloud: true };

  const SWAY_KINDS = {
    islands: { spd: 0.30, bob: 0.22 }
  };

  /* Which shard shape a kind emits. Crystals are octahedra, stalactites are
     cones hanging point-down, and a castle's roofs are cones standing up. */
  const SHARD_SHAPES = {
    crystals: 'octa', crystalspire: 'octa', castle: 'cone', stalactites: 'coneDown'
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

  /* v7: the photo-scan standing in for the family when the HD library has
     decoded (src/core/texlib.js), otherwise the procedural tile it always was.
     Either way the caller clones it and sets its own repeat. */
  function hdOn() {
    return !!(DS.TexLib && DS.TexLib.hd && DS.TexLib.ready);
  }

  function bandTexture(family) {
    const key = family || 'granite';
    if (hdOn()) {
      const hd = DS.TexLib.forFamily(key);
      if (hd) return hd;
    }
    if (!texCache[key]) texCache[key] = makeBandTexture(key);
    return texCache[key];
  }

  /* --- the vocabulary a recipe is written in ---------------------------------

     Each builder is handed the layer's lists, an x along the map's width, a
     seeded rng and its own layer entry, and writes y from the GROUND LINE UP --
     the band's own base is zero, not the map's bottom row -- which is what lets
     one builder scale a whole band up for the far rungs without the base sliding
     off. Everything it emits is a BOX, a CONE or an OCTAHEDRON (o.boxes and
     o.shards, one lit batch) or a GLOW box (o.glow, one additive batch: lava,
     falling water, lit windows), so a whole band collapses into at most three
     InstancedMeshes.

     The last slot of a box is its TONE, an index into the band's palette:

       0 base      the band's own colour
       1 shadow    a darker cut of it: strata, the shaded step, a trunk in shade
       2 lit       a lighter cut: a ledge catching the light
       3 cap       the band's `cap` colour: snow, grass on a floating island
       4 accent    the band's `accent` colour: a trunk under foliage

     and for a glow box, a brightness step (0 full, 1 half, 2 a quarter), which
     under additive blending is the same thing as an opacity. */
  function box(list, x, y, z, sx, sy, sz, rz, ry, tone) {
    list.push([x, y, z, sx, sy, sz, rz || 0, ry || 0, tone || 0]);
  }

  /* Base or shadow, on a coin toss: breaks up a repeated shape. */
  function coinTone(rng) { return rng.chance(0.5) ? 0 : 1; }

  /* --- ridgelines --------------------------------------------------------------

     A far range used to be a stack of horizontal slices, each a little narrower
     than the one under it. However the slices were jittered, the eye read the
     STACK: every range on the horizon was a stepped pyramid. A real skyline is
     a line first -- peaks, saddles between them, a cliff where a flank broke
     off -- and the voxel look comes from how that line is sampled.

     So a range is built in two steps. ridgeProfile() writes a height for every
     column across the range: a handful of peaks of different heights, widths
     and lean (each flank has its own fall-off, so no peak is symmetric), summed
     by max so the saddles fall where the flanks meet, then roughened by a
     per-column jitter and the odd notch or cliff drop. ridgeColumns() then
     stands one box per column on the ground line, the column widths themselves
     jittered so the steps are uneven, and dresses each column from its own
     slope: the face turned from the light takes the shadow tone, strata run
     across the front at a gentle tilt (only where the rock is tall enough to
     hold them), snow lies thick where the ridge is flat and thin or not at all
     where it is steep, and at a cliff edge the upper column sometimes throws
     an overhang out over the drop. Still boxes, still one instanced batch. */

  /* How many columns a range is cut into, before width jitter. Enough that a
     peak reads as a slope, few enough that a band of forty ranges stays a few
     thousand instances. */
  const RIDGE_COLS = 22;

  /* peaks: [{ x, h, wl, wr, p }] -- a centre, a height, a reach down each flank
     and a flank exponent (above 1 is concave: a steep crown over wide skirts). */
  function ridgeHeight(peaks, px) {
    let h = 0;
    for (let i = 0; i < peaks.length; i++) {
      const P = peaks[i];
      const dx = px - P.x;
      const reach = dx < 0 ? P.wl : P.wr;
      const t = 1 - Math.abs(dx) / reach;
      if (t > 0) h = Math.max(h, P.h * Math.pow(t, P.p));
    }
    return h;
  }

  /* The columns of one range, left to right: { cx, w, h }. `W` is the range's
     full width, `peaks` its crowns, `rough` the per-column jitter as a fraction
     of H, `crag` the chance a column is notched or broken into a cliff. */
  function ridgeProfile(x, H, W, peaks, rng, rough, crag) {
    const cols = [];
    const base = W / RIDGE_COLS;
    let lx = x - W * 0.5;
    const end = x + W * 0.5;
    let drop = 0;                      // a cliff carries on for a column or two
    while (lx < end - base * 0.3) {
      const w = Math.min(base * rng.float(0.55, 1.5), end - lx);
      const cx = lx + w * 0.5;
      const smooth = ridgeHeight(peaks, cx);
      let h = smooth + rng.float(-rough, rough) * H;
      if (drop > 0) { h -= H * 0.07 * drop; drop--; }
      else if (rng.chance(crag)) {
        if (rng.chance(0.5)) h -= H * rng.float(0.04, 0.08);           // a notch
        else drop = rng.int(1, 2);                                     // a cliff
      }
      /* `s` is the slope of the UNROUGHENED line: which way this column faces
         is a property of the mountain, not of one column's jitter. */
      const s = ridgeHeight(peaks, cx + w * 0.5) - ridgeHeight(peaks, cx - w * 0.5);
      if (h > H * 0.05) cols.push({ cx: cx, w: w, h: h, s: s });
      lx += w;
    }
    return cols;
  }

  /* Dress a profile. opts:
       snow      lay snow by slope above the snow line
       strata    run tilted bands of the other tone across the front faces
       lightDir  -1 or 1: which way the lit faces look (the other side shades)
       depth     the range's thickness, as a fraction of H
       over      the chance an overhang is thrown out over a cliff
       z0        pin every column to one depth (for glow laid on the faces) */
  function ridgeColumns(o, cols, H, rng, L, opts) {
    const n = cols.length;
    if (!n) return;
    const lightDir = opts.lightDir || -1;
    const tilt = rng.float(-0.08, 0.08);
    const snowLine = H * rng.float(0.56, 0.7);
    const bandH = H * rng.float(0.035, 0.05);
    const fixedZ = opts.z0 != null;
    const z0 = fixedZ ? opts.z0 : rng.float(-0.15, 0.15);
    for (let i = 0; i < n; i++) {
      const c = cols[i];
      const hl = i > 0 ? cols[i - 1].h : 0;
      const hr = i < n - 1 ? cols[i + 1].h : 0;
      /* Slope in the direction of the light: positive when this column faces
         it (the ground rises away from the light toward the crown). */
      const slope = (c.s != null ? c.s : hr - hl) * -lightDir;
      const shaded = slope < -H * 0.02;
      const d = H * (opts.depth || 0.45) * (0.7 + 0.3 * c.h / H);
      const z = fixedZ ? z0 : z0 + rng.float(-0.02, 0.02);
      box(o.boxes, c.cx, c.h * 0.5, z, c.w * 1.02, c.h, d, 0, 0, shaded ? 1 : 0);

      /* Strata: thin slabs on the front face at shared, tilted heights, so the
         bands carry across columns and read as bedding, not as steps. */
      if (opts.strata) {
        let k = 0;
        for (let y = H * 0.2; y < c.h - H * 0.08 && k < 2; y += H * 0.19, k++) {
          const yy = y + (c.cx - cols[0].cx) * tilt;
          if (yy <= bandH || yy > c.h - H * 0.06 || rng.chance(0.15)) continue;
          box(o.boxes, c.cx, yy, z + d * 0.5 + 0.02, c.w * 1.03, bandH, 0.05, 0, 0, shaded ? 0 : 1);
        }
      }

      /* Snow by slope: a flat crest holds a deep cap that spills down both
         faces, a steep flank holds a thin lip, a crag holds none. */
      if (opts.snow && c.h > snowLine) {
        const steep = Math.min(1, Math.max(Math.abs(c.h - hl), Math.abs(c.h - hr)) / (H * 0.22));
        if (steep < 0.9 || rng.chance(0.3)) {
          const t = H * (0.03 + 0.1 * (1 - steep)) * (0.6 + 0.4 * (c.h - snowLine) / (H - snowLine + 1e-3));
          box(o.boxes, c.cx, c.h - t * 0.5 + H * 0.01, z, c.w * 1.05, t, d * 1.03, 0, 0, 3);
        }
      } else if (rng.chance(0.08)) {
        /* A tooth of rock on the crest: breaks a line that jitter alone keeps
           too tidy. */
        box(o.boxes, c.cx + rng.float(-0.2, 0.2) * c.w, c.h + H * 0.025, z,
            c.w * rng.float(0.35, 0.6), H * rng.float(0.03, 0.06), d * 0.5, 0, 0, shaded ? 1 : 0);
      }

      /* An overhang: where the next column falls away hard, the top of this
         one juts out over the drop. */
      const fall = Math.max(c.h - hl, c.h - hr);
      if (fall > H * 0.16 && rng.chance(opts.over || 0)) {
        const side = (c.h - hr) >= (c.h - hl) ? 1 : -1;
        const oh = H * rng.float(0.04, 0.07);
        box(o.boxes, c.cx + side * c.w * 0.55, c.h - oh * 0.5, z, c.w * rng.float(0.35, 0.6), oh, d * 0.7,
            0, 0, opts.snow && c.h > snowLine ? 3 : 1);
      }
    }
  }

  /* Where a dressed column's front face is (for glow or bedding laid on it). */
  function ridgeFront(c, H, depth, z0) {
    return z0 + H * depth * (0.7 + 0.3 * c.h / H) * 0.5;
  }

  /* One butte: a level top on a hard cap that overhangs its own cliffs, a
     broken step down each side and a talus at the foot, the bedding straight
     across the whole face. */
  function mesaBlock(o, x, h, w, rng) {
    const cols = [];
    const base = w / 12;
    let lx = x - w * 0.5;
    const end = x + w * 0.5;
    let top0 = Infinity, top1 = -Infinity;
    while (lx < end - base * 0.3) {
      const cw = Math.min(base * rng.float(0.6, 1.4), end - lx);
      const cx = lx + cw * 0.5;
      const u = Math.abs(cx - x) / (w * 0.5);
      let ch;
      if (u < 0.7) {
        ch = h * (rng.chance(0.12) ? rng.float(0.86, 0.93) : rng.float(0.97, 1.0));
        top0 = Math.min(top0, lx); top1 = Math.max(top1, lx + cw);
      } else if (u < 0.86) ch = h * rng.float(0.5, 0.78);
      else ch = h * rng.float(0.14, 0.32);
      cols.push({ cx: cx, w: cw, h: ch });
      lx += cw;
    }
    const z0 = rng.float(-0.1, 0.1);
    ridgeColumns(o, cols, h, rng, {}, { strata: false, lightDir: -1, depth: 0.5, over: 0.5, z0: z0 });
    if (!(top1 > top0)) return;
    const pw = top1 - top0, px = (top0 + top1) * 0.5;
    const front = z0 + h * 0.5 * 0.5 + 0.03;
    /* The cap: wider than the rock under it, lit along its lip. */
    const lip = pw * rng.float(0.04, 0.08);
    box(o.boxes, px + rng.float(-0.5, 0.5) * lip, h * 0.985, z0, pw + lip * 2, h * 0.07, h * 0.52, 0, 0, 2);
    /* Bedding: straight, full width, a little uneven in thickness. */
    for (let y = h * 0.2; y < h * 0.84; y += h * rng.float(0.15, 0.2)) {
      box(o.boxes, px, y, front, pw * rng.float(0.94, 1.0), h * rng.float(0.03, 0.05), 0.05, 0, 0, 1);
    }
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
        // The bottom course always stands: a wall that starts in mid-air is the
        // one gap a mortar-loss joke cannot excuse (the audit's ground anchor).
        if (r > 0 && rng.chance(0.22)) continue;
        const y = 0.45 + r * 1.0;
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
      /* v7: with `roof` the tooth is ANCHORED to the roof line (root a hair
         inside it), and only its length varies; without it the old free hang. */
      const anchored = L.roof != null;
      const top = anchored ? L.roof + 0.1 : (L.top || 8.5) + rng.float(-1.2, 1.2);
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
    },

    /* --- v6 set pieces -------------------------------------------------------

       Composed shapes that tile. Each one is a PLACE at a glance -- a range, a
       butte, a fall of water, a wood -- and each still stands on its own ground
       line so the far rungs can scale it without lifting it off the floor. */

    /* A range: one ridgeline with a main crown, two to four lesser peaks and
       the saddles between them (see ridgeProfile). Ranked across the far rungs
       this is the "three ranges in a row" shot: each rank taller on screen than
       the one in front, so every rank shows. */
    mountains: function (o, x, rng, L) {
      const H = rng.float(L.h0 || 2.2, L.h1 || 3.6);
      const W = H * rng.float(2.9, 3.9);
      const peaks = [{ x: x + rng.float(-0.12, 0.12) * W, h: H,
                       wl: W * rng.float(0.3, 0.5), wr: W * rng.float(0.3, 0.5), p: rng.float(1.0, 1.4) }];
      const extra = rng.int(2, 4);
      for (let k = 0; k < extra; k++) {
        peaks.push({ x: x + rng.float(-0.42, 0.42) * W, h: H * rng.float(0.42, 0.84),
                     wl: W * rng.float(0.14, 0.3), wr: W * rng.float(0.14, 0.3), p: rng.float(0.9, 1.5) });
      }
      const cols = ridgeProfile(x, H, W, peaks, rng, 0.022, 0.05);
      ridgeColumns(o, cols, H, rng, L, { snow: !!L.snow, strata: true, lightDir: -1, depth: 0.45, over: 0.35 });
    },
    /* A mesa: a flat-topped butte in banded rock. The cap is one hard layer, so
       it holds a level top (eroded here and there) and overhangs the softer
       rock under it; the flanks fall as cliffs to a talus; the bedding runs
       straight across the whole face. Often a smaller butte beside it. */
    mesa: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 1.6, L.h1 || 2.8);
      const w = h * rng.float(1.5, 2.4);
      mesaBlock(o, x, h, w, rng);
      if (rng.chance(0.5)) {
        const h2 = h * rng.float(0.45, 0.7), w2 = h2 * rng.float(0.9, 1.5);
        mesaBlock(o, x + (rng.chance(0.5) ? 1 : -1) * (w * 0.5 + w2 * 0.6), h2, w2, rng);
      }
    },
    /* A waterfall: a notched cliff with a sheet of water in the notch (a glow
       strip; its texture scrolls in update(), which is what makes it FALL) and
       a plume of mist where it lands. `glowCol` makes it lava. */
    waterfall: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 3, L.h1 || 5);
      const cw = h * rng.float(0.9, 1.3);
      box(o.boxes, x - cw * 0.42, h * 0.5, 0, cw * 0.5, h, cw * 0.45, 0, 0, 0);
      box(o.boxes, x + cw * 0.42, h * 0.46, 0, cw * 0.5, h * 0.92, cw * 0.45, 0, 0, 1);
      box(o.boxes, x, h * 0.47, -cw * 0.12, cw * 0.42, h * 0.94, cw * 0.28, 0, 0, 1);
      box(o.boxes, x, h * 0.96, 0, cw * 1.3, h * 0.08, cw * 0.5, 0, 0, 2);
      box(o.boxes, x + cw * 0.9, h * 0.2, -0.2, cw * 0.5, h * 0.4, cw * 0.4, 0, 0, 1);
      const fw = cw * 0.24;
      box(o.glow, x, h * 0.47, cw * 0.1, fw, h * 0.94, 0.08, 0, 0, 1);
      box(o.glow, x, h * 0.47, cw * 0.12, fw * 0.55, h * 0.94, 0.06, 0, 0, 0);
      box(o.glow, x, 0.22, cw * 0.18, fw * 3.2, 0.44, cw * 0.3, 0, 0, 2);
      box(o.glow, x, 0.55, cw * 0.22, fw * 2.0, 0.9, 0.2, 0, 0, 2);
    },
    /* Sea stacks: one to three pillars of rock standing out of the water, with
       a pale line of foam where each one meets it (`foam`: only on water). */
    islets: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 1.2, L.h1 || 2.6);
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const px = x + (i ? rng.float(-1.6, 1.6) * h * 0.6 : 0);
        const ph = i ? h * rng.float(0.35, 0.7) : h;
        const pw = ph * rng.float(0.4, 0.65);
        let cx = px;
        const sl = 5;
        for (let j = 0; j < sl; j++) {
          const s = (1 - j * 0.13) * rng.float(0.8, 1.1);
          cx += rng.float(-0.1, 0.1) * pw;
          box(o.boxes, cx, ph * (j + 0.5) / sl, 0, pw * s, ph / sl * 1.02, pw * 0.7 * s,
              0, rng.float(-0.25, 0.25), j % 2 ? 1 : 0);
        }
        if (L.cap != null) box(o.boxes, cx, ph + ph * 0.03, 0, pw * 0.5, ph * 0.06, pw * 0.45, 0, 0, 3);
        if (L.foam) box(o.glow, px, 0.04, 0.1, pw * 1.6, 0.06, pw * 1.1, 0, 0, 2);
      }
    },
    /* A conifer, or a small stand of them: a trunk and four tiers, alternating
       in value so the tree is a stack and not a spike; snow on each tier when
       the band asks for it. Base colour is the needles, accent the trunk. */
    pines: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 2.4, L.h1 || 4.2);
      const n = 1 + (rng.chance(0.55) ? 1 : 0) + (rng.chance(0.3) ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const px = x + (k ? rng.float(-1.5, 1.5) : 0);
        const ph = h * (k ? rng.float(0.6, 0.9) : 1);
        box(o.boxes, px, ph * 0.12, 0, ph * 0.07, ph * 0.24, ph * 0.07, 0, 0, 4);
        const tiers = 4;
        for (let i = 0; i < tiers; i++) {
          const t = i / tiers;
          const tw = ph * 0.44 * (1 - t * 0.7);
          const th = ph * 0.24;
          const y = ph * 0.2 + i * ph * 0.19 + th * 0.5;
          box(o.boxes, px, y, 0, tw, th, tw, 0, rng.float(-0.3, 0.3), i % 2 ? 1 : 0);
          if (L.snow) box(o.boxes, px, y + th * 0.5, 0, tw * 0.78, th * 0.16, tw * 0.78, 0, 0, 3);
        }
        box(o.boxes, px, ph * 1.02, 0, ph * 0.07, ph * 0.12, ph * 0.07, 0, 0, L.snow ? 3 : 0);
      }
    },
    /* A broadleaf tree: a trunk with one limb and a canopy of four to six
       blocks, the top ones lit. Base colour is the leaves, accent the wood. */
    broadleaf: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 2.4, L.h1 || 4.0);
      box(o.boxes, x, h * 0.3, 0, h * 0.08, h * 0.6, h * 0.08, rng.float(-0.05, 0.05), 0, 4);
      box(o.boxes, x + h * 0.12, h * 0.55, 0, h * 0.3, h * 0.05, h * 0.05, 0.5, 0, 4);
      /* The canopy is a dome of blocks: a wide lower tier in shade, a narrower
         upper tier, and one lit crown -- a tree, not a table top. */
      const cw = h * rng.float(0.5, 0.7);
      box(o.boxes, x, h * 0.66, 0, cw, h * 0.26, cw * 0.8, 0, rng.float(-0.3, 0.3), 1);
      box(o.boxes, x + rng.float(-0.12, 0.12) * h, h * 0.84, 0, cw * 0.72, h * 0.22, cw * 0.62, 0, rng.float(-0.3, 0.3), 0);
      box(o.boxes, x + rng.float(-0.1, 0.1) * h, h * 0.99, 0, cw * 0.42, h * 0.14, cw * 0.4, 0, 0, 2);
      const side = rng.chance(0.5) ? 1 : -1;
      box(o.boxes, x + side * cw * 0.55, h * 0.72, 0.05, cw * 0.36, h * 0.2, cw * 0.4, 0, 0, coinTone(rng));
    },
    /* Ruins: a broken colonnade -- plinths, drums, a capital on the ones that
       still stand, a lintel across two of them, and a drum in the grass. */
    ruins: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 2.2, L.h1 || 4.0);
      const cols = rng.int(2, 4);
      const gap = h * 0.45;
      const wd = h * 0.12;
      const tops = [];
      for (let i = 0; i < cols; i++) {
        const cx = x + (i - (cols - 1) / 2) * gap;
        const ch = h * (rng.chance(0.4) ? rng.float(0.3, 0.6) : rng.float(0.82, 1));
        box(o.boxes, cx, wd * 0.4, 0, wd * 1.7, wd * 0.8, wd * 1.7, 0, 0, 1);
        const drums = 3;
        for (let k = 0; k < drums; k++) {
          const dh = (ch - wd * 0.8) / drums;
          box(o.boxes, cx + rng.float(-0.03, 0.03) * h, wd * 0.8 + dh * (k + 0.5), 0,
              wd, dh * 0.98, wd, rng.float(-0.02, 0.02), rng.float(-0.2, 0.2), k % 2 ? 2 : 0);
        }
        if (ch > h * 0.8) box(o.boxes, cx, ch + wd * 0.2, 0, wd * 1.6, wd * 0.4, wd * 1.6, 0, 0, 2);
        tops.push({ x: cx, y: ch });
      }
      if (cols >= 2 && tops[0].y > h * 0.8 && tops[1].y > h * 0.8) {
        box(o.boxes, (tops[0].x + tops[1].x) * 0.5, Math.min(tops[0].y, tops[1].y) + wd * 0.65, 0,
            gap + wd * 1.6, wd * 0.5, wd * 1.4, rng.float(-0.05, 0.05), 0, 0);
      }
      box(o.boxes, x + rng.float(-1, 1) * h * 0.5, wd * 0.5, wd * 2, wd * 2.4, wd, wd, 0,
          rng.float(-1, 1), 1);
    },
    /* Crystal spires: tall octahedra in a cluster, one tall and two or three
       short. The band is a GLOW band (see its recipe), so they are the light. */
    crystalspire: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 2.4, L.h1 || 4.4);
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const sh = i === 0 ? h : h * rng.float(0.3, 0.65);
        const sx = sh * rng.float(0.18, 0.28);
        const px = x + (i ? rng.float(-1, 1) * h * 0.35 : 0);
        o.shards.push([px, sh * 0.42, rng.float(-0.3, 0.3), sx, sh, rng.float(0, 3.14), i % 2 ? 2 : 0]);
      }
    },
    /* A volcano: one concave cone (a steep crown over wide skirts) with a lean,
       often a parasitic cone on a flank, the crown broken into a crater with
       lava in it, and lava running down the front of the columns in
       stair-stepped rivulets -- a mountain that is on fire, not a pyramid. */
    volcano: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 2.4, L.h1 || 3.6);
      const w = h * rng.float(2.8, 3.6);
      const cx = x + rng.float(-0.08, 0.08) * w;
      const peaks = [{ x: cx, h: h * 1.12, wl: w * rng.float(0.42, 0.55), wr: w * rng.float(0.42, 0.55),
                       p: rng.float(1.5, 1.9) }];
      if (rng.chance(0.6)) {
        const side = rng.chance(0.5) ? 1 : -1;
        peaks.push({ x: cx + side * w * rng.float(0.2, 0.3), h: h * rng.float(0.32, 0.48),
                     wl: w * 0.13, wr: w * 0.13, p: 1.2 });
      }
      const craterW = w * rng.float(0.035, 0.05);
      const cols = ridgeProfile(x, h, w, peaks, rng, 0.02, 0.04).map(function (c) {
        const dx = Math.abs(c.cx - cx);
        const hh = dx < craterW ? h * rng.float(0.76, 0.82) : Math.min(c.h, h * rng.float(0.94, 1.0));
        return { cx: c.cx, w: c.w, h: hh };
      });
      if (!cols.length) return;
      const z0 = rng.float(-0.1, 0.1), depth = 0.42;
      ridgeColumns(o, cols, h, rng, L, { strata: true, lightDir: -1, depth: depth, over: 0.15, z0: z0 });
      box(o.glow, cx, h * 0.84, z0, craterW * 2.2, h * 0.07, h * 0.3, 0, 0, 0);
      /* Rivulets: from the crater's lip outward, one column at a time, each
         strip hung down the face of its column far enough to meet the next. */
      let start = 0;
      for (let i = 0; i < cols.length; i++) if (Math.abs(cols[i].cx - cx) < Math.abs(cols[start].cx - cx)) start = i;
      const rivers = rng.int(1, 2);
      let dir0 = 1;
      for (let r = 0; r < rivers; r++) {
        dir0 = r === 0 ? (rng.chance(0.5) ? 1 : -1) : -dir0;
        const dir = dir0;
        const run = rng.int(3, 7);
        let prev = cols[start].h;
        for (let j = 1; j <= run; j++) {
          const c = cols[start + dir * j];
          if (!c) break;
          const seg = Math.max(h * 0.09, prev - c.h + h * 0.05);
          box(o.glow, c.cx + rng.float(-0.15, 0.15) * c.w, c.h - seg * 0.5 + h * 0.01,
              ridgeFront(c, h, depth, z0) + 0.03, c.w * rng.float(0.2, 0.34), seg, 0.05, 0, 0, j < 3 ? 0 : 1);
          prev = c.h;
        }
      }
    },
    /* A floating island: an inverted stepped cone of rock with grass on top,
       sometimes a tree, sometimes a thread of water falling off its lip. */
    islands: function (o, x, rng, L) {
      const s = rng.float(L.s0 || 0.8, L.s1 || 1.5);
      const y = rng.float(L.y0 || 2.4, L.y1 || 3.4);
      for (let i = 0; i < 4; i++) {
        const sw = s * 2.2 * (1 - i * 0.24);
        const sh = s * 0.34;
        box(o.boxes, x + rng.float(-0.05, 0.05) * s, y - i * sh - sh * 0.5, 0,
            sw, sh * 1.02, sw * 0.6, 0, rng.float(-0.2, 0.2), i % 2 ? 1 : 0);
      }
      box(o.boxes, x, y + s * 0.05, 0, s * 2.3, s * 0.1, s * 1.36, 0, 0, 3);
      if (rng.chance(0.6)) {
        const tx = x + rng.float(-0.5, 0.5) * s;
        box(o.boxes, tx, y + s * 0.4, 0, s * 0.1, s * 0.7, s * 0.1, 0, 0, 4);
        box(o.boxes, tx, y + s * 0.85, 0, s * 0.6, s * 0.4, s * 0.5, 0, 0, 3);
      }
      if (rng.chance(0.35)) box(o.glow, x + s * 0.9, y - s * 1.3, s * 0.3, s * 0.12, s * 2.6, 0.05, 0, 0, 1);
    },
    /* A castle: a crenellated curtain wall, two or three towers with conical
       roofs, a keep, and a few lit windows (glow boxes) -- the one warm light
       a far silhouette may carry. */
    castle: function (o, x, rng, L) {
      const h = rng.float(L.h0 || 2.2, L.h1 || 3.2);
      const w = h * rng.float(2.2, 3.0);
      box(o.boxes, x, h * 0.2, 0, w, h * 0.4, h * 0.3, 0, 0, 1);
      const step = h * 0.18;
      const nc = Math.floor(w / step);
      for (let i = 0; i < nc; i += 2) {
        box(o.boxes, x - w * 0.5 + (i + 0.5) * step, h * 0.43, 0, step * 0.9, h * 0.06, h * 0.3, 0, 0, 1);
      }
      const towers = rng.int(2, 3);
      for (let i = 0; i < towers; i++) {
        const tx = x - w * 0.5 + w * (towers === 1 ? 0.5 : i / (towers - 1));
        const th = h * rng.float(0.55, 0.8);
        const tw = h * 0.2;
        box(o.boxes, tx, th * 0.5, 0.05, tw, th, tw, 0, 0, 0);
        o.shards.push([tx, th + tw * 0.55, 0.05, tw * 1.05, tw * 1.2, 0, 1]);
        if (rng.chance(0.7)) box(o.glow, tx, th * 0.72, tw * 0.5 + 0.02, tw * 0.22, tw * 0.3, 0.04, 0, 0, 0);
      }
      const kx = x + rng.float(-0.2, 0.2) * w;
      const kw = h * 0.36;
      box(o.boxes, kx, h * 0.5, -0.1, kw, h, kw, 0, 0, 0);
      box(o.boxes, kx, h + h * 0.04, -0.1, kw * 1.15, h * 0.08, kw * 1.15, 0, 0, 2);
      o.shards.push([kx, h + kw * 0.55, -0.1, kw * 0.75, kw * 1.3, 0, 1]);
      box(o.glow, kx - kw * 0.2, h * 0.7, kw * 0.5 - 0.08, kw * 0.14, kw * 0.22, 0.04, 0, 0, 0);
      box(o.glow, kx + kw * 0.2, h * 0.52, kw * 0.5 - 0.08, kw * 0.14, kw * 0.22, 0.04, 0, 0, 1);
    }
  };

  /* --- the recipes ----------------------------------------------------------

     `sp` is SPACING, not a count: how many world units apart two objects of this
     band sit, in REFERENCE units. A floor is 100-200 units long and the camera
     only ever sees about 14 of them, so a fixed count is a trap. Asking for
     spacing instead means every floor, long or short, gets the same density.

     HEIGHTS ARE A FRAMING BUDGET. The action rig looks 11 degrees down from
     4.8 units over the ground line, so the eye line sits a fifth of the way
     down the frame and the sky is a strip above it. In authored units (the
     band's own, before it is scaled up for its rung) the eye line and the top
     of the frame fall at about:

         rung      4.5   7.5   12    19    30    46    68
         horizon   4.8   4.2   3.5   2.9   2.3   1.7   1.3
         top       7.4   6.8   6.1   5.5   4.8   4.3   3.9

     so a far range authored at 2.4-3.4 rises two to three times as high above
     the horizon as a near one at 3.0-3.6 -- which is exactly what makes three
     ranks in a row all show, each one peeking over the one in front. A near
     band stays under about 4 so the far ranks and the light are not walled off.

     `scale` shrinks a landmark authored at the old camera's size into the new
     frame; `cap` and `accent` are the palette's tone 3 and 4 (see box());
     `glowCol` is what a band's glow boxes burn with (default: the body's own
     colour) and `flow` makes them fall (water, lava).

     `water` lays a sheet of water -- or lava -- over the ground from `d0` out
     to the sky, with a glitter path under the body.

     `variants` are alternative horizons for the same theme. `acts` limits a
     recipe (or a variant) to some acts, `when` matches the floor's own label
     (the Frost Caves are caves, but they are frozen), and among what is left
     the depth picks -- never the same one two floors running. A variant
     replaces whatever fields it names; its hero is merged over the theme's. */
  const RECIPE = {
    /* --- act I, and its echoes in the acts below it ------------------------ */

    /* 1 - The Shore. Dawn on the sea: the sun sits on the water, the stacks
       and the wreck stand black against it, and the headlands fade out behind. */
    shore: {
      tex: 'sand', skyGlow: 0.9, haze: 0.8, ground: 0x1b2730,
      stars: { sp: 3.0, size: 0.12, alpha: 0.3 },
      mist: { sp: 3.2, size: 0.26, alpha: 0.12, col: 0xffd9b0 },
      motes: { col: 0xffd9b0, size: 0.26, alpha: 0.4, rise: 0.2 },
      water: { d0: 10, col: 0x0c2130 },
      layers: [
        { kind: 'rubble',    sp: 2.6, d: 4.5, col: 0x2c2b28, s0: 0.25, s1: 0.9 },
        { kind: 'rubble',    sp: 3.2, d: 7.5, col: 0x2d3238, tex: 'wetrock', s0: 0.6, s1: 1.5 },
        { kind: 'islets', foam: true, foam: true,    sp: 6.5, d: 12,  col: 0x262d36, tex: 'wetrock', h0: 1.4, h1: 2.8 },
        { kind: 'islets', foam: true, foam: true,    sp: 8.0, d: 19,  col: 0x242c38, tex: 'wetrock', h0: 2.2, h1: 3.4, cap: 0x8fa070 },
        { kind: 'wreck',     solo: true, d: 30, col: 0x20283a, scale: 0.4 },
        { kind: 'mountains', sp: 11, d: 46,  col: 0x28324a, h0: 2.2, h1: 2.9 },
        { kind: 'mountains', sp: 9,  d: 68,  col: 0x2e3a54, h0: 2.3, h1: 2.9 }
      ],
      variants: [
        /* The same sea by moonlight, with a keep on the headland. */
        { name: 'moonlit',
          hero: { kind: 'moon', col: 0xcfe2ff, core: 0xffffff, edge: 0x7f9ac8,
                  rays: 0, elev: 8.0, r: 6.0, az: 0.54 },
          stars: { sp: 1.2, size: 0.13, alpha: 0.6 },
          mist: { sp: 3.2, size: 0.24, alpha: 0.12, col: 0xa8c8e0 },
          layers: [
            { kind: 'rubble',    sp: 2.6, d: 4.5, col: 0x2f3a45, s0: 0.25, s1: 0.9 },
            { kind: 'reeds',     sp: 2.0, d: 7.5, col: 0x26333a },
            { kind: 'islets', foam: true, foam: true,    sp: 6.0, d: 12,  col: 0x202a36, h0: 1.4, h1: 2.8 },
            { kind: 'mesa',      sp: 12,  d: 19,  col: 0x1e2836, h0: 2.8, h1: 3.4 },
            { kind: 'wreck',     solo: true, d: 30, col: 0x1b2433, scale: 0.4 },
            { kind: 'castle',    sp: 34,  d: 46,  col: 0x1e2a3c, h0: 2.3, h1: 2.9, glowCol: 0xffc070 },
            { kind: 'mountains', sp: 9,   d: 68,  col: 0x26324a, h0: 2.3, h1: 2.9 }
          ] }
      ]
    },

    /* 2 and 3 - The Cave. A roof over everything, so the body is the cave
       mouth's daylight at the far end, with shafts down through the cracks. */
    cave: {
      tex: 'wetrock', ceiling: { y: 10.5, col: 0x04100f },
      skyGlow: 0.5, haze: 0.62, ground: 0x081614,
      mist: { sp: 3.6, size: 0.2, alpha: 0.14, col: 0x4c8c86 },
      motes: { col: 0x6ee7d0, size: 0.24, alpha: 0.4, rise: -0.3 },
      layers: [
        { kind: 'rubble',       sp: 2.2, d: 4.5, col: 0x1b423c, s0: 0.25, s1: 0.9 },
        { kind: 'crystals',     sp: 4.0, d: 7.5, col: 0x2f8b7f, glow: true, alpha: 0.6, s0: 0.45, s1: 1.0 },
        { kind: 'stalactites',  sp: 2.0, d: 12,  col: 0x113332, top: 6.4, h0: 1.6, h1: 3.0 },
        { kind: 'islets',       sp: 6.0, d: 19,  col: 0x12302c, h0: 2.6, h1: 3.6 },
        { kind: 'colossus',     solo: true, d: 30, col: 0x0b201e, scale: 0.42 },
        { kind: 'crystalspire', sp: 9,   d: 46,  col: 0x3fb8a8, glow: true, alpha: 0.7, h0: 1.8, h1: 3.0 },
        { kind: 'islets',       sp: 8,   d: 68,  col: 0x0c1c1b, h0: 2.0, h1: 2.8 }
      ],
      variants: [
        /* A cave with water in it: a fall into a black pool, and the colossus
           replaced by a drowned colonnade. */
        { name: 'falls',
          layers: [
            { kind: 'rubble',       sp: 2.2, d: 4.5, col: 0x1b423c, s0: 0.25, s1: 0.9 },
            { kind: 'stalactites',  sp: 2.2, d: 7.5, col: 0x163a34, top: 6.8, h0: 1.4, h1: 2.8 },
            { kind: 'spires',       sp: 3.4, d: 12,  col: 0x102927, h0: 2.2, h1: 3.8 },
            { kind: 'waterfall',    sp: 16,  d: 19,  col: 0x0e2624, h0: 3.0, h1: 3.8, flow: true, glowCol: 0x9ff2e4 },
            { kind: 'colossus',     solo: true, d: 30, col: 0x0b201e, scale: 0.42 },
            { kind: 'crystals',     sp: 5,   d: 46,  col: 0x3fb8a8, glow: true, alpha: 0.7, s0: 0.6, s1: 1.2 },
            { kind: 'mountains',    sp: 8,   d: 68,  col: 0x0c1c1b, h0: 1.8, h1: 2.6 }
          ],
          water: { d0: 16, col: 0x06201e } }
      ]
    },

    /* 4 - The Torch Hall. Masonry, and a forge mouth at the far end of it. */
    prison: {
      tex: 'brick', ceiling: { y: 10, col: 0x150e04 },
      skyGlow: 0.5, haze: 0.68, ground: 0x140c03,
      motes: { col: 0xf97316, size: 0.3, alpha: 0.5, rise: 0.7 },
      acts: [1, 2],
      layers: [
        { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x412c11, s0: 0.3, s1: 1.0 },
        { kind: 'columns',   sp: 3.8, d: 7.5, col: 0x38250c, h0: 2.6, h1: 3.6 },
        { kind: 'arches',    sp: 4.6, d: 12,  col: 0x2a1a09, h0: 2.4, h1: 3.2 },
        { kind: 'ruins',     sp: 6.0, d: 19,  col: 0x22150a, h0: 2.6, h1: 3.4 },
        { kind: 'gatehouse', solo: true, d: 30, col: 0x1c1107, scale: 0.42 },
        { kind: 'columns',   sp: 3.8, d: 46,  col: 0x180e05, h0: 2.2, h1: 3.0 },
        { kind: 'bricks',    sp: 3.2, d: 68,  col: 0x140b04, rows: 3 }
      ],
      variants: [
        /* The Ember Gaol: the same hall with the forge let loose -- lava down
           the far wall and the light gone red. */
        { name: 'ember', acts: [3],
          hero: { col: 0xff5a1f, core: 0xffd0a0, edge: 0xa0200a },
          layers: [
            { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x44200e, s0: 0.3, s1: 1.0 },
            { kind: 'columns',   sp: 3.8, d: 7.5, col: 0x3a1a0a, h0: 3.0, h1: 4.2 },
            { kind: 'arches',    sp: 4.6, d: 12,  col: 0x2c1408, h0: 2.6, h1: 3.6 },
            { kind: 'waterfall', sp: 14,  d: 19,  col: 0x241008, h0: 3.0, h1: 3.6, flow: true, glowCol: 0xff6a20 },
            { kind: 'gatehouse', solo: true, d: 30, col: 0x1e0c06, scale: 0.42 },
            { kind: 'ruins',     sp: 7,   d: 46,  col: 0x1a0a04, h0: 2.2, h1: 3.0 },
            { kind: 'bricks',    sp: 3.2, d: 68,  col: 0x160803, rows: 3 }
          ],
          ember: { sp: 3.0, size: 0.11, alpha: 0.5, col: 0xff8a3c } }
      ]
    },

    /* 5 - The Waystation. Violet, arcane, a portal standing open at the end. */
    vault: {
      tex: 'marble', ceiling: { y: 10.5, col: 0x120722 },
      skyGlow: 0.52, haze: 0.68, ground: 0x140728,
      motes: { col: 0xc084fc, size: 0.32, alpha: 0.5, rise: 0.15 },
      layers: [
        { kind: 'rubble',       sp: 2.4, d: 4.5, col: 0x2f1d57, s0: 0.3, s1: 1.0 },
        { kind: 'crystals',     sp: 4.0, d: 7.5, col: 0x8a66e0, glow: true, alpha: 0.6, s0: 0.45, s1: 1.1 },
        { kind: 'columns',      sp: 3.8, d: 12,  col: 0x241548, h0: 2.8, h1: 3.8 },
        { kind: 'crystalspire', sp: 7.0, d: 19,  col: 0x6a4ec0, glow: true, alpha: 0.75, h0: 2.4, h1: 3.4 },
        { kind: 'monolith',     solo: true, d: 30, col: 0x1a0e33, scale: 0.45 },
        { kind: 'ruins',        sp: 6.5, d: 46,  col: 0x170b2e, h0: 2.2, h1: 2.9 },
        { kind: 'islands',      sp: 10,  d: 68,  col: 0x1a1030, cap: 0x5a4a9a, accent: 0x2a1a48, y0: 1.8, y1: 2.2, s0: 0.5, s1: 0.8 }
      ],
      variants: [
        { name: 'arbiter', acts: [2, 3],
          hero: { col: 0x6ad8ff, core: 0xe8fbff, edge: 0x2a5a9a },
          layers: [
            { kind: 'rubble',       sp: 2.4, d: 4.5, col: 0x1d2c57, s0: 0.3, s1: 1.0 },
            { kind: 'columns',      sp: 3.8, d: 7.5, col: 0x1c2448, h0: 3.0, h1: 4.2 },
            { kind: 'arches',       sp: 4.8, d: 12,  col: 0x18203e, h0: 2.6, h1: 3.6 },
            { kind: 'crystalspire', sp: 7.0, d: 19,  col: 0x4a8ad0, glow: true, alpha: 0.75, h0: 2.4, h1: 3.4 },
            { kind: 'monolith',     solo: true, d: 30, col: 0x121a33, scale: 0.45 },
            { kind: 'islands',      sp: 9,   d: 46,  col: 0x141c30, cap: 0x3a5a9a, accent: 0x1a2448, y0: 2.2, y1: 2.8, s0: 0.5, s1: 0.8 },
            { kind: 'bricks',       sp: 3.4, d: 68,  col: 0x0e1224, rows: 3 }
          ] }
      ]
    },

    /* 6 - The Rot Swamp. A low sun through the fen haze, black trees standing
       in black water, and the glitter of it between them. */
    swamp: {
      tex: 'moss', skyGlow: 0.72, haze: 0.74, ground: 0x101c0a,
      mist: { sp: 2.6, size: 0.3, alpha: 0.2, col: 0xc8e090 },
      motes: { col: 0xd8e07a, size: 0.28, alpha: 0.4, rise: -0.1 },
      water: { d0: 7.5, col: 0x0c1a0c },
      layers: [
        { kind: 'reeds',     sp: 1.6, d: 4.5, col: 0x0e1c08 },
        { kind: 'trees',     sp: 3.4, d: 7.5, col: 0x172a0c, bare: true, h0: 2.8, h1: 4.0 },
        { kind: 'broadleaf', sp: 5.0, d: 12,  col: 0x162a10, accent: 0x1a1a0c, h0: 2.6, h1: 3.6 },
        { kind: 'islets', foam: true, foam: true,    sp: 9.0, d: 19,  col: 0x14260e, cap: 0x2a4a18, h0: 2.2, h1: 3.2 },
        { kind: 'deadtree',  solo: true, d: 30, col: 0x0c1606, scale: 0.3 },
        { kind: 'pines',     sp: 2.6, d: 46,  col: 0x1a2c14, accent: 0x1a2010, h0: 2.0, h1: 2.7 },
        { kind: 'mountains', sp: 10,  d: 68,  col: 0x22301c, h0: 2.1, h1: 2.6 }
      ],
      variants: [
        /* The Mire: moonlit, drowned ruins where the trees were. */
        { name: 'mire', acts: [2, 3],
          hero: { kind: 'moon', col: 0xd0f0a0, core: 0xf8ffe8, edge: 0x6a8a3c, rays: 0, elev: 8.0, r: 6.2 },
          stars: { sp: 1.6, size: 0.12, alpha: 0.45 },
          layers: [
            { kind: 'reeds',     sp: 1.6, d: 4.5, col: 0x0e1a0c },
            { kind: 'ruins',     sp: 6.0, d: 7.5, col: 0x18261a, h0: 2.2, h1: 3.4 },
            { kind: 'trees',     sp: 3.4, d: 12,  col: 0x132210, bare: true, h0: 2.6, h1: 3.6 },
            { kind: 'islets', foam: true, foam: true,    sp: 7.0, d: 19,  col: 0x14220f, h0: 2.2, h1: 3.2, cap: 0x3a5a24 },
            { kind: 'drownedtemple', solo: true, d: 30, col: 0x101c0c, scale: 0.5 },
            { kind: 'pines',     sp: 2.6, d: 46,  col: 0x182a16, accent: 0x141a0e, h0: 2.2, h1: 2.8 },
            { kind: 'mountains', sp: 10,  d: 68,  col: 0x1e2c20, h0: 2.2, h1: 2.7 }
          ] },
        /* The Sinking Fen: the swamp in its evening, with a castle going under. */
        { name: 'fen', acts: [2, 3],
          hero: { col: 0xffb86a, core: 0xfff0d0, edge: 0xb0602a, elev: 6.8, r: 7.0 },
          layers: [
            { kind: 'reeds',     sp: 1.6, d: 4.5, col: 0x121a08 },
            { kind: 'broadleaf', sp: 4.0, d: 7.5, col: 0x1c2a10, accent: 0x1c180c, h0: 2.6, h1: 3.6 },
            { kind: 'trees',     sp: 3.4, d: 12,  col: 0x182410, bare: true, h0: 2.6, h1: 3.6 },
            { kind: 'broadleaf', sp: 3.2, d: 19,  col: 0x182610, accent: 0x181a0c, h0: 2.8, h1: 3.4 },
            { kind: 'deadtree',  solo: true, d: 30, col: 0x121806, scale: 0.3 },
            { kind: 'castle',    sp: 40,  d: 46,  col: 0x1c2414, h0: 2.3, h1: 2.9, glowCol: 0xffc070 },
            { kind: 'mountains', sp: 10,  d: 68,  col: 0x2a2e1c, h0: 2.1, h1: 2.6 }
          ] }
      ]
    },

    /* 7 - The Climb. The run's widest sky: a cold moon behind three ranks of
       snow peaks, pines in front, a fall of water, clouds across the moon. */
    mountain: {
      tex: 'granite', skyGlow: 0.8, haze: 0.85, ground: 0x1a2028,
      acts: [1, 2],
      stars: { sp: 1.4, size: 0.13, alpha: 0.6 },
      motes: { col: 0xdceaff, size: 0.24, alpha: 0.35, rise: -0.15 },
      layers: [
        { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x4a5566, s0: 0.3, s1: 1.0 },
        { kind: 'pines',     sp: 3.4, d: 7.5, col: 0x1c2a2a, accent: 0x2a2420, snow: true, cap: 0xd8e4f0, h0: 2.6, h1: 3.8 },
        { kind: 'pines',     sp: 2.8, d: 12,  col: 0x1e2c30, accent: 0x262420, snow: true, cap: 0xd8e4f0, h0: 2.4, h1: 3.4 },
        { kind: 'mountains', sp: 9,   d: 19,  col: 0x2a3444, snow: true, cap: 0xdfe8f4, h0: 3.1, h1: 3.6 },
        { kind: 'peak',      solo: true, d: 30, col: 0x283242, scale: 0.26 },
        { kind: 'waterfall', sp: 26,  d: 30,  col: 0x283242, h0: 2.8, h1: 3.3, flow: true, glowCol: 0xcfeaff },
        { kind: 'mountains', sp: 9,   d: 46,  col: 0x2e3a50, snow: true, cap: 0xdfe8f4, h0: 2.5, h1: 3.0 },
        { kind: 'mountains', sp: 8,   d: 68,  col: 0x34425c, snow: true, cap: 0xe4ecf8, h0: 2.3, h1: 2.9 },
        { kind: 'clouds',    sp: 12,  d: 68,  col: 0x6a7a98, glow: true, alpha: 0.22, y0: 2.6, y1: 3.4 }
      ],
      variants: [
        /* The Burning Peak: the same climb in act III -- a swollen red sun,
           volcanoes in the ranks, lava down their steps, ash in the air. */
        { name: 'burning', acts: [3], fogTint: 0x2a0c08,
          hero: { kind: 'sun', col: 0xff5a2a, core: 0xffd8a8, edge: 0xa81e08,
                  aurora: false, rays: 14, elev: 7.0, r: 7.6, az: 0.5, fan: 16 },
          stars: null,
          ember: { sp: 2.6, size: 0.11, alpha: 0.5, col: 0xff8a3c },
          motes: { col: 0xff8a3c, size: 0.2, alpha: 0.45, rise: 0.55 },
          tex: 'basalt', ground: 0x1a0a06,
          layers: [
            { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x1e0e08, s0: 0.3, s1: 1.0 },
            { kind: 'spires',    sp: 3.6, d: 7.5, col: 0x2a120a, h0: 2.2, h1: 3.6 },
            { kind: 'mesa',      sp: 9,   d: 12,  col: 0x2a130a, h0: 2.2, h1: 3.2 },
            { kind: 'volcano',   sp: 12,  d: 19,  col: 0x2a120a, h0: 3.0, h1: 3.5, glowCol: 0xff6a20 },
            { kind: 'peak',      solo: true, d: 30, col: 0x26100a, scale: 0.26 },
            { kind: 'volcano',   sp: 11,  d: 46,  col: 0x2e140c, h0: 2.5, h1: 3.0, glowCol: 0xff5a18 },
            { kind: 'volcano',   sp: 10,  d: 68,  col: 0x3a1a10, h0: 2.3, h1: 2.9, glowCol: 0xff4a10 }
          ] },
        /* The Cracked Summit: bare gold rock, mesas and a low amber sun. */
        { name: 'summit', acts: [3], fogTint: 0x24140a,
          hero: { kind: 'sun', col: 0xffa04a, core: 0xfff0c8, edge: 0xc05a14,
                  aurora: false, rays: 16, elev: 7.2, r: 7.0, az: 0.46, fan: 14 },
          stars: null, tex: 'sand', ground: 0x201408,
          ember: { sp: 3.2, size: 0.1, alpha: 0.4, col: 0xffb060 },
          layers: [
            { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x201408, s0: 0.3, s1: 1.0 },
            { kind: 'spires',    sp: 3.6, d: 7.5, col: 0x30200e, h0: 2.2, h1: 3.6 },
            { kind: 'mesa',      sp: 9,   d: 12,  col: 0x2e1e10, h0: 2.2, h1: 3.2 },
            { kind: 'mesa',      sp: 10,  d: 19,  col: 0x2c1c10, h0: 3.0, h1: 3.4 },
            { kind: 'peak',      solo: true, d: 30, col: 0x2a1a0e, scale: 0.26 },
            { kind: 'mountains', sp: 9,   d: 46,  col: 0x3a2618, h0: 2.5, h1: 3.0 },
            { kind: 'volcano',   sp: 14,  d: 68,  col: 0x442c1c, h0: 2.3, h1: 2.9, glowCol: 0xff6a20 }
          ] }
      ]
    },

    /* 8 - The Sunk Halls. Outdoors now: a drowned city in a black lake under a
       low green-white moon, its columns and its citadel standing in the water. */
    flooded: {
      tex: 'ceramic', skyGlow: 0.7, haze: 0.72, ground: 0x0a1a24,
      stars: { sp: 1.8, size: 0.12, alpha: 0.45 },
      mist: { sp: 3.0, size: 0.22, alpha: 0.14, col: 0x8fd8ff },
      motes: { col: 0x8fd8ff, size: 0.26, alpha: 0.4, rise: -0.25 },
      water: { d0: 7.5, col: 0x06141e },
      layers: [
        { kind: 'ice',       sp: 5.5, d: 4.5, col: 0x2f5c72, h0: 0.8, h1: 1.6 },
        { kind: 'columns',   sp: 4.0, d: 7.5, col: 0x1a3c4d, h0: 2.4, h1: 3.8 },
        { kind: 'ruins',     sp: 6.0, d: 12,  col: 0x133142, h0: 2.4, h1: 3.4 },
        { kind: 'waterfall', sp: 18,  d: 19,  col: 0x10283a, h0: 2.4, h1: 3.0, flow: true, glowCol: 0xaee8ff },
        { kind: 'drownedtemple', solo: true, d: 30, col: 0x0e2230, scale: 0.5 },
        { kind: 'castle',    sp: 30,  d: 46,  col: 0x122636, h0: 2.3, h1: 3.0, glowCol: 0x9fe4ff },
        { kind: 'mountains', sp: 9,   d: 68,  col: 0x1a3044, h0: 2.2, h1: 2.8 }
      ],
      variants: [
        /* The Black Lake: nothing on the water but stacks and the eclipse. */
        { name: 'black lake',
          hero: { kind: 'eclipse', col: 0x8fd8ff, core: 0x06121a, edge: 0xc8f4ff, ring: true, elev: 7.8, r: 6.4 },
          layers: [
            { kind: 'rubble',    sp: 2.6, d: 4.5, col: 0x1c3444, s0: 0.25, s1: 0.9 },
            { kind: 'islets', foam: true, foam: true,    sp: 5.0, d: 7.5, col: 0x142634, h0: 1.8, h1: 3.2 },
            { kind: 'islets', foam: true, foam: true,    sp: 6.5, d: 12,  col: 0x12222e, h0: 1.8, h1: 3.2 },
            { kind: 'ruins',     sp: 9,   d: 19,  col: 0x10202c, h0: 2.8, h1: 3.4 },
            { kind: 'monolith',  solo: true, d: 30, col: 0x0e1c28, scale: 0.45 },
            { kind: 'islets', foam: true, foam: true,    sp: 9,   d: 46,  col: 0x142432, h0: 2.2, h1: 2.9 },
            { kind: 'mountains', sp: 9,   d: 68,  col: 0x182c3e, h0: 2.2, h1: 2.8 }
          ] },
        /* The Drowned Stair: falls everywhere, floating stones over them. */
        { name: 'stair', acts: [2, 3],
          hero: { col: 0xb8f0ff, elev: 8.2, r: 6.0 },
          layers: [
            { kind: 'ice',       sp: 5.5, d: 4.5, col: 0x2f5c72, h0: 0.8, h1: 1.6 },
            { kind: 'arches',    sp: 5.0, d: 7.5, col: 0x173646, h0: 2.6, h1: 3.6 },
            { kind: 'waterfall', sp: 12,  d: 12,  col: 0x12303f, h0: 3.0, h1: 4.0, flow: true, glowCol: 0xaee8ff },
            { kind: 'ruins',     sp: 7,   d: 19,  col: 0x10283a, h0: 2.8, h1: 3.4 },
            { kind: 'drownedtemple', solo: true, d: 30, col: 0x0e2230, scale: 0.5 },
            { kind: 'islands',   sp: 9,   d: 46,  col: 0x14283a, cap: 0x3a7a8a, accent: 0x1a2a30, y0: 2.4, y1: 3.0, s0: 0.5, s1: 0.8 },
            { kind: 'mountains', sp: 9,   d: 68,  col: 0x1a3044, h0: 2.2, h1: 2.8 }
          ] }
      ]
    },

    /* 9 - The Ash Reaches. Outdoors: a swollen sun sinking into the smoke,
       volcanoes in rank behind a lava lake, the lava running down their steps. */
    volcanic: {
      tex: 'basalt', skyGlow: 0.95, haze: 0.8, ground: 0x1a0a06, fogTint: 0x220a06,
      mist: { sp: 2.6, size: 0.32, alpha: 0.16, col: 0xff8a3c },
      ember: { sp: 2.4, size: 0.11, alpha: 0.5, col: 0xff8a3c },
      motes: { col: 0xff8a3c, size: 0.2, alpha: 0.45, rise: 0.55 },
      water: { d0: 19, col: 0x3a0c04, lava: true },
      layers: [
        { kind: 'rubble',  sp: 2.4, d: 4.5, col: 0x4d1e0c, s0: 0.3, s1: 1.0 },
        { kind: 'rubble',  sp: 3.2, d: 7.5, col: 0x3a1609, s0: 0.6, s1: 1.4 },
        { kind: 'islets',  sp: 7,   d: 12,  col: 0x3a180c, h0: 1.8, h1: 3.0 },
        { kind: 'volcano', sp: 12,  d: 19,  col: 0x3a160c, h0: 3.0, h1: 3.5, glowCol: 0xff6a20 },
        { kind: 'caldera', solo: true, d: 30, col: 0x220c05, scale: 0.3 },
        { kind: 'volcano', sp: 11,  d: 46,  col: 0x2c0e06, h0: 2.5, h1: 3.0, glowCol: 0xff5a18 },
        { kind: 'volcano', sp: 10,  d: 68,  col: 0x381408, h0: 2.3, h1: 2.9, glowCol: 0xff4a10 }
      ],
      variants: [
        /* The Magma Galleries: black obsidian spires over a lava sea. */
        { name: 'magma', acts: [3],
          water: { d0: 12, col: 0x4a1004, lava: true },
          layers: [
            { kind: 'rubble',       sp: 2.4, d: 4.5, col: 0x1c0a04, s0: 0.3, s1: 1.0 },
            { kind: 'spires',       sp: 3.0, d: 7.5, col: 0x2a0e06, h0: 2.4, h1: 4.0 },
            { kind: 'islets', foam: true, foam: true,       sp: 6,   d: 12,  col: 0x220a04, h0: 1.8, h1: 3.0 },
            { kind: 'crystalspire', sp: 8,   d: 19,  col: 0xff5a20, glow: true, alpha: 0.6, h0: 2.8, h1: 3.6 },
            { kind: 'caldera',      solo: true, d: 30, col: 0x1e0a04, scale: 0.3 },
            { kind: 'mesa',         sp: 11,  d: 46,  col: 0x2a0e06, h0: 2.4, h1: 2.9 },
            { kind: 'volcano',      sp: 10,  d: 68,  col: 0x381408, h0: 2.3, h1: 2.9, glowCol: 0xff4a10 }
          ] },
        /* The Forge: a black fortress over the lava, lit from inside. */
        { name: 'forge', acts: [3],
          hero: { col: 0xff3a14, core: 0xffc08a, edge: 0x800c04, r: 7.6, elev: 8.0 },
          layers: [
            { kind: 'rubble',    sp: 2.4, d: 4.5, col: 0x1c0a04, s0: 0.3, s1: 1.0 },
            { kind: 'ruins',     sp: 6,   d: 7.5, col: 0x2a0e06, h0: 2.4, h1: 3.6 },
            { kind: 'waterfall', sp: 13,  d: 12,  col: 0x220a04, h0: 3.0, h1: 4.0, flow: true, glowCol: 0xff6a20 },
            { kind: 'castle',    sp: 26,  d: 19,  col: 0x1e0804, h0: 3.0, h1: 3.5, glowCol: 0xff8a3c },
            { kind: 'caldera',   solo: true, d: 30, col: 0x1e0a04, scale: 0.3 },
            { kind: 'volcano',   sp: 11,  d: 46,  col: 0x2c0e06, h0: 2.5, h1: 3.0, glowCol: 0xff5a18 },
            { kind: 'volcano',   sp: 10,  d: 68,  col: 0x381408, h0: 2.3, h1: 2.9, glowCol: 0xff4a10 }
          ] }
      ]
    },

    /* 10 - The Throne. Gold, and the great window behind the dais. */
    throne: {
      tex: 'gild', ceiling: { y: 10.5, col: 0x1a1205 },
      skyGlow: 0.56, haze: 0.68, ground: 0x221806,
      motes: { col: 0xfde047, size: 0.32, alpha: 0.5, rise: 0.15 },
      layers: [
        { kind: 'rubble',     sp: 2.4, d: 4.5, col: 0x523a14, s0: 0.3, s1: 1.0 },
        { kind: 'columns',    sp: 3.8, d: 7.5, col: 0x4a3410, h0: 3.0, h1: 4.2 },
        { kind: 'arches',     sp: 4.8, d: 12,  col: 0x3b280b, h0: 2.6, h1: 3.6 },
        { kind: 'ruins',      sp: 6.5, d: 19,  col: 0x2f1f08, h0: 2.6, h1: 3.4 },
        { kind: 'thronehall', solo: true, d: 30, col: 0x271906, scale: 0.36 },
        { kind: 'arches',     sp: 5.2, d: 46,  col: 0x201405, h0: 2.2, h1: 2.9 },
        { kind: 'columns',    sp: 3.8, d: 68,  col: 0x1a1004, h0: 2.0, h1: 2.6 }
      ],
      variants: [
        { name: 'gilded', acts: [3],
          hero: { col: 0xffd060, core: 0xfffbe0, edge: 0xd08a10 },
          layers: [
            { kind: 'rubble',       sp: 2.4, d: 4.5, col: 0x523a14, s0: 0.3, s1: 1.0 },
            { kind: 'columns',      sp: 3.8, d: 7.5, col: 0x4a3410, h0: 3.0, h1: 4.2 },
            { kind: 'crystalspire', sp: 8,   d: 12,  col: 0xffc840, glow: true, alpha: 0.5, h0: 2.2, h1: 3.2 },
            { kind: 'arches',       sp: 5.0, d: 19,  col: 0x2f1f08, h0: 2.8, h1: 3.4 },
            { kind: 'thronehall',   solo: true, d: 30, col: 0x271906, scale: 0.36 },
            { kind: 'ruins',        sp: 7,   d: 46,  col: 0x201405, h0: 2.2, h1: 2.9 },
            { kind: 'columns',      sp: 3.8, d: 68,  col: 0x1a1004, h0: 2.0, h1: 2.6 }
          ] }
      ]
    },

    /* --- the fallback forest, and the drowned deep's own rooms ------------- */

    forest: {
      tex: 'bark', skyGlow: 1.0, haze: 0.8, ground: 0x0e1d13,
      stars: { sp: 1.6, size: 0.12, alpha: 0.5 },
      motes: { col: 0x86efac, size: 0.30, alpha: 0.45, rise: 0.2 },
      layers: [
        { kind: 'rubble',    sp: 2.6, d: 4.5, col: 0x203a26, s0: 0.25, s1: 0.9 },
        { kind: 'broadleaf', sp: 3.6, d: 7.5, col: 0x16301c, accent: 0x241c12, h0: 2.8, h1: 3.8 },
        { kind: 'pines',     sp: 2.8, d: 12,  col: 0x132817, accent: 0x201a12, h0: 2.6, h1: 3.6 },
        { kind: 'pines',     sp: 2.4, d: 19,  col: 0x12261a, accent: 0x1c1810, h0: 2.8, h1: 3.4 },
        { kind: 'deadtree',  solo: true, d: 30, col: 0x0e1c12, scale: 0.3 },
        { kind: 'waterfall', sp: 30,  d: 46,  col: 0x16261e, h0: 2.6, h1: 3.0, flow: true, glowCol: 0xd8f4ff },
        { kind: 'mountains', sp: 10,  d: 46,  col: 0x16261e, h0: 2.4, h1: 2.9 },
        { kind: 'mountains', sp: 9,   d: 68,  col: 0x1c2e26, h0: 2.3, h1: 2.8 }
      ]
    },
    caves: {
      tex: 'wetrock', ceiling: { y: 10.5, col: 0x050f0e },
      skyGlow: 0.5, haze: 0.66, ground: 0x0a1a17,
      mist: { sp: 3.2, size: 0.22, alpha: 0.16, col: 0x4f8078 },
      motes: { col: 0x5eead4, size: 0.26, alpha: 0.4, rise: -0.35 },
      layers: [
        { kind: 'rubble',       sp: 2.4, d: 4.5, col: 0x1a3c36, s0: 0.25, s1: 0.9 },
        { kind: 'stalactites',  sp: 2.2, d: 7.5, col: 0x163a34, top: 6.8, h0: 1.4, h1: 2.8 },
        { kind: 'crystals',     sp: 4.0, d: 12,  col: 0x2fb8a0, glow: true, alpha: 0.6, s0: 0.45, s1: 1.0 },
        { kind: 'islets',       sp: 6.0, d: 19,  col: 0x10282a, h0: 2.6, h1: 3.6 },
        { kind: 'colossus',     solo: true, d: 30, col: 0x0b1d1c, scale: 0.42 },
        { kind: 'crystalspire', sp: 8,   d: 46,  col: 0x3fe0c8, glow: true, alpha: 0.65, h0: 1.8, h1: 2.8 },
        { kind: 'mountains',    sp: 8,   d: 68,  col: 0x0c1a18, h0: 1.8, h1: 2.6 }
      ],
      variants: [
        /* The Frost Caves: blue ice, frozen falls, a pale portal. */
        { name: 'frost', when: /frost/i, tex: 'granite',
          hero: { col: 0xbfe6ff, core: 0xffffff, edge: 0x5a8ac0 },
          motes: { col: 0xdff4ff, size: 0.24, alpha: 0.45, rise: -0.2 },
          layers: [
            { kind: 'ice',          sp: 4.5, d: 4.5, col: 0x4a6a86, h0: 0.8, h1: 1.6 },
            { kind: 'stalactites',  sp: 2.2, d: 7.5, col: 0x2a4660, top: 6.8, h0: 1.4, h1: 2.8 },
            { kind: 'ice',          sp: 4.0, d: 12,  col: 0x2a4a66, h0: 2.2, h1: 3.2 },
            { kind: 'waterfall',    sp: 14,  d: 19,  col: 0x1e3650, h0: 3.0, h1: 3.6, glowCol: 0xcfeeff },
            { kind: 'colossus',     solo: true, d: 30, col: 0x182c42, scale: 0.42 },
            { kind: 'crystalspire', sp: 7,   d: 46,  col: 0x9fd8ff, glow: true, alpha: 0.6, h0: 1.8, h1: 2.8 },
            { kind: 'mountains',    sp: 8,   d: 68,  col: 0x1a2c40, snow: true, cap: 0xcfe0f0, h0: 1.8, h1: 2.6 }
          ] },
        /* The Glowworm Caves: green light hanging from the roof. */
        { name: 'glowworm',
          hero: { col: 0x9af07a, core: 0xeaffd8, edge: 0x3a8a2a },
          layers: [
            { kind: 'rubble',       sp: 2.4, d: 4.5, col: 0x1a3a26, s0: 0.25, s1: 0.9 },
            { kind: 'crystals',     sp: 2.6, d: 7.5, col: 0x6ae05a, glow: true, alpha: 0.6, s0: 0.3, s1: 0.7 },
            { kind: 'stalactites',  sp: 2.2, d: 12,  col: 0x14301e, top: 6.2, h0: 1.4, h1: 2.8 },
            { kind: 'spires',       sp: 3.4, d: 19,  col: 0x0e2418, h0: 2.6, h1: 3.6 },
            { kind: 'colossus',     solo: true, d: 30, col: 0x0b1c14, scale: 0.42 },
            { kind: 'waterfall',    sp: 18,  d: 46,  col: 0x0e1e16, h0: 2.2, h1: 2.8, flow: true, glowCol: 0xb8ffa8 },
            { kind: 'mountains',    sp: 8,   d: 68,  col: 0x0c1a12, h0: 1.8, h1: 2.6 }
          ] }
      ]
    },
    nest: {
      tex: 'bone', ceiling: { y: 10, col: 0x170508 },
      skyGlow: 0.5, haze: 0.66, ground: 0x1a060a,
      motes: { col: 0xfb7185, size: 0.28, alpha: 0.5, rise: 0.1 },
      layers: [
        { kind: 'bones',       sp: 3.0, d: 4.5, col: 0x4a2b33 },
        { kind: 'trees',       sp: 3.4, d: 7.5, col: 0x250a0f, bare: true, h0: 2.8, h1: 4.0 },
        { kind: 'stalactites', sp: 2.2, d: 12,  col: 0x341117, top: 6.2, h0: 1.4, h1: 2.8 },
        { kind: 'islets',      sp: 6.0, d: 19,  col: 0x240a10, h0: 2.6, h1: 3.6 },
        { kind: 'bonetower',   solo: true, d: 30, col: 0x170609, scale: 0.4 },
        { kind: 'ruins',       sp: 7,   d: 46,  col: 0x160609, h0: 2.2, h1: 2.9 },
        { kind: 'mountains',   sp: 8,   d: 68,  col: 0x14050a, h0: 1.8, h1: 2.6 }
      ],
      variants: [
        /* The Lich's Chapel: a green witch-light, and a ruined chapel. */
        { name: 'chapel', acts: [3],
          hero: { kind: 'sigil', col: 0x7af0a0, core: 0xe8ffe8, edge: 0x1a7a4a, ring: true, rays: 0 },
          layers: [
            { kind: 'bones',     sp: 3.0, d: 4.5, col: 0x3a3a33 },
            { kind: 'columns',   sp: 3.8, d: 7.5, col: 0x1e2a1e, h0: 3.0, h1: 4.2 },
            { kind: 'arches',    sp: 4.8, d: 12,  col: 0x182418, h0: 2.6, h1: 3.6 },
            { kind: 'ruins',     sp: 6.5, d: 19,  col: 0x141e14, h0: 2.6, h1: 3.4 },
            { kind: 'bonetower', solo: true, d: 30, col: 0x101810, scale: 0.4 },
            { kind: 'castle',    sp: 30,  d: 46,  col: 0x0e160e, h0: 2.0, h1: 2.6, glowCol: 0x7af0a0 },
            { kind: 'mountains', sp: 8,   d: 68,  col: 0x0c140c, h0: 1.8, h1: 2.6 }
          ] }
      ]
    },
    /* The trial is outdoors: an eclipse over a plain of obelisks and a citadel. */
    trial: {
      tex: 'blood', skyGlow: 0.9, haze: 0.74, ground: 0x1c0709,
      stars: { sp: 2.0, size: 0.12, alpha: 0.4 },
      ember: { sp: 3.4, size: 0.1, alpha: 0.4, col: 0xff8a6a },
      motes: { col: 0xff8a6a, size: 0.28, alpha: 0.45, rise: 0.3 },
      layers: [
        { kind: 'rubble',    sp: 2.2, d: 4.5, col: 0x471b18, s0: 0.3, s1: 1.0 },
        { kind: 'ruins',     sp: 5.5, d: 7.5, col: 0x3d1513, h0: 2.6, h1: 3.8 },
        { kind: 'mesa',      sp: 9,   d: 12,  col: 0x32100f, h0: 2.2, h1: 3.2 },
        { kind: 'arches',    sp: 6,   d: 19,  col: 0x2a0c0c, h0: 2.8, h1: 3.4 },
        { kind: 'obelisk',   solo: true, d: 30, col: 0x220809, scale: 0.3 },
        { kind: 'castle',    sp: 34,  d: 46,  col: 0x240a0b, h0: 2.4, h1: 3.0, glowCol: 0xff8a6a },
        { kind: 'mesa',      sp: 10,  d: 68,  col: 0x2e0e0e, h0: 2.2, h1: 2.8 }
      ]
    }
  };

  /* The act a depth belongs to, for choosing a variant. The endless floors walk
     the three acts again (see DS.Difficulty's ladder), so an endless depth is
     read as the depth it echoes. */
  function actForDepth(depth) {
    const d = Math.max(1, Math.floor(depth || 1));
    const echo = d > 30 ? ((d - 31) % 30) + 1 : d;
    return echo <= 10 ? 1 : echo <= 20 ? 2 : 3;
  }

  function rungLabel(depth) {
    try {
      const r = DS.Difficulty && DS.Difficulty.biomeForDepth ? DS.Difficulty.biomeForDepth(depth) : null;
      return r ? { label: r.label || '', theme: r.theme || '' } : null;
    } catch (err) { return null; }
  }

  /* The candidates a theme offers on this depth: the base recipe and every
     variant whose `acts` include this act. A variant with a `when` that matches
     the floor's own label wins outright. */
  function variantPool(base, depth) {
    const act = actForDepth(depth);
    const rung = rungLabel(depth);
    const all = [base].concat(base.variants || []);
    if (rung) {
      for (let i = 1; i < all.length; i++) {
        if (all[i].when && all[i].when.test(rung.label)) return [all[i]];
      }
    }
    const pool = all.filter(function (v) {
      return !v.when && (!v.acts || v.acts.indexOf(act) >= 0);
    });
    return pool.length ? pool : [base];
  }

  function pickIndex(pool, depth) {
    return (Math.imul((depth | 0) + 7, 0x9E3779B1) >>> 7) % pool.length;
  }

  /* The recipe and body a theme ACTUALLY gets on this depth. Two floors in a
     row of the same theme (the Deep Cave after the Cave Mouth) are nudged onto
     different variants, so the second one is not a repeat of the first. */
  function resolveVariant(themeName, depth) {
    const base = RECIPE[themeName] || RECIPE.forest;
    const heroBase = HEROES[themeName] || HEROES.forest;
    const pool = variantPool(base, depth);
    /* The first act shows each theme as authored; the nudge below still moves
       a second floor in a row onto a variant. */
    let idx = actForDepth(depth) === 1 && depth <= 10 && pool[0] === base ? 0 : pickIndex(pool, depth);
    if (pool.length > 1 && depth > 1) {
      const prev = rungLabel(depth - 1);
      if (prev && prev.theme === themeName) {
        const prevPool = variantPool(base, depth - 1);
        const prevPick = prevPool[pickIndex(prevPool, depth - 1)];
        if (pool[idx] === prevPick) idx = (idx + 1) % pool.length;
      }
    }
    const v = pool[idx];
    const rec = v === base ? base : Object.assign({}, base, v);
    const hero = Object.assign({}, heroBase, v.hero || {});
    return { rec: rec, hero: hero, name: v === base ? 'base' : v.name };
  }

  function currentDepth(env) {
    if (env && Number.isFinite(env.depth)) return env.depth;
    const g = DS.currentGame;
    return g && Number.isFinite(g.depth) ? g.depth : 1;
  }

  /* How many of a band to place across a span of this width. A `solo` layer is
     a landmark: exactly one. */
  function bandCount(spec, span) {
    if (spec.solo) return 1;
    const n = Math.round(span / Math.max(0.5, spec.sp || 6));
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
     a whole band of 120 rocks is one InstancedMesh.

     Two colour modes. With a `palette` (every band this file builds), each
     instance takes its TONE's colour from it, times a small hash jitter so forty
     identical rocks do not render as one flat mass, and the material itself is
     white. Without one (the renderer's water batches), `tint` is the old
     grey value jitter over the material's own colour.

     `geo` is the shared unit geometry of this build; a caller outside the file
     that passes none gets a fresh box, exactly as before. */
  function instancedBoxes(list, mat, tint, palette, geo) {
    const mesh = new THREE.InstancedMesh(geo || new THREE.BoxGeometry(1, 1, 1), mat, list.length);
    const d = new THREE.Object3D();
    const inst = (tint || palette) ? new THREE.Color() : null;
    const jit = tint || 0;
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
        const j = 1 - jit * 0.5 + jit * hash01(b[0] * 0.37 + b[1] * 0.11 + b[2] * 0.71);
        if (palette) inst.copy(palette[b[8] || 0] || palette[0]).multiplyScalar(j);
        else inst.setRGB(j, j, j);
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

  function instancedShards(list, mat, geo, flip, tint, palette) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const d = new THREE.Object3D();
    const inst = (tint || palette) ? new THREE.Color() : null;
    const jit = tint || 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      d.position.set(s[0], s[1], s[2]);
      // A cone points +y by default; a stalactite has to point at the floor.
      d.rotation.set(flip ? Math.PI : 0, s[5], 0);
      d.scale.set(s[3], s[4], s[3]);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      if (inst) {
        const j = 1 - jit * 0.5 + jit * hash01(s[0] * 0.53 + s[1] * 0.29 + s[2] * 0.61);
        if (palette) inst.copy(palette[s[6] || 0] || palette[0]).multiplyScalar(j);
        else inst.setRGB(j, j, j);
        mesh.setColorAt(i, inst);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* --- the rim ------------------------------------------------------------------

     What makes a silhouette read as BACKLIT is the bright line where the light
     wraps round its edge. A second lamp is not allowed (see the header), and a
     second pass is not affordable, so the rim is a few lines of vertex shader
     on the band's own Lambert material:

       - the face must turn toward the body (a low light behind the stage lights
         the tops and the sides that face it, never the fronts), biased upward
         because a low sun wraps over a ridge;
       - the body's sideways offset is exaggerated, so the flank of a rock that
         faces the light catches it even though the light is far behind;
       - it is strongest at grazing angles to the eye (a Fresnel term), which
         on a box means the tops and the flanks -- the outline;
       - its colour and strength are the material's own EMISSIVE, so each band
         sets its own and no custom uniform is needed.

     The body's position is compiled in as a constant relative to the camera,
     because the body rides the camera (see follow()): `cameraPosition` is a
     built-in uniform, so the rim follows the light for free. The program cache
     key carries those constants, so all the bands of a floor share ONE program
     (two with the texture variant) and the next floor compiles its own. */
  function rimChunk(sun) {
    return [
      '{',
      '  #ifdef USE_INSTANCING',
      '    mat4 bdM = modelMatrix * instanceMatrix;',
      '  #else',
      '    mat4 bdM = modelMatrix;',
      '  #endif',
      '  vec3 bdP = (bdM * vec4(transformed, 1.0)).xyz;',
      '  vec3 bdN = normalize(mat3(bdM) * objectNormal);',
      '  vec3 bdSun = vec3(cameraPosition.x + (' + sun.dx.toFixed(2) + '),',
      '                    cameraPosition.y + (' + sun.dy.toFixed(2) + '), ' + sun.z.toFixed(2) + ');',
      '  vec3 bdS = normalize(bdSun - bdP);',
      '  vec3 bdL = normalize(vec3(bdS.x * 3.0, bdS.y + 0.55, bdS.z));',
      '  vec3 bdV = normalize(cameraPosition - bdP);',
      '  float bdF = 1.0 - max(dot(bdN, bdV), 0.0);',
      '  vBdRim = pow(max(dot(bdN, bdL), 0.0), 0.8) * (0.4 + 0.6 * bdF);',
      '}'
    ].join('\n');
  }

  function rimMaterial(opts, rimCol, sun) {
    const m = new THREE.MeshLambertMaterial(opts);
    m.emissive.copy(rimCol);
    const key = 'bdrim:' + sun.dx.toFixed(2) + ',' + sun.dy.toFixed(2) + ',' + sun.z.toFixed(2);
    const chunk = rimChunk(sun);
    m.onBeforeCompile = function (sh) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vBdRim;')
        .replace('#include <lights_lambert_vertex>', '#include <lights_lambert_vertex>\n' + chunk);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBdRim;')
        .replace('vec3 totalEmissiveRadiance = emissive;',
                 'vec3 totalEmissiveRadiance = emissive * vBdRim;');
    };
    m.customProgramCacheKey = function () { return key; };
    return m;
  }

  /* --- the sky itself ---------------------------------------------------------

     A sky is not a backdrop painting: it is the far shell of the world, and the
     whole job of it is the bright haze band that sits ON the horizon line. Four
     stops, canvas top to bottom: dark overhead, the theme's mid sky, a still-hazy
     band, and the haze itself at the ground line. */
  function makeSkyTexture(topHex, midHex, lowHex, hazeHex, drop) {
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
    /* v6: the plane now runs SKY_DROP (64) units under the eye line -- deep
       enough that a ray from a camera standing high over a far-away ground
       line still lands on sky -- so the stops are solved from where the eye
       line falls on the canvas rather than written as fixed fractions. */
    const total = SKY_H + drop;
    const at = function (u) { return M.clamp(1 - (drop + u) / total, 0, 1); };   // u over the eye line
    grd.addColorStop(0, topHex);
    grd.addColorStop(at(SKY_MID_U), midHex);
    grd.addColorStop(at(SKY_LOW_U), lowHex);
    grd.addColorStop(at(SKY_HAZE_U), hazeHex);
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
    /* The core is held UNDER full white (see capHot) and only its inner third
       keeps it: a hot pip, then a shoulder half-way to the body colour. A disc
       that is white edge to edge is what the halos and the bloom stacked into a
       white hole in the sky; a disc that falls off keeps its colour at the rim
       and gives the post clamp (DS.PostFX) a gradient to roll off. */
    const hotHex = capHot(hero.core != null ? hero.core : hero.col);
    const core = cssOf(hotHex);
    const shoulder = mixHex(hotHex, hero.col, 0.5);
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
          : (d > 0.88 ? rim : d > 0.66 ? body : d > 0.34 ? shoulder : core);
        ctx.fillRect(x, y, 2, 2);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  /* Hold a body colour under full white: scaled so its brightest channel
     is at most HOT_MAX, and pulled a little toward its own hue. Every halo,
     the bloom sprite and the glow wall are ADDED over the disc, so a core that
     starts at #ffffff has nowhere to go but clipped. */
  const HOT_MAX = 0.9;
  function capHot(hex) {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const m = Math.max(r, g, b, 1) / 255;
    const k = m > HOT_MAX ? HOT_MAX / m : 1;
    return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k);
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

  /* A round soft glow, for the bloom that sits on the body. Rebuilt per floor
     for the same reason the glow bar is (see build). */
  let radialTex = null;
  function makeRadialTexture() {
    if (radialTex) return radialTex;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    radialTex = new THREE.CanvasTexture(cv);
    return radialTex;
  }

  /* A shaft's texture: bright at the body, gone at the far end, soft at both
     sides. One tile, stretched along each shaft of the fan. */
  let fanTex = null;
  function makeFanTexture() {
    if (fanTex) return fanTex;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 16;
    const ctx = cv.getContext('2d');
    for (let x = 0; x < 64; x++) {
      const along = Math.pow(1 - x / 63, 1.6);
      for (let y = 0; y < 16; y++) {
        const across = Math.sin(Math.PI * (y + 0.5) / 16);
        const a = along * across * across;
        ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    fanTex = new THREE.CanvasTexture(cv);
    return fanTex;
  }

  /* Falling water (or lava): vertical dashes of uneven length, NearestFilter so
     it stays on the pixel grid. Scrolled in update(), which is the fall. */
  let flowTex = null;
  function makeFlowTexture() {
    if (flowTex) return flowTex;
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgb(90,90,90)';
    ctx.fillRect(0, 0, 16, 64);
    const rng = DS.makeRng(0xF10E5);
    for (let x = 0; x < 16; x += 2) {
      let y = Math.floor(rng.float(0, 8));
      while (y < 64) {
        const len = 4 + Math.floor(rng.float(0, 12));
        const v = Math.floor(rng.float(150, 255));
        ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        ctx.fillRect(x, y, 2, Math.min(len, 64 - y));
        y += len + 2 + Math.floor(rng.float(0, 6));
      }
    }
    flowTex = new THREE.CanvasTexture(cv);
    flowTex.magFilter = THREE.NearestFilter;
    flowTex.minFilter = THREE.NearestFilter;
    flowTex.wrapS = THREE.RepeatWrapping;
    flowTex.wrapT = THREE.RepeatWrapping;
    flowTex.repeat.set(1, 3);
    return flowTex;
  }

  /* The water sheet: the sky's own horizon value at the far edge (so the sea
     meets the sky with no seam and every silhouette on it is dark against
     light), the theme's deep water at the near edge, and a scatter of pale
     dashes -- the shimmer -- that scroll sideways in update(). */
  function makeWaterTexture(nearCss, farCss, dashCss) {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, farCss);
    grd.addColorStop(0.35, farCss);
    grd.addColorStop(1, nearCss);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    const rng = DS.makeRng(0x3A7E2);
    ctx.fillStyle = dashCss;
    for (let i = 0; i < 70; i++) {
      const y = Math.floor(Math.pow(rng.float(0, 1), 1.6) * 60);
      ctx.globalAlpha = 0.12 + 0.3 * (1 - y / 64);
      ctx.fillRect(Math.floor(rng.float(0, 60)), y, 2 + Math.floor(rng.float(0, 7)), 1);
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }

  /* The glitter path under the body: broken horizontal dashes, white, on black
     (it is drawn additively in the body's colour). */
  let glintTex = null;
  function makeGlintTexture() {
    if (glintTex) return glintTex;
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 32, 128);
    const rng = DS.makeRng(0x6117);
    for (let y = 0; y < 128; y += 2) {
      const n = 1 + Math.floor(rng.float(0, 3));
      for (let k = 0; k < n; k++) {
        const len = 2 + Math.floor(rng.float(0, 9));
        const cx = 16 + (rng.float(-1, 1) + rng.float(-1, 1)) * 7;
        const v = Math.floor(rng.float(120, 255));
        ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        ctx.fillRect(Math.floor(cx - len / 2), y, len, 1);
      }
    }
    glintTex = new THREE.CanvasTexture(cv);
    glintTex.magFilter = THREE.NearestFilter;
    glintTex.minFilter = THREE.LinearFilter;
    glintTex.wrapT = THREE.RepeatWrapping;
    glintTex.repeat.set(1, 2);
    return glintTex;
  }

  /* One shaft of the fan: a wedge from a narrow root at the body to a wide
     end, u running along it (so the fan texture fades it out). */
  function makeFanGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, -0.06, 0,   1, -0.5, 0,   1, 0.5, 0,   0, 0.06, 0
    ]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0,   1, 0,   1, 1,   0, 1
    ]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }

  /* A trapezoid lying flat on the water, from `near` to `far` (positive
     distances), narrow near and wide far so the glitter path keeps about the
     sun's own width all the way out. */
  function makeGlintGeometry(near, far, wNear, wFar) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -wNear, 0, -near,   wNear, 0, -near,   wFar, 0, -far,   -wFar, 0, -far
    ]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0,   1, 0,   1, 1,   0, 1
    ]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }

  /* The live state of the horizon that update() and heroInfo() animate. */
  let heroRef = null;         // the live body: { group, rays, halos, glow, fan, ... }
  let backdropAir = [];       // mist / ember motes with their own drift
  let backdropSway = [];      // bands that sway (or bob) about their own base
  let flock = null;           // the birds: one instanced batch, and their state
  let followers = [];         // rigs that ride the camera's aim across the floor
  let scrolls = [];           // textures that scroll: falls, shimmer, glitter
  let builtGroup = null;      // the group the last build returned
  let roomRig = null;         // a roofed theme's light rig, and the eye height it was built for
  let lastReport = null;
  let lastTime = 0;
  let lastResolved = null;    // { theme, depth, rec, hero, name }
  const tmp = { dir: null, aim: null, eye: null, info: null, dummy: null };

  function scratch() {
    if (!tmp.dir) {
      tmp.dir = new THREE.Vector3();
      tmp.aim = new THREE.Vector3();
      tmp.eye = new THREE.Vector3();
      tmp.dummy = new THREE.Object3D();
      tmp.info = { worldPos: new THREE.Vector3(), color: new THREE.Color(), intensity: 0 };
    }
    return tmp;
  }

  function additive(opts) {
    return new THREE.MeshBasicMaterial(Object.assign({
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false
    }, opts));
  }

  /* Build one theme's body. Everything here is MeshBasicMaterial: unlit, so no
     lamp is added (see the header: a new lamp is the black-screen bug), and
     `fog: false`, so the body is the one thing in the world the weather cannot
     eat. `x` is its offset from the camera's aim (the parent rig follows the
     aim), `y` its height in the parent's frame, `z` its depth. */
  function buildHero(parent, hero, x, y, z, rng, G) {
    const g = new THREE.Group();
    const tex = makeHeroTexture(hero);
    const geo = new THREE.PlaneGeometry(hero.r * 2, hero.r * 2);

    /* The body itself is opaque-ish: it is the one silhouette in the sky that
       is meant to be read as an object, not as a bloom. */
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false
    }));
    core.frustumCulled = false;
    core.renderOrder = 2;
    g.add(core);

    /* Halos: the same disc, enlarged and faded, twice. Two is the number that
       reads as light rather than as a smudge -- one is a sticker, three is fog. */
    const halos = [];
    const hr = hero.halos || [1.5, 2.5];
    for (let i = 0; i < hr.length; i++) {
      const h = new THREE.Mesh(geo, additive({ map: tex, color: hero.col, opacity: i === 0 ? 0.24 : 0.11 }));
      h.scale.setScalar(hr[i]);
      h.position.z = 0.2 + i * 0.2;
      h.frustumCulled = false;
      h.renderOrder = 3;
      g.add(h);
      halos.push(h);
    }

    /* The bloom: a soft round glow six radii across. With the glow wall under
       it, this is what makes the sky BRIGHTEST at the body and not merely
       coloured by it. */
    const bloom = new THREE.Mesh(G.plane, additive({
      map: makeRadialTexture(), color: hero.col, opacity: 0.24
    }));
    bloom.scale.set(hero.r * 6, hero.r * 6, 1);
    bloom.position.z = -0.4;
    bloom.frustumCulled = false;
    g.add(bloom);

    /* Rays: a fan of thin boxes turning around the body. It is the difference
       between a sun and a moon. */
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
      rays = instancedBoxes(list, additive({ color: hero.col, opacity: 0.42 }), 0, null, G.box);
      g.add(rays);
    }

    /* The fan: long soft wedges spreading out of the body across the whole sky
       -- the crepuscular rays of a low light behind a ridge. One batch. */
    let fan = null;
    if (hero.fan) {
      const n = hero.fan;
      fan = new THREE.InstancedMesh(G.fan, additive({
        map: makeFanTexture(), color: hero.col, opacity: 0.16, side: THREE.DoubleSide
      }), n);
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const a = (i + rng.float(-0.35, 0.35)) / n * Math.PI * 2;
        const len = hero.r * rng.float(5, 10);
        d.position.set(0, 0, -0.2);
        d.rotation.set(0, 0, a);
        d.scale.set(len, len * rng.float(0.12, 0.28), 1);
        d.updateMatrix();
        fan.setMatrixAt(i, d.matrix);
      }
      fan.instanceMatrix.needsUpdate = true;
      fan.frustumCulled = false;
      g.add(fan);
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
      g.add(instancedBoxes(list, additive({
        color: hero.core != null ? hero.core : 0xffffff, opacity: 0.55
      }), 0, null, G.box));
    }

    /* The aurora: three flat bands above the moon, one batch. */
    if (hero.aurora) {
      const au = new THREE.InstancedMesh(G.plane, additive({
        map: makeGlowBarTexture(), color: 0x9ff0c8, opacity: 0.10
      }), 3);
      const d = new THREE.Object3D();
      for (let i = 0; i < 3; i++) {
        d.position.set(hero.r * (i - 1) * 2.2, hero.r * (1.6 + i * 0.35), -0.6);
        d.rotation.set(0, 0, (i - 1) * 0.08);
        d.scale.set(hero.r * 9, hero.r * 1.6, 1);
        d.updateMatrix();
        au.setMatrixAt(i, d.matrix);
      }
      au.instanceMatrix.needsUpdate = true;
      au.frustumCulled = false;
      g.add(au);
      heroAurora = au;
    }

    g.position.set(x, y, z);
    parent.add(g);
    return { group: g, halos: halos, rays: rays, fan: fan, bloom: bloom,
             kind: hero.kind, col: hero.col, fanBase: fan ? fan.material.opacity : 0 };
  }
  let heroAurora = null;

  /* The shafts an underground theme gets on the way to its light: light coming
     DOWN through cracks in the roof. One instanced batch of stepped boxes, each
     shaft widening as it falls and leaning a little. */
  function buildShafts(parent, hero, WU, anchorY, ceilY, rng, G) {
    const n = hero.shafts || 3;
    const top = anchorY + (ceilY != null ? ceilY - 0.6 : 9);
    const bottom = anchorY + 0.4;
    const h = top - bottom;
    const steps = 5;
    const list = [];
    for (let i = 0; i < n; i++) {
      const x0 = WU * (0.16 + i * (0.68 / Math.max(1, n - 1))) + rng.float(-6, 6);
      const z = -18 - i * 5;
      const lean = rng.float(-0.10, 0.10);
      for (let k = 0; k < steps; k++) {
        const t = k / (steps - 1);
        const w = 1.1 + t * 2.6;
        const ly = h * (0.5 - (k + 0.5) / steps);        // below the shaft's middle
        box(list, x0 - Math.sin(lean) * ly, (top + bottom) * 0.5 + Math.cos(lean) * ly, z,
            w, h / steps * 1.05, w, lean, 0);
      }
    }
    parent.add(instancedBoxes(list, additive({ color: hero.col, opacity: 0.14 }), 0, null, G.box));
  }

  /* The glow wall: the whole reason a horizon can read as LIT rather than as
     painted. A wide soft additive sheet in the body's own colour whose
     brightest point sits just under the body, on the horizon, so the sky and
     the far ground brighten around the light and every ridge in front of it
     stays dark -- the one arrangement the eye reads as backlight. */
  function buildGlowWall(parent, hero, x, y, z, w, h) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), additive({
      map: makeGlowBarTexture(), color: hero.col,
      opacity: (hero.glow != null ? hero.glow : 0.3) * 0.7
    }));
    /* The bar's bright spot is 58/64 of the way down its canvas, so the plane
       is lifted to put that spot at `y`. */
    m.position.set(x, y + h * (58 / 64 - 0.5), z);
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  /* Where the far light comes FROM, for the back light the renderer already
     owns. The body rides the camera, so this is a DIRECTION from the eye, not
     a place on the floor: ahead, low, and a little to the side `az` names. The
     rig can be turned (F6), so the angle is rotated with it. */
  function heroLight(themeName, yaw) {
    const hero = resolvedHero(themeName);
    const x = (hero.az - 0.5) * SKY_HERO_SPAN;
    const z = -60;
    const yw = (yaw || 0) * 0.85;
    return {
      x: x * Math.cos(yw) - z * Math.sin(yw),
      y: 6 + Math.min(hero.elev || 8, 12) * 0.8,
      z: x * Math.sin(yw) + z * Math.cos(yw),
      col: hero.col,
      gain: hero.gain != null ? hero.gain : 1
    };
  }

  /* The body a theme gets on the floor being played (variant and all). */
  function resolvedHero(themeName) {
    const depth = currentDepth(null);
    if (lastResolved && lastResolved.theme === themeName && lastResolved.depth === depth) {
      return lastResolved.hero;
    }
    return resolveVariant(themeName, depth).hero;
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

  /* A flock, as silhouettes: two wing plates on a body, flown across the far
     sky and lit by nothing, so the eye reads only a shape crossing a lit
     background. All of them are ONE instanced batch (three boxes a bird); the
     flight writes their matrices in update(), into the same arrays. */
  function buildSkyLife(parent, rec, WU, anchorY, rng, G) {
    const n = 3 + Math.floor(rng.float(0, 4));
    const col = new THREE.Color(rec.ground != null ? rec.ground : 0x101018).multiplyScalar(0.5);
    const mesh = new THREE.InstancedMesh(G.box, new THREE.MeshBasicMaterial({ color: col, fog: false }), n * 3);
    mesh.frustumCulled = false;
    const birds = [];
    for (let i = 0; i < n; i++) {
      birds.push({
        x: rng.float(0, WU), y: anchorY + rng.float(6, 11), z: rng.float(-40, -24),
        s: rng.float(0.8, 1.25),
        speed: rng.float(1.6, 3.1) * (rng.chance(0.5) ? 1 : -1),
        flap: rng.float(6.5, 9.5), phase: rng.float(0, 6.28), bob: rng.float(0.25, 0.6)
      });
    }
    flock = { mesh: mesh, birds: birds, spanX: WU * 1.2 };
    placeFlock(0);
    parent.add(mesh);
  }

  function placeFlock(time) {
    if (!flock) return;
    const d = scratch().dummy;
    const B = flock.birds;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const y = b.y + Math.sin(time * b.bob + b.phase) * 0.35;
      const flap = Math.sin(time * b.flap + b.phase) * 0.55;
      d.rotation.set(0, 0, 0);
      d.position.set(b.x, y, b.z);
      d.scale.set(0.5 * b.s, 0.16 * b.s, 0.2 * b.s);
      d.updateMatrix();
      flock.mesh.setMatrixAt(i * 3, d.matrix);
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        d.position.set(b.x + side * 0.32 * b.s, y + Math.sin(flap) * 0.1 * b.s, b.z);
        d.rotation.set(0, 0, side * -flap);
        d.scale.set(0.42 * b.s, 0.07 * b.s, 0.18 * b.s);
        d.updateMatrix();
        flock.mesh.setMatrixAt(i * 3 + 1 + k, d.matrix);
      }
    }
    flock.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------------------------
     build
     --------------------------------------------------------------------------- */
  /* The largest disc a room can hold, and where it has to sit.

     Two constraints, and they pull in opposite directions: the body has to be
     ABOVE THE FLOOR (a disc at zero elevation is a lamp inside the ground slab)
     and UNDER THE ROOF (a disc under a stone slab is an invisible light). With
     `room` the usable height, both survive only while r <= (room - 0.2) / 2,
     so the radius is capped there and the elevation is pinned inside what is
     left. Authored `elev` is a wish as much as `r` is. */
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

  /* The distance the ladder is solved for: the live rig's, when there is one. */
  function liveCamDist() {
    const rig = DS.R3D && DS.R3D.rig;
    return rig && Number.isFinite(rig.dist) && rig.dist > 4 ? rig.dist : CAM_DIST;
  }

  /* Grow a landmark's freshly emitted boxes about its own foot. */
  function scaleEmitted(o, b0, s0, g0, x, sc) {
    const grow = function (list, from, n) {
      for (let i = from; i < list.length; i++) {
        const e = list[i];
        e[0] = x + (e[0] - x) * sc;
        for (let k = 1; k < n; k++) e[k] *= sc;
      }
    };
    grow(o.boxes, b0, 6);
    grow(o.shards, s0, 5);
    grow(o.glow, g0, 6);
  }

  /* Drop what would breach a roof, and push down what only grazes it. */
  function capToRoof(o, cap) {
    const clip = function (list, hIdx) {
      const kept = [];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b[1] - b[hIdx] * 0.5 > cap) continue;                    // wholly above it
        if (b[1] + b[hIdx] * 0.5 > cap) b[1] = cap - b[hIdx] * 0.5;  // clipped to it
        kept.push(b);
      }
      return kept;
    };
    o.boxes = clip(o.boxes, 4);
    o.shards = clip(o.shards, 4);
    o.glow = clip(o.glow, 4);
  }

  function countDraws(root) {
    let n = 0;
    root.traverse(function (o) {
      if ((o.isMesh || o.isPoints || o.isLine) && o.visible) n++;
    });
    return n;
  }

  function build(env, themeName, w, h, anchorY) {
    if (typeof THREE === 'undefined') return null;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const depth = currentDepth(env);
    const R = resolveVariant(themeName, depth);
    const rec = R.rec;
    const hon = R.hero;
    lastResolved = { theme: themeName, depth: depth, rec: rec, hero: hon, name: R.name };

    const theme = (env && env.theme) || { fog: 0x0e2417, hemiSky: 0x6a8166 };
    const p2u = (env && env.p2u) || 0.1;
    const WU = w * 16 * p2u;
    /* Seeded by the theme, the floor's width AND the depth: two floors of one
       theme never lay their bands out the same way. */
    const rng = DS.makeRng((0x5EEDBA5E ^ hashStr(themeName + ':' + R.name) ^ (w * 131) ^
                            Math.imul(depth | 0, 0x2C1B3C6D)) >>> 0);
    const curve = CURVE[themeName] || { gain: DEFAULT_GAIN, warm: 0.18 };
    const skyGain = curve.gain;
    const fogCol = new THREE.Color((env && env.fogCol) != null ? env.fogCol : theme.fog);
    const fogK = (env && env.fogDensity) != null ? env.fogDensity : DEFAULT_FOG;
    /* The colour the horizon's own values are mixed from. Normally the scene's
       fog; a variant may retint it (the Burning Peak is the Climb's geometry
       under a red sky, and the renderer's fog for `mountain` is blue). */
    const tintFog = rec.fogTint != null ? rec.fogTint : theme.fog;
    const camD = liveCamDist();
    const inRoom = !!rec.ceiling;

    /* The world frame for this floor (worldframe.js): every rectangle of every
       plane the camera can ever see. A caller with no live rig gets no frame and
       falls back to the widest span the old margin implied. */
    const frame = (env && env.frame) || null;
    const covAt = function (d) {
      return frame && DS.WorldFrame ? DS.WorldFrame.coverageAt(d, frame.range, frame.rig) : null;
    };
    const eyeTopRel = frame ? frame.eye.y1 - anchorY : EYE_ABOVE + 1;
    /* The roof of a roofed theme: its authored height, but never lower than
       ROOF_CLEAR over the highest the eye ever gets on this floor. A roof the
       camera can climb through was the dark band across the frame. */
    const roofRel = inRoom ? Math.max(rec.ceiling.y, eyeTopRel + ROOF_CLEAR) : 0;
    /* The sky is pinned to the eye, so it has to reach as far below it as the
       lens looks down at the sky plane -- on a tall floor the ground line is far
       under the eye and the plane must not run out before the frame does. */
    const skySpan = frame && DS.WorldFrame ? DS.WorldFrame.eyeSpan(-SKY_Z, frame.rig) : null;
    const skyDrop = skySpan ? Math.max(SKY_DROP, Math.ceil(skySpan.down * 1.08)) : SKY_DROP;

    backdropAir = [];
    backdropSway = [];
    flock = null;
    followers = [];
    scrolls = [];
    heroRef = null;
    heroAurora = null;
    roomRig = null;
    /* Every shared texture is rebuilt per floor rather than cached across them:
       the renderer disposes every map in the group when the level tears down,
       and a second floor drawn with a freed texture draws garbage. */
    glowBarTex = null; radialTex = null; fanTex = null; flowTex = null; glintTex = null;
    /* And every shared GEOMETRY is made once per floor: all the bands' boxes are
       one unit box, all the crystals one octahedron. */
    const G = {
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      octa: new THREE.OctahedronGeometry(0.5),
      cone: new THREE.ConeGeometry(0.6, 1, 5),
      fan: makeFanGeometry()
    };

    const group = new THREE.Group();
    builtGroup = group;
    const glow = rec.skyGlow != null ? rec.skyGlow : 0.75;
    /* The body's colour is mixed into the haze before anything else: a sky with
       a sun in it is not a neutral sky, and in a backlit shot the whole horizon
       belongs to the light. */
    const heroHaze = mixHex(tintFog, hon.col, M.clamp(curve.warm * 1.1, 0.12, 0.5));
    const hazeHex = mixHex(mixHex(tintFog, heroHaze, 0.15 + 0.95 * glow), 0xffffff, 0.08);
    const report = {
      theme: themeName, variant: R.name, depth: depth, w: w, anchorY: anchorY, gain: skyGain,
      window: 0, wu: WU, camDist: camD, draws: 0, budget: DRAW_BUDGET,
      haze: hazeHex,
      skyValue: new THREE.Color(hazeHex).multiplyScalar(skyGain).getHex(),
      rungs: RUNGS.slice(), layers: [], hero: null, textures: [], fogLift: [],
      roofRel: roofRel, skyDrop: skyDrop, frame: !!frame, frontZ: FRONT_Z, hd: hdOn(),
      range: frame ? frame.range : null, eye: frame ? frame.eye : null
    };

    /* The haze the horizon fades into. The sky's lowest band IS this colour; the
       bands converge on a darker copy of it (a silhouette that matches the sky
       it stands against is a smear, not a ridge), and the far ones lean toward
       the body's own colour: the air between you and a low sun is lit by it. */
    const skyHaze = new THREE.Color(hazeHex).multiplyScalar(skyGain);
    const bandHaze = new THREE.Color(hazeHex).multiplyScalar(0.72 * skyGain + 0.10);
    const heroTint = new THREE.Color(hon.col).multiplyScalar(0.5 * skyGain + 0.12);
    const topHex = new THREE.Color(mixHex(tintFog, 0x000000, 0.35)).multiplyScalar(skyGain);
    if (env && env.scene) env.scene.background = new THREE.Color(topHex);

    /* --- the sky rig -------------------------------------------------------
       Gradient, stars and (in the open) the body live in one group whose origin
       is the EYE LINE (the renderer pins its height every frame) and whose x
       rides the camera's aim (follow(), every frame). So the haze band lands on
       the horizon whatever the camera's height, and the body stays AHEAD of the
       player however far they walk: something at infinity does not scroll. */
    const skyRig = new THREE.Group();
    skyRig.position.set(WU * 0.5, 0, SKY_Z);
    skyRig.userData.follows = true;
    followers.push(skyRig);

    const skyCss = function (col, k) {
      return '#' + (k === 1 ? col : col.clone().multiplyScalar(k)).getHexString();
    };
    const skyMat = new THREE.MeshBasicMaterial({
      map: makeSkyTexture(skyCss(new THREE.Color(topHex), 1),
                          skyCss(new THREE.Color(mixHex(tintFog, heroHaze, 0.18 * glow)), skyGain),
                          skyCss(new THREE.Color(mixHex(mixHex(tintFog, heroHaze, 0.6 * glow), hon.col, 0.22 * glow)), skyGain),
                          '#' + skyHaze.clone().lerp(new THREE.Color(hon.col).multiplyScalar(skyGain), 0.25).getHexString(),
                          skyDrop),
      fog: false, depthWrite: false
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(WU * 4, 900), SKY_H + skyDrop), skyMat);
    sky.position.set(0, (SKY_H - skyDrop) * 0.5, 0);
    sky.frustumCulled = false;
    skyRig.add(sky);

    if (rec.stars) {
      const starN = bandCount(rec.stars, 520);
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(starN * 3);
      for (let i = 0; i < starN; i++) {
        pos[i * 3 + 0] = rng.float(-260, 260);
        pos[i * 3 + 1] = rng.float(4, 70);
        pos[i * 3 + 2] = 0.5;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xcfe0ff, size: rec.stars.size, transparent: true,
        opacity: rec.stars.alpha, sizeAttenuation: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false
      }));
      stars.frustumCulled = false;
      skyRig.add(stars);
    }

    /* --- the body ----------------------------------------------------------
       Open theme: it belongs to the SKY, low over the far ranges, riding the
       eye line with the sky rig. Theme with a roof: it belongs to the ROOM --
       the far end of it, between the landmark and the back wall, under the roof
       -- on a light rig of its own that rides the camera's aim the same way, so
       the room is always lit from the end the player is walking toward. */
    const heroObj = fitRoomHero(hon, rec);
    const offX = (hon.az - 0.5) * (inRoom ? ROOM_HERO_SPAN : SKY_HERO_SPAN);
    let heroParent = skyRig, heroY = heroObj.elev, heroZ = 2;
    if (inRoom) {
      const lightRig = new THREE.Group();
      lightRig.position.set(WU * 0.5, 0, 0);
      lightRig.userData.follows = true;
      followers.push(lightRig);
      group.add(lightRig);
      heroParent = lightRig;
      /* The room's light rides the eye upward too (never below where it was
         built), so a floor that climbs keeps its far light in front of the eye. */
      roomRig = { rig: lightRig, base: anchorY + EYE_ABOVE };
      heroY = anchorY + heroObj.elev;
      heroZ = ROOM_HERO_D;
      /* The room's own glow sits behind the bands between it and the back wall,
         so they stand dark against it; the sky beyond the room (the far end of
         the roof) takes a dimmer copy -- the opening the light comes in by. */
      buildGlowWall(lightRig, heroObj, offX, anchorY + heroObj.elev * 0.35, ROOM_HERO_D - 14, 200, 70);
      buildGlowWall(skyRig, Object.assign({}, heroObj, { glow: (heroObj.glow || 0.3) * 0.45 }),
                    offX, 0, 1, 260, 70);
    } else {
      buildGlowWall(skyRig, heroObj, offX * 0.8, heroObj.elev * 0.3, 1, 300, 110);
    }
    const heroBuilt = buildHero(heroParent, heroObj, offX, heroY, heroZ, rng, G);
    heroRef = heroBuilt;
    heroRef.room = inRoom;
    heroRef.rig = heroParent;
    heroRef.intensity = (hon.gain != null ? hon.gain : 1) * (0.75 + 0.6 * skyGain) * (inRoom ? 0.9 : 1);
    group.add(skyRig);

    /* Where the rim's light comes from, relative to the camera (see rimChunk). */
    const sun = inRoom
      ? { dx: offX, dy: heroObj.elev - EYE_ABOVE, z: ROOM_HERO_D }
      : { dx: offX, dy: heroObj.elev, z: SKY_Z + 2 };

    /* --- the ground --------------------------------------------------------
       Four slabs, each a little paler than the last in toward the horizon, so
       the plain carries its own depth ramp from under the player's feet to the
       sky -- and each carries the rim, so the ground itself shines toward the
       light the way a plain does under a low sun. */
    const groundHex = mixHex(rec.ground != null ? rec.ground : tintFog, hazeHex, 0.3);
    const GSEG = [
      { near: -FRONT_Z, far: 16, tone: 0.5 },
      { near: 16, far: 46, tone: 0.62 },
      { near: 46, far: 88, tone: 0.76 },
      { near: 88, far: GROUND_D, tone: 0.9 }
    ];
    for (let gi = 0; gi < GSEG.length; gi++) {
      const s = GSEG[gi];
      const segCol = new THREE.Color(groundHex).multiplyScalar(s.tone);
      const segOpts = { color: segCol };
      if (gi <= 1 || (gi <= 2 && hdOn())) {
        const t = bandTexture(rec.tex).clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(2, Math.round(WU * 2 / 12)), Math.max(1, Math.round((s.far - s.near) / 8)));
        segOpts.map = t;
        report.textures.push({ where: 'ground' + gi, family: rec.tex || 'granite', rep: [t.repeat.x, t.repeat.y] });
      }
      const segMat = rimMaterial(segOpts, new THREE.Color(hon.col).multiplyScalar(0.12 + 0.12 * gi), sun);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(WU * 2 + 200, 2.6, s.far - s.near), segMat);
      seg.position.set(WU * 0.5, anchorY - 1.3, -(s.near + s.far) * 0.5);
      seg.frustumCulled = false;
      group.add(seg);
    }
    /* Under the plain: solid, to below the lowest the frame ever reaches there.
       A floor that dips under its own ground line then looks at the FACE of the
       ground, not at the void beneath the slabs. */
    {
      const c0 = covAt(-FRONT_Z);
      const bottom = c0 ? Math.min(anchorY - 8, c0.y0 - 6) : anchorY - 40;
      const thick = (anchorY - 2.6) - bottom;
      if (thick > 0.5) {
        const ft = bandTexture(rec.tex).clone();
        ft.needsUpdate = true;
        ft.repeat.set(Math.max(2, Math.round(WU * 2 / 12)), Math.max(1, Math.round(thick / 8)));
        const fm = rimMaterial({ color: new THREE.Color(groundHex).multiplyScalar(0.42), map: ft },
                               new THREE.Color(hon.col).multiplyScalar(0.06), sun);
        const fnd = new THREE.Mesh(new THREE.BoxGeometry(WU * 2 + 200, thick, GROUND_D + FRONT_Z), fm);
        fnd.position.set(WU * 0.5, anchorY - 2.6 - thick * 0.5, -(-FRONT_Z + GROUND_D) * 0.5);
        fnd.frustumCulled = false;
        group.add(fnd);
      }
    }

    /* --- water ---------------------------------------------------------------
       A sheet over the ground from `d0` to the sky: deep water near, the sky's
       own horizon value far (so sea meets sky with no seam and every stack on
       it is black against light), a shimmer that slides, and a glitter path
       under the body that rides the camera with it. Lava is the same sheet,
       glowing. */
    if (rec.water) {
      const W = rec.water;
      const d0 = W.d0 != null ? W.d0 : 12;
      const farZ = -SKY_Z - 2;
      const hc = new THREE.Color(hon.col);
      const nearC = W.lava ? new THREE.Color(W.col) : new THREE.Color(W.col).lerp(skyHaze, 0.2);
      const farC = W.lava
        ? hc.clone().multiplyScalar(0.62).lerp(skyHaze, 0.25)
        : skyHaze.clone().multiplyScalar(0.96).lerp(hc.clone().multiplyScalar(skyGain), 0.18);
      const dash = W.lava ? '#ffc070' : '#' + farC.clone().lerp(hc, 0.45).multiplyScalar(1.35).getHexString();
      const wt = makeWaterTexture('#' + nearC.getHexString(), '#' + farC.getHexString(), dash);
      wt.repeat.set(Math.max(2, Math.round((WU * 2 + 200) / 10)), 1);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(WU * 2 + 200, farZ - d0),
        new THREE.MeshBasicMaterial({ map: wt, fog: false }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(WU * 0.5, anchorY + 0.03, -(d0 + farZ) * 0.5);
      water.frustumCulled = false;
      group.add(water);
      scrolls.push({ tex: wt, dx: W.lava ? 0.01 : 0.02, dy: 0 });

      const glintRig = new THREE.Group();
      glintRig.position.set(WU * 0.5, 0, 0);
      glintRig.userData.follows = true;
      followers.push(glintRig);
      const reach = inRoom ? -ROOM_HERO_D : farZ;
      const gl = new THREE.Mesh(makeGlintGeometry(d0 + 0.5, reach, 0.8, heroObj.r * 1.05),
        additive({ map: makeGlintTexture(), color: hon.col, opacity: W.lava ? 0.35 : 0.62 }));
      gl.position.set(offX * 0.85, anchorY + 0.07, 0);
      gl.frustumCulled = false;
      glintRig.add(gl);
      group.add(glintRig);
      scrolls.push({ tex: glintTex, dx: 0, dy: -0.06 });
    }

    /* --- the ladder --------------------------------------------------------- */
    const layers = rec.layers || [];
    /* Nothing in a roofed room may poke through the roof: a far band is scaled
       up by its rung, so the roof in its own authored units is lower. */
    const roofAuth = roofRel;   // the roof's underside, over the ground line
    let flowOn = false;
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const d = L.d != null ? L.d : REF_D;
      const k = L.k != null ? L.k : (camD + d) / (camD + REF_D);
      const kind = BACKDROP_KINDS[L.kind];
      if (!kind) continue;
      const o = { boxes: [], shards: [], glow: [] };
      const sc = L.scale || 1;
      /* How much of this band the camera can EVER see, in its own units: the
         floor plus the widest frame at this distance (zoomed out, with the
         side-on rig's lens as the worst case), scaled back by the rung. A far
         band scaled 3.8x does not need 3.8 floors of rock. */
      const margin = 0.72 * (camD * 1.2 + d) + 6;
      const cov = covAt(d);
      /* v7: the span comes from the world frame -- exactly what the camera can
         see of this plane on this floor -- mapped into the band's own units (the
         group is scaled by k about the floor's centre). */
      const lx0 = cov ? (cov.x0 - WU * 0.5 * (1 - k)) / k : WU * 0.5 - (WU * 0.5 + margin) / k;
      const lx1 = cov ? (cov.x1 - WU * 0.5 * (1 - k)) / k : WU * 0.5 + (WU * 0.5 + margin) / k;
      /* A kind that builds a WHOLE band (a wall with openings, a river) is
         called once and told the span it has to fill, in its own units: the x
         range the camera can see, where world x = 0 falls in it, and how high
         and low the frame reaches at this plane. */
      const whole = !!kind.whole || !!L.whole;
      const n = whole ? 1 : bandCount(L, lx1 - lx0);
      const Lk = Object.assign({}, L, {
        span: {
          lx0: lx0, lx1: lx1, k: k, WU: WU, originX: (0 - WU * 0.5 * (1 - k)) / k,
          top: cov ? (cov.y1 - anchorY) / k : 30, bottom: cov ? (cov.y0 - anchorY) / k : -10
        }
      });
      /* `hang`: a thing that hangs from the roof (a chandelier, a cage's beam)
         hangs from THE roof -- its beam is put at the roof's underside. */
      if ((L.kind === 'stalactites' || L.hang) && roofRel) Lk.roof = roofRel / k;
      if (L.hang && roofRel) Lk.top = roofRel / k;
      for (let j = 0; j < n; j++) {
        /* Stratified: one object per slot, jittered inside it, so a band has
           no clumps and no holes -- a gap in a range reads as a missing tile. */
        const x = whole ? (lx0 + lx1) * 0.5 : L.solo
          ? WU * 0.5 + (rng.float(0.32, 0.68) * WU - WU * 0.5) / k
          : lx0 + (j + rng.float(0.1, 0.9)) * ((lx1 - lx0) / n);
        const b0 = o.boxes.length, s0 = o.shards.length, g0 = o.glow.length;
        kind(o, x, rng, Lk);
        if (sc !== 1) scaleEmitted(o, b0, s0, g0, x, sc);
      }
      if (roofAuth) capToRoof(o, roofAuth / k);

      /* Aerial perspective. Every far band is mixed toward the horizon haze
         -- leaning, with distance, toward the body's own colour -- until it is
         a pale ghost of the near one. A band that is its own light keeps most
         of its colour. The fog is taken back out FIRST, so the mix is against
         the value the recipe meant. */
      const far = M.clamp((d - REF_D) / 34, 0, 1);
      const hazeT = Math.pow(far, 0.75) * (rec.haze != null ? rec.haze : 0.75) * (L.glow ? 0.35 : 1);
      const target = bandHaze.clone().lerp(heroTint, far * 0.35);
      const proc = function (hex, t) {
        return unfog(new THREE.Color(hex), camD + d, fogCol, fogK).lerp(target, t);
      };
      const col = proc(L.col, hazeT);
      /* The near rung keeps a touch more of its own light, and no more than a
         touch: the whole depth read depends on the near band being the DARK one. */
      if (!L.glow) col.multiplyScalar(1 + (1 - far) * 0.12);
      const palette = [
        col,
        col.clone().multiplyScalar(0.72),
        col.clone().multiplyScalar(1.28),
        proc(L.cap != null ? L.cap : 0xdfe7f2, hazeT * 0.7).multiplyScalar(inRoom ? 0.5 : 0.62),
        proc(L.accent != null ? L.accent : L.col, hazeT)
      ];

      /* The texture: every rung out to TEX_AT carries one, its repeat solved
         from the rung's scale and the size of what it emitted, so texel density
         is constant up the ladder. */
      let texRep = 0, meanSize = 0;
      /* v6 laid texture on the rungs out to TEX_AT only; a photo-scan is mip-mapped
         and holds up at any distance, so with HD every rung carries one. */
      const useTex = !L.glow && (d <= TEX_AT || hdOn());
      const matOpts = { color: 0xffffff };
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

      /* The rim (see rimMaterial): brighter with distance, because what reads as
         a lit edge on a far ridge is the air round it catching the light too. */
      const rimK = (rec.rim != null ? rec.rim : 1) * (L.rim != null ? L.rim : 1) * (0.3 + 0.7 * far) * 0.9;
      const mat = L.glow
        ? new THREE.MeshBasicMaterial(Object.assign(
            { transparent: true, opacity: L.alpha != null ? L.alpha : 0.85, depthWrite: false }, matOpts))
        : rimMaterial(matOpts, new THREE.Color(hon.col).multiplyScalar(rimK), sun);

      /* One scale for the whole band about its base: authored in reference
         units, enlarged by exactly the factor that its distance grew by. */
      const layerGroup = new THREE.Group();
      layerGroup.position.set(WU * 0.5 * (1 - k), anchorY, -d);
      layerGroup.scale.setScalar(k);
      layerGroup.userData.anchor = (L.hang && roofRel) ? 'roofhang' : (L.kind === 'stalactites' && roofRel) ? 'roof'
        : (FREE_KINDS[L.kind] || L.glow) ? 'free' : 'ground';
      layerGroup.userData.kind = L.kind;
      if (o.boxes.length) layerGroup.add(instancedBoxes(o.boxes, mat, 0.22, palette, G.box));
      if (o.shards.length) {
        const shape = SHARD_SHAPES[L.kind] || 'coneDown';
        layerGroup.add(instancedShards(o.shards, mat, shape === 'octa' ? G.octa : G.cone,
                                       shape === 'coneDown', 0.2, palette));
      }
      if (o.glow.length) {
        const gc = new THREE.Color(L.glowCol != null ? L.glowCol : hon.col).multiplyScalar(1 - far * 0.3);
        const gpal = [gc, gc.clone().multiplyScalar(0.5), gc.clone().multiplyScalar(0.25)];
        const gopts = { color: 0xffffff, opacity: L.glowA != null ? L.glowA : 0.9 };
        if (L.flow) { gopts.map = makeFlowTexture(); flowOn = true; }
        layerGroup.add(instancedBoxes(o.glow, additive(gopts), 0, gpal, G.box));
      }
      group.add(layerGroup);

      report.layers.push({
        kind: L.kind, d: d, k: +k.toFixed(3), n: o.boxes.length + o.shards.length,
        glowN: o.glow.length, dropped: 0,
        col: '#' + col.getHexString(), glow: !!L.glow, tex: useTex ? (L.tex || rec.tex || 'granite') : '',
        texRep: texRep, mean: +meanSize.toFixed(3), solo: !!L.solo
      });

      const sway = SWAY_KINDS[L.kind];
      if (sway && sway.bob && !L.solo) {
        backdropSway.push({
          obj: layerGroup, base: layerGroup.position.x, baseY: layerGroup.position.y,
          bob: sway.bob * k, spd: sway.spd, phase: rng.float(0, 6.28)
        });
      } else if (L.kind === 'clouds') {
        backdropSway.push({
          obj: layerGroup, base: layerGroup.position.x, baseY: layerGroup.position.y,
          bob: 0, spd: 0.2, phase: rng.float(0, 6.28),
          drift: CLOUD_DRIFT * (1 - far * 0.5), spanX: WU * 1.2
        });
      }
    }
    if (flowOn) scrolls.push({ tex: flowTex, dx: 0, dy: 0.9 });

    /* An underground theme gets a roof: one long slab with teeth under it, which
       is what tells the eye "this room has a roof". It runs PAST the sky, because
       a roof that stops short shows a stripe of daylight past its own end.

       v7: the slab starts BEHIND the play plane (FRONT_Z) -- it used to run from
       z = +2 back, straight through the tiles and the hero, which is the dark band
       that crossed the frame -- and sits at roofRel, which the frame keeps above
       the highest the eye ever gets. Its teeth are rooted IN its underside. */
    if (rec.ceiling) {
      const c = rec.ceiling;
      const cmat = new THREE.MeshLambertMaterial({ color: mixHex(c.col, hazeHex, 0.14) });
      const cg = new THREE.Group();
      cg.position.y = anchorY;
      const roofNear = -FRONT_Z + 0.2;
      const depthC = GROUND_D + 46 - roofNear;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(WU * 1.6 + 200, 2.0, depthC), cmat);
      slab.position.set(WU * 0.5, roofRel + 1.0, -(roofNear + depthC * 0.5));
      slab.frustumCulled = false;
      cg.add(slab);
      const teeth = [];
      const toothCount = bandCount({ sp: 4.5 }, WU);
      const tc = covAt(REF_D);
      const tx0 = tc ? tc.x0 : -0.04 * WU, tx1 = tc ? tc.x1 : 1.04 * WU;
      for (let i = 0; i < toothCount; i++) {
        const th = rng.float(1.0, 2.6);
        box(teeth, rng.float(tx0, tx1), roofRel - th * 0.5 + 0.1, rng.float(-26, FRONT_Z - 1),
            rng.float(0.7, 1.6), th, rng.float(0.7, 1.6));
      }
      const toothMesh = instancedBoxes(teeth, cmat, 0.3, null, G.box);
      toothMesh.userData.anchor = 'roof';
      cg.add(toothMesh);
      group.add(cg);
    }

    /* The shafts, for the themes whose light comes down through the roof. */
    if (hon.kind === 'shaft' && inRoom) {
      buildShafts(group, hon, WU, anchorY, roofRel, rng, G);
    }

    if (rec.mist) { const m = backdropMotes(rec.mist, WU, anchorY, rng); m.frustumCulled = false; group.add(m); }
    if (rec.ember) { const m = backdropMotes(rec.ember, WU, anchorY, rng); m.frustumCulled = false; group.add(m); }

    /* Living silhouettes belong to a sky: birds under a stone ceiling would be
       the one thing that breaks the read of the room. */
    if (!inRoom) buildSkyLife(group, rec, WU, anchorY, rng, G);

    report.hero = {
      kind: hon.kind, col: '#' + hon.col.toString(16).padStart(6, '0'),
      az: hon.az, elev: heroObj.elev, r: heroObj.r,
      z: 0, worldX: 0, worldY: null,
      room: inRoom,
      clamped: heroObj.r !== hon.r || heroObj.elev !== hon.elev,
      glow: heroObj.glow != null ? heroObj.glow : 0.14,
      follows: true
    };
    heroRef.report = report.hero;
    updateHeroReport();
    report.draws = countDraws(group);
    report.buildMs = typeof performance !== 'undefined' ? +(performance.now() - t0).toFixed(1) : 0;
    lastReport = report;
    return { group: group, skyRig: skyRig, hero: heroRef, report: report };
  }

  /* Where the body is, in the horizon group's own frame, written into the
     report every frame: the QA projects the report's numbers and measures the
     pixels round them, so they must describe the object as it is NOW (it rides
     the camera), not as it was built. A body in the sky has no fixed height --
     it rides the eye line -- and reports null. */
  function updateHeroReport() {
    if (!heroRef || !heroRef.report) return;
    const rig = heroRef.rig, g = heroRef.group;
    heroRef.report.worldX = rig.position.x + g.position.x;
    heroRef.report.z = rig.position.z + g.position.z;
    heroRef.report.worldY = heroRef.room ? rig.position.y + g.position.y : null;
  }

  /* Ride the camera. The aim is where the camera's view crosses the actor
     plane (z = 0), taken into the horizon group's own frame so a turned rig
     (F6) is handled by the same inverse that handles the horizon's height
     shift. Every follower -- the sky, a room's light, the glitter path -- is
     set to it. Allocation-free: it runs every frame. */
  function follow() {
    if (!builtGroup || !followers.length) return;
    const cam = DS.R3D && DS.R3D.camera;
    if (!cam) return;
    const t = scratch();
    cam.getWorldDirection(t.dir);
    if (Math.abs(t.dir.z) < 1e-4) return;
    const s = -cam.position.z / t.dir.z;
    t.aim.copy(cam.position).addScaledVector(t.dir, s > 0 ? s : 0);
    builtGroup.worldToLocal(t.aim);
    if (!Number.isFinite(t.aim.x)) return;
    for (let i = 0; i < followers.length; i++) followers[i].position.x = t.aim.x;
    if (roomRig) {
      t.eye.copy(cam.position);
      builtGroup.worldToLocal(t.eye);
      if (Number.isFinite(t.eye.y)) roomRig.rig.position.y = Math.max(0, t.eye.y - roomRig.base);
    }
    updateHeroReport();
  }

  /* The light, for the renderer: where the body is in WORLD space this frame,
     its colour and how hard it should push the back light. The same object is
     returned every call (no allocation); null when there is no horizon. */
  function heroInfo() {
    if (!heroRef || !heroRef.group || !builtGroup || !builtGroup.parent) return null;
    follow();
    const t = scratch();
    heroRef.group.getWorldPosition(t.info.worldPos);
    t.info.color.setHex(heroRef.col);
    t.info.intensity = heroRef.intensity * (1 + Math.sin(lastTime * 0.5) * 0.04);
    return t.info;
  }

  /* One step of every backdrop motion. Called once a frame with the render
     clock so the horizon keeps its own time (the bands are not simulated).
     Nothing here allocates, writes a light, or flags a material for a rebuild. */
  function update(time, dt) {
    /* A step of 0 is a frame with no sim time in it (a paused loop, or a QA that
       steps by hand): the horizon holds still with it. */
    const step = dt >= 0 && dt < 0.1 ? dt : 0.016;
    lastTime = time;
    follow();

    for (let i = 0; i < backdropAir.length; i++) {
      const a = backdropAir[i];
      const pos = a.pts.geometry.attributes.position.array;
      for (let j = 0; j < pos.length; j += 3) {
        pos[j]     += a.vel[j]     * step;
        pos[j + 1] += a.vel[j + 1] * step;
        if (a.vel[j] > 0 && pos[j] > a.spanX) pos[j] = -a.spanX * 0.05;
        else if (a.vel[j] < 0 && pos[j] < -a.spanX * 0.05) pos[j] = a.spanX;
        if (a.vel[j + 1] > 0 && pos[j + 1] > a.topY) pos[j + 1] = a.botY;
        else if (a.vel[j + 1] < 0 && pos[j + 1] < a.botY) pos[j + 1] = a.topY;
      }
      a.pts.geometry.attributes.position.needsUpdate = true;
      /* A slow swell in the opacity, so a bank of mist reads as air rather
         than as a fixed scattering of dots. */
      a.pts.material.opacity = a.pts.material.opacity * (1 - a.pulse * step * 2)
        + a.pulse * (1 + Math.sin(time * 0.6 + i) * 0.5) * step * 2;
    }

    for (let i = 0; i < backdropSway.length; i++) {
      const s = backdropSway[i];
      if (s.bob) s.obj.position.y = s.baseY + Math.sin(time * s.spd + s.phase) * s.bob;
      if (s.drift) {
        s.obj.position.x += s.drift * step;
        if (s.obj.position.x > s.base + s.spanX * 0.5) s.obj.position.x = s.base - s.spanX * 0.5;
      }
    }

    if (flock) {
      const B = flock.birds, span = flock.spanX;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        b.x += b.speed * step;
        if (b.speed > 0 && b.x > span) b.x = -span * 0.15;
        else if (b.speed < 0 && b.x < -span * 0.15) b.x = span;
      }
      placeFlock(time);
    }

    for (let i = 0; i < scrolls.length; i++) {
      const s = scrolls[i];
      if (!s.tex) continue;
      s.tex.offset.x = (s.tex.offset.x + s.dx * step) % 1;
      s.tex.offset.y = (s.tex.offset.y + s.dy * step) % 1;
    }

    /* The body. A sun's rays turn, a halo breathes, the shafts sway and swell,
       the aurora drifts. */
    if (heroRef) {
      if (heroRef.rays) heroRef.rays.rotation.z = time * 0.045;
      for (let i = 0; i < heroRef.halos.length; i++) {
        const h = heroRef.halos[i];
        h.material.opacity = (i === 0 ? 0.24 : 0.11)
          * (1 + Math.sin(time * 0.5 + i * 0.9) * 0.10);
      }
      if (heroRef.fan) {
        heroRef.fan.rotation.z = Math.sin(time * 0.07) * 0.06;
        heroRef.fan.material.opacity = heroRef.fanBase * (1 + Math.sin(time * 0.37) * 0.18);
      }
    }
    if (heroAurora) heroAurora.position.x = Math.sin(time * 0.05) * 3;
  }

  /* v7: a place brings its own horizon (DS.Maps.define): the recipe, the body
     it hangs its light on and its light curve. */
  /* `like` starts a place from an authored theme (and, with `variant`, one of
     its variants): the recipe is that one's, with whatever `recipe` names laid
     over it (layers replace the whole ladder), the body the same with `hero`
     laid over it, and the curve inherited unless given. The place then owns its
     copy: it never reads its own variant pool, so one place is one picture. */
  function registerTheme(name, def) {
    if (RECIPE[name]) throw new Error('DS.Backdrop.registerTheme: ' + name + ' already exists');
    let rec = def.recipe || {}, hero = def.hero, curve = def.curve;
    if (def.like) {
      const base = RECIPE[def.like];
      if (!base) throw new Error('DS.Backdrop.registerTheme: ' + name + ' is like ' + def.like + ', which does not exist');
      let v = null;
      if (def.variant) {
        v = (base.variants || []).filter(function (x) { return x.name === def.variant; })[0];
        if (!v) throw new Error('DS.Backdrop.registerTheme: ' + def.like + ' has no variant ' + def.variant);
      }
      rec = Object.assign({}, base, v || {}, rec);
      delete rec.variants; delete rec.acts; delete rec.when; delete rec.name;
      hero = Object.assign({}, HEROES[def.like], v && v.hero, hero);
      curve = curve || CURVE[def.like];
    }
    RECIPE[name] = rec;
    if (hero) HEROES[name] = hero;
    if (curve) CURVE[name] = curve;
  }

  DS.Backdrop = {
    registerTheme: registerTheme,
    build: build,
    update: update,
    heroInfo: heroInfo,
    /* The recipe a theme gets: on the floor being played, its variant. */
    recipe: function (name) {
      if (lastResolved && lastResolved.theme === name) return lastResolved.rec;
      return RECIPE[name] || RECIPE.forest;
    },
    hero: function (name) { return resolvedHero(name); },
    /* The body a theme will ACTUALLY get: authored radius trimmed to the room it
       hangs in, elevation pinned inside what is left. */
    heroFit: function (name) {
      return fitRoomHero(resolvedHero(name), DS.Backdrop.recipe(name));
    },
    /* Every horizon a theme can show -- the base and its variants -- resolved,
       for the structure checks (each must use the whole ladder too). */
    variants: function (name) {
      const base = RECIPE[name] || RECIPE.forest;
      const out = [{ name: 'base', rec: base, hero: HEROES[name] || HEROES.forest }];
      (base.variants || []).forEach(function (v) {
        out.push({ name: v.name, rec: Object.assign({}, base, v),
                   hero: Object.assign({}, HEROES[name] || HEROES.forest, v.hero || {}) });
      });
      return out;
    },
    variantFor: function (name, depth) { return resolveVariant(name, depth).name; },
    curve: function (name) { return CURVE[name] || { gain: DEFAULT_GAIN, warm: 0.18 }; },
    heroLight: heroLight,
    themeNames: function () { return Object.keys(RECIPE); },
    rungs: RUNGS,
    groundD: GROUND_D,
    skyZ: SKY_Z,
    skyH: SKY_H,
    skyDrop: SKY_DROP,
    texAt: TEX_AT,
    drawBudget: DRAW_BUDGET,
    /* How far `az` moves a body off the camera's aim, in world units: the QA
       holds the live body to aim + (az - 0.5) * span. */
    heroSpan: { sky: SKY_HERO_SPAN, room: ROOM_HERO_SPAN },
    families: TEX_FAMILIES,
    kinds: BACKDROP_KINDS,
    /* What a kind written in another file (src/core/backdrop/kinds-*.js) needs
       from this one: the box writer and the ridge machinery. */
    helpers: { box: box, coinTone: coinTone, hash01: hash01, ridgeProfile: ridgeProfile,
               ridgeColumns: ridgeColumns, ridgeHeight: ridgeHeight },
    get report() { return lastReport; },
    /* Shared with the renderer: the water batches build their own instanced
       boxes and must not grow a second copy of the same helper. */
    instancedBoxes: instancedBoxes,
    instancedShards: instancedShards
  };
  /* The name the renderer's rim + god-ray pass looks for first. */
  DS.Backdrop3D = DS.Backdrop;

})(window.DS);
