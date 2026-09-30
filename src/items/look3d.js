/* The hero as a look draws him: body, face, hair and everything worn, built from
   the same boxes and the same skeleton as every other voxel model, so the pose
   code in renderer3d.js (walk, jump, climb, every swing) drives it unchanged.

   build(look) returns { root, torso, head, skull, body, armL, armR, legL, legR,
   motion, animate }: the seven names poseHero reads, plus a small list of things
   that sway or flicker (a cape, a ponytail, a flame). What is worn lives in
   look3d-wear.js; this file is the person underneath and the rules for putting
   things on. A worn look beats the armour in the bag for how the hero LOOKS. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const BUILD = { slim: 0.86, regular: 1, broad: 1.16 };
  const STATURE = { short: 0.92, mid: 1, tall: 1.08 };
  const R = 0.42;                                   // head radius: the chibi's unit

  // --- colour ------------------------------------------------------------------------

  function hexInt(s) { return typeof s === 'number' ? s : parseInt(String(s).slice(1), 16); }
  function shade(c, k) {
    const r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * k)));
    const g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * k)));
    const b = Math.max(0, Math.min(255, Math.round((c & 255) * k)));
    return (r << 16) | (g << 8) | b;
  }
  function mix(a, b, t) {
    const f = function (s) { return Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); };
    return (f(16) << 16) | (f(8) << 8) | f(0);
  }

  /* The colours a piece is painted in: a fixed palette for a premium piece, the
     wearer's dye for a plain one. a is the main colour, b the shadow, c the trim. */
  function palOf(item, look, slot) {
    if (item && item.pal) {
      const a = hexInt(item.pal[0]);
      const b = hexInt(item.pal[1] || item.pal[0]);
      return { a: a, b: b, c: hexInt(item.pal[2] || item.pal[1] || item.pal[0]) };
    }
    const dye = DS.Look.DYE_OF[slot];
    const a = hexInt(DS.Look.traitColor('dye', dye ? look[dye] : 'grey'));
    return { a: a, b: shade(a, 0.7), c: mix(a, 0xffffff, 0.3) };
  }

  const glowOf = function (item, color, k) {
    return item && item.glow ? { emissive: color, emissiveI: k == null ? 0.55 : k } : undefined;
  };

  function P(parent, sx, sy, sz, x, y, z, color, opts) { return DS.Voxel.part(parent, sx, sy, sz, x, y, z, color, opts); }
  function grp(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(g);
    return g;
  }

  // --- the person underneath -----------------------------------------------------------

  function skeleton(look) {
    const bw = BUILD[look.build] || 1;
    const skin = hexInt(DS.Look.traitColor('skin', look.skin));
    const dim = { bw: bw, bodyW: 0.62 * bw, bodyH: 0.52, bodyD: 0.4, armW: 0.16 * bw, armH: 0.4, armD: 0.18,
                  legW: 0.2 * bw, legH: 0.34, legD: 0.22 };
    const root = new THREE.Group();
    const figure = grp(root);
    figure.scale.setScalar(STATURE[look.height] || 1);

    const torso = grp(figure, 0, dim.legH, 0);
    const body = P(torso, dim.bodyW, dim.bodyH, dim.bodyD, 0, dim.bodyH / 2, 0, skin);
    const head = grp(torso, 0, dim.bodyH, 0);
    const skull = P(head, R * 2, R * 1.9, R * 1.8, 0, R * 0.95, 0, skin);

    const limb = function (x) {
      const g = grp(torso, x, dim.bodyH * 0.86, 0);
      P(g, dim.armW, dim.armH, dim.armD, 0, -dim.armH / 2, 0, skin);
      return g;
    };
    const armL = limb(-(dim.bodyW / 2 + dim.armW / 2));
    const armR = limb(dim.bodyW / 2 + dim.armW / 2);
    const leg = function (x) {
      const g = grp(figure, x, dim.legH, 0);
      P(g, dim.legW, dim.legH, dim.legD, 0, -dim.legH / 2, 0, skin);
      return g;
    };
    const legL = leg(-dim.bodyW * 0.24);
    const legR = leg(dim.bodyW * 0.24);
    return { root: root, figure: figure, torso: torso, body: body, head: head, skull: skull, armL: armL, armR: armR,
             legL: legL, legR: legR, dim: dim, skin: skin, motion: [], hair: null };
  }

  /* Things that move by themselves: a cape that streams when he runs, a pony-tail,
     a flame that gutters, a halo that turns. animate() plays them each frame. */
  function motion(rig, node, spec) {
    rig.motion.push(Object.assign({ node: node, kind: 'sway', axis: 'x', base: node.rotation[spec.axis || 'x'] || 0,
                                    amp: 0.04, speed: 2, phase: rig.motion.length * 1.7, walk: 0 }, spec));
    return node;
  }

  function animate(m, p, time) {
    const walk = Math.min(1, Math.abs((p && p.vx) || 0) / 2.2);
    const air = p && !p.onGround && !p.onRope;
    for (let i = 0; i < m.motion.length; i++) {
      const s = m.motion[i];
      if (s.kind === 'sway') {
        s.node.rotation[s.axis] = s.base + Math.sin(time * s.speed + s.phase) * s.amp + walk * s.walk + (air ? (s.air || 0) : 0);
      } else if (s.kind === 'flick') {
        s.node.scale.y = 1 + Math.sin(time * s.speed + s.phase) * s.amp;
      } else if (s.kind === 'spin') {
        s.node.rotation.y = time * s.speed + s.phase;
      } else if (s.kind === 'bob') {
        s.node.position.y = s.base + Math.sin(time * s.speed + s.phase) * s.amp;
      }
    }
  }

  // --- the face ----------------------------------------------------------------------------

  const WHITE = 0xf4f2f8, INK = 0x1a1626, LIP = 0x8a4a42;

  function face(rig, look) {
    const head = rig.head;
    const skin = rig.skin;
    const eyeC = hexInt(DS.Look.traitColor('eyeColor', look.eyeColor));
    const hairC = hexInt(DS.Look.traitColor('hairColor', look.hairColor));
    const Z = R * 1.0;                              // just past the skull's front face
    const ex = R * 0.38, ey = R * 1.0;

    // Ears and a nose: they are what tells a side-on walk from a blank slab.
    P(head, 0.06, 0.14, 0.1, -R - 0.02, R * 0.85, 0, shade(skin, 0.94));
    P(head, 0.06, 0.14, 0.1, R + 0.02, R * 0.85, 0, shade(skin, 0.94));
    P(head, 0.07, 0.08, 0.07, 0, R * 0.78, Z - 0.01, shade(skin, 0.93));

    const eye = function (side) {
      const x = ex * side;
      const kind = look.eyes;
      if (kind === 'happy') {                       // two arches, ^ ^
        const a = P(head, 0.07, 0.03, 0.04, x - 0.03 * side, ey + 0.02, Z, INK); a.rotation.z = 0.6 * side;
        const b = P(head, 0.07, 0.03, 0.04, x + 0.03 * side, ey + 0.02, Z, INK); b.rotation.z = -0.6 * side;
        return;
      }
      const dims = { round: [0.1, 0.11, 0.06, 0.08], narrow: [0.11, 0.06, 0.06, 0.05], sleepy: [0.1, 0.08, 0.06, 0.06],
                     wide: [0.11, 0.13, 0.07, 0.09], sharp: [0.11, 0.07, 0.06, 0.05] }[kind] || [0.1, 0.11, 0.06, 0.08];
      const white = P(head, dims[0], dims[1], 0.04, x, ey, Z, WHITE);
      P(head, dims[2], dims[3], 0.05, x + 0.005 * side, ey, Z + 0.01, eyeC);
      P(head, dims[2] * 0.5, dims[3] * 0.6, 0.05, x + 0.005 * side, ey, Z + 0.02, INK);
      if (kind === 'sharp') white.rotation.z = -0.28 * side;
      if (kind === 'sleepy') P(head, dims[0] + 0.01, 0.04, 0.05, x, ey + 0.045, Z + 0.015, shade(skin, 0.85));
    };
    eye(-1); eye(1);

    // Brows sit under the fringe line, in the hair's colour a shade darker.
    if (look.brows !== 'none') {
      const bc = shade(hairC, 0.8);
      const spec = { plain: [0.12, 0.03, 0], thick: [0.13, 0.055, 0], thin: [0.12, 0.018, 0], angled: [0.12, 0.035, 0.34] }[look.brows] || [0.12, 0.03, 0];
      [-1, 1].forEach(function (side) {
        const b = P(head, spec[0], spec[1], 0.04, ex * side, ey + 0.11, Z - 0.005, bc);
        b.rotation.z = spec[2] * side;
      });
    }

    const mouth = function (sx, sy, x, y, c) { P(head, sx, sy, 0.05, x, y, Z + 0.01, c || LIP); };
    const my = R * 0.52;
    switch (look.mouth) {
      case 'neutral': mouth(0.12, 0.03, 0, my); break;
      case 'grin': mouth(0.2, 0.06, 0, my, INK); mouth(0.16, 0.03, 0, my + 0.012, WHITE); break;
      case 'smirk': mouth(0.1, 0.03, -0.01, my); mouth(0.04, 0.03, 0.07, my + 0.03); break;
      case 'frown': mouth(0.1, 0.03, 0, my); mouth(0.04, 0.03, -0.07, my - 0.03); mouth(0.04, 0.03, 0.07, my - 0.03); break;
      default: mouth(0.1, 0.03, 0, my); mouth(0.04, 0.03, -0.07, my + 0.03); mouth(0.04, 0.03, 0.07, my + 0.03);
    }
  }

  // --- hair ----------------------------------------------------------------------------------

  /* Three parts so a hat can take the crown and leave the rest: `top`, `fringe`
     and `back` (sides, nape and anything that hangs). */
  const HAIR = {
    bald: function () {},
    buzz: function (p, c) {
      p('top', 0.88, 0.1, 0.8, 0, 0.8, -0.01, c.dk); p('fringe', 0.86, 0.06, 0.08, 0, 0.75, 0.37, c.dk);
      p('back', 0.06, 0.14, 0.5, -0.44, 0.7, -0.06, c.dk); p('back', 0.06, 0.14, 0.5, 0.44, 0.7, -0.06, c.dk);
    },
    short: function (p, c) { HAIR.cap(p, c); p('back', 0.9, 0.34, 0.1, 0, 0.62, -0.4, c.a); },
    cap: function (p, c) {
      p('top', 0.9, 0.3, 0.82, 0, 0.7, -0.02, c.a);
      p('fringe', 0.88, 0.2, 0.2, 0, 0.7, 0.36, c.a);
      p('back', 0.05, 0.26, 0.56, -0.44, 0.62, -0.06, c.a); p('back', 0.05, 0.26, 0.56, 0.44, 0.62, -0.06, c.a);
    },
    long: function (p, c) {
      HAIR.cap(p, c);
      p('back', 0.92, 0.78, 0.14, 0, 0.36, -0.4, c.a);
      p('back', 0.1, 0.62, 0.5, -0.45, 0.4, -0.06, c.a); p('back', 0.1, 0.62, 0.5, 0.45, 0.4, -0.06, c.a);
      p('back', 0.94, 0.12, 0.16, 0, -0.02, -0.4, c.dk);
    },
    sidepart: function (p, c) {
      p('top', 0.9, 0.3, 0.82, 0, 0.7, -0.02, c.a);
      p('fringe', 0.54, 0.3, 0.2, 0.17, 0.66, 0.36, c.a); p('fringe', 0.3, 0.16, 0.2, -0.28, 0.74, 0.36, c.dk);
      p('back', 0.05, 0.26, 0.56, -0.44, 0.62, -0.06, c.a); p('back', 0.05, 0.26, 0.56, 0.44, 0.62, -0.06, c.a);
      p('back', 0.9, 0.34, 0.1, 0, 0.62, -0.4, c.a);
    },
    ponytail: function (p, c, rig) {
      HAIR.short(p, c);
      const tail = grp(rig.hairGroups.back, 0, 0.66, -0.44);
      p.to(tail, 0.16, 0.16, 0.16, 0, 0, -0.03, c.dk);
      p.to(tail, 0.18, 0.42, 0.14, 0, -0.26, -0.05, c.a); p.to(tail, 0.12, 0.2, 0.1, 0, -0.55, -0.05, c.dk);
      motion(rig, tail, { axis: 'x', amp: 0.08, speed: 2.4, walk: 0.5, base: 0.15 });
    },
    bun: function (p, c) {
      HAIR.short(p, c);
      p('top', 0.3, 0.3, 0.3, 0, 1.02, -0.06, c.a); p('top', 0.34, 0.06, 0.34, 0, 0.9, -0.06, c.dk);
    },
    curly: function (p, c) {
      p('top', 0.98, 0.34, 0.9, 0, 0.72, -0.02, c.a);
      [[-0.32, 0.94, 0.1], [0.0, 1.0, 0.0], [0.32, 0.94, 0.1], [-0.42, 0.7, -0.26], [0.42, 0.7, -0.26]].forEach(function (q) {
        p('top', 0.26, 0.24, 0.26, q[0], q[1], q[2], c.dk);
      });
      p('fringe', 0.94, 0.22, 0.24, 0, 0.72, 0.36, c.a);
      [-0.3, 0, 0.3].forEach(function (x) { p('fringe', 0.22, 0.16, 0.16, x, 0.6, 0.44, c.a); });
      p('back', 0.98, 0.5, 0.2, 0, 0.5, -0.38, c.a);
      p('back', 0.12, 0.42, 0.5, -0.46, 0.5, -0.06, c.a); p('back', 0.12, 0.42, 0.5, 0.46, 0.5, -0.06, c.a);
    },
    braid: function (p, c, rig) {
      HAIR.short(p, c);
      const braid = grp(rig.hairGroups.back, 0.28, 0.5, -0.42);
      for (let i = 0; i < 4; i++) p.to(braid, 0.13, 0.15, 0.13, 0, -0.08 - i * 0.14, 0, i % 2 ? c.dk : c.a);
      p.to(braid, 0.08, 0.1, 0.08, 0, -0.7, 0, c.dk);
      motion(rig, braid, { axis: 'x', amp: 0.06, speed: 2.1, walk: 0.4, base: 0.1 });
    },
    mohawk: function (p, c) {
      HAIR.buzz(p, c);
      [[0.36, 0.3, 0.3], [0.5, 0.2, 0.2], [0.4, 0.18, 0.0], [0.3, 0.14, -0.28]].forEach(function (q, i) {
        p('top', 0.14, q[0], 0.22, 0, 0.86 + q[0] / 2 - 0.05, q[2] - 0.04 * i, c.a);
      });
    },
    undercut: function (p, c) {
      HAIR.buzz(p, c);
      p('top', 0.8, 0.28, 0.78, 0, 0.9, 0, c.a); p('fringe', 0.84, 0.22, 0.24, 0, 0.82, 0.34, c.a);
      p('fringe', 0.5, 0.16, 0.14, 0.14, 0.7, 0.46, c.dk);
    },
    afro: function (p, c) {
      p('top', 1.16, 0.62, 1.06, 0, 0.92, -0.05, c.a); p('top', 0.96, 0.3, 0.9, 0, 1.3, -0.05, c.dk);
      p('fringe', 1.02, 0.18, 0.24, 0, 0.7, 0.44, c.a);
      p('back', 1.12, 0.62, 0.3, 0, 0.6, -0.45, c.a);
      p('back', 0.16, 0.5, 0.6, -0.52, 0.6, -0.06, c.a); p('back', 0.16, 0.5, 0.6, 0.52, 0.6, -0.06, c.a);
    },
    twintails: function (p, c, rig) {
      HAIR.cap(p, c); p('back', 0.9, 0.34, 0.1, 0, 0.62, -0.4, c.a);
      [-1, 1].forEach(function (s) {
        const t = grp(rig.hairGroups.back, 0.5 * s, 0.6, -0.1);
        p.to(t, 0.14, 0.14, 0.14, 0, 0, 0, 0xe0446a);
        p.to(t, 0.16, 0.5, 0.16, 0.02 * s, -0.3, 0, c.a); p.to(t, 0.12, 0.16, 0.12, 0.03 * s, -0.62, 0, c.dk);
        motion(rig, t, { axis: 'z', amp: 0.07, speed: 2.3, walk: 0, base: 0.14 * s, phase: s });
      });
    },
    wolf: function (p, c) {
      HAIR.cap(p, c);
      p('back', 1.0, 0.5, 0.3, 0, 0.44, -0.42, c.a);
      [-0.34, -0.11, 0.11, 0.34].forEach(function (x, i) { p('back', 0.18, 0.2 + (i % 2) * 0.1, 0.16, x, 0.14 - (i % 2) * 0.05, -0.46, c.dk); });
      [-1, 1].forEach(function (s) { p('back', 0.14, 0.4, 0.3, 0.5 * s, 0.4, -0.1, c.a); p('back', 0.1, 0.2, 0.2, 0.52 * s, 0.14, -0.1, c.dk); });
      [-0.3, 0, 0.3].forEach(function (x, i) { p('fringe', 0.2, 0.26 + (i === 1 ? 0.1 : 0), 0.14, x, 0.62, 0.44, c.a); });
    },
    topknot: function (p, c) {
      HAIR.buzz(p, c);
      p('top', 0.5, 0.2, 0.5, 0, 0.9, 0, c.a); p('top', 0.26, 0.3, 0.26, 0, 1.08, 0, c.a); p('top', 0.32, 0.06, 0.32, 0, 0.98, 0, 0xc0303c);
    },
    crownbraids: function (p, c) {
      HAIR.short(p, c);
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.85 + i * (Math.PI * 1.7 / 8);
        p('top', 0.15, 0.13, 0.15, Math.sin(a) * 0.42, 0.9, Math.cos(a) * 0.4 - 0.02, i % 2 ? c.dk : c.a);
      }
      [-1, 1].forEach(function (s) { for (let i = 0; i < 3; i++) p('back', 0.11, 0.14, 0.11, 0.48 * s, 0.5 - i * 0.13, -0.06, i % 2 ? c.dk : c.a); });
    },
    flame: function (p, c, rig) {
      HAIR.cap(p, c);
      [[0, 0.46, 0.0], [-0.26, 0.34, 0.06], [0.26, 0.34, 0.06], [-0.4, 0.22, -0.1], [0.4, 0.22, -0.1], [0, 0.3, -0.3]].forEach(function (q, i) {
        const f = p.to(rig.hairGroups.top, 0.16, q[1], 0.16, q[0], 0.85 + q[1] / 2, q[2], i % 2 ? c.a : c.b);
        motion(rig, f, { kind: 'flick', amp: 0.16, speed: 7 + i, phase: i * 1.3 });
      });
    },
    spirit: function (p, c, rig) {
      HAIR.long(p, c);
      [-1, 1].forEach(function (s, i) {
        const w = p.to(rig.hairGroups.back, 0.1, 0.3, 0.1, 0.56 * s, 0.1, -0.2, c.b);
        motion(rig, w, { kind: 'bob', axis: 'y', base: 0.1, amp: 0.06, speed: 2 + i, phase: i * 2 });
      });
    }
  };

  function hair(rig, look) {
    const item = DS.Look.itemOf('hair', look.hair);
    if (!item || item.id === 'bald') return;
    const hc = item.pal ? hexInt(item.pal[0]) : hexInt(DS.Look.traitColor('hairColor', look.hairColor));
    const c = { a: hc, b: item.pal ? hexInt(item.pal[1] || item.pal[0]) : shade(hc, 0.9), dk: shade(hc, 0.78) };
    rig.hairGroups = { top: grp(rig.head), fringe: grp(rig.head), back: grp(rig.head) };
    const opts = item.glow ? { emissive: c.a, emissiveI: 0.5 } : undefined;
    const put = function (name, sx, sy, sz, x, y, z, color) { return P(rig.hairGroups[name], sx, sy, sz, x, y, z, color, opts); };
    put.to = function (parent, sx, sy, sz, x, y, z, color) { return P(parent, sx, sy, sz, x, y, z, color, opts); };
    (HAIR[item.id] || HAIR.short)(put, c, rig);
  }

  // --- beards and marks ------------------------------------------------------------------------

  function facial(rig, look) {
    const item = DS.Look.itemOf('facial', look.facial);
    if (!item || item.id === 'none') return;
    const head = rig.head;
    const c = hexInt(DS.Look.traitColor('hairColor', look.hairColor));
    const dk = shade(c, 0.85);
    const Z = R * 0.9;
    const stache = function () { P(head, 0.26, 0.05, 0.06, 0, R * 0.68, Z + 0.06, dk); P(head, 0.05, 0.06, 0.06, -0.14, R * 0.64, Z + 0.06, dk); P(head, 0.05, 0.06, 0.06, 0.14, R * 0.64, Z + 0.06, dk); };
    if (item.id === 'stubble') {
      P(head, 0.62, 0.17, 0.04, 0, R * 0.32, Z + 0.02, c, { opacity: 0.45 });
    } else if (item.id === 'mustache') stache();
    else if (item.id === 'goatee') { stache(); P(head, 0.15, 0.16, 0.06, 0, R * 0.2, Z + 0.03, c); }
    else {
      const long = item.id === 'longbeard';
      P(head, 0.64, 0.3, 0.06, 0, R * 0.34, Z + 0.02, c);
      P(head, 0.06, 0.32, 0.5, -0.42, R * 0.4, 0.02, dk); P(head, 0.06, 0.32, 0.5, 0.42, R * 0.4, 0.02, dk);
      stache();
      if (long) {
        P(head, 0.5, 0.4, 0.1, 0, -0.06, Z - 0.06, c); P(head, 0.34, 0.3, 0.1, 0, -0.34, Z - 0.1, dk);
        P(head, 0.16, 0.2, 0.08, 0, -0.55, Z - 0.12, c);
      }
    }
  }

  function mark(rig, look) {
    const item = DS.Look.itemOf('mark', look.mark);
    if (!item || item.id === 'none') return;
    const head = rig.head;
    const Z = R * 0.92 + 0.02;
    const skin = rig.skin;
    if (item.id === 'freckles') {
      [[-0.26, 0.3], [-0.2, 0.26], [-0.3, 0.24], [0.26, 0.3], [0.2, 0.26], [0.3, 0.24]].forEach(function (q) { P(head, 0.03, 0.03, 0.02, q[0], q[1], Z + 0.03, shade(skin, 0.7)); });
    } else if (item.id === 'scar') {
      const s = P(head, 0.03, 0.26, 0.02, 0.17, R * 1.02, Z + 0.03, 0xb85a5a); s.rotation.z = 0.5;
    } else {
      const c = hexInt(item.pal[0]);
      const o = item.glow ? { emissive: c, emissiveI: 0.9 } : undefined;
      if (item.id === 'warpaint') {
        [-1, 1].forEach(function (s) { P(head, 0.18, 0.04, 0.02, 0.27 * s, 0.31, Z + 0.03, c); P(head, 0.18, 0.04, 0.02, 0.27 * s, 0.23, Z + 0.03, c); });
      } else if (item.id === 'tattoo') {
        P(head, 0.03, 0.2, 0.02, -0.34, 0.4, Z, c); P(head, 0.12, 0.03, 0.02, -0.3, 0.5, Z, c); P(head, 0.03, 0.1, 0.02, -0.25, 0.44, Z, c);
      } else {
        const d = P(head, 0.1, 0.1, 0.02, 0, 0.66, Z + 0.03, c, o); d.rotation.z = Math.PI / 4;
        P(head, 0.03, 0.03, 0.03, 0, 0.66, Z + 0.05, 0xffffff, o);
      }
    }
  }

  // --- putting it together ------------------------------------------------------------------------------

  const ORDER = ['hat', 'top', 'pants', 'boots', 'gloves', 'cape', 'extra'];

  /* Wearables register themselves here (look3d-wear.js), one builder per family
     per slot. A slot with no builder for a family draws nothing rather than fail. */
  const WEAR = {};
  function wear(slot, family, fn) { (WEAR[slot] = WEAR[slot] || {})[family] = fn; }

  // --- fewer draw calls ------------------------------------------------------------------

  /* A dressed hero is sixty to a hundred and thirty boxes, and every one is a draw call in the
     colour pass and again in the shadow pass. Everything on a bone that does not move by itself is
     baked into ONE vertex-coloured mesh per kind of surface (plain, glowing, see-through): the
     bone still carries it, so the pose code and the weapon grip are none the wiser. What does move
     by itself (a cape, a tail, a flame) stays its own object, and a moving group is baked inside
     itself. Skipped where THREE has no matrices (the headless tests build the unmerged model). */
  const bucketMats = {};
  function bucketMaterial(src) {
    const em = src.emissive ? src.emissive.getHex() : 0;
    const ei = em ? src.emissiveIntensity : 0;
    const op = src.transparent ? src.opacity : 1;
    const key = em + '|' + ei + '|' + op;
    let m = bucketMats[key];
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
      m.shadowSide = THREE.BackSide;                       // the same shadow rule as every voxel material
      if (em) { m.emissive = new THREE.Color(em); m.emissiveIntensity = ei; }
      if (op < 1) { m.transparent = true; m.opacity = op; }
      bucketMats[key] = m;
    }
    return { key: key, material: m };
  }

  function bake(owner, owners, animated) {
    const parts = [];
    (function walk(node, m) {
      node.children.slice().forEach(function (child) {
        if (owners.has(child) || animated.has(child)) return;
        if (!child.visible) { node.remove(child); child.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); return; }
        child.updateMatrix();
        const cm = new THREE.Matrix4().multiplyMatrices(m, child.matrix);
        if (child.isMesh) parts.push({ mesh: child, m: cm }); else walk(child, cm);
      });
    })(owner, new THREE.Matrix4());
    if (!parts.length) return;

    const buckets = {};
    parts.forEach(function (p) {
      const src = p.mesh.material;
      const b = bucketMaterial(src);
      const bk = buckets[b.key] || (buckets[b.key] = { material: b.material, pos: [], nor: [], col: [], idx: [], colors: {} });
      const geo = p.mesh.geometry.clone();
      geo.applyMatrix4(p.m);
      const pa = geo.attributes.position.array, na = geo.attributes.normal.array, base = bk.pos.length / 3;
      for (let i = 0; i < pa.length; i++) { bk.pos.push(pa[i]); bk.nor.push(na[i]); }
      for (let i = 0; i < pa.length / 3; i++) bk.col.push(src.color.r, src.color.g, src.color.b);
      const ia = geo.index.array;
      for (let i = 0; i < ia.length; i++) bk.idx.push(ia[i] + base);
      bk.colors[src.color.getHex()] = 1;
      geo.dispose();
      p.mesh.parent.remove(p.mesh);
      p.mesh.geometry.dispose();
    });
    Object.keys(buckets).forEach(function (k) {
      const bk = buckets[k];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bk.col, 3));
      g.setIndex(bk.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, bk.material);
      mesh.userData.chunkColors = Object.keys(bk.colors).map(Number);   // what the death shatter tints its chunks with
      owner.add(mesh);
    });
  }

  function mergeStatic(rig) {
    if (typeof THREE.BufferGeometry !== 'function' || typeof THREE.Matrix4 !== 'function' || typeof THREE.Float32BufferAttribute !== 'function') return;
    const animated = new Set(rig.motion.map(function (m) { return m.node; }));
    const owners = new Set([rig.torso, rig.head, rig.armL, rig.armR, rig.legL, rig.legR]);
    rig.motion.forEach(function (m) { if (!m.node.isMesh) owners.add(m.node); });
    owners.forEach(function (o) { bake(o, owners, animated); });
  }

  function build(look, opts) {
    look = look || DS.Look.look;
    const rig = skeleton(look);
    rig.look = look;
    face(rig, look);
    hair(rig, look);
    facial(rig, look);
    mark(rig, look);
    ORDER.forEach(function (slot) {
      const item = DS.Look.itemOf(slot, look[slot]);
      const fn = item && WEAR[slot] && WEAR[slot][item.family || item.id];
      if (fn) fn(rig, item, palOf(item, look, slot), look);
    });
    rig.animate = animate;
    if (!opts || opts.merge !== false) mergeStatic(rig);
    return rig;
  }

  /* What the model depends on, as a string: the renderer rebuilds when it changes.
     The weapon skin is not part of it: it lives on the weapon, not the body. */
  function keyOf(look) {
    const o = {};
    Object.keys(look || {}).sort().forEach(function (k) { if (k !== 'weapon') o[k] = look[k]; });
    return JSON.stringify(o);
  }

  /* keyOf(DS.Look.look), remembered until the profile changes: the renderer, the HUD and
     the bag ask every frame, and a string built from two dozen fields is not free. */
  let memoRev = -1, memoKey = '';
  function keyOfCurrent() {
    const r = DS.Look.rev;
    if (r !== memoRev) { memoRev = r; memoKey = keyOf(DS.Look.look); }
    return memoKey;
  }

  /* How far above a bare head the tallest thing on it reaches, in model units (ten world
     pixels each): the name over his head rides above a wizard's hat instead of through it. */
  const HAT_ROOM = { wizard: 0.78, halo: 0.55, crown: 0.28, ironhelm: 0.2, straw: 0.1, laurel: 0.04, cap: 0.08 };
  const HAIR_ROOM = { afro: 0.58, mohawk: 0.42, flame: 0.5, bun: 0.32, topknot: 0.32, curly: 0.26, crownbraids: 0.1, undercut: 0.1 };
  const COVERS = ['cap', 'hood', 'leathercap', 'straw', 'ironhelm', 'wizard'];
  function headroom(look) {
    look = look || DS.Look.look;
    const hat = DS.Look.itemOf('hat', look.hat);
    const family = hat ? (hat.family || hat.id) : '';
    let room = HAT_ROOM[family] || 0;
    if (hat && hat.horns) room = Math.max(room, 0.42);
    if (COVERS.indexOf(family) < 0) room = Math.max(room, HAIR_ROOM[look.hair] || 0);
    return room + ((STATURE[look.height] || 1) - 1) * 1.66;
  }

  // --- weapon skins ---------------------------------------------------------------------------------------

  /* The skin a weapon type wears, or null for plain steel (which keeps the colour
     of its rarity, as it always did). */
  function weaponSkin(type, look) {
    look = look || DS.Look.look;
    const id = look && look.weapon && look.weapon[type];
    const it = id && DS.Look.itemOf('weapon', id);
    if (!it || !it.pal) return null;
    return { id: it.id, css: it.pal.metal, metal: hexInt(it.pal.metal), dark: hexInt(it.pal.dark), trim: hexInt(it.pal.trim),
             glow: hexInt(it.pal.glow), lit: !!it.glow };
  }

  const WEAPON_SWAP = { gold: 0xf2c14e, goldDark: 0xb8860b, metalDark: 0x5c6474 };

  /* buildWeapon() paints the blade in the rarity colour it is given; a skin hands
     it the skin's metal instead, and this recolours the fittings and adds the
     glow that the better skins carry. */
  function dressWeapon(mesh, skin) {
    if (!skin) return mesh;
    mesh.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      const c = o.material.color;
      const hex = typeof c === 'number' ? c : (c && c.getHex ? c.getHex() : -1);
      if (hex === WEAPON_SWAP.gold) o.material = DS.Voxel.mat(skin.trim);
      else if (hex === WEAPON_SWAP.goldDark || hex === WEAPON_SWAP.metalDark) o.material = DS.Voxel.mat(skin.dark);
      else if (hex === skin.metal && skin.lit) o.material = DS.Voxel.mat(skin.metal, { emissive: skin.glow, emissiveI: 0.4 });
    });
    return mesh;
  }

  /* Hold a weapon of `type` the way the world does, for a preview model that has
     no inventory behind it. */
  function holdWeapon(model, type, look) {
    if (!model || !model.armR || !DS.Voxel.buildWeapon) return null;
    const skin = weaponSkin(type, look);
    const mesh = dressWeapon(DS.Voxel.buildWeapon(type, skin ? skin.css : '#c9cfdf'), skin);
    mesh.position.y = -0.34;
    const release = type === 'bow' || type === 'staff';
    mesh.rotation.set(release ? 0.2 : 0.35, release ? 0 : -0.55, release ? 0 : -0.18);
    model.armR.add(mesh);
    return mesh;
  }

  DS.Look3D = {
    build: build, keyOf: keyOf, keyOfCurrent: keyOfCurrent, headroom: headroom, animate: animate, weaponSkin: weaponSkin, dressWeapon: dressWeapon, holdWeapon: holdWeapon,
    wear: wear, WEAR: WEAR,
    // The kit look3d-wear.js paints with.
    kit: { P: P, grp: grp, hexInt: hexInt, shade: shade, mix: mix, palOf: palOf, glowOf: glowOf, motion: motion, R: R, INK: INK, WHITE: WHITE }
  };
})(window.DS);
