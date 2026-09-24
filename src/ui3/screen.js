/* The screen-space layer: every pixel the game used to draw on the 2D canvas
   now goes through here as a Three.js quad.

   Why it exists: the game had two canvases. `#game` (2D, 320x180, on top) drew
   the HUD, the menus, every sprite and every world FX; `#game3d` (WebGL) drew
   the dungeon behind it. That meant two renderers, two coordinate systems and a
   rule that anything world-anchored drawn in 2D was painted OVER the 3D scene
   no matter what depth it had. This module is the replacement for the top
   canvas: immediate-mode calls (same shape as the old DS.R API) are appended
   into per-texture vertex buffers and flushed as a handful of meshes, so the
   UI costs a couple of draw calls instead of one draw per pixel run.

   Rendering order per frame:
     1. the world scene (renderer3d),
     2. this UI scene, in the letterboxed 16:9 box the 2D canvas used to occupy,
     3. a full-window overlay quad for fade / flash / tint / vignette / grain.

   Colours are parsed once and cached, glyphs come from the atlas baked out of
   DS.Font3 (see tools/art/font3.py), and sprites are CanvasTextures cached per
   canvas. No canvas 2D context is ever created after boot. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const C = DS.C;

  let renderer = null;
  let uiScene = null, uiCam = null;
  let postScene = null, postCam = null, postMat = null;
  let whiteTex = null;
  let ready = false;

  /* The device-pixel rectangle the UI is drawn into. The world fills the whole
     window; the UI keeps the game's 16:9 logical frame, centred, so panel
     layout does not depend on the window's aspect. */
  const view = { x: 0, y: 0, w: C.W, h: C.H, scale: 1 };

  /* The smallest whole multiple of the logical frame the play area ever uses.
     Below it the frame would be smaller than the 2D art was authored for, so a
     genuinely tiny window falls back to a fractional fill instead. */
  const MIN_SCALE = C.RS;

  /* How much of the binding axis a whole multiple may waste before the crisp
     scale loses to a full-bleed one. 3%: at 1920x1080 the fill is exactly 6 and
     the integer wins (pixel-exact, the case the old rule was written for); in a
     1366x660 window (Windows display scaling) the integer answer is 2 -- 24% of
     the window -- and the fill answer wins instead. */
  const SNAP = 0.03;

  // --- colours --------------------------------------------------------------

  const colorCache = new Map();
  const NAMED = {
    white: '#ffffff', black: '#000000', transparent: '#000000'
  };

  const tmpColor = { r: 1, g: 1, b: 1, a: 1 };

  /* Accepts #rgb, #rrggbb and rgba(r,g,b,a) -- the three forms the game's art
     tables and call sites actually use. Returns a shared scratch object, so
     callers must consume it immediately (every caller here does). */
  function parseColor(str) {
    if (!str) { tmpColor.r = tmpColor.g = tmpColor.b = 1; tmpColor.a = 1; return tmpColor; }
    if (typeof str !== 'string') { tmpColor.r = tmpColor.g = tmpColor.b = 0; tmpColor.a = 1; return tmpColor; }
    let hit = colorCache.get(str);
    if (!hit) {
      hit = [1, 1, 1, 1];
      if (str.charCodeAt(0) === 35) {                  // '#'
        if (str.length === 4) {
          hit[0] = parseInt(str[1] + str[1], 16) / 255;
          hit[1] = parseInt(str[2] + str[2], 16) / 255;
          hit[2] = parseInt(str[3] + str[3], 16) / 255;
        } else {
          hit[0] = parseInt(str.slice(1, 3), 16) / 255;
          hit[1] = parseInt(str.slice(3, 5), 16) / 255;
          hit[2] = parseInt(str.slice(5, 7), 16) / 255;
          if (str.length >= 9) hit[3] = parseInt(str.slice(7, 9), 16) / 255;
        }
      } else {
        const m = str.match(/rgba?\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(',');
          hit[0] = parseFloat(parts[0]) / 255;
          hit[1] = parseFloat(parts[1]) / 255;
          hit[2] = parseFloat(parts[2]) / 255;
          if (parts.length > 3) hit[3] = parseFloat(parts[3]);
        } else if (NAMED[str]) {
          return parseColor(NAMED[str]);
        }
      }
      colorCache.set(str, hit);
    }
    tmpColor.r = hit[0]; tmpColor.g = hit[1]; tmpColor.b = hit[2]; tmpColor.a = hit[3];
    return tmpColor;
  }

  // --- textures -------------------------------------------------------------

  const texCache = new WeakMap();

  function white() {
    if (!whiteTex) {
      const data = new Uint8Array([255, 255, 255, 255]);
      whiteTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
      whiteTex.needsUpdate = true;
      whiteTex.minFilter = THREE.NearestFilter;
      whiteTex.magFilter = THREE.NearestFilter;
    }
    return whiteTex;
  }

  /* Wrap a canvas the art tables baked into a texture. Cached on the canvas so
     a sprite blitted a hundred times a frame is uploaded once, ever. */
  let radialTex = null;

  /* A soft radial falloff, baked once. Every glow in the game -- camp fires,
     torches, the intro nigttlight, skill light -- used a canvas radial gradient
     per draw; one texture and a tinted quad does the same job on the GPU. */
  function radial() {
    if (!radialTex) {
      const size = 128;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g = cv.getContext('2d');
      const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      radialTex = new THREE.CanvasTexture(cv);
      radialTex.minFilter = THREE.LinearFilter;
      radialTex.magFilter = THREE.LinearFilter;
      radialTex.generateMipmaps = false;
    }
    return radialTex;
  }

  function texFor(img) {
    if (!img) return white();
    if (img.__ui3tex) return img.__ui3tex;
    let t = texCache.get(img);
    if (!t) {
      t = new THREE.CanvasTexture(img);
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      texCache.set(img, t);
    }
    try { img.__ui3tex = t; } catch (e) { /* frozen canvas: cache still holds it */ }
    return t;
  }

  // --- font atlas -----------------------------------------------------------

  const KEY = {
    ' ': 'SPACE', '.': 'DOT', ',': 'COMMA', ':': 'COLON', ';': 'SEMI',
    '-': 'DASH', '!': 'BANG', '?': 'QUERY', "'": 'QUOTE', '"': 'DQUOTE',
    '/': 'SLASH', '\\': 'BSLASH', '(': 'LPAREN', ')': 'RPAREN',
    '[': 'LBRACK', ']': 'RBRACK', '<': 'LT', '>': 'GT', '=': 'EQ',
    '+': 'PLUS', '*': 'STAR', '%': 'PCT', '#': 'HASH', '@': 'AT',
    '&': 'AMP', '$': 'DOLLAR', '_': 'UNDER', '|': 'PIPE', '^': 'CARET',
    '~': 'TILDE', '`': 'BACKTICK', '{': 'LBRACE', '}': 'RBRACE'
  };

  const FACES = {};

  function keyFor(ch) {
    if (KEY[ch]) return KEY[ch];
    return ch;
  }

  /* Bake every glyph of a face into one atlas row, plus a 1px outline pass so
     text stays readable over a lit tile or a bright backdrop. Returns the rect
     table the text renderer indexes. */
  function bakeFace(name, table, gw, gh, pad) {
    const keys = Object.keys(table);
    const cw = gw + pad * 2 + 2, chh = gh + pad * 2 + 2;
    const cv = document.createElement('canvas');
    cv.width = cw * keys.length;
    cv.height = chh;
    const g = cv.getContext('2d');
    const rects = {};

    for (let i = 0; i < keys.length; i++) {
      const rows = table[keys[i]];
      const ox = i * cw + pad + 1, oy = pad + 1;
      for (let y = 0; y < gh; y++) {
        const bits = rows[y] || 0;
        if (!bits) continue;
        for (let x = 0; x < gw; x++) {
          if (!(bits & (1 << (gw - 1 - x)))) continue;
          g.fillStyle = '#ffffff';
          g.fillRect(ox + x, oy + y, 1, 1);
          // Outline: the ring of pixels around the glyph, at half alpha. Baked
          // so the runtime needs one quad per glyph, not nine.
          g.fillStyle = 'rgba(255,255,255,0.55)';
          if (!(bits & (1 << (gw - 1 - x + 1)))) g.fillRect(ox + x + 1, oy + y, 1, 1);
          if (y + 1 < gh && !(rows[y + 1] & (1 << (gw - 1 - x)))) g.fillRect(ox + x, oy + y + 1, 1, 1);
          if (x > 0 && !(bits & (1 << (gw - 1 - x + 1)))) g.fillRect(ox + x - 1, oy + y, 1, 1);
          if (y > 0 && !(rows[y - 1] & (1 << (gw - 1 - x)))) g.fillRect(ox + x, oy + y - 1, 1, 1);
        }
      }
      rects[keys[i]] = { x: ox, y: oy, w: gw, h: gh, cx: i * cw, cy: 0, cw: cw, ch: chh };
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    FACES[name] = {
      tex: tex, rects: rects, gw: gw, gh: gh, atlasW: cv.width, atlasH: cv.height
    };
    return FACES[name];
  }

  // --- geometry batches -----------------------------------------------------

  const batches = new Map();     // texture -> batch
  const order = [];              // textures in first-use order this frame
  let space = 'world';

  /* Scenes that draw INSIDE the play frame but behind the UI: the menu's camp
     diorama and the profile's doll. The caller owns them; this list only says
     when. Cleared at the end of every render, exactly like post.*, so a screen
     that forgets its scene cannot leak it into the next frame. */
  const prePasses = [];

  function addPrePass(scene3d, camera3d) {
    if (scene3d && camera3d) prePasses.push({ scene: scene3d, camera: camera3d });
  }

  /* A quad that must land over everything else this frame, whatever order its
     texture was first used in (the pointer, which is drawn last by the loop but
     shared the white batch with the earliest panel). */
  let topFlag = false;
  const TOP_ORDER = 100000;

  function topQuad(tex, x, y, w, h, color, alpha) {
    topFlag = true;
    quad(tex, x, y, w, h, 0, 1, 1, 0, color == null ? '#ffffff' : color,
         alpha == null ? 1 : alpha);
    topFlag = false;
  }

  function batchFor(tex) {
    let b = batches.get(tex);
    if (!b) {
      b = {
        tex: tex, pos: [], uv: [], col: [], idx: [], mesh: null, order: 0,
        top: false
      };
      batches.set(tex, b);
    }
    return b;
  }

  function resetBatches() {
    batches.forEach(function (b) {
      b.pos.length = 0; b.uv.length = 0; b.col.length = 0; b.idx.length = 0;
      b.top = false;
      if (b.mesh) b.mesh.visible = false;
    });
    order.length = 0;
    space = 'world';
  }

  /* One quad, in whatever space is active. Rotation and flips are applied to
     the corners here so the shader stays a plain textured quad. `rot` turns the
     quad about (pivotX, pivotY) measured from its own top-left, which is how the
     old canvas transform worked for weapon swings. */
  let badQuads = 0;

  /* Strict: a numeric string or null is a bug in the caller, not a coordinate. */
  function isNum(v) { return typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity; }

  function quad(tex, x, y, w, h, u0, v0, u1, v1, color, alpha, rot, flipX, flipY,
                pivotX, pivotY) {
    if (!ready) return;
    if (w === 0 || h === 0) return;
    /* A non-finite coordinate would poison the whole batched buffer (every
       vertex in a shared attribute is uploaded), so drop the quad and name the
       call site once instead of letting it blank the frame. */
    if (!(isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h))) {
      if (badQuads < 4) {
        badQuads++;
        console.warn('UI3: dropped a quad with bad geometry',
                     [x, y, w, h], new Error().stack.split('\n').slice(1, 4).join(' | '));
      }
      return;
    }
    const c = parseColor(color);
    const a = alpha == null ? 1 : alpha;
    if (a <= 0.003) return;

    const b = batchFor(tex || white());
    if (b.pos.length === 0) { b.order = order.length; order.push(b.tex); }
    if (topFlag) b.top = true;

    const x0 = x, y0 = y, x1 = x + w, y1 = y + h;
    let cxs = [x0, x1, x1, x0];
    let cys = [y0, y0, y1, y1];
    let us = [u0, u1, u1, u0];
    let vs = [v0, v0, v1, v1];

    if (flipX) { us = [u1, u0, u0, u1]; }
    if (flipY) { vs = [v1, v1, v0, v0]; }

    if (rot) {
      const pvx = x + (pivotX == null ? w / 2 : pivotX);
      const pvy = y + (pivotY == null ? h / 2 : pivotY);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      for (let i = 0; i < 4; i++) {
        const dx = cxs[i] - pvx, dy = cys[i] - pvy;
        cxs[i] = pvx + dx * cs - dy * sn;
        cys[i] = pvy + dx * sn + dy * cs;
      }
    }

    const base = b.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      if (!(isFinite(cxs[i]) && isFinite(cys[i]))) {
        if (badQuads < 4) {
          badQuads++;
          console.warn('UI3: dropped a rotated quad with bad geometry',
                       [x, y, w, h, rot, pivotX, pivotY, flipX, flipY],
                       new Error().stack.split('\n').slice(1, 4).join(' | '));
        }
        return;
      }
    }

    for (let i = 0; i < 4; i++) {
      b.pos.push(cxs[i], cys[i], 0);
      b.uv.push(us[i], vs[i]);
      b.col.push(c.r, c.g, c.b, c.a * a);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // --- flush ----------------------------------------------------------------

  function flushBatches() {
    for (let i = 0; i < order.length; i++) {
      const tex = order[i];
      const b = batches.get(tex);
      if (!b || b.idx.length === 0) continue;
      let mesh = b.mesh;
      if (!mesh) {
        const geo = new THREE.BufferGeometry();
        const cap = 4096;      // quads; grown on demand below
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 12), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cap * 8), 2));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 16), 4));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(cap * 6), 1));
        const mat = new THREE.MeshBasicMaterial({
          map: tex, transparent: true, vertexColors: true,
          depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          toneMapped: false, fog: false
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        b.mesh = mesh;
        uiScene.add(mesh);
      }
      mesh.visible = true;
      mesh.renderOrder = b.top ? TOP_ORDER + i : i;
      upload(mesh.geometry, b);
    }
  }

  function upload(geo, b) {
    const n = b.pos.length;        // floats (3 per vertex)
    const verts = n / 3;           // vertices
    const nv = verts;
    let posAttr = geo.getAttribute('position');
    if (posAttr.array.length < n) {
      const cap = Math.ceil(verts * 1.5);
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cap * 2), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 4), 4));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(cap * 2), 1));
      posAttr = geo.getAttribute('position');
      b.idx.length = 0;
      for (let q = 0; q < verts / 4; q++) {
        const base = q * 4;
        b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const p = posAttr.array;
    const u = geo.getAttribute('uv').array;
    const c = geo.getAttribute('color').array;
    const ix = geo.getIndex().array;
    /* A single NaN here poisons the whole shared attribute (the bounding sphere
       is computed over the full array, and one bad vertex can blank the batch),
       so every value is sanitised on the way in and the first offender in a
       frame is named. */
    for (let i = 0; i < nv; i++) {
      const v = i * 3, t = i * 2, q = i * 4;
      const bad = !isNum(b.pos[v]) || !isNum(b.pos[v + 1]);
      if (bad && badQuads < 6) {
        badQuads++;
        console.warn('UI3: bad vertex', i, 'quad', Math.floor(i / 4),
                     'src', b.pos.slice(Math.floor(i / 4) * 12, Math.floor(i / 4) * 12 + 12));
      }
      p[v] = isNum(b.pos[v]) ? b.pos[v] : 0;
      p[v + 1] = isNum(b.pos[v + 1]) ? b.pos[v + 1] : 0;
      p[v + 2] = 0;
      u[t] = isNum(b.uv[t]) ? b.uv[t] : 0;
      u[t + 1] = isNum(b.uv[t + 1]) ? b.uv[t + 1] : 0;
      c[q] = isNum(b.col[q]) ? b.col[q] : 0;
      c[q + 1] = isNum(b.col[q + 1]) ? b.col[q + 1] : 0;
      c[q + 2] = isNum(b.col[q + 2]) ? b.col[q + 2] : 0;
      c[q + 3] = isNum(b.col[q + 3]) ? b.col[q + 3] : 1;
    }
    for (let i = 0; i < b.idx.length; i++) ix[i] = b.idx[i];

    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('uv').needsUpdate = true;
    geo.getAttribute('color').needsUpdate = true;
    geo.getIndex().needsUpdate = true;
    geo.setDrawRange(0, b.idx.length);
    geo.computeBoundingSphere();
  }

  // --- post overlay ---------------------------------------------------------

  const post = {
    fadeColor: 0x0d0b12, fade: 0,
    flashColor: 0xffffff, flash: 0,
    tintColor: 0x000000, tint: 0,
    vignette: 0, grain: 0, darken: 0,
    // Not a post effect: this one is drawn between the world and the UI.
    dimColor: 0x0d0b12, dim: 0
  };

  function buildPost() {
    postScene = new THREE.Scene();
    postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postMat = new THREE.ShaderMaterial({
      uniforms: {
        uFade: { value: new THREE.Color(post.fadeColor) },
        uFadeA: { value: 0 },
        uFlash: { value: new THREE.Color(post.flashColor) },
        uFlashA: { value: 0 },
        uTint: { value: new THREE.Color(post.tintColor) },
        uTintA: { value: 0 },
        uVig: { value: 0 },
        uGrain: { value: 0 },
        uDark: { value: 0 },
        uTime: { value: 0 }
      },
      vertexShader:
        'varying vec2 vUv;' +
        'void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:
        'uniform vec3 uFade; uniform float uFadeA;' +
        'uniform vec3 uFlash; uniform float uFlashA;' +
        'uniform vec3 uTint; uniform float uTintA;' +
        'uniform float uVig; uniform float uGrain; uniform float uDark; uniform float uTime;' +
        'varying vec2 vUv;' +
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }' +
        'void main() {' +
        '  float d = length(vUv - vec2(0.5)) * 1.4142;' +
        '  float vig = uVig * smoothstep(0.42, 1.05, d);' +
        '  float n = (hash(vUv * 512.0 + uTime) - 0.5) * uGrain;' +
        '  float a = max(0.0, uFadeA + uFlashA + uTintA) + uDark + vig + abs(n) * 0.6;' +
        '  vec3 c = uFade * uFadeA + uFlash * uFlashA + uTint * uTintA;' +
        '  c = c / max(0.0001, uFadeA + uFlashA + uTintA);' +
        '  c += n * 0.9;' +
        '  gl_FragColor = vec4(max(c, 0.0), clamp(a, 0.0, 1.0));' +
        '}',
      transparent: true, depthTest: false, depthWrite: false, toneMapped: false
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
    q.frustumCulled = false;
    postScene.add(q);
  }

  /* The behind-the-panel dim. `fade` is a post pass -- it paints over whatever
     was drawn after the call, which is what a cutscene's open-on-black and the
     death screen need. A panel wants the opposite: the room behind it quiet,
     the panel itself bright. In the 2D canvas that was a fillRect at the call
     site, so it dimmed only what had already been drawn. This is that, as its
     own small pass rendered between the world and the UI. */
  let dimScene = null, dimMat = null;

  function buildDim() {
    dimScene = new THREE.Scene();
    dimMat = new THREE.MeshBasicMaterial({
      color: post.dimColor, transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, toneMapped: false, fog: false,
      // The UI camera mirrors Y (top = 0, bottom = C.H), which reverses the
      // winding, so a front-facing plane reads as back-facing and gets culled.
      // Every UI batch sets this for the same reason.
      side: THREE.DoubleSide
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(C.W, C.H), dimMat);
    // The UI camera has y growing downward from (0, 0) at the top left.
    q.position.set(C.W / 2, C.H / 2, 0);
    q.frustumCulled = false;
    dimScene.add(q);
  }

  // --- lifecycle ------------------------------------------------------------

  function init(gl) {
    if (ready) return true;
    renderer = gl;
    if (!renderer) return false;

    uiScene = new THREE.Scene();
    // y grows DOWNWARD, exactly like the 2D canvas did, so every call site that
    // assumed canvas coordinates keeps working.
    uiCam = new THREE.OrthographicCamera(0, C.W, 0, C.H, -100, 100);

    buildPost();
    buildDim();
    if (DS.Font3) {
      bakeFace('MICRO', DS.Font3.MICRO, DS.Font3.MICRO_W, DS.Font3.MICRO_H, 1);
      bakeFace('BODY', DS.Font3.BODY, DS.Font3.BODY_W, DS.Font3.BODY_H, 1);
      bakeFace('TITLE', DS.Font3.TITLE, DS.Font3.TITLE_W, DS.Font3.TITLE_H, 1);
    }
    ready = true;
    resize();
    return true;
  }

  /* The ONE place the play frame's scale is decided. The window is filled by the
     largest whole multiple of the logical frame that fits, so every art pixel
     lands on the same number of screen pixels and text stays crisp; the 2D art
     is authored at RS detail, so multiples of RS are the crisp ones. A window
     too small for MIN_SCALE gets a fractional fill rather than a frame smaller
     than the art it holds.

     Everything else reads this: the world's play viewport (renderer3d),
     DS.R.fitScale, and the pointer, which is sized in screen pixels and so has
     to know how big a logical unit is. Nobody recomputes it. */
  function fitScale() {
    const fill = Math.max(0.5, Math.min(window.innerWidth / C.W,
                                        window.innerHeight / C.H));
    const whole = Math.floor(fill / C.RS) * C.RS;
    if (whole >= MIN_SCALE && fill - whole <= whole * SNAP) return whole;
    return fill;
  }

  function resize() {
    if (!renderer) return;
    const W = window.innerWidth, H = window.innerHeight;
    const scale = fitScale();
    view.scale = scale;
    view.w = Math.round(C.W * scale);
    view.h = Math.round(C.H * scale);
    view.x = Math.round((W - view.w) / 2);
    view.y = Math.round((H - view.h) / 2);
  }

  function begin() { resetBatches(); }

  function render(time) {
    if (!ready || !renderer) return;
    flushBatches();

    const W = renderer.domElement.clientWidth || renderer.domElement.width;
    const H = renderer.domElement.clientHeight || renderer.domElement.height;

    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setViewport(view.x, H - (view.y + view.h), view.w, view.h);
    renderer.setScissor(view.x, H - (view.y + view.h), view.w, view.h);
    renderer.clearDepth();
    /* 3D content that belongs inside the play frame but behind the UI: the
       menu's camp diorama and the profile's doll. Rendered after the depth
       clear so they float in the frame instead of z-fighting the world. */
    for (let i = 0; i < prePasses.length; i++) {
      renderer.render(prePasses[i].scene, prePasses[i].camera);
    }
    /* Between the world and the UI: the room behind a panel goes quiet while
       the panel keeps its own brightness (see DS.R.dimBehind). */
    if (post.dim > 0) {
      dimMat.color.setHex(post.dimColor);
      dimMat.opacity = post.dim;
      renderer.render(dimScene, uiCam);
    }
    renderer.render(uiScene, uiCam);

    // The overlay covers the whole window, so a fade hides whatever the world
    // is doing outside the logical frame too.
    if (post.fade > 0 || post.flash > 0 || post.tint > 0 ||
        post.vignette > 0 || post.grain > 0 || post.darken > 0) {
      const u = postMat.uniforms;
      u.uFade.value.setHex(post.fadeColor); u.uFadeA.value = post.fade;
      u.uFlash.value.setHex(post.flashColor); u.uFlashA.value = post.flash;
      u.uTint.value.setHex(post.tintColor); u.uTintA.value = post.tint;
      u.uVig.value = post.vignette;
      u.uGrain.value = post.grain;
      u.uDark.value = post.darken;
      u.uTime.value = time || 0;
      renderer.setViewport(0, 0, W, H);
      renderer.setScissor(0, 0, W, H);
      renderer.render(postScene, postCam);
    }

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.autoClear = true;

    post.fade = 0; post.flash = 0; post.tint = 0;
    post.vignette = 0; post.grain = 0; post.darken = 0; post.dim = 0;
    prePasses.length = 0;
  }

  // --- text -----------------------------------------------------------------

  function faceOf(name) { return FACES[name] || FACES.BODY; }

  function textWidth(str, s) {
    s = s || 1;
    if (str == null) return 0;
    str = String(str);
    if (!str.length) return 0;
    return (str.length * 6 - 1) * s;
  }

  function textSmallWidth(str) {
    if (str == null) return 0;
    str = String(str);
    if (!str.length) return 0;
    return str.length * 4 - 1;
  }

  /* Faces are detailed at twice the logical cell: BODY's 10x14 art is one 5x7
     cell, MICRO's 6x10 art is one 3x5 cell, so they are drawn at half-step.
     TITLE's 20x28 art is two cells wide, so one logical unit of `s` is 2x the
     body size -- a heading at s=1 is what the old renderer called scale 2. */
  const FACE_METRIC = {
    MICRO: { step: 0.5, advance: 4 },
    BODY: { step: 0.5, advance: 6 },
    TITLE: { step: 0.5, advance: 12 }
  };

  /* Draw a run of glyphs. The quad covers the glyph's cell PLUS the baked
     outline ring around it, so the metric origin stays exactly where the old
     fillRect pass put it. */
  function text(str, x, y, color, s, name, shadow, alpha) {
    if (!ready) return;
    s = s || 1;
    const tint = alpha == null ? 1 : alpha;
    if (tint <= 0.004) return;
    str = String(str == null ? '' : str).toUpperCase();
    const face = faceOf(name);
    if (!face || !face.tex) return;

    const metric = FACE_METRIC[name] || FACE_METRIC.BODY;
    const step = metric.step * s;
    const advance = metric.advance * s;
    const qx = -(1 * step), qy = -(1 * step);
    const qw = (face.gw + 2) * step, qh = (face.gh + 2) * step;
    const u0 = (rect => (rect.x - 1) / face.atlasW);
    let px = x;

    const draw = function (dx, dy, col, alpha) {
      let cx = px;
      for (let i = 0; i < str.length; i++) {
        const rect = face.rects[keyFor(str[i])];
        if (rect) {
          quad(face.tex, cx + qx + dx, y + qy + dy, qw, qh,
               u0(rect), 1 - (rect.y - 1) / face.atlasH,
               (rect.x + rect.w + 1) / face.atlasW, 1 - (rect.y + rect.h + 1) / face.atlasH,
               col, alpha * tint);
        }
        cx += advance;
      }
    };

    if (shadow) draw(s * 0.5, s * 0.5, '#0d0b12', 0.8);
    draw(0, 0, color, 1);
  }

  function textTitleWidth(str, s) {
    s = s || 1;
    if (str == null) return 0;
    str = String(str);
    if (!str.length) return 0;
    return (str.length * 12 - 2) * s;
  }

  /* '#rrggbb' / 'rgba(...)' -> the 0xRRGGBB integer Three.js colours want. */
  function hexOf(str) {
    const c = parseColor(str);
    return ((Math.round(DS.M.clamp(c.r, 0, 1) * 255) << 16) |
            (Math.round(DS.M.clamp(c.g, 0, 1) * 255) << 8) |
            Math.round(DS.M.clamp(c.b, 0, 1) * 255));
  }

  DS.UI3 = {
    get scene() { return uiScene; },
    get postScene() { return postScene; },
    hexOf: hexOf,
    textTitleWidth: textTitleWidth,
    init: init,
    resize: resize,
    get ready() { return ready; },
    get view() { return view; },
    begin: begin,
    render: render,
    fitScale: fitScale,
    addPrePass: addPrePass,
    topQuad: topQuad,
    quad: quad,
    /* quad() with an explicit pivot, for the few call sites that rotate a
       sprite about a point that is not its centre (weapon swings, trails). */
    quadAt: function (tex, x, y, w, h, u0, v0, u1, v1, color, alpha,
                      rot, flipX, flipY, pivotX, pivotY) {
      quad(tex, x, y, w, h, u0, v0, u1, v1, color, alpha, rot, flipX, flipY,
           pivotX, pivotY);
    },
    text: text,
    textWidth: textWidth,
    textSmallWidth: textSmallWidth,
    texFor: texFor,
    radial: radial,
    white: white,
    setSpace: function (s) { space = s; },
    get space() { return space; },
    post: post,
    _bakeFace: bakeFace            // used by tools/probes
  };
})(window.DS);
