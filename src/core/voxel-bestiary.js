/* Voxel models of the act I bestiary (enemies4.js), and the helpers the act II
   and III model files build on.

   The same rules as voxel.js: boxes only, origin at the feet, the front of the
   creature is +z (the camera's side; it turns side-on when it walks), named
   parts for the pose code, and `animate(model, e, time, ctx)` for anything the
   shared pose does not know about. ctx = { walk, swing, wind, strike, bob, cyc }:
   wind runs 0..1 through the wind-up, strike is true while the blow is out. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const V = DS.Voxel;
  if (!V || !V.register) return;
  const part = V.part;
  const C = V.COLORS;
  const BLACK = 0x1a1626;

  // --- helpers shared with the act II and III files ----------------------------

  /* A four-legged body, long along z. Returns the pieces a builder hangs a head
     and a tail on: `front`/`back` are the z of the two ends, `top` the y of the
     spine. The legs pivot at the hip; gait() swings them fore and aft. */
  function quad(root, o) {
    const L = o.len, W = o.w, H = o.h, lh = o.legH, lw = o.legW || 0.14;
    const y = lh + H / 2 - 0.02;
    const body = part(root, W, H, L, 0, y, 0, o.col);
    if (o.belly) part(root, W * 0.86, H * 0.3, L * 0.84, 0, y - H * 0.34, 0, o.belly);
    const legCol = o.legCol || o.col, hoof = o.hoof || o.dark || legCol;
    const legs = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (s) {
      const leg = new THREE.Group();
      leg.position.set(s[0] * (W * 0.5 - lw * 0.6), lh, s[1] * (L * 0.5 - lw * 0.9));
      part(leg, lw, lh * 0.56, lw, 0, -lh * 0.28, 0, legCol);
      part(leg, lw * 0.82, lh * 0.5, lw * 0.82, 0, -lh * 0.7, 0.01, legCol);
      part(leg, lw * 1.05, lh * 0.16, lw * 1.2, 0, -lh * 0.93, 0.02, hoof);
      root.add(leg);
      legs.push(leg);
    });
    return { body: body, legs: legs, y: y, top: y + H / 2, front: L / 2, back: -L / 2 };
  }

  /* The four legs of a quadruped, in a walking (or galloping) rhythm. */
  function gait(legs, c, boost) {
    const a = Math.min(1, c.walk * 0.6 + (boost || 0)) * 0.7;
    for (let i = 0; i < legs.length; i++) {
      legs[i].rotation.x = Math.sin(c.cyc * 1.2 + (i === 1 || i === 2 ? Math.PI : 0)) * a;
    }
  }

  /* A pair of jointed wings (the bat's rig: pose flaps wingL/wingR and the
     outer pair follows). */
  function wings(root, y, span, col, tip, thick) {
    const out = [];
    for (let side = -1; side <= 1; side += 2) {
      const inner = new THREE.Group();
      inner.position.set(side * 0.16, y, 0);
      part(inner, span * 0.5, thick || 0.06, 0.3, side * span * 0.25, 0, 0, col);
      const outer = new THREE.Group();
      outer.position.set(side * span * 0.5, 0, 0);
      part(outer, span * 0.5, (thick || 0.06) * 0.85, 0.26, side * span * 0.25, -0.02, 0, tip || col);
      part(outer, span * 0.14, (thick || 0.06) * 0.9, 0.22, side * span * 0.52, -0.02, 0, BLACK);
      inner.add(outer);
      root.add(inner);
      out.push(inner, outer);
    }
    return { wingL: out[0], wingL2: out[1], wingR: out[2], wingR2: out[3] };
  }

  /* A model with none of the chibi's limbs: the shape pose() expects. */
  function bare(root, extra) {
    return Object.assign({ root: root, torso: root, head: root, armL: null, armR: null,
                           legL: null, legR: null }, extra || {});
  }

  V.kit = { quad: quad, gait: gait, wings: wings, bare: bare, BLACK: BLACK };

  // --- crab -------------------------------------------------------------------

  function buildCrab() {
    const root = new THREE.Group();
    const shell = 0xc8552a, dark = 0x8a3a1c, pale = 0xf0c890;
    part(root, 0.94, 0.3, 0.68, 0, 0.3, 0, shell);
    part(root, 0.78, 0.14, 0.56, 0, 0.5, -0.02, dark);
    part(root, 0.46, 0.05, 0.3, 0, 0.59, 0.02, pale);
    part(root, 0.7, 0.08, 0.5, 0, 0.14, 0, dark);
    for (let s = -1; s <= 1; s += 2) {
      part(root, 0.05, 0.2, 0.05, s * 0.15, 0.68, 0.26, dark);
      part(root, 0.1, 0.1, 0.1, s * 0.15, 0.82, 0.26, 0xffffff);
      part(root, 0.05, 0.06, 0.04, s * 0.15, 0.83, 0.32, BLACK);
    }
    function claw(side) {
      const c = new THREE.Group();
      c.position.set(side * 0.5, 0.34, 0.26);
      part(c, 0.16, 0.14, 0.3, side * 0.05, 0, 0.12, shell);
      part(c, 0.3, 0.12, 0.3, side * 0.1, 0.09, 0.36, dark);
      part(c, 0.26, 0.1, 0.28, side * 0.08, -0.06, 0.34, shell);
      root.add(c);
      return c;
    }
    const armL = claw(-1), armR = claw(1);
    const legs = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.44, 0.24, 0.16 - i * 0.2);
        part(leg, 0.26, 0.06, 0.06, side * 0.13, 0.02, 0, dark);
        const lo = part(leg, 0.22, 0.05, 0.05, side * 0.27, -0.09, 0, shell);
        lo.rotation.z = side * 0.8;
        root.add(leg);
        legs.push(leg);
      }
    }
    return bare(root, { armL: armL, armR: armR, legs: legs, animate: crabAnim });
  }
  function crabAnim(p, e, t, c) {
    if (e.shieldUp) { p.armL.rotation.x = -0.9; p.armR.rotation.x = -0.9; }      // claws up: the guard
    else if (c.wind > 0) { p.armL.rotation.y = -0.5 * c.wind; p.armR.rotation.y = 0.5 * c.wind; }
    else { p.armL.rotation.y = 0; p.armR.rotation.y = 0; }
  }

  // --- spore shroom -----------------------------------------------------------

  function buildSporeshroom() {
    const root = new THREE.Group();
    part(root, 0.32, 0.5, 0.3, 0, 0.25, 0, 0xe8dcc0);
    part(root, 0.42, 0.06, 0.38, 0, 0.5, 0, 0xc8b898);
    for (let s = -1; s <= 1; s += 2) part(root, 0.07, 0.05, 0.03, s * 0.08, 0.36, 0.16, BLACK);
    const cap = new THREE.Group();
    cap.position.y = 0.6;
    part(cap, 1.0, 0.16, 0.9, 0, 0.04, 0, 0x6a8a3a);
    part(cap, 0.76, 0.14, 0.68, 0, 0.18, 0, 0x7ea044);
    part(cap, 0.44, 0.1, 0.4, 0, 0.29, 0, 0x94b850);
    part(cap, 0.86, 0.04, 0.76, 0, -0.05, 0, 0xa3e86b, { emissive: 0x5cbf62, emissiveI: 0.8 });
    [[-0.26, 0.2, 0.42], [0.22, 0.14, 0.44], [0, 0.3, 0.34], [0.34, 0.1, 0.2]].forEach(function (s) {
      part(cap, 0.14, 0.1, 0.05, s[0], s[1], s[2], 0xf0ffb0, { emissive: 0xa3e86b, emissiveI: 0.6 });
    });
    root.add(cap);
    // The cloud is a cluster of soft puffs, each turning on its own, inside a unit sphere.
    const cloud = new THREE.Group();
    const puffs = [];
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4, r = 0.12 + ((i * 37) % 10) / 10 * 0.34, sz = 0.4 + ((i * 53) % 10) / 10 * 0.26;
      puffs.push(part(cloud, sz, sz * 0.8, sz, Math.cos(a) * r, ((i % 3) - 1) * 0.2, Math.sin(a) * r * 0.8,
                      i % 2 ? 0xa3e86b : 0xd8f090, { opacity: 0.28, emissive: 0x5cbf62, emissiveI: 0.5 }));
    }
    cloud.visible = false;
    root.add(cloud);
    return bare(root, { cap: cap, cloud: cloud, puffs: puffs, animate: sporeAnim });
  }
  function sporeAnim(p, e, t, c) {
    const swell = c.wind * 0.3 - (c.strike ? 0.18 : 0);
    p.cap.scale.set(1 + swell, 1 - swell * 0.6, 1 + swell);
    p.cap.rotation.z = Math.sin(t * 1.5) * 0.03;
    const cl = e.cloud;
    p.cloud.visible = !!cl;
    if (cl) {
      const k = cl.r * 0.1 / 0.85 / ((e.sizeScale || 1) * 0.95);     // radius in units, over the cluster's reach
      p.cloud.scale.set(k, k * 0.75, k);
      p.cloud.position.y = 0.45 + k * 0.4 + Math.sin(t * 2) * 0.04;
      for (let i = 0; i < p.puffs.length; i++) p.puffs[i].rotation.y = t * 0.5 + i;
    }
  }

  // --- crystal beetle ---------------------------------------------------------

  function buildBeetle() {
    const root = new THREE.Group();
    const ball = new THREE.Group();
    ball.position.y = 0.36;
    root.add(ball);
    part(ball, 0.74, 0.34, 0.9, 0, 0, 0, 0x4a3f7a);
    part(ball, 0.56, 0.2, 0.7, 0, 0.22, -0.02, 0x6a5cae);
    [[-0.2, -0.2], [0.18, -0.05], [-0.05, 0.2], [0.22, 0.22], [-0.24, 0.1]].forEach(function (s) {
      const k = part(ball, 0.12, 0.3, 0.12, s[0], 0.4, s[1], 0x7fe8ff, { emissive: 0x4fb3e0, emissiveI: 0.7 });
      k.rotation.z = s[0] * 0.8;
      k.rotation.x = s[1] * 0.6;
    });
    const roll = new THREE.Group();
    roll.position.y = 0.36;
    part(roll, 0.74, 0.62, 0.62, 0, 0, 0, 0x4a3f7a);
    part(roll, 0.74, 0.62, 0.62, 0, 0, 0, 0x5a4c92).rotation.x = Math.PI / 4;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const k = part(roll, 0.12, 0.24, 0.12, (i % 2 ? 0.22 : -0.22), Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0x7fe8ff,
                     { emissive: 0x4fb3e0, emissiveI: 0.7 });
      k.rotation.x = -a;
    }
    roll.visible = false;
    root.add(roll);
    const head = new THREE.Group();
    head.position.set(0, 0.3, 0.5);
    root.add(head);
    part(head, 0.38, 0.28, 0.32, 0, 0, 0, 0x2c2650);
    for (let s = -1; s <= 1; s += 2) {
      part(head, 0.07, 0.07, 0.04, s * 0.1, 0.06, 0.17, 0xff6a9a, { emissive: 0xff6a9a, emissiveI: 0.8 });
      part(head, 0.08, 0.08, 0.22, s * 0.13, -0.1, 0.2, 0xc8c0e0);
    }
    const legs = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.34, 0.26, 0.24 - i * 0.24);
        part(leg, 0.24, 0.06, 0.06, side * 0.12, 0.02, 0, 0x2c2650);
        const lo = part(leg, 0.2, 0.05, 0.05, side * 0.25, -0.08, 0, 0x4a3f7a);
        lo.rotation.z = side * 0.8;
        root.add(leg);
        legs.push(leg);
      }
    }
    return bare(root, { head: head, headY0: 0.3, ball: ball, roll: roll, legs: legs, animate: beetleAnim });
  }
  function beetleAnim(p, e, t, c) {
    const rolling = !!e.curled;
    const tuck = rolling || c.wind > 0.6;
    p.roll.visible = rolling;
    p.roll.rotation.x = t * 14;
    p.ball.visible = !rolling;
    p.ball.scale.set(1, 1 + c.wind * 0.3, 1 - c.wind * 0.12);
    p.head.visible = !tuck;
    for (let i = 0; i < p.legs.length; i++) p.legs[i].visible = !tuck;
  }

  // --- jailer -----------------------------------------------------------------

  function buildJailer() {
    const s = V.chibi({ unit: 1.04, skin: C.bone, body: 0x4a4038, belt: 0x6a5a48, arms: C.bone,
                        legs: C.boneDark, hair: null, helm: 0x5a5048, helmAccent: 0xb8860b,
                        eyeColor: 0xffb040 });
    part(s.torso, 0.4, 0.05, 0.05, 0, 0.3, 0.21, C.boneDark);
    part(s.torso, 0.4, 0.05, 0.05, 0, 0.2, 0.21, C.boneDark);
    part(s.torso, 0.12, 0.12, 0.04, 0.26, 0.1, 0.18, C.gold);          // the keyring
    part(s.torso, 0.05, 0.18, 0.04, 0.26, -0.02, 0.18, C.goldDark);
    const lantern = new THREE.Group();
    lantern.position.set(0, -0.42, 0.12);
    part(lantern, 0.03, 0.16, 0.03, 0, 0.12, 0, C.metalDark);
    part(lantern, 0.22, 0.28, 0.22, 0, -0.08, 0, C.metalDark);
    part(lantern, 0.15, 0.2, 0.15, 0, -0.08, 0, 0xffd070, { emissive: 0xffa030, emissiveI: 1.3 });
    s.armL.add(lantern);
    s.lantern = lantern;
    const chain = new THREE.Group();
    chain.position.set(0.02, -0.4, 0.1);
    for (let i = 0; i < 5; i++) part(chain, i % 2 ? 0.05 : 0.09, 0.1, i % 2 ? 0.09 : 0.05, 0, -0.06 - i * 0.1, 0, C.metal);
    part(chain, 0.12, 0.16, 0.12, 0, -0.62, 0, 0xb8b0a0);
    s.armR.add(chain);
    s.chain = chain;
    s.headY0 = s.head.position.y;
    s.animate = jailerAnim;
    return s;
  }
  function jailerAnim(p, e, t, c) {
    p.chain.rotation.z = Math.sin(t * 4 + e.x * 0.1) * 0.15 * (0.3 + c.wind);
    p.lantern.rotation.z = Math.sin(t * 3 + e.x * 0.1) * 0.12 + c.swing * 0.2;
    if (e.mode === 'chain' && (c.wind > 0 || c.strike)) p.armR.rotation.x = c.strike ? -1.5 : -0.6 * c.wind;
  }

  // --- chained prisoner -------------------------------------------------------

  function buildPrisoner() {
    const s = V.chibi({ unit: 1.0, skin: 0xb0a090, body: 0x8a7a68, belt: 0x3a3028, arms: 0xb0a090,
                        legs: 0x5a4a3a, hair: 0x2a2018, eyeColor: 0xff6a4a, mouthColor: 0x2c1f1a });
    for (let i = 0; i < 3; i++) part(s.torso, 0.64, 0.05, 0.42, 0, 0.14 + i * 0.14, 0, 0x2c2620);   // the stripes
    part(s.armL, 0.2, 0.08, 0.22, 0, -0.32, 0, C.metalDark);
    part(s.armR, 0.2, 0.08, 0.22, 0, -0.32, 0, C.metalDark);
    part(s.legL, 0.24, 0.08, 0.26, 0, -0.28, 0, C.metalDark);
    part(s.legR, 0.24, 0.08, 0.26, 0, -0.28, 0, C.metalDark);
    part(s.torso, 0.5, 0.05, 0.05, 0, 0.1, 0.3, C.metalDark);
    s.torso.rotation.x = 0.18;
    s.armsForward = true;
    s.animate = function (p, e, t, c) {
      if (c.wind > 0) {
        p.armL.rotation.x = -1.4 + Math.sin(t * 38) * 0.4;
        p.armR.rotation.x = -1.4 - Math.sin(t * 38) * 0.4;
      }
    };
    return s;
  }

  // --- bogman -----------------------------------------------------------------

  function buildBogman() {
    const s = V.chibi({ unit: 1.0, skin: 0x6a7a44, body: 0x4a4a30, belt: 0x2c2c1c, arms: 0x6a7a44,
                        legs: 0x3a3a24, hair: 0x33401e, eyeColor: 0xffe066, mouthColor: 0x1c1a10 });
    part(s.torso, 0.2, 0.16, 0.1, -0.2, 0.3, 0.22, 0x3a2c1c);
    part(s.torso, 0.28, 0.12, 0.1, 0.1, 0.12, 0.22, 0x3a2c1c);
    part(s.head, 0.16, 0.12, 0.1, 0.16, 0.36, 0.4, 0x3a2c1c);
    [[-0.2, 0.9, 0.16], [0.04, 1.02, 0.0], [0.22, 0.86, -0.14]].forEach(function (r) {
      const reed = part(s.head, 0.05, 0.5, 0.05, r[0], r[1], r[2], 0x5a7a30);
      reed.rotation.z = -r[0] * 0.5;
    });
    s.armsForward = true;
    s.torso.rotation.x = 0.1;
    // Everything that shows goes into one group: under the mud, none of it does.
    const shown = new THREE.Group();
    s.root.children.slice().forEach(function (k) { shown.add(k); });
    s.root.add(shown);
    const ripple = new THREE.Group();
    part(ripple, 0.95, 0.05, 0.95, 0, 0.03, 0, 0x3a2c1c, { opacity: 0.9 });
    part(ripple, 0.5, 0.07, 0.5, 0, 0.06, 0, 0x4a3a26);
    const bubbles = [];
    for (let i = 0; i < 3; i++) bubbles.push(part(ripple, 0.1, 0.1, 0.1, (i - 1) * 0.22, 0.1, (i % 2 ? 0.1 : -0.1), 0x8a7a56));
    ripple.visible = false;
    s.root.add(ripple);
    s.shown = shown;
    s.ripple = ripple;
    s.bubbles = bubbles;
    s.headY0 = s.head.position.y;
    s.animate = function (p, e, t, c) {
      p.shown.visible = !e.hidden;
      p.ripple.visible = !!e.hidden;
      if (e.hidden) {
        p.ripple.scale.setScalar(1 + c.wind * 0.5);
        for (let i = 0; i < p.bubbles.length; i++) p.bubbles[i].position.y = 0.1 + Math.abs(Math.sin(t * 3 + i * 2)) * 0.12 * (0.4 + c.wind);
      }
    };
    return s;
  }

  // --- mountain goat ----------------------------------------------------------

  function buildGoat() {
    const root = new THREE.Group();
    const fur = 0xe8e0d0, pale = 0xd8d0c0, dark = 0x3a3028;
    const q = quad(root, { len: 0.96, w: 0.5, h: 0.46, legH: 0.42, legW: 0.12, col: fur, belly: 0xc8c0b0, dark: dark, hoof: 0x2c2620 });
    const neck = part(root, 0.24, 0.4, 0.26, 0, q.top - 0.04, q.front - 0.06, fur);
    neck.rotation.x = -0.5;
    const head = new THREE.Group();
    head.position.set(0, q.top + 0.02, q.front + 0.12);
    root.add(head);
    part(head, 0.3, 0.3, 0.42, 0, 0.06, 0.1, fur);
    part(head, 0.2, 0.16, 0.2, 0, -0.04, 0.34, pale);
    part(head, 0.1, 0.06, 0.04, 0, -0.02, 0.45, dark);
    part(head, 0.08, 0.2, 0.08, 0, -0.16, 0.28, pale);
    for (let s = -1; s <= 1; s += 2) {
      part(head, 0.05, 0.07, 0.03, s * 0.13, 0.14, 0.3, 0xffe066);
      part(head, 0.16, 0.06, 0.1, s * 0.22, 0.1, 0.0, pale);
      const h1 = part(head, 0.08, 0.3, 0.08, s * 0.12, 0.32, 0.02, 0xb8a878);
      h1.rotation.x = -0.45;
      const h2 = part(head, 0.07, 0.2, 0.07, s * 0.12, 0.5, -0.14, 0x9a8a5a);
      h2.rotation.x = -0.95;
    }
    part(root, 0.08, 0.16, 0.08, 0, q.top - 0.06, q.back - 0.04, fur);
    return bare(root, { head: head, headY0: head.position.y, legsX: q.legs, animate: goatAnim });
  }
  function goatAnim(p, e, t, c) {
    gait(p.legsX, c, c.strike ? 1 : 0);
    p.head.rotation.x = c.wind * 0.6 + (c.strike ? 0.45 : 0) + Math.sin(t * 2) * 0.04;
  }

  // --- drowned knight ---------------------------------------------------------

  function buildDrownedKnight() {
    const s = V.chibi({ unit: 1.1, skin: 0x86a89a, body: 0x5a7070, belt: 0x3a4a48, arms: 0x5a7070,
                        legs: 0x3f5250, helm: 0x647c7a, helmAccent: 0x9ad0c0, eyeColor: 0x9affd8 });
    const shield = new THREE.Group();
    shield.position.set(-0.36, -0.05, 0.18);
    part(shield, 0.12, 0.62, 0.55, 0, 0, 0, 0x5a7070);
    part(shield, 0.14, 0.5, 0.1, 0, 0, 0.25, 0x3f5250);
    [[0.1, 0.2], [-0.12, -0.05], [0.06, -0.2]].forEach(function (b) {
      part(shield, 0.16, 0.08, 0.08, 0, b[0], b[1], 0xd8e8e0);        // barnacles
    });
    s.armL.add(shield);
    s.shield = shield;
    const rim = part(shield, 0.16, 0.66, 0.06, 0, 0, 0.3, 0x9affd8, { emissive: 0x9affd8, emissiveI: 1 });
    rim.visible = false;
    s.shieldRim = rim;
    part(s.armR, 0.08, 0.62, 0.05, 0, -0.56, 0.12, 0x8a9a98);           // the sword
    part(s.armR, 0.22, 0.05, 0.08, 0, -0.26, 0.12, 0x3f5250);
    for (let i = 0; i < 3; i++) {
      part(s.torso, 0.06, 0.4, 0.05, -0.2 + i * 0.2, 0.1, -0.2, 0x2f7d4f);     // weed
    }
    const drips = [];
    for (let i = 0; i < 3; i++) drips.push(part(s.root, 0.06, 0.1, 0.06, -0.3 + i * 0.3, 1.0, 0.2, 0xa8e4ff, { opacity: 0.7 }));
    s.drips = drips;
    s.headY0 = s.head.position.y;
    s.animate = function (p, e, t) {
      for (let i = 0; i < p.drips.length; i++) {
        const f = (t * 0.9 + i * 0.37) % 1;
        p.drips[i].position.y = 1.15 - f * 1.1;
        p.drips[i].visible = f < 0.95;
      }
    };
    return s;
  }

  // --- ash hound --------------------------------------------------------------

  function buildHound() {
    const root = new THREE.Group();
    const q = quad(root, { len: 0.9, w: 0.34, h: 0.34, legH: 0.34, legW: 0.1, col: 0x2c2624, belly: 0x3c3230, dark: 0x1a1614 });
    const glow = { emissive: 0xe8743b, emissiveI: 1.2 };
    part(root, 0.05, 0.05, 0.6, 0, q.top + 0.02, 0, 0xff9e38, glow);
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) part(root, 0.03, 0.05, 0.1, s * 0.17, q.y, -0.15 + i * 0.15, 0xff9e38, glow);
    const head = new THREE.Group();
    head.position.set(0, q.top - 0.02, q.front + 0.08);
    root.add(head);
    part(head, 0.3, 0.28, 0.34, 0, 0.04, 0.04, 0x2c2624);
    part(head, 0.2, 0.16, 0.22, 0, -0.02, 0.28, 0x3c3230);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.1, 0.2);
    part(jaw, 0.18, 0.06, 0.24, 0, 0, 0.1, 0x1a1614);
    for (let i = 0; i < 3; i++) part(jaw, 0.03, 0.06, 0.03, -0.06 + i * 0.06, 0.05, 0.16, C.white);
    head.add(jaw);
    for (let s = -1; s <= 1; s += 2) {
      part(head, 0.06, 0.06, 0.03, s * 0.1, 0.12, 0.2, 0xffb040, { emissive: 0xffb040, emissiveI: 1.4 });
      const ear = part(head, 0.07, 0.16, 0.07, s * 0.11, 0.22, -0.02, 0x1a1614);
      ear.rotation.z = -s * 0.2;
    }
    part(root, 0.08, 0.08, 0.34, 0, q.top - 0.04, q.back - 0.16, 0x2c2624);
    part(root, 0.1, 0.14, 0.1, 0, q.top - 0.02, q.back - 0.36, 0xffb060, { emissive: 0xff9e38, emissiveI: 1.3 });
    return bare(root, { head: head, headY0: head.position.y, jawH: jaw, legsX: q.legs, animate: houndAnim });
  }
  function houndAnim(p, e, t, c) {
    gait(p.legsX, c, c.strike ? 1 : 0);
    p.jawH.rotation.x = c.wind * 0.6 + (c.strike ? 0.5 : 0);
    p.head.rotation.x = c.wind * -0.25;
  }

  // --- gull, eagle, rat, frog shaman -----------------------------------------

  function birdBody(root, o) {
    part(root, o.w, o.h, o.l, 0, o.y, 0, o.body);
    part(root, o.w * 0.9, o.h * 0.3, o.l * 0.8, 0, o.y - o.h * 0.34, 0.02, o.belly);
    part(root, o.w * 0.72, 0.1, o.l * 0.7, 0, o.y + o.h * 0.44, -0.04, o.back);
    const head = new THREE.Group();
    head.position.set(0, o.y + o.h * 0.3, o.l * 0.5);
    part(head, o.w * 0.72, o.h * 0.84, o.l * 0.52, 0, 0.04, 0.06, o.head);
    part(head, 0.07, 0.07, o.l * 0.42, 0, -0.02, o.l * 0.42, o.beak);
    if (o.hook) part(head, 0.06, 0.08, 0.08, 0, -0.08, o.l * 0.6, o.beak);
    for (let s = -1; s <= 1; s += 2) part(head, 0.05, 0.05, 0.03, s * o.w * 0.3, 0.1, o.l * 0.32, o.eye || BLACK);
    root.add(head);
    part(root, o.w * 0.6, 0.06, o.l * 0.5, 0, o.y - 0.02, -o.l * 0.55, o.tail);
    return head;
  }

  function buildGull() {
    const root = new THREE.Group();
    const head = birdBody(root, { w: 0.34, h: 0.3, l: 0.5, y: 0.5, body: 0xf4f2f8, belly: 0xffffff, back: 0xa8b0c0, head: 0xf4f2f8, beak: 0xe8a030, tail: 0x8a929e });
    for (let s = -1; s <= 1; s += 2) part(root, 0.04, 0.16, 0.04, s * 0.08, 0.3, 0.0, 0xe8a030);
    return bare(root, Object.assign({ head: head, headY0: head.position.y }, wings(root, 0.6, 0.9, 0xf4f2f8, 0xa8b0c0)));
  }

  function buildEagle() {
    const root = new THREE.Group();
    const head = birdBody(root, { w: 0.4, h: 0.36, l: 0.62, y: 0.52, body: 0x6a4a2c, belly: 0x8a6a48, back: 0x4a3220, head: 0xf4f2f8, beak: 0xf2c14e, tail: 0x4a3220, hook: true, eye: 0xffe066 });
    for (let s = -1; s <= 1; s += 2) {
      part(root, 0.06, 0.22, 0.06, s * 0.1, 0.3, 0.06, 0xf2c14e);
      part(root, 0.1, 0.05, 0.16, s * 0.1, 0.18, 0.12, 0xf2c14e);
    }
    return bare(root, Object.assign({ head: head, headY0: head.position.y }, wings(root, 0.62, 1.4, 0x6a4a2c, 0x4a3220, 0.08)));
  }

  function buildRat() {
    const root = new THREE.Group();
    const q = quad(root, { len: 0.5, w: 0.24, h: 0.22, legH: 0.12, legW: 0.06, col: 0x8a6a48, belly: 0xc8a888, dark: 0xc89898 });
    const head = new THREE.Group();
    head.position.set(0, q.top - 0.03, q.front + 0.02);
    part(head, 0.2, 0.18, 0.24, 0, 0, 0.06, 0x8a6a48);
    part(head, 0.1, 0.1, 0.16, 0, -0.02, 0.22, 0xa88860);
    part(head, 0.05, 0.05, 0.04, 0, -0.01, 0.31, 0xe8a0a0);
    for (let s = -1; s <= 1; s += 2) {
      part(head, 0.04, 0.04, 0.03, s * 0.07, 0.06, 0.16, 0xff4a3a, { emissive: 0xff4a3a, emissiveI: 0.8 });
      part(head, 0.09, 0.09, 0.03, s * 0.09, 0.12, -0.02, 0xe8a0a0);
    }
    root.add(head);
    const swish = new THREE.Group();
    swish.position.set(0, q.y, q.back);
    for (let i = 0; i < 4; i++) part(swish, 0.04, 0.04, 0.12, 0, 0, -0.07 - i * 0.11, 0xe8a0a0);
    root.add(swish);
    return bare(root, { head: head, headY0: head.position.y, swish: swish, legsX: q.legs, animate: function (p, e, t, c) { gait(p.legsX, c, c.strike ? 1 : 0); } });
  }

  function buildFrogShaman() {
    const root = new THREE.Group();
    const skin = 0x5aa04a, belly = 0xd8e8a0;
    part(root, 0.74, 0.42, 0.6, 0, 0.36, 0, skin);
    part(root, 0.6, 0.18, 0.5, 0, 0.2, 0.08, belly);
    [[-0.2, -0.1], [0.18, 0.06], [0, -0.2]].forEach(function (s) { part(root, 0.16, 0.05, 0.16, s[0], 0.6, s[1], 0x3a7a30); });
    for (let side = -1; side <= 1; side += 2) {
      part(root, 0.22, 0.34, 0.3, side * 0.4, 0.2, -0.12, skin);         // hind legs, folded
      part(root, 0.3, 0.08, 0.34, side * 0.4, 0.04, 0.02, 0x3a7a30);
      part(root, 0.12, 0.2, 0.12, side * 0.3, 0.12, 0.32, skin);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.56, 0.3);
    root.add(head);
    part(head, 0.62, 0.28, 0.4, 0, 0, 0.02, skin);
    for (let s = -1; s <= 1; s += 2) {
      part(head, 0.2, 0.2, 0.2, s * 0.2, 0.2, -0.02, skin);
      part(head, 0.14, 0.14, 0.05, s * 0.2, 0.22, 0.09, 0xffe066, { emissive: 0xffe066, emissiveI: 0.5 });
      part(head, 0.03, 0.12, 0.03, s * 0.2, 0.22, 0.12, BLACK);
    }
    part(head, 0.3, 0.16, 0.04, 0, 0.04, 0.22, 0xe8dcc0);                 // the mask
    part(head, 0.04, 0.05, 0.03, -0.06, 0.06, 0.25, BLACK);
    part(head, 0.04, 0.05, 0.03, 0.06, 0.06, 0.25, BLACK);
    [[0xc0303c, -0.1], [0xf2c14e, 0], [0x4fb3e0, 0.1]].forEach(function (f) {
      part(head, 0.06, 0.3, 0.05, f[1], 0.42, -0.12, f[0]);              // the headdress
    });
    const sac = part(head, 0.3, 0.24, 0.24, 0, -0.16, 0.18, belly);
    const staff = new THREE.Group();
    staff.position.set(0.52, 0, 0.22);
    part(staff, 0.06, 0.9, 0.06, 0, 0.45, 0, 0x5c3f2a);
    part(staff, 0.14, 0.14, 0.14, 0, 0.94, 0, 0x5cbf62, { emissive: 0x5cbf62, emissiveI: 1 });
    root.add(staff);
    return bare(root, { head: head, headY0: head.position.y, sac: sac, animate: function (p, e, t, c) {
      p.sac.scale.set(1 + c.wind * 0.9, 1 + c.wind * 0.9, 1 + c.wind * 0.6);
      p.root.scale.y *= e.onGround ? 1 : 1.1;
    } });
  }

  // --- registration -----------------------------------------------------------

  V.register('crab', buildCrab, 0.85);
  V.register('sporeshroom', buildSporeshroom, 1.15);
  V.register('crystalbeetle', buildBeetle, 0.8);
  V.register('jailer', buildJailer, 1.3);
  V.register('prisoner', buildPrisoner, 1.25);
  V.register('bogman', buildBogman, 1.25);
  V.register('mountaingoat', buildGoat, 1.05);
  V.register('drownedknight', buildDrownedKnight, 1.4);
  V.register('ashhound', buildHound, 0.75);
  V.register('gull', buildGull, 0.8);
  V.register('eagle', buildEagle, 1.0);
  V.register('sewerrat', buildRat, 0.4);
  V.register('frogshaman', buildFrogShaman, 1.0);
})(window.DS);
