/* The torch flame, and the light it leaves on the stone.

   The flame used to be a THREE.Sprite with a soft radial texture, squashed on
   one sine: a warm blob, not a fire. This module draws every flame on a floor
   -- wall torches, braziers, beacons -- as ONE instanced, camera-facing quad
   with a shader flame on it:

     - SHAPE: a teardrop that is pinched at the wick, widest a third of the
       way up and tapering to the tip, cut into tongues by two octaves of
       rising value-noise fbm. The noise also bends the flame sideways more
       the higher it goes, so the tips lick and the base stays put.
     - COLOUR: a heat ramp -- white-hot core, yellow, orange, and deep red at
       the ragged tips -- with the alpha falling off with the heat.
     - BLOOM: output is display-referred and additive (no tone map, no encode:
       the scene target is tagged sRGB and blends like the canvas, see
       postfx.js). Only the core crosses the bloom threshold (~0.95 luminance);
       the tongues peak around 0.8, so the fire keeps its shape instead of
       dissolving into a glow.
     - MOTION: per-flame phase and speed, a gentle wind sway that grows with
       height, and a brightness flicker from the SAME function the flame's
       light uses (DS.TorchLight.flicker; FLICKER_GLSL below is its twin), so
       the fire and its light rise and fall together.

   The floor pool under each flame is a second instanced batch: a flat, soft,
   additive disc on the paver, its brightness driven per instance by the same
   flicker. Walls are lit through the tile materials instead (lightMapPatch),
   which is what lets a torch outside the point-light pool still light its
   area.

   Two draw calls for every flame and floor pool on the level, whatever their
   number, and no allocation after build. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  /* Keep in step with DS.TorchLight.flicker (src/core/torchlight.js). */
  const FLICKER_GLSL = [
    'float torchFlicker(float t, float ph) {',
    '  float p = ph * 6.2831853;',
    '  return 1.0 + sin(t * 1.70 + 0.00 + p) * 0.070',
    '             + sin(t * 2.93 + 1.30 + p * 2.0) * 0.050',
    '             + sin(t * 5.37 + 2.10 + p * 3.0) * 0.035',
    '             + sin(t * 11.3 + 0.70 + p * 4.0) * 0.020;',
    '}'
  ].join('\n');

  const FLAME_VS = [
    'attribute vec4 aFlame;       // phase (0..1), speed, width, height (0 = hidden)',
    'uniform float uTime;',
    'varying vec2 vUv;',
    'varying float vT;',
    'varying float vFlick;',
    FLICKER_GLSL,
    'void main() {',
    '  vUv = uv;',
    '  float t = uTime * aFlame.y + aFlame.x * 37.0;',
    '  vT = t;',
    '  vFlick = torchFlicker(uTime, aFlame.x);',
    '  vec4 base = vec4(0.0, 0.0, 0.0, 1.0);',
    '  #ifdef USE_INSTANCING',
    '    base = instanceMatrix * base;',
    '  #endif',
    '  vec4 mv = modelViewMatrix * base;',
    '  float h = aFlame.w * (0.92 + 0.16 * vFlick - 0.08);',
    '  float sway = (sin(t * 1.30) * 0.6 + sin(t * 2.90 + 1.7) * 0.4) * 0.16 * uv.y * uv.y;',
    '  mv.x += position.x * aFlame.z + sway * aFlame.w;',
    '  mv.y += position.y * h;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  const FLAME_FS = [
    'varying vec2 vUv;',
    'varying float vT;',
    'varying float vFlick;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'float fbm(vec2 p) {',
    '  float v = 0.0, a = 0.5;',
    '  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; }',
    '  return v / 0.875;',
    '}',
    'void main() {',
    '  float y = vUv.y;',
    '  float t = vT;',
    '  float n1 = fbm(vec2(vUv.x * 3.0, y * 2.2 - t * 1.9));',
    '  float n2 = fbm(vec2(vUv.x * 6.5 + 3.1, y * 4.2 - t * 3.1));',
    /* Tongues lick sideways more the higher they are; the wick stays put. */
    '  float x = (vUv.x - 0.5) + (n1 - 0.5) * 0.50 * y + (n2 - 0.5) * 0.16 * y;',
    /* Teardrop: pinched at the wick, widest low, tapering to the tip. */
    '  float w = (0.30 * smoothstep(0.0, 0.16, y) * (1.0 - 0.80 * y) + 0.03) * (0.85 + 0.3 * n1);',
    '  float body = 1.0 - smoothstep(w * 0.45, w, abs(x));',
    /* Heat falls with height and is eaten from the top by the noise. */
    '  float n3 = vnoise(vec2(vUv.x * 9.0 + 5.3, y * 3.0 - t * 4.2));',
    '  float heat = body * (0.98 - y * 1.0) - (1.0 - n2) * 0.55 * y - (1.0 - n1) * 0.18 * y',
    '             - (1.0 - n3) * 0.35 * y * y;',
    '  heat *= smoothstep(0.0, 0.07, y);',
    '  heat = clamp(heat * (0.85 + 0.3 * vFlick), 0.0, 1.0);',
    /* The ramp: deep red tips -> orange -> yellow -> white-hot core. */
    '  vec3 red = vec3(0.50, 0.07, 0.02);',
    '  vec3 orange = vec3(0.95, 0.34, 0.05);',
    '  vec3 yellow = vec3(1.00, 0.72, 0.22);',
    '  vec3 white = vec3(1.25, 1.12, 0.90);',
    '  vec3 col = mix(red, orange, smoothstep(0.08, 0.34, heat));',
    '  col = mix(col, yellow, smoothstep(0.38, 0.66, heat));',
    '  col = mix(col, white, smoothstep(0.80, 0.95, heat));',
    '  float a = smoothstep(0.04, 0.26, heat);',
    /* A faint warm halo round the lower flame, well under the bloom line. */
    '  float r = length(vec2((vUv.x - 0.5) * 1.6, (y - 0.28) * 1.1));',
    '  float halo = (1.0 - smoothstep(0.0, 0.55, r)) * 0.22 * vFlick;',
    '  vec3 outc = col * a + vec3(1.0, 0.45, 0.12) * halo * (1.0 - a);',
    '  gl_FragColor = vec4(outc, 1.0);',
    '}'
  ].join('\n');

  /* --- the flame batch -------------------------------------------------------- */

  function createFlameBatch(capacity) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);                       // the wick at the origin
    const data = new Float32Array(Math.max(1, capacity) * 4);
    const attr = new THREE.InstancedBufferAttribute(data, 4);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFlame', attr);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: FLAME_VS,
      fragmentShader: FLAME_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, capacity));
    mesh.count = 0;
    mesh.frustumCulled = false;                     // instances span the level
    mesh.renderOrder = 6;
    const m4 = new THREE.Matrix4();
    const batch = {
      mesh: mesh,
      /* A flame whose wick is at world (x, y, z), `w` by `h` units. Returns its
         index, or -1 when the batch is full. */
      add: function (x, y, z, w, h, phase, speed) {
        const i = mesh.count;
        if (i >= capacity) return -1;
        m4.makeTranslation(x, y, z);
        mesh.setMatrixAt(i, m4);
        data[i * 4] = phase;
        data[i * 4 + 1] = speed || 1;
        data[i * 4 + 2] = w;
        data[i * 4 + 3] = h;
        mesh.count = i + 1;
        mesh.instanceMatrix.needsUpdate = true;
        attr.needsUpdate = true;
        return i;
      },
      /* Resize (0 hides it): a brazier lighting up grows from nothing. */
      setSize: function (i, w, h) {
        if (i < 0 || i >= mesh.count) return;
        if (data[i * 4 + 2] === w && data[i * 4 + 3] === h) return;
        data[i * 4 + 2] = w;
        data[i * 4 + 3] = h;
        attr.needsUpdate = true;
      },
      update: function (seconds) { mat.uniforms.uTime.value = seconds; },
      dispose: function () { geo.dispose(); mat.dispose(); }
    };
    return batch;
  }

  /* --- the floor pools ------------------------------------------------------ */

  function makePoolTexture() {
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.62)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }
  let poolTex = null;

  function createPoolBatch(capacity) {
    if (!poolTex) poolTex = makePoolTexture();
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);                      // flat on the floor
    const mat = new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      fog: false
    });
    const n = Math.max(1, capacity);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    const col = new THREE.Color();
    const m4 = new THREE.Matrix4();
    const base = new Float32Array(n * 3);
    mesh.setColorAt(0, col.setRGB(0, 0, 0));        // allocates instanceColor
    return {
      mesh: mesh,
      add: function (x, y, z, sx, sz, hex, gain) {
        const i = mesh.count;
        if (i >= n) return -1;
        m4.makeScale(sx, 1, sz).setPosition(x, y, z);
        mesh.setMatrixAt(i, m4);
        col.setHex(hex).multiplyScalar(gain);
        base[i * 3] = col.r; base[i * 3 + 1] = col.g; base[i * 3 + 2] = col.b;
        mesh.setColorAt(i, col);
        mesh.count = i + 1;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        return i;
      },
      /* Brightness this frame: k = 0 dark, 1 its authored colour. */
      setLevel: function (i, k) {
        if (i < 0 || i >= mesh.count) return;
        const a = mesh.instanceColor.array;
        a[i * 3] = base[i * 3] * k;
        a[i * 3 + 1] = base[i * 3 + 1] * k;
        a[i * 3 + 2] = base[i * 3 + 2] * k;
        mesh.instanceColor.needsUpdate = true;
      },
      dispose: function () { geo.dispose(); mat.dispose(); }
    };
  }

  /* --- the tile light map ----------------------------------------------------

     Adds a per-level torch light map (DS.TorchLight.buildLightMap) to a
     Lambert material as extra IRRADIANCE -- it is multiplied by the surface's
     own colour like any light, so lit stone reads as stone in firelight, not
     as a glow pasted on top. The map is addressed by WORLD x/y (instancing
     included), each texel flickers with the phase of its own torch, and the
     uniforms are one shared object, so one write per frame drives every tile
     material on the level. The program key is fixed: every patched material
     shares one compiled program per shadow/fog state. */
  function createLightMapUniforms() {
    return {
      uTorchMap: { value: null },
      uTorchXf: { value: new THREE.Vector4(0, 0, 0, 0) },
      uTorchGain: { value: 0 },
      uTorchTime: { value: 0 }
    };
  }

  function lightMapPatch(material, shared) {
    material.onBeforeCompile = function (sh) {
      sh.uniforms.uTorchMap = shared.uTorchMap;
      sh.uniforms.uTorchXf = shared.uTorchXf;
      sh.uniforms.uTorchGain = shared.uTorchGain;
      sh.uniforms.uTorchTime = shared.uTorchTime;
      sh.vertexShader = 'uniform vec4 uTorchXf;\nvarying vec2 vTorchUv;\n' +
        sh.vertexShader.replace('#include <project_vertex>', [
          '#include <project_vertex>',
          'vec4 tlWorld = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING',
          '  tlWorld = instanceMatrix * tlWorld;',
          '#endif',
          'tlWorld = modelMatrix * tlWorld;',
          'vTorchUv = (tlWorld.xy - uTorchXf.xy) * uTorchXf.zw;'
        ].join('\n'));
      sh.fragmentShader = [
        'uniform sampler2D uTorchMap;',
        'uniform float uTorchGain;',
        'uniform float uTorchTime;',
        'varying vec2 vTorchUv;',
        FLICKER_GLSL,
        ''
      ].join('\n') + sh.fragmentShader.replace('#include <lightmap_fragment>', [
        '#include <lightmap_fragment>',
        'vec4 tlSample = texture2D(uTorchMap, vTorchUv);',
        'reflectedLight.indirectDiffuse += tlSample.rgb * (uTorchGain * torchFlicker(uTorchTime, tlSample.a));'
      ].join('\n'));
    };
    material.customProgramCacheKey = function () { return 'ds-torchmap-1'; };
    return material;
  }

  /* The map itself: RGBA bytes, linear filtered, clamped at the level edge.
     Row 0 is the TOP of the level; the transform flips y to match. */
  function lightMapTexture(lm) {
    const tex = new THREE.DataTexture(lm.data, lm.cols, lm.rows, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  DS.Flame = {
    FLICKER_GLSL: FLICKER_GLSL,
    createFlameBatch: createFlameBatch,
    createPoolBatch: createPoolBatch,
    createLightMapUniforms: createLightMapUniforms,
    lightMapPatch: lightMapPatch,
    lightMapTexture: lightMapTexture
  };
})(window.DS);
