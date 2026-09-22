/* Voxel chibi models for the Three.js layer.

   Every character — the hero, all eleven monsters, both floor bosses and the
   Slime King — is built from a small table of boxes: a big head, a compact
   torso, stubby arms and legs, exactly the "blocky real-world" look of a
   voxel action game. Each model is one THREE.Group with named parts
   (head, torso, armL, armR, legL, legR, extra...) so a per-frame pose
   function can rotate limbs without ever rebuilding geometry.

   The models live in world units (1 unit = 10 world px = 0.1 of the 2D
   renderer's pixels... P2U). A chibi is roughly 1.5 units tall standing,
   scaled per-kind to match the collision box the gameplay code already owns. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const P2U = 0.1;
  const M = DS.M;

  // --- tiny palette (hex strings keep the tables readable) -------------------

  function hex(n) { return n; }
  const C = {
    skin: 0xffd9b0, skinDark: 0xe0b48c,
    hair: 0x4a3728, hairDark: 0x33241a,
    clothDark: 0x2c3e50, cloth: 0x3e5c76, clothLight: 0x5a7d9c,
    leather: 0x7a5230, leatherDark: 0x4e3320,
    metal: 0xa8b0c0, metalDark: 0x5c6474,
    gold: 0xf2c14e, goldDark: 0xb8860b,
    wood: 0x8a6340, woodDark: 0x5c3f2a,
    bone: 0xe8e4dc, boneDark: 0xb8b4ac,
    white: 0xf4f2f8, black: 0x1c1a24,
    red: 0xc0303c, redDark: 0x6e1b28,
    green: 0x5cbf62, greenDark: 0x2f7d4f,
    purple: 0x9b6ec8, purpleDark: 0x5b3a8c,
    teal: 0x4fb3e0, tealDark: 0x2f6fa8,
    orange: 0xe8743b, orangeDark: 0x9b4a1e,
    stone: 0x8d86a0, stoneDark: 0x55506a,
    slime: 0x7fd45e, slimeDark: 0x4a9b3a,
    slimeKing: 0xc86ee0, slimeKingDark: 0x7f45b8,
    spider: 0x3c3550, spiderDark: 0x241f36,
    eye: 0x1a1626, eyeGlow: 0xffe066
  };

  // --- material cache --------------------------------------------------------
  // Few materials, shared by every box: keeps draw state changes low.

  const matCache = {};
  function mat(color, opts) {
    const key = color + '|' + (opts && opts.emissive) + '|' + (opts && opts.opacity);
    if (matCache[key]) return matCache[key];
    /* DoubleSide on every character material: a mirrored model (scale.x = -1,
       which is how left/right facing reads without turning the creature away
       from the camera) has a negative determinant, and with front-face culling
       that renders a solid voxel monster inside out. */
    const m = new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
    if (opts && opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = (opts.emissiveI != null) ? opts.emissiveI : 0.7;
    }
    if (opts && opts.opacity != null) {
      m.transparent = true;
      m.opacity = opts.opacity;
    }
    matCache[key] = m;
    return m;
  }

  function box(sx, sy, sz, color, opts) {
    return new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color, opts));
  }

  // Add a child box positioned relative to its parent's centre.
  function part(parent, sx, sy, sz, x, y, z, color, opts) {
    const m = box(sx, sy, sz, color, opts);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // --- chibi skeleton --------------------------------------------------------
  // Standing proportions, all sizes in world units. Origin at the feet.

  /* head ~40% of height, body ~35%, legs ~25% — the chibi ratio. The head
     pivots at the neck so idle bob and hurt-flinch read on the head. */
  function chibiSkeleton(o) {
    o = o || {};
    const u = o.unit || 1;          // overall scale unit
    const headR = 0.42 * u;
    const bodyW = 0.62 * u, bodyH = 0.52 * u, bodyD = 0.4 * u;
    const legH = 0.34 * u, legW = 0.2 * u, legD = 0.22 * u;
    const armH = 0.4 * u, armW = 0.16 * u, armD = 0.18 * u;

    const root = new THREE.Group();

    const torso = new THREE.Group();
    torso.position.y = legH;
    root.add(torso);

    const body = part(torso, bodyW, bodyH, bodyD, 0, bodyH / 2, 0, o.body);
    // belt/chest detail
    if (o.belt) part(torso, bodyW + 0.03, 0.07 * u, bodyD + 0.03, 0, 0.1 * u, 0, o.belt);
    if (o.chest) part(torso, bodyW + 0.04, bodyH * 0.4, bodyD + 0.04, 0, bodyH * 0.62, 0, o.chest);

    const head = new THREE.Group();
    head.position.y = bodyH;
    torso.add(head);
    const skull = part(head, headR * 2, headR * 1.9, headR * 1.8, 0, headR * 0.95, 0, o.skin);
    // face: eyes AND a mouth on the FRONT of the skull (+z). The camera
    // lives on +z, so features buried at skull-centre depth never show —
    // the eyes poke just past the skull face so they survive any angle.
    if (o.eyes !== false) {
      const eyeY = headR * 1.0, eyeZ = headR * 1.0;
      part(head, 0.07 * u, 0.09 * u, 0.05, -headR * 0.38, eyeY, eyeZ, o.eyeColor || C.eye);
      part(head, 0.07 * u, 0.09 * u, 0.05, headR * 0.38, eyeY, eyeZ, o.eyeColor || C.eye);
      part(head, 0.14 * u, 0.035 * u, 0.05, 0, headR * 0.52, eyeZ, o.mouthColor || '#8a4a42');
    }
    if (o.hair) {
      part(head, headR * 2.08, headR * 0.8, headR * 1.86, 0, headR * 1.62, -0.02 * u, o.hair);
      /* Fringe sits ABOVE the eye line (bottom edge at headR*1.35) — the old
         low fringe box swallowed the eyes whole. */
      part(head, headR * 2.08, headR * 0.55, headR * 0.5, 0, headR * 1.68, headR * 0.8, o.hair);
    }
    if (o.helm) {
      part(head, headR * 2.2, headR * 0.6, headR * 2.0, 0, headR * 1.75, 0, o.helm);
      part(head, 0.1 * u, 0.16 * u, 0.1 * u, 0, headR * 2.2, 0, o.helmAccent || C.gold);
    }

    // Arms hang from the shoulders; pivot at the top so a swing arcs right.
    function limb(x, w, h, d, color, pivotY) {
      const g = new THREE.Group();
      g.position.set(x, pivotY, 0);
      part(g, w, h, d, 0, -h / 2, 0, color);
      torso.add(g);
      return g;
    }
    const armL = limb(-(bodyW / 2 + armW / 2), armW, armH, armD, o.arms, bodyH * 0.86);
    const armR = limb(bodyW / 2 + armW / 2, armW, armH, armD, o.arms, bodyH * 0.86);

    // Legs pivot at the hip.
    const legL = new THREE.Group();
    legL.position.set(-bodyW * 0.24, legH, 0);
    part(legL, legW, legH, legD, 0, -legH / 2, 0, o.legs);
    root.add(legL);
    const legR = new THREE.Group();
    legR.position.set(bodyW * 0.24, legH, 0);
    part(legR, legW, legH, legD, 0, -legH / 2, 0, o.legs);
    root.add(legR);

    return { root, torso, head, skull, body, armL, armR, legL, legR,
             torsoY0: torso.position.y, headY0: head.position.y };
  }

  // --- the hero --------------------------------------------------------------

  /* Paper-doll armour recolours the body; the weapon is a separate model
     attached to the right arm so a swing carries it. */
  function buildHero(info) {
    const armor = info.armor || {};
    const chest = armor.chest, legs = armor.legs, head = armor.head;
    const cloth = (chest && DS.Armor && DS.Armor.MATERIALS[chest.material]) || null;
    const trous = (legs && DS.Armor && DS.Armor.MATERIALS[legs.material]) || null;
    const helmM = (head && DS.Armor && DS.Armor.MATERIALS[head.material]) || null;

    const body = cloth ? (cloth.mid != null ? parseInt(cloth.mid.slice(1), 16) : C.cloth) : C.cloth;
    const pants = trous ? (trous.mid != null ? parseInt(trous.mid.slice(1), 16) : C.leather) : C.leatherDark;
    const helm = helmM ? (helmM.mid != null ? parseInt(helmM.mid.slice(1), 16) : C.metal) : null;

    const s = chibiSkeleton({
      unit: 1, skin: C.skin, body: body, belt: C.leatherDark,
      arms: body, legs: pants, hair: C.hair, helm: helm,
      helmAccent: C.gold
    });

    // Cape behind the torso for silhouette.
    part(s.torso, 0.5, 0.62, 0.1, 0, 0.28, -0.24, C.redDark);

    return s;
  }

  // --- monsters --------------------------------------------------------------

  function buildSlime(info) {
    const s = info.tier === 'colossal' || info.tier === 'miniboss' ? 1 : 1;
    const root = new THREE.Group();
    /* A palette override lets the GOLD slime be the same animal in a different
       set of colours, instead of a second copy of this function. */
    const pal = (info && info.pal) || null;
    const bodyColor = pal ? pal.body : (info.tier === 'elite' ? 0xa3e86b : C.slime);
    const dark = pal ? pal.dark : (info.tier === 'elite' ? 0x4a9b3a : C.slimeDark);
    // A slime: rounded two-slab body, a darker bottom skirt it "sits" on,
    // a nucleus drifting inside (the darker ball reads as goo depth), shine,
    // and a real face — whites + pupils + a wavy mouth.
    const body = part(root, 1.05 * s, 0.55 * s, 0.9 * s, 0, 0.28 * s, 0, bodyColor);
    part(root, 0.85 * s, 0.3 * s, 0.75 * s, 0, 0.62 * s, 0, bodyColor);
    part(root, 1.08 * s, 0.12 * s, 0.94 * s, 0, 0.07 * s, 0, dark);      // skirt
    const nucleus = part(root, 0.3 * s, 0.24 * s, 0.3 * s, 0.12 * s, 0.3 * s, -0.08 * s, dark);
    part(root, 0.3 * s, 0.12 * s, 0.4 * s, -0.2 * s, 0.8 * s, 0.1 * s, 0xffffff, { opacity: 0.5 });
    // Eyes: white sclera with a pupil box offset upward, so they read at any
    // distance instead of two dark slits lost in the green.
    part(root, 0.13, 0.16, 0.03, -0.18, 0.5, 0.455, 0xffffff);
    part(root, 0.13, 0.16, 0.03, 0.18, 0.5, 0.455, 0xffffff);
    part(root, 0.06, 0.09, 0.04, -0.18, 0.53, 0.475, C.eye);
    part(root, 0.06, 0.09, 0.04, 0.18, 0.53, 0.475, C.eye);
    part(root, 0.26, 0.05, 0.03, 0, 0.3, 0.46, dark);
    return { root, torso: root, head: root, body, nucleus, armL: null, armR: null, legL: null, legR: null };
  }

  function buildSlimeKing() {
    const s = buildSlime({ tier: 'miniboss' });
    // Crown: ring of gold boxes.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(s.root, 0.12, 0.22, 0.12, Math.cos(a) * 0.28, 0.92, Math.sin(a) * 0.24 - 0.02, C.gold);
    }
    part(s.root, 0.34, 0.1, 0.3, 0, 0.84, -0.02, C.goldDark);
    return s;
  }

  /* The bonus slime. bonus.js spawns 'goldslime' and there was no builder for
     it, so the one enemy that is a REWARD was the one enemy you could not see
     coming. Same body, gold, with coins stuck in the goo. */
  function buildGoldslime(info) {
    const s = buildSlime({ tier: 'elite', pal: { body: 0xffd76b, dark: 0x8a6a10 } });
    part(s.root, 0.18, 0.05, 0.18, 0.26, 0.34, 0.28, C.gold);
    part(s.root, 0.15, 0.05, 0.15, -0.24, 0.22, 0.30, C.goldDark);
    part(s.root, 0.13, 0.05, 0.13, 0.05, 0.5, 0.4, C.gold);
    return s;
  }

  /* A piranha, spawned by water.js. It is built to be read IN PROFILE — flat
     body, forked tail, fins, jaw — because that is how a fish is seen, and
     because with no builder at all this one was simply invisible: BUILDERS had
     no 'piranha', build() returned null, and the water was full of biting
     nothing. */
  function buildPiranha(info) {
    const root = new THREE.Group();
    const gold = info && info.tier === 'elite';
    const body = gold ? 0x8a6a2a : 0x4a6a78;
    const dark = gold ? 0x5a4418 : 0x2c3f4a;
    const belly = gold ? 0xd8b46a : 0xa8c4cc;

    const core = part(root, 0.46, 0.34, 0.24, 0, 0, 0, body);
    part(root, 0.3, 0.26, 0.2, 0.26, -0.02, 0, body);          // head
    part(root, 0.3, 0.12, 0.2, -0.02, -0.13, 0, belly);        // pale belly
    part(root, 0.1, 0.18, 0.26, 0.0, 0.22, 0, dark);           // dorsal fin

    /* Forked tail on its own pivot: a fish that swims has to swish. */
    const tail = new THREE.Group();
    tail.position.set(-0.26, 0, 0);
    part(tail, 0.14, 0.2, 0.1, -0.08, 0, 0, dark);
    part(tail, 0.18, 0.24, 0.05, -0.22, 0.07, 0, dark);
    part(tail, 0.18, 0.24, 0.05, -0.22, -0.07, 0, dark);
    root.add(tail);

    const finL = part(root, 0.16, 0.05, 0.2, 0.06, -0.04, 0.15, dark);
    const finR = part(root, 0.16, 0.05, 0.2, 0.06, -0.04, -0.15, dark);

    /* Eyes on the sides, because in profile only one of them is ever seen. */
    part(root, 0.07, 0.08, 0.05, 0.3, 0.08, 0.11, C.white);
    part(root, 0.07, 0.08, 0.05, 0.3, 0.08, -0.11, C.white);
    part(root, 0.05, 0.05, 0.04, 0.32, 0.08, 0.13, C.eye);
    part(root, 0.05, 0.05, 0.04, 0.32, 0.08, -0.13, C.eye);

    /* A jaw that drops when it strikes — the tell before the bite. */
    const jaw = part(root, 0.22, 0.09, 0.2, 0.3, -0.11, 0, dark);
    for (let i = 0; i < 3; i++) {
      part(jaw, 0.03, 0.07, 0.03, 0.06 - i * 0.07, 0.06, 0.08, C.white);
      part(jaw, 0.03, 0.07, 0.03, 0.06 - i * 0.07, 0.06, -0.08, C.white);
    }
    return { root, torso: root, head: root, body: core, jaw: jaw, tail: tail,
             finL: finL, finR: finR, armL: null, armR: null, legL: null, legR: null };
  }

  function buildZombie(info) {
    const s = chibiSkeleton({
      unit: 1, skin: 0x7da05a, body: 0x4a5a3a, belt: 0x3a3020,
      arms: 0x7da05a, legs: 0x3a4030, hair: 0x2c3220,
      eyeColor: C.eyeGlow, mouthColor: 0x2c1f1a
    });
    // Torn shirt patch + exposed rib + shamble pose: arms held out front,
    // shoulders hunched forward so the silhouette is a shambler, not a guy.
    part(s.torso, 0.2, 0.16, 0.05, 0.14, 0.3, 0.21, 0x33402a);
    part(s.torso, 0.3, 0.06, 0.04, -0.05, 0.42, 0.21, C.bone);   // torn rib peek
    s.armsForward = true;
    s.torso.rotation.x = 0.12;
    // One arm longer than the other — classic lurch.
    s.armR.scale.y = 1.15;
    // Rot patches on the skin.
    part(s.armL, 0.17, 0.1, 0.19, 0, -0.24, 0, 0x5a7a44);
    part(s.head, 0.12, 0.12, 0.04, 0.1, 0.3, 0.4, 0x5a7a44);
    return s;
  }

  function buildSkeleton() {
    const s = chibiSkeleton({
      unit: 0.96, skin: C.bone, body: C.bone, belt: C.boneDark,
      arms: C.bone, legs: C.boneDark, hair: null,
      eyeColor: 0x7fe8ff
    });
    // Rib lines + a small bow in the left hand.
    part(s.torso, 0.4, 0.05, 0.05, 0, 0.3, 0.21, C.boneDark);
    part(s.torso, 0.4, 0.05, 0.05, 0, 0.2, 0.21, C.boneDark);
    const bow = new THREE.Group();
    bow.position.set(-0.42, 0.4, 0.1);
    part(bow, 0.05, 0.5, 0.05, 0, 0, 0, C.wood);
    part(bow, 0.03, 0.5, 0.03, 0.06, 0, 0, C.boneDark);
    s.armL.add(bow);
    return s;
  }

  function buildBat() {
    const root = new THREE.Group();
    const body = part(root, 0.42, 0.38, 0.4, 0, 0, 0, 0x514c72);
    part(root, 0.3, 0.24, 0.34, 0, -0.1, 0.06, 0x615a8a);   // lighter chest
    const earL = part(root, 0.1, 0.18, 0.08, -0.13, 0.26, 0, 0x514c72);
    earL.rotation.z = 0.2;
    const earR = part(root, 0.1, 0.18, 0.08, 0.13, 0.26, 0, 0x514c72);
    earR.rotation.z = -0.2;
    // Inner ears read better than flat slabs.
    part(root, 0.05, 0.1, 0.05, -0.13, 0.26, 0.03, 0x8a7fae);
    part(root, 0.05, 0.1, 0.05, 0.13, 0.26, 0.03, 0x8a7fae);
    // Face: muzzle + fangs + big red eyes on the front plane.
    part(root, 0.18, 0.12, 0.1, 0, -0.02, 0.22, 0x615a8a);   // muzzle
    part(root, 0.04, 0.06, 0.03, -0.08, 0.08, 0.2, C.red);
    part(root, 0.04, 0.06, 0.03, 0.08, 0.08, 0.2, C.red);
    part(root, 0.03, 0.05, 0.03, -0.04, -0.09, 0.26, 0xffffff); // fangs
    part(root, 0.03, 0.05, 0.03, 0.04, -0.09, 0.26, 0xffffff);
    // Jointed wings: inner lead segment + outer membrane, both pivoted so
    // the flap ripples outward instead of one slab wobbling.
    function wing(side) {
      const inner = new THREE.Group();
      inner.position.set(side * 0.2, 0.02, 0);
      part(inner, 0.34, 0.2, 0.04, side * 0.17, 0.02, 0, 0x3c3550);
      const outer = new THREE.Group();
      outer.position.set(side * 0.34, 0.02, 0);
      part(outer, 0.4, 0.14, 0.03, side * 0.2, -0.05, 0, 0x4c4468);
      part(outer, 0.03, 0.2, 0.03, side * 0.38, 0, 0, 0x2c2440);  // claw tip
      inner.add(outer);
      root.add(inner);
      return [inner, outer];
    }
    const L = wing(-1), Rr = wing(1);
    return { root, torso: root, head: root, body,
             wingL: L[0], wingR: Rr[0], wingL2: L[1], wingR2: Rr[1],
             armL: null, armR: null, legL: null, legR: null };
  }

  /* The spider's silk. In 2D this was a `drawExtra` line drawn from the enemy
     to its hang point, which vanished the moment voxels took over. It is a
     mesh here, shown only while the spider is actually hanging. */
  function buildSpiderThread(model) {
    const threadMat = mat(0xe8e4dc, { opacity: 0.45 });
    const thread = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), threadMat);
    thread.position.set(0, 0, 0);
    thread.visible = false;
    thread.frustumCulled = false;
    model.root.add(thread);
    model.thread = thread;
    return model;
  }

  function buildSpider() {
    const root = new THREE.Group();
    part(root, 0.7, 0.34, 0.8, 0, 0.3, -0.1, C.spider);      // abdomen
    part(root, 0.42, 0.3, 0.4, 0, 0.32, 0.34, C.spiderDark); // head
    part(root, 0.3, 0.16, 0.2, 0, 0.5, -0.12, C.spiderDark); // hump
    part(root, 0.07, 0.07, 0.03, -0.1, 0.36, 0.55, C.red);
    part(root, 0.07, 0.07, 0.03, 0.1, 0.36, 0.55, C.red);
    const legs = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Group();
        leg.position.set(side * 0.2, 0.3, 0.22 - i * 0.26);
        const upper = part(leg, 0.3, 0.06, 0.06, side * 0.16, 0.06, 0, C.spiderDark);
        const lower = part(leg, 0.28, 0.05, 0.05, side * 0.3, -0.08, 0, C.spider);
        lower.rotation.z = side * 0.7;
        root.add(leg);
        legs.push(leg);
      }
    }
    return buildSpiderThread({ root, torso: root, head: root, legs,
                               armL: null, armR: null, legL: null, legR: null });
  }

  function buildSpitter() {
    const s = chibiSkeleton({
      unit: 1.05, skin: 0x5cbf62, body: 0x4a9b3a, belt: 0x2f7d4f,
      arms: 0x5cbf62, legs: 0x2f7d4f, hair: 0x3a8a4a,
      eyeColor: 0xffe066
    });
    // A wide open mouth-box in place of the lower face when attacking.
    s.mouth = part(s.head, 0.3, 0.12, 0.08, 0, 0.32, 0.42, 0xc0303c);
    s.mouth.visible = false;
    return s;
  }

  function buildBomber() {
    const s = chibiSkeleton({
      unit: 0.95, skin: 0x4a4458, body: 0x3c3550, belt: C.leatherDark,
      arms: 0x4a4458, legs: 0x2c2838, hair: 0x241f36,
      eyeColor: 0xffe066
    });
    // The bomb it carries: a dark sphere-ish cube with a lit fuse.
    const bomb = new THREE.Group();
    bomb.position.set(0, -0.32, 0.12);
    part(bomb, 0.3, 0.3, 0.3, 0, 0, 0, C.black);
    part(bomb, 0.08, 0.14, 0.08, 0, 0.2, 0, C.woodDark);
    part(bomb, 0.06, 0.08, 0.06, 0, 0.3, 0, 0xffe066, { emissive: 0xff9e38 });
    s.armR.add(bomb);
    s.bomb = bomb;
    /* Fuse sparks, hidden until the wind-up: the 2D swell-and-glow was the
       only warning this thing gives. */
    const spark = new THREE.Group();
    part(spark, 0.14, 0.14, 0.14, 0, 0, 0, 0xffe066, { emissive: 0xff9e38, emissiveI: 1.2 });
    part(spark, 0.3, 0.3, 0.02, 0, 0, 0, 0xe8743b, { emissive: 0xe8743b, emissiveI: 1, opacity: 0.5 });
    spark.position.set(0, 0.36, 0);
    spark.visible = false;
    bomb.add(spark);
    s.fuseSpark = spark;
    return s;
  }

  function buildShielder() {
    const s = chibiSkeleton({
      unit: 1.08, skin: C.skin, body: C.metal, belt: C.metalDark,
      arms: C.metal, legs: C.metalDark, helm: C.metal,
      helmAccent: C.red, eyeColor: C.eye
    });
    // Tower shield on the left arm, facing forward.
    const shield = new THREE.Group();
    shield.position.set(-0.36, -0.05, 0.18);
    part(shield, 0.12, 0.62, 0.55, 0, 0, 0, C.metal);
    part(shield, 0.14, 0.5, 0.1, 0, 0, 0.25, C.metalDark);
    s.armL.add(shield);
    s.shield = shield;
    // A rim that lights while the guard is up, so "braced" is legible at a glance.
    const rim = part(shield, 0.16, 0.66, 0.06, 0, 0, 0.3, 0xa8e4ff,
                     { emissive: 0xa8e4ff, emissiveI: 1 });
    rim.visible = false;
    s.shieldRim = rim;
    return s;
  }

  function buildWraith() {
    const root = new THREE.Group();
    const clothM = mat(0x514c72, { opacity: 0.78 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.42), clothM);
    body.position.y = 0.75;
    root.add(body);
    // hood
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.45, 0.5), clothM);
    hood.position.y = 1.28;
    root.add(hood);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.05),
      mat(C.black, { opacity: 0.9 }));
    face.position.set(0, 1.26, 0.26);
    root.add(face);
    part(root, 0.06, 0.06, 0.02, -0.07, 1.26, 0.29, 0x7fe8ff, { emissive: 0x7fe8ff, emissiveI: 1 });
    part(root, 0.06, 0.06, 0.02, 0.07, 1.26, 0.29, 0x7fe8ff, { emissive: 0x7fe8ff, emissiveI: 1 });
    // tail tapers into nothing
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.24),
      mat(0x514c72, { opacity: 0.4 }));
    tail.position.y = 0.18;
    root.add(tail);
    const armL = new THREE.Group(); armL.position.set(-0.34, 1.1, 0);
    part(armL, 0.12, 0.42, 0.14, 0, -0.2, 0, clothM);
    root.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.34, 1.1, 0);
    part(armR, 0.12, 0.42, 0.14, 0, -0.2, 0, clothM);
    root.add(armR);
    return { root, torso: root, head: root, armL, armR, legL: null, legR: null };
  }

  function buildNecromancer() {
    const s = chibiSkeleton({
      unit: 1.02, skin: 0xc8bce0, body: C.purpleDark, belt: C.goldDark,
      arms: C.purpleDark, legs: C.purpleDark, hair: null,
      eyeColor: 0xc86ee0
    });
    // tall hat + staff with an orb
    part(s.head, 0.42, 0.55, 0.36, 0, 1.15, -0.04, C.purpleDark);
    part(s.head, 0.55, 0.08, 0.46, 0, 0.9, -0.04, C.purple);
    const staff = new THREE.Group();
    staff.position.set(-0.44, -0.3, 0.1);
    part(staff, 0.06, 0.85, 0.06, 0, 0.25, 0, C.woodDark);
    part(staff, 0.16, 0.16, 0.16, 0, 0.72, 0, 0xc86ee0, { emissive: 0x9b6ec8 });
    s.armL.add(staff);
    /* The ritual circle: a flat ring of runes at the feet, drawn 2D before
       this and therefore invisible in the whole 3D build. */
    const ring = new THREE.Group();
    const runeMat = mat(0xc86ee0, { emissive: 0x9b6ec8, emissiveI: 1, opacity: 0.85 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.26), runeMat);
      r.position.set(Math.sin(a) * 0.75, 0.04, Math.cos(a) * 0.75);
      r.rotation.y = a;
      ring.add(r);
    }
    ring.visible = false;
    ring.frustumCulled = false;
    s.root.add(ring);
    s.ritualRing = ring;
    return s;
  }

  function buildGolem(info) {
    const scale = 1.45;
    const s = chibiSkeleton({
      unit: scale, skin: C.stone, body: C.stoneDark, belt: C.stoneDark,
      arms: C.stone, legs: C.stoneDark, hair: null, eyes: false
    });
    // Glowing seams + heavy fists.
    part(s.torso, 0.1, 0.3, 0.03, 0, 0.28, 0.22, 0xff9e38, { emissive: 0xe8743b });
    part(s.torso, 0.3, 0.1, 0.03, 0, 0.14, 0.22, 0xff9e38, { emissive: 0xe8743b });
    part(s.armL, 0.3, 0.3, 0.3, 0, -0.62, 0, C.stoneDark);
    part(s.armR, 0.3, 0.3, 0.3, 0, -0.62, 0, C.stoneDark);
    part(s.head, 0.06, 0.1, 0.03, -0.14, 0.45, 0.42, 0xffe066, { emissive: 0xffe066 });
    part(s.head, 0.06, 0.1, 0.03, 0.14, 0.45, 0.42, 0xffe066, { emissive: 0xffe066 });
    /* Extra cracks that only open up during its wind-up (2D-only glow before). */
    const cracks = new THREE.Group();
    part(cracks, 0.12, 0.44, 0.05, -0.17, 0.2, 0.2, 0xff9e38, { emissive: 0xe8743b, emissiveI: 1.2 });
    part(cracks, 0.44, 0.12, 0.05, 0.05, 0.02, 0.2, 0xff9e38, { emissive: 0xe8743b, emissiveI: 1.2 });
    part(cracks, 0.12, 0.34, 0.05, 0.2, 0.34, 0.2, 0xff9e38, { emissive: 0xe8743b, emissiveI: 1.2 });
    cracks.visible = false;
    s.root.add(cracks);
    s.windCracks = cracks;
    return s;
  }

  function buildWarden() {
    // The Stone Warden: a golem one step bigger, with shoulder slabs.
    const s = buildGolem({});
    const u = 1.45;
    part(s.torso, 0.34 * u, 0.2 * u, 0.4 * u, -0.44 * u, 0.52 * u, 0, C.stoneDark);
    part(s.torso, 0.34 * u, 0.2 * u, 0.4 * u, 0.44 * u, 0.52 * u, 0, C.stoneDark);
    part(s.head, 0.5, 0.12, 0.5, 0, 0.62, 0, C.goldDark);
    return s;
  }

  function buildArbiter() {
    const s = buildNecromancer();
    // Golden trim so he reads apart from a common necromancer.
    part(s.torso, 0.66, 0.08, 0.44, 0, 0.5, 0, C.goldDark);
    part(s.head, 0.46, 0.6, 0.4, 0, 1.2, -0.04, 0x7f5a20);
    return s;
  }

  // --- NPCs & props ----------------------------------------------------------

  function buildMerchant() {
    const s = chibiSkeleton({
      unit: 1, skin: C.skin, body: 0x3f6a4e, belt: C.goldDark,
      arms: 0x3f6a4e, legs: C.leatherDark, hair: 0x2c3220,
      eyeColor: C.eye
    });
    // Hood + a coin purse on the belt so he reads as a trader.
    part(s.head, 0.5, 0.3, 0.44, 0, 0.75, -0.04, 0x3f6a4e);
    part(s.torso, 0.2, 0.16, 0.16, 0.2, 0.12, 0.1, C.gold);
    return s;
  }

  function buildTable() {
    const root = new THREE.Group();
    part(root, 1.1, 0.1, 0.7, 0, 0.62, 0, C.wood);          // top
    part(root, 1.0, 0.05, 0.62, 0, 0.55, 0, C.woodDark);    // apron
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        part(root, 0.1, 0.55, 0.1, sx * 0.45, 0.28, sz * 0.25, C.woodDark);
      }
    }
    // The enchant tome, glowing faintly.
    part(root, 0.3, 0.06, 0.24, 0.1, 0.7, 0.05, C.purple, { emissive: 0x9b6ec8, emissiveI: 0.5 });
    return { root, torso: root, head: root, armL: null, armR: null, legL: null, legR: null, height: 0.72 };
  }

  function buildShrine() {
    const root = new THREE.Group();
    part(root, 0.9, 0.14, 0.9, 0, 0.07, 0, C.stoneDark);    // base plinth
    part(root, 0.5, 1.0, 0.5, 0, 0.62, 0, C.stone);         // obelisk
    part(root, 0.36, 0.3, 0.36, 0, 1.25, 0, C.stoneDark);   // cap
    const rune = part(root, 0.22, 0.22, 0.22, 0, 1.75, 0, 0xa8e4ff,
                      { emissive: 0x4fb3e0, emissiveI: 1 });
    part(root, 0.55, 0.06, 0.55, 0, 0.16, 0, 0x4fb3e0, { emissive: 0x4fb3e0, emissiveI: 0.4, opacity: 0.5 });
    return { root, torso: root, head: root, rune, armL: null, armR: null, legL: null, legR: null, height: 1.9 };
  }

  /* Chests: one silhouette per tier, so what is inside reads from across the
     room. Origin at the BOTTOM CENTRE of the box — the same convention as the
     crates and the shrine — so the renderer can drop one straight onto the
     floor line without a magic offset. The lid lives in its own hinge group at
     the back edge; the renderer swings it open by rotating that group. */
  function buildChest(info) {
    const tier = (info && info.tier) || 'wood';
    const root = new THREE.Group();

    let bodyCol = 0x6b4726, trimCol = C.gold, bandCol = 0x442c18;
    let glow = null, glowI = 0;
    if (tier === 'iron') { bodyCol = 0x596074; trimCol = C.metal; bandCol = C.metalDark; }
    else if (tier === 'cursed') {
      bodyCol = 0x33254a; trimCol = C.purple; bandCol = 0x1d1430;
      glow = C.purple; glowI = 0.55;
    } else if (tier === 'vault') {
      bodyCol = 0x7a5716; trimCol = C.gold; bandCol = C.goldDark;
      glow = 0xffe066; glowI = 0.45;
    }

    const W = 1.34, D = 0.9, baseH = 0.6, lidH = 0.42;
    const bands = tier === 'vault' ? 3 : 2;

    // --- the box ---
    part(root, W, baseH, D, 0, baseH / 2, 0, bodyCol,
         glow ? { emissive: glow, emissiveI: glowI * 0.3 } : null);
    for (let i = -1; i <= 1; i++) {
      part(root, W + 0.015, 0.03, D + 0.015, 0, baseH * 0.5 + i * 0.17, 0, bandCol);
    }
    for (let i = 0; i < bands; i++) {
      const bx = (i - (bands - 1) / 2) * (W / (bands + 0.45));
      part(root, 0.1, baseH + 0.02, D + 0.035, bx, baseH / 2, 0, trimCol,
           glow ? { emissive: glow, emissiveI: glowI } : null);
      // Rivets on the front face of each band.
      part(root, 0.045, 0.045, 0.03, bx, baseH * 0.24, D * 0.5 + 0.03, bandCol);
      part(root, 0.045, 0.045, 0.03, bx, baseH * 0.78, D * 0.5 + 0.03, bandCol);
    }
    // Lock plate, hasp and keyhole on the face the player looks at (+z).
    part(root, 0.22, 0.26, 0.06, 0, baseH * 0.58, D * 0.5 + 0.01, C.metalDark);
    part(root, 0.1, 0.1, 0.05, 0, baseH * 0.58, D * 0.5 + 0.05, trimCol,
         glow ? { emissive: glow, emissiveI: glowI } : null);
    part(root, 0.05, 0.09, 0.05, 0, baseH * 0.46, D * 0.5 + 0.05, C.black);
    if (tier === 'iron') {
      // A padlock hanging off the plate: this is the chest that arrives locked.
      part(root, 0.15, 0.15, 0.11, 0, baseH * 0.33, D * 0.5 + 0.07, C.metalDark);
      part(root, 0.08, 0.09, 0.05, 0, baseH * 0.42, D * 0.5 + 0.07, C.black);
      part(root, 0.06, 0.08, 0.05, 0, baseH * 0.24, D * 0.5 + 0.1, C.metal);
    }
    // Feet, so the box is not a slab balancing on its edge.
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        part(root, 0.14, 0.06, 0.14, sx * (W / 2 - 0.12), 0.03, sz * (D / 2 - 0.12), bandCol);
      }
    }

    // --- the treasure, so an opened chest is not an empty hole ---
    const pile = new THREE.Group();
    pile.position.y = baseH - 0.06;
    for (let i = 0; i < 5; i++) {
      part(pile, 0.2, 0.06, 0.2, (i % 3 - 1) * 0.26, i * 0.035, (i % 2 - 0.5) * 0.3, C.gold);
    }
    root.add(pile);

    // --- the lid, hinged at the back edge ---
    const lid = new THREE.Group();
    lid.position.set(0, baseH, -D / 2);
    part(lid, W + 0.05, lidH, D + 0.02, 0, lidH / 2, D / 2, bodyCol,
         glow ? { emissive: glow, emissiveI: glowI * 0.3 } : null);
    for (let i = 0; i < bands; i++) {
      const bx = (i - (bands - 1) / 2) * (W / (bands + 0.45));
      part(lid, 0.1, lidH + 0.03, D + 0.045, bx, lidH / 2, D / 2, trimCol,
           glow ? { emissive: glow, emissiveI: glowI } : null);
    }
    part(lid, W + 0.06, 0.04, D + 0.05, 0, lidH + 0.01, D / 2, bandCol);

    if (tier === 'cursed') {
      // A skull on the lid: the chest that bites back.
      part(lid, 0.26, 0.22, 0.1, 0, lidH * 0.6, D * 0.5 + 0.06, C.bone);
      part(lid, 0.06, 0.06, 0.05, -0.06, lidH * 0.62, D * 0.5 + 0.12, C.purple,
           { emissive: C.purple, emissiveI: 1 });
      part(lid, 0.06, 0.06, 0.05, 0.06, lidH * 0.62, D * 0.5 + 0.12, C.purple,
           { emissive: C.purple, emissiveI: 1 });
      part(lid, 0.04, 0.06, 0.06, 0, lidH * 0.42, D * 0.5 + 0.1, C.boneDark);
    } else if (tier === 'vault') {
      // Crown gem + gold trim: the floor-boss reward.
      part(lid, 0.24, 0.24, 0.14, 0, lidH + 0.1, D * 0.5 + 0.05, 0xa8e4ff,
           { emissive: 0x4fb3e0, emissiveI: 1 });
      part(lid, 0.1, 0.1, 0.16, -0.28, lidH + 0.02, D * 0.5 + 0.02, C.gold);
      part(lid, 0.1, 0.1, 0.16, 0.28, lidH + 0.02, D * 0.5 + 0.02, C.gold);
    } else if (tier === 'wood') {
      // Rope straps: cheap, and they say "wooden" instantly.
      part(lid, 0.09, lidH + 0.04, D + 0.05, -0.42, lidH / 2, D / 2, C.leatherDark);
      part(lid, 0.09, lidH + 0.04, D + 0.05, 0.42, lidH / 2, D / 2, C.leatherDark);
    }

    root.add(lid);
    return { root, lid, height: baseH + lidH, torso: root, head: root,
             armL: null, armR: null, legL: null, legR: null };
  }

  // --- registry --------------------------------------------------------------

  const BUILDERS = {
    hero: buildHero,
    chest: buildChest,
    merchant: buildMerchant,
    table: buildTable,
    shrine: buildShrine,
    slime: buildSlime,
    slimeking: buildSlimeKing,
    zombie: buildZombie,
    skeleton: buildSkeleton,
    bat: buildBat,
    spider: buildSpider,
    spitter: buildSpitter,
    bomber: buildBomber,
    shielder: buildShielder,
    wraith: buildWraith,
    necromancer: buildNecromancer,
    golem: buildGolem,
    warden: buildWarden,
    arbiter: buildArbiter,
    piranha: buildPiranha,
    goldslime: buildGoldslime
  };

  /* Height of each kind standing, in world units — the pose code normalises
     against it, and the renderer scales the model to the entity's box. */
  const HEIGHT = {
    hero: 1.28, slime: 0.9, slimeking: 2.1, zombie: 1.25, skeleton: 1.2,
    bat: 0.8, spider: 0.75, spitter: 1.3, bomber: 1.2, shielder: 1.35,
    wraith: 1.55, necromancer: 1.55, golem: 1.9, warden: 2.8, arbiter: 2.3,
    merchant: 1.28, table: 0.72, shrine: 1.9, chest: 1.02,
    piranha: 0.62, goldslime: 0.9
  };

  // kindForEntity maps any game entity onto a builder key.
  function keyFor(e) {
    if (e.isBoss) {
      if (e.bossKey === 'arbiter') return 'arbiter';
      if (e.bossKey === 'warden') return 'warden';
      return 'slimeking';
    }
    if (e.kind === 'boss') return 'slimeking';
    if (e.voxKind) return e.voxKind;         // props set this directly
    return e.kind || 'slime';
  }

  /* Any entity kind WITHOUT a builder used to vanish silently: build() returned
     null and the renderer drew nothing. Two live enemies were in exactly that
     state (piranha, goldslime), so an unknown kind now falls back to the slime
     silhouette and says so once, which turns a missing monster into a nudge to
     write its builder. */
  function build(kind, info) {
    let key = kind;
    if (!BUILDERS[key]) {
      if (key && !warnedKinds[key]) {
        warnedKinds[key] = true;
        console.warn('[DS] no 3D model for enemy kind "' + key + '" — using a slime placeholder');
      }
      key = 'slime';
    }
    const model = BUILDERS[key](info || {});
    model.kind = key;
    model.height = HEIGHT[key] || 1.2;
    return model;
  }

  const warnedKinds = {};

  // --- posing ----------------------------------------------------------------

  /* One pose per frame. Everything reads off the entity's own state so the
     animation is a function, not a timeline to maintain:
       walk cycle from vx / speed, idle bob, attack wind-up, hurt flinch,
     plus per-kind extras (wings flap, spider legs ripple, bomber fuse
     sparkles, wraith hovers). */
  function pose(model, e, time) {
    const p = model;
    const walk = Math.abs(e.vx || 0);
    const cyc = time * 9 + (e.x || 0) * 0.05;
    const swing = Math.sin(cyc) * Math.min(1, walk * 0.5);
    const bob = Math.sin(time * 2.2 + (e.x || 0) * 0.03) * 0.02;

    const wind = e.attackState === 'wind'
      ? 1 - (e.attackTimer || 0) / Math.max(1, e.cfg && e.cfg.wind || 20) : 0;
    const strike = e.attackState === 'strike';

    if (p.legL) {
      p.legL.rotation.x = swing * 0.55;
      p.legR.rotation.x = -swing * 0.55;
    }
    // Restore the builder's hip height instead of zeroing it — clobbering
    // this every frame sank the whole body onto the legs (the "blob" look).
    if (p.torso && p.torsoY0 != null) {
      p.torso.position.y = p.torsoY0 + bob;
    }
    /* --- the tells that used to be 2D-only -------------------------------

       Benang laba-laba, bengkak bom, perisai terangkat, lingkaran ritual, dan
       retakan golem semuanya digambar oleh `drawExtra` di dalam jalur gambar 2D
       musuh — yang di-skip begitu model voxel aktif. Jadi monster ini kehilangan
       satu-satunya petunjuk serangannya. Semuanya hidup kembali di sini, dibaca
       dari state entitas yang sama. */
    if (p.thread) {
      const ce = e.ceiling != null ? e.ceiling : (e.y - 40);
      /* Pixels to model units: 0.1 world units per pixel, divided by the scale
         the renderer puts on the root (actorScale), because the thread is a
         child of that root. */
      const unit = 0.1 / ((e.sizeScale || 1) * 0.95);
      const topY = ((e.y + e.h * 0.5) - ce) * unit;
      p.thread.visible = !!e.hanging;
      if (p.thread.visible) {
        p.thread.position.y = topY * 0.5;
        p.thread.scale.y = Math.max(0.1, topY);
      }
    }
    if (p.jaw) {
      // A piranha's bite: the jaw drops through the wind-up and snaps shut.
      const open = strike ? 1 : wind * 0.8;
      p.jaw.position.y = -0.11 - open * 0.1;
      p.jaw.rotation.x = open * 0.35;
      p.tail.rotation.y = Math.sin(cyc * 1.3) * 0.35 * Math.min(1, 0.3 + walk);
      if (p.finL) p.finL.rotation.z = Math.sin(cyc * 1.7) * 0.25;
      if (p.finR) p.finR.rotation.z = -Math.sin(cyc * 1.7) * 0.25;
    }
    if (p.fuseSpark) {
      p.fuseSpark.visible = wind > 0 || strike;
      if (p.fuseSpark.visible) {
        p.fuseSpark.rotation.y = time * 9;
        p.fuseSpark.scale.setScalar(0.7 + wind * 0.6);
      }
    }
    if (p.shieldRim) p.shieldRim.visible = !!e.shieldUp;
    if (p.ritualRing) {
      const casting = wind > 0 || strike;
      p.ritualRing.visible = casting;
      if (casting) {
        p.ritualRing.rotation.y = time * 2.2;
        const grow = strike ? 1.25 : 0.6 + wind * 0.5;
        p.ritualRing.scale.setScalar(grow);
      }
    }
    if (p.windCracks) p.windCracks.visible = wind > 0 || strike;

    if (p.body && model.kind === 'slime' || model.kind === 'slimeking' || model.kind === 'goldslime') {
      const squash = 1 + Math.sin(time * 6 + (e.x || 0)) * 0.06;
      p.body.scale.y = squash;
      p.body.scale.x = 2 - squash;
      // The nucleus drifts slowly inside like a heart of goo.
      if (p.nucleus) {
        p.nucleus.position.x = 0.12 + Math.sin(time * 1.7) * 0.08;
        p.nucleus.position.y = 0.3 + Math.sin(time * 2.3) * 0.05;
      }
    }

    if (p.head && p.head !== p.root) {
      p.head.rotation.z = e.hurtFlash > 0 ? Math.sin(time * 40) * 0.12 : 0;
      p.head.position.y = (p.headY0 != null ? p.headY0 : p.head.position.y) + bob;
    }

    if (p.armL && p.armR) {
      if (strike) {
        p.armR.rotation.x = -1.9;
        p.armL.rotation.x = 0.5;
      } else if (wind > 0) {
        p.armR.rotation.x = 0.9 * wind;
        p.armL.rotation.x = 0.3 * wind;
      } else if (p.armsForward) {
        // Zombies shamble arms-out; the walk only rocks the pose slightly.
        p.armR.rotation.x = -1.5 + swing * 0.1;
        p.armL.rotation.x = -1.3 - swing * 0.1;
      } else {
        p.armR.rotation.x = -swing * 0.8;
        p.armL.rotation.x = swing * 0.8;
      }
    }

    if (p.wingL && p.wingR) {
      const flap = Math.sin(time * 14) * 0.6;
      p.wingL.rotation.z = flap;
      p.wingR.rotation.z = -flap;
      // Jointed wings: the outer membrane trails the inner lead edge.
      if (p.wingL2) { p.wingL2.rotation.z = flap * 0.7; }
      if (p.wingR2) { p.wingR2.rotation.z = -flap * 0.7; }
    }

    if (p.legs) {
      for (let i = 0; i < p.legs.length; i++) {
        p.legs[i].rotation.z = Math.sin(time * 10 + i * 1.4) * 0.16 *
          Math.min(1, walk * 2 + 0.2);
      }
    }

    if (p.mouth) p.mouth.visible = !!strike || wind > 0.6;

    if (p.bomb) {
      const fuse = wind > 0 ? 1 + wind : 1;
      p.bomb.scale.setScalar(fuse);
    }

    if (p.shield) {
      p.shield.rotation.y = e.shieldUp ? 0 : 0.7;
    }
  }

  // --- weapons ---------------------------------------------------------------
  // Held in the hero's right hand; swapped when the loadout changes.

  /* Weapon models. Every blade is a tapering stack of boxes (wide at the
     base, narrow at the tip) instead of one flat plank, with a proper
     crossguard, wrapped grip and pommel. Axe/spear heads are assembled from
     boxes with edge highlights; the bow gets recurve limbs and a real string;
     the staff gets a shaft collar, floating crystal and orbiting shards.
     The rarity tint colours the working metal/head so loot reads on the back
     of the hero. */
  function buildWeapon(type, rarityColor) {
    const g = new THREE.Group();
    const tint = tintFromCss(rarityColor);

    // A blade that tapers: base, mid, tip, each narrower than the last.
    function blade(h, w, color, opts) {
      part(g, w, h * 0.45, 0.055, 0, h * 0.225, 0, color, opts);
      part(g, w * 0.78, h * 0.33, 0.05, 0, h * 0.45 + h * 0.165, 0, color, opts);
      part(g, w * 0.5, h * 0.22, 0.045, 0, h * 0.78 + h * 0.11, 0, color, opts);
      // Fuller (the dark groove) and an edge highlight along the front.
      part(g, w * 0.16, h * 0.72, 0.02, 0, h * 0.42, 0.03, C.metalDark);
      part(g, w * 0.92, 0.018, 0.06, 0, h * 0.3, 0.032, C.white, { opacity: 0.5 });
    }
    // Leather-wrapped grip: alternating wrap rings.
    function grip(len, w) {
      part(g, w, len * 0.4, w, 0, -len * 0.3, 0, C.leatherDark);
      part(g, w * 1.12, len * 0.18, w * 1.12, 0, -len * 0.42, 0, C.leather);
      part(g, w * 1.12, len * 0.18, w * 1.12, 0, -len * 0.22, 0, C.leather);
    }
    function pommel(w) {
      part(g, w, w * 0.7, w, 0, -0.16, 0, C.gold);
      part(g, w * 0.6, 0.04, w * 0.6, 0, -0.2, 0, C.goldDark);
    }

    switch (type) {
      case 'sword': {
        blade(0.78, 0.14, tint || C.metal);
        // Crossguard: bar + two end caps, then grip and pommel.
        part(g, 0.3, 0.05, 0.09, 0, 0.0, 0, C.gold);
        part(g, 0.05, 0.09, 0.1, -0.15, -0.02, 0, C.goldDark);
        part(g, 0.05, 0.09, 0.1, 0.15, -0.02, 0, C.goldDark);
        grip(0.24, 0.07);
        pommel(0.09);
        break;
      }
      case 'dagger': {
        blade(0.42, 0.11, tint || C.metal);
        part(g, 0.19, 0.045, 0.08, 0, 0.0, 0, C.gold);
        grip(0.16, 0.06);
        pommel(0.07);
        break;
      }
      case 'greataxe': {
        // Haft: tapered two-segment pole with a wrapped grip end.
        part(g, 0.075, 0.62, 0.075, 0, 0.31, 0, C.wood);
        part(g, 0.065, 0.55, 0.065, 0, 0.88, 0, C.woodDark);
        grip(0.22, 0.075);
        pommel(0.09);
        part(g, 0.05, 0.07, 0.05, 0, 1.19, 0, C.metalDark);    // haft top cap
        // Head: a crescent blade attached at the haft top, bulging outward
        // in a "C" — the classic battle-axe read.
        const head = tint || C.metal;
        part(g, 0.12, 0.14, 0.06, 0.09, 1.08, 0, head);        // top attach
        part(g, 0.2, 0.16, 0.058, 0.19, 0.99, 0, head);        // upper curve
        part(g, 0.26, 0.2, 0.055, 0.28, 0.86, 0, head);        // belly (widest)
        part(g, 0.2, 0.16, 0.058, 0.21, 0.72, 0, head);        // lower curve
        part(g, 0.12, 0.14, 0.06, 0.1, 0.62, 0, head);         // bottom attach
        // Bright outer rim following the belly edge.
        part(g, 0.05, 0.16, 0.06, 0.42, 0.98, 0, C.white, { opacity: 0.6 });
        part(g, 0.05, 0.2, 0.06, 0.43, 0.86, 0, C.white, { opacity: 0.65 });
        part(g, 0.05, 0.16, 0.06, 0.42, 0.72, 0, C.white, { opacity: 0.6 });
        // Socket collar binding head to haft + a stout back spike.
        part(g, 0.12, 0.52, 0.1, 0.02, 0.9, 0, C.metalDark);
        part(g, 0.09, 0.18, 0.075, -0.1, 1.0, 0, head);
        part(g, 0.06, 0.1, 0.055, -0.17, 1.0, 0, C.metalDark);
        break;
      }
      case 'spear': {
        // Long tapered shaft, wrapped mid-grip, tasselled collar below the tip.
        part(g, 0.055, 0.7, 0.055, 0, 0.35, 0, C.wood);
        part(g, 0.05, 0.62, 0.05, 0, 1.0, 0, C.woodDark);
        part(g, 0.065, 0.12, 0.065, 0, 0.52, 0, C.leather);
        // Leaf-shaped head: base, mid, and a bright needle point.
        const head = tint || C.metal;
        part(g, 0.12, 0.2, 0.045, 0, 1.36, 0, head);
        part(g, 0.08, 0.18, 0.04, 0, 1.54, 0, head);
        part(g, 0.04, 0.12, 0.035, 0, 1.68, 0, C.white);
        part(g, 0.14, 0.04, 0.055, 0, 1.28, 0, C.gold);        // collar ring
        part(g, 0.1, 0.09, 0.03, 0, 1.24, 0.04, C.red);        // tassel
        break;
      }
      case 'bow': {
        /* A "D" recurve: the string is the straight chord, the grip and
           limbs bulge away from it in stepped segments so the curve reads
           clearly from the side-view camera. */
        const body = tint || C.wood;
        part(g, 0.014, 1.04, 0.014, 0, 0, -0.015, C.bone);     // string chord
        part(g, 0.075, 0.2, 0.07, 0.1, 0, 0, C.leatherDark);   // wrapped grip
        part(g, 0.06, 0.09, 0.06, 0.1, 0.13, 0, C.gold);       // riser collar
        part(g, 0.06, 0.09, 0.06, 0.1, -0.13, 0, C.gold);
        // Upper limb: three steps curving out then back to the nock.
        part(g, 0.055, 0.16, 0.055, 0.088, 0.25, 0, body);
        part(g, 0.05, 0.16, 0.05, 0.062, 0.39, 0, body);
        part(g, 0.045, 0.15, 0.045, 0.028, 0.51, 0, body);
        part(g, 0.04, 0.07, 0.04, 0.006, 0.58, 0, C.boneDark); // recurve tip
        part(g, 0.035, 0.045, 0.035, 0, 0.615, -0.012, C.gold);// nock
        // Lower limb mirrors it.
        part(g, 0.055, 0.16, 0.055, 0.088, -0.25, 0, body);
        part(g, 0.05, 0.16, 0.05, 0.062, -0.39, 0, body);
        part(g, 0.045, 0.15, 0.045, 0.028, -0.51, 0, body);
        part(g, 0.04, 0.07, 0.04, 0.006, -0.58, 0, C.boneDark);
        part(g, 0.035, 0.045, 0.035, 0, -0.615, -0.012, C.gold);
        // An arrow nocked and ready: shaft over the grip toward the string.
        part(g, 0.022, 0.34, 0.022, 0.055, 0.05, 0.03, C.wood);
        part(g, 0.05, 0.05, 0.012, 0.055, 0.24, 0.03, C.white, { opacity: 0.8 });
        part(g, 0.04, 0.07, 0.014, 0.055, -0.13, 0.03, C.red);  // fletching
        break;
      }
      case 'staff': {
        const orb = tint || C.teal;
        // Shaft with a mid collar and a carved lower end.
        part(g, 0.065, 0.62, 0.065, 0, 0.31, 0, C.woodDark);
        part(g, 0.06, 0.4, 0.06, 0, 0.82, 0, C.wood);
        part(g, 0.085, 0.05, 0.085, 0, 0.62, 0, C.gold);
        part(g, 0.07, 0.1, 0.07, 0, 0.02, 0, C.leatherDark);
        // Claw prongs cupping the focus crystal.
        part(g, 0.04, 0.16, 0.04, -0.07, 1.03, 0.02, C.goldDark);
        part(g, 0.04, 0.16, 0.04, 0.07, 1.03, 0.02, C.goldDark);
        part(g, 0.04, 0.16, 0.04, 0, 1.03, -0.07, C.goldDark);
        // The crystal: a faceted diamond (stepped octahedron) glowing hot,
        // cupped by the claws, with a floating halo ring behind it.
        part(g, 0.13, 0.1, 0.13, 0, 0.99, 0, orb,
             { emissive: orb, emissiveI: 0.85 });
        part(g, 0.2, 0.14, 0.2, 0, 1.08, 0, orb,
             { emissive: orb, emissiveI: 1.0 });
        part(g, 0.13, 0.1, 0.13, 0, 1.17, 0, orb,
             { emissive: orb, emissiveI: 0.85 });
        part(g, 0.05, 0.06, 0.05, 0, 1.24, 0, C.white,
             { emissive: C.white, emissiveI: 0.9 });            // hot tip
        part(g, 0.3, 0.035, 0.035, 0, 1.08, -0.12, orb,
             { emissive: orb, emissiveI: 0.5, opacity: 0.75 }); // halo ring
        part(g, 0.3, 0.035, 0.035, 0, 1.08, 0.12, orb,
             { emissive: orb, emissiveI: 0.5, opacity: 0.75 });
        // Two orbiting shards (posed, idle spins).
        part(g, 0.07, 0.07, 0.07, 0.13, 1.14, 0.05, orb,
             { emissive: orb, emissiveI: 0.8 });
        part(g, 0.05, 0.05, 0.05, -0.11, 0.96, -0.04, orb,
             { emissive: orb, emissiveI: 0.8 });
        break;
      }
      default: {
        blade(0.5, 0.1, tint || C.metal);
        part(g, 0.2, 0.045, 0.08, 0, 0.0, 0, C.gold);
        grip(0.18, 0.065);
        pommel(0.08);
      }
    }
    return g;
  }

  function tintFromCss(css) {
    if (!css || css.charAt(0) !== '#') return null;
    return parseInt(css.slice(1), 16);
  }

  // --- projectiles & pickups -------------------------------------------------

  /*
     `friendly` matters more than it looks. An enemy's shot and the player's shot
     are the same builder, and in a dark room the ONLY thing separating "mine"
     from "about to hit me" is the read: a hostile orb gets a hot white core, a
     saturated rim and a hard outline, and it never shares a colour with the
     player's own element. Before this, a spitter's poison orb was a 0.22-unit
     dark-green cube in a dark-green swamp — technically on screen, practically
     invisible.
  */
  function buildProjectile(kind, element, friendly) {
    const g = new THREE.Group();
    const hostile = !friendly;
    if (kind === 'arrow') {
      part(g, 0.03, 0.03, 0.5, 0, 0, 0, C.wood);
      part(g, 0.07, 0.07, 0.1, 0, 0, 0.28, C.metal);
      part(g, 0.12, 0.04, 0.08, 0, 0, -0.22, C.boneDark);
      /* An elemental bow looses an elemental arrow. Without this the arrow was
         always plain wood and metal, so the element only showed up after the
         hit - the one thing a player needs to read BEFORE they shoot. */
      if (element) {
        const col = elementColorHex(element);
        part(g, 0.09, 0.09, 0.34, 0, 0, 0.04, col, { emissive: col, emissiveI: 0.95, opacity: 0.8 });
        part(g, 0.15, 0.15, 0.02, 0, 0, 0.34, col, { emissive: col, emissiveI: 0.7, opacity: 0.5 });
      }
      if (hostile) {
        /* The archer's tell: a red flight streak, so an incoming arrow reads at
           a glance instead of blending into the scenery. */
        part(g, 0.05, 0.05, 0.42, 0, 0, -0.06, 0xff5a4a, { emissive: 0xff3a2a, emissiveI: 1.1, opacity: 0.85 });
      }
    } else {
      const col = elementColorHex(element);
      const rim = hostile ? 0xff5a4a : col;
      // Hot core, coloured shell, hard rim: readable at any distance.
      part(g, 0.16, 0.16, 0.16, 0, 0, 0, 0xfff6e0, { emissive: 0xfff0c0, emissiveI: 1.3 });
      part(g, 0.3, 0.3, 0.3, 0, 0, 0, col, { emissive: col, emissiveI: 1.0, opacity: 0.75 });
      part(g, 0.38, 0.38, 0.05, 0, 0, 0.02, rim, { emissive: rim, emissiveI: 0.9, opacity: 0.6 });
      part(g, 0.38, 0.05, 0.38, 0, 0, 0.02, rim, { emissive: rim, emissiveI: 0.9, opacity: 0.6 });
      if (hostile) part(g, 0.44, 0.44, 0.44, 0, 0, 0, 0xff2a1a, { emissive: 0xff2a1a, emissiveI: 0.8, opacity: 0.18 });
    }
    return g;
  }

  function elementColorHex(element) {
    const E = DS.Weapons && DS.Weapons.ELEMENTS && DS.Weapons.ELEMENTS[element];
    if (E) return tintFromCss(E.color) || 0xe8743b;
    return 0xc86ee0;  // hostile dark
  }

  /* A disc — a coin or a key bow is not a box, and at pickup size the
     silhouette is the whole read. Faces the camera (+z), both sides visible. */
  function disc(parent, r, thickness, x, y, z, color, opts) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, thickness, 12), mat(color, opts));
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /* Drops. Read at a glance across a lit floor, so each one is a recognisable
     little object — a stack of coins, a plump heart, a faceted shard, a real
     key, a rarity gem with a halo — instead of a coloured speck. Origin sits
     at the drop's own bottom edge, so the 2D physics can rest it on the floor
     and the model lands with it. */
  function buildPickup(kind, color) {
    const g = new THREE.Group();
    switch (kind) {
      case 'coin': {
        // A leaning stack: three faces at slightly different angles read as a
        // pile rather than one disc edge-on.
        for (let i = 0; i < 3; i++) {
          const y = 0.06 + i * 0.08;
          const off = i * 0.05;
          disc(g, 0.24, 0.07, off - 0.05, y, off * 0.6, C.gold,
               { emissive: 0x8a6a10, emissiveI: 0.55 });
          disc(g, 0.15, 0.08, off - 0.05, y, off * 0.6 + 0.04, 0xf5d264,
               { emissive: 0xd4a046, emissiveI: 0.8 });
        }
        part(g, 0.08, 0.08, 0.08, 0, 0.36, 0, 0xfff3c4,
             { emissive: 0xffe066, emissiveI: 1 });
        break;
      }
      case 'heart': {
        part(g, 0.2, 0.2, 0.18, -0.11, 0.34, 0, C.red, { emissive: C.redDark, emissiveI: 0.5 });
        part(g, 0.2, 0.2, 0.18, 0.11, 0.34, 0, C.red, { emissive: C.redDark, emissiveI: 0.5 });
        part(g, 0.3, 0.16, 0.18, 0, 0.22, 0, C.red, { emissive: C.redDark, emissiveI: 0.5 });
        part(g, 0.2, 0.16, 0.17, 0, 0.12, 0, C.red, { emissive: C.redDark, emissiveI: 0.5 });
        part(g, 0.1, 0.12, 0.16, 0, 0.05, 0, C.redDark);
        // Shine so it reads as a solid, not a smudge.
        part(g, 0.07, 0.09, 0.06, -0.13, 0.4, 0.09, C.white, { opacity: 0.7 });
        break;
      }
      case 'shard': {
        // A crystal: two rotated blocks for facets, a bright core inside.
        const big = part(g, 0.2, 0.36, 0.2, 0, 0.2, 0, C.teal,
                         { emissive: 0x2f6fa8, emissiveI: 0.7 });
        big.rotation.y = Math.PI / 4;
        const tip = part(g, 0.13, 0.2, 0.13, 0, 0.44, 0, 0x7fe8ff,
                         { emissive: 0x4fb3e0, emissiveI: 1 });
        tip.rotation.y = Math.PI / 4;
        part(g, 0.09, 0.2, 0.09, 0, 0.22, 0, C.white, { emissive: C.white, emissiveI: 0.9, opacity: 0.85 });
        part(g, 0.16, 0.1, 0.16, 0, 0.06, 0, C.tealDark);
        break;
      }
      case 'key': {
        disc(g, 0.15, 0.07, 0, 0.44, 0, C.gold, { emissive: 0xb8860b, emissiveI: 0.6 });
        disc(g, 0.06, 0.08, 0, 0.44, 0.02, 0x1c1a24);
        part(g, 0.07, 0.34, 0.05, 0, 0.22, 0, C.gold, { emissive: 0xb8860b, emissiveI: 0.5 });
        part(g, 0.05, 0.05, 0.05, 0, 0.02, 0, C.gold);
        part(g, 0.15, 0.06, 0.05, 0.07, 0.13, 0, C.gold, { emissive: 0xb8860b, emissiveI: 0.5 });
        part(g, 0.1, 0.06, 0.05, 0.05, 0.04, 0, C.gold, { emissive: 0xb8860b, emissiveI: 0.5 });
        break;
      }
      default: {  // item drop: a rarity gem with a halo and orbiting motes
        const col = tintFromCss(color) || C.gold;
        const body = part(g, 0.26, 0.26, 0.26, 0, 0.24, 0, col,
                          { emissive: col, emissiveI: 0.65 });
        body.rotation.set(Math.PI / 4, Math.PI / 4, 0);
        const core = part(g, 0.14, 0.14, 0.14, 0, 0.24, 0, C.white,
                          { emissive: col, emissiveI: 1 });
        core.rotation.set(Math.PI / 4, Math.PI / 4, 0);
        // Halo ring, lying flat, like the chest beam in miniature.
        const halo = part(g, 0.46, 0.03, 0.46, 0, 0.06, 0, col,
                          { emissive: col, emissiveI: 0.7, opacity: 0.6 });
        halo.rotation.y = Math.PI / 4;
        part(g, 0.34, 0.02, 0.34, 0, 0.44, 0, C.white, { opacity: 0.45 });
      }
    }
    return g;
  }

  // --- API -------------------------------------------------------------------

  DS.Voxel = {
    build: build,
    keyFor: keyFor,
    pose: pose,
    buildWeapon: buildWeapon,
    buildProjectile: buildProjectile,
    buildPickup: buildPickup,
    elementColorHex: elementColorHex,
    HEIGHT: HEIGHT,
    COLORS: C,
    mat: mat
  };
})(window.DS);
