/* Band kinds for the third act, where the gods live: colonnades and temples,
   a bull's head over a Minoan palace, a titan in chains, the boat on the Styx,
   twelve thrones, a chariot of the sun, storm clouds with their lightning, a
   forge with its anvil and its half-made bronze man, olives and asphodel.

   Written like the other kind files: a builder is handed the band's lists, an x,
   a seeded rng and its layer entry; it writes y from the ground line up and emits
   boxes (tone 0 base / 1 shadow / 2 lit / 3 cap / 4 accent) and glow boxes
   (brightness step 0..2). A layer marked `hang` gets L.top at the roof. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const B = DS.Backdrop;
  if (!B || !B.helpers) return;
  const box = B.helpers.box;
  const K = B.kinds;

  /* A row of columns under an entablature, on a stepped base.
       style   'doric' (fluted, plain capital), 'ionic' (a scroll at each end of
               the capital) or 'minoan' (tapering UP, in the accent colour)
       cols, gap, h0, h1, pediment */
  K.colonnade = function (o, x, rng, L) {
    const n = L.cols || rng.int(4, 7), gap = L.gap || 2.6;
    const h = rng.float(L.h0 || 6, L.h1 || 8.5);
    const w = h * 0.13, style = L.style || 'doric';
    const span = (n - 1) * gap;
    const x0 = x - span * 0.5;
    box(o.boxes, x, 0.25, 0, span + gap + 1.4, 0.5, 2.8, 0, 0, 1);
    box(o.boxes, x, 0.6, 0, span + gap + 0.8, 0.24, 2.4, 0, 0, 2);
    const base = 0.72;
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * gap;
      if (style === 'minoan') {
        box(o.boxes, cx, base + h * 0.27, 0, w * 0.75, h * 0.54, w * 0.75, 0, 0, 4);
        box(o.boxes, cx, base + h * 0.77, 0, w * 1.15, h * 0.46, w * 1.15, 0, 0, 4);
      } else {
        box(o.boxes, cx, base + h * 0.5, 0, w, h, w, 0, 0, 0);
        for (const dx of [-0.25, 0.25]) box(o.boxes, cx + dx * w, base + h * 0.5, w * 0.5 + 0.02, 0.05, h * 0.96, 0.05, 0, 0, 1);
      }
      box(o.boxes, cx, base + h + 0.14, 0, w * 1.55, 0.28, w * 1.55, 0, 0, 2);
      if (style === 'ionic') {
        for (const s of [-1, 1]) box(o.boxes, cx + s * w * 0.85, base + h - 0.05, 0, 0.22, 0.34, w * 1.2, 0, 0, 3);
      }
    }
    const ey = base + h + 0.28;
    const ew = span + gap * 0.9 + 0.6;
    box(o.boxes, x, ey + 0.32, 0, ew, 0.64, 2.3, 0, 0, 2);
    box(o.boxes, x, ey + 0.96, 0, ew, 0.62, 2.3, 0, 0, style === 'minoan' ? 4 : 3);
    box(o.boxes, x, ey + 1.42, 0, ew + 0.7, 0.3, 2.9, 0, 0, 2);
    if (L.pediment) {
      const steps = 5;
      for (let j = 0; j < steps; j++) {
        box(o.boxes, x, ey + 1.7 + j * 0.42, -0.1, ew * (1 - j / steps) * 0.98, 0.44, 1.8, 0, 0, j % 2 ? 3 : 0);
      }
    }
  };

  /* A temple front: six columns, a pediment, the cella behind and its doors
     alight. */
  K.temple = function (o, x, rng, L) {
    K.colonnade(o, x, rng, Object.assign({}, L, { cols: 6, pediment: true, h0: 7, h1: 8 }));
    box(o.boxes, x, 5.0, -1.9, 12.4, 9.6, 2.0, 0, 0, 1);
    o.glow.push([x, 3.2, -0.86, 2.6, 4.6, 0.05, 0, 0, 1]);
  };

  /* The bull's head over a palace: a great skull with its horns swept up, on a
     plinth between two red columns. */
  K.bullhead = function (o, x, rng, L) {
    box(o.boxes, x, 0.4, 0, 6.4, 0.8, 3.4, 0, 0, 1);
    for (const s of [-1, 1]) {
      box(o.boxes, x + s * 3.3, 0.8 + 3.6, 0, 1.4, 7.2, 1.4, 0, 0, 4);
      box(o.boxes, x + s * 3.3, 8.2, 0, 1.9, 0.5, 1.9, 0, 0, 2);
    }
    box(o.boxes, x, 3.0, 0, 3.4, 3.4, 2.8, 0, 0, 3);                                 // the skull
    box(o.boxes, x, 1.7, 0.5, 2.0, 1.6, 2.4, 0, 0, 2);                               // the muzzle
    for (const s of [-1, 1]) {
      box(o.boxes, x + s * 2.3, 4.4, 0, 1.7, 0.5, 0.6, s * 0.18, 0, 3);
      box(o.boxes, x + s * 3.5, 5.3, 0, 0.5, 1.7, 0.6, 0, 0, 3);
      box(o.boxes, x + s * 3.9, 6.5, 0, 0.4, 0.9, 0.5, s * -0.22, 0, 3);
      o.glow.push([x + s * 0.85, 3.5, 1.42, 0.5, 0.42, 0.05, 0, 0, 0]);
    }
  };

  /* A chain as thick as a tree, hung from the roof and running out of sight:
     `hang` sets its top, `len` its length. */
  K.bigchain = function (o, x, rng, L) {
    const top = L.top != null ? L.top : 24;
    const len = rng.float(L.l0 || 14, L.l1 || 34);
    const links = Math.floor(len / 1.3);
    for (let i = 0; i < links; i++) {
      const y = top - i * 1.3 - 0.65;
      if (i % 2) box(o.boxes, x, y, 0, 0.5, 1.5, 1.0, 0, 0, 1);
      else box(o.boxes, x, y, 0, 1.0, 1.5, 0.5, 0, 0, 0);
    }
    box(o.boxes, x, top + 0.4, 0, 2.4, 0.9, 2.4, 0, 0, 2);
  };

  /* A titan on his knees, wrists chained high over his head. */
  K.titan = function (o, x, rng, L) {
    box(o.boxes, x - 3.2, 3.0, 0, 4.4, 6.0, 4.4, 0, 0, 0);                            // the folded legs
    box(o.boxes, x + 0.4, 9.8, 0, 6.6, 9.0, 4.0, 0, 0, 0);                            // the chest
    box(o.boxes, x + 0.4, 15.8, 0.2, 3.4, 3.4, 3.4, 0, 0, 2);                         // the bowed head
    for (const s of [-1, 1]) {
      box(o.boxes, x + 0.4 + s * 4.4, 15.6, 0, 1.9, 10.0, 1.9, -s * 0.42, 0, 0);     // the arms, up
      o.glow.push([x + 0.4 + s * 8.6, 21.4, 0, 1.5, 1.0, 1.5, 0, 0, 0]);             // the shackles, hot
      box(o.boxes, x + 0.4 + s * 9.8, 32, 0, 0.7, 20, 0.7, 0, 0, 4);                 // the chain, out of frame
    }
    o.glow.push([x + 0.4, 15.9, 1.72, 2.0, 0.36, 0.05, 0, 0, 1]);                     // the eyes, down
  };

  /* Charon's boat: a black hull, a lantern of blue fire, a robed figure at the pole. */
  K.boat = function (o, x, rng, L) {
    const w = rng.float(6, 8);
    box(o.boxes, x, 0.5, 0, w, 1.0, 2.2, 0, 0, 1);
    box(o.boxes, x - w * 0.5 - 0.7, 1.4, 0, 2.2, 0.9, 1.8, 0.5, 0, 1);
    box(o.boxes, x + w * 0.5 + 0.7, 1.4, 0, 2.2, 0.9, 1.8, -0.5, 0, 1);
    box(o.boxes, x + w * 0.35, 3.0, 0, 0.9, 3.4, 0.9, 0, 0, 0);                        // the figure
    box(o.boxes, x + w * 0.35, 5.0, 0, 0.9, 0.9, 0.9, 0, 0, 1);
    box(o.boxes, x + w * 0.5, 5.2, 0, 0.14, 7.2, 0.14, 0.12, 0, 4);                    // the pole
    box(o.boxes, x - w * 0.3, 2.6, 0, 0.1, 3.4, 0.1, 0, 0, 4);
    o.glow.push([x - w * 0.3, 4.6, 0, 0.7, 0.9, 0.7, 0, 0, 0]);
    o.glow.push([x - w * 0.3, 4.6, 0, 1.8, 2.2, 1.8, 0, 0, 2]);
  };

  /* Thrones: a seat, a back higher than a man, a gold edge alight. */
  K.thrones = function (o, x, rng, L) {
    const h = rng.float(L.h0 || 9, L.h1 || 12);
    box(o.boxes, x, 0.5, 0, 4.4, 1.0, 3.2, 0, 0, 1);
    box(o.boxes, x, 1.4, 0.3, 3.6, 0.8, 2.6, 0, 0, 0);
    box(o.boxes, x, h * 0.5 + 0.9, -0.9, 3.8, h, 0.9, 0, 0, 0);
    for (const s of [-1, 1]) box(o.boxes, x + s * 2.0, 2.3, 0.3, 0.7, 2.4, 2.6, 0, 0, 2);
    box(o.boxes, x, h + 1.4, -0.9, 4.4, 0.6, 1.1, 0, 0, 2);
    o.glow.push([x, h + 1.4, -0.32, 4.2, 0.22, 0.05, 0, 0, 0]);
    o.glow.push([x, h * 0.55 + 0.9, -0.42, 0.24, h * 0.7, 0.05, 0, 0, 1]);
  };

  /* The sun's chariot: a wheel, a car, two horses and a disc of light behind. */
  K.chariot = function (o, x, rng, L) {
    box(o.boxes, x + 2.4, 0.25, 0, 14, 0.5, 3.0, 0, 0, 1);                              // the stair it stands on
    o.glow.push([x, 11, -1.6, 11, 11, 0.1, 0, 0, 1]);
    o.glow.push([x, 11, -1.7, 11, 11, 0.1, 0.7854, 0, 1]);
    for (let a = 0; a < 8; a++) {
      const t = a / 8 * Math.PI * 2;
      box(o.boxes, x + Math.cos(t) * 2.4, 3.6 + Math.sin(t) * 2.4, 0.6, 1.5, 0.35, 0.4, t, 0, 2);
    }
    box(o.boxes, x, 3.6, 0.6, 0.8, 0.8, 0.5, 0, 0, 3);
    box(o.boxes, x + 0.6, 4.9, 0, 5.0, 1.5, 2.2, 0, 0, 0);
    box(o.boxes, x + 4.4, 4.0, 0, 5.2, 1.7, 1.5, 0.1, 0, 3);                            // the horses
    box(o.boxes, x + 7.4, 5.3, 0, 1.9, 2.4, 1.3, -0.3, 0, 3);
    for (const dx of [3.2, 5.4]) box(o.boxes, x + dx, 2.0, 0, 0.6, 2.4, 0.6, 0, 0, 3);
    o.glow.push([x + 8.1, 5.9, 0.68, 0.3, 0.3, 0.05, 0, 0, 0]);
  };

  /* A storm cloud, dark and heavy, and on some of them the bolt that comes off it. */
  K.stormcloud = function (o, x, rng, L) {
    const y = rng.float(L.y0 != null ? L.y0 : 5, L.y1 != null ? L.y1 : 9);
    const w = rng.float(9, 20);
    box(o.boxes, x, y, rng.float(-3, 3), w, rng.float(1.6, 2.8), rng.float(6, 11), 0, 0, 1);
    box(o.boxes, x + rng.float(-3, 3), y + 1.5, rng.float(-2, 2), w * 0.6, rng.float(1.2, 2.2), rng.float(4, 8), 0, 0, 0);
    box(o.boxes, x + rng.float(-2, 2), y - 1.2, rng.float(-2, 2), w * 0.7, 0.9, rng.float(4, 8), 0, 0, 1);
    if (rng.chance(L.bolt != null ? L.bolt : 0.3)) {
      let bx = x + rng.float(-w * 0.25, w * 0.25), by = y - 1.6;
      for (let s = 0; s < 6; s++) {
        const dx = (s % 2 ? 1 : -1) * rng.float(0.5, 1.2);
        o.glow.push([bx + dx * 0.5, by - 0.9, 0.5, 0.22, 1.9, 0.08, dx * 0.3, 0, 0]);
        bx += dx; by -= 1.7;
      }
    }
  };

  /* An anvil for a god: a block on a stump, its face still hot. */
  K.anvil = function (o, x, rng, L) {
    const s = rng.float(0.9, 1.2);
    box(o.boxes, x, 2.0 * s, 0, 3.0 * s, 4.0 * s, 3.0 * s, 0, 0, 1);
    box(o.boxes, x, 4.6 * s, 0, 7.2 * s, 1.4 * s, 2.6 * s, 0, 0, 0);
    box(o.boxes, x + 4.6 * s, 4.7 * s, 0, 3.2 * s, 0.9 * s, 2.2 * s, -0.12, 0, 0);
    o.glow.push([x - 0.4 * s, 5.35 * s, 0, 4.2 * s, 0.14, 1.9 * s, 0, 0, 1]);
  };

  /* A bronze man not yet finished: legs, a torso, one arm and scaffolding, seams alight. */
  K.automaton = function (o, x, rng, L) {
    for (const s of [-1, 1]) box(o.boxes, x + s * 1.1, 3.0, 0, 1.6, 6.0, 1.6, 0, 0, 0);
    box(o.boxes, x, 8.4, 0, 4.6, 4.8, 2.4, 0, 0, 0);
    box(o.boxes, x - 3.4, 8.6, 0, 1.4, 4.6, 1.4, 0, 0, 2);
    o.glow.push([x, 8.4, 1.22, 3.8, 0.12, 0.05, 0, 0, 0]);
    o.glow.push([x, 6.6, 1.22, 0.12, 2.6, 0.05, 0, 0, 1]);
    for (const dx of [-3.2, 3.6]) box(o.boxes, x + dx, 6.0, -1, 0.18, 12, 0.18, 0, 0, 4);
    for (const dy of [4, 8, 12]) box(o.boxes, x + 0.2, dy, -1, 7.4, 0.14, 0.14, 0, 0, 4);
    box(o.boxes, x + 0.4, 12.4, 0, 1.6, 1.2, 1.2, 0.2, 0, 1);                             // the head-to-be, on a hook
  };

  /* A furnace with its mouth open, its chimney lost in smoke. */
  K.furnace = function (o, x, rng, L) {
    box(o.boxes, x, 4, 0, 10, 8, 5, 0, 0, 1);
    box(o.boxes, x, 8.6, 0, 11, 0.8, 5.6, 0, 0, 2);
    box(o.boxes, x + 2.4, 14, -0.5, 3.0, 12, 3.0, 0, 0, 0);
    o.glow.push([x, 2.8, 2.52, 5.4, 4.2, 0.08, 0, 0, 0]);
    o.glow.push([x, 2.8, 2.6, 7.6, 5.8, 0.08, 0, 0, 2]);
    for (let b = 0; b < 3; b++) box(o.boxes, x - 4.6 + b * 4.6, 0.7, 2.6, 0.5, 1.4, 0.5, 0, 0, 2);
  };

  /* An olive: a twisted trunk and a low grey-green cloud of leaves. */
  K.olive = function (o, x, rng, L) {
    const h = rng.float(L.h0 || 2.6, L.h1 || 4.2);
    box(o.boxes, x - 0.15, h * 0.35, 0, h * 0.14, h * 0.7, h * 0.14, 0.12, 0, 1);
    box(o.boxes, x + 0.2, h * 0.7, 0, h * 0.11, h * 0.6, h * 0.11, -0.22, 0, 1);
    box(o.boxes, x, h, 0, h * 1.5, h * 0.22, h * 1.1, 0, 0, 0);
    box(o.boxes, x + rng.float(-0.6, 0.6), h * 1.18, 0, h * 0.9, h * 0.2, h * 0.8, 0, 0, 2);
  };

  /* Asphodel: pale stems in a meadow, each tipped with a cold flame. */
  K.asphodel = function (o, x, rng, L) {
    const n = rng.int(4, 8);
    for (let i = 0; i < n; i++) {
      const h = rng.float(0.8, 2.1), sx = x + rng.float(-1.8, 1.8), sz = rng.float(-1.2, 1.2);
      box(o.boxes, sx, h * 0.5, sz, 0.06, h, 0.06, rng.float(-0.1, 0.1), 0, 3);
      o.glow.push([sx, h + 0.1, sz, 0.16, 0.24, 0.16, 0, 0, rng.chance(0.4) ? 0 : 1]);
    }
  };
})(window.DS);
