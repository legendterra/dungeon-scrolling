/* Torch light, as arithmetic: the flicker every flame and its light share,
   the fixed point-light pool's assignment, and the baked light map.

   Three questions the renderer used to answer inline, each with its own
   failure the player could see:

   1. FLICKER. The flame sprite pulsed on one sine and the point light on
      three others, so the fire and the light it threw moved independently.
      flicker(t, phase) is the ONE function both read -- the flame shader
      (src/core/flame.js carries the same sum in GLSL), the pool light, the
      floor pool and the light map's per-texel phase -- so a flare in the fire
      is a flare on the wall.

   2. THE POOL. Three.js compiles the scene's light count into every lit
      program, so the flame lights are a FIXED pool (see FLAME_LIGHTS in
      renderer3d.js) pointed at the most relevant emitters each frame. The old
      pick was "the nearest N, this frame": walk past the midpoint between two
      torches and a light jumped from one to the other in a single frame. The
      pick now has HYSTERESIS (an owner keeps its slot until a rival is clearly
      closer) and every hand-over FADES: the old owner's light ramps out, the
      slot is released at zero, the new owner's light ramps in.

   3. EVERY torch lights its area, pooled or not. buildLightMap() rasterises
      every torch's falloff into a small per-level grid (a texel per half
      tile) that the tile materials add as irradiance, so a torch outside the
      pool still lights the stone around it. The alpha channel carries the
      dominant torch's phase, so each wall patch flickers with its own flame.

   Pure: no THREE, no DOM. Pinned by tests/lights.test.js. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const TAU = Math.PI * 2;

  /* --- 1. the shared flicker ------------------------------------------------ */

  /* Three incommensurate sines and a faster shimmer, around 1.0, never below
     0.8 or above 1.2. `phase` is 0..1 per torch. The GLSL twin lives in
     flame.js (FLICKER_GLSL); keep the two in step. */
  const FLICK = Object.freeze([
    [1.70, 0.00, 0.070],
    [2.93, 1.30, 0.050],
    [5.37, 2.10, 0.035],
    [11.3, 0.70, 0.020]
  ]);
  function flicker(t, phase) {
    const p = phase * TAU;
    let v = 1;
    for (let i = 0; i < FLICK.length; i++) {
      const f = FLICK[i];
      v += Math.sin(t * f[0] + f[1] + p * (i + 1)) * f[2];
    }
    return v;
  }

  /* --- 2. the fixed pool, with hysteresis and fades ------------------------- */

  const POOL = Object.freeze({
    HYSTERESIS: 0.64,   // an owner's distance^2 counts for this much in the ranking
    FADE_S: 0.35,       // seconds for a light to fade fully in or out
    MIN_LIT: 0.02       // emitters dimmer than this are not candidates
  });

  function createPool(n) {
    return {
      n: n,
      owner: new Int32Array(n).fill(-1),
      weight: new Float32Array(n),
      wantIdx: new Int32Array(n).fill(-1),
      wantScore: new Float64Array(n).fill(Infinity),
      stamp: 0
    };
  }

  /* Emitters are the renderer's own records: { x, y, lit } plus two fields
     this owns, `slot` (-1 or the pool index lighting it) and `want` (a stamp).
     Call resetEmitter() on each when a level builds them. */
  function resetEmitter(e) { e.slot = -1; e.want = -1; return e; }

  /* One frame: rank, fade, hand over. `maxD2` culls emitters too far from the
     camera centre (cx, cy) to matter at all. */
  function assignPool(pool, em, count, cx, cy, dt, maxD2) {
    const n = pool.n;
    const stamp = ++pool.stamp;
    for (let k = 0; k < n; k++) { pool.wantIdx[k] = -1; pool.wantScore[k] = Infinity; }

    for (let i = 0; i < count; i++) {
      const e = em[i];
      if (!(e.lit > POOL.MIN_LIT)) continue;
      const dx = e.x - cx, dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > maxD2) continue;
      const score = d2 * (e.slot >= 0 ? POOL.HYSTERESIS : 1);
      let worst = 0;
      for (let k = 1; k < n; k++) if (pool.wantScore[k] > pool.wantScore[worst]) worst = k;
      if (score < pool.wantScore[worst]) { pool.wantScore[worst] = score; pool.wantIdx[worst] = i; }
    }
    for (let k = 0; k < n; k++) if (pool.wantIdx[k] >= 0) em[pool.wantIdx[k]].want = stamp;

    const step = dt / POOL.FADE_S;
    for (let k = 0; k < n; k++) {
      const o = pool.owner[k];
      if (o < 0) continue;
      const e = o < count ? em[o] : null;
      if (e && e.want === stamp) {
        pool.weight[k] = Math.min(1, pool.weight[k] + step);
      } else {
        pool.weight[k] = Math.max(0, pool.weight[k] - step);
        if (pool.weight[k] === 0) {
          if (e) e.slot = -1;
          pool.owner[k] = -1;
        }
      }
    }
    for (let k = 0; k < n; k++) {
      const i = pool.wantIdx[k];
      if (i < 0 || em[i].slot >= 0) continue;
      for (let s = 0; s < n; s++) {
        if (pool.owner[s] >= 0) continue;
        pool.owner[s] = i;
        pool.weight[s] = 0;
        em[i].slot = s;
        break;
      }
    }
    return pool;
  }

  /* Forget every owner (a new level: the emitter list is new). */
  function clearPool(pool) {
    for (let k = 0; k < pool.n; k++) { pool.owner[k] = -1; pool.weight[k] = 0; }
    return pool;
  }

  /* --- 3. the baked light map ----------------------------------------------- */

  /* Rasterise every source's falloff into an RGBA byte grid.
       opts.cols, opts.rows   grid size in texels
       opts.texel             texel size in level pixels
       opts.radius            reach of one torch, level pixels
       opts.sources           [{ x, y (level px, +y down), r, g, b (0..1), phase (0..1) }]
     RGB is the summed light (falloff^2 times colour), clamped to 1; A is the
     phase of whichever source is strongest in that texel. Texel (c, r) covers
     level pixels [c*texel, (c+1)*texel) by [r*texel, (r+1)*texel); row 0 is the
     TOP of the level. */
  function buildLightMap(opts) {
    const cols = opts.cols, rows = opts.rows, texel = opts.texel, R = opts.radius;
    const data = new Uint8Array(cols * rows * 4);
    const acc = new Float32Array(cols * rows * 3);
    const best = new Float32Array(cols * rows);
    const R2 = R * R;
    const srcs = opts.sources || [];
    for (let s = 0; s < srcs.length; s++) {
      const L = srcs[s];
      const c0 = Math.max(0, Math.floor((L.x - R) / texel));
      const c1 = Math.min(cols - 1, Math.floor((L.x + R) / texel));
      const r0 = Math.max(0, Math.floor((L.y - R) / texel));
      const r1 = Math.min(rows - 1, Math.floor((L.y + R) / texel));
      const ph = Math.round(((L.phase % 1) + 1) % 1 * 255);
      for (let r = r0; r <= r1; r++) {
        const dy = (r + 0.5) * texel - L.y;
        for (let c = c0; c <= c1; c++) {
          const dx = (c + 0.5) * texel - L.x;
          const d2 = dx * dx + dy * dy;
          if (d2 >= R2) continue;
          const f = 1 - Math.sqrt(d2) / R;
          const k = f * f;
          const i = r * cols + c;
          acc[i * 3] += k * L.r;
          acc[i * 3 + 1] += k * L.g;
          acc[i * 3 + 2] += k * L.b;
          if (k > best[i]) { best[i] = k; data[i * 4 + 3] = ph; }
        }
      }
    }
    for (let i = 0; i < cols * rows; i++) {
      data[i * 4] = Math.round(Math.min(1, acc[i * 3]) * 255);
      data[i * 4 + 1] = Math.round(Math.min(1, acc[i * 3 + 1]) * 255);
      data[i * 4 + 2] = Math.round(Math.min(1, acc[i * 3 + 2]) * 255);
    }
    return { cols: cols, rows: rows, texel: texel, data: data };
  }

  DS.TorchLight = {
    FLICK: FLICK,
    POOL: POOL,
    flicker: flicker,
    createPool: createPool,
    resetEmitter: resetEmitter,
    assignPool: assignPool,
    clearPool: clearPool,
    buildLightMap: buildLightMap
  };
})(window.DS);
