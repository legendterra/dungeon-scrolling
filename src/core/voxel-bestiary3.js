/* Voxel models of the act III bestiary (enemies6.js). The rules of voxel.js and
   the files before this one: boxes only, origin at the feet, the front of the
   creature is +z, named parts for the pose code, and `animate(model, e, time,
   ctx)` for what the shared pose does not know. ctx = { walk, swing, wind,
   strike, bob, cyc }. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const V = DS.Voxel;
  if (!V || !V.register || !V.kit) return;
  const part = V.part;
  const C = V.COLORS;
  const bare = V.kit.bare, quad = V.kit.quad, gait = V.kit.gait, wings = V.kit.wings, BLACK = V.kit.BLACK;
  const lit = function (c, i) { return { emissive: c, emissiveI: i == null ? 1 : i }; };
  const BRONZE = 0xc98a3a, BRONZE_D = 0x8a5a1e;

  // --- hoplite ------------------------------------------------------------------

  function buildHoplite() {
    const s = V.chibi({
      unit: 1.0, skin: 0xe8e4dc, body: BRONZE, belt: 0x7a5230, arms: 0xe8e4dc, legs: 0xb8b4ac,
      hair: null, helm: BRONZE, helmAccent: 0xc0303c, eyeColor: 0x7fe8ff
    });
    part(s.head, 0.14, 0.5, 0.06, 0, 0.62, -0.32, 0xc0303c);                       // the crest
    const shield = new THREE.Group();
    shield.position.set(-0.14, -0.22, 0.14);
    part(shield, 0.07, 0.66, 0.66, 0, 0, 0, BRONZE);
    part(shield, 0.09, 0.5, 0.5, -0.02, 0, 0, BRONZE_D);
    part(shield, 0.11, 0.18, 0.18, -0.04, 0, 0, 0xf2c14e);
    s.armL.add(shield);
    const spear = new THREE.Group();
    spear.position.set(0, -0.34, 0.06);
    part(spear, 0.05, 1.9, 0.05, 0, 0.5, 0.2, 0x8a6340);
    part(spear, 0.09, 0.3, 0.05, 0, 1.6, 0.2, 0xd8dce8);
    s.armR.add(spear);
    s.spear = spear;
    s.animate = hopliteAnim;
    return s;
  }
  function hopliteAnim(p, e, t, c) {
    if (e.shieldUp) p.armL.rotation.x = -0.9;                                       // the shield forward
    if (c.wind > 0) p.armR.rotation.x = 0.8 * c.wind;                               // the spear drawn back
    else if (c.strike) p.armR.rotation.x = -1.5;                                    // and thrust
  }

  // --- centaur -------------------------------------------------------------------

  function buildCentaur() {
    const root = new THREE.Group();
    const q = quad(root, { len: 1.2, w: 0.5, h: 0.5, legH: 0.56, legW: 0.17, col: 0x8a5a34, belly: 0xa87a54, dark: 0x3a2618 });
    const tail = new THREE.Group();
    tail.position.set(0, q.top - 0.06, q.back - 0.02);
    part(tail, 0.12, 0.5, 0.12, 0, -0.22, -0.06, 0x3a2618);
    root.add(tail);
    const rider = new THREE.Group();
    rider.position.set(0, q.top, q.front - 0.18);
    part(rider, 0.42, 0.52, 0.3, 0, 0.26, 0, 0xc98a3a);
    part(rider, 0.44, 0.08, 0.32, 0, 0.06, 0, 0x7a5230);
    const head = new THREE.Group();
    head.position.set(0, 0.52, 0);
    part(head, 0.42, 0.4, 0.38, 0, 0.2, 0, 0xe0b48c);
    part(head, 0.46, 0.18, 0.4, 0, 0.42, -0.02, 0x4a3728);
    for (let s = -1; s <= 1; s += 2) part(head, 0.06, 0.08, 0.04, s * 0.11, 0.22, 0.2, BLACK);
    rider.add(head);
    const bow = new THREE.Group();
    bow.position.set(-0.3, 0.4, 0.16);
    part(bow, 0.05, 0.7, 0.05, 0, 0, 0, 0x8a6340);
    part(bow, 0.02, 0.7, 0.02, 0.05, 0, 0, C.bone);
    rider.add(bow);
    root.add(rider);
    return bare(root, { rider: rider, bow: bow, tailG: tail, legsX: q.legs, animate: centaurAnim });
  }
  function centaurAnim(p, e, t, c) {
    gait(p.legsX, c, c.walk > 0.5 ? 0.5 : 0);
    p.tailG.rotation.x = 0.2 + Math.sin(t * 3) * 0.14;
    p.bow.rotation.x = c.wind * -0.5;                                                 // the bow comes up as it draws
    p.rider.rotation.x = c.wind * 0.12;
  }

  // --- gorgonite ------------------------------------------------------------------

  function buildGorgonite() {
    const s = V.chibi({
      unit: 1.05, skin: 0xb8b4a8, body: 0x8a8478, belt: 0x5a564a, arms: 0xb8b4a8, legs: 0x6a665a,
      hair: null, eyes: false
    });
    const eyes = [];
    for (let k = -1; k <= 1; k += 2) {
      part(s.head, 0.12, 0.1, 0.04, k * 0.16, 0.42, 0.42, BLACK);
      eyes.push(part(s.head, 0.07, 0.06, 0.05, k * 0.16, 0.42, 0.45, 0xf4f0d8, lit(0xf4f0d8, 1.3)));
    }
    s.snakes = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.position.set((i - 2) * 0.16, 0.78, -0.04 + (i % 2) * 0.1);
      part(g, 0.07, 0.34, 0.07, 0, 0.17, 0, i % 2 ? 0x2f7d4f : 0x5cbf62);
      part(g, 0.09, 0.08, 0.1, 0, 0.36, 0.02, 0x2f7d4f);
      part(g, 0.02, 0.02, 0.02, 0, 0.36, 0.08, 0xc0303c);
      s.head.add(g);
      s.snakes.push(g);
    }
    s.eyes = eyes;
    s.animate = gorgoniteAnim;
    return s;
  }
  function gorgoniteAnim(p, e, t, c) {
    for (let i = 0; i < p.snakes.length; i++) {
      p.snakes[i].rotation.z = Math.sin(t * 3 + i * 1.3) * (0.3 + c.wind * 0.3);
      p.snakes[i].rotation.x = Math.sin(t * 2.4 + i) * 0.2;
    }
    const gaze = c.wind > 0.3 || c.strike;
    for (let i = 0; i < p.eyes.length; i++) p.eyes[i].scale.setScalar(gaze ? 1.7 : 1);
  }

  // --- fury -----------------------------------------------------------------------

  function buildFury() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0.3;
    part(body, 0.4, 0.56, 0.28, 0, 0.4, 0, 0x4a1a24);
    part(body, 0.34, 0.2, 0.24, 0, 0.06, 0, 0x2c0f16);
    const head = new THREE.Group();
    head.position.y = 0.72;
    part(head, 0.34, 0.34, 0.3, 0, 0.17, 0, 0xd8b8a8);
    for (let s = -1; s <= 1; s += 2) part(head, 0.06, 0.07, 0.04, s * 0.09, 0.2, 0.16, 0xffe066, lit(0xffe066, 1));
    part(head, 0.14, 0.06, 0.04, 0, 0.06, 0.16, 0xc0303c);
    for (let i = 0; i < 5; i++) part(head, 0.07, 0.16 + (i % 2) * 0.1, 0.07, (i - 2) * 0.08, 0.42 + (i % 2) * 0.05, -0.02, 0xff7a3d, lit(0xff5a1a, 0.8));
    body.add(head);
    const whipArm = new THREE.Group();
    whipArm.position.set(0.26, 0.6, 0.06);
    part(whipArm, 0.1, 0.3, 0.1, 0, -0.15, 0, 0xd8b8a8);
    const whip = new THREE.Group();
    whip.position.set(0, -0.3, 0.05);
    for (let i = 0; i < 5; i++) part(whip, 0.04, 0.04, 0.18, 0, 0, 0.09 + i * 0.16, i % 2 ? 0x2c0f16 : 0x6a1b28);
    whipArm.add(whip);
    body.add(whipArm);
    part(body, 0.1, 0.3, 0.1, -0.26, 0.5, 0.02, 0xd8b8a8);
    root.add(body);
    const w = wings(root, 0.72, 1.5, 0x4a1a24, 0x2c0f16, 0.05, 1.7);
    return bare(root, Object.assign({ body: body, whipArm: whipArm, whip: whip, animate: furyAnim }, w));
  }
  function furyAnim(p, e, t, c) {
    p.body.position.y = 0.3 + Math.sin(t * 2) * 0.03;
    p.whipArm.rotation.x = c.wind * -1.3 + (c.strike ? 0.9 : 0);
    p.whip.rotation.x = c.wind * 0.6 + (c.strike ? -0.7 : Math.sin(t * 4) * 0.1);
  }

  // --- shade ----------------------------------------------------------------------

  function buildShade() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 0;
    root.add(body);
    const dark = 0x2a2444, mid = 0x3c3260, glow = 0x7ff0ff;
    part(body, 0.5, 0.86, 0.36, 0, 0.72, 0, dark, { opacity: 0.8 });
    part(body, 0.34, 0.34, 0.32, 0, 1.3, 0.02, mid, { opacity: 0.85 });
    for (let s = -1; s <= 1; s += 2) part(body, 0.08, 0.1, 0.05, s * 0.08, 1.32, 0.19, glow, lit(glow, 1.4));
    const rags = [];
    for (let i = 0; i < 4; i++) rags.push(part(body, 0.14, 0.34, 0.14, (i - 1.5) * 0.14, 0.17, 0, dark, { opacity: 0.6 }));
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.32, 1.05, 0.04);
    armR.position.set(0.32, 1.05, 0.04);
    for (const a of [armL, armR]) {
      part(a, 0.1, 0.7, 0.1, 0, -0.35, 0, dark, { opacity: 0.8 });
      for (let k = -1; k <= 1; k++) part(a, 0.03, 0.2, 0.03, k * 0.04, -0.78, 0.02, C.bone);
      body.add(a);
    }
    return bare(root, { body: body, rags: rags, armL: armL, armR: armR, animate: shadeAnim });
  }
  function shadeAnim(p, e, t, c) {
    // Unseen it is a dark smear on the floor; it stands up when it steps out.
    const smear = !!e.hidden;
    p.body.scale.set(smear ? 1.5 : 1, smear ? 0.12 : 1, smear ? 1.5 : 1);
    for (let i = 0; i < p.rags.length; i++) p.rags[i].position.x = (i - 1.5) * 0.14 + Math.sin(t * 2 + i) * 0.03;
    p.armL.rotation.x = -0.4 - c.wind * 0.9 - (c.strike ? 0.6 : 0);
    p.armR.rotation.x = -0.4 - c.wind * 0.9 - (c.strike ? 0.6 : 0);
  }

  // --- automaton ------------------------------------------------------------------

  function buildAutomaton() {
    const s = V.chibi({
      unit: 1.25, skin: BRONZE, body: BRONZE, belt: BRONZE_D, arms: BRONZE, legs: BRONZE_D,
      hair: null, eyes: false
    });
    part(s.head, 0.6, 0.12, 0.05, 0, 0.5, 0.44, BLACK);                                 // the visor
    part(s.head, 0.5, 0.05, 0.05, 0, 0.5, 0.46, 0xff8a2a, lit(0xff8a2a, 1.2));
    part(s.torso, 0.3, 0.28, 0.06, 0, 0.32, 0.23, 0x2a1810);
    s.warm = part(s.torso, 0.24, 0.2, 0.07, 0, 0.32, 0.24, 0xff7a2a, lit(0xff7a2a, 1.1));
    s.hot = part(s.torso, 0.3, 0.26, 0.08, 0, 0.32, 0.25, 0xffe08a, lit(0xffc060, 1.8));
    for (let k = -1; k <= 1; k += 2) {
      part(s.torso, 0.08, 0.5, 0.08, k * 0.24, 0.8, -0.18, 0x5a5a5a);                   // the pipes on its back
      part(s.torso, 0.12, 0.08, 0.12, k * 0.24, 1.06, -0.18, 0x3a3a3a);
    }
    s.steam = part(s.torso, 0.3, 0.2, 0.3, 0, 1.2, -0.18, 0xe8ecf0, { opacity: 0.45 });
    const hammer = new THREE.Group();
    hammer.position.set(0, -0.4, 0.1);
    part(hammer, 0.12, 0.9, 0.12, 0, -0.2, 0.1, 0x5a4a3a);
    part(hammer, 0.5, 0.36, 0.36, 0, -0.68, 0.1, BRONZE_D);
    s.armR.add(hammer);
    s.animate = automatonAnim;
    return s;
  }
  function automatonAnim(p, e, t, c) {
    const heat = e.heat || 0;
    p.warm.visible = heat > 30;
    p.hot.visible = heat >= 70 && !(e.venting > 0);
    p.steam.visible = e.venting > 0 || heat > 85;
    p.steam.scale.y = 1 + Math.sin(t * 20) * 0.3;
    if (e.venting > 0) { p.torso.rotation.x = -0.15 + Math.sin(t * 40) * 0.03; p.armL.rotation.x = -1.2; p.armR.rotation.x = -1.2; }
    else if (c.wind > 0) { p.armR.rotation.x = -2.5 * c.wind; }
    else if (c.strike) { p.armR.rotation.x = 0.9; p.torso.rotation.x = 0.25; }
  }

  // --- cyclops --------------------------------------------------------------------

  function buildCyclops() {
    const s = V.chibi({
      unit: 1.8, skin: 0xa88a5a, body: 0x7a5230, belt: 0x4e3320, arms: 0xa88a5a, legs: 0x8a6a44,
      hair: null, eyes: false
    });
    part(s.head, 0.5, 0.42, 0.06, 0, 0.5, 0.86, 0xf4f0d8);                              // the one eye, huge
    part(s.head, 0.22, 0.24, 0.07, 0, 0.5, 0.9, 0x3f8a52);
    part(s.head, 0.1, 0.12, 0.08, 0, 0.5, 0.94, BLACK);
    part(s.head, 0.6, 0.1, 0.08, 0, 0.82, 0.84, 0x4a3728);
    part(s.head, 0.34, 0.1, 0.06, 0, 0.14, 0.86, 0x5a2a20);
    const club = new THREE.Group();
    club.position.set(0, -0.5, 0.2);
    part(club, 0.3, 1.5, 0.3, 0, -0.5, 0.2, 0x6a4a2c);
    part(club, 0.55, 0.6, 0.55, 0, -1.3, 0.2, 0x4a3220);
    s.armL.add(club);
    const rock = new THREE.Group();
    rock.position.set(0, -0.5, 0.3);
    part(rock, 0.7, 0.6, 0.6, 0, -0.5, 0.1, 0x7d7a86);
    part(rock, 0.5, 0.5, 0.5, 0.1, -0.2, 0.1, 0x8d8a96);
    s.armR.add(rock);
    s.rock = rock;
    s.animate = cyclopsAnim;
    return s;
  }
  function cyclopsAnim(p, e, t, c) {
    const throwing = e.mode === 'throw';
    p.rock.visible = throwing && (c.wind > 0 || c.strike) && c.wind < 1;
    if (c.wind > 0) {
      p.armR.rotation.x = -2.8 * c.wind;
      p.armL.rotation.x = throwing ? 0 : -2.4 * c.wind;
      p.torso.rotation.x = -0.2 * c.wind;
    } else if (c.strike) {
      p.armR.rotation.x = throwing ? 0.5 : 1.0;
      p.armL.rotation.x = throwing ? 0 : 0.9;
      p.torso.rotation.x = 0.3;
    }
  }

  // --- sun priest -----------------------------------------------------------------

  function buildSunpriest() {
    const s = V.chibi({
      unit: 1.0, skin: 0xe0b48c, body: 0xf4efe0, belt: 0xf2c14e, arms: 0xf4efe0, legs: 0xe8e0c8,
      hair: 0xf2c14e, helm: null, eyeColor: 0x8a5a1e
    });
    const halo = new THREE.Group();
    halo.position.set(0, 0.5, -0.36);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      part(halo, 0.1, 0.24, 0.05, Math.sin(a) * 0.56, Math.cos(a) * 0.56, 0, 0xf2c14e, lit(0xffe066, 0.9));
    }
    s.head.add(halo);
    const staff = new THREE.Group();
    staff.position.set(0, -0.34, 0.06);
    part(staff, 0.06, 1.7, 0.06, 0, 0.5, 0.2, 0xf2c14e);
    const disk = part(staff, 0.34, 0.34, 0.06, 0, 1.45, 0.2, 0xfff0a8, lit(0xffd27a, 1.2));
    s.armR.add(staff);
    s.halo = halo;
    s.disk = disk;
    s.animate = priestAnim;
    return s;
  }
  function priestAnim(p, e, t, c) {
    p.halo.rotation.z = t * 0.6;
    p.halo.scale.setScalar(1 + c.wind * 0.5 + (c.strike ? 0.4 : 0));
    p.disk.scale.setScalar(1 + Math.sin(t * 4) * 0.08 + c.wind * 0.7);
    if (c.wind > 0 || c.strike) { p.armL.rotation.x = -2.4; p.armR.rotation.x = -2.2; }
  }

  // --- satyr ----------------------------------------------------------------------

  function buildSatyr() {
    const s = V.chibi({
      unit: 0.95, skin: 0xb8865a, body: 0x6a4a2c, belt: 0x4e3320, arms: 0xb8865a, legs: 0x6a4a2c,
      hair: 0x3a2618, eyeColor: 0x2c1a10
    });
    for (let k = -1; k <= 1; k += 2) {
      const horn = part(s.head, 0.08, 0.3, 0.08, k * 0.26, 0.92, 0, 0xe8e0c8);
      horn.rotation.z = -k * 0.3;
      part(s.head, 0.08, 0.08, 0.1, k * 0.4, 0.62, 0.02, 0xb8865a);
    }
    part(s.torso, 0.12, 0.3, 0.12, 0, 0.08, -0.26, 0x6a4a2c);
    part(s.legL, 0.24, 0.1, 0.28, 0, -0.3, 0.02, 0x2c1a10);
    part(s.legR, 0.24, 0.1, 0.28, 0, -0.3, 0.02, 0x2c1a10);
    s.animate = function (p, e, t, c) { if (c.wind > 0) { p.legL.rotation.x = 0.7 * c.wind; p.legR.rotation.x = 0.7 * c.wind; } };
    return s;
  }

  // --- stone snake ----------------------------------------------------------------

  function buildStonesnake() {
    const root = new THREE.Group();
    const stone = 0xd8d4c0, dark = 0x8a8478;
    const segs = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.position.set(0, 0.11, 0.5 - i * 0.24);
      part(g, 0.24 - i * 0.02, 0.2, 0.28, 0, 0, 0, i % 2 ? stone : dark);
      part(g, 0.05, 0.04, 0.16, 0, 0.11, 0, 0x6a665a);
      root.add(g);
      segs.push(g);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.13, 0.72);
    part(head, 0.3, 0.16, 0.3, 0, 0, 0, stone);
    part(head, 0.22, 0.05, 0.22, 0, -0.1, 0.06, dark);
    for (let s = -1; s <= 1; s += 2) part(head, 0.05, 0.05, 0.04, s * 0.1, 0.05, 0.15, 0xffffff, lit(0xffffff, 0.8));
    root.add(head);
    return bare(root, { head: head, segs: segs, animate: function (p, e, t, c) {
      for (let i = 0; i < p.segs.length; i++) p.segs[i].position.x = Math.sin(t * 3 - i * 0.8) * (0.04 + c.walk * 0.05);
      p.head.rotation.x = -c.wind * 0.5 + (c.strike ? 0.3 : 0);
    } });
  }

  // --- titan's slave --------------------------------------------------------------

  function buildTitanslave() {
    const s = V.chibi({
      unit: 1.3, skin: 0x8a7a6a, body: 0x5a4a3a, belt: 0x3a2f24, arms: 0x8a7a6a, legs: 0x6a5a4a,
      hair: 0x2c2620, eyeColor: 0xe8e0c8
    });
    for (let k = -1; k <= 1; k += 2) {
      part(s.armL, 0.24, 0.1, 0.24, 0, -0.34, 0, 0x5a5a5a);
      part(s.armR, 0.24, 0.1, 0.24, 0, -0.34, 0, 0x5a5a5a);
    }
    const chain = new THREE.Group();
    chain.position.set(0, -0.4, 0.1);
    for (let i = 0; i < 5; i++) part(chain, 0.08, 0.08, 0.14, 0, 0, 0.12 + i * 0.16, 0x6a6a6e);
    part(chain, 0.36, 0.36, 0.36, 0, 0, 1.0, 0x3a3a3e);
    s.armR.add(chain);
    s.chain = chain;
    s.animate = function (p, e, t, c) {
      p.chain.rotation.y = c.strike ? (e.spin || 0) : 0.4;
      if (c.wind > 0) p.armR.rotation.x = -2.2 * c.wind;
      else if (c.strike) p.armR.rotation.x = -2.0;
    };
    return s;
  }

  // --- Cerberus pup ---------------------------------------------------------------

  function buildCerberuspup() {
    const root = new THREE.Group();
    const q = quad(root, { len: 0.8, w: 0.36, h: 0.34, legH: 0.3, legW: 0.11, col: 0x2c2624, belly: 0x3c3230, dark: 0x1a1614 });
    const heads = [];
    [[0, 0, 0], [-0.22, 0.02, -0.5], [0.22, 0.02, 0.5]].forEach(function (d, i) {
      const h = new THREE.Group();
      h.position.set(d[0], q.top - 0.02, q.front + 0.02);
      h.rotation.y = d[2] * 0.6;
      part(h, 0.26, 0.24, 0.28, 0, 0.04, 0.04, 0x2c2624);
      part(h, 0.17, 0.13, 0.2, 0, -0.03, 0.24, 0x3c3230);
      const jaw = new THREE.Group();
      jaw.position.set(0, -0.09, 0.16);
      part(jaw, 0.15, 0.05, 0.2, 0, 0, 0.09, 0x1a1614);
      for (let k = 0; k < 2; k++) part(jaw, 0.03, 0.05, 0.03, -0.04 + k * 0.08, 0.04, 0.14, C.white);
      h.add(jaw);
      for (let s = -1; s <= 1; s += 2) part(h, 0.05, 0.05, 0.03, s * 0.08, 0.1, 0.17, 0xff7a3d, lit(0xff7a3d, 1.4));
      root.add(h);
      heads.push({ head: h, jaw: jaw });
    });
    part(root, 0.1, 0.1, 0.3, 0, q.top - 0.04, q.back - 0.14, 0xff7a3d, lit(0xff5a1a, 1));
    return bare(root, { heads: heads, legsX: q.legs, animate: function (p, e, t, c) {
      gait(p.legsX, c, c.strike ? 1 : 0);
      // Three jaws, one after another, through the strike.
      const phase = c.strike ? (t * 9) % 3 : -1;
      for (let i = 0; i < p.heads.length; i++) p.heads[i].jaw.rotation.x = c.wind * 0.4 + (Math.floor(phase) === i ? 0.8 : 0);
    } });
  }

  // --- storm spirit ---------------------------------------------------------------

  function buildStormspirit() {
    const root = new THREE.Group();
    const puffs = [];
    [[0, 0.3, 0, 0.6], [-0.3, 0.24, 0.05, 0.46], [0.3, 0.24, -0.05, 0.46], [0.1, 0.5, 0.05, 0.4], [-0.14, 0.46, -0.05, 0.36]].forEach(function (d) {
      puffs.push(part(root, d[3], d[3] * 0.8, d[3], d[0], d[1], d[2], 0x8a90a8));
    });
    part(root, 0.5, 0.1, 0.5, 0, 0.1, 0, 0x5a6078);
    for (let s = -1; s <= 1; s += 2) part(root, 0.08, 0.1, 0.05, s * 0.12, 0.32, 0.32, 0xffe45c, lit(0xffe45c, 1.4));
    const bolts = [];
    for (let i = 0; i < 3; i++) {
      const b = part(root, 0.05, 0.36, 0.05, (i - 1) * 0.2, -0.1, 0.05, 0xffe45c, lit(0xffe45c, 1.5));
      b.visible = false;
      bolts.push(b);
    }
    return bare(root, { puffs: puffs, bolts: bolts, animate: function (p, e, t, c) {
      for (let i = 0; i < p.puffs.length; i++) p.puffs[i].scale.setScalar(1 + Math.sin(t * 2 + i * 1.4) * 0.06);
      const flash = c.wind > 0.2 || c.strike;
      for (let i = 0; i < p.bolts.length; i++) p.bolts[i].visible = flash && ((Math.floor(t * 20) + i) % 3 !== 0);
    } });
  }

  // --- griffin --------------------------------------------------------------------

  function buildGriffin() {
    const root = new THREE.Group();
    const fur = 0xc8a458, pale = 0xf4f0d8, dark = 0x7a5a2c;
    part(root, 0.5, 0.44, 0.9, 0, 0.5, 0, fur);
    part(root, 0.42, 0.14, 0.7, 0, 0.32, 0.02, pale);
    const head = new THREE.Group();
    head.position.set(0, 0.86, 0.5);
    part(head, 0.34, 0.36, 0.36, 0, 0.04, 0.04, pale);
    part(head, 0.14, 0.14, 0.26, 0, -0.04, 0.3, 0xf2c14e);
    part(head, 0.1, 0.12, 0.1, 0, -0.14, 0.36, 0xf2c14e);
    for (let s = -1; s <= 1; s += 2) part(head, 0.06, 0.06, 0.03, s * 0.12, 0.1, 0.21, BLACK);
    root.add(head);
    for (let s = -1; s <= 1; s += 2) {
      part(root, 0.14, 0.4, 0.14, s * 0.16, 0.2, 0.36, fur);
      part(root, 0.16, 0.08, 0.2, s * 0.16, 0.02, 0.4, 0xf2c14e);
    }
    part(root, 0.16, 0.16, 0.5, 0, 0.58, -0.66, fur);
    part(root, 0.22, 0.22, 0.16, 0, 0.58, -0.94, dark);
    const w = wings(root, 0.8, 1.9, pale, fur, 0.09, 2.1);
    return bare(root, Object.assign({ head: head }, w));
  }

  V.register('hoplite', buildHoplite, 1.5);
  V.register('centaur', buildCentaur, 1.7);
  V.register('gorgonite', buildGorgonite, 1.8);
  V.register('fury', buildFury, 1.3);
  V.register('shade', buildShade, 1.5);
  V.register('automaton', buildAutomaton, 2.0);
  V.register('cyclops', buildCyclops, 3.3);
  V.register('sunpriest', buildSunpriest, 1.8);
  V.register('satyr', buildSatyr, 1.3);
  V.register('stonesnake', buildStonesnake, 0.35);
  V.register('titanslave', buildTitanslave, 2.2);
  V.register('cerberuspup', buildCerberuspup, 0.85);
  V.register('stormspirit', buildStormspirit, 0.75);
  V.register('griffin', buildGriffin, 1.3);
})(window.DS);
