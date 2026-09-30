/* The stage the character screen shows the hero on: a small round plinth in the
   dark, a rim light behind him, motes drifting up, and a camera that leans in on
   the face when the face is what you are choosing.

   Like the menu's camp (camp3d.js) it draws as a pre-pass through the screen
   layer (DS.UI3.addPrePass), which puts it inside the play frame with the HTML
   interface laid over it. It owns no game state: a stage is not a level. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;
  let stageOffset = 0.095;                         // of the frame's width: where the middle column sits
  const VIEWS = {
    full:   { pos: [0, 1.35, 6.3], look: [0, 0.92, 0] },
    head:   { pos: [0, 1.45, 5.0], look: [0, 1.2, 0] },
    weapon: { pos: [0.3, 1.25, 6.0], look: [0, 0.95, 0] }
  };

  let scene = null, camera = null, built = false;
  let model = null, modelKey = '', held = null;
  let clock = 0, lastNow = 0, drag = 0, sway = 0.45, weaponType = null;
  const cam = { p: VIEWS.full.pos.slice(), l: VIEWS.full.look.slice() };
  const motes = [];

  const box = function (parent, sx, sy, sz, x, y, z, c, o) { return DS.Voxel.part(parent, sx, sy, sz, x, y, z, c, o); };

  function radial(rgb, a0) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const g = cx.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  function build() {
    if (built) return true;
    if (typeof THREE === 'undefined' || !DS.Voxel || !DS.Look3D) return false;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080b15);
    camera = new THREE.PerspectiveCamera(30, C.W / C.H, 0.1, 60);

    scene.add(new THREE.AmbientLight(0xb0a498, 0.22));
    scene.add(new THREE.HemisphereLight(0xb8c0e8, 0x3a2c30, 0.16));
    const key = new THREE.DirectionalLight(0xfff0dc, 0.66);
    key.position.set(-2.6, 4.6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 0.4);
    rim.position.set(3.2, 3, -4);
    scene.add(rim);
    const warm = new THREE.PointLight(0xffa860, 0.35, 9, 2);
    warm.position.set(0.9, 0.5, 2.6);
    scene.add(warm);

    // A glow behind him and a soft shadow under him: what makes a figure stand somewhere.
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({ map: radial('96,130,220', 0.5), transparent: true, depthWrite: false, fog: false }));
    halo.position.set(0, 1.3, -3);
    scene.add(halo);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: radial('0,0,0', 0.6), transparent: true, depthWrite: false, fog: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0, 0.011, 0);
    scene.add(blob);

    // The plinth: two stacked octagons and a lit rim.
    const plinth = new THREE.Group();
    scene.add(plinth);
    const top = box(plinth, 1.9, 0.14, 1.9, 0, -0.07, 0, 0x141624);
    const top2 = box(plinth, 1.9, 0.14, 1.9, 0, -0.07, 0, 0x141624);
    top2.rotation.y = Math.PI / 4;
    box(plinth, 2.15, 0.1, 2.15, 0, -0.19, 0, 0x121320).rotation.y = Math.PI / 8;
    box(plinth, 1.7, 0.02, 1.7, 0, 0.005, 0, 0x2a3050, { emissive: 0x3a4f9a, emissiveI: 0.22 }).rotation.y = Math.PI / 4;
    top.rotation.y = 0;

    for (let i = 0; i < 22; i++) {
      const m = box(scene, 0.04, 0.04, 0.04, 0, -9, 0, 0xbfd4ff, { emissive: 0xbfd4ff, emissiveI: 0.9, opacity: 0.8 });
      motes.push({ node: m, t: Math.random(), speed: 0.08 + Math.random() * 0.14, a: Math.random() * 6.28, r: 0.7 + Math.random() * 1.6 });
    }
    built = true;
    return true;
  }

  /* The hero shows a weapon in a guard stance, out in front of him: the arm comes
     forward (`arm`), the weapon is tilted so its far end is up and away from his body
     (`tilt` is its lean from upright, forward; `roll` swings it out to the side, off his face), and the off hand comes up to meet it
     (`off`). In the world he carries it differently; the stage only has to show it
     without the blade lying back across his shoulder and through his head. */
  const STANCE = {
    sword:    { arm: -0.95, tilt: 0.6,  roll: -0.5,  yaw: -0.25, off: -0.3 },
    dagger:   { arm: -0.95, tilt: 0.95, roll: -0.45, yaw: -0.25, off: -0.2 },
    greataxe: { arm: -0.8,  tilt: 0.4,  roll: -0.3,  yaw: 0,     off: -0.55 },
    spear:    { arm: -0.8,  tilt: 0.5,  roll: -0.3,  yaw: 0,     off: -0.5 },
    bow:      { arm: -0.9,  tilt: 0,    roll: 0,     yaw: -1.5,  off: -0.25 },
    staff:    { arm: -0.7,  tilt: 0.1,  roll: -0.15, yaw: 0,     off: -0.45 }
  };
  const REST_STANCE = { arm: -0.95, tilt: 0.6, roll: -0.5, yaw: -0.25, off: -0.3 };
  const stanceOf = function (type) { return STANCE[type] || REST_STANCE; };

  /* Show this look, holding `opts.weapon` (a weapon type) if given. Rebuilds only
     when something the model depends on changed. */
  function setLook(look, opts) {
    if (!build()) return false;
    opts = opts || {};
    weaponType = opts.weapon || null;
    const key = DS.Look3D.keyOf(look) + '|' + (weaponType || '') + '|' + (weaponType && look.weapon ? look.weapon[weaponType] || '' : '');
    if (key === modelKey) return true;
    modelKey = key;
    if (model) {
      scene.remove(model.root);
      model.root.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    }
    model = DS.Look3D.build(look);
    scene.add(model.root);
    held = weaponType ? DS.Look3D.holdWeapon(model, weaponType, look) : null;
    if (held) { const st = stanceOf(weaponType); held.rotation.set(st.tilt - st.arm, st.yaw, st.roll); }
    return true;
  }

  function view(name) {
    const v = VIEWS[name] || VIEWS.full;
    cam.want = v;
    sway = name === 'head' ? 0.22 : 0.45;
  }

  function update(dt) {
    if (!build()) return false;
    clock += dt;
    const v = cam.want || VIEWS.full;
    const k = Math.min(1, dt * 5);
    for (let i = 0; i < 3; i++) { cam.p[i] += (v.pos[i] - cam.p[i]) * k; cam.l[i] += (v.look[i] - cam.l[i]) * k; }
    /* The interface covers the sides, so the hero is framed in the middle column,
       a little right of the frame's centre: the camera slides left by that much. */
    const visW = 2 * (cam.p[2] - cam.l[2]) * Math.tan(Math.PI / 12) * (C.W / C.H);
    const off = visW * stageOffset;
    camera.position.set(cam.p[0] - off, cam.p[1], cam.p[2]);
    camera.lookAt(cam.l[0] - off, cam.l[1], cam.l[2]);

    if (model) {
      model.root.rotation.y = drag + Math.sin(clock * 0.55) * sway + (held ? -0.7 : 0);       // a held weapon turns toward the camera
      model.armL.rotation.x = (held ? stanceOf(weaponType).off : 0) + Math.sin(clock * 1.6) * 0.04;
      model.head.rotation.y = Math.sin(clock * 0.9) * 0.1;
      model.torso.position.y = 0.34 + Math.sin(clock * 2.2) * 0.006;       // breathing, on the leg height
      if (held) { model.armR.rotation.x = stanceOf(weaponType).arm + Math.sin(clock * 1.4) * 0.04; model.torso.rotation.y = 0; }
      else { model.armR.rotation.x = -Math.sin(clock * 1.6) * 0.04; model.torso.rotation.y = 0; }
      model.animate(model, { vx: 0, onGround: true }, clock);
    }
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.t += dt * m.speed;
      if (m.t > 1) { m.t -= 1; m.a = Math.random() * 6.28; }
      m.node.position.set(Math.sin(m.a + clock * 0.3) * m.r, 0.2 + m.t * 2.6, Math.cos(m.a + clock * 0.3) * m.r * 0.7 - 0.3);
      m.node.scale.setScalar(Math.max(0.1, Math.sin(m.t * Math.PI)));
    }
    return true;
  }

  /* Called by the screen each frame: advance the stage and hand it to the screen
     layer as a pre-pass. Real elapsed time, so it runs at one speed on any display. */
  function attach(fallbackDt) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    const dt = (now && lastNow) ? Math.min(0.1, (now - lastNow) / 1000) : fallbackDt;
    lastNow = now;
    if (!update(dt)) return false;
    if (DS.UI3 && DS.UI3.ready && DS.UI3.addPrePass) { DS.UI3.addPrePass(scene, camera); return true; }
    return false;
  }

  DS.LookStage = {
    build: build, setLook: setLook, view: view, update: update, attach: attach,
    nudge: function (dx) { drag += dx; },
    setOffset: function (v) { stageOffset = v; },
    resetSpin: function () { drag = 0; },
    get model() { return model; },
    get scene() { return scene; },
    get camera() { return camera; },
    get ready() { return built; }
  };
})(window.DS);
