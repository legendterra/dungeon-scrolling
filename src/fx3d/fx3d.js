/* DS.FX3D - the shared, pooled 3D effects layer.

   Six systems, six draw calls, all fixed-size and allocation-free after init:

     add    additive billboards  (sparks, glows, flames, arcs of light)
     soft   alpha billboards     (smoke, mist, leaves, bubbles, droplets)
     glow   additive voxel cubes (ice chips, embers, crystal shards)
     rock   lit voxel cubes      (debris, pebbles, gore) - they bounce
     rib    ribbon trails        (weapon swings, arrows, orbs, dashes)
     arcs   slash crescents and shockwave rings

   Everything else in src/fx3d/ is data and presets written against the small
   helper API below, and the public surface is deliberately tiny:

     DS.FX3D.spawn(name, x, y, opts)   play a preset at a GAME PIXEL position
     DS.FX3D.at(name, X, Y, Z, opts)   ... or at a world position (units)
     DS.FX3D.live()                    true when the voxel world is being drawn
                                       this frame, i.e. when FX should be 3D

   Coordinates: 1 game pixel = 0.1 world units, +y is up in the world and down
   in the game, and actors stand in the plane z = 0.3 (see renderer3d.js).

   Time runs on GAME FRAMES, not on wall-clock: the renderer calls update()
   with the game's frame counter, so the effects advance exactly as fast as the
   fight does. During hitstop they crawl at a fraction of speed - the swing and
   its sparks hang in the air for the freeze frames, which is what sells the
   weight of a hit. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const P2U = 0.1;
  const ACTOR_Z = 0.3;
  const HITSTOP_RATE = 0.3;

  // Pool sizes. Sized for a crowded boss fight on 'high'; spawns past them
  // recycle the oldest slots rather than growing anything.
  const CAP = { add: 1400, soft: 420, glow: 260, rock: 220, ribbons: 14, ribbonSamples: 22, arcs: 28 };

  const F = {};
  let ready = false;
  let root = null;
  let lastFrame = -1;
  let clock = 0;               // FX time in (possibly slowed) frames
  let renderStamp = -100;      // game frame of the last voxel render
  let advanced = false;        // did the last update move time forward?
  let qScale = 1;
  let density = 1;         // v7 options: 0.25..1

  F.P2U = P2U;
  F.Z = ACTOR_Z;

  function init(scene, camera) {
    if (ready || !scene || !window.THREE || !DS.FX3DSprites) return ready;
    root = new THREE.Group();
    root.name = 'fx3d';
    /* Render order: the soft (alpha) layer first so the additive glow lands on
       top of the smoke it shines through; debris is opaque and sorts itself. */
    F.rock = DS.FX3DCubes.create(CAP.rock, true, 0);
    F.soft = DS.FX3DSprites.create(CAP.soft, false, 5);
    F.glow = DS.FX3DCubes.create(CAP.glow, false, 6);
    F.arcs = DS.FX3DArcs.create(CAP.arcs, 7);
    F.rib = DS.FX3DRibbons.create(CAP.ribbons, CAP.ribbonSamples, 8);
    F.add = DS.FX3DSprites.create(CAP.add, true, 9);
    F.rib.setCamera(camera);
    root.add(F.rock.mesh, F.soft.mesh, F.glow.mesh, F.arcs.mesh, F.rib.mesh, F.add.mesh);
    scene.add(root);
    F.camera = camera;
    ready = true;
    return true;
  }

  /* Called by the renderer once per drawn frame, with the game frame counter. */
  function update(frames, hitstop) {
    if (!ready) return;
    renderStamp = frames;
    let steps = lastFrame < 0 ? 1 : frames - lastFrame;
    if (steps < 0 || steps > 6) steps = 1;          // a level reload or a stall
    lastFrame = frames;
    const dt = steps * (hitstop > 0 ? HITSTOP_RATE : 1);
    advanced = steps > 0;
    clock += dt;
    const q = DS.PostFX && DS.PostFX.quality;
    qScale = (q === 'low' ? 0.55 : 1) * density;
    if (F.runLater) F.runLater();
    F.add.update(dt);
    F.soft.update(dt);
    F.glow.update(dt);
    F.rock.update(dt);
    F.rib.update(dt, clock);
    F.arcs.update(clock);
  }

  function clear() {
    if (!ready) return;
    F.add.clear(); F.soft.clear(); F.glow.clear(); F.rock.clear();
    F.rib.clear(); F.arcs.clear();
    if (F.onClear) F.onClear();
  }

  /* FX go 3D only while the voxel world is actually on screen. The 2D path
     stays the fallback everywhere else (voxels off, menus, cutscenes). */
  function live() {
    if (!ready || !DS.R3D || !DS.R3D.voxels) return false;
    const g = DS.currentGame;
    return !!g && g.frames - renderStamp < 4;
  }

  // --- helpers the presets are written in --------------------------------------

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }
  function n(count) { return Math.max(1, Math.round(count * qScale)); }

  // hex -> spec colour (start), scaled by an intensity
  function col(s, hex, mul) {
    const m = mul == null ? 1 : mul;
    s.r = (hex >> 16 & 255) / 255 * m; s.g = (hex >> 8 & 255) / 255 * m; s.b = (hex & 255) / 255 * m;
    return s;
  }
  function col1(s, hex, mul) {
    const m = mul == null ? 1 : mul;
    s.r1 = (hex >> 16 & 255) / 255 * m; s.g1 = (hex >> 8 & 255) / 255 * m; s.b1 = (hex & 255) / 255 * m;
    return s;
  }
  function cssHex(css) {
    if (typeof css === 'number') return css;
    if (!css || css.charAt(0) !== '#') return 0xffffff;
    let h = css.slice(1);
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return parseInt(h.slice(0, 6), 16) || 0;
  }
  function wx(px) { return px * P2U; }
  function wy(py) { return -py * P2U; }

  /* Where the floor is under a game-pixel point, in world y (for bouncing
     debris and ground rings). Falls back to the point itself. */
  function floorY(px, py) {
    const g = DS.currentGame;
    const map = g && g.map;
    if (!map || !map.floorBelow) return wy(py + 8);
    const fb = map.floorBelow(Math.floor(px / 16), Math.floor(py / 16));
    return fb < map.pixelH ? -fb * P2U : wy(py + 8);
  }

  // A soft additive glow: the building block of flashes and motes.
  function glowAt(X, Y, Z, size, hex, hot, life, size1) {
    const s = F.add.spec();
    s.x = X; s.y = Y; s.z = Z; s.size = size; s.size1 = size1 == null ? size * 1.3 : size1;
    s.life = life || 10; s.cell = 0; s.a = 1; s.a1 = 0;
    col(s, hex, hot || 1.5);
    return F.add.emit(s);
  }

  // A velocity-stretched spark.
  function sparkAt(X, Y, Z, vx, vy, vz, hex, hot, life, size, stretch, grav, drag) {
    const s = F.add.spec();
    s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.vz = vz;
    s.grav = grav || 0; s.drag = drag == null ? 0.86 : drag;
    s.life = life || 10; s.size = size || 0.05; s.size1 = (size || 0.05) * 0.4;
    s.mode = 1; s.stretch = stretch == null ? 2.2 : stretch; s.cell = 1; s.aspect = 2.5;
    col(s, hex, hot || 2);
    s.a = 1; s.a1 = 0.2;
    return F.add.emit(s);
  }

  // A burst of sparks spraying from a point, optionally biased along (dx, dy).
  function sparkBurst(X, Y, Z, count, hex, speed, dx, dy, spread, hot, life) {
    const k = n(count);
    for (let i = 0; i < k; i++) {
      const base = dx == null ? rnd(0, Math.PI * 2) : Math.atan2(dy, dx);
      const a = base + (dx == null ? 0 : rnd(-spread, spread));
      const sp = speed * rnd(0.45, 1.15);
      sparkAt(X, Y, Z, Math.cos(a) * sp, Math.sin(a) * sp, rnd(-0.4, 0.4) * sp,
              hex, hot, (life || 11) * rnd(0.7, 1.2), rnd(0.035, 0.06), 2.4, 0.004, 0.86);
    }
  }

  // Smoke / dust / mist puff in the alpha layer.
  function puffAt(X, Y, Z, vx, vy, vz, size, size1, hex, alpha, life) {
    const s = F.soft.spec();
    s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.vz = vz; s.drag = 0.93;
    s.size = size; s.size1 = size1; s.life = life || 30; s.cell = 3;
    s.rot = rnd(0, 6.28); s.spin = rnd(-0.03, 0.03);
    col(s, hex, 1);
    s.a = alpha == null ? 0.55 : alpha; s.a1 = 0; s.fadeIn = 0.12;
    return F.soft.emit(s);
  }

  // Debris chunk: a lit cube that tumbles and lands.
  function chunkAt(X, Y, Z, vx, vy, vz, size, hex, life, floor) {
    const s = F.rock.spec();
    s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.vz = vz;
    s.grav = 0.012; s.drag = 0.985; s.life = life || 40; s.size = size;
    s.rx = rnd(0, 6.28); s.ry = rnd(0, 6.28); s.rz = rnd(0, 6.28);
    s.wx = rnd(-0.3, 0.3); s.wy = rnd(-0.3, 0.3); s.wz = rnd(-0.3, 0.3);
    s.floor = floor == null ? -1e9 : floor; s.bounce = 0.3;
    col(s, hex, 1);
    return F.rock.emit(s);
  }

  // Glowing chip: an additive cube (ice, embers, crystal).
  function chipAt(X, Y, Z, vx, vy, vz, size, hex, hot, life, grav, kx, ky) {
    const s = F.glow.spec();
    s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.vz = vz;
    s.grav = grav == null ? 0.006 : grav; s.drag = 0.95; s.life = life || 24; s.size = size;
    s.size1 = size * 0.5;
    s.rx = rnd(0, 6.28); s.ry = rnd(0, 6.28); s.rz = rnd(0, 6.28);
    s.wx = rnd(-0.2, 0.2); s.wy = rnd(-0.2, 0.2); s.wz = rnd(-0.2, 0.2);
    s.kx = kx || 1; s.ky = ky || 1; s.kz = kx || 1;
    col(s, hex, hot || 1.6); s.a = 1; s.a1 = 0;
    return F.glow.emit(s);
  }

  // A ring or shock in some plane.
  function ringAt(X, Y, Z, r0, r1, width, hex, edgeHex, hot, life, style, ground) {
    const s = F.arcs.spec();
    s.x = X; s.y = Y; s.z = Z;
    if (ground) {
      // Flat on the floor, tipped toward the camera so it reads as a ring.
      s.ux = 1; s.uy = 0; s.uz = 0; s.vx = 0; s.vy = 0.3; s.vz = 0.954;
    }
    s.r0 = r0; s.r1 = r1; s.width = width; s.style = style || 0;
    s.core = hex; s.edge = edgeHex == null ? hex : edgeHex; s.hot = hot || 1.4; s.life = life || 20;
    return F.arcs.emit(s);
  }

  // --- presets -----------------------------------------------------------------

  const PRESETS = {};

  function register(name, fn) { PRESETS[name] = fn; }

  /* Play a preset at a world position. opts is passed through untouched; the
     presets never keep it, so callers may reuse one object. */
  function at(name, X, Y, Z, opts) {
    if (!ready) return false;
    const fn = PRESETS[name];
    if (!fn) return false;
    fn(X, Y, Z == null ? ACTOR_Z : Z, opts || EMPTY);
    return true;
  }
  const EMPTY = {};

  function spawn(name, x, y, opts) {
    return at(name, x * P2U, -y * P2U, ACTOR_Z, opts);
  }

  /* The element layer announces two moments through hooks on the game object:
     g.onInfuse(item, element) when a weapon takes an element, and
     g.onElementPassive(key, target) when a weapon's element passive fires.
     Installed once per run (chained to anything already there). */
  const HOOK = { dir: 1, el: null };
  function hook(g) {
    if (!g || g.fx3dHooked) return;
    g.fx3dHooked = true;
    const prevInfuse = g.onInfuse, prevPassive = g.onElementPassive;
    g.onInfuse = function (item, element) {
      if (prevInfuse) prevInfuse(item, element);
      const p = g.player;
      if (!live() || !p) return;
      HOOK.el = element; HOOK.dir = p.facing || 1;
      spawn('infuse', p.x + p.w / 2, p.y + p.h / 2, HOOK);
    };
    g.onElementPassive = function (key, target) {
      if (prevPassive) prevPassive(key, target);
      if (!live() || !target) return;
      HOOK.el = key;
      spawn('passive', target.x + target.w / 2, target.y + target.h / 2, HOOK);
    };
  }

  function stats() {
    if (!ready) return null;
    return {
      add: F.add.count, soft: F.soft.count, glow: F.glow.count, rock: F.rock.count,
      ribbons: F.rib.live, arcs: F.arcs.live, capacity: CAP,
      drawCalls: [F.add, F.soft, F.glow, F.rock, F.rib, F.arcs]
        .filter(function (sys) { return sys.mesh.visible; }).length
    };
  }

  Object.assign(F, {
    CAP: CAP,
    init: init, update: update, clear: clear, live: live,
    rnd: rnd, pick: pick, n: n, col: col, col1: col1, cssHex: cssHex, wx: wx, wy: wy,
    floorY: floorY, glowAt: glowAt, sparkAt: sparkAt, sparkBurst: sparkBurst,
    puffAt: puffAt, chunkAt: chunkAt, chipAt: chipAt, ringAt: ringAt,
    PRESETS: PRESETS, register: register, at: at, spawn: spawn, stats: stats, hook: hook,
    setDensity: function (d) { density = Math.min(1, Math.max(0.25, +d || 1)); }
  });

  /* Live state as real getters: Object.assign would copy their values once
     and freeze them (ready would read false forever). */
  Object.defineProperties(F, {
    ready: { get: function () { return ready; }, enumerable: true },
    advanced: { get: function () { return advanced; }, enumerable: true },
    clock: { get: function () { return clock; }, enumerable: true },
    quality: { get: function () { return qScale; }, enumerable: true }
  });

  DS.FX3D = F;
})(window.DS);
