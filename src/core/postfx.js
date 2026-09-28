/* The post pipeline, and the quality ladder that decides how much of it runs.

   The world used to go straight from the scene to the canvas: one render, no
   bloom, no occlusion, no grade, no anti-aliasing. That is why a torch was a
   yellow sticker, why a monster standing in a corner looked pasted onto it, and
   why every biome had the same neutral colour response under its fog. This
   module is the stretch between the scene and the screen:

       RenderPass     the scene, into a half-float target with a depth texture
       SAOPass        contact occlusion read from THAT depth texture (no second
                      scene render), at half resolution            [high]
       UnrealBloom    only what is brighter than the lit world: flames,
                      additive magic, element motes, the sky's own body
       God rays       a radial smear away from the sun, masked by luminance,
                      only while the backdrop's body is on screen   [med/high]
       Grade          per-theme lift/gamma/gain, saturation, contrast, a soft
                      vignette, and the sRGB encode
       SMAA           edges, on the display-referred image, straight into the
                      play viewport

   Tone mapping happens ONCE and in ONE place: the scene's own materials apply
   ACES (renderer.toneMapping is never changed), exactly as on the low preset,
   so every quality level starts from the same tone curve. The sRGB encode also
   happens in the materials, because the scene target is TAGGED sRGB (three.js
   picks each program's output encoding from the target's texture): blending
   then happens on encoded values, exactly as it does on the canvas. A linear
   target looked right for opaque surfaces and wrong for everything else -- a
   2% additive haze over black is invisible on screen but lifts to 15% grey
   once a later pass encodes it, which fogged every backdrop glow. The target
   is half-float, so additive layers still stack above 1 for the bloom; the
   passes after it are raw ShaderMaterials that never re-encode.

   The composer is sized to the PLAY VIEWPORT in device pixels, not the window,
   and the last pass writes into that viewport only; ui3/screen.js draws the HUD
   over it exactly as it did over the plain render.

   Quality:
       low    no composer at all; blob shadows under the actors
       med    bloom + god rays + grade + SMAA; real shadows at 1024
       high   med + SAO; shadows at 2048
   The pick lives in localStorage under 'ds.gfx'. F8 cycles it. A rolling
   average frame time over 20 ms for three seconds steps it down one rung. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const QUALITIES = ['low', 'med', 'high'];
  const STORE_KEY = 'ds.gfx';
  const DEFAULT_QUALITY = 'high';
  const MAX_DPR = 2;

  /* The downgrade rule, as numbers. Frames longer than IGNORE_MS are a hidden
     tab or a debugger pause, not a slow GPU, and they restart the window. */
  const SLOW_MS = 20;
  const WINDOW_MS = 3000;
  const IGNORE_MS = 250;
  const WARMUP_MS = 2500;        // shader compiles after a level load are not "slow"

  const SHADOW_SIZE = { low: 0, med: 1024, high: 2048 };

  let renderer = null, scene = null, camera = null;
  let composer = null, target = null;
  let renderPass = null, saoPass = null, raysPass = null, bloomPass = null;
  let gradePass = null, smaaPass = null;
  let supported = null;          // null = not probed yet
  let quality = DEFAULT_QUALITY;
  let locked = false;            // a manual pick turns the auto-downgrade off
  const listeners = [];
  const size = { w: 0, h: 0 };

  const perf = { last: 0, sum: 0, n: 0, start: 0, warmUntil: 0, downgrades: 0 };

  /* --- the shaders we own ---------------------------------------------------- */

  const FULLSCREEN_VS = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  /* Grade, in display space (the input is already tone-mapped and encoded).
     Lift/gamma/gain is the ASC-CDL order a colourist would recognise;
     saturation and contrast pivot on mid-grey; the vignette is a smooth
     elliptical falloff so it frames a 16:9 shot rather than a square. After
     this pass nothing else in the chain changes colour. */
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null },
      lift: { value: new THREE.Vector3(0, 0, 0) },
      gamma: { value: new THREE.Vector3(1, 1, 1) },
      gain: { value: new THREE.Vector3(1, 1, 1) },
      saturation: { value: 1.1 },
      contrast: { value: 1.05 },
      vignette: { value: 0.3 }
    },
    vertexShader: FULLSCREEN_VS,
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform vec3 lift;',
      'uniform vec3 gamma;',
      'uniform vec3 gain;',
      'uniform float saturation;',
      'uniform float contrast;',
      'uniform float vignette;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec3 c = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);',
      '  c = c * gain + lift * (1.0 - c);',
      '  c = pow(max(c, vec3(0.0)), 1.0 / gamma);',
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  c = mix(vec3(l), c, saturation);',
      '  c = (c - 0.5) * contrast + 0.5;',
      '  vec2 d = (vUv - 0.5) * vec2(1.0, 0.72);',
      '  float v = smoothstep(0.62, 0.18, length(d));',
      '  c *= mix(1.0 - vignette, 1.0, v);',
      '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
      '}'
    ].join('\n')
  };

  /* God rays: march from each pixel toward the light's screen position and add
     what bright sky it crosses, decaying with distance. Luminance-masked, so a
     lit wall does not smear -- only the body and the sky around it do. Before
     the grade, so the rays take the theme's colour response. */
  const RAY_SAMPLES = 24;
  const RaysShader = {
    uniforms: {
      tDiffuse: { value: null },
      lightUv: { value: new THREE.Vector2(0.5, 0.5) },
      tint: { value: new THREE.Color(1, 1, 1) },
      strength: { value: 0 },
      threshold: { value: 0.78 },
      density: { value: 0.85 },
      decay: { value: 0.955 },
      aspect: { value: 16 / 9 }
    },
    vertexShader: FULLSCREEN_VS,
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform vec2 lightUv;',
      'uniform vec3 tint;',
      'uniform float strength;',
      'uniform float threshold;',
      'uniform float density;',
      'uniform float decay;',
      'uniform float aspect;',
      'varying vec2 vUv;',
      'const int N = ' + RAY_SAMPLES + ';',
      'void main() {',
      '  vec4 base = texture2D(tDiffuse, vUv);',
      '  vec2 delta = (vUv - lightUv) * (density / float(N));',
      '  vec2 uv = vUv;',
      '  float w = 1.0;',
      '  vec3 acc = vec3(0.0);',
      '  for (int i = 0; i < N; i++) {',
      '    uv -= delta;',
      '    vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;',
      '    float l = dot(s, vec3(0.2126, 0.7152, 0.0722));',
      '    acc += s * smoothstep(threshold, threshold + 0.3, l) * w;',
      '    w *= decay;',
      '  }',
      '  vec2 off = (vUv - lightUv) * vec2(aspect, 1.0);',
      '  float fall = 1.0 / (1.0 + dot(off, off) * 3.0);',
      '  base.rgb += acc * (1.0 / float(N)) * tint * strength * fall;',
      '  gl_FragColor = base;',
      '}'
    ].join('\n')
  };

  /* --- per-theme grade --------------------------------------------------------

     Derived from the THEMES row the renderer already owns, so a new biome is
     graded the moment it has a fog and a key colour: shadows lean toward the
     fog's hue, highlights toward the key light's. The tweak table is only for
     the rungs whose mood needs a push the formula cannot infer. */
  const GRADE_TWEAK = {
    volcanic: { sat: 1.2, contrast: 1.1 },
    trial:    { sat: 1.12, contrast: 1.1 },
    nest:     { sat: 1.12 },
    flooded:  { sat: 1.04, gamma: 1.04 },
    cave:     { gamma: 1.05 },
    caves:    { gamma: 1.05 },
    mountain: { sat: 1.06, contrast: 1.03 },
    shore:    { sat: 1.1 }
  };

  const tmpColor = new THREE.Color();
  function hue(hex) {
    tmpColor.setHex(hex == null ? 0x808080 : hex);
    const m = Math.max(tmpColor.r, tmpColor.g, tmpColor.b, 0.001);
    return [tmpColor.r / m, tmpColor.g / m, tmpColor.b / m];
  }

  const grade = { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
                  sat: 1.1, contrast: 1.05, vignette: 0.3 };

  function setTheme(row, name) {
    if (!row) return;
    const fog = hue(row.fog), key = hue(row.dir);
    const tw = GRADE_TWEAK[name] || {};
    for (let i = 0; i < 3; i++) {
      grade.lift[i] = fog[i] * 0.035;
      grade.gain[i] = 1.03 * (1 + (key[i] - 1) * 0.07);
      grade.gamma[i] = tw.gamma || 1.0;
    }
    grade.sat = tw.sat || 1.1;
    grade.contrast = tw.contrast || 1.05;
    grade.vignette = 0.3;
    applyGrade();
  }

  function applyGrade() {
    if (!gradePass) return;
    const u = gradePass.uniforms;
    u.lift.value.fromArray(grade.lift);
    u.gamma.value.fromArray(grade.gamma);
    u.gain.value.fromArray(grade.gain);
    u.saturation.value = grade.sat;
    u.contrast.value = grade.contrast;
    u.vignette.value = grade.vignette;
  }

  /* --- god rays input --------------------------------------------------------- */

  const rays = { on: false, x: 0.5, y: 0.5, strength: 0, col: new THREE.Color(1, 1, 1) };

  /* uv is the light's position in the play frame (0..1, +y up); strength 0 or
     a null call turns the pass off entirely, so it costs nothing when the body
     is off screen or the theme has none. */
  function setRays(u, v, color, strength) {
    if (u == null || !(strength > 0.001)) { rays.on = false; return; }
    rays.on = true;
    rays.x = u; rays.y = v;
    rays.strength = strength;
    if (color) rays.col.copy(color);
  }

  /* --- construction ------------------------------------------------------------ */

  function probe() {
    if (supported !== null) return supported;
    supported = false;
    if (!renderer || typeof THREE === 'undefined') return false;
    const need = ['EffectComposer', 'RenderPass', 'ShaderPass', 'UnrealBloomPass',
                  'SMAAPass', 'SAOPass', 'CopyShader', 'SAOShader'];
    for (let i = 0; i < need.length; i++) if (!THREE[need[i]]) return false;
    const caps = renderer.capabilities;
    const ext = renderer.extensions;
    /* Half-float colour targets: WebGL2 with EXT_color_buffer_float, or the
       WebGL1 pair. Without them the linear target would band in every dark
       room, so the game stays on the plain render instead. */
    const halfOk = caps.isWebGL2
      ? ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')
      : ext.has('OES_texture_half_float') && ext.has('EXT_color_buffer_half_float');
    const depthOk = caps.isWebGL2 || ext.has('WEBGL_depth_texture');
    supported = !!(halfOk && depthOk);
    return supported;
  }

  function build() {
    if (composer || !probe()) return !!composer;
    const w = Math.max(2, size.w || 2), h = Math.max(2, size.h || 2);
    target = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType,
      depthBuffer: true, stencilBuffer: false
    });
    target.texture.name = 'PostFX.scene';
    target.texture.encoding = THREE.sRGBEncoding;   // see the header: blend like the canvas
    target.texture.generateMipmaps = false;
    /* One depth texture, SHARED by both ping-pong targets (clone copies the
       reference): the RenderPass writes it whichever buffer it lands in, and
       SAO reads it without a second scene render. */
    target.depthTexture = new THREE.DepthTexture(w, h);
    target.depthTexture.type = THREE.UnsignedIntType;
    target.depthTexture.format = THREE.DepthFormat;

    composer = new THREE.EffectComposer(renderer, target);

    renderPass = new THREE.RenderPass(scene, camera);

    /* SAO with its beauty render pointed at an empty scene (so its "render the
       scene again for depth" step is a clear), and every depth read rerouted
       to the composer's own depth texture. Half resolution: occlusion is
       low-frequency, and its blur hides the upsample. */
    saoPass = new THREE.SAOPass(new THREE.Scene(), camera, true, false, new THREE.Vector2(w >> 1, h >> 1));
    const dt = target.depthTexture;
    saoPass.saoMaterial.uniforms.tDepth.value = dt;
    saoPass.vBlurMaterial.uniforms.tDepth.value = dt;
    saoPass.hBlurMaterial.uniforms.tDepth.value = dt;
    const saoSetSize = saoPass.setSize.bind(saoPass);
    saoPass.setSize = function (sw, sh) { saoSetSize(Math.max(1, sw >> 1), Math.max(1, sh >> 1)); };
    Object.assign(saoPass.params, SAO_PARAMS);

    raysPass = new THREE.ShaderPass(RaysShader);
    raysPass.material.depthTest = false;
    raysPass.material.depthWrite = false;

    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h),
      BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    bloomPass.highPassUniforms.smoothWidth.value = BLOOM.smooth;

    gradePass = new THREE.ShaderPass(GradeShader);
    gradePass.material.depthTest = false;
    gradePass.material.depthWrite = false;

    smaaPass = new THREE.SMAAPass(w, h);

    composer.addPass(renderPass);
    composer.addPass(saoPass);
    composer.addPass(raysPass);
    composer.addPass(bloomPass);
    composer.addPass(gradePass);
    composer.addPass(smaaPass);
    composer.setSize(w, h);
    applyGrade();
    return true;
  }

  /* Tuned against the voxel scale: a chibi is ~1.5 units tall and a tile 1.6,
     so occlusion should fall off inside half a unit and never reach across the
     room to the backdrop (saoScale is relative to the camera's far plane). */
  const SAO_PARAMS = {
    output: 0,
    saoBias: 0.22,
    saoIntensity: 0.34,
    saoScale: 480,
    saoKernelRadius: 14,
    saoMinResolution: 0,
    saoBlur: true,
    saoBlurRadius: 5,
    saoBlurStdDev: 3,
    saoBlurDepthCutoff: 0.004
  };

  /* Threshold on the tone-mapped, encoded image: the lit world tops out under
     it, flames, additive magic and the sky's body sit at or above it. */
  const BLOOM = { strength: 0.55, radius: 0.4, threshold: 0.95, smooth: 0.1 };

  /* --- quality ------------------------------------------------------------------ */

  function load() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (QUALITIES.indexOf(v) >= 0) quality = v;
    } catch (e) { /* storage blocked: the default stands */ }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, quality); } catch (e) { /* not persisted */ }
  }

  function effective() {
    if (quality !== 'low' && !probe()) return 'low';
    return quality;
  }

  function notify() {
    const q = effective();
    for (let i = 0; i < listeners.length; i++) listeners[i](q);
  }

  function toast(text) {
    const g = DS.currentGame;
    if (g && typeof g.toast === 'function') g.toast(text, '#9fd8ff');
  }

  function setQuality(q, opts) {
    opts = opts || {};
    if (QUALITIES.indexOf(q) < 0) return quality;
    quality = q;
    if (opts.lock) locked = true;
    if (opts.persist !== false) save();
    perf.sum = 0; perf.n = 0; perf.start = 0;
    perf.warmUntil = now() + WARMUP_MS;
    if (q !== 'low') build();
    notify();
    if (!opts.quiet) toast('GRAPHICS: ' + effective().toUpperCase());
    return quality;
  }

  function cycle() {
    const i = QUALITIES.indexOf(quality);
    return setQuality(QUALITIES[(i + 1) % QUALITIES.length], { lock: true });
  }

  function now() { return (typeof performance !== 'undefined' ? performance : Date).now(); }

  /* The auto-downgrade: a rolling window of real frame intervals. Called once
     per rendered world frame. */
  function track() {
    const t = now();
    const dt = perf.last ? t - perf.last : 0;
    perf.last = t;
    if (locked || quality === 'low' || !dt) return;
    if (dt > IGNORE_MS || t < perf.warmUntil) { perf.sum = 0; perf.n = 0; perf.start = 0; return; }
    if (!perf.start) perf.start = t;
    perf.sum += dt; perf.n++;
    if (t - perf.start < WINDOW_MS) return;
    const avg = perf.sum / perf.n;
    perf.sum = 0; perf.n = 0; perf.start = 0;
    if (avg > SLOW_MS) {
      perf.downgrades++;
      setQuality(QUALITIES[QUALITIES.indexOf(quality) - 1], { quiet: true });
      toast('GRAPHICS LOWERED: ' + quality.toUpperCase());
    }
  }

  /* A level load recompiles and uploads; its first seconds are not evidence. */
  function warm() { perf.warmUntil = now() + WARMUP_MS; perf.sum = 0; perf.n = 0; perf.start = 0; }

  /* --- the frame ------------------------------------------------------------------ */

  /* Render the scene through the chain into the play viewport. `vp` is the
     viewport in CSS pixels from the bottom-left (what setViewport takes);
     `dw`/`dh` is the same rectangle in device pixels (what the targets need).
     Returns false when the caller should draw the plain render instead. */
  function render(vp, dw, dh) {
    if (effective() === 'low' || !build()) return false;
    if (dw !== size.w || dh !== size.h) {
      size.w = dw; size.h = dh;
      composer.setSize(dw, dh);
    }
    const high = effective() === 'high';
    saoPass.enabled = high;
    if (high) {
      saoPass.saoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    }
    raysPass.enabled = rays.on;
    if (rays.on) {
      const u = raysPass.uniforms;
      u.lightUv.value.set(rays.x, rays.y);
      u.tint.value.copy(rays.col);
      u.strength.value = rays.strength;
      u.aspect.value = dw / Math.max(1, dh);
    }
    renderer.setViewport(vp.x, vp.y, vp.w, vp.h);
    renderer.setScissor(vp.x, vp.y, vp.w, vp.h);
    renderer.setScissorTest(true);
    composer.render(1 / 60);
    return true;
  }

  function init(r, s, c) {
    renderer = r; scene = s; camera = c;
    load();
    if (quality !== 'low') build();
    window.addEventListener('keydown', function (e) {
      if (e.code === 'F8') { e.preventDefault(); cycle(); }
    });
    warm();
  }

  DS.PostFX = {
    QUALITIES: QUALITIES,
    SHADOW_SIZE: SHADOW_SIZE,
    MAX_DPR: MAX_DPR,
    init: init,
    render: render,
    setTheme: setTheme,
    setRays: setRays,
    setQuality: setQuality,
    cycle: cycle,
    track: track,
    warm: warm,
    /* Called with the effective quality whenever it changes (see renderer3d,
       which owns the shadows, the blob fallback and the vignette mesh). */
    onChange: function (fn) { listeners.push(fn); fn(effective()); },
    get quality() { return effective(); },
    get requested() { return quality; },
    get supported() { return probe(); },
    get locked() { return locked; },
    set locked(v) { locked = !!v; },
    get downgrades() { return perf.downgrades; },
    /* Live handles for tuning from a console or a QA pass. */
    get passes() {
      return { composer: composer, sao: saoPass, rays: raysPass, bloom: bloomPass,
               grade: gradePass, smaa: smaaPass };
    },
    get grade() { return grade; },
    applyGrade: applyGrade
  };
})(window.DS);
