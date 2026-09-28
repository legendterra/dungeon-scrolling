/* Element identity kits. Each of the eight elements owns one visual kit, and
   every place an element shows up draws from it, so fire on a blade, fire in a
   trail, fire on a hit and fire in a reaction are unmistakably the same fire:

     pal     core (white-hot), main, deep - the three colours of the element
     trail   core/edge colours for ribbons and slash crescents
     aura    what the weapon wears while held: called once per game frame with
             the blade's hilt and tip in world space
     hit     the on-hit burst
     ambient a light emission for ground fields and statuses (a count of 1-2)

     fire       flame tongues licking up the blade, embers, heat glow
     ice        frost crystals growing on the edge, sparkles, sinking cold mist
     lightning  crackling arcs jumping along the blade, sparks
     poison     bubbles that swell and drip off, a sick glow
     water      droplets flowing toward the tip and dripping
     earth      pebbles orbiting the blade, grit falling
     leaf       leaves swirling around the blade, the odd petal
     wind       streaks spiralling up the blade

   Reactions (all 28 pairs, plus wind's SWIRL) are built from both partners'
   kits plus one signature shape - explosion, shatter, chain, vortex, bloom or
   steam - so every pair looks like its two elements meeting. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const F = DS.FX3D;
  const rnd = F.rnd;
  const CELL = DS.FX3DAtlas.CELL;

  // Scratch for the point along the blade (no allocation per call).
  const P = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, len: 1 };
  function along(hx, hy, hz, tx, ty, tz, r) {
    P.x = hx + (tx - hx) * r; P.y = hy + (ty - hy) * r; P.z = hz + (tz - hz) * r;
    const dx = tx - hx, dy = ty - hy, dz = tz - hz;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    P.dx = dx / l; P.dy = dy / l; P.dz = dz / l; P.len = l;
    return P;
  }

  // Two unit vectors perpendicular to the blade direction in P.
  const Q = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0 };
  function perp() {
    // a = normalize(d x z) (fallback d x x), b = d x a
    let ax = P.dy * 1 - P.dz * 0, ay = P.dz * 0 - P.dx * 1, az = 0;
    let l = Math.sqrt(ax * ax + ay * ay);
    if (l < 0.2) { ax = 0; ay = P.dz; az = -P.dy; l = Math.sqrt(ay * ay + az * az) || 1; }
    ax /= l; ay /= l; az /= l;
    Q.ax = ax; Q.ay = ay; Q.az = az;
    Q.bx = P.dy * az - P.dz * ay; Q.by = P.dz * ax - P.dx * az; Q.bz = P.dx * ay - P.dy * ax;
    return Q;
  }

  /* A jagged bolt from A to B made of axis-aligned streak sprites: a white
     core pass and a wider tinted halo pass. Used by lightning everywhere. */
  function bolt(ax, ay, az, bx, by, bz, segs, jitter, width, hex, life, hot) {
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const j = i === segs ? 0 : jitter;
      const nx = ax + (bx - ax) * t + rnd(-j, j);
      const ny = ay + (by - ay) * t + rnd(-j, j);
      const nz = az + (bz - az) * t + rnd(-j, j) * 0.4;
      const dx = nx - px, dy = ny - py, dz = nz - pz;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      for (let pass = 0; pass < 2; pass++) {
        const s = F.add.spec();
        s.x = (px + nx) * 0.5; s.y = (py + ny) * 0.5; s.z = (pz + nz) * 0.5;
        s.mode = 2; s.ax = dx; s.ay = dy; s.az = dz; s.stretch = l * 1.25;
        s.cell = pass === 0 ? CELL.streak : CELL.glow;
        s.size = (pass === 0 ? width : width * 4) * SZ;
        s.life = life; s.a = pass === 0 ? 1 : 0.45; s.a1 = 0;
        if (pass === 0) F.col(s, 0xffffff, hot || 2.2); else F.col(s, hex, (hot || 2.2) * 0.6);
        F.add.emit(s);
      }
      px = nx; py = ny; pz = nz;
    }
  }

  /* Aura particles are drawn larger than burst particles: a held weapon is a
     small thing on screen, and its element has to read from across the room. */
  let SZ = 1;
  const AURA_SCALE = 1.75;

  function sprite(cell, X, Y, Z, vx, vy, vz, size, size1, hex, hot, life, alpha, soft) {
    const sys = soft ? F.soft : F.add;
    const s = sys.spec();
    s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.vz = vz;
    s.size = size * SZ; s.size1 = size1 * SZ; s.cell = cell; s.life = life;
    s.rot = rnd(-0.4, 0.4); s.a = alpha == null ? 1 : alpha; s.a1 = 0;
    F.col(s, hex, hot == null ? 1 : hot);
    return s;   // caller tweaks and emits
  }
  function emitTo(s, soft) { return (soft ? F.soft : F.add).emit(s); }

  // --- the eight kits ----------------------------------------------------------

  const KITS = {};

  KITS.fire = {
    pal: { core: 0xfff2b0, main: 0xff8a2a, deep: 0xd9361a },
    trail: { core: 0xfff0c0, edge: 0xff6a1a },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      const k = m > 1 ? 2 : 1;
      for (let i = 0; i < k; i++) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.2, 1));
        // Body: an opaque-ish orange tongue that reads even on a bright floor.
        const b = sprite(CELL.flame, P.x, P.y, P.z - 0.02, rnd(-0.004, 0.004), rnd(0.02, 0.034), 0,
                         rnd(0.24, 0.32), 0.05, 0xff7a1a, 1, rnd(12, 18), 0.85, true);
        F.col1(b, 0xb02008, 1); b.aspect = 1.4; b.rot = rnd(-0.25, 0.25);
        emitTo(b, true);
        // Core: a hot additive tongue inside it.
        const s = sprite(CELL.flame, P.x, P.y, P.z, rnd(-0.004, 0.004), rnd(0.018, 0.032), 0,
                         rnd(0.13, 0.18), 0.03, 0xfff0b0, 1.5, rnd(10, 15), 0.95);
        F.col1(s, 0xff4a12, 1.1); s.aspect = 1.35; s.rot = rnd(-0.25, 0.25);
        emitTo(s);
      }
      if (f % 3 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        const s = sprite(CELL.ember, P.x, P.y, P.z, rnd(-0.01, 0.01), rnd(0.012, 0.026), rnd(-0.005, 0.005),
                         0.05, 0.02, 0xffc060, 2.4, rnd(26, 38));
        F.col1(s, 0xff3a10, 1.4); s.wob = 0.006;
        emitTo(s);
      }
      if (f % 2 === 0) {
        along(hx, hy, hz, tx, ty, tz, 0.65);
        F.glowAt(P.x, P.y, P.z, P.len * 0.9, 0xff6a1a, 0.55, 5, P.len);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      const k = F.n(10 * power);
      for (let i = 0; i < k; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.03, 0.09) * power;
        const s = sprite(CELL.flame, X, Y, Z, Math.cos(a) * sp + dir * 0.02, Math.abs(Math.sin(a)) * sp + 0.02, rnd(-0.03, 0.03),
                         rnd(0.24, 0.38) * power, 0.06, i % 2 ? 0xff7a1a : 0xffd070, i % 2 ? 1 : 1.3, rnd(14, 22), 0.9, i % 2 === 1);
        F.col1(s, 0xb02008, 1); s.drag = 0.9; s.aspect = 1.3;
        emitTo(s, i % 2 === 1);
      }
      F.sparkBurst(X, Y, Z, 10 * power, 0xffb040, 0.2 * power, dir, 0.3, 1.2, 2.2, 14);
      F.glowAt(X, Y, Z, 0.8 * power, 0xff7a2a, 1.0, 9, 1.2 * power);
      for (let i = 0; i < F.n(3); i++) {
        F.puffAt(X + rnd(-0.2, 0.2), Y + rnd(0, 0.2), Z, rnd(-0.01, 0.01), rnd(0.01, 0.02), 0,
                 0.25, 0.7, 0x4a3430, 0.45, 40);
      }
    },
    ambient: function (X, Y, Z, power) {
      const s = sprite(CELL.flame, X + rnd(-0.1, 0.1), Y, Z + rnd(-0.1, 0.1), rnd(-0.004, 0.004), rnd(0.02, 0.035) * power, 0,
                       rnd(0.16, 0.26) * power, 0.05, 0xfff0b0, 1.8, rnd(14, 22), 0.9);
      F.col1(s, 0xd9361a, 1.1); s.aspect = 1.4;
      emitTo(s);
      if (Math.random() < 0.4) {
        const e = sprite(CELL.ember, X, Y + 0.1, Z, rnd(-0.01, 0.01), rnd(0.02, 0.04), 0, 0.05, 0.02, 0xffc060, 2.2, 30);
        e.wob = 0.008; emitTo(e);
      }
    }
  };

  KITS.ice = {
    pal: { core: 0xf0fbff, main: 0x7fd4ff, deep: 0x2f8fd0 },
    trail: { core: 0xf4fdff, edge: 0x4fb3ff },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      along(hx, hy, hz, tx, ty, tz, rnd(0.15, 1));
      perp();
      const off = rnd(0.02, 0.07);
      F.chipAt(P.x + Q.ax * off, P.y + Q.ay * off, P.z + Q.az * off,
               rnd(-0.002, 0.002), rnd(-0.004, 0.002), 0, rnd(0.05, 0.08), 0xbfeaff, 1.5, rnd(16, 24), 0.0005, 0.7, 2.4);
      if (f % 3 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        const s = sprite(CELL.snow, P.x, P.y, P.z, 0, rnd(-0.004, 0.004), 0, 0.15, 0.03, 0xe8f8ff, 1.8, 16);
        s.spin = rnd(-0.08, 0.08); emitTo(s);
      }
      if (f % 2 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.2, 1));
        F.puffAt(P.x, P.y, P.z, rnd(-0.004, 0.004), rnd(-0.008, -0.003), rnd(-0.004, 0.004),
                 0.18, 0.5, 0xc8ecff, 0.32 * (m > 1 ? 1.3 : 1), 34);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      const k = F.n(9 * power);
      for (let i = 0; i < k; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.06, 0.14) * power;
        const vx = Math.cos(a) * sp + dir * 0.03, vy = Math.sin(a) * sp + 0.03;
        const s = F.glow.spec();
        s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.vz = rnd(-0.05, 0.05);
        s.grav = 0.006; s.drag = 0.9; s.life = rnd(18, 28); s.size = rnd(0.05, 0.09) * power; s.size1 = 0.02;
        s.kx = 0.6; s.ky = 2.6; s.kz = 0.6;
        s.rz = Math.atan2(vy, vx) - Math.PI / 2; s.wx = rnd(-0.1, 0.1);
        F.col(s, 0xcff0ff, 1.8); s.a = 1; s.a1 = 0;
        F.glow.emit(s);
      }
      for (let i = 0; i < F.n(6); i++) {
        const s = sprite(CELL.snow, X + rnd(-0.3, 0.3), Y + rnd(-0.3, 0.3), Z, rnd(-0.02, 0.02), rnd(-0.01, 0.02), 0,
                         rnd(0.1, 0.18), 0.02, 0xffffff, 1.8, rnd(16, 26));
        s.spin = rnd(-0.1, 0.1); emitTo(s);
      }
      F.glowAt(X, Y, Z, 0.8 * power, 0x7fd4ff, 1.0, 9, 1.2 * power);
      for (let i = 0; i < F.n(3); i++) {
        F.puffAt(X + rnd(-0.25, 0.25), Y, Z, rnd(-0.01, 0.01), rnd(-0.006, 0.004), 0, 0.3, 0.8, 0xdaf4ff, 0.4, 40);
      }
    },
    ambient: function (X, Y, Z, power) {
      F.chipAt(X + rnd(-0.15, 0.15), Y + rnd(0, 0.1), Z, 0, rnd(0.004, 0.012), 0, rnd(0.04, 0.07) * power,
               0xbfeaff, 1.4, 22, 0, 0.7, 2.2);
      if (Math.random() < 0.5) F.puffAt(X, Y, Z, 0, 0.004, 0, 0.14, 0.4, 0xdaf4ff, 0.25, 30);
    }
  };

  KITS.lightning = {
    pal: { core: 0xffffff, main: 0xffe45c, deep: 0x9a7bff },
    trail: { core: 0xffffff, edge: 0xffd23c },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      {
        const r0 = rnd(0.1, 0.6), r1 = Math.min(1.05, r0 + rnd(0.25, 0.5));
        along(hx, hy, hz, tx, ty, tz, r0); perp();
        const o = rnd(-0.08, 0.08);
        const ax = P.x + Q.ax * o, ay = P.y + Q.ay * o, az = P.z + Q.az * o;
        along(hx, hy, hz, tx, ty, tz, r1);
        const o2 = rnd(-0.1, 0.1);
        bolt(ax, ay, az, P.x + Q.ax * o2, P.y + Q.ay * o2, P.z + Q.az * o2, 3, 0.08, 0.045, 0xffd23c, 3, 2.2);
      }
      if (f % 4 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.4, 1));
        const a = rnd(0, Math.PI * 2);
        F.sparkAt(P.x, P.y, P.z, Math.cos(a) * 0.05, Math.sin(a) * 0.05, rnd(-0.02, 0.02), 0xfff2a0, 2.4, 7, 0.035, 2, 0, 0.8);
      }
      if (f % 3 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        F.glowAt(P.x, P.y, P.z, rnd(0.25, 0.4), 0xffe45c, 0.9, 3);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      const k = F.n(3 + power);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + rnd(-0.4, 0.4);
        const l = rnd(0.5, 0.95) * power;
        bolt(X, Y, Z, X + Math.cos(a) * l, Y + Math.sin(a) * l, Z + rnd(-0.2, 0.2), 4, 0.1, 0.035, 0xffe45c, 6, 2.4);
      }
      F.sparkBurst(X, Y, Z, 14 * power, 0xfff6c0, 0.26 * power, null, 0, 0, 2.6, 9);
      F.glowAt(X, Y, Z, 1.0 * power, 0xfff0a0, 1.3, 6, 1.4 * power);
      const s = sprite(CELL.cross, X, Y, Z, 0, 0, 0, 1.4 * power, 0.4, 0xffffff, 2.4, 7);
      s.rot = 0.4; emitTo(s);
    },
    ambient: function (X, Y, Z, power) {
      const a = rnd(0, Math.PI * 2), l = rnd(0.3, 0.6) * power;
      bolt(X, Y, Z, X + Math.cos(a) * l, Y + Math.abs(Math.sin(a)) * l, Z, 3, 0.08, 0.03, 0xffe45c, 4, 2);
    }
  };

  KITS.poison = {
    pal: { core: 0xe8ffb0, main: 0x7ee35a, deep: 0x2f8a3a },
    trail: { core: 0xe4ffc0, edge: 0x4fcf4a },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      {
        along(hx, hy, hz, tx, ty, tz, rnd(0.2, 1));
        const s = sprite(CELL.bubble, P.x, P.y, P.z, rnd(-0.003, 0.003), rnd(-0.002, 0.006), 0,
                         rnd(0.08, 0.12), rnd(0.14, 0.2), 0x8cf05a, 1, rnd(24, 34), 0.95, true);
        s.grav = 0.0008; s.wob = 0.005;
        emitTo(s, true);
      }
      if (f % 5 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.4, 1));
        const s = sprite(CELL.droplet, P.x, P.y, P.z, 0, -0.01, 0, 0.11, 0.07, 0x4fcf3a, 1, 26, 0.95, true);
        s.grav = 0.004; s.rot = Math.PI;
        emitTo(s, true);
      }
      if (f % 2 === 1) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        F.glowAt(P.x, P.y, P.z, 0.3, 0x5ad43a, 0.7, 7);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      for (let i = 0; i < F.n(10 * power); i++) {
        const s = sprite(CELL.bubble, X + rnd(-0.15, 0.15), Y + rnd(-0.1, 0.1), Z, rnd(-0.05, 0.05) + dir * 0.02,
                         rnd(0.02, 0.08), rnd(-0.03, 0.03), rnd(0.08, 0.16), rnd(0.12, 0.2), 0xa8ff78, 1, rnd(22, 36), 0.9, true);
        s.grav = 0.003; s.drag = 0.93; s.wob = 0.004;
        emitTo(s, true);
      }
      for (let i = 0; i < F.n(6 * power); i++) {
        const s = sprite(CELL.droplet, X, Y, Z, rnd(-0.07, 0.07), rnd(0.04, 0.1), rnd(-0.03, 0.03),
                         0.09, 0.06, 0x5ad43a, 1, rnd(20, 30), 1, true);
        s.grav = 0.007; s.rot = Math.PI;
        emitTo(s, true);
      }
      F.glowAt(X, Y, Z, 0.8 * power, 0x5ad43a, 1.0, 10, 1.2 * power);
      for (let i = 0; i < F.n(3); i++) {
        F.puffAt(X + rnd(-0.3, 0.3), Y + rnd(-0.1, 0.2), Z, rnd(-0.01, 0.01), rnd(0.002, 0.008), 0,
                 0.3, 0.8, 0x6fbf4a, 0.35, 44);
      }
    },
    ambient: function (X, Y, Z, power) {
      const s = sprite(CELL.bubble, X + rnd(-0.2, 0.2), Y, Z + rnd(-0.1, 0.1), 0, rnd(0.006, 0.014), 0,
                       0.06, rnd(0.12, 0.18) * power, 0xa8ff78, 1, 34, 0.85, true);
      s.wob = 0.006; emitTo(s, true);
    }
  };

  KITS.water = {
    pal: { core: 0xe6f8ff, main: 0x4fb8ff, deep: 0x1f5fb8 },
    trail: { core: 0xeafaff, edge: 0x2f8fff },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      along(hx, hy, hz, tx, ty, tz, rnd(0.1, 0.7));
      perp();
      const o = rnd(-0.05, 0.05);
      const s = sprite(CELL.droplet, P.x + Q.ax * o, P.y + Q.ay * o, P.z + Q.az * o,
                       P.dx * 0.02, P.dy * 0.02, P.dz * 0.02, 0.1, 0.06, 0x5fc0ff, 1, rnd(14, 20), 0.95, true);
      s.rot = Math.atan2(-P.dx, P.dy) + Math.PI; s.grav = 0.0015;
      emitTo(s, true);
      if (f % 2 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.2, 1));
        F.glowAt(P.x, P.y, P.z, rnd(0.12, 0.2), 0x4fb8ff, 1.2, 10);
      }
      if (f % 6 === 0) {
        const d = sprite(CELL.droplet, tx, ty, tz, 0, -0.01, 0, 0.08, 0.06, 0x6fc8ff, 1, 24, 1, true);
        d.grav = 0.006; d.rot = Math.PI;
        emitTo(d, true);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      for (let i = 0; i < F.n(14 * power); i++) {
        const a = rnd(0.2, Math.PI - 0.2), sp = rnd(0.05, 0.13) * power;
        const vx = Math.cos(a) * sp + dir * 0.02, vy = Math.sin(a) * sp;
        const s = sprite(CELL.droplet, X, Y, Z, vx, vy, rnd(-0.04, 0.04), rnd(0.07, 0.11), 0.05, 0x8fd8ff, 1, rnd(18, 28), 1, true);
        s.grav = 0.008; s.drag = 0.97; s.rot = Math.atan2(-vx, vy) + Math.PI;
        emitTo(s, true);
      }
      F.ringAt(X, Y, Z, 0.1, 1.2 * power, 0.22, 0xd8f4ff, 0x2f8fff, 1.2, 16, 0, false);
      F.glowAt(X, Y, Z, 0.8 * power, 0x4fb8ff, 1.0, 8, 1.2 * power);
      for (let i = 0; i < F.n(2); i++) F.puffAt(X, Y, Z, rnd(-0.01, 0.01), 0.004, 0, 0.3, 0.7, 0xd8f0ff, 0.3, 30);
    },
    ambient: function (X, Y, Z, power) {
      const s = sprite(CELL.droplet, X, Y, Z, rnd(-0.03, 0.03), rnd(0.03, 0.07) * power, 0, 0.07, 0.05, 0x8fd8ff, 1, 22, 1, true);
      s.grav = 0.007; emitTo(s, true);
    }
  };

  /* Earth's aura is a handful of KINEMATIC pebbles orbiting the blade, placed
     every frame rather than emitted. */
  const pebbles = [];
  const PEBBLE_COLS = [0xb98d5c, 0x8a6340, 0xa07a50, 0x6b4a2e];
  function releasePebbles() {
    for (let i = 0; i < pebbles.length; i++) F.rock.release(pebbles[i]);
    pebbles.length = 0;
  }

  KITS.earth = {
    pal: { core: 0xffe2b0, main: 0xc79a5e, deep: 0x6b4a2e },
    trail: { core: 0xfff0d0, edge: 0xb07a40 },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      if (pebbles.length === 0) {
        for (let i = 0; i < 4; i++) {
          const s = F.rock.spec();
          s.kinematic = true; s.life = 1e9; s.size = 0.1; F.col(s, PEBBLE_COLS[i], 1);
          s.kx = 1; s.ky = 0.8; s.kz = 0.9;
          pebbles.push(F.rock.emit(s));
        }
      }
      along(hx, hy, hz, tx, ty, tz, 0.62); perp();
      const cx = P.x, cy = P.y, cz = P.z;
      const rad = 0.26 + (m > 1 ? 0.08 : 0);
      for (let i = 0; i < pebbles.length; i++) {
        const a = f * 0.11 + i * Math.PI * 0.5;
        const up = Math.sin(f * 0.07 + i) * 0.12;
        const c = Math.cos(a) * rad, s = Math.sin(a) * rad;
        F.rock.place(pebbles[i], cx + Q.ax * c + Q.bx * s + P.dx * up, cy + Q.ay * c + Q.by * s + P.dy * up,
                     cz + Q.az * c + Q.bz * s + P.dz * up, f * 0.05 + i, f * 0.07, i, 0.1 - i * 0.008, 1);
      }
      if (f % 4 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        F.chunkAt(P.x, P.y, P.z, rnd(-0.005, 0.005), 0, 0, rnd(0.02, 0.035), 0x8a6340, 26);
      }
      if (f % 6 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        F.puffAt(P.x, P.y, P.z, 0, -0.004, 0, 0.08, 0.22, 0xb89a70, 0.3, 26);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      const floor = Y - 0.7;
      for (let i = 0; i < F.n(9 * power); i++) {
        F.chunkAt(X + rnd(-0.1, 0.1), Y, Z + rnd(-0.1, 0.1), rnd(-0.07, 0.07) + dir * 0.04, rnd(0.06, 0.14) * power,
                  rnd(-0.05, 0.05), rnd(0.06, 0.12), F.pick(PEBBLE_COLS), rnd(36, 50), floor);
      }
      for (let i = 0; i < F.n(4); i++) {
        F.puffAt(X + rnd(-0.3, 0.3), Y + rnd(-0.2, 0.1), Z, rnd(-0.02, 0.02), rnd(0.004, 0.012), 0,
                 0.3, 0.9, 0xb89a70, 0.5, 40);
      }
      F.glowAt(X, Y, Z, 0.9 * power, 0xffc080, 1, 7, 1.3 * power);
    },
    ambient: function (X, Y, Z, power) {
      F.chunkAt(X, Y + 0.05, Z, rnd(-0.04, 0.04), rnd(0.05, 0.1) * power, rnd(-0.02, 0.02), rnd(0.04, 0.08),
                F.pick(PEBBLE_COLS), 34, Y - 0.05);
      if (Math.random() < 0.5) F.puffAt(X, Y, Z, 0, 0.006, 0, 0.2, 0.5, 0xb89a70, 0.35, 30);
    }
  };

  const LEAF_COLS = [0x9be85a, 0x6fcf4a, 0xc8f06a, 0x4fb04a];

  KITS.leaf = {
    pal: { core: 0xf4ffd0, main: 0x9be85a, deep: 0x3c9a3a },
    trail: { core: 0xf0ffd8, edge: 0x5fcf4a },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      if (f % 2 === 0 || m > 1) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.2, 1)); perp();
        const a = rnd(0, Math.PI * 2), r = 0.12;
        const c = Math.cos(a), s = Math.sin(a);
        const px = P.x + (Q.ax * c + Q.bx * s) * r, py = P.y + (Q.ay * c + Q.by * s) * r,
              pz = P.z + (Q.az * c + Q.bz * s) * r;
        // Tangential velocity: swirl around the blade, drifting toward the tip.
        const tvx = (-Q.ax * s + Q.bx * c) * 0.02 + P.dx * 0.01, tvy = (-Q.ay * s + Q.by * c) * 0.02 + P.dy * 0.01,
              tvz = (-Q.az * s + Q.bz * c) * 0.02 + P.dz * 0.01;
        const sp = sprite(CELL.leaf, px, py, pz, tvx, tvy, tvz, rnd(0.14, 0.18), 0.1, F.pick(LEAF_COLS), 1, rnd(30, 42), 1, true);
        sp.spin = rnd(-0.12, 0.12); sp.rot = rnd(0, 6.28); sp.wob = 0.004; sp.drag = 0.97; sp.grav = 0.0006;
        emitTo(sp, true);
      }
      if (f % 4 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.2, 1));
        F.glowAt(P.x, P.y, P.z, 0.12, 0xc8ff8a, 1.3, 14);
      }
      if (f % 11 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        const p = sprite(CELL.petal, P.x, P.y, P.z, rnd(-0.01, 0.01), rnd(-0.004, 0.006), 0, 0.08, 0.06, 0xffb3d1, 1, 36, 1, true);
        p.spin = rnd(-0.1, 0.1); p.wob = 0.006;
        emitTo(p, true);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      for (let i = 0; i < F.n(12 * power); i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.03, 0.09) * power;
        const s = sprite(CELL.leaf, X, Y, Z, Math.cos(a) * sp + dir * 0.02, Math.sin(a) * sp + 0.03, rnd(-0.04, 0.04),
                         rnd(0.12, 0.18), 0.1, F.pick(LEAF_COLS), 1, rnd(34, 50), 1, true);
        s.spin = rnd(-0.15, 0.15); s.rot = rnd(0, 6.28); s.grav = 0.0015; s.drag = 0.94; s.wob = 0.006;
        emitTo(s, true);
      }
      for (let i = 0; i < F.n(4); i++) {
        const s = sprite(CELL.petal, X, Y, Z, rnd(-0.05, 0.05), rnd(0.02, 0.06), 0, 0.1, 0.08, 0xffb3d1, 1, 40, 1, true);
        s.spin = rnd(-0.12, 0.12); s.grav = 0.001; s.wob = 0.006; emitTo(s, true);
      }
      F.glowAt(X, Y, Z, 1.0 * power, 0x9be85a, 1.2, 9, 1.5 * power);
    },
    ambient: function (X, Y, Z, power) {
      const s = sprite(CELL.leaf, X + rnd(-0.2, 0.2), Y, Z, rnd(-0.02, 0.02), rnd(0.02, 0.05) * power, 0,
                       0.12, 0.09, F.pick(LEAF_COLS), 1, 44, 1, true);
      s.spin = rnd(-0.1, 0.1); s.grav = 0.001; s.wob = 0.007; emitTo(s, true);
    }
  };

  KITS.wind = {
    pal: { core: 0xffffff, main: 0xd8fff2, deep: 0x8fd6c4 },
    trail: { core: 0xffffff, edge: 0xa8f0dc },
    aura: function (hx, hy, hz, tx, ty, tz, f, m) {
      const k = m > 1 ? 2 : 1;
      for (let i = 0; i < k; i++) {
        along(hx, hy, hz, tx, ty, tz, rnd(0, 0.9)); perp();
        const a = f * 0.5 + i * Math.PI, r = 0.1;
        const c = Math.cos(a), s = Math.sin(a);
        const vx = (-Q.ax * s + Q.bx * c) * 0.035 + P.dx * 0.03, vy = (-Q.ay * s + Q.by * c) * 0.035 + P.dy * 0.03,
              vz = (-Q.az * s + Q.bz * c) * 0.035 + P.dz * 0.03;
        const sp = sprite(CELL.gust, P.x + (Q.ax * c + Q.bx * s) * r, P.y + (Q.ay * c + Q.by * s) * r,
                          P.z + (Q.az * c + Q.bz * s) * r, vx, vy, vz, 0.12, 0.05, 0xe8fff8, 1.4, rnd(10, 14), 0.85);
        sp.mode = 1; sp.stretch = 5; sp.aspect = 2; sp.drag = 0.92;
        emitTo(sp);
      }
      if (f % 5 === 0) {
        along(hx, hy, hz, tx, ty, tz, rnd(0.3, 1));
        F.puffAt(P.x, P.y, P.z, rnd(-0.01, 0.01), rnd(0.004, 0.01), 0, 0.06, 0.2, 0xf0fffa, 0.18, 18);
      }
    },
    hit: function (X, Y, Z, dir, power) {
      const k = F.n(12 * power);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2, r = rnd(0.15, 0.35);
        const c = Math.cos(a), s = Math.sin(a);
        // Tangent + outward: a spiral burst.
        const vx = (-s * 0.08 + c * 0.05) * power, vy = (c * 0.08 + s * 0.05) * power;
        const sp = sprite(CELL.gust, X + c * r, Y + s * r, Z, vx, vy, rnd(-0.02, 0.02), 0.1, 0.04, 0xf0fffa, 1.5, rnd(12, 18), 0.85);
        sp.mode = 1; sp.stretch = 4; sp.aspect = 2; sp.drag = 0.9;
        emitTo(sp);
      }
      F.ringAt(X, Y, Z, 0.2, 1.5 * power, 0.14, 0xffffff, 0x8fd6c4, 1.1, 14, 0, false);
      F.ringAt(X, Y - 0.1, Z, 0.1, 1.1 * power, 0.1, 0xe8fff8, 0x8fd6c4, 0.9, 18, 0, true);
      for (let i = 0; i < F.n(3); i++) F.puffAt(X, Y, Z, rnd(-0.03, 0.03), rnd(0, 0.02), 0, 0.2, 0.6, 0xf4fffb, 0.3, 24);
    },
    ambient: function (X, Y, Z, power) {
      const a = rnd(0, Math.PI * 2);
      const sp = sprite(CELL.gust, X + Math.cos(a) * 0.2, Y + 0.1, Z + Math.sin(a) * 0.2,
                        -Math.sin(a) * 0.05, rnd(0.01, 0.02), Math.cos(a) * 0.05, 0.08, 0.03, 0xf0fffa, 1.2, 14, 0.7);
      sp.mode = 1; sp.stretch = 4; sp.aspect = 2; emitTo(sp);
    }
  };

  // A neutral kit for untyped hits and unknown keys.
  KITS.none = {
    pal: { core: 0xffffff, main: 0xfff0c8, deep: 0xa8b4d0 },
    trail: { core: 0xffffff, edge: 0xc8d4ff },
    aura: function () {},
    hit: function (X, Y, Z, dir, power) {
      F.sparkBurst(X, Y, Z, 8 * power, 0xfff0c8, 0.22 * power, dir, 0.2, 1.1, 2.2, 10);
    },
    ambient: function (X, Y, Z) { F.glowAt(X, Y, Z, 0.2, 0xffffff, 1, 10); }
  };

  function kit(el) { return KITS[el] || KITS.none; }

  /* Every aura runs at aura scale, every hit and ambient burst a little
     larger than the raw numbers: both are read at game-camera distance. */
  const HIT_SCALE = 1.35;
  Object.keys(KITS).forEach(function (key) {
    const kitK = KITS[key];
    const aura = kitK.aura, hit = kitK.hit, amb = kitK.ambient;
    kitK.aura = function (hx, hy, hz, tx, ty, tz, f, m) {
      SZ = AURA_SCALE;
      try { aura(hx, hy, hz, tx, ty, tz, f, m); } finally { SZ = 1; }
    };
    kitK.hit = function (X, Y, Z, dir, power) {
      SZ = HIT_SCALE;
      try { hit(X, Y, Z, dir, power); } finally { SZ = 1; }
    };
    kitK.ambient = function (X, Y, Z, power) {
      SZ = HIT_SCALE;
      try { amb(X, Y, Z, power); } finally { SZ = 1; }
    };
  });

  // --- reactions ---------------------------------------------------------------

  const STYLE = {
    explosion: function (X, Y, Z, ka, kb, c, p) {
      F.glowAt(X, Y, Z, 2.2 * p, c, 2.2, 10, 3.2 * p);
      F.glowAt(X, Y, Z, 1.0 * p, 0xffffff, 2.4, 6, 1.6 * p);
      F.ringAt(X, Y, Z, 0.1, 2.0 * p, 0.5, 0xffffff, c, 1.8, 18, 0, false);
      F.ringAt(X, Y - 0.5, Z, 0.2, 2.6 * p, 0.8, c, ka.pal.deep, 1.3, 26, 2, true);
      F.sparkBurst(X, Y, Z, 22 * p, ka.pal.core, 0.32 * p, null, 0, 0, 2.6, 16);
      const floor = Y - 0.7;
      for (let i = 0; i < F.n(10); i++) {
        F.chunkAt(X, Y, Z, rnd(-0.1, 0.1), rnd(0.08, 0.18), rnd(-0.06, 0.06), rnd(0.06, 0.12), 0x3a2a24, rnd(36, 50), floor);
      }
      for (let i = 0; i < F.n(8); i++) {
        F.puffAt(X + rnd(-0.4, 0.4), Y + rnd(-0.2, 0.4), Z, rnd(-0.02, 0.02), rnd(0.008, 0.02), 0, 0.5, 1.4, 0x3c3038, 0.5, 50);
      }
    },
    shatter: function (X, Y, Z, ka, kb, c, p) {
      for (let i = 0; i < F.n(20 * p); i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.08, 0.2) * p;
        const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
        const s = F.glow.spec();
        s.x = X; s.y = Y; s.z = Z; s.vx = vx; s.vy = vy; s.vz = rnd(-0.08, 0.08);
        s.grav = 0.008; s.drag = 0.9; s.life = rnd(20, 32); s.size = rnd(0.06, 0.12); s.size1 = 0.02;
        s.kx = 0.5; s.ky = 2.8; s.kz = 0.5; s.rz = Math.atan2(vy, vx) - Math.PI / 2; s.wx = rnd(-0.2, 0.2);
        F.col(s, i % 3 === 0 ? kb.pal.main : c, 1.9); s.a = 1; s.a1 = 0;
        F.glow.emit(s);
      }
      const st = F.add.spec();
      st.x = X; st.y = Y; st.z = Z; st.cell = CELL.star; st.size = 2.4 * p; st.size1 = 0.6; st.life = 10;
      F.col(st, 0xffffff, 2.4); st.a = 1; st.a1 = 0; st.rot = 0.3;
      F.add.emit(st);
      F.ringAt(X, Y, Z, 0.1, 1.8 * p, 0.12, 0xffffff, c, 2, 12, 0, false);
      F.glowAt(X, Y, Z, 1.6 * p, c, 1.6, 10, 2.2 * p);
    },
    chain: function (X, Y, Z, ka, kb, c, p) {
      // A strike from above, then bolts spider out along the ground.
      bolt(X + rnd(-0.3, 0.3), Y + 4, Z, X, Y, Z, 7, 0.28, 0.06, c, 9, 2.6);
      const k = F.n(5);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + rnd(-0.3, 0.3);
        const l = rnd(1.0, 1.8) * p;
        bolt(X, Y, Z, X + Math.cos(a) * l, Y + Math.sin(a) * l * 0.6, Z + rnd(-0.3, 0.3), 5, 0.14, 0.04, c, 8, 2.4);
      }
      F.glowAt(X, Y, Z, 2.0 * p, c, 2, 8, 2.6 * p);
      F.sparkBurst(X, Y, Z, 18 * p, 0xffffff, 0.3 * p, null, 0, 0, 2.6, 10);
      F.ringAt(X, Y - 0.5, Z, 0.2, 2.2 * p, 0.2, 0xffffff, c, 1.6, 14, 0, true);
    },
    vortex: function (X, Y, Z, ka, kb, c, p) {
      const k = F.n(26 * p);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 4, r = 0.3 + (i / k) * 0.7;
        const cx = Math.cos(a), sz = Math.sin(a);
        const s = F.add.spec();
        s.x = X + cx * r; s.y = Y - 0.5 + (i / k) * 0.8; s.z = Z + sz * r;
        s.vx = -sz * 0.09; s.vy = rnd(0.02, 0.05); s.vz = cx * 0.09; s.drag = 0.94;
        s.cell = CELL.gust; s.mode = 1; s.stretch = 4; s.aspect = 2; s.size = 0.12; s.size1 = 0.05;
        s.life = rnd(16, 26); F.col(s, i % 2 ? c : 0xffffff, 1.4); s.a = 0.9; s.a1 = 0;
        F.add.emit(s);
      }
      F.ringAt(X, Y - 0.5, Z, 0.3, 2.4 * p, 0.3, 0xffffff, c, 1.4, 22, 0, true);
      F.ringAt(X, Y, Z, 0.2, 1.4 * p, 0.2, c, c, 1.2, 18, 0, true);
      kb.ambient(X, Y, Z, 1.2); ka.ambient(X, Y, Z, 1.2);
      for (let i = 0; i < F.n(4); i++) F.puffAt(X, Y - 0.3, Z, rnd(-0.03, 0.03), 0.012, rnd(-0.03, 0.03), 0.3, 1.0, c, 0.28, 34);
    },
    bloom: function (X, Y, Z, ka, kb, c, p) {
      const k = F.n(14 * p);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2;
        const s = F.soft.spec();
        s.x = X; s.y = Y; s.z = Z; s.vx = Math.cos(a) * 0.07 * p; s.vy = Math.sin(a) * 0.07 * p + 0.01; s.vz = rnd(-0.02, 0.02);
        s.drag = 0.9; s.grav = 0.0008; s.cell = CELL.petal; s.size = 0.16; s.size1 = 0.1; s.life = rnd(34, 48);
        s.rot = a - Math.PI / 2; s.spin = rnd(-0.06, 0.06); s.wob = 0.004;
        F.col(s, i % 2 ? 0xffb3d1 : c, 1); s.a = 1; s.a1 = 0;
        F.soft.emit(s);
      }
      for (let i = 0; i < F.n(10); i++) {
        F.glowAt(X + rnd(-0.6, 0.6), Y + rnd(-0.3, 0.3), Z, 0.14, 0xe8ffc0, 1.6, rnd(20, 34));
      }
      F.ringAt(X, Y - 0.5, Z, 0.2, 2.0 * p, 0.3, 0xf0ffd8, c, 1.3, 24, 0, true);
      F.glowAt(X, Y, Z, 1.4 * p, c, 1.4, 12, 2 * p);
    },
    steam: function (X, Y, Z, ka, kb, c, p) {
      for (let i = 0; i < F.n(10 * p); i++) {
        F.puffAt(X + rnd(-0.4, 0.4), Y + rnd(-0.3, 0.2), Z + rnd(-0.2, 0.2), rnd(-0.02, 0.02), rnd(0.01, 0.03), 0,
                 0.4, 1.4, i % 3 ? 0xf2f0fa : c, 0.5, rnd(40, 60));
      }
      F.glowAt(X, Y, Z, 1.6 * p, c, 1.1, 12, 2.2 * p);
      F.ringAt(X, Y, Z, 0.2, 1.6 * p, 0.4, 0xffffff, c, 1.0, 20, 0, false);
      kb.hit(X, Y, Z, 0, 0.6);
    }
  };

  // pair (sorted, as elements.js keys them) -> signature style
  const REACTION_STYLE = {
    'lightning|water': 'chain', 'ice|water': 'shatter', 'fire|water': 'steam', 'fire|ice': 'shatter',
    'fire|poison': 'explosion', 'fire|leaf': 'vortex', 'earth|lightning': 'chain', 'earth|ice': 'shatter',
    'poison|water': 'steam', 'earth|leaf': 'bloom', 'ice|lightning': 'chain', 'earth|fire': 'explosion',
    'leaf|water': 'bloom', 'leaf|poison': 'bloom', 'leaf|lightning': 'chain', 'fire|lightning': 'explosion',
    'fire|wind': 'vortex', 'ice|leaf': 'shatter', 'ice|poison': 'shatter', 'ice|wind': 'vortex',
    'leaf|wind': 'vortex', 'lightning|poison': 'chain', 'lightning|wind': 'chain', 'earth|poison': 'steam',
    'poison|wind': 'vortex', 'earth|water': 'explosion', 'water|wind': 'vortex', 'earth|wind': 'vortex'
  };

  /* name -> pair, built lazily from the live reaction table so a renamed or
     added reaction still finds its burst. */
  let byName = null;
  function nameMap() {
    if (byName) return byName;
    byName = {};
    const R = DS.Elements && DS.Elements.REACTIONS;
    if (R) for (const key in R) byName[R[key].name] = { key: key, color: R[key].color };
    byName.SWIRL = { key: 'wind|wind', color: '#cfe8e0' };
    return byName;
  }

  function reaction(nameOrKey, X, Y, Z, power, carried) {
    const map = nameMap();
    const hit = map[nameOrKey];
    const key = hit ? hit.key : nameOrKey;
    const parts = key.split('|');
    const ka = kit(parts[0]), kb = kit(parts[1] || parts[0]);
    let style = REACTION_STYLE[key] || 'vortex';
    const color = hit ? F.cssHex(hit.color) : ka.pal.main;
    const p = Math.max(0.8, Math.min(1.5, power || 1));
    if (key === 'wind|wind') {
      style = 'vortex';
      const kc = kit(carried || 'wind');
      STYLE.vortex(X, Y, Z, kc, KITS.wind, carried ? kc.pal.main : color, p);
      return true;
    }
    STYLE[style](X, Y, Z, ka, kb, color, p);
    ka.hit(X, Y, Z, 0, 0.55);
    kb.hit(X, Y, Z, 0, 0.55);
    return true;
  }

  function isReactionName(text) { return !!nameMap()[text]; }

  F.KITS = KITS;
  F.kit = kit;
  F.bolt = bolt;
  F.reaction = reaction;
  F.isReactionName = isReactionName;
  F.REACTION_STYLE = REACTION_STYLE;
  F.releasePebbles = releasePebbles;
  F.onClear = function () { pebbles.length = 0; };
})(window.DS);
