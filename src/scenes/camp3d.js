/* The menu's camp, as a real 3D place.

   The main menu used to be a 2D painting: a jagged treeline sampled from two
   sines, a trunk table, a fire made of four frames, and a hero blitted over the
   top of it. It read well and it never moved -- the same problem the dungeons
   had before the Three.js migration, where "background" meant "a flat image
   someone remembered to redraw". This is the menu the same way the dungeon is
   drawn now: actual geometry, actual lights, actual time passing.

   What is here:
     * the clearing -- a stone slab, a hearth dais, scattered rocks;
     * three rows of trees at three depths, fogged so the clearing has an edge;
     * the hero, built by the same voxel builder the run uses, breathing;
     * a campfire that is a real light: it flickers, it gilds the hero's face,
       and the moon behind the trees backlights the whole clearing;
     * life -- embers rising off the fire, fireflies drifting through the
       clearing, three silhouettes crossing the sky far behind.

   It renders as a pre-pass through the screen layer (DS.UI3.addPrePass), which
   is what puts it INSIDE the 320x180 play frame with the UI drawn over it. It
   never touches the world renderer or the run's state: a menu is not a level. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;

  let scene = null, camera = null;
  let built = false;
  let fireLight = null, emberMat = null;
  const flames = [], embers = [], flies = [], trees = [], flyers = [];
  let hearth = 0;

  const MOTE = 0xfff0a8;
  const EMBER = 0xff9a3c;

  function mat(color, opts) {
    if (DS.Voxel && DS.Voxel.mat) return DS.Voxel.mat(color, opts);
    return new THREE.MeshBasicMaterial({ color: color });
  }

  /* Unit boxes, origin at the centre. Everything in the camp is built from
     these: it is a voxel clearing, and a block is the whole vocabulary. */
  function box(parent, sx, sy, sz, x, y, z, color, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color, opts));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function node(parent) {
    const g = new THREE.Group();
    (parent || scene).add(g);
    return g;
  }

  /* Origin at the FEET, the same convention as the entity models, so a prop can
     be dropped straight onto the ground line. */
  function prop(parent, key, info) {
    const model = DS.Voxel.build(key, info || {});
    const g = node(parent);
    g.add(model.root);
    return g;
  }

  function build() {
    if (built) return true;
    if (typeof THREE === 'undefined' || !DS.Voxel) return false;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    /* Fog is what gives the clearing an edge: the third row of trees is outside
       it and reads as distance rather than as more trees. */
    scene.fog = new THREE.Fog(0x070b14, 11, 30);

    camera = new THREE.PerspectiveCamera(36, C.W / C.H, 0.4, 60);
    camera.position.set(0.55, 1.72, 5.3);
    camera.lookAt(0, 1.02, 0);

    // --- light ------------------------------------------------------------
    // Deliberately the same recipe the dungeon uses: a low fill, a moon from
    // behind the scene, and the fire doing the actual lighting.
    scene.add(new THREE.AmbientLight(0x2b3550, 0.55));
    scene.add(new THREE.HemisphereLight(0x27374f, 0x14100f, 0.5));

    const moon = new THREE.DirectionalLight(0x9fc0ff, 0.6);
    moon.position.set(-2.4, 4.4, -6);
    scene.add(moon);

    fireLight = new THREE.PointLight(0xffa54a, 2.4, 11, 2);
    fireLight.position.set(0.18, 0.6, 0.4);
    scene.add(fireLight);

    const rng = DS.makeRng(0xCA5E01);

    // --- the clearing -----------------------------------------------------
    const ground = node();
    box(ground, 30, 0.5, 14, 0, -0.25, -1.5, 0x23222b);         // the slab
    box(ground, 4.6, 0.16, 2.8, 0.3, 0.06, 0.5, 0x39374a);      // hearth dais
    for (let i = 0; i < 16; i++) {
      const w = rng.float(0.28, 0.85);
      box(ground, w, w * 0.45, w * 0.8,
          rng.float(-6.5, 6.5), w * 0.22, rng.float(-4, 3.4), 0x33323c);
    }

    // --- trees, three depths ----------------------------------------------
    const TREE = [
      { trunk: 0x2a2018, leaf: 0x1b3326, near: 0.0 },
      { trunk: 0x241c15, leaf: 0x16291e, near: 1.4 },
      { trunk: 0x1e1712, leaf: 0x111f18, near: 2.4 }
    ];
    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? 1 : -1;
      const band = i % 3;
      const h = rng.float(2.1, 4.6) + band * 0.5;
      const tr = node();
      tr.position.set(side * rng.float(3.0 + band * 2.2, 5.0 + band * 2.6),
                      0, rng.float(-10, 2.6) - band * 1.6);
      const pal = TREE[band];
      box(tr, 0.3, h * 0.6, 0.3, 0, h * 0.3, 0, pal.trunk);
      box(tr, 1.5, 1.4, 1.5, 0, h * 0.64, 0, pal.leaf);
      box(tr, 1.0, 1.05, 1.0, 0, h * 0.86, 0, pal.leaf);
      trees.push({ node: tr, amp: 0.006 + band * 0.004, phase: rng.float(0, 6.28) });
    }

    // Two hills behind everything, so the sky has a horizon to sit on.
    box(node(), 26, 5.5, 2, 0, 1.2, -13, 0x0c1220);
    box(node(), 16, 4.0, 2, -9, 0.6, -11.5, 0x0a0f1b);
    box(node(), 14, 3.4, 2, 9.5, 0.4, -11.8, 0x0a0f1b);

    // --- the camp ---------------------------------------------------------
    hearth = node();
    hearth.position.set(0.25, 0.14, 0.5);
    // Logs in a tepee, so the fire has a shape to sit in.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const log = box(hearth, 0.16, 0.62, 0.16, Math.sin(a) * 0.18, 0.3, Math.cos(a) * 0.18,
                      0x4a3524);
      log.rotation.z = Math.sin(a) * 0.24;
      log.rotation.x = -Math.cos(a) * 0.24;
    }
    box(hearth, 0.7, 0.06, 0.7, 0, 0.03, 0, 0x201a15);

    for (let i = 0; i < 3; i++) {
      const f = box(hearth, 0.34 - i * 0.09, 0.36 - i * 0.08, 0.34 - i * 0.09,
                    0, 0.42 + i * 0.2, 0,
                    i === 0 ? 0xe8743b : i === 1 ? 0xffa54a : 0xffe9a8,
                    { emissive: i === 0 ? 0xe8743b : 0xffc46a, emissiveI: 1 });
      flames.push({ node: f, base: 0.42 + i * 0.2, phase: i * 1.7 });
    }

    // The hero, sitting at the fire with his back to the trees.
    const hero = prop(null, 'hero', { armor: {} });
    hero.position.set(-1.15, 0.14, 0.75);
    hero.rotation.y = 0.55;
    hero.userData.hero = true;

    const chest = prop(null, 'chest', { tier: 'wood' });
    chest.position.set(1.85, 0.14, 0.9);
    chest.rotation.y = -0.4;

    const table = prop(null, 'table', {});
    table.position.set(-2.9, 0.14, 0.2);
    table.rotation.y = 0.5;

    const shrine = prop(null, 'shrine', {});
    shrine.position.set(3.9, 0.14, -1.6);

    // --- life -------------------------------------------------------------
    // Embers: a fixed pool, recycled, rising off the coals.
    const pool = node();
    for (let i = 0; i < 22; i++) {
      const m = box(pool, 0.05, 0.05, 0.05, 0, -99, 0, EMBER,
                    { emissive: EMBER, emissiveI: 1, opacity: 0.9 });
      embers.push({
        node: m, t: rng.float(0, 1), speed: rng.float(0.35, 0.75),
        drift: rng.float(0, 6.28), x: rng.float(-0.3, 0.3)
      });
    }

    // Fireflies: the clearing is alive between the trees, not only at the fire.
    for (let i = 0; i < 26; i++) {
      const m = box(pool, 0.05, 0.05, 0.05, 0, -99, 0, MOTE,
                    { emissive: MOTE, emissiveI: 0.8, opacity: 0.75 });
      flies.push({
        node: m,
        home: { x: rng.float(-7, 7), y: rng.float(0.5, 2.6), z: rng.float(-7, 1.5) },
        phase: rng.float(0, 6.28), speed: rng.float(0.25, 0.7), amp: rng.float(0.25, 0.9)
      });
    }

    // Silhouettes crossing the sky, far behind the trees.
    for (let i = 0; i < 3; i++) {
      const f = node();
      const body = box(f, 0.5, 0.1, 0.12, 0, 0, 0, 0x0a0d16);
      const wingL = box(f, 0.36, 0.05, 0.1, -0.34, 0.02, 0, 0x0a0d16);
      const wingR = box(f, 0.36, 0.05, 0.1, 0.34, 0.02, 0, 0x0a0d16);
      wingL.position.x = -0.34; wingR.position.x = 0.34;
      f.position.set(rng.float(-14, 14), rng.float(3.2, 4.6), -12 - i * 1.5);
      flyers.push({
        node: f, wingL: wingL, wingR: wingR,
        speed: (i % 2 ? 1 : -1) * rng.float(0.7, 1.3),
        flap: rng.float(6, 9), phase: rng.float(0, 6.28)
      });
    }

    built = true;
    return true;
  }

  function update(dt) {
    if (!build()) return false;
    const t = dt;

    // The fire: one light whose intensity breathes, so the whole clearing
    // brightens and dims with it.
    if (fireLight) {
      const f = 0.82 + Math.sin(t * 7.3) * 0.09 + Math.sin(t * 3.1) * 0.06 +
                Math.sin(t * 17.7) * 0.03;
      fireLight.intensity = 2.5 * f;
      fireLight.position.x = 0.18 + Math.sin(t * 5.1) * 0.03;
    }

    for (let i = 0; i < flames.length; i++) {
      const fl = flames[i];
      const s = 1 + Math.sin(t * (6 + i * 1.7) + fl.phase) * 0.14;
      fl.node.scale.set(s, 1 / s * (1 + Math.sin(t * 9 + fl.phase) * 0.1), s);
      fl.node.position.x = Math.sin(t * (4 + i) + fl.phase) * 0.03;
    }

    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.t += e.speed * 0.28;
      if (e.t > 1) { e.t -= 1; e.drift = Math.random() * 6.28; e.x = (Math.random() - 0.5) * 0.6; }
      const life = 1 - e.t;
      e.node.position.set(
        hearth.position.x + e.x + Math.sin(t * 1.3 + e.drift) * 0.22 * e.t,
        0.5 + e.t * 2.6,
        hearth.position.z + Math.sin(t * 0.9 + e.drift) * 0.16 * e.t
      );
      e.node.scale.setScalar(Math.max(0.15, life));
    }

    for (let i = 0; i < flies.length; i++) {
      const fl = flies[i];
      const p = fl.home;
      fl.node.position.set(
        p.x + Math.sin(t * fl.speed + fl.phase) * fl.amp,
        p.y + Math.sin(t * fl.speed * 1.7 + fl.phase * 2) * fl.amp * 0.5,
        p.z + Math.cos(t * fl.speed * 0.8 + fl.phase) * fl.amp
      );
      const blink = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.6 + fl.phase * 3));
      fl.node.scale.setScalar(0.6 + blink * 0.9);
    }

    for (let i = 0; i < trees.length; i++) {
      const tr = trees[i];
      tr.node.rotation.z = Math.sin(t * 0.7 + tr.phase) * tr.amp;
    }

    for (let i = 0; i < flyers.length; i++) {
      const f = flyers[i];
      f.node.position.x += f.speed * dt * 0.6;
      if (f.node.position.x > 15) f.node.position.x = -15;
      if (f.node.position.x < -15) f.node.position.x = 15;
      const flap = Math.sin(t * f.flap + f.phase) * 0.5;
      f.wingL.rotation.z = flap;
      f.wingR.rotation.z = -flap;
    }

    /* The camera breathes rather than sits, and drifts on two slow cycles that
       never line up -- the difference between a diorama and a photograph. */
    camera.position.x = 0.55 + Math.sin(t * 0.13) * 0.22;
    camera.position.y = 1.72 + Math.sin(t * 0.19) * 0.06;
    camera.lookAt(0, 1.02 + Math.sin(t * 0.11) * 0.05, 0);

    return true;
  }

  /* Called by the menu each frame: advance the camp and hand it to the screen
     layer as a pre-pass, so it lands inside the play frame behind the UI. */
  function attach(dt) {
    if (!update(dt)) return false;
    if (DS.UI3 && DS.UI3.addPrePass) DS.UI3.addPrePass(scene, camera);
    return true;
  }

  DS.Camp3D = {
    get scene() { return scene; },
    get camera() { return camera; },
    get ready() { return built; },
    update: update,
    attach: attach,
    build: build
  };
})(window.DS);
