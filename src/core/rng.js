/* Bootstrap namespace, global constants, seeded RNG and small math helpers.
   Loaded first — everything else assumes window.DS exists. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  DS.C = {
    W: 320,            // internal render width
    H: 180,            // internal render height
    TILE: 16,
    /* Render scale. Game logic stays in 320x180 logical units; the canvas
       backing store is RS times bigger, so sprites authored at RS detail
       land 1:1 on device pixels. Raising this does not retune gameplay. */
    RS: 2,
    GRAVITY: 0.34,     // px per frame^2 at 60fps
    MAX_FALL: 6.4,
    FINAL_DEPTH: 10,       // depth 10 holds the final boss
    SAFE_BEFORE: [5, 10]   // safe rooms sit in front of these depths
  };

  // mulberry32 — small, fast, good enough for gameplay, fully deterministic.
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* A seeded random source. The same seed always produces the same run, which
     makes level generation reproducible and loot distribution testable. */
  DS.makeRng = function (seed) {
    const next = mulberry32(seed >>> 0);

    const api = {
      seed: seed >>> 0,
      next: next,

      // float() -> [0,1) | float(max) -> [0,max) | float(min,max) -> [min,max)
      float: function (min, max) {
        if (min === undefined) return next();
        if (max === undefined) { max = min; min = 0; }
        return min + next() * (max - min);
      },

      // Inclusive on both ends.
      int: function (min, max) {
        return Math.floor(min + next() * (max - min + 1));
      },

      chance: function (p) { return next() < p; },

      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },

      // entries: [{ weight, value }, ...]
      weighted: function (entries) {
        let total = 0;
        for (let i = 0; i < entries.length; i++) total += entries[i].weight;
        let roll = next() * total;
        for (let i = 0; i < entries.length; i++) {
          roll -= entries[i].weight;
          if (roll < 0) return entries[i].value;
        }
        return entries[entries.length - 1].value;
      },

      shuffle: function (arr) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        }
        return out;
      },

      // Draw n distinct entries without replacement.
      sample: function (arr, n) {
        return api.shuffle(arr).slice(0, Math.min(n, arr.length));
      }
    };

    return api;
  };

  // Unseeded source for purely cosmetic randomness (particles, sfx pitch).
  DS.rand = DS.makeRng((Math.random() * 0xffffffff) >>> 0);

  DS.M = {
    clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },

    lerp: function (a, b, t) { return a + (b - a) * t; },

    // Move v toward target by at most step — avoids lerp's infinite tail.
    approach: function (v, target, step) {
      if (v < target) return Math.min(v + step, target);
      return Math.max(v - step, target);
    },

    sign: function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; },

    dist: function (ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      return Math.sqrt(dx * dx + dy * dy);
    },

    // Axis-aligned box overlap. Boxes are {x, y, w, h} with x,y at top-left.
    overlap: function (a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    },

    rectsOverlap: function (ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }
  };
})(window.DS);
