/* Band kinds for grown and weathered places: mushrooms, rope bridges, seas of
   cloud. Written like kinds-arch.js and backdrop3d.js's own (a builder is handed
   the band's lists, an x, a seeded rng and its layer entry; it writes y from the
   ground line up and emits boxes and glow boxes), and registered into
   DS.Backdrop.kinds. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const B = DS.Backdrop;
  if (!B || !B.helpers) return;
  const box = B.helpers.box;
  const K = B.kinds;

  /* Giant fungus: a stem, a wide flat cap, a lighter crown and glowing spots. */
  K.mushrooms = function (o, x, rng, L) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const h = rng.float(L.h0 || 2.5, L.h1 || 6);
      const x0 = x + rng.float(-2.2, 2.2), z0 = rng.float(-0.9, 0.9);
      const sw = h * 0.13;
      box(o.boxes, x0, h * 0.5, z0, sw, h, sw, rng.float(-0.05, 0.05), 0, 1);
      const w = h * rng.float(0.65, 1.05);
      box(o.boxes, x0, h, z0, w, h * 0.13, w, 0, 0, 0);
      box(o.boxes, x0, h + h * 0.1, z0, w * 0.68, h * 0.11, w * 0.68, 0, 0, 2);
      box(o.boxes, x0, h + h * 0.19, z0, w * 0.36, h * 0.08, w * 0.36, 0, 0, 3);
      for (let s = 0; s < 3; s++) {
        o.glow.push([x0 + rng.float(-w * 0.34, w * 0.34), h + h * 0.06, z0 + w * 0.5 + 0.02,
                     0.26, 0.26, 0.05, 0, 0, s]);
      }
      o.glow.push([x0, h - h * 0.04, z0, w * 0.9, h * 0.04, w * 0.9, 0, 0, 2]);   // the gills' glow
    }
  };

  /* A bridge of rope and slats between two posts, sagging in the middle. */
  K.ropebridge = function (o, x, rng, L) {
    const len = rng.float(L.l0 || 14, L.l1 || 26);
    const y0 = rng.float(L.y0 != null ? L.y0 : 5, L.y1 != null ? L.y1 : 9);
    const sag = rng.float(0.8, 1.8);
    const n = Math.max(8, Math.round(len / 0.9));
    for (const s of [-1, 1]) {
      box(o.boxes, x + s * len * 0.5, y0 * 0.5 + 0.4, 0, 0.6, y0 + 0.8, 0.6, 0, 0, 1);
    }
    let px = x - len * 0.5, py = y0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const cx = x - len * 0.5 + t * len;
      const cy = y0 - sag * (1 - Math.pow((t - 0.5) * 2, 2));
      const dx = cx - px, dy = cy - py, seg = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      box(o.boxes, (cx + px) * 0.5, (cy + py) * 0.5, 0, seg * 1.02, 0.14, 1.4, ang, 0, 2);          // the slats, one plank a step
      box(o.boxes, (cx + px) * 0.5, (cy + py) * 0.5 + 1.0, 0.65, seg * 1.02, 0.08, 0.08, ang, 0, 4);  // the hand rope
      if (i % 3 === 0) box(o.boxes, cx, cy + 0.5, 0.65, 0.07, 1.0, 0.07, 0, 0, 4);
      px = cx; py = cy;
    }
  };

  /* A sea of cloud: broad flat banks at a height, pale on top, in shadow under. */
  K.cloudsea = function (o, x, rng, L) {
    const y = rng.float(L.y0 != null ? L.y0 : 4, L.y1 != null ? L.y1 : 8);
    const w = rng.float(6, 15);
    box(o.boxes, x, y, rng.float(-3, 3), w, rng.float(0.9, 1.8), rng.float(6, 11), 0, 0, 3);
    box(o.boxes, x + rng.float(-2, 2), y - 0.8, rng.float(-3, 3), w * 0.8, rng.float(0.7, 1.3), rng.float(5, 9), 0, 0, 1);
    if (rng.chance(0.7)) {
      box(o.boxes, x + rng.float(-3, 3), y + 0.9, rng.float(-2, 2), w * rng.float(0.35, 0.6),
          rng.float(0.8, 1.6), rng.float(3, 6), 0, 0, 2);
    }
  };

  /* A mangrove: a trunk on a tangle of arching roots, a flat dark canopy. */
  K.mangrove = function (o, x, rng, L) {
    const h = rng.float(L.h0 || 3.5, L.h1 || 6);
    box(o.boxes, x, h * 0.6, 0, h * 0.16, h * 1.2, h * 0.16, rng.float(-0.05, 0.05), 0, 1);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const reach = rng.float(1.4, 3.2) * (1 + i * 0.12);
      const x0 = x + side * h * 0.05, y0 = h * 0.55, x1 = x + side * reach, y1 = 0.15;
      const seg = Math.hypot(x1 - x0, y1 - y0);
      box(o.boxes, (x0 + x1) * 0.5, (y0 + y1) * 0.5, rng.float(-0.6, 0.6), seg, 0.22, 0.22,
          Math.atan2(y1 - y0, x1 - x0), 0, 1);
    }
    box(o.boxes, x, h * 1.25, 0, h * rng.float(1.0, 1.6), h * 0.24, h * 0.9, 0, 0, 0);
    box(o.boxes, x + rng.float(-1, 1), h * 1.42, 0, h * rng.float(0.5, 0.9), h * 0.18, h * 0.6, 0, 0, 2);
  };

  /* Lily pads the size of tables on the water, a pink flower on some. */
  K.lilies = function (o, x, rng, L) {
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const r = rng.float(0.9, 1.9), px = x + rng.float(-2.5, 2.5), pz = rng.float(-1.4, 1.4);
      box(o.boxes, px, 0.08, pz, r * 2, 0.12, r * 2, 0, rng.float(0, 1.5), 0);
      if (rng.chance(0.4)) o.glow.push([px, 0.32, pz, 0.5, 0.36, 0.5, 0, 0, 1]);
    }
  };

  /* Threads hung from a roof, each ending in a point of light: a sky of glow-worms.
     `hang` puts the tops at the roof. */
  K.glowthreads = function (o, x, rng, L) {
    const top = L.top != null ? L.top : 9;
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const len = rng.float(L.l0 || 1.5, L.l1 || 7);
      const tx = x + rng.float(-1.6, 1.6), tz = rng.float(-1.2, 1.2);
      box(o.boxes, tx, top - len * 0.5, tz, 0.05, len, 0.05, 0, 0, 4);
      const dots = rng.int(1, 3);
      for (let d = 1; d <= dots; d++) o.glow.push([tx, top - len * (d / (dots + 1)), tz, 0.1, 0.1, 0.1, 0, 0, 1]);
      o.glow.push([tx, top - len, tz, 0.22, 0.3, 0.22, 0, 0, 0]);
    }
  };

  /* A web hung from the roof: a sheet of strands and rings. */
  K.webs = function (o, x, rng, L) {
    const top = L.top != null ? L.top : 9;
    const w = rng.float(L.w0 || 4, L.w1 || 8), drop = rng.float(3, 6);
    for (let i = 0; i < 5; i++) {
      const sx = x - w * 0.5 + (i / 4) * w;
      const ang = Math.atan2(sx - x, drop);
      box(o.boxes, (sx + x) * 0.5, top - drop * 0.5, 0, 0.05, Math.hypot(sx - x, drop), 0.05, -ang, 0, 3);
    }
    for (let r = 1; r <= 3; r++) {
      const t = r / 3.5;
      box(o.boxes, x, top - drop * t, 0, w * (1 - t) * 0.95, 0.05, 0.05, 0, 0, 3);
    }
  };

  /* Egg sacs in a cluster, one of them alight from inside. */
  K.eggs = function (o, x, rng, L) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      const ex = x + rng.float(-1.8, 1.8), ez = rng.float(-0.9, 0.9), s = rng.float(0.6, 1.2);
      box(o.boxes, ex, s * 0.7, ez, s, s * 1.4, s, rng.float(-0.1, 0.1), 0, rng.chance(0.4) ? 2 : 3);
      box(o.boxes, ex, s * 1.55, ez, s * 0.6, s * 0.3, s * 0.6, 0, 0, 3);
      if (rng.chance(0.4)) o.glow.push([ex, s * 0.75, ez + s * 0.5, s * 0.5, s * 0.8, 0.05, 0, 0, 0]);
    }
  };

  /* Lamps of pale light that float above black water. */
  K.ghostlamps = function (o, x, rng, L) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const y = rng.float(L.y0 != null ? L.y0 : 2.5, L.y1 != null ? L.y1 : 8);
      const lx = x + rng.float(-3, 3), lz = rng.float(-2, 2);
      o.glow.push([lx, y, lz, 0.32, 0.42, 0.32, 0, 0, 0]);
      o.glow.push([lx, y, lz, 0.9, 1.1, 0.9, 0, 0, 2]);
    }
  };

  /* A frozen waterfall: a stack of pale slabs, ribbed with light. */
  K.icefall = function (o, x, rng, L) {
    const h = rng.float(L.h0 || 6, L.h1 || 11), w = rng.float(2.4, 4);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const ww = w * (1 - i * 0.1) + rng.float(-0.3, 0.3);
      box(o.boxes, x + rng.float(-0.25, 0.25), (i + 0.5) * (h / n), rng.float(-0.4, 0.4), ww, h / n + 0.05, w * 0.7, 0, 0, i % 2 ? 2 : 3);
    }
    for (let k = -1; k <= 1; k++) o.glow.push([x + k * w * 0.28, h * 0.5, w * 0.36, 0.14, h * 0.86, 0.05, 0, 0, k === 0 ? 0 : 2]);
    for (let t = 0; t < 4; t++) {
      const tl = rng.float(0.8, 2.2);
      o.shards.push([x + rng.float(-w * 0.5, w * 0.5), h - tl * 0.5, rng.float(-0.3, 0.3), 0.26, tl, 0]);
    }
  };

  /* The bones of something enormous: a spine and the curved run of its ribs,
     a skull at the end. */
  K.skeleton = function (o, x, rng, L) {
    const n = L.ribs || 8, gap = 1.5, R = rng.float(3.8, 4.8);
    const len = n * gap, top = R * 1.05;
    for (let i = 0; i <= n * 2; i++) {
      box(o.boxes, x - len * 0.5 + i * gap * 0.5, top + 0.15, 0, 0.6, 0.55, 0.7, 0, 0, i % 2 ? 3 : 2);
    }
    for (let i = 0; i < n; i++) {
      const rx = x - len * 0.5 + (i + 0.5) * gap;
      const lean = rng.float(0.25, 0.5);
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const px = rx + lean * Math.sin(t * Math.PI * 0.55) * R;
        const py = top - t * top * 0.98;
        box(o.boxes, px, py, 0.2, 0.34, top / steps * 1.1, 0.34, -lean * 0.3 * (1 - t), 0, 3);
      }
    }
    const sx = x + len * 0.5 + 1.8;
    box(o.boxes, sx, R * 0.95, 0, 3.2, 1.9, 1.9, 0, 0, 3);
    box(o.boxes, sx + 2.0, R * 0.74, 0, 1.8, 0.9, 1.5, 0, 0, 3);
    for (let t = 0; t < 4; t++) box(o.boxes, sx + 1.3 + t * 0.4, R * 0.74 - 0.55, 0.4, 0.14, 0.5, 0.14, 0, 0, 2);
    o.glow.push([sx + 0.3, R * 1.02, 0.98, 0.5, 0.4, 0.05, 0, 0, 1]);
  };
})(window.DS);
