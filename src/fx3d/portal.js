/* The portal: a doorway into somewhere else, drawn as light rather than as a
   picture of light.

   The exit used to be one textured plane turning on its axis, which is what a
   sticker looks like. This is built from the parts a viewer reads as "a hole
   that is pulling at you":

     vortex     one shader on one plane: spiral arms wound tighter toward the
                middle, turbulence riding along them, rings falling inward, a hot
                core, and a rim that shimmers where the opening meets its frame.
                No textures, so it costs one draw call and nothing to dispose.
     runes      a ring of glyph-slabs turning slowly round the opening
     inflow     motes pulled in from the surroundings, curving as they fall
     spill      a soft pool of light on the floor in front

   Two states: OPEN (cold cyan and violet, bright, breathing) and SEALED (dull
   red, slow, backwards, crossed by two bars; a boss door before the boss is
   dead). Changing state is a short transition, and opening bursts. `near` (0..1)
   leans the whole thing toward the player as they come close.

   create(opts) -> { group, update(time, open, near, frames), burst(), enter(k) }
     opts.w, opts.h       the opening in world units (default 1.5 x 2.8)
     opts.y               height of its centre over the group's origin (default 1.6)
     opts.open            start open (default true)
     opts.palette         { edge, mid, core, sealEdge, sealMid } as hex numbers

   The group is placed by the caller (the exit door in renderer3d.js, the
   opening cutscene in scenes/intro3d.js). */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const VERT = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  const FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform float uTime, uIntensity, uSeal, uNear, uSpin, uAspect, uPull;',
    'uniform vec3 uEdge, uMid, uCore;',
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'float fbm(vec2 p) {',
    '  float v = 0.0, a = 0.5;',
    '  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }',
    '  return v;',
    '}',
    'void main() {',
    '  vec2 p = (vUv - 0.5) * 2.0;',
    '  // The opening: a rounded rectangle, so the light fills the doorway to its corners.',
    '  float m = pow(abs(p.x), 3.2) + pow(abs(p.y), 3.6);',
    '  float mask = smoothstep(1.0, 0.74, m);',
    '  // Circular in world units, not in uv: the doorway is taller than it is wide.',
    '  vec2 q = vec2(p.x, p.y / uAspect) * 1.05;',
    '  float r = length(q);',
    '  float a = atan(q.y, q.x);',
    '  float dir = mix(1.0, -0.35, uSeal);',
    '  float swirl = a * 1.0 + dir * uSpin * uTime + (5.5 + uPull * 3.0) * (1.0 - smoothstep(0.0, 1.5, r));',
    '  float arms = 0.5 + 0.5 * sin(swirl * 3.0 + r * 9.0 - uTime * 2.6 * dir);',
    '  float wisps = fbm(vec2(swirl * 1.6, r * 4.2 - uTime * 0.9 * dir));',
    '  float body = smoothstep(0.28, 0.92, arms * (0.5 + 0.95 * wisps));',
    '  float rings = smoothstep(0.72, 1.0, 0.5 + 0.5 * sin(r * 15.0 + uTime * 3.4 * dir)) * (1.0 - smoothstep(0.0, 1.1, r)) * 0.55;',
    '  float core = 0.022 / (r * r + 0.022);',
    '  vec3 col = mix(uEdge, uMid, body);',
    '  col = mix(col, uCore, clamp(core * 1.0 + rings, 0.0, 1.0));',
    '  col += uCore * core * (0.55 + uNear * 0.6);',
    '  float rim = smoothstep(0.5, 0.96, m) * mask;',
    '  col += uMid * rim * (0.55 + 0.35 * sin(uTime * 3.0 + a * 4.0));',
    '  float alpha = mask * clamp(0.3 + body * 0.55 + core, 0.0, 1.0);',
    '  // Sealed: two dark bars across the opening, and a slow heartbeat.',
    '  float bars = step(abs(p.x - p.y * 0.42), 0.085) + step(abs(p.x + p.y * 0.42), 0.085);',
    '  col *= 1.0 - uSeal * 0.75 * clamp(bars, 0.0, 1.0);',
    '  col *= 1.0 + uSeal * 0.25 * sin(uTime * 4.0);',
    '  gl_FragColor = vec4(col * uIntensity, alpha * min(1.0, uIntensity));',
    '}'
  ].join('\n');

  /* What the vortex is drawn against: the dark inside of the opening, in the
     same rounded shape. Additive light on a bright sky washes to white, so the
     doorway has to be dark before it can glow. */
  const VOID_FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform vec3 uTint;',
    'void main() {',
    '  vec2 p = (vUv - 0.5) * 2.0;',
    '  float m = pow(abs(p.x), 3.2) + pow(abs(p.y), 3.6);',
    '  float mask = smoothstep(1.02, 0.78, m);',
    '  float depth = 0.55 + 0.45 * length(p);',
    '  gl_FragColor = vec4(uTint * depth, 0.93 * mask);',
    '}'
  ].join('\n');

  const SPILL_FRAG = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform vec3 uColor;',
    'uniform float uAlpha, uTime;',
    'void main() {',
    '  vec2 p = (vUv - 0.5) * 2.0;',
    '  float d = length(vec2(p.x, p.y * 1.7));',
    '  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2) * uAlpha * (0.85 + 0.15 * sin(uTime * 2.3));',
    '  gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  const DEFAULT_PALETTE = {
    edge: 0x3a2aa8, mid: 0x4ee2ec, core: 0xe8ffff, sealEdge: 0x3a0a14, sealMid: 0xd0203a
  };

  const tmp = { a: null, b: null };
  function mixColor(out, a, b, k) {
    if (!tmp.a) { tmp.a = new THREE.Color(); tmp.b = new THREE.Color(); }
    tmp.a.setHex(a); tmp.b.setHex(b);
    return out.copy(tmp.a).lerp(tmp.b, k);
  }

  function create(opts) {
    opts = opts || {};
    const W = opts.w || 1.5, H = opts.h || 2.8, Y = opts.y != null ? opts.y : 1.6;
    const pal = Object.assign({}, DEFAULT_PALETTE, opts.palette || {});
    const group = new THREE.Group();

    // --- the vortex -------------------------------------------------------------
    const uniforms = {
      uTime: { value: 0 }, uIntensity: { value: 1 }, uSeal: { value: opts.open === false ? 1 : 0 },
      uNear: { value: 0 }, uSpin: { value: 1 }, uAspect: { value: H / W }, uPull: { value: 0 },
      uEdge: { value: new THREE.Color(pal.edge) }, uMid: { value: new THREE.Color(pal.mid) },
      uCore: { value: new THREE.Color(pal.core) }
    };
    const voidU = { uTint: { value: new THREE.Color(0x05060f) } };
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
      uniforms: voidU, vertexShader: VERT, fragmentShader: VOID_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    }));
    dark.position.set(0, Y, 0.06);
    dark.frustumCulled = false;
    group.add(dark);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    disc.position.set(0, Y, 0.08);
    disc.frustumCulled = false;
    group.add(disc);

    // --- the runes: slabs turning round the opening -------------------------------
    const runes = new THREE.Group();
    runes.position.set(0, Y, 0.12);
    const runeMats = [];
    const N = 10, R = Math.min(W * 0.5, H * 0.5) * 0.86;
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: pal.mid, transparent: true, opacity: 0.9,
                                                blending: THREE.AdditiveBlending, depthWrite: false });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.07, i % 2 ? 0.2 : 0.13, 0.03), mat);
      const a = (i / N) * Math.PI * 2;
      slab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      slab.rotation.z = a + Math.PI / 2;
      runes.add(slab);
      runeMats.push(mat);
    }
    group.add(runes);

    // --- the spill on the floor -----------------------------------------------------
    const spillU = { uColor: { value: new THREE.Color(pal.mid) }, uAlpha: { value: 0.5 }, uTime: { value: 0 } };
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.6, W * 1.5), new THREE.ShaderMaterial({
      uniforms: spillU, vertexShader: VERT, fragmentShader: SPILL_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0, 0.06, W * 0.55);
    spill.frustumCulled = false;
    group.add(spill);

    // --- state -----------------------------------------------------------------------
    const st = { open: opts.open === false ? 0 : 1, wasOpen: opts.open !== false, near: 0, enter: 0, seal: 0, fxT: 0 };
    const F = function () { return DS.FX3D && DS.FX3D.ready ? DS.FX3D : null; };

    function centre() {
      return { x: group.position.x, y: group.position.y + Y, z: group.position.z + 0.12 };
    }

    /* Everything at once: a ring, a spray of sparks and a flash. */
    function burst() {
      const f = F();
      if (!f) return;
      const c = centre();
      f.glowAt(c.x, c.y, c.z + 0.1, H * 0.9, pal.mid, 1.6, 18);
      f.ringAt(c.x, c.y, c.z + 0.05, 0.2, Math.max(W, H) * 0.7, 0.14, pal.core, pal.mid, 1.6, 26, 0);
      f.sparkBurst(c.x, c.y, c.z, 16, pal.mid, 0.09, null, null, 0, 1.8, 16);
    }

    /* The motes falling into it: a few a frame while open, almost none while
       sealed, more as the player comes close. */
    function inflow(open, near, frames) {
      const f = F();
      if (!f || !f.advanced) return;
      const c = centre();
      const rate = (0.25 + open * 0.75 + near * 0.9 + st.enter * 2.4) * (open > 0.3 ? 1 : 0.15);
      let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      while (n-- > 0) {
        const a = Math.random() * Math.PI * 2;
        const rx = (W * 0.5 + 0.25 + Math.random() * 0.7), ry = (H * 0.5 + 0.1 + Math.random() * 0.6);
        const px = c.x + Math.cos(a) * rx, py = c.y + Math.sin(a) * ry;
        const dx = c.x - px, dy = c.y - py;
        const side = Math.random() < 0.5 ? 1 : -1;
        f.sparkAt(px, py, c.z + (Math.random() - 0.5) * 0.2,
                  dx * 0.05 - dy * 0.03 * side, dy * 0.05 + dx * 0.03 * side, 0,
                  Math.random() < 0.3 ? pal.core : pal.mid, 1.7, 22 + Math.random() * 12, 0.03 + Math.random() * 0.03, 1.6, 0, 1.0);
      }
    }

    /* Called every rendered frame. `open` is a boolean or 0..1; `near` 0..1 is how
       close the player stands; `frames` is the game clock, for the motes. */
    function update(time, open, near, frames) {
      const target = open === true ? 1 : open === false ? 0 : open;
      st.open += (target - st.open) * 0.06;
      if (Math.abs(st.open - target) < 0.004) st.open = target;
      st.near += ((near || 0) - st.near) * 0.12;
      if (st.open > 0.98 && !st.wasOpen) { st.wasOpen = true; burst(); }
      if (st.open < 0.5) st.wasOpen = false;
      st.seal = 1 - st.open;

      const u = uniforms;
      u.uTime.value = time;
      u.uSeal.value = st.seal;
      u.uNear.value = st.near;
      u.uPull.value = st.near * 0.8 + st.enter * 2.0;
      u.uSpin.value = 1.0 + st.near * 0.7 + st.enter * 3.0;
      u.uIntensity.value = (0.55 + st.open * 0.75) * (1 + st.near * 0.25) * (1 + st.enter * 0.9) *
                           (0.94 + 0.06 * Math.sin(time * 2.6));
      mixColor(u.uEdge.value, pal.sealEdge, pal.edge, st.open);
      mixColor(u.uMid.value, pal.sealMid, pal.mid, st.open);
      voidU.uTint.value.setRGB(0.02 + 0.02 * st.seal, 0.025, 0.06 - 0.03 * st.seal);
      spillU.uColor.value.copy(u.uMid.value);
      spillU.uAlpha.value = 0.18 + st.open * 0.38 + st.near * 0.25;
      spillU.uTime.value = time;

      runes.rotation.z = -time * (0.25 + st.enter * 2.0) * (st.open > 0.5 ? 1 : -0.3);
      for (let i = 0; i < runeMats.length; i++) {
        const flick = st.open > 0.5 ? 0.7 + 0.3 * Math.sin(time * 3 + i * 1.3) : (Math.sin(time * 9 + i * 2.1) > 0.4 ? 0.85 : 0.15);
        runeMats[i].opacity = flick * (0.45 + 0.55 * (st.open > 0.5 ? 1 : 0.7));
        runeMats[i].color.copy(u.uMid.value);
      }
      inflow(st.open, st.near, frames || 0);
    }

    return {
      group: group, disc: disc, runes: runes, spill: spill, uniforms: uniforms,
      update: update, burst: burst,
      /* 0..1: the player is going in. Everything speeds up and brightens. */
      enter: function (k) { st.enter = Math.max(0, Math.min(1, k)); },
      get isOpen() { return st.open > 0.5; }
    };
  }

  DS.Portal3D = { create: create, DEFAULT_PALETTE: DEFAULT_PALETTE };
})(window.DS);
