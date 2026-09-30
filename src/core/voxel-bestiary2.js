/* Voxel models of the act II bestiary (enemies5.js). The rules of voxel.js and
   voxel-bestiary.js: boxes only, origin at the feet, the front of the creature is
   +z, named parts for the pose code, and `animate(model, e, time, ctx)` for what
   the shared pose does not know. ctx = { walk, swing, wind, strike, bob, cyc }. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const V = DS.Voxel;
  if (!V || !V.register || !V.kit) return;
  const part = V.part;
  const C = V.COLORS;
  const bare = V.kit.bare, quad = V.kit.quad, gait = V.kit.gait, BLACK = V.kit.BLACK;
  const lit = function (c, i) { return { emissive: c, emissiveI: i == null ? 1 : i }; };

  // --- eel --------------------------------------------------------------------

  function buildEel() {
    const root = new THREE.Group();
    const hide = 0x4a6a78, dark = 0x2c3f4a, belly = 0xa8c4cc, spark = 0x7fe8ff;
    const segs = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.position.set(0, 0.2, 0.6 - i * 0.3);
      const w = 0.36 - i * 0.03;
      part(g, w, 0.24 - i * 0.015, 0.34, 0, 0, 0, i % 2 ? hide : dark);
      part(g, w * 0.7, 0.06, 0.3, 0, -0.1, 0, belly);
      if (i < 5) part(g, 0.05, 0.1, 0.24, 0, 0.16, 0, dark);
      root.add(g);
      segs.push(g);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.2, 0.86);
    part(head, 0.4, 0.26, 0.36, 0, 0, 0, hide);
    part(head, 0.36, 0.08, 0.3, 0, -0.14, 0.04, belly);
    for (let s = -1; s <= 1; s += 2) part(head, 0.07, 0.07, 0.04, s * 0.14, 0.06, 0.19, 0xffe066, lit(0xffe066, 0.8));
    root.add(head);
    const arcs = [];
    for (let i = 0; i < 4; i++) {
      const a = part(root, 0.04, 0.16, 0.04, (i % 2 ? 1 : -1) * 0.12, 0.42, 0.5 - i * 0.3, spark, lit(spark, 1));
      a.visible = false;
      arcs.push(a);
    }
    return bare(root, { head: head, segs: segs, arcs: arcs, animate: eelAnim });
  }
  function eelAnim(p, e, t, c) {
    const amp = 0.05 + c.walk * 0.06;
    for (let i = 0; i < p.segs.length; i++) {
      p.segs[i].position.x = Math.sin(t * 5 - i * 0.9) * amp * (1 + i * 0.2);
      // Rearing to coil: the middle of the body rises as the wind-up runs.
      p.segs[i].position.y = 0.2 + Math.sin((i / 5) * Math.PI) * 0.16 * c.wind;
    }
    p.head.position.x = Math.sin(t * 5 + 0.9) * amp;
    const crackle = c.wind > 0.2 || c.strike;
    for (let i = 0; i < p.arcs.length; i++) {
      p.arcs[i].visible = crackle && ((Math.floor(t * 30) + i) % 2 === 0);
      p.arcs[i].scale.y = 0.7 + ((Math.floor(t * 40) + i * 3) % 5) * 0.2;
    }
  }

  // --- glowworm ---------------------------------------------------------------

  function buildGlowworm() {
    const root = new THREE.Group();
    // The thread it hangs from runs off the top of the frame.
    part(root, 0.03, 5, 0.03, 0, 3.6, 0, 0xcfe8e0, { opacity: 0.7 });
    const body = new THREE.Group();
    root.add(body);
    for (let i = 0; i < 5; i++) {
      part(body, 0.34 - i * 0.03, 0.2, 0.34 - i * 0.03, 0, 1.05 - i * 0.19, 0, i % 2 ? 0x7fc8a4 : 0x9ad8b8, lit(0x5cbf9a, 0.25 + i * 0.1));
    }
    for (let s = -1; s <= 1; s += 2) part(body, 0.06, 0.06, 0.04, s * 0.09, 0.3, 0.17, BLACK);
    const lure = new THREE.Group();
    lure.position.set(0, 0.06, 0.1);
    part(lure, 0.16, 0.16, 0.16, 0, 0, 0, 0xa3ffd8, lit(0xa3ffd8, 1.2));
    part(lure, 0.26, 0.26, 0.26, 0, 0, 0, 0xa3ffd8, { opacity: 0.25, emissive: 0xa3ffd8, emissiveI: 0.8 });
    body.add(lure);
    return bare(root, { body: body, lure: lure, animate: wormAnim });
  }
  function wormAnim(p, e, t, c) {
    p.body.rotation.z = Math.sin(t * 1.3) * 0.07;
    p.body.rotation.x = Math.sin(t * 0.9 + 1) * 0.05;
    // The lure swells before the strand drops.
    p.lure.scale.setScalar(1 + Math.sin(t * 3) * 0.12 + c.wind * 0.9 + (c.strike ? 0.5 : 0));
  }

  // --- drowner ----------------------------------------------------------------

  function buildDrowner() {
    const s = V.chibi({
      unit: 1.05, skin: 0xb8d4d4, body: 0x5a7a80, belt: 0x2f4a50, arms: 0xb8d4d4, legs: 0x3a5560,
      hair: 0x2c4a50, eyeColor: 0xbff4ff, mouthColor: 0x2c3a3e
    });
    s.armsForward = true;
    s.torso.rotation.x = 0.16;
    // Weed in the hair, a torn hem, and the drips that fall from both.
    part(s.head, 0.1, 0.5, 0.1, -0.2, 0.55, -0.32, 0x2f6f4a);
    part(s.head, 0.08, 0.36, 0.08, 0.22, 0.6, -0.3, 0x2f6f4a);
    part(s.torso, 0.5, 0.16, 0.36, 0, 0.02, 0, 0x3a5560);
    part(s.armL, 0.1, 0.22, 0.1, 0, -0.5, 0.02, 0x2f6f4a);
    s.drips = [];
    for (let i = 0; i < 3; i++) {
      s.drips.push(part(s.root, 0.05, 0.08, 0.05, (i - 1) * 0.22, 0.9, 0.16, 0x8fd8f4, lit(0x4fb3e0, 0.7)));
    }
    s.animate = drownerAnim;
    return s;
  }
  function drownerAnim(p, e, t, c) {
    for (let i = 0; i < p.drips.length; i++) {
      const phase = (t * 0.9 + i * 0.37) % 1;
      p.drips[i].position.y = 0.95 - phase * 0.95;
      p.drips[i].scale.y = 0.6 + phase;
    }
    // Reaching: both arms come up as the grab winds.
    if (c.wind > 0 || c.strike) {
      p.armL.rotation.x = -1.3 - c.wind * 0.5;
      p.armR.rotation.x = -1.3 - c.wind * 0.5;
    }
  }

  // --- egg sac ----------------------------------------------------------------

  function buildEggsac() {
    const root = new THREE.Group();
    part(root, 0.9, 0.06, 0.9, 0, 0.03, 0, 0x2a2e1e);
    part(root, 0.5, 0.2, 0.5, 0, 0.12, 0, 0x4a5030);
    const eggs = [];
    [[0, 0.6, 0, 1], [-0.24, 0.4, 0.12, 0.72], [0.24, 0.36, -0.1, 0.66]].forEach(function (d) {
      const g = new THREE.Group();
      g.position.set(d[0], d[1], d[2]);
      const k = d[3];
      part(g, 0.5 * k, 0.62 * k, 0.5 * k, 0, 0, 0, 0xdce8bc, { opacity: 0.86 });
      part(g, 0.2 * k, 0.28 * k, 0.2 * k, 0, -0.04 * k, 0.02, 0x3a4a2a);
      const nucleus = part(g, 0.1 * k, 0.1 * k, 0.1 * k, 0, 0.02 * k, 0.1 * k, 0xc8ff8a, lit(0xa3e86b, 0.9));
      g.userData.nucleus = nucleus;
      root.add(g);
      eggs.push(g);
    });
    return bare(root, { eggs: eggs, animate: eggsacAnim });
  }
  function eggsacAnim(p, e, t, c) {
    for (let i = 0; i < p.eggs.length; i++) {
      const s = 1 + Math.sin(t * 2.4 + i * 1.7) * 0.05 + c.wind * 0.22 + (c.strike ? 0.15 : 0);
      p.eggs[i].scale.setScalar(s);
      p.eggs[i].userData.nucleus.scale.setScalar(0.8 + Math.abs(Math.sin(t * 3.1 + i)) * 0.6 + c.wind);
    }
  }

  // --- ice troll --------------------------------------------------------------

  function buildTrollice() {
    const s = V.chibi({
      unit: 1.45, skin: 0xa8d0e0, body: 0x6a8a9a, belt: 0x3a5060, arms: 0xa8d0e0, legs: 0x4a6a7a,
      hair: 0xf4fbff, eyeColor: 0xffe066, mouthColor: 0x2c3e50
    });
    const ice = { emissive: 0x8fdcff, emissiveI: 0.35 };
    [[-0.36, 0.86, -0.08, 0.32], [0.4, 0.8, -0.1, 0.26], [0, 0.98, -0.3, 0.4]].forEach(function (d) {
      const shard = part(s.torso, 0.16, d[3] * 1.4, 0.14, d[0], d[1], d[2], 0xd8f4ff, ice);
      shard.rotation.z = d[0] * 0.5;
    });
    const club = new THREE.Group();
    club.position.set(0, -0.36, 0.14);
    part(club, 0.3, 0.9, 0.3, 0, -0.34, 0.08, 0xa8e4ff, { emissive: 0x6ac0f0, emissiveI: 0.3 });
    part(club, 0.42, 0.34, 0.4, 0, -0.9, 0.08, 0xd8f4ff, ice);
    s.armR.add(club);
    s.club = club;
    s.animate = trollAnim;
    return s;
  }
  function trollAnim(p, e, t, c) {
    // Both arms over the head while the slam winds; down and forward when it lands.
    if (c.wind > 0) {
      p.armR.rotation.x = -2.7 * c.wind;
      p.armL.rotation.x = -2.2 * c.wind;
      p.torso.rotation.x = -0.25 * c.wind;
    } else if (c.strike) {
      p.armR.rotation.x = 0.7;
      p.armL.rotation.x = 0.4;
      p.torso.rotation.x = 0.3;
    }
  }

  // --- mosquito ---------------------------------------------------------------

  function buildMosquito() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.3;
    part(body, 0.2, 0.2, 0.22, 0, 0, 0.1, 0x6a4a3a);
    const abdomen = part(body, 0.16, 0.16, 0.36, 0, -0.03, -0.18, 0x8a5a44);
    for (let i = 0; i < 3; i++) part(body, 0.17, 0.17, 0.05, 0, -0.03, -0.08 - i * 0.12, 0x2c2018);
    part(body, 0.04, 0.04, 0.36, 0, -0.04, 0.42, 0xd8c8a0);
    for (let s = -1; s <= 1; s += 2) part(body, 0.05, 0.05, 0.03, s * 0.07, 0.05, 0.2, 0xc0303c, lit(0xc0303c, 0.9));
    root.add(body);
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    wingL.position.set(-0.08, 0.1, 0);
    wingR.position.set(0.08, 0.1, 0);
    part(wingL, 0.4, 0.02, 0.16, -0.2, 0, 0, 0xe8f0f8, { opacity: 0.55 });
    part(wingR, 0.4, 0.02, 0.16, 0.2, 0, 0, 0xe8f0f8, { opacity: 0.55 });
    body.add(wingL);
    body.add(wingR);
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) part(body, 0.03, 0.2, 0.03, s * (0.1 + i * 0.01), -0.16, 0.12 - i * 0.1, 0x3a2a20);
    return bare(root, { body: body, wingL: wingL, wingR: wingR, abdomen: abdomen, animate: mosquitoAnim });
  }
  function mosquitoAnim(p, e, t, c) {
    const flap = Math.sin(t * 70) * 0.9;
    p.wingL.rotation.z = flap;
    p.wingR.rotation.z = -flap;
    p.body.rotation.x = c.strike ? 0.6 : Math.sin(t * 2) * 0.08 - c.wind * 0.3;
  }

  // --- lake spirit ------------------------------------------------------------

  function buildLakespirit() {
    const root = new THREE.Group();
    const cloak = 0x2f5f8a, glow = 0x7fd0ff;
    const bodyG = new THREE.Group();
    root.add(bodyG);
    part(bodyG, 0.5, 0.7, 0.4, 0, 0.7, 0, cloak, { opacity: 0.78 });
    part(bodyG, 0.42, 0.42, 0.38, 0, 1.18, 0.02, 0x3f78a8, { opacity: 0.85 });
    part(bodyG, 0.26, 0.26, 0.05, 0, 1.16, 0.2, 0x0e1c2c);
    for (let s = -1; s <= 1; s += 2) part(bodyG, 0.07, 0.09, 0.05, s * 0.07, 1.18, 0.23, glow, lit(glow, 1.3));
    const tail = [];
    for (let i = 0; i < 3; i++) {
      const w = part(root, 0.3 - i * 0.08, 0.2, 0.26 - i * 0.06, 0, 0.3 - i * 0.16, -0.02, cloak, { opacity: 0.6 - i * 0.14 });
      tail.push(w);
    }
    const orb = part(bodyG, 0.2, 0.2, 0.2, 0.34, 0.8, 0.2, glow, lit(glow, 0.9));
    return bare(root, { bodyG: bodyG, tail: tail, orb: orb, animate: spiritAnim });
  }
  function spiritAnim(p, e, t, c) {
    p.bodyG.position.y = Math.sin(t * 1.6) * 0.05;
    for (let i = 0; i < p.tail.length; i++) p.tail[i].position.x = Math.sin(t * 2.2 - i * 0.9) * (0.05 + i * 0.03);
    p.orb.scale.setScalar(1 + Math.sin(t * 4) * 0.1 + c.wind * 1.2);
    p.orb.position.z = 0.2 + c.wind * 0.14;
  }

  // --- ice wolf ---------------------------------------------------------------

  function buildIcewolf() {
    const root = new THREE.Group();
    const fur = 0xd8ecf4, pale = 0xf4fbff, dark = 0x6a8aa0;
    const q = quad(root, { len: 0.95, w: 0.38, h: 0.36, legH: 0.34, legW: 0.11, col: fur, belly: pale, dark: dark });
    const ice = lit(0x8fdcff, 0.9);
    for (let i = 0; i < 4; i++) part(root, 0.07, 0.14 + (i % 2) * 0.05, 0.07, 0, q.top + 0.07, 0.3 - i * 0.2, 0xbfeaff, ice);
    const head = new THREE.Group();
    head.position.set(0, q.top - 0.03, q.front + 0.06);
    root.add(head);
    part(head, 0.32, 0.3, 0.34, 0, 0.04, 0.04, fur);
    part(head, 0.2, 0.15, 0.24, 0, -0.03, 0.28, pale);
    part(head, 0.07, 0.06, 0.06, 0, 0.01, 0.42, BLACK);
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.1, 0.2);
    part(jaw, 0.17, 0.05, 0.24, 0, 0, 0.1, dark);
    for (let i = 0; i < 3; i++) part(jaw, 0.03, 0.06, 0.03, -0.06 + i * 0.06, 0.05, 0.16, C.white);
    head.add(jaw);
    for (let s = -1; s <= 1; s += 2) {
      part(head, 0.06, 0.06, 0.03, s * 0.1, 0.12, 0.2, 0x7fe8ff, { emissive: 0x7fe8ff, emissiveI: 1.3 });
      const ear = part(head, 0.07, 0.16, 0.07, s * 0.11, 0.22, -0.02, dark);
      ear.rotation.z = -s * 0.2;
    }
    const tail = new THREE.Group();
    tail.position.set(0, q.top - 0.06, q.back - 0.04);
    part(tail, 0.14, 0.14, 0.4, 0, -0.02, -0.2, fur);
    part(tail, 0.1, 0.1, 0.16, 0, -0.06, -0.46, pale);
    root.add(tail);
    return bare(root, { head: head, headY0: head.position.y, jawH: jaw, tailG: tail, legsX: q.legs, animate: wolfAnim });
  }
  function wolfAnim(p, e, t, c) {
    gait(p.legsX, c, c.strike ? 1 : 0);
    p.jawH.rotation.x = c.wind * 0.6 + (c.strike ? 0.5 : 0);
    p.head.rotation.x = c.wind * -0.25;
    p.tailG.rotation.x = -0.35 + Math.sin(t * 3) * 0.12;
  }

  V.register('eel', buildEel, 0.62);
  V.register('glowworm', buildGlowworm, 1.1);
  V.register('drowner', buildDrowner, 1.6);
  V.register('eggsac', buildEggsac, 0.9);
  V.register('trollice', buildTrollice, 2.5);
  V.register('mosquito', buildMosquito, 0.6);
  V.register('lakespirit', buildLakespirit, 1.4);
  V.register('icewolf', buildIcewolf, 0.75);
})(window.DS);
