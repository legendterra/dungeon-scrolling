/* FX3D presets: the named effects the game plays.

   Attack presets are spawned at the moment a swing STRIKES (after its
   anticipation frames), at the hero's centre, with opts:
     dir    +1 / -1, the swing's facing
     el     the weapon's active element key, or null
     power  1 for a light step, more for charged blows
     reach  the hitbox reach in game pixels (sizes the crescents)

   Crescents are laid out in a LOCAL frame - x forward (mirrored by dir), y up,
   z toward the camera - so one table entry draws the same swing both ways.
     VERT  the screen plane           (overheads, risers, crosses)
     FLAT  horizontal, tipped to the camera so it reads as a sweep in depth
     DIAG  vertical but leaning toward the camera a little
     SIDE  perpendicular to forward   (the sonic rings of a thrust)

   The rest of the file is the 3D side of the old DS.FX vocabulary (hit,
   blood, ring, burst, star, dust, trail, element, reaction...), which
   particles.js calls instead of its 2D emitters whenever FX3D is live. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const F = DS.FX3D;
  const rnd = F.rnd;
  const CELL = DS.FX3DAtlas.CELL;

  const VERT = [0, 1, 0];
  const FLAT = [0, 0.55, 0.835];
  const DIAG = [0, 0.92, 0.39];
  const SIDE_U = [0, 1, 0];
  const SIDE_V = [0, 0, 1];
  const FWD = [1, 0, 0];
  const TIPPED = [0, 0.6, 0.8];     // the old 2D ring: an ellipse lying back toward the camera

  function trailOf(o) {
    const k = F.kit(o.el);
    return o.el ? k.trail : SWORD;
  }
  const SWORD = { core: 0xffffff, edge: 0x5f9dff };
  const WHITE = { core: 0xffffff, edge: 0xb8c8ff };
  const WARM = { core: 0xfff4d8, edge: 0xff7a20 };

  /* One crescent. u/v are LOCAL basis vectors (forward, up, camera). */
  function slash(X, Y, Z, dir, u, v, a0, a1, r, width, life, tr, hot, delay) {
    const s = F.arcs.spec();
    s.x = X; s.y = Y; s.z = Z;
    s.ux = u[0] * dir; s.uy = u[1]; s.uz = u[2];
    s.vx = v[0] * dir; s.vy = v[1]; s.vz = v[2];
    s.a0 = a0; s.a1 = a1; s.r0 = r * 0.9; s.r1 = r * 1.08; s.width = width;
    s.style = 1; s.life = life; s.core = tr.core; s.edge = tr.edge; s.hot = hot || 1.7;
    s.delay = delay || 0;
    return F.arcs.emit(s);
  }

  function ring(X, Y, Z, dir, u, v, r0, r1, width, life, core, edge, hot, style, delay) {
    const s = F.arcs.spec();
    s.x = X; s.y = Y; s.z = Z;
    s.ux = u[0] * dir; s.uy = u[1]; s.uz = u[2];
    s.vx = v[0] * dir; s.vy = v[1]; s.vz = v[2];
    s.r0 = r0; s.r1 = r1; s.width = width; s.style = style || 0; s.life = life;
    s.core = core; s.edge = edge; s.hot = hot || 1.4; s.delay = delay || 0;
    return F.arcs.emit(s);
  }

  function groundRing(X, floorY, Z, r0, r1, width, life, core, edge, hot, style, delay) {
    return ring(X, floorY + 0.04, Z, 1, FWD, FLAT, r0, r1, width, life, core, edge, hot, style, delay);
  }

  // A streak from the hero along a direction: thrusts and stabs.
  function stab(X, Y, Z, dir, from, len, width, tr, hot, life) {
    for (let pass = 0; pass < 2; pass++) {
      const s = F.add.spec();
      s.x = X + dir * (from + len * 0.5); s.y = Y; s.z = Z;
      s.mode = 2; s.ax = dir; s.ay = 0; s.az = 0; s.stretch = len;
      s.cell = CELL.streak; s.size = pass ? width * 0.3 : width; s.size1 = pass ? width * 0.1 : width * 0.4;
      s.life = life || 9; s.a = 1; s.a1 = 0;
      F.col(s, pass ? 0xffffff : tr.edge, pass ? (hot || 2) * 1.3 : (hot || 2));
      if (!pass) F.col1(s, tr.core, hot || 2);
      F.add.emit(s);
    }
  }

  function star(X, Y, Z, size, hex, hot, life, cell) {
    const s = F.add.spec();
    s.x = X; s.y = Y; s.z = Z; s.cell = cell == null ? CELL.star : cell;
    s.size = size; s.size1 = size * 0.3; s.life = life || 8; s.rot = rnd(-0.4, 0.4);
    F.col(s, hex, hot || 2.2); s.a = 1; s.a1 = 0;
    return F.add.emit(s);
  }

  // Speed lines streaming back past the hero.
  function speedLines(X, Y, Z, dir, count, hex) {
    for (let i = 0; i < F.n(count); i++) {
      F.sparkAt(X + dir * rnd(-0.2, 0.6), Y + rnd(-0.5, 0.5), Z + rnd(-0.3, 0.3),
                -dir * rnd(0.18, 0.3), 0, 0, hex, 1.3, rnd(7, 11), 0.035, 3, 0, 0.9);
    }
  }

  function sparksAlong(X, Y, Z, dir, count, hex, speed) {
    F.sparkBurst(X, Y, Z, count, hex, speed, dir, 0.25, 0.9, 2.2, 10);
  }

  function reachR(o, base) {
    const px = o.reach || 24;
    return base * (0.55 + px / 60);
  }

  // Delayed presets: a tiny fixed queue so an impact can land after its swing.
  const LATER = [];
  for (let i = 0; i < 16; i++) LATER.push({ t: -1, name: '', X: 0, Y: 0, Z: 0, dir: 1, el: null, power: 1, reach: 24 });
  function later(frames, name, X, Y, Z, o) {
    let e = null;
    for (let i = 0; i < LATER.length; i++) if (LATER[i].t < 0) { e = LATER[i]; break; }
    if (!e) return;
    e.t = F.clock + frames; e.name = name; e.X = X; e.Y = Y; e.Z = Z;
    e.dir = o.dir || 1; e.el = o.el || null; e.power = o.power || 1; e.reach = o.reach || 24;
  }
  function runLater() {
    for (let i = 0; i < LATER.length; i++) {
      const e = LATER[i];
      if (e.t >= 0 && F.clock >= e.t) {
        e.t = -1;
        F.at(e.name, e.X, e.Y, e.Z, e);
      }
    }
  }
  F.later = later;
  F.runLater = runLater;

  const R = F.register;

  // --- sword ---------------------------------------------------------------------

  R('sword1', function (X, Y, Z, o) {          // horizontal slash
    const tr = trailOf(o), d = o.dir || 1, r = reachR(o, 1.35);
    slash(X + d * 0.35, Y, Z, d, FWD, FLAT, -2.2, 1.4, r, 0.6, 16, tr, 1.7);
    slash(X + d * 0.35, Y, Z, d, FWD, FLAT, -2.0, 1.2, r * 0.74, 0.22, 13, WHITE, 0.9, 1);
    speedLines(X, Y, Z, d, 3, tr.edge);
  });

  R('sword2', function (X, Y, Z, o) {          // rising diagonal
    const tr = trailOf(o), d = o.dir || 1, r = reachR(o, 1.4);
    slash(X + d * 0.4, Y, Z, d, FWD, DIAG, -2.1, 1.3, r, 0.65, 16, tr, 1.8);
    slash(X + d * 0.4, Y, Z, d, FWD, DIAG, -1.9, 1.15, r * 0.72, 0.2, 13, WHITE, 0.9, 1);
    F.sparkBurst(X + d * r * 0.8, Y + r * 0.6, Z, 5, tr.core, 0.12, d * 0.4, 1, 0.6, 1.8, 10);
  });

  R('sword3', function (X, Y, Z, o) {          // overhead spin finisher
    const tr = trailOf(o), d = o.dir || 1, r = reachR(o, 1.5);
    slash(X, Y - 0.1, Z, d, FWD, FLAT, 3.0, -3.4, r * 1.05, 0.55, 18, tr, 1.6);
    slash(X + d * 0.25, Y + 0.1, Z, d, FWD, VERT, 2.2, -1.05, r * 1.1, 0.85, 18, tr, 2.1, 5);
    slash(X + d * 0.25, Y + 0.1, Z, d, FWD, VERT, 2.0, -0.95, r * 0.75, 0.3, 15, WHITE, 1.0, 6);
    later(8, 'groundSlam', X + d * r * 0.9, Y, Z, o);
  });

  R('swordHeavy', function (X, Y, Z, o) {
    const tr = trailOf(o), d = o.dir || 1, r = reachR(o, 1.75);
    slash(X + d * 0.2, Y + 0.15, Z, d, FWD, VERT, 2.4, -1.2, r, 1.15, 20, tr, 2.3);
    slash(X + d * 0.2, Y + 0.15, Z, d, FWD, DIAG, 2.2, -1.0, r * 0.78, 0.45, 17, WHITE, 1.1, 2);
    slash(X + d * 0.2, Y + 0.15, Z, d, FWD, VERT, 2.3, -1.1, r * 1.22, 0.2, 16, tr, 1.2, 3);
    speedLines(X, Y, Z, d, 6, tr.edge);
    later(6, 'groundSlam', X + d * r * 0.95, Y, Z, o);
  });

  // --- dagger --------------------------------------------------------------------

  const DAGGER = { core: 0xffffff, edge: 0xa070ff };
  function daggerTrail(o) { return o.el ? F.kit(o.el).trail : DAGGER; }

  R('dagger1', function (X, Y, Z, o) {         // crossing slash
    const tr = daggerTrail(o), d = o.dir || 1, r = reachR(o, 1.05);
    slash(X + d * 0.35, Y + 0.05, Z, d, FWD, VERT, 2.0, -0.95, r, 0.34, 11, tr, 1.9);
    slash(X + d * 0.35, Y + 0.05, Z, d, FWD, VERT, -2.0, 0.95, r, 0.34, 11, tr, 1.9, 3);
    star(X + d * (r + 0.3), Y + 0.05, Z, 0.5, tr.core, 1.8, 6, CELL.cross);
  });

  R('dagger2', function (X, Y, Z, o) {         // reverse cross, leaning in depth
    const tr = daggerTrail(o), d = o.dir || 1, r = reachR(o, 1.1);
    slash(X + d * 0.35, Y + 0.05, Z, d, FWD, DIAG, -1.3, 1.7, r, 0.34, 11, tr, 1.9);
    slash(X + d * 0.35, Y + 0.05, Z, d, FWD, DIAG, 1.3, -1.7, r, 0.34, 11, tr, 1.9, 3);
    star(X + d * (r + 0.3), Y + 0.05, Z, 0.5, tr.core, 1.8, 6, CELL.cross);
  });

  R('dagger3', function (X, Y, Z, o) {         // dash-stab
    const tr = daggerTrail(o), d = o.dir || 1, len = reachR(o, 1.9);
    stab(X, Y, Z, d, 0.3, len, 0.42, tr, 2.2, 10);
    star(X + d * (len + 0.3), Y, Z, 1.1, tr.core, 2.4, 8);
    ring(X + d * (len * 0.8), Y, Z, d, SIDE_U, SIDE_V, 0.1, 0.62, 0.14, 12, 0xffffff, tr.edge, 1.6);
    speedLines(X, Y, Z, d, 8, tr.edge);
  });

  R('daggerHeavy', function (X, Y, Z, o) {
    const tr = daggerTrail(o), d = o.dir || 1, len = reachR(o, 2.4);
    stab(X, Y, Z, d, 0.2, len, 0.6, tr, 2.5, 12);
    star(X + d * (len + 0.4), Y, Z, 1.6, tr.core, 2.6, 10);
    star(X + d * (len + 0.4), Y, Z, 1.2, 0xffffff, 2, 7, CELL.cross);
    ring(X + d * (len * 0.55), Y, Z, d, SIDE_U, SIDE_V, 0.1, 0.7, 0.16, 12, 0xffffff, tr.edge, 1.6);
    ring(X + d * (len * 0.95), Y, Z, d, SIDE_U, SIDE_V, 0.1, 0.9, 0.18, 14, 0xffffff, tr.edge, 1.8, 0, 2);
    speedLines(X, Y, Z, d, 12, tr.edge);
  });

  // --- greataxe ------------------------------------------------------------------

  function axeTrail(o) { return o.el ? F.kit(o.el).trail : WARM; }
  const HEAVY = { dir: 1, el: null, power: 1.5, reach: 24 };   // reused opts for queued impacts

  R('axe1', function (X, Y, Z, o) {            // wide heavy cleave
    const tr = axeTrail(o), d = o.dir || 1, r = reachR(o, 1.55);
    slash(X, Y + 0.05, Z, d, FWD, FLAT, -2.7, 1.45, r, 0.95, 20, tr, 1.8);
    slash(X, Y + 0.05, Z, d, FWD, FLAT, -2.4, 1.3, r * 0.68, 0.35, 16, WHITE, 0.9, 2);
    F.sparkBurst(X + d * r, Y, Z, 8, tr.core, 0.16, d, 0, 1.2, 2, 12);
  });

  R('axe2', function (X, Y, Z, o) {            // ground slam
    const tr = axeTrail(o), d = o.dir || 1, r = reachR(o, 1.55);
    slash(X + d * 0.2, Y + 0.2, Z, d, FWD, VERT, 2.5, -1.4, r, 1.05, 18, tr, 2.1);
    slash(X + d * 0.2, Y + 0.2, Z, d, FWD, VERT, 2.3, -1.3, r * 0.7, 0.35, 15, WHITE, 0.9, 1);
    later(4, 'groundSlam', X + d * r * 0.95, Y, Z, o);
  });

  R('axeHeavy', function (X, Y, Z, o) {
    const tr = axeTrail(o), d = o.dir || 1, r = reachR(o, 1.8);
    slash(X + d * 0.2, Y + 0.25, Z, d, FWD, VERT, 2.6, -1.45, r, 1.35, 20, tr, 2.4);
    slash(X + d * 0.2, Y + 0.25, Z, d, FWD, DIAG, 2.4, -1.35, r * 0.72, 0.45, 17, WHITE, 1.0, 2);
    HEAVY.dir = d; HEAVY.el = o.el || null; HEAVY.power = 1.5; HEAVY.reach = o.reach || 24;
    later(4, 'groundSlam', X + d * r * 0.95, Y, Z, HEAVY);
    later(8, 'earthSpikes', X + d * r * 0.95, Y, Z, HEAVY);
  });

  /* The slam itself: a noisy ground shock, an energy ring, debris, dust. Also
     played by the sword finisher and the greataxe skills. */
  R('groundSlam', function (X, Y, Z, o) {
    const p = o.power || 1, d = o.dir || 1;
    const g = DS.currentGame;
    const px = X / F.P2U, py = -Y / F.P2U;
    const floor = g && g.map ? F.floorY(px, py) : Y - 0.7;
    const tr = o.el ? F.kit(o.el).trail : WARM;
    groundRing(X, floor, Z, 0.3, 3.0 * p, 0.9 * p, 26, 0xfff0d0, 0x9a6a3a, 1.2, 2);
    groundRing(X, floor, Z, 0.2, 2.2 * p, 0.3, 18, tr.core, tr.edge, 1.7, 0);
    F.glowAt(X, floor + 0.2, Z, 1.8 * p, tr.edge, 1.5, 8, 2.4 * p);
    for (let i = 0; i < F.n(14 * p); i++) {
      F.chunkAt(X + rnd(-0.4, 0.4), floor + 0.1, Z + rnd(-0.3, 0.3), rnd(-0.08, 0.08) + d * 0.02,
                rnd(0.1, 0.22) * p, rnd(-0.06, 0.06), rnd(0.06, 0.13), F.pick(ROCK), rnd(40, 56), floor);
    }
    for (let i = 0; i < F.n(10 * p); i++) {
      const a = rnd(0, Math.PI);
      F.puffAt(X + Math.cos(a) * rnd(0.2, 1.2), floor + 0.15, Z + rnd(-0.4, 0.4),
               Math.cos(a) * rnd(0.02, 0.05), rnd(0.005, 0.02), rnd(-0.02, 0.02), 0.35, 1.1, 0x9a8c7a, 0.55, rnd(34, 48));
    }
    F.sparkBurst(X, floor + 0.1, Z, 12 * p, tr.core, 0.24 * p, 0, 1, 1.1, 2.2, 12);
    if (o.el) F.kit(o.el).hit(X, floor + 0.3, Z, d, 0.8 * p);
  });

  const ROCK = [0x6b5a4a, 0x8a7560, 0x54483c, 0x9a8570];

  R('earthSpikes', function (X, Y, Z, o) {
    const g = DS.currentGame, d = o.dir || 1;
    const floor = g && g.map ? F.floorY(X / F.P2U, -Y / F.P2U) : Y - 0.7;
    for (let i = 0; i < 6; i++) {
      const s = F.rock.spec();
      s.x = X + d * (0.4 + i * 0.45); s.y = floor + 0.1; s.z = Z + rnd(-0.15, 0.15);
      s.vy = 0.12 + i * 0.012; s.grav = 0.014; s.life = 44; s.size = 0.16 - i * 0.012;
      s.kx = 0.8; s.ky = 2.4; s.kz = 0.8; s.rz = rnd(-0.3, 0.3); s.wz = rnd(-0.05, 0.05);
      s.floor = floor; s.bounce = 0.1;
      F.col(s, F.pick(ROCK), 1);
      F.rock.emit(s);
    }
  });

  // --- spear ---------------------------------------------------------------------

  const SPEAR = { core: 0xffffff, edge: 0x40c0ff };
  function spearTrail(o) { return o.el ? F.kit(o.el).trail : SPEAR; }

  R('spear1', function (X, Y, Z, o) {          // thrust with a streak
    const tr = spearTrail(o), d = o.dir || 1, len = reachR(o, 2.0);
    stab(X, Y + 0.05, Z, d, 0.4, len, 0.62, tr, 2.3, 10);
    for (let i = 0; i < 4; i++) F.glowAt(X + d * (0.6 + i * len * 0.28), Y + 0.05, Z, 0.5, tr.edge, 1.1, 8, 0.2);
    ring(X + d * (len + 0.3), Y + 0.05, Z, d, SIDE_U, SIDE_V, 0.1, 0.8, 0.16, 12, 0xffffff, tr.edge, 1.8);
    sparksAlong(X + d * (len + 0.3), Y + 0.05, Z, d, 6, tr.core, 0.22);
  });

  R('spear2', function (X, Y, Z, o) {          // sweeping arc
    const tr = spearTrail(o), d = o.dir || 1, r = reachR(o, 1.75);
    slash(X + d * 0.1, Y, Z, d, FWD, DIAG, 1.5, -2.5, r, 0.55, 18, tr, 1.8);
    slash(X + d * 0.1, Y, Z, d, FWD, DIAG, 1.3, -2.3, r * 0.75, 0.2, 15, WHITE, 0.9, 1);
    const g = DS.currentGame;
    const floor = g && g.map ? F.floorY(X / F.P2U, -Y / F.P2U) : Y - 0.7;
    for (let i = 0; i < F.n(4); i++) {
      F.puffAt(X + d * rnd(0.5, 1.6), floor + 0.1, Z, d * 0.02, 0.01, 0, 0.2, 0.6, 0x9a8c7a, 0.4, 28);
    }
  });

  R('spearHeavy', function (X, Y, Z, o) {      // piercing streak
    const tr = spearTrail(o), d = o.dir || 1, len = reachR(o, 2.6);
    stab(X, Y + 0.05, Z, d, 0.3, len, 0.5, tr, 2.4, 12);
    for (let i = 0; i < 3; i++) {
      ring(X + d * (0.8 + i * len * 0.35), Y + 0.05, Z, d, SIDE_U, SIDE_V, 0.1, 0.5 + i * 0.2, 0.14, 12,
           0xffffff, tr.edge, 1.6, 0, i * 2);
    }
    star(X + d * (len + 0.4), Y + 0.05, Z, 1.3, tr.core, 2.4, 9);
    speedLines(X, Y, Z, d, 8, tr.edge);
  });

  // --- ranged --------------------------------------------------------------------

  R('bowRelease', function (X, Y, Z, o) {
    const tr = o.el ? F.kit(o.el).trail : { core: 0xfff4d0, edge: 0xffd56b };
    const ax = o.ax == null ? (o.dir || 1) : o.ax, ay = o.ay || 0;
    F.glowAt(X, Y, Z, 0.5, tr.edge, 1.4, 6, 0.8);
    F.sparkBurst(X, Y, Z, 5, tr.core, 0.16, ax, -ay, 0.45, 2, 8);
    if (o.power > 1.2) {
      const s = F.arcs.spec();
      s.x = X + ax * 0.3; s.y = Y - ay * 0.3; s.z = Z;
      s.ux = 0; s.uy = 1; s.uz = 0; s.vx = 0; s.vy = 0; s.vz = 1;
      s.r0 = 0.1; s.r1 = 0.8; s.width = 0.16; s.style = 0; s.life = 14;
      s.core = 0xffffff; s.edge = tr.edge; s.hot = 1.8;
      F.arcs.emit(s);
      star(X + ax * 0.3, Y - ay * 0.3, Z, 1.2, tr.core, 2.2, 8);
    }
  });

  R('staffCast', function (X, Y, Z, o) {
    const k = F.kit(o.el || 'water');
    const p = o.power || 1;
    const count = F.n(10 * p);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2, r = 0.2;
      const s = F.add.spec();
      s.x = X + Math.cos(a) * r; s.y = Y + Math.sin(a) * r; s.z = Z;
      s.vx = -Math.sin(a) * 0.06 * p + Math.cos(a) * 0.03; s.vy = Math.cos(a) * 0.06 * p + Math.sin(a) * 0.03;
      s.vz = rnd(-0.02, 0.02); s.drag = 0.9; s.cell = CELL.ember; s.size = 0.09; s.size1 = 0.03;
      s.life = rnd(14, 22); F.col(s, i % 2 ? k.pal.main : k.pal.core, 2); s.a = 1; s.a1 = 0;
      F.add.emit(s);
    }
    F.glowAt(X, Y, Z, 0.7 * p, k.pal.main, 1.6, 8, 1.1 * p);
    if (p > 1.2) {
      ring(X, Y, Z, 1, FWD, VERT, 0.15, 1.3, 0.2, 16, k.pal.core, k.pal.main, 1.8);
      ring(X, Y, Z, 1, FWD, VERT, 0.1, 0.9, 0.12, 14, 0xffffff, k.pal.main, 1.5, 0, 3);
      star(X, Y, Z, 1.2, k.pal.core, 2.2, 9);
    }
  });

  // Arrow / orb impacts, from syncProjectiles in renderer3d.
  R('shotImpact', function (X, Y, Z, o) {
    const k = F.kit(o.el);
    const d = o.dir || 1;
    star(X, Y, Z, o.kind === 'orb' ? 1.0 : 0.7, o.el ? k.pal.core : 0xfff0c8, 2, 7);
    F.sparkBurst(X, Y, Z, 7, o.el ? k.pal.main : 0xfff0c8, 0.16, -d, 0, 1.4, 2, 9);
    if (!o.el) F.puffAt(X, Y, Z, 0, 0.005, 0, 0.12, 0.35, 0xb0a898, 0.4, 20);
  });

  // --- impacts -------------------------------------------------------------------

  R('hit', function (X, Y, Z, o) {
    const d = o.dir || 1;
    const el = o.el;
    const k = F.kit(el);
    const big = o.heavy ? 1.35 : 1;
    const crit = !!o.crit;
    const core = el ? k.pal.core : 0xfff6dc;
    const main = el ? k.pal.main : 0xffd890;
    star(X, Y, Z, (crit ? 1.5 : 0.95) * big, core, crit ? 2.6 : 2.1, crit ? 9 : 7);
    F.glowAt(X, Y, Z, 0.7 * big, main, 1.3, 7, 1.1 * big);
    F.sparkBurst(X, Y, Z, (crit ? 12 : 8) * big, core, 0.2 * big, d, 0, 0.95, 2.3, 10);
    if (crit) star(X, Y, Z, 1.2, 0xffffff, 2.2, 6, CELL.cross);
    if (o.heavy) {
      ring(X, Y, Z, d, FWD, VERT, 0.1, 1.0, 0.16, 12, 0xffffff, main, 1.6);
      for (let i = 0; i < F.n(4); i++) {
        F.chunkAt(X, Y, Z, d * rnd(0.03, 0.08), rnd(0.04, 0.1), rnd(-0.04, 0.04), rnd(0.04, 0.07), 0x8a8494, 30, Y - 0.8);
      }
    }
    // The element's own burst comes from the status it applies (FX.element),
    // so the impact itself only borrows its colours.
  });

  R('blood', function (X, Y, Z, o) {
    const cols = o.colors;
    const d = o.dir || 0;
    for (let i = 0; i < F.n(7); i++) {
      const c = cols && cols.length ? F.cssHex(cols[i % cols.length]) : 0xa02838;
      F.chunkAt(X, Y, Z, rnd(-0.06, 0.06) + d * 0.04, rnd(0.03, 0.1), rnd(-0.04, 0.04), rnd(0.04, 0.08), c, rnd(30, 44), Y - 0.8);
    }
    for (let i = 0; i < F.n(6); i++) {
      const c = cols && cols.length ? F.cssHex(cols[0]) : 0xa02838;
      const s = F.soft.spec();
      s.x = X; s.y = Y; s.z = Z; s.vx = rnd(-0.07, 0.07) + d * 0.03; s.vy = rnd(0.02, 0.09); s.vz = rnd(-0.03, 0.03);
      s.grav = 0.008; s.cell = CELL.droplet; s.size = 0.1; s.size1 = 0.06; s.life = rnd(18, 26); s.rot = Math.PI;
      F.col(s, c, 1); s.a = 1; s.a1 = 0;
      F.soft.emit(s);
    }
  });

  R('ring', function (X, Y, Z, o) {
    const c = o.color == null ? 0xffffff : o.color;
    const r1 = Math.max(0.4, o.r1 || 1.2);
    ring(X, Y, Z, 1, FWD, TIPPED, 0.1, r1, Math.max(0.1, r1 * 0.14), 18, 0xffffff, c, 1.5);
    const k = F.n(Math.min(10, Math.round((o.count || 8) * 0.5)));
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2;
      F.sparkAt(X, Y, Z, Math.cos(a) * r1 * 0.09, Math.sin(a) * r1 * 0.06, Math.sin(a) * r1 * 0.05,
                c, 1.8, 12, 0.04, 1.6, 0, 0.88);
    }
  });

  // --- skills --------------------------------------------------------------------

  R('skillFlash', function (X, Y, Z, o) {       // generic launch flash for skills
    const c = o.color == null ? 0xfff0a8 : o.color;
    F.glowAt(X, Y, Z, 1.4 * (o.power || 1), c, 1.6, 10, 2.2 * (o.power || 1));
    ring(X, Y, Z, 1, FWD, VERT, 0.2, 1.6 * (o.power || 1), 0.22, 16, 0xffffff, c, 1.7);
    star(X, Y, Z, 1.3 * (o.power || 1), c, 2.2, 10);
  });

  R('skillSlash', function (X, Y, Z, o) {       // a big free-standing crescent
    const c = o.color == null ? 0xffffff : o.color;
    const tr = { core: 0xffffff, edge: c };
    const d = o.dir || 1, r = 1.8 * (o.power || 1);
    const side = o.side || 1;
    slash(X, Y, Z, d * side, FWD, o.flat ? FLAT : VERT, 2.3, -1.3, r, 0.8, 16, tr, 2);
    slash(X, Y, Z, d * side, FWD, o.flat ? FLAT : DIAG, 2.1, -1.1, r * 0.7, 0.28, 13, WHITE, 1.4, 1);
  });

  R('skillSlam', function (X, Y, Z, o) {        // skills that hit the floor
    F.at('groundSlam', X, Y, Z, o);
  });

  R('dashGhost', function (X, Y, Z, o) {        // afterimage while a skill dashes
    const c = o.color == null ? 0xa8e4ff : o.color;
    F.glowAt(X, Y, Z, 0.9, c, 0.9, 10, 0.6);
    speedLines(X, Y, Z, o.dir || 1, 2, c);
  });

  /* An element's skill silhouette (DS.Elements.ELEMENT_SKILL_VARIANT.shape),
     thrown forward from the hero on top of the skill's own effect. */
  const VARIANT = {
    'flame-wave': function (X, Y, Z, d, k, floor) {
      for (let i = 0; i < 7; i++) {
        const x = X + d * (0.4 + i * 0.45);
        for (let j = 0; j < 2; j++) k.ambient(x + rnd(-0.1, 0.1), floor + 0.1, Z, 1.3 - i * 0.08);
      }
    },
    'shard-fan': function (X, Y, Z, d, k) {
      for (let i = 0; i < F.n(9); i++) {
        const a = (i / 8 - 0.5) * 1.2;
        const vx = Math.cos(a) * 0.2 * d, vy = Math.sin(a) * 0.2;
        const s = F.glow.spec();
        s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.drag = 0.93; s.life = 22; s.size = 0.1; s.size1 = 0.03;
        s.kx = 0.5; s.ky = 3; s.kz = 0.5; s.rz = Math.atan2(vy, vx) - Math.PI / 2;
        F.col(s, k.pal.core, 1.9); s.a = 1; s.a1 = 0;
        F.glow.emit(s);
      }
    },
    'forked-bolt': function (X, Y, Z, d, k) {
      for (let i = 0; i < 3; i++) {
        F.bolt(X, Y, Z, X + d * rnd(1.6, 2.6), Y + rnd(-0.8, 0.8), Z + rnd(-0.3, 0.3), 6, 0.2, 0.05, k.pal.main, 7, 2.4);
      }
    },
    'toxic-cloud': function (X, Y, Z, d, k) {
      for (let i = 0; i < F.n(8); i++) {
        F.puffAt(X + d * rnd(0.3, 1.8), Y + rnd(-0.4, 0.3), Z, d * 0.01, 0.006, 0, 0.4, 1.1, k.pal.main, 0.35, 50);
      }
    },
    'tide-crash': function (X, Y, Z, d, k, floor) {
      ring(X + d * 0.8, floor + 0.05, Z, 1, FWD, FLAT, 0.2, 2.4, 0.35, 20, k.pal.core, k.pal.main, 1.4);
      for (let i = 0; i < F.n(14); i++) k.ambient(X + d * rnd(0.2, 1.8), floor + 0.1, Z, 1.4);
    },
    'rock-spikes': function (X, Y, Z, d, k) { F.at('earthSpikes', X, Y, Z, VAR_OPTS); },
    'petal-spiral': function (X, Y, Z, d, k) {
      for (let i = 0; i < F.n(14); i++) {
        const a = i * 0.9, r = 0.2 + i * 0.06;
        const s = F.soft.spec();
        s.x = X + Math.cos(a) * r; s.y = Y + Math.sin(a) * r; s.z = Z;
        s.vx = -Math.sin(a) * 0.05; s.vy = Math.cos(a) * 0.05 + 0.01; s.drag = 0.95;
        s.cell = CELL.petal; s.size = 0.15; s.size1 = 0.1; s.life = 40; s.spin = 0.08; s.rot = a;
        F.col(s, i % 2 ? 0xffb3d1 : k.pal.main, 1); s.a = 1; s.a1 = 0;
        F.soft.emit(s);
      }
    },
    vortex: function (X, Y, Z, d, k) { F.reaction('wind|wind', X + d * 1.2, Y, Z, 1.2, 'wind'); }
  };
  const VAR_OPTS = { dir: 1, el: null, power: 1 };

  R('skillVariant', function (X, Y, Z, o) {
    const fn = VARIANT[o.shape];
    if (!fn) return;
    const k = F.kit(o.el);
    const d = o.dir || 1;
    VAR_OPTS.dir = d; VAR_OPTS.el = o.el;
    const floor = F.floorY(X / F.P2U, -Y / F.P2U);
    fn(X, Y, Z, d, k, floor);
    F.glowAt(X, Y, Z, 1.2, k.pal.main, 1.4, 10, 1.8);
  });

  // Infusing a weapon: the element wraps the hero and flares off the blade.
  R('infuse', function (X, Y, Z, o) {
    const k = F.kit(o.el);
    ring(X, Y, Z, 1, FWD, VERT, 0.2, 1.4, 0.24, 18, k.pal.core, k.pal.main, 1.8);
    ring(X, Y - 0.6, Z, 1, FWD, FLAT, 0.2, 1.6, 0.2, 22, k.pal.core, k.pal.main, 1.4, 0, 3);
    F.glowAt(X, Y, Z, 1.4, k.pal.main, 1.4, 14, 2);
    k.hit(X, Y, Z, 0, 0.8);
  });

  // An element passive firing on a target: a small signature flare.
  R('passive', function (X, Y, Z, o) {
    const k = F.kit(o.el);
    ring(X, Y, Z, 1, FWD, TIPPED, 0.1, 0.9, 0.14, 14, k.pal.core, k.pal.main, 1.6);
    k.ambient(X, Y, Z, 1.2);
    k.ambient(X, Y, Z, 1.2);
  });

  R('meteor', function (X, Y, Z, o) {           // a falling-star impact
    const c = o.color == null ? 0xffd56b : o.color;
    star(X, Y, Z, 1.2, c, 2.4, 9);
    F.sparkBurst(X, Y, Z, 8, c, 0.18, 0, 1, 1.4, 2.2, 12);
    ring(X, Y, Z, 1, FWD, TIPPED, 0.1, 1.0, 0.14, 14, 0xffffff, c, 1.6);
  });
})(window.DS);
