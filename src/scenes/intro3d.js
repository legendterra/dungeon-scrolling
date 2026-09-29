/* The opening: someone walks up a torch-lit path to an old stone door and steps
   through.

   It plays before a run (never on a restart), it is a real 3D scene lit like the
   rest of the game, and it can be skipped by any key. The camera does what a
   camera does in a film -- a wide look at the door from far down the path, a
   slow push in behind the walker's shoulder, a low angle from the steps as the
   door wakes, then straight through it into white -- and the door is the same
   portal (src/fx3d/portal.js) the exits of the dungeon use, so what wakes here
   is what waits at the bottom of every floor.

   Built like the menu's camp (scenes/camp3d.js): its own scene and camera,
   handed to the screen layer as a pre-pass so the letterbox, captions and the
   final fade land over it. It never touches the world renderer or a run. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  const M = DS.M;

  // Frames at 60 fps.
  const FADE_IN = 34;
  const WALK_END = 430;        // the walker reaches the steps
  const WAKE_END = 610;        // the door is fully awake
  const STEP_END = 700;        // he is inside it
  const WHITE_AT = 660;        // the white begins
  const TOTAL = 770;

  const INK = '#e6e3f4';
  const CAPTIONS = [
    { at: 40, until: 190, text: 'AT THE EDGE OF THE MAP, A DOOR THAT OPENS DOWNWARD.' },
    { at: 236, until: 400, text: 'NO ONE WHO ENTERED HAS BEEN SEEN AGAIN.' },
    { at: 470, until: 640, text: 'THIS TIME, SOMEONE STEPS THROUGH.' }
  ];

  const ease = function (t) { t = M.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  function mat(color, opts) {
    return DS.Voxel && DS.Voxel.mat ? DS.Voxel.mat(color, opts) : new THREE.MeshBasicMaterial({ color: color });
  }
  function box(parent, sx, sy, sz, x, y, z, color, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(color, opts));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /* A soft round glow, drawn once: what the door's light does to the air. */
  function haloTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const g = cx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  function build() {
    const rng = DS.makeRng(0x1A70B0);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060812);
    scene.fog = new THREE.Fog(0x080b1a, 9, 46);

    const camera = new THREE.PerspectiveCamera(38, C.W / C.H, 0.3, 120);
    camera.position.set(5.5, 2.3, 21);

    // --- light: a cold night, a warm path, a door that lights the ground --------------
    scene.add(new THREE.AmbientLight(0x2a3450, 0.62));
    scene.add(new THREE.HemisphereLight(0x2a3a5a, 0x120e10, 0.5));
    const moon = new THREE.DirectionalLight(0x9db8ff, 0.55);
    moon.position.set(-6, 9, 8);
    scene.add(moon);
    const doorLight = new THREE.PointLight(0x4ee2ec, 1.4, 20, 2);
    doorLight.position.set(0, 2.6, 2.0);
    scene.add(doorLight);
    const torchLight = new THREE.PointLight(0xffa54a, 1.6, 9, 2);
    scene.add(torchLight);
    const braziers = [];

    // --- the ground, the path, the ruins ------------------------------------------------
    box(scene, 60, 0.6, 60, 0, -0.3, 4, 0x1c1c26);
    for (let i = 0; i < 26; i++) {                                     // flagstones down the path
      const z = 1.9 + i * 0.86;
      const wd = 1.0 + rng.float(-0.1, 0.12);
      box(scene, wd, 0.1, 0.78, (i % 2 ? 0.55 : -0.55) + rng.float(-0.06, 0.06), 0.03, z, 0x3a384a);
      box(scene, wd, 0.1, 0.78, (i % 2 ? -0.55 : 0.55) + rng.float(-0.06, 0.06), 0.03, z + 0.05, 0x333144);
    }
    for (let s = 0; s < 3; s++) box(scene, 4.6 + s * 0.6, 0.15, 0.8, 0, 0.075 + s * 0.15, 2.0 - s * 0.4, 0x403d55);   // the steps

    // Braziers along the path: a post, a cup, a flame. Two of them carry a real light.
    for (let i = 0; i < 6; i++) {
      const z = 4 + i * 3.1;
      for (const side of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(side * 2.1, 0, z);
        box(g, 0.14, 1.0, 0.14, 0, 0.5, 0, 0x2a2624);
        box(g, 0.34, 0.16, 0.34, 0, 1.04, 0, 0x3a3230);
        const flame = box(g, 0.22, 0.34, 0.22, 0, 1.28, 0, 0xffa54a, { emissive: 0xffa54a, emissiveI: 1.3 });
        const tip = box(g, 0.12, 0.2, 0.12, 0, 1.5, 0, 0xffe9a8, { emissive: 0xffd27a, emissiveI: 1.5 });
        scene.add(g);
        braziers.push({ flame: flame, tip: tip, phase: rng.float(0, 6.28) });
      }
    }
    const lampA = new THREE.PointLight(0xffa54a, 1.2, 8, 2); lampA.position.set(-2.1, 1.5, 4.5); scene.add(lampA);
    const lampB = new THREE.PointLight(0xffa54a, 1.2, 8, 2); lampB.position.set(2.1, 1.5, 7.6); scene.add(lampB);

    // Broken columns, fallen blocks and moss on both sides, thinning into the dark.
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * rng.float(3.4, 12), z = rng.float(-6, 22);
      const h = rng.float(0.5, 3.6);
      const col = new THREE.Group();
      col.position.set(x, 0, z);
      box(col, 0.9, 0.3, 0.9, 0, 0.15, 0, 0x33313f);
      box(col, 0.62, h, 0.62, 0, 0.3 + h / 2, 0, 0x3d3a4c).rotation.z = rng.float(-0.05, 0.05);
      if (rng.chance(0.5)) box(col, 0.8, 0.4, 0.8, 0.3, 0.2, 0.7, 0x2c2a38).rotation.y = rng.float(0, 1);
      if (rng.chance(0.6)) box(col, 0.66, 0.1, 0.66, 0, 0.3 + h + 0.03, 0, 0x2a4a30);
      scene.add(col);
    }
    for (let i = 0; i < 40; i++) {                                     // trees far off, fogged
      const x = (i % 2 ? 1 : -1) * rng.float(9, 26), z = rng.float(-16, 24);
      const h = rng.float(3, 7);
      box(scene, 0.4, h * 0.55, 0.4, x, h * 0.27, z, 0x1e1812);
      box(scene, 2.2, 1.8, 2.2, x, h * 0.62, z, 0x101c16);
      box(scene, 1.4, 1.3, 1.4, x, h * 0.86, z, 0x0e1812);
    }
    box(scene, 60, 9, 3, 0, 3, -14, 0x0a0e1c);
    box(scene, 28, 6, 3, -20, 1.5, -10, 0x090c18);

    // --- the door --------------------------------------------------------------------------
    const door = new THREE.Group();
    scene.add(door);
    const stone = 0x4a4660, dark = 0x33304a;
    box(door, 0.9, 5.4, 1.0, -1.75, 2.7, 0, stone);
    box(door, 0.9, 5.4, 1.0, 1.75, 2.7, 0, stone);
    box(door, 5.0, 0.8, 1.1, 0, 5.5, 0, stone);
    box(door, 1.0, 1.0, 1.25, 0, 5.75, 0.05, 0x59547a);
    box(door, 0.5, 0.5, 1.05, -1.75, 5.05, 0.05, dark);
    box(door, 0.5, 0.5, 1.05, 1.75, 5.05, 0.05, dark);
    box(door, 4.6, 0.4, 1.4, 0, 0.2, 0.2, dark);
    for (let i = 0; i < 6; i++) {                                      // glyphs cut into the pillars
      box(door, 0.08, 0.34, 0.06, -1.75 + (i % 2 ? 0.12 : -0.12), 1.2 + i * 0.62, 0.53, 0x8fe8f0, { emissive: 0x4ee2ec, emissiveI: 0.8 });
      box(door, 0.08, 0.34, 0.06, 1.75 + (i % 2 ? -0.12 : 0.12), 1.2 + i * 0.62, 0.53, 0x8fe8f0, { emissive: 0x4ee2ec, emissiveI: 0.8 });
    }
    const portal = DS.Portal3D.create({ w: 2.6, h: 5.0, y: 2.7, open: true, fx: false });
    portal.group.position.set(0, 0.05, 0.05);
    door.add(portal.group);

    const halo = haloTexture();
    const haloMat = new THREE.MeshBasicMaterial({ map: halo, color: 0x4ee2ec, transparent: true, opacity: 0.0,
                                                  blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const haloPlane = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), haloMat);
    haloPlane.position.set(0, 2.9, -0.3);
    scene.add(haloPlane);

    // Motes falling into the door, and fireflies in the dark.
    const motes = [];
    const moteMat = new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.9,
                                                  blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), moteMat);
      scene.add(m);
      motes.push({ node: m, t: rng.float(0, 1), a: rng.float(0, 6.28), r: rng.float(1.6, 4.4), speed: rng.float(0.25, 0.6) });
    }
    const flies = [];
    const flyMat = new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.8,
                                                 blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), flyMat);
      scene.add(m);
      flies.push({ node: m, home: { x: rng.float(-9, 9), y: rng.float(0.5, 3.2), z: rng.float(-3, 20) },
                   phase: rng.float(0, 6.28), speed: rng.float(0.3, 0.8), amp: rng.float(0.3, 1.0) });
    }
    const starMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false });
    for (let i = 0; i < 140; i++) {
      const a = rng.float(0, 6.28), e = rng.float(0.15, 1.3);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), starMat);
      s.position.set(Math.cos(a) * Math.cos(e) * 80, Math.sin(e) * 60 + 8, -Math.abs(Math.sin(a) * Math.cos(e)) * 80 - 10);
      scene.add(s);
    }

    // --- the walker ---------------------------------------------------------------------------
    const model = DS.Voxel.build('hero', { armor: {} });
    const hero = new THREE.Group();
    hero.add(model.root);
    hero.rotation.y = Math.PI;                                          // facing the door
    scene.add(hero);
    // The torch in his hand: a stem, a flame, and the light that goes with him.
    const torch = new THREE.Group();
    box(torch, 0.07, 0.5, 0.07, 0, 0.05, 0, 0x5c3f2a);
    const tf = box(torch, 0.16, 0.24, 0.16, 0, 0.42, 0, 0xffa54a, { emissive: 0xffa54a, emissiveI: 1.4 });
    torch.position.set(0, -0.34, 0.16);
    if (model.armR) model.armR.add(torch);

    return { scene: scene, camera: camera, portal: portal, door: door, hero: hero, model: model, torchFlame: tf,
             braziers: braziers, motes: motes, flies: flies, doorLight: doorLight, torchLight: torchLight,
             haloMat: haloMat, moteMat: moteMat, haloTex: halo, lamps: [lampA, lampB] };
  }

  function dispose(w) {
    // Geometry and the texture this scene made; the shared voxel materials stay.
    w.scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    if (w.haloTex) w.haloTex.dispose();
  }

  function createIntro(onDone) {
    if (!(DS.Voxel && DS.Portal3D && DS.UI3 && DS.UI3.addPrePass && typeof THREE !== 'undefined')) return null;
    const w = build();
    const st = { frame: 0, done: false };
    DS.FX.clear();

    function finish() {
      if (st.done) return;
      st.done = true;
      dispose(w);
      DS.Audio.stopMusic();
      onDone();
    }

    /* Where the walker is on the path, and how high: the path rises onto the steps. */
    function heroAt(f) {
      const walk = ease(f / WALK_END);
      const z = lerp(17.5, 1.25, walk);
      const into = ease((f - WAKE_END) / (STEP_END - WAKE_END));
      return { z: z - into * 2.1, y: z < 2.5 ? M.clamp((2.5 - z) / 1.0, 0, 1) * 0.42 : 0, into: into,
               walking: f < WALK_END - 6 || (f > WAKE_END && f < STEP_END) };
    }

    function updateWorld() {
      const f = st.frame, t = f / 60;
      const h = heroAt(f);
      w.hero.position.set(0, h.y, h.z);
      w.hero.scale.setScalar(1 - h.into * 0.18);
      const ent = { x: h.z * 12, vx: h.walking ? 1.1 : 0, attackState: 'none', attackTimer: 0, cfg: { wind: 20 }, hurtFlash: 0 };
      DS.Voxel.pose(w.model, ent, t);
      w.model.root.rotation.x = h.into * 0.22;                          // leans into it

      // The door: asleep at first, then it wakes as he comes near, then it takes him.
      const near = M.clamp(1 - (h.z - 0.2) / 9, 0, 1);
      const wake = ease((f - 250) / 260);
      w.portal.enter(ease((f - WAKE_END + 40) / (STEP_END - WAKE_END + 40)));
      w.portal.update(t, true, Math.max(near * 0.6, wake * 0.5), f);
      w.doorLight.intensity = 0.6 + wake * 2.2 + h.into * 3.0 + Math.sin(t * 3) * 0.15;
      w.haloMat.opacity = 0.08 + wake * 0.34 + h.into * 0.5;
      w.haloMat.color.setHex(h.into > 0.4 ? 0xcaffff : 0x4ee2ec);

      // Torches and the walker's own light.
      for (let i = 0; i < w.braziers.length; i++) {
        const b = w.braziers[i];
        const s = 1 + Math.sin(t * (7 + i) + b.phase) * 0.13;
        b.flame.scale.set(s, 1 / s, s);
        b.tip.position.y = 1.5 + Math.sin(t * 9 + b.phase) * 0.04;
      }
      const flick = 0.82 + Math.sin(t * 7.3) * 0.09 + Math.sin(t * 3.1) * 0.06;
      w.torchLight.position.set(0.2, h.y + 1.4, h.z + 0.3);
      w.torchLight.intensity = 1.7 * flick;
      w.torchFlame.scale.setScalar(0.9 + Math.sin(t * 10) * 0.12);

      // Motes fall into the door; fireflies drift.
      const pull = 1 + wake * 1.4 + h.into * 5;
      for (let i = 0; i < w.motes.length; i++) {
        const m = w.motes[i];
        m.t += m.speed * 0.006 * pull;
        if (m.t > 1) { m.t -= 1; m.a = Math.random() * 6.28; m.r = 1.6 + Math.random() * 2.8; }
        const k = 1 - m.t, ang = m.a + m.t * 4.0 * pull * 0.5;
        m.node.position.set(Math.cos(ang) * m.r * k * 0.62, 2.75 + Math.sin(ang) * m.r * k * 1.05, 0.5 + k * 0.7);
        m.node.scale.setScalar(0.4 + k);
      }
      w.moteMat.opacity = 0.15 + wake * 0.75;
      for (let i = 0; i < w.flies.length; i++) {
        const fl = w.flies[i], p = fl.home;
        fl.node.position.set(p.x + Math.sin(t * fl.speed + fl.phase) * fl.amp,
                             p.y + Math.sin(t * fl.speed * 1.7 + fl.phase * 2) * fl.amp * 0.5,
                             p.z + Math.cos(t * fl.speed * 0.8 + fl.phase) * fl.amp);
        fl.node.scale.setScalar(0.6 + 0.9 * Math.max(0, Math.sin(t * 1.6 + fl.phase * 3)));
      }

      // The camera: a wide look from far down the path, then in behind his shoulder,
      // then low on the steps as the door wakes, then through it.
      const a = ease(f / 330), b = ease((f - 300) / 200), c = ease((f - 560) / 140);
      const cam = w.camera;
      const wide = { x: 5.4, y: 2.4, z: 20.5 }, shoulder = { x: 1.9, y: 1.95, z: h.z + 5.8 }, low = { x: 1.6, y: 1.25, z: 6.8 };
      let px = lerp(lerp(wide.x, shoulder.x, a), low.x, b);
      let py = lerp(lerp(wide.y, shoulder.y, a), low.y, b);
      let pz = lerp(lerp(wide.z, shoulder.z, a), low.z, b);
      px = lerp(px, 0, c); py = lerp(py, h.y + 1.5, c); pz = lerp(pz, h.z + 2.4, c);
      cam.position.set(px, py, pz);
      const ty = lerp(lerp(2.9, lerp(1.9, 2.8, b), a), 2.6, c);
      const tz = lerp(lerp(0, h.z - 4.0, a * (1 - b)), -2, c);
      cam.lookAt(0, ty, tz);
      cam.fov = 38 + c * 22;                                              // the lens opens as it goes through
      cam.updateProjectionMatrix();
    }

    return {
      state: st,

      update: function () {
        const In = DS.Input;
        st.frame++;
        const f = st.frame;
        if (f === 1) DS.Audio.setMusic('calm');
        if (f > 14 && In.anyPressed()) { In.consume('confirm'); In.consume('back'); finish(); return; }

        if (f < WALK_END - 20 && f % 24 === 0) DS.Audio.play('land', { vol: 0.5 });
        if (f === 300) DS.Audio.play('portalHum');
        if (f === WAKE_END - 30) DS.Audio.play('cast');
        if (f === WAKE_END + 20) DS.Audio.play('warp');
        if (f === WHITE_AT + 20) DS.R.shake(3);
        updateWorld();
        if (f >= TOTAL) finish();
      },

      draw: function () {
        const R = DS.R;
        R.begin();
        R.uiMode();
        if (!st.done) DS.UI3.addPrePass(w.scene, w.camera);
        const f = st.frame;

        // Letterbox: the picture is a film frame, and closes a little as the door takes him.
        const bar = 12 + ease((f - WAKE_END) / 100) * 6;
        R.rectS(0, 0, C.W, bar, '#000000');
        R.rectS(0, C.H - bar, C.W, bar, '#000000');

        for (let i = 0; i < CAPTIONS.length; i++) {
          const cap = CAPTIONS[i];
          if (f < cap.at || f > cap.until) continue;
          const a = Math.min(M.clamp((f - cap.at) / 26, 0, 1), M.clamp((cap.until - f) / 26, 0, 1));
          if (a > 0.02) R.textCenterAlpha(cap.text, C.W / 2, C.H - bar - 14, INK, 1, a);
        }

        // In from black; out through white, then down to black.
        if (f < FADE_IN) R.fade(1 - f / FADE_IN, '#000000');
        else if (f > WHITE_AT) {
          const k = ease((f - WHITE_AT) / 50);
          const grey = f > TOTAL - 34 ? Math.round(255 * (1 - (f - (TOTAL - 34)) / 34)) : 255;
          const hx = ('0' + Math.max(0, grey).toString(16)).slice(-2);
          R.fade(k, '#' + hx + hx + hx);
        }

        if (f > 50 && f < TOTAL - 60) {
          const hint = 'ANY KEY  -  SKIP';
          R.textSmall(hint, C.W - R.textSmallWidth(hint) - 6, bar + 4, Math.floor(f / 34) % 2 ? '#3a3654' : '#6f6a90');
        }
        if (DS.UI3) DS.UI3.post.vignette = 0.55;
        R.drawFlash();
      }
    };
  }

  DS.Intro3D = { createIntro: createIntro, TOTAL: TOTAL };
})(window.DS);
