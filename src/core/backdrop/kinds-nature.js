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
})(window.DS);
