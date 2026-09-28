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
    /* The run is three ACTS of ten depths, each with a boss half way and a
       boss at the end, and then it keeps going: past the third act is the
       ENDLESS descent, where a boss waits every five floors and nothing ever
       ends the run except death or the player walking away. FINAL_DEPTH is
       the last act boss, kept for anything that wants "the scripted part of
       the dungeon" (the level solver loops to it) - it is no longer a wall. */
    ACT_LENGTH: 10,
    ACTS: 3,
    FINAL_DEPTH: 30,
    ENDLESS_BOSS_EVERY: 5,
    // Safe rooms sit in front of every boss depth. The list is the scripted
    // part; past it, DS.Acts.isSafeBefore is the answer.
    SAFE_BEFORE: [5, 10, 15, 20, 25, 30]
  };

  /* Where a depth sits in the run. Pure arithmetic on DS.C, so the scene, the
     HUD, the difficulty curve and the tests all read the same answer.

       depth  1-10  ACT I      bosses at 5 and 10
       depth 11-20  ACT II     bosses at 15 and 20
       depth 21-30  ACT III    bosses at 25 and 30
       depth 31-    ENDLESS    a boss every ENDLESS_BOSS_EVERY floors        */
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  function scriptedEnd() { return DS.C.ACT_LENGTH * DS.C.ACTS; }

  function isEndless(depth) { return depth > scriptedEnd(); }

  // 1..ACTS inside the scripted run; ACTS + 1 for the whole endless descent.
  function actOf(depth) {
    if (isEndless(depth)) return DS.C.ACTS + 1;
    return Math.max(1, Math.ceil(depth / DS.C.ACT_LENGTH));
  }

  // 1..ACT_LENGTH inside an act; in endless, how far past the last act.
  function depthInAct(depth) {
    if (isEndless(depth)) return depth - scriptedEnd();
    return ((Math.max(1, depth) - 1) % DS.C.ACT_LENGTH) + 1;
  }

  function isBossDepth(depth) {
    if (depth < 1) return false;
    if (isEndless(depth)) return depthInAct(depth) % DS.C.ENDLESS_BOSS_EVERY === 0;
    const step = depthInAct(depth);
    return step === DS.C.ACT_LENGTH || step === DS.C.ACT_LENGTH / 2;
  }

  // Every boss gets a breather in front of it - the scripted ones and the
  // endless ones alike.
  function isSafeBefore(depth) { return isBossDepth(depth); }

  function label(depth) {
    if (isEndless(depth)) return 'ENDLESS - ' + depth;
    return 'ACT ' + ROMAN[actOf(depth)] + ' - ' + depthInAct(depth) + '/' + DS.C.ACT_LENGTH;
  }

  // For tight columns (the death screen's run panel).
  function shortLabel(depth) {
    if (isEndless(depth)) return 'END ' + depth;
    return ROMAN[actOf(depth)] + ' ' + depthInAct(depth) + '/' + DS.C.ACT_LENGTH;
  }

  DS.Acts = {
    actOf: actOf,
    depthInAct: depthInAct,
    isEndless: isEndless,
    isBossDepth: isBossDepth,
    isSafeBefore: isSafeBefore,
    label: label,
    shortLabel: shortLabel,
    roman: function (n) { return ROMAN[n] || String(n); }
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
