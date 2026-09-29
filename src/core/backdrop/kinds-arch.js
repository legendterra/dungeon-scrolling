/* Band kinds for built places: walls with openings, cell blocks, catwalks,
   chains and cages, towers, statues, gates, lamps.

   The horizon used to be nature and ruins: hills, ridges, trees, columns. A
   place the game calls a prison, a fortress or a hall needs to look BUILT, and
   above all a closed place needs a wall behind the level with the far world
   visible only through what is cut in it. These kinds are that vocabulary. They
   are written the way backdrop3d.js's own are -- a builder is handed the band's
   lists, an x, a seeded rng and the layer entry, writes y from the GROUND LINE
   UP, and emits boxes (o.boxes, tone 0 base / 1 shadow / 2 lit / 3 cap /
   4 accent) or glow boxes (o.glow, brightness step 0..2) -- and register
   themselves into DS.Backdrop.kinds.

   A kind with `whole = true` builds a whole band in one call and is told, in
   L.span, the x range it has to fill (lx0..lx1), where world x = 0 falls in it
   (originX) and how high (top) and low (bottom) the frame reaches at its plane.
   The wall is the first of those. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const B = DS.Backdrop;
  if (!B || !B.helpers) return;
  const box = B.helpers.box;
  const hash01 = B.helpers.hash01;
  const K = B.kinds;

  /* --- the wall ----------------------------------------------------------------

     A grid of stone blocks, cell x cell, filling the whole frame behind the
     level, with openings cut out of it. Blocks of ONE size on purpose: the band's
     texture repeat is solved from the mean box size, so a wall of equal blocks
     carries masonry at one scale everywhere, where one tall thin pier next to one
     long lintel would stretch the same photo two ways.

       cell      block size in band units (default 5)
       thick     depth of the wall (default 2.4)
       openings  { every, first, w, h, y0, shape, bars }
                 shape 'arch' (round top), 'window' (rectangle) or 'slit'; a
                 window with `bars` gets iron bars, dark against whatever is
                 behind it: a light shining through them is the read of a gaol.
       jitter    0..1: how much block-to-block tone variation (default .45)

     Openings are placed from world x = 0, `first` in, then every `every`, so the
     same wall stands in the same place whichever way the camera came. */
  function openingList(L, S) {
    const O = L.openings;
    if (!O) return [];
    const out = [];
    const every = O.every || 60, w = O.w || 20;
    let i = Math.floor((S.lx0 - S.originX - (O.first || 0) - w) / every);
    for (; ; i++) {
      const cx = S.originX + (O.first || 0) + i * every;
      if (cx - w > S.lx1) break;
      if (cx + w < S.lx0) continue;
      out.push({ x: cx, w: w, h: O.h || 10, y0: O.y0 != null ? O.y0 : 3, shape: O.shape || 'window',
                 bars: O.bars, barGap: O.barGap || 1.15 });
    }
    return out;
  }

  function inOpening(op, x, y) {
    const hw = op.w * 0.5;
    const dx = Math.abs(x - op.x);
    if (dx >= hw || y < op.y0) return false;
    if (op.shape === 'arch') {
      const yc = op.y0 + op.h - hw;
      if (y <= yc) return true;
      const dy = y - yc;
      return dx * dx + dy * dy < hw * hw;
    }
    return y < op.y0 + op.h;
  }

  /* `courses` lays the wall as masonry instead of a grid: running-bond courses
     of blocks twice as long as they are high, a dark plinth, a lit string course
     every few rows, a seam of shadow round every block, a cornice where the wall
     ends, and `piers` (a pilaster every so many units, from world x = 0) that
     stand proud of the face. Same span, same openings, same texture scale. */
  function courseWall(o, L, S, ops, thick, jit, top) {
    const bw = L.cell || 4, bh = bw * (L.bond || 0.5);
    const rows = Math.ceil(top / bh);
    const cols = Math.ceil((S.lx1 - S.lx0) / bw) + 1;
    const string = L.string || 6;
    for (let j = 0; j < rows; j++) {
      const cy = (j + 0.5) * bh;
      const shift = (j % 2) * bw * 0.5;
      for (let i = 0; i < cols; i++) {
        const cx = S.lx0 + (i + 0.5) * bw - shift;
        let open = false;
        for (let k = 0; k < ops.length; k++) if (inOpening(ops[k], cx, cy)) { open = true; break; }
        if (open) continue;
        const h = hash01(i * 7.31 + j * 3.77 + 0.5);
        let tone = h < jit * 0.25 ? 1 : (h > 1 - jit * 0.25 ? 2 : 0);
        if (j < 2) tone = 1;                                  // the plinth
        else if (j % string === string - 1) tone = 2;         // a string course
        box(o.boxes, cx, cy, -0.25, bw * 1.02, bh * 1.02, thick * 0.8, 0, 0, 1);    // the seam: shadow behind
        box(o.boxes, cx, cy, 0, bw * 0.965, bh * 0.94, thick, 0, 0, tone);
      }
    }
    if (L.height != null) {
      const span = S.lx1 - S.lx0;
      box(o.boxes, S.lx0 + span * 0.5, top + bh * 0.4, 0.3, span + bw * 2, bh * 0.8, thick + 0.8, 0, 0, 2);   // the cornice
    }
    if (L.piers) {
      const every = L.piers, pw = L.pierW || bw * 0.9;
      let i = Math.floor((S.lx0 - S.originX - pw) / every);
      for (; ; i++) {
        const px = S.originX + i * every;
        if (px - pw > S.lx1) break;
        if (px + pw < S.lx0) continue;
        box(o.boxes, px, top * 0.5, 0.75, pw, top, thick * 0.7, 0, 0, 0);
        box(o.boxes, px, bh * 1.2, 0.95, pw * 1.35, bh * 2.4, thick * 0.8, 0, 0, 1);       // its base
        box(o.boxes, px, top - bh * 0.6, 0.95, pw * 1.35, bh * 1.2, thick * 0.8, 0, 0, 2); // its capital
      }
    }
  }

  K.wall = function (o, x, rng, L) {
    const S = L.span;
    const cell = L.cell || 5;
    const thick = L.thick || 2.4;
    const jit = L.jitter != null ? L.jitter : 0.45;
    const ops = openingList(L, S);
    if (L.courses) {
      courseWall(o, L, S, ops, thick, jit, L.height != null ? L.height : Math.max(cell * 3, S.top + cell));
      return wallBars(o, ops);
    }
    const cols = Math.ceil((S.lx1 - S.lx0) / cell);
    // `height` makes a wall that ENDS (a labyrinth's, with sky above it); without
    // it the wall runs to the top of the frame and shuts the sky out.
    const top = L.height != null ? L.height : Math.max(cell * 3, S.top + cell);
    const rows = Math.ceil(top / cell);
    for (let i = 0; i < cols; i++) {
      const cx = S.lx0 + (i + 0.5) * cell;
      for (let j = 0; j < rows; j++) {
        const cy = (j + 0.5) * cell;
        let open = false;
        for (let k = 0; k < ops.length; k++) if (inOpening(ops[k], cx, cy)) { open = true; break; }
        if (open) continue;
        const h = hash01(i * 7.31 + j * 3.77 + 0.5);
        const tone = h < jit * 0.5 ? 1 : (h > 1 - jit * 0.5 ? 2 : 0);
        box(o.boxes, cx, cy, 0, cell * 1.015, cell * 1.015, thick, 0, 0, tone);
      }
    }
    wallBars(o, ops);
  };
  K.wall.whole = true;

  /* Bars: iron, thin, and dark against the light behind them. */
  function wallBars(o, ops) {
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      if (!op.bars) continue;
      const n = Math.max(2, Math.floor(op.w / op.barGap));
      for (let b = 0; b <= n; b++) {
        const bx = op.x - op.w * 0.5 + (b / n) * op.w;
        if (Math.abs(bx - op.x) > op.w * 0.5 - 0.05) continue;
        let hh = op.h;
        if (op.shape === 'arch') {
          const dx = Math.abs(bx - op.x), yc = op.y0 + op.h - op.w * 0.5;
          hh = (yc - op.y0) + Math.sqrt(Math.max(0, op.w * op.w * 0.25 - dx * dx));
        }
        box(o.boxes, bx, op.y0 + hh * 0.5, 0, 0.22, hh, 0.3, 0, 0, 4);
      }
      box(o.boxes, op.x, op.y0 + op.h * 0.5, 0, op.w, 0.2, 0.3, 0, 0, 4);
    }
  }

  /* --- a block of cells -----------------------------------------------------------
     Tiers of cells with a walkway across each: bars, a door frame, the odd lamp.
     `tiers` 2-3, `w0..w1` width. */
  K.celltier = function (o, x, rng, L) {
    const tiers = L.tiers || rng.int(2, 3);
    const w = rng.float(L.w0 || 7, L.w1 || 11);
    const th = L.tierH || 3.4;
    const n = Math.max(3, Math.round(w / 1.3));
    for (let t = 0; t < tiers; t++) {
      const y0 = t * th;
      box(o.boxes, x, y0 + th * 0.5, 0, w, th - 0.28, 1.5, 0, 0, 1);                 // the cells' back
      box(o.boxes, x, y0 + 0.14, 0.9, w + 0.7, 0.28, 1.7, 0, 0, 2);                 // the walkway
      for (let b = 0; b <= n; b++) {
        box(o.boxes, x - w * 0.5 + (b / n) * w, y0 + th * 0.52, 0.85, 0.12, th - 0.7, 0.12, 0, 0, 4);
      }
      box(o.boxes, x, y0 + th - 0.42, 0.85, w, 0.12, 0.12, 0, 0, 4);
      box(o.boxes, x, y0 + 1.15, 1.6, w + 0.7, 0.1, 0.1, 0, 0, 4);                  // the walkway rail
      if (rng.chance(0.35)) {
        o.glow.push([x + rng.float(-w * 0.35, w * 0.35), y0 + th * 0.62, 0.78, 0.34, 0.5, 0.06, 0, 0, 1]);
      }
    }
    box(o.boxes, x, tiers * th + 0.16, 0.2, w + 0.9, 0.32, 2.0, 0, 0, 2);
  };

  /* --- a walkway on posts ------------------------------------------------------------ */
  K.catwalk = function (o, x, rng, L) {
    const len = rng.float(L.l0 || 10, L.l1 || 22);
    const y = rng.float(L.y0 != null ? L.y0 : 3, L.y1 != null ? L.y1 : 8);
    box(o.boxes, x, y, 0, len, 0.32, 1.7, 0, 0, 2);
    box(o.boxes, x, y + 0.9, 0.75, len, 0.1, 0.1, 0, 0, 4);
    const n = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const px = x - len * 0.5 + (i / n) * len;
      box(o.boxes, px, y + 0.45, 0.75, 0.1, 0.9, 0.1, 0, 0, 4);
    }
    box(o.boxes, x - len * 0.5 + 0.4, y * 0.5, 0, 0.5, y, 0.5, 0, 0, 1);
    box(o.boxes, x + len * 0.5 - 0.4, y * 0.5, 0, 0.5, y, 0.5, 0, 0, 1);
  };

  /* --- chains and cages, hung from a beam at `top` ---------------------------------------- */
  K.hangcage = function (o, x, rng, L) {
    const top = L.top != null ? L.top : 12;
    const len = rng.float(L.l0 || 2.5, L.l1 || 6.5);
    box(o.boxes, x, top + 0.15, 0, rng.float(4, 8), 0.3, 0.7, 0, 0, 1);            // the beam
    box(o.boxes, x, top - len * 0.5, 0, 0.09, len, 0.09, 0, 0, 4);                 // the chain
    if (rng.chance(0.55)) {
      const cy = top - len - 1.0;
      box(o.boxes, x, cy + 1.0, 0, 1.3, 0.1, 1.3, 0, 0, 4);
      box(o.boxes, x, cy - 1.0, 0, 1.3, 0.1, 1.3, 0, 0, 4);
      for (const dx of [-0.6, 0.6]) box(o.boxes, x + dx, cy, 0, 0.08, 2.0, 0.08, 0, 0, 4);
      box(o.boxes, x, cy - 0.7, 0, 0.5, 0.4, 0.4, 0, 0, 3);                        // whoever is in it
    } else {
      box(o.boxes, x, top - len - 0.2, 0, 0.6, 0.4, 0.3, 0, 0, 4);                // a hook, an empty shackle
    }
  };

  /* --- a guard tower: the landmark of a prison ------------------------------------------------- */
  K.watchtower = function (o, x, rng, L) {
    box(o.boxes, x, 1.5, 0, 6.4, 3, 6.4, 0, 0, 1);
    box(o.boxes, x, 3.6, 0, 5.4, 1.2, 5.4, 0, 0, 2);
    box(o.boxes, x, 9.0, 0, 2.8, 11, 2.8, 0, 0, 0);
    for (let s = 0; s < 4; s++) box(o.boxes, x, 5 + s * 3, 1.5, 0.5, 0.2, 0.2, 0, 0, 4);
    box(o.boxes, x, 15.0, 0, 5.6, 0.5, 5.6, 0, 0, 2);                              // the gallery
    box(o.boxes, x, 16.4, 0, 4.6, 2.4, 4.6, 0, 0, 1);                              // the lamp room
    o.glow.push([x, 16.4, 2.32, 3.2, 1.4, 0.08, 0, 0, 0]);
    o.glow.push([x, 16.4, -2.32, 3.2, 1.4, 0.08, 0, 0, 1]);
    box(o.boxes, x, 18.1, 0, 5.4, 0.7, 5.4, 0, 0, 2);                              // the roof, stepped
    box(o.boxes, x, 18.9, 0, 3.4, 0.8, 3.4, 0, 0, 0);
    box(o.boxes, x, 19.8, 0, 1.4, 1.0, 1.4, 0, 0, 1);
    box(o.boxes, x, 21.2, 0, 0.12, 1.8, 0.12, 0, 0, 4);
  };

  /* --- a guardian, in stone -------------------------------------------------------------------- */
  K.statue = function (o, x, rng, L) {
    const h = rng.float(L.h0 || 8, L.h1 || 10);
    const u = h / 8;
    box(o.boxes, x, 0.4 * u, 0, 4.4 * u, 0.8 * u, 3.2 * u, 0, 0, 1);               // the plinth
    for (const dx of [-0.75, 0.75]) box(o.boxes, x + dx * u, 0.8 * u + 1.5 * u, 0, 0.95 * u, 3.0 * u, 1.0 * u, 0, 0, 0);
    box(o.boxes, x, 5.0 * u, 0, 2.5 * u, 2.6 * u, 1.3 * u, 0, 0, 0);               // the body
    box(o.boxes, x, 5.9 * u, 0, 3.3 * u, 0.7 * u, 1.5 * u, 0, 0, 2);               // the shoulders
    box(o.boxes, x, 6.9 * u, 0, 1.15 * u, 1.2 * u, 1.15 * u, 0, 0, 0);             // the head
    box(o.boxes, x, 7.75 * u, 0, 0.32 * u, 0.7 * u, 1.2 * u, 0, 0, 2);             // a crest
    box(o.boxes, x + 2.0 * u, 4.4 * u, 0, 0.16 * u, 8.8 * u, 0.16 * u, 0, 0, 4);   // the spear
    box(o.boxes, x - 1.9 * u, 4.6 * u, 0.4, 0.32 * u, 2.7 * u, 1.9 * u, 0, 0, 1);  // the shield
  };

  /* --- a great gate: two towers, a lintel and a portcullis in the opening -------------------------- */
  K.biggate = function (o, x, rng, L) {
    for (const s of [-1, 1]) {
      box(o.boxes, x + s * 8.4, 8, 0, 4.6, 16, 4.6, 0, 0, 0);
      box(o.boxes, x + s * 8.4, 16.3, 0, 5.6, 0.6, 5.6, 0, 0, 2);
      for (let b = 0; b < 3; b++) box(o.boxes, x + s * 8.4, 17.1 + b * 0.9, 0, 4.6 - b * 1.3, 0.9, 4.6 - b * 1.3, 0, 0, 1);
      o.glow.push([x + s * 8.4, 12.5, 2.35, 0.9, 1.6, 0.06, 0, 0, 1]);
    }
    box(o.boxes, x, 13.5, 0, 16.2, 3.4, 4.2, 0, 0, 1);                             // the lintel
    box(o.boxes, x, 15.5, 0, 17.0, 0.6, 4.6, 0, 0, 2);
    const n = 15;
    for (let b = 0; b <= n; b++) box(o.boxes, x - 6.2 + (b / n) * 12.4, 5.9, 0.4, 0.26, 11.8, 0.3, 0, 0, 4);
    for (const y of [3, 6.4, 9.8]) box(o.boxes, x, y, 0.4, 12.4, 0.2, 0.3, 0, 0, 4);
    o.glow.push([x, 6, -0.6, 12.2, 11.6, 0.1, 0, 0, 1]);                           // what is behind the bars
  };

  /* --- a chandelier on a chain, a ring of flame --------------------------------------------------- */
  K.chandelier = function (o, x, rng, L) {
    const top = L.top != null ? L.top : 14;
    const len = rng.float(L.l0 || 3, L.l1 || 6);
    const y = top - len;
    box(o.boxes, x, top - len * 0.5, 0, 0.1, len, 0.1, 0, 0, 4);
    const r = rng.float(1.1, 1.8);
    box(o.boxes, x, y, 0, r * 2, 0.16, 0.16, 0, 0, 4);
    box(o.boxes, x, y, 0, 0.16, 0.16, r * 2, 0, 0, 4);
    box(o.boxes, x, y - 0.35, 0, 0.5, 0.7, 0.5, 0, 0, 2);
    for (const s of [-1, 0, 1]) {
      box(o.boxes, x + s * r, y + 0.22, 0, 0.09, 0.44, 0.09, 0, 0, 3);
      o.glow.push([x + s * r, y + 0.55, 0, 0.32, 0.5, 0.32, 0, 0, 0]);
    }
  };

  /* --- a lighthouse ---------------------------------------------------------------------------------- */
  K.lighthouse = function (o, x, rng, L) {
    const h = rng.float(L.h0 || 9, L.h1 || 12);
    const bands = 6;
    for (let b = 0; b < bands; b++) {
      const w = 2.6 - b * 0.22;
      box(o.boxes, x, (b + 0.5) * (h / bands), 0, w, h / bands + 0.02, w, 0, 0, b % 2 ? 3 : 1);
    }
    box(o.boxes, x, h + 0.2, 0, 2.2, 0.4, 2.2, 0, 0, 2);
    box(o.boxes, x, h + 0.95, 0, 1.3, 1.1, 1.3, 0, 0, 1);
    o.glow.push([x, h + 0.95, 0, 1.5, 1.2, 1.5, 0, 0, 0]);
    box(o.boxes, x, h + 1.8, 0, 1.7, 0.4, 1.7, 0, 0, 2);
  };

  /* --- a hut on stilts over water ---------------------------------------------------------------------- */
  K.stilthouse = function (o, x, rng, L) {
    const lift = rng.float(1.2, 2.2);
    const w = rng.float(3.0, 4.4), d = rng.float(2.4, 3.2);
    const lean = rng.float(-0.06, 0.06);
    for (const dx of [-0.42, 0.42]) for (const dz of [-0.4, 0.4]) {
      box(o.boxes, x + dx * w, lift * 0.5, dz * d, 0.22, lift, 0.22, lean, 0, 1);
    }
    box(o.boxes, x, lift + 0.1, 0, w + 0.5, 0.2, d + 0.5, lean * 0.4, 0, 2);
    box(o.boxes, x, lift + 1.1, 0, w, 1.8, d, lean * 0.4, 0, 0);
    box(o.boxes, x, lift + 2.25, 0, w + 0.9, 0.5, d + 0.9, lean * 0.4, 0, 1);
    box(o.boxes, x, lift + 2.75, 0, w * 0.62, 0.5, d * 0.62, lean * 0.4, 0, 1);
    o.glow.push([x + w * 0.2, lift + 1.2, d * 0.5 + 0.02, 0.5, 0.6, 0.05, 0, 0, 1]);
  };

  /* --- a spiral stair round a well, going down out of sight ------------------------------------------ */
  K.spiralstair = function (o, x, rng, L) {
    const H = L.h || 26, R = L.r || 5.6, N = L.steps || 44;
    box(o.boxes, x, H * 0.5, 0, 1.6, H, 1.6, 0, 0, 1);                             // the newel
    for (let i = 0; i < N; i++) {
      const t = i / N, th = t * Math.PI * 2 * 3.2;
      const px = x + Math.sin(th) * R, pz = Math.cos(th) * R;
      if (pz < -1.0) continue;                                                       // the far side is hidden by the wall
      box(o.boxes, px, H - t * H, pz, 2.6, 0.4, 1.4, 0, th, i % 3 ? 2 : 0);
      if (i % 4 === 0) box(o.boxes, px, H - t * H + 0.8, pz, 0.12, 1.6, 0.12, 0, 0, 4);
    }
    // the well's lip and a ring of wall below it
    for (let k = 0; k < 14; k++) {
      const th = k / 14 * Math.PI * 2;
      box(o.boxes, x + Math.sin(th) * (R + 2.2), H + 0.3, Math.cos(th) * (R + 2.2), 2.2, 0.8, 1.2, 0, th, 2);
    }
  };

  /* --- a balance: a pillar, a beam, two pans of gold on chains ---------------------------------------- */
  K.scales = function (o, x, rng, L) {
    box(o.boxes, x, 5.6, 0, 1.4, 11.2, 1.4, 0, 0, 1);
    box(o.boxes, x, 0.4, 0, 4.4, 0.8, 3, 0, 0, 2);
    box(o.boxes, x, 11.4, 0, 17, 0.7, 0.9, 0.04, 0, 2);                             // the beam, a little off level
    box(o.boxes, x, 12.4, 0, 1.0, 1.4, 1.0, 0, 0, 0);
    for (const s of [-1, 1]) {
      const px = x + s * 8.1, py = s < 0 ? 7.4 : 6.2;
      box(o.boxes, px, (11.4 + py) * 0.5, 0, 0.08, 11.4 - py, 0.08, 0, 0, 4);
      box(o.boxes, px - 2.2, (11.4 + py) * 0.5, 0, 0.06, 11.4 - py, 0.06, 0.4, 0, 4);
      box(o.boxes, px + 2.2, (11.4 + py) * 0.5, 0, 0.06, 11.4 - py, 0.06, -0.4, 0, 4);
      box(o.boxes, px, py, 0, 5.2, 0.4, 3.2, 0, 0, 2);                               // the pan
      o.glow.push([px, py + 0.5, 0, 3.6, 0.5, 2.2, 0, 0, 0]);                        // the gold in it
    }
  };

  /* --- a bell tower with a lean on it ----------------------------------------------------------------- */
  K.belltower = function (o, x, rng, L) {
    const lean = rng.float(0.05, 0.09) * (rng.chance(0.5) ? 1 : -1);
    box(o.boxes, x, 4.5, 0, 4.4, 9, 4.4, lean, 0, 0);
    box(o.boxes, x + lean * 9, 10.2, 0, 4.9, 0.5, 4.9, lean, 0, 2);
    for (const dx of [-1.9, 1.9]) for (const dz of [-1.9, 1.9]) box(o.boxes, x + lean * 12 + dx, 12.2, dz, 0.5, 3.6, 0.5, lean, 0, 1);
    box(o.boxes, x + lean * 13, 12.6, 0, 1.6, 1.5, 1.6, lean, 0, 3);                 // the bell
    o.glow.push([x + lean * 13, 12.4, 0.82, 0.7, 0.5, 0.05, 0, 0, 1]);
    for (let b = 0; b < 4; b++) box(o.boxes, x + lean * 15, 14.4 + b * 0.8, 0, 5.2 - b * 1.2, 0.8, 5.2 - b * 1.2, lean, 0, b % 2 ? 1 : 2);
    box(o.boxes, x + lean * 19, 18.4, 0, 0.12, 2.4, 0.12, lean, 0, 4);
  };
})(window.DS);
