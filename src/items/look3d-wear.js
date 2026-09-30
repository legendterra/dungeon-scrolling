/* What the voxel hero can wear: one builder per family per slot, registered on
   DS.Look3D (look3d.js). A builder is (rig, item, pal, look): rig holds the
   parts of the body to hang things on, pal is { a: main, b: shadow, c: trim }
   from the item's own palette or the wearer's dye, and item says if it glows.
   Everything is boxes, sized against rig.dim so a slim or broad build is clothed
   to fit, and parented to the part that moves it (a sleeve to the arm, a boot to
   the leg), so the pose code carries it without knowing it is there. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const L = DS.Look3D;
  const K = L.kit;
  const P = K.P, grp = K.grp, shade = K.shade, mix = K.mix, motion = K.motion, glowOf = K.glowOf;
  const W = L.wear;

  const GOLD = 0xf2c14e, LEATHER = 0x4e3320, RED = 0xc0303c, CREAM = 0xf4efe0;
  const both = function (a, b, fn) { fn(a, -1); fn(b, 1); };
  const hide = function (rig, names) { if (rig.hairGroups) names.forEach(function (n) { rig.hairGroups[n].visible = false; }); };

  // --- hats: over the head, whose crown is the skull's top at y = 0.8 ----------------------

  W('hat', 'cap', function (rig, item, pal) {
    hide(rig, ['top', 'fringe']);
    const h = rig.head;
    P(h, 0.94, 0.26, 0.86, 0, 0.8, -0.01, pal.a);
    P(h, 0.96, 0.07, 0.88, 0, 0.7, -0.01, pal.b);
    P(h, 0.68, 0.05, 0.3, 0, 0.7, 0.55, pal.b);
    P(h, 0.1, 0.06, 0.1, 0, 0.95, -0.01, pal.c);
  });

  W('hat', 'hood', function (rig, item, pal) {
    hide(rig, ['top', 'fringe']);
    const h = rig.head;
    P(h, 1.0, 0.36, 0.92, 0, 0.74, -0.03, pal.a);
    both(h, h, function (n, s) { P(n, 0.08, 0.66, 0.84, 0.49 * s, 0.4, -0.04, pal.a); });
    P(h, 1.0, 0.72, 0.1, 0, 0.42, -0.47, pal.b);
    P(h, 0.9, 0.1, 0.12, 0, 0.86, 0.4, pal.b);
    P(h, 0.94, 0.14, 0.62, 0, -0.03, -0.02, pal.a);
  });

  W('hat', 'bandana', function (rig, item, pal) {
    hide(rig, ['fringe']);
    const h = rig.head;
    P(h, 0.92, 0.12, 0.84, 0, 0.7, -0.01, pal.a);
    P(h, 0.14, 0.14, 0.14, 0, 0.7, -0.47, pal.b);
    [-1, 1].forEach(function (s) {
      const t = grp(h, 0.06 * s, 0.66, -0.52);
      P(t, 0.06, 0.24, 0.05, 0, -0.12, 0, pal.b);
      motion(rig, t, { axis: 'x', amp: 0.16, speed: 3, walk: 0.5, phase: s });
    });
  });

  W('hat', 'leathercap', function (rig, item, pal) {
    hide(rig, ['top', 'fringe']);
    const h = rig.head;
    P(h, 0.94, 0.28, 0.86, 0, 0.8, -0.01, pal.a);
    P(h, 0.96, 0.06, 0.88, 0, 0.68, -0.01, pal.b);
    both(h, h, function (n, s) { P(n, 0.06, 0.3, 0.22, 0.47 * s, 0.5, 0.0, pal.a); P(n, 0.04, 0.05, 0.16, 0.5 * s, 0.34, 0.0, pal.b); });
  });

  W('hat', 'straw', function (rig, item, pal) {
    hide(rig, ['top', 'fringe']);
    const h = rig.head;
    P(h, 0.72, 0.24, 0.68, 0, 0.9, -0.01, pal.a);
    P(h, 1.5, 0.05, 1.4, 0, 0.76, -0.01, pal.a);
    P(h, 1.3, 0.03, 1.2, 0, 0.735, -0.01, pal.b);
    P(h, 0.74, 0.07, 0.7, 0, 0.8, -0.01, pal.b);
  });

  W('hat', 'ironhelm', function (rig, item, pal) {
    hide(rig, ['top', 'fringe']);
    const h = rig.head;
    P(h, 0.96, 0.42, 0.88, 0, 0.74, -0.01, pal.a);
    P(h, 0.98, 0.07, 0.9, 0, 0.55, -0.01, pal.b);
    P(h, 0.06, 0.34, 0.05, 0, 0.42, 0.45, pal.b);
    both(h, h, function (n, s) { P(n, 0.06, 0.32, 0.34, 0.47 * s, 0.4, 0.06, pal.a); });
    P(h, 0.9, 0.05, 0.05, 0, 0.62, 0.44, pal.b);
    if (item.horns) {
      both(h, h, function (n, s) {
        const a = P(n, 0.12, 0.2, 0.12, 0.52 * s, 0.94, 0, mix(pal.a, 0xffffff, 0.4)); a.rotation.z = -0.5 * s;
        const b = P(n, 0.09, 0.2, 0.09, 0.66 * s, 1.08, 0, mix(pal.a, 0xffffff, 0.7)); b.rotation.z = -0.9 * s;
      });
    }
    if (item.plume) {
      const c = item.pal && item.pal.length > 2 ? pal.c : RED;
      P(h, 0.07, 0.2, 0.78, 0, 1.03, -0.02, c);
      const t = grp(h, 0, 0.98, -0.42);
      P(t, 0.07, 0.3, 0.14, 0, -0.1, -0.05, c);
      motion(rig, t, { axis: 'x', amp: 0.1, speed: 3, walk: 0.5, base: 0.2 });
    }
  });

  W('hat', 'wizard', function (rig, item, pal) {
    hide(rig, ['top', 'fringe']);
    const h = rig.head;
    P(h, 1.3, 0.05, 1.2, 0, 0.72, -0.01, pal.a);
    P(h, 0.78, 0.09, 0.72, 0, 0.78, -0.01, pal.b);
    P(h, 0.1, 0.1, 0.03, 0, 0.78, 0.37, GOLD);
    P(h, 0.76, 0.22, 0.7, 0, 0.9, -0.01, pal.a);
    P(h, 0.58, 0.22, 0.54, 0, 1.1, -0.03, pal.a);
    const tip = grp(h, 0, 1.2, -0.06);
    P(tip, 0.4, 0.22, 0.38, 0, 0.1, -0.02, pal.a);
    P(tip, 0.22, 0.2, 0.22, 0, 0.3, -0.07, pal.a);
    P(tip, 0.1, 0.14, 0.1, 0, 0.44, -0.12, pal.b);
    motion(rig, tip, { axis: 'x', amp: 0.04, speed: 2, walk: -0.2, base: -0.1 });
  });

  W('hat', 'laurel', function (rig, item, pal) {
    const h = rig.head;
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI * 0.9 + i * (Math.PI * 1.8 / 10);
      const leaf = P(h, 0.11, 0.06, 0.18, Math.sin(a) * 0.46, 0.72 + (i % 2) * 0.03, Math.cos(a) * 0.42 - 0.02, pal.a);
      leaf.rotation.y = a; leaf.rotation.z = (i % 2 ? 0.3 : -0.3);
    }
    P(h, 0.06, 0.06, 0.06, -0.3, 0.74, 0.34, pal.b); P(h, 0.06, 0.06, 0.06, 0.3, 0.74, 0.34, pal.b);
  });

  W('hat', 'crown', function (rig, item, pal) {
    const h = rig.head;
    P(h, 0.9, 0.1, 0.84, 0, 0.84, -0.01, pal.a);
    P(h, 0.92, 0.04, 0.86, 0, 0.8, -0.01, pal.b);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.8 + i * (Math.PI * 1.6 / 4);
      P(h, 0.11, 0.22, 0.11, Math.sin(a) * 0.4, 0.99, Math.cos(a) * 0.36 - 0.01, pal.a);
    }
    P(h, 0.09, 0.09, 0.04, 0, 0.85, 0.44, RED, { emissive: RED, emissiveI: 0.6 });
  });

  W('hat', 'halo', function (rig, item, pal) {
    const ring = grp(rig.head, 0, 1.2, 0);
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI * 2 / 10;
      const b = P(ring, 0.13, 0.05, 0.1, Math.sin(a) * 0.36, 0, Math.cos(a) * 0.36, pal.a, glowOf(item, pal.a, 0.9));
      b.rotation.y = a;
    }
    motion(rig, ring, { kind: 'bob', axis: 'y', base: 1.2, amp: 0.03, speed: 2.2 });
  });

  // --- tops: on the torso (y 0 to 0.52), sleeves on the arms -----------------------------------

  const shell = function (rig, color, opts) {
    const d = rig.dim;
    return P(rig.torso, d.bodyW + 0.05, 0.5, d.bodyD + 0.05, 0, 0.27, 0, color, opts);
  };
  const sleeves = function (rig, color, len, wide) {
    const d = rig.dim;
    [rig.armL, rig.armR].forEach(function (a) { P(a, d.armW + 0.03 + (wide || 0), len, d.armD + 0.03 + (wide || 0), 0, -len / 2 + 0.02, 0, color); });
  };
  const belt = function (rig, color, buckle) {
    const d = rig.dim;
    P(rig.torso, d.bodyW + 0.07, 0.07, d.bodyD + 0.07, 0, 0.12, 0, color);
    if (buckle != null) P(rig.torso, 0.09, 0.07, 0.03, 0, 0.12, d.bodyD / 2 + 0.05, buckle);
  };

  W('top', 'tunic', function (rig, item, pal) {
    const d = rig.dim;
    shell(rig, pal.a);
    P(rig.torso, d.bodyW + 0.07, 0.08, d.bodyD + 0.07, 0, 0.06, 0, pal.b);
    belt(rig, LEATHER, GOLD);
    sleeves(rig, pal.a, 0.18);
    P(rig.torso, 0.3, 0.04, 0.22, 0, 0.51, 0.01, pal.c);
  });

  W('top', 'shirt', function (rig, item, pal) {
    shell(rig, pal.a);
    sleeves(rig, pal.a, 0.34);
    [rig.armL, rig.armR].forEach(function (a) { P(a, rig.dim.armW + 0.05, 0.06, rig.dim.armD + 0.05, 0, -0.33, 0, pal.b); });
    P(rig.torso, 0.36, 0.05, 0.24, 0, 0.5, 0.01, mix(pal.a, 0xffffff, 0.55));
    P(rig.torso, 0.04, 0.04, 0.03, 0, 0.36, rig.dim.bodyD / 2 + 0.03, pal.b); P(rig.torso, 0.04, 0.04, 0.03, 0, 0.24, rig.dim.bodyD / 2 + 0.03, pal.b);
    belt(rig, pal.b);
  });

  W('top', 'vest', function (rig, item, pal) {
    const d = rig.dim;
    shell(rig, mix(pal.a, 0xffffff, 0.7));
    P(rig.torso, 0.24, 0.46, 0.04, -0.17 * d.bw, 0.27, d.bodyD / 2 + 0.03, pal.a);
    P(rig.torso, 0.24, 0.46, 0.04, 0.17 * d.bw, 0.27, d.bodyD / 2 + 0.03, pal.a);
    P(rig.torso, d.bodyW + 0.06, 0.46, 0.04, 0, 0.27, -d.bodyD / 2 - 0.03, pal.a);
    both(rig.torso, rig.torso, function (n, s) { P(n, 0.12, 0.07, d.bodyD + 0.06, 0.24 * s * d.bw, 0.5, 0, pal.b); });
    belt(rig, pal.b, GOLD);
  });

  W('top', 'hoodie', function (rig, item, pal) {
    const d = rig.dim;
    shell(rig, pal.a);
    P(rig.torso, 0.5, 0.22, 0.2, 0, 0.5, -0.22, pal.b);
    P(rig.torso, 0.32, 0.12, 0.03, 0, 0.14, d.bodyD / 2 + 0.03, pal.b);
    P(rig.torso, 0.03, 0.16, 0.03, -0.08, 0.42, d.bodyD / 2 + 0.03, pal.c); P(rig.torso, 0.03, 0.16, 0.03, 0.08, 0.42, d.bodyD / 2 + 0.03, pal.c);
    sleeves(rig, pal.a, 0.36);
    [rig.armL, rig.armR].forEach(function (a) { P(a, d.armW + 0.05, 0.05, d.armD + 0.05, 0, -0.35, 0, pal.b); });
  });

  W('top', 'robe', function (rig, item, pal) {
    const d = rig.dim;
    shell(rig, pal.a);
    P(rig.torso, d.bodyW + 0.16, 0.38, d.bodyD + 0.12, 0, -0.12, 0, pal.a);
    P(rig.torso, d.bodyW + 0.18, 0.05, d.bodyD + 0.14, 0, -0.3, 0, pal.c);
    P(rig.torso, d.bodyW + 0.08, 0.08, d.bodyD + 0.08, 0, 0.16, 0, pal.b);
    sleeves(rig, pal.a, 0.36, 0.08);
    [rig.armL, rig.armR].forEach(function (a) { P(a, d.armW + 0.13, 0.04, d.armD + 0.13, 0, -0.34, 0, pal.c); });
  });

  W('top', 'jerkin', function (rig, item, pal) {
    const d = rig.dim;
    shell(rig, pal.a);
    [-1, 1].forEach(function (s) { const b = P(rig.torso, 0.06, 0.56, 0.03, 0, 0.27, d.bodyD / 2 + 0.03, pal.b); b.rotation.z = 0.5 * s; });
    for (let i = 0; i < 3; i++) P(rig.torso, 0.05, 0.03, 0.03, 0, 0.16 + i * 0.1, d.bodyD / 2 + 0.035, mix(pal.a, 0xffffff, 0.5));
    both(rig.torso, rig.torso, function (n, s) { P(n, 0.16, 0.06, d.bodyD + 0.07, 0.24 * s * d.bw, 0.5, 0, pal.b); });
    belt(rig, pal.b, GOLD);
  });

  /* Chainmail, cuirass, bronze and the aegis are one shape in different metal:
     an under-shell, then plates or rings, a collar, a belt, and (for the heavier
     ones) pauldrons. */
  W('top', 'armor', function (rig, item, pal) {
    const d = rig.dim, t = rig.torso;
    const lit = glowOf(item, pal.c, 0.7);
    shell(rig, item.id === 'chain' ? pal.a : pal.b);
    if (item.id === 'chain') {
      for (let i = 0; i < 6; i++) P(t, d.bodyW + 0.07, 0.02, d.bodyD + 0.07, 0, 0.08 + i * 0.075, 0, pal.b);
      sleeves(rig, pal.a, 0.22);
      [rig.armL, rig.armR].forEach(function (a) { P(a, d.armW + 0.05, 0.02, d.armD + 0.05, 0, -0.14, 0, pal.b); });
    } else {
      P(t, d.bodyW + 0.09, 0.32, d.bodyD + 0.08, 0, 0.35, 0, pal.a);
      P(t, d.bodyW + 0.07, 0.08, d.bodyD + 0.06, 0, 0.16, 0, pal.a);
      P(t, d.bodyW + 0.05, 0.03, d.bodyD + 0.05, 0, 0.21, 0, pal.b);
      P(t, 0.1, 0.1, 0.03, 0, 0.36, d.bodyD / 2 + 0.06, pal.c, lit);
      if (item.glow) both(t, t, function (n, s) { P(n, 0.03, 0.3, 0.03, 0.2 * s * d.bw, 0.35, d.bodyD / 2 + 0.06, pal.c, lit); });
    }
    P(t, 0.44, 0.09, 0.3, 0, 0.5, 0, pal.a);
    belt(rig, pal.b, pal.c);
    if (item.pauldrons) {
      [rig.armL, rig.armR].forEach(function (a) {
        P(a, d.armW + 0.1, 0.13, d.armD + 0.1, 0, 0.02, 0, pal.a);
        P(a, d.armW + 0.12, 0.04, d.armD + 0.12, 0, -0.06, 0, pal.c, glowOf(item, pal.c, 0.4));
        P(a, 0.06, 0.1, 0.06, 0, 0.11, 0, pal.c);
      });
    }
  });

  W('top', 'toga', function (rig, item, pal) {
    const d = rig.dim, t = rig.torso;
    shell(rig, pal.a);
    P(t, d.bodyW + 0.08, 0.06, d.bodyD + 0.08, 0, 0.05, 0, pal.b);
    const sash = P(t, 0.17, 0.72, d.bodyD + 0.09, 0, 0.27, 0, pal.a); sash.rotation.z = 0.85;
    const edge = P(t, 0.03, 0.72, d.bodyD + 0.1, 0.09, 0.27, 0, pal.b); edge.rotation.z = 0.85;
    P(rig.armR, d.armW + 0.04, 0.22, d.armD + 0.04, 0, -0.09, 0, pal.a);
    P(rig.armR, d.armW + 0.05, 0.04, d.armD + 0.05, 0, -0.2, 0, pal.b);
    P(t, 0.08, 0.08, 0.04, -0.26 * d.bw, 0.44, d.bodyD / 2 + 0.05, pal.b);
  });

  // --- legs ------------------------------------------------------------------------------------------

  const legs = function (rig, fn) { both(rig.legL, rig.legR, fn); };
  const waist = function (rig, color) { P(rig.torso, rig.dim.bodyW + 0.04, 0.09, rig.dim.bodyD + 0.04, 0, 0.045, 0, color); };

  W('pants', 'trousers', function (rig, item, pal) {
    const d = rig.dim;
    waist(rig, pal.a);
    legs(rig, function (n, s) {
      P(n, d.legW + 0.03, 0.31, d.legD + 0.03, 0, -0.16, 0, pal.a);
      P(n, d.legW + 0.05, 0.04, d.legD + 0.05, 0, -0.31, 0, pal.b);
      if (item.pal) {
        P(n, 0.02, 0.28, d.legD + 0.04, (d.legW / 2 + 0.02) * s, -0.16, 0, pal.b);
        P(n, d.legW + 0.05, 0.08, 0.05, 0, -0.12, d.legD / 2 + 0.025, pal.b);
      }
    });
  });

  W('pants', 'shorts', function (rig, item, pal) {
    const d = rig.dim;
    waist(rig, pal.a);
    legs(rig, function (n) {
      P(n, d.legW + 0.03, 0.16, d.legD + 0.03, 0, -0.08, 0, pal.a);
      P(n, d.legW + 0.05, 0.04, d.legD + 0.05, 0, -0.16, 0, pal.b);
    });
  });

  W('pants', 'kilt', function (rig, item, pal) {
    const d = rig.dim, t = rig.torso;
    waist(rig, pal.b);
    P(t, d.bodyW + 0.1, 0.22, d.bodyD + 0.1, 0, -0.06, 0, pal.a);
    P(t, d.bodyW + 0.12, 0.03, d.bodyD + 0.12, 0, -0.03, 0, pal.b);
    P(t, d.bodyW + 0.12, 0.03, d.bodyD + 0.12, 0, -0.13, 0, pal.b);
    [-0.2, 0, 0.2].forEach(function (x) { P(t, 0.03, 0.22, d.bodyD + 0.12, x * d.bw, -0.06, 0, pal.c); });
  });

  W('pants', 'skirt', function (rig, item, pal) {
    const d = rig.dim, t = rig.torso;
    waist(rig, pal.b);
    P(t, d.bodyW + 0.16, 0.42, d.bodyD + 0.14, 0, -0.14, 0, pal.a);
    P(t, d.bodyW + 0.18, 0.05, d.bodyD + 0.16, 0, -0.32, 0, pal.b);
  });

  W('pants', 'greaves', function (rig, item, pal) {
    const d = rig.dim, t = rig.torso;
    const full = item.id === 'platelegs';
    waist(rig, pal.b);
    legs(rig, function (n) {
      P(n, d.legW + 0.03, 0.31, d.legD + 0.03, 0, -0.16, 0, shade(pal.b, 0.8));
      P(n, d.legW + 0.06, 0.08, d.legD + 0.06, 0, -0.1, 0, pal.a);
      P(n, d.legW + 0.05, 0.17, d.legD + 0.05, 0, -0.24, 0, pal.a);
      if (full) P(n, d.legW + 0.06, 0.12, d.legD + 0.06, 0, -0.03, 0, pal.a);
    });
    if (full) both(t, t, function (n, s) { P(n, 0.24, 0.16, 0.05, 0.15 * s * d.bw, -0.03, d.bodyD / 2 + 0.06, pal.a); });
  });

  // --- boots ----------------------------------------------------------------------------------------------

  const foot = function (n, d, main, cuff, sole, h) {
    P(n, d.legW + 0.05, h, d.legD + 0.05, 0, -0.34 + h / 2 + 0.03, 0, main);
    P(n, d.legW + 0.05, 0.09, 0.12, 0, -0.295, d.legD / 2 + 0.05, main);
    P(n, d.legW + 0.06, 0.03, d.legD + 0.2, 0, -0.325, 0.05, sole);
    if (cuff != null) P(n, d.legW + 0.07, 0.04, d.legD + 0.07, 0, -0.34 + h + 0.03, 0, cuff);
  };

  W('boots', 'boots', function (rig, item, pal) { legs(rig, function (n) { foot(n, rig.dim, pal.a, pal.c, shade(pal.a, 0.5), 0.17); }); });
  W('boots', 'shoes', function (rig, item, pal) { legs(rig, function (n) { foot(n, rig.dim, pal.a, null, shade(pal.a, 0.5), 0.09); }); });
  W('boots', 'ironboots', function (rig, item, pal) {
    legs(rig, function (n, s) {
      foot(n, rig.dim, pal.a, pal.b, pal.b, 0.18);
      P(n, 0.04, 0.05, 0.07, 0.1 * s, -0.3, -rig.dim.legD / 2 - 0.05, pal.b);
    });
  });
  W('boots', 'sandals', function (rig, item, pal) {
    const d = rig.dim;
    legs(rig, function (n) {
      P(n, d.legW + 0.02, 0.03, d.legD + 0.14, 0, -0.325, 0.04, pal.a);
      P(n, d.legW + 0.04, 0.025, d.legD + 0.04, 0, -0.29, 0, pal.b);
      P(n, d.legW + 0.04, 0.025, d.legD + 0.04, 0, -0.22, 0, pal.b);
    });
  });
  W('boots', 'winged', function (rig, item, pal) {
    const d = rig.dim;
    legs(rig, function (n, s) {
      foot(n, d, pal.a, pal.b, pal.b, 0.15);
      const w = grp(n, 0.16 * s * d.bw, -0.24, -0.02);
      const a = P(w, 0.03, 0.16, 0.12, 0.03 * s, 0.03, 0, pal.a); a.rotation.z = -0.45 * s;
      const b = P(w, 0.03, 0.12, 0.1, 0.07 * s, -0.03, 0, pal.b); b.rotation.z = -0.8 * s;
      motion(rig, w, { axis: 'y', amp: 0.16, speed: 5, phase: s });
    });
  });

  // --- gloves: the hand is the bottom 0.12 of the arm ---------------------------------------------------------

  W('gloves', 'fingerless', function (rig, item, pal) {
    const d = rig.dim;
    [rig.armL, rig.armR].forEach(function (a) {
      P(a, d.armW + 0.04, 0.1, d.armD + 0.04, 0, -0.3, 0, pal.a);
      P(a, d.armW + 0.05, 0.03, d.armD + 0.05, 0, -0.36, 0, pal.b);
    });
  });
  W('gloves', 'gloves', function (rig, item, pal) {
    const d = rig.dim;
    [rig.armL, rig.armR].forEach(function (a) {
      P(a, d.armW + 0.04, 0.13, d.armD + 0.04, 0, -0.335, 0, pal.a);
      P(a, d.armW + 0.06, 0.06, d.armD + 0.06, 0, -0.26, 0, pal.b);
    });
  });
  W('gloves', 'gauntlets', function (rig, item, pal) {
    const d = rig.dim;
    [rig.armL, rig.armR].forEach(function (a) {
      P(a, d.armW + 0.06, 0.2, d.armD + 0.06, 0, -0.26, 0, pal.a);
      P(a, d.armW + 0.05, 0.13, d.armD + 0.05, 0, -0.35, 0, pal.b);
      P(a, d.armW + 0.08, 0.04, d.armD + 0.08, 0, -0.17, 0, pal.a);
    });
  });

  // --- capes: hung from the shoulders, streaming behind when he runs ----------------------------------------------

  const hanger = function (rig, base) {
    const d = rig.dim;
    const piv = grp(rig.torso, 0, 0.5, -(d.bodyD / 2 + 0.03));
    motion(rig, piv, { axis: 'x', base: base == null ? 0.05 : base, amp: 0.05, speed: 2.2, walk: 0.5, air: 0.25 });
    return piv;
  };
  const clasps = function (rig) {
    both(rig.torso, rig.torso, function (n, s) { P(n, 0.08, 0.08, 0.06, 0.22 * s * rig.dim.bw, 0.5, 0.2, GOLD); });
  };

  W('cape', 'short', function (rig, item, pal) {
    const d = rig.dim, piv = hanger(rig);
    P(piv, d.bodyW * 0.92, 0.5, 0.05, 0, -0.25, -0.02, pal.a);
    P(piv, d.bodyW * 0.92, 0.06, 0.06, 0, -0.5, -0.02, pal.b);
    clasps(rig);
  });

  W('cape', 'long', function (rig, item, pal) {
    const d = rig.dim, piv = hanger(rig);
    const lit = glowOf(item, pal.b, 0.8);
    P(piv, d.bodyW * 0.95, 0.78, 0.05, 0, -0.39, -0.02, pal.a);
    P(piv, d.bodyW * 1.06, 0.18, 0.05, 0, -0.72, -0.02, pal.a);
    P(piv, d.bodyW * 1.08, 0.04, 0.06, 0, -0.82, -0.02, pal.b, lit);
    both(piv, piv, function (n, s) { P(n, 0.03, 0.8, 0.06, d.bodyW * 0.49 * s, -0.4, -0.02, pal.b, lit); });
    clasps(rig);
  });

  W('cape', 'tattered', function (rig, item, pal) {
    const d = rig.dim, piv = hanger(rig, 0.08);
    const lens = [0.7, 0.52, 0.82, 0.48, 0.66];
    lens.forEach(function (len, i) {
      const x = (i - 2) * (d.bodyW * 0.2);
      const strip = grp(piv, x, 0, -0.02);
      P(strip, d.bodyW * 0.2, len, 0.05, 0, -len / 2, 0, i % 2 ? pal.b : pal.a);
      motion(rig, strip, { axis: 'x', amp: 0.07, speed: 2.6 + i * 0.3, phase: i * 1.1, walk: 0.3 });
    });
    P(piv, d.bodyW + 0.06, 0.12, 0.3, 0, 0.02, 0.1, pal.b);
  });

  W('cape', 'royal', function (rig, item, pal) {
    const d = rig.dim, piv = hanger(rig);
    const edge = item.pal && item.pal.length > 2 ? pal.c : pal.b;
    P(piv, d.bodyW * 1.02, 0.86, 0.05, 0, -0.43, -0.02, pal.a);
    P(piv, d.bodyW * 1.1, 0.05, 0.06, 0, -0.86, -0.02, edge);
    both(piv, piv, function (n, s) { P(n, 0.04, 0.86, 0.06, d.bodyW * 0.52 * s, -0.43, -0.02, edge); });
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * (d.bodyW * 0.16);
      P(rig.torso, 0.12, 0.1, 0.14, x, 0.5, 0.12 - Math.abs(i - 3) * 0.03 + 0.03, CREAM);
      if (i % 2) P(rig.torso, 0.04, 0.04, 0.04, x, 0.52, 0.2 - Math.abs(i - 3) * 0.03, 0x22202c);
    }
  });

  W('cape', 'wings', function (rig, item, pal) {
    const d = rig.dim;
    both(rig.torso, rig.torso, function (n, s) {
      const w = grp(n, 0.16 * s * d.bw, 0.42, -(d.bodyD / 2 + 0.05));
      for (let i = 0; i < 4; i++) {
        const f = P(w, 0.42 - i * 0.05, 0.1, 0.04, (0.2 - i * 0.02) * s, 0.14 - i * 0.14, -0.02 * i, i % 2 ? pal.b : pal.a);
        f.rotation.z = (0.5 + i * 0.22) * s;
      }
      motion(rig, w, { axis: 'y', base: -0.35 * s, amp: 0.1, speed: 2.8, phase: s * 1.5, walk: 0.3 * s });
    });
  });

  W('cape', 'flamecape', function (rig, item, pal) {
    const d = rig.dim, piv = hanger(rig, 0.1);
    const lit = glowOf(item, pal.a, 0.9);
    P(piv, d.bodyW * 0.9, 0.62, 0.05, 0, -0.31, -0.02, pal.a, lit);
    for (let i = 0; i < 5; i++) {
      const f = P(piv, d.bodyW * 0.17, 0.3, 0.05, (i - 2) * d.bodyW * 0.19, -0.7 - (i % 2) * 0.06, -0.02, i % 2 ? pal.a : pal.b, lit);
      motion(rig, f, { kind: 'flick', amp: 0.2, speed: 8 + i, phase: i * 1.3 });
    }
  });

  // --- extras ------------------------------------------------------------------------------------------------------------

  W('extra', 'scarf', function (rig, item, pal) {
    const d = rig.dim;
    P(rig.torso, d.bodyW + 0.03, 0.1, d.bodyD + 0.07, 0, 0.51, 0, pal.a);
    P(rig.torso, 0.13, 0.32, 0.05, -0.12, 0.34, d.bodyD / 2 + 0.05, pal.b);
    const tail = grp(rig.torso, 0.14, 0.5, -(d.bodyD / 2 + 0.04));
    P(tail, 0.14, 0.34, 0.05, 0, -0.17, 0, pal.b);
    motion(rig, tail, { axis: 'x', amp: 0.12, speed: 3, walk: 0.7, base: 0.1 });
  });

  W('extra', 'eyepatch', function (rig) {
    const h = rig.head;
    P(h, 0.15, 0.13, 0.03, -0.16, 0.42, 0.4, 0x1a1626);
    const strap = P(h, 0.98, 0.03, 0.02, 0, 0.5, 0.39, 0x1a1626); strap.rotation.z = 0.32;
  });

  W('extra', 'glasses', function (rig) {
    const h = rig.head, Z = 0.42, frame = 0x2c2a38;
    [-1, 1].forEach(function (s) {
      const x = 0.16 * s;
      P(h, 0.19, 0.02, 0.03, x, 0.5, Z, frame); P(h, 0.19, 0.02, 0.03, x, 0.35, Z, frame);
      P(h, 0.02, 0.15, 0.03, x - 0.095, 0.425, Z, frame); P(h, 0.02, 0.15, 0.03, x + 0.095, 0.425, Z, frame);
      P(h, 0.17, 0.13, 0.02, x, 0.425, Z, 0xbfe8ff, { opacity: 0.22 });
      P(h, 0.02, 0.02, 0.6, 0.43 * s, 0.45, 0.1, frame);
    });
    P(h, 0.08, 0.02, 0.03, 0, 0.45, Z, frame);
  });

  W('extra', 'mask', function (rig, item, pal) {
    const h = rig.head;
    P(h, 0.66, 0.22, 0.04, 0, 0.44, 0.4, pal.a);
    P(h, 0.66, 0.03, 0.05, 0, 0.55, 0.4, pal.b);
    both(h, h, function (n, s) { P(n, 0.13, 0.05, 0.05, 0.16 * s, 0.44, 0.42, pal.b); });
  });

  W('extra', 'necklace', function (rig, item, pal) {
    const t = rig.torso, z = rig.dim.bodyD / 2 + 0.04;
    both(t, t, function (n, s) { const c = P(n, 0.03, 0.26, 0.02, 0.1 * s, 0.4, z, pal.a); c.rotation.z = 0.5 * s; });
    P(t, 0.13, 0.13, 0.04, 0, 0.27, z + 0.01, pal.a);
    P(t, 0.08, 0.08, 0.05, 0, 0.27, z + 0.03, pal.b, { emissive: pal.b, emissiveI: 0.9 });
  });

  W('extra', 'pauldrons', function (rig, item, pal) {
    const d = rig.dim;
    [rig.armL, rig.armR].forEach(function (a, i) {
      const s = i ? 1 : -1;
      P(a, d.armW + 0.12, 0.13, d.armD + 0.12, 0, 0.02, 0, pal.a);
      P(a, d.armW + 0.14, 0.04, d.armD + 0.14, 0, -0.06, 0, pal.b);
      [-0.05, 0.05].forEach(function (z) {
        const sp = P(a, 0.05, 0.16, 0.05, 0.03 * s, 0.14, z, pal.b); sp.rotation.z = -0.3 * s;
      });
    });
  });

  W('extra', 'aura', function (rig, item, pal) {
    const ring = grp(rig.torso, 0, 0.3, 0);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI * 2 / 12;
      const b = P(ring, 0.1, 0.04, 0.07, Math.sin(a) * 0.56, (i % 2) * 0.04, Math.cos(a) * 0.56, pal.a, glowOf(item, pal.a, 0.9));
      b.rotation.y = a;
    }
    motion(rig, ring, { kind: 'spin', speed: 0.9 });
  });
})(window.DS);
