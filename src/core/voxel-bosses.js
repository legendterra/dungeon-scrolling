/* Voxel models of the bosses of the gods (entities/bosses3.js): the Minotaur,
   Medusa, Talos, Hades and Zeus. The rules of voxel.js and the bestiary files
   before this one: boxes only, origin at the feet, the front of the creature is
   +z, named parts for the pose code, and `animate(model, e, time, ctx)` for what
   the shared pose does not know. A boss has no wind/strike machine; what it is
   doing is `e.state` (the move's name) and `e.stateTimer` (frames left in it), so
   that is what the animations read. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const V = DS.Voxel;
  if (!V || !V.register || !V.kit) return;
  const part = V.part;
  const C = V.COLORS;
  const BLACK = V.kit.BLACK;
  const lit = function (c, i) { return { emissive: c, emissiveI: i == null ? 1 : i }; };

  /* Put a boss's torso and head back to rest before an animation bends them. */
  function rest(p) {
    p.torso.rotation.set(0, 0, 0);
    p.head.rotation.x = 0;
  }

  // --- the Minotaur ---------------------------------------------------------------

  function buildMinotaur() {
    const u = 1.9;
    const s = V.chibi({
      unit: u, skin: 0x6a4028, body: 0x5a3a24, belt: 0x2a1a10, arms: 0x6a4028, legs: 0x3a2618,
      hair: null, eyes: false
    });
    const hr = 0.42 * u;
    part(s.head, 0.56 * u, 0.34 * u, 0.36 * u, 0, hr * 0.5, hr * 1.18, 0x86523a);            // the muzzle
    part(s.head, 0.14 * u, 0.1 * u, 0.06, -0.14 * u, hr * 0.5, hr * 1.5, BLACK);             // nostrils
    part(s.head, 0.14 * u, 0.1 * u, 0.06, 0.14 * u, hr * 0.5, hr * 1.5, BLACK);
    part(s.head, 0.32 * u, 0.06 * u, 0.06, 0, hr * 0.18, hr * 1.5, C.gold);                  // the ring through it
    part(s.head, 0.06 * u, 0.2 * u, 0.06, 0, hr * 0.08, hr * 1.5, C.gold);
    for (let k = -1; k <= 1; k += 2) {
      part(s.head, 0.13 * u, 0.1 * u, 0.06, k * 0.2 * u, hr * 1.15, hr * 0.98, 0xff4a2a, lit(0xff4a2a, 1.3));
      part(s.head, 0.3 * u, 0.13 * u, 0.13 * u, k * (hr + 0.12 * u), hr * 1.5, 0, 0xe8e0c8);   // horn, out
      part(s.head, 0.13 * u, 0.4 * u, 0.13 * u, k * (hr + 0.28 * u), hr * 1.78, 0, 0xf4f0d8);  // and up
      part(s.head, 0.18 * u, 0.1 * u, 0.1 * u, k * (hr + 0.06 * u), hr * 1.0, -0.06 * u, 0x6a4028);   // an ear
    }
    part(s.torso, 0.4 * u, 0.36 * u, 0.06, 0, 0.32 * u, 0.22 * u, 0x3a2618);                 // a leather harness
    part(s.torso, 0.6 * u, 0.06 * u, 0.44 * u, 0, 0.5 * u, 0, C.goldDark);
    const axe = new THREE.Group();
    axe.position.set(0, -0.42 * u, 0.12 * u);
    part(axe, 0.09 * u, 1.5 * u, 0.09 * u, 0, 0.45 * u, 0, C.woodDark);
    for (let k = -1; k <= 1; k += 2) {
      part(axe, 0.5 * u, 0.5 * u, 0.06 * u, 0, 1.0 * u, k * 0.12 * u, 0xa8b0c0);              // two blades, a labrys
      part(axe, 0.52 * u, 0.06 * u, 0.08 * u, 0, 1.24 * u, k * 0.12 * u, C.gold);
    }
    s.armR.add(axe);
    s.axe = axe;
    s.animate = minotaurAnim;
    return s;
  }

  function minotaurAnim(p, e, t) {
    rest(p);
    const st = e.state, tt = e.stateTimer || 0;
    if (st === 'RUSH') {
      const winding = tt > 136;
      p.torso.rotation.x = winding ? 0.15 : 0.5;
      p.head.rotation.x = winding ? 0.4 + Math.sin(t * 18) * 0.18 : 0.55;
      p.armL.rotation.x = -0.7;
      p.armR.rotation.x = 0.5;
    } else if (st === 'AXESPIN') {
      const spinning = tt < 70 && tt > 12;
      p.armR.rotation.x = -2.8;
      p.armL.rotation.x = -2.2;
      p.torso.rotation.y = spinning ? t * 14 : 0;
      p.torso.rotation.x = spinning ? 0.15 : -0.15;
    } else if (st === 'STUN') {
      p.torso.rotation.x = 0.22;
      p.head.rotation.x = 0.45;
      p.head.rotation.z = Math.sin(t * 22) * 0.16;
      p.armL.rotation.x = 0.5;
      p.armR.rotation.x = 0.5;
    } else if (st === 'SLAM' || st === 'QUAKE') {
      const up = !e.onGround || tt > 40;
      p.armL.rotation.x = up ? -2.6 : 0.9;
      p.armR.rotation.x = up ? -2.6 : 0.9;
    }
  }

  // --- Medusa ---------------------------------------------------------------------

  function buildMedusa() {
    const u = 1.7;
    const s = V.chibi({
      unit: u, skin: 0x9ac88a, body: 0x2f7d4f, belt: C.gold, arms: 0x9ac88a, legs: 0x2f7d4f,
      hair: null, eyeColor: 0xf4f0d8
    });
    const hr = 0.42 * u;
    part(s.torso, 0.76 * u, 0.5 * u, 0.52 * u, 0, -0.1 * u, 0, 0x2f7d4f);                    // a gown to the floor
    part(s.torso, 0.8 * u, 0.06 * u, 0.56 * u, 0, -0.34 * u, 0, C.goldDark);
    for (let k = -1; k <= 1; k += 2) {
      part(s.head, 0.1 * u, 0.1 * u, 0.06, k * 0.16 * u, hr * 1.02, hr * 1.04, 0xf4f0d8, lit(0xf4f0d8, 1.2));
    }
    s.snakes = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const a = (i / 7) * Math.PI * 2;
      g.position.set(Math.cos(a) * hr * 0.9, hr * 1.85, Math.sin(a) * hr * 0.8 - 0.05 * u);
      const col = i % 2 ? 0x2f7d4f : 0x5cbf62;
      part(g, 0.1 * u, 0.36 * u, 0.1 * u, 0, 0.18 * u, 0, col);
      part(g, 0.1 * u, 0.22 * u, 0.1 * u, 0.05 * u, 0.42 * u, 0, col);
      part(g, 0.12 * u, 0.1 * u, 0.14 * u, 0.09 * u, 0.56 * u, 0.02 * u, 0x2f7d4f);
      part(g, 0.03 * u, 0.03 * u, 0.03 * u, 0.09 * u, 0.56 * u, 0.1 * u, 0xc0303c);
      s.head.add(g);
      s.snakes.push(g);
    }
    s.tail = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, 0.16 * u + i * 0.05 * u, -0.5 * u - i * 0.2 * u);
      part(seg, (0.44 - i * 0.06) * u, (0.3 - i * 0.03) * u, 0.3 * u, 0, 0, 0, i % 2 ? 0x2f7d4f : 0x5cbf62);
      s.tail.add(seg);
    }
    s.root.add(s.tail);
    const bow = new THREE.Group();
    bow.position.set(0, -0.32 * u, 0.2 * u);
    part(bow, 0.06 * u, 0.9 * u, 0.06 * u, 0, 0.1 * u, 0, C.woodDark);
    part(bow, 0.02 * u, 0.9 * u, 0.02 * u, 0.06 * u, 0.1 * u, 0, C.bone);
    s.armL.add(bow);
    s.bow = bow;
    s.animate = medusaAnim;
    return s;
  }

  function medusaAnim(p, e, t) {
    rest(p);
    const st = e.state, tt = e.stateTimer || 0;
    const gazing = st === 'GAZE' && tt < 100;
    for (let i = 0; i < p.snakes.length; i++) {
      p.snakes[i].rotation.z = Math.sin(t * 3 + i * 1.2) * (gazing ? 0.55 : 0.3);
      p.snakes[i].rotation.x = Math.sin(t * 2.3 + i) * 0.2;
    }
    for (let i = 0; i < p.tail.children.length; i++) p.tail.children[i].position.x = Math.sin(t * 2.2 - i * 0.9) * 0.12;
    if (gazing) {
      p.head.rotation.x = -0.15;
      p.armL.rotation.x = -1.3;
    } else if (st === 'SNAKES') {
      p.armL.rotation.x = -1.5;
      p.armR.rotation.x = -1.0;
    } else if (st === 'PIT') {
      p.armL.rotation.x = -2.2;
      p.armR.rotation.x = -2.2;
    } else if (st === 'LEAP') {
      p.torso.rotation.x = e.onGround ? 0.35 : -0.3;
      p.armL.rotation.x = -2.4;
      p.armR.rotation.x = -2.4;
    }
  }

  // --- Talos ----------------------------------------------------------------------

  function buildTalos() {
    const u = 2.2;
    const bronze = 0xc98a3a, dark = 0x8a5a1e, ichor = 0xffb060;
    const s = V.chibi({
      unit: u, skin: bronze, body: bronze, belt: dark, arms: bronze, legs: dark,
      hair: null, eyes: false
    });
    const hr = 0.42 * u;
    for (let k = -1; k <= 1; k += 2) {
      part(s.head, 0.12 * u, 0.06 * u, 0.04, k * 0.17 * u, hr * 1.0, hr * 1.04, 0xffe066, lit(0xffe066, 1.5));
      part(s.torso, 0.3 * u, 0.24 * u, 0.36 * u, k * 0.42 * u, 0.5 * u, 0, bronze);          // shoulder plates
      part(s.torso, 0.08 * u, 0.06 * u, 0.08 * u, k * 0.42 * u, 0.64 * u, 0.1 * u, dark);     // and rivets
      part(s.armL, 0.3 * u, 0.3 * u, 0.3 * u, 0, -0.44 * u, 0, dark);                        // fists like anvils
    }
    part(s.head, 0.26 * u, 0.1 * u, 0.7 * u, 0, hr * 2.05, 0, dark);                          // a crest, front to back
    part(s.head, 0.5 * u, 0.06 * u, 0.5 * u, 0, hr * 1.9, 0, bronze);
    // The single vein of ichor, chest to ankle, stopped with a plug: the whole of him.
    s.vein = part(s.torso, 0.07 * u, 0.5 * u, 0.03, 0, 0.26 * u, 0.22 * u, ichor, lit(ichor, 1.3));
    part(s.torso, 0.24 * u, 0.06 * u, 0.03, 0, 0.5 * u, 0.22 * u, ichor, lit(ichor, 1.3));
    part(s.legR, 0.09 * u, 0.09 * u, 0.06, 0, -0.3 * u, 0.12 * u, 0xffe066, lit(0xffe066, 1.6));
    s.pulse = part(s.torso, 0.16 * u, 0.16 * u, 0.04, 0, 0.34 * u, 0.24 * u, 0xffe066, lit(0xffb060, 1.6));
    s.animate = talosAnim;
    return s;
  }

  function talosAnim(p, e, t) {
    rest(p);
    const st = e.state, tt = e.stateTimer || 0;
    p.vein.scale.y = 1 + Math.sin(t * 5) * 0.06 + (st && st !== 'IDLE' ? 0.12 : 0);
    if (st === 'ANVIL' || st === 'ERUPT') {
      const raised = tt > 30 || !e.onGround;
      p.armL.rotation.x = raised ? -2.7 : 0.9;
      p.armR.rotation.x = raised ? -2.7 : 0.9;
      p.torso.rotation.x = raised ? -0.15 : 0.3;
    } else if (st === 'METEOR') {
      p.armR.rotation.x = -2.4 + Math.sin(t * 6) * 0.3;
      p.armL.rotation.x = -0.6;
    } else if (st === 'LAVAWAVE' || st === 'QUAKE') {
      p.armL.rotation.x = 0.8;
      p.armR.rotation.x = 0.8;
      p.torso.rotation.x = 0.2;
    }
  }

  // --- Hades ----------------------------------------------------------------------

  function buildHades() {
    const u = 1.8;
    const s = V.chibi({
      unit: u, skin: 0xb8b0d0, body: 0x1c1826, belt: 0x5a4a88, arms: 0x1c1826, legs: 0x14101e,
      hair: 0x0e0c16, eyes: false
    });
    const hr = 0.42 * u;
    const soul = 0x7ff0ff;
    for (let k = -1; k <= 1; k += 2) part(s.head, 0.1 * u, 0.08 * u, 0.05, k * 0.16 * u, hr * 1.0, hr * 1.04, soul, lit(soul, 1.6));
    part(s.torso, 0.7 * u, 0.9 * u, 0.06 * u, 0, 0.1 * u, -0.28 * u, 0x110e1a);              // the cloak
    part(s.torso, 0.76 * u, 0.44 * u, 0.5 * u, 0, -0.08 * u, 0, 0x1c1826);                   // robe hem
    part(s.torso, 0.5 * u, 0.06 * u, 0.06, 0, 0.44 * u, 0.22 * u, 0x5a4a88);
    s.flames = [];
    for (let i = 0; i < 5; i++) {
      const f = part(s.head, 0.1 * u, (0.2 + (i % 2) * 0.12) * u, 0.1 * u, (i - 2) * 0.16 * u, hr * 2.15 + (i % 2) * 0.05 * u, 0, soul, lit(soul, 1.1));
      s.flames.push(f);
    }
    const bident = new THREE.Group();
    bident.position.set(0, -0.36 * u, 0.1 * u);
    part(bident, 0.07 * u, 1.9 * u, 0.07 * u, 0, 0.55 * u, 0, 0x3a3648);
    part(bident, 0.5 * u, 0.07 * u, 0.07 * u, 0, 1.45 * u, 0, 0x5a6078);
    for (let k = -1; k <= 1; k += 2) {
      part(bident, 0.07 * u, 0.4 * u, 0.07 * u, k * 0.22 * u, 1.68 * u, 0, 0x5a6078);
      part(bident, 0.09 * u, 0.12 * u, 0.09 * u, k * 0.22 * u, 1.92 * u, 0, soul, lit(soul, 1.5));
    }
    s.armR.add(bident);
    s.bident = bident;
    s.wisps = [];
    for (let i = 0; i < 4; i++) s.wisps.push(part(s.root, 0.12 * u, 0.16 * u, 0.12 * u, 0, 1.2 * u, 0, soul, lit(soul, 1.4)));
    s.ritualRing = V.runeRing(soul, 1.5);
    s.root.add(s.ritualRing);
    s.animate = hadesAnim;
    return s;
  }

  function hadesAnim(p, e, t) {
    rest(p);
    const st = e.state, tt = e.stateTimer || 0;
    for (let i = 0; i < p.wisps.length; i++) {
      const a = t * 1.6 + i * Math.PI / 2;
      p.wisps[i].position.set(Math.cos(a) * 1.5, 1.6 + Math.sin(t * 2 + i) * 0.18, Math.sin(a) * 0.6);
    }
    for (let i = 0; i < p.flames.length; i++) p.flames[i].scale.y = 1 + Math.sin(t * 9 + i * 1.7) * 0.22;
    if (st === 'SOULFIRE') {
      p.armL.rotation.x = -2.6;
      p.armR.rotation.x = -2.6;
    } else if (st === 'BIDENT') {
      const wind = tt > 46;
      p.armR.rotation.x = wind ? -2.7 : 0.2;
      p.armL.rotation.x = wind ? -0.6 : 0.6;
      p.torso.rotation.y = wind ? 0.7 : -0.8 + Math.max(0, 46 - tt) * 0.09;
    } else if (st === 'SHADES') {
      p.armL.rotation.z = -1.2;
      p.armR.rotation.z = 1.2;
      p.armL.rotation.x = -0.5;
    } else {
      p.armL.rotation.z = 0;
      p.armR.rotation.z = 0;
    }
  }

  // --- Zeus -----------------------------------------------------------------------

  function buildZeus() {
    const u = 1.9;
    const s = V.chibi({
      unit: u, skin: 0xe0b48c, body: 0xf4efe0, belt: C.gold, arms: 0xe0b48c, legs: 0xe8e0c8,
      hair: 0xf4f2f8, eyes: false
    });
    const hr = 0.42 * u;
    const arc = 0xb8e8ff;
    for (let k = -1; k <= 1; k += 2) {
      part(s.head, 0.11 * u, 0.08 * u, 0.05, k * 0.16 * u, hr * 1.0, hr * 1.04, arc, lit(arc, 1.6));
      part(s.head, 0.16 * u, 0.06 * u, 0.06, k * 0.16 * u, hr * 1.16, hr * 1.06, 0xf4f2f8);   // brows
    }
    part(s.head, 0.66 * u, 0.44 * u, 0.3 * u, 0, hr * 0.22, hr * 0.98, 0xf4f2f8);            // the beard
    part(s.head, 0.4 * u, 0.3 * u, 0.2 * u, 0, -0.08 * u, hr * 1.0, 0xf4f2f8);
    part(s.head, 0.96 * u, 0.1 * u, 0.9 * u, 0, hr * 2.02, 0, C.gold);                       // the wreath
    part(s.torso, 0.7 * u, 0.5 * u, 0.5 * u, 0, -0.08 * u, 0, 0xf4efe0);                     // a chiton to the knee
    part(s.torso, 0.7 * u, 0.6 * u, 0.08 * u, 0, 0.2 * u, -0.26 * u, 0xb8c4f0);              // the storm-coloured mantle
    part(s.torso, 0.14 * u, 0.62 * u, 0.06, -0.2 * u, 0.26 * u, 0.22 * u, C.gold);
    const bolt = new THREE.Group();
    bolt.position.set(0, -0.36 * u, 0.1 * u);
    const zig = [[0.1, 1.6], [-0.08, 1.35], [0.12, 1.1], [-0.06, 0.85], [0.08, 0.6]];
    zig.forEach(function (z, i) {
      part(bolt, 0.16 * u, 0.3 * u, 0.1 * u, z[0] * u, z[1] * u, 0, 0xfff0a8, lit(0xffe45c, 1.7));
    });
    part(bolt, 0.08 * u, 0.4 * u, 0.08 * u, 0, 0.3 * u, 0, C.goldDark);
    s.armR.add(bolt);
    s.bolt = bolt;
    s.pulse = part(s.torso, 0.14 * u, 0.14 * u, 0.04, 0.02 * u, 0.36 * u, 0.24 * u, 0xfff0a8, lit(0xffe45c, 1.6));
    s.sparks = [];
    for (let i = 0; i < 6; i++) s.sparks.push(part(s.root, 0.08 * u, 0.08 * u, 0.08 * u, 0, 1, 0, 0xfff0a8, lit(0xffe45c, 1.8)));
    s.animate = zeusAnim;
    return s;
  }

  function zeusAnim(p, e, t) {
    rest(p);
    const st = e.state, tt = e.stateTimer || 0;
    const busy = st && st !== 'IDLE' && st !== 'INTRO';
    for (let i = 0; i < p.sparks.length; i++) {
      const a = t * (busy ? 3.4 : 1.8) + i * 1.05;
      p.sparks[i].position.set(Math.cos(a) * 1.1, 1.5 + Math.sin(a * 1.7) * 0.9, Math.sin(a) * 0.5);
      p.sparks[i].visible = (Math.floor(t * 18) + i) % 3 !== 0;
    }
    if (st === 'BOLTS') {
      p.armR.rotation.x = -2.9;
      p.armL.rotation.x = -0.5;
    } else if (st === 'STORM') {
      p.armL.rotation.x = -2.7;
      p.armR.rotation.x = -2.7;
    } else if (st === 'THUNDERCLAP') {
      const air = !e.onGround;
      p.torso.rotation.x = air ? -0.25 : 0.35;
      p.armL.rotation.x = air ? -2.8 : 0.9;
      p.armR.rotation.x = air ? -2.8 : 0.9;
    } else if (st === 'THUNDERBALLS') {
      p.armR.rotation.x = -1.6 + Math.sin(tt * 0.6) * 0.1;
      p.armL.rotation.x = -0.4;
    } else if (st === 'ENRAGE') {
      p.armL.rotation.x = -2.9;
      p.armR.rotation.x = -2.9;
      p.torso.rotation.x = -0.2;
    }
  }

  V.register('minotaur', buildMinotaur, 3.5, 'minotaur');
  V.register('medusa', buildMedusa, 3.2, 'medusa');
  V.register('talos', buildTalos, 3.75, 'talos');
  V.register('hades', buildHades, 3.4, 'hades');
  V.register('zeus', buildZeus, 3.5, 'zeus');
})(window.DS);
