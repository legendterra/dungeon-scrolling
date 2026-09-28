/* FX3D ribbon trails: a triangle strip dragged behind something that moves.

   Two ways to feed one:
     blade  two edge points per sample (hilt side, tip side) - the swept
            surface a weapon cuts through the air, bright along the cutting edge
     line   one centre point + width per sample, turned to face the camera -
            arrows, orbs, dash streaks

   Every ribbon in the game shares ONE BufferGeometry and ONE ShaderMaterial,
   so all trails together are a single draw call. Samples age in frames and die
   after `life`; a ribbon that is no longer fed simply runs out of samples and
   frees itself, so an owner can walk away from its trail (an arrow that hits a
   wall) without cleaning up. Between samples the strip is Catmull-Rom
   subdivided, so a fast swing sampled once a frame still draws a smooth arc
   rather than a polygon.

   The shader does the look: a gradient from the edge colour into a white-hot
   core, fading and narrowing toward the old end, and scrolling value noise that
   dissolves the tail into wisps instead of letting it just go transparent. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const SUB = 3;                 // subdivisions between two samples

  const VERT = [
    'attribute vec2 aUv;',
    'attribute vec3 aCol;',
    'attribute vec3 aCol2;',
    'attribute vec4 aMisc;',
    'varying vec2 vUv;',
    'varying vec3 vCol;',
    'varying vec3 vCol2;',
    'varying vec4 vMisc;',
    'void main() {',
    '  vUv = aUv; vCol = aCol; vCol2 = aCol2; vMisc = aMisc;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  const FRAG = [
    'uniform float uTime;',
    'varying vec2 vUv;',
    'varying vec3 vCol;',
    'varying vec3 vCol2;',
    'varying vec4 vMisc;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'void main() {',
    '  float u = vUv.x; float v = vUv.y;',
    '  float alpha = vMisc.x; float seed = vMisc.y; float mode = vMisc.z; float hot = vMisc.w;',
    '  float n = noise(vec2(u * 7.0 - uTime * 0.12 + seed * 17.0, v * 3.0 + seed * 5.0));',
    '  n = 0.65 * n + 0.35 * noise(vec2(u * 17.0 - uTime * 0.2, v * 7.0 - seed));',
    '  float dissolve = smoothstep(u * 1.05 - 0.28, u * 1.05 + 0.1, n);',
    '  float lenFade = pow(max(1.0 - u, 0.0), 1.3);',
    '  float a; vec3 col;',
    '  if (mode < 0.5) {',
    '    float edge = smoothstep(0.5, 1.0, v);',
    '    float rim = smoothstep(0.86, 0.98, v) * (1.0 - smoothstep(0.985, 1.0, v));',
    '    float body = smoothstep(0.0, 0.6, v);',
    '    a = lenFade * (0.28 * body + 0.7 * edge + 0.9 * rim) * mix(1.0, dissolve, 0.8) * alpha;',
    '    col = mix(vCol2, vCol, edge * edge) * hot * (1.0 + 1.6 * rim * (1.0 - u));',
    '  } else {',
    '    float x = 1.0 - abs(v * 2.0 - 1.0);',
    '    float core = pow(x, 4.0);',
    '    a = lenFade * (0.45 * x + core) * mix(1.0, dissolve, 0.6) * alpha;',
    '    col = mix(vCol2, vCol, core) * hot * (1.0 + core * (1.0 - u));',
    '  }',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  function create(maxRibbons, maxSamples, renderOrder) {
    const R = maxRibbons, NS = maxSamples;
    const PTS = (NS - 1) * SUB + 1;          // points per ribbon after subdivision
    const VPR = PTS * 2;                     // vertices per ribbon
    const NV = R * VPR;

    // Per-ribbon state, flat arrays.
    const S = new Float32Array(R * NS * 7);  // ax ay az bx by bz age  (line: cx cy cz w - - age)
    const count = new Int32Array(R);
    const live = new Uint8Array(R);
    const fed = new Uint8Array(R);
    const gen = new Int32Array(R);
    const released = new Uint8Array(R);
    const mode = new Uint8Array(R);
    const lifeOf = new Float32Array(R);
    const colA = new Float32Array(R * 3);    // core
    const colB = new Float32Array(R * 3);    // edge / tint
    const hotOf = new Float32Array(R);
    const alphaOf = new Float32Array(R);
    const seedOf = new Float32Array(R);
    const dirty = new Uint8Array(R);

    const geo = new THREE.BufferGeometry();
    function attr(name, size) {
      const a = new THREE.BufferAttribute(new Float32Array(NV * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    }
    const aPos = attr('position', 3);
    const aUv = attr('aUv', 2);
    const aCol = attr('aCol', 3);
    const aCol2 = attr('aCol2', 3);
    const aMisc = attr('aMisc', 4);
    const index = new Uint16Array(R * (PTS - 1) * 6);
    let q = 0;
    for (let r = 0; r < R; r++) {
      const base = r * VPR;
      for (let j = 0; j < PTS - 1; j++) {
        const v0 = base + j * 2;
        index[q++] = v0; index[q++] = v0 + 1; index[q++] = v0 + 2;
        index[q++] = v0 + 1; index[q++] = v0 + 3; index[q++] = v0 + 2;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder || 0;
    mesh.name = 'fx3d-ribbons';

    let camera = null;
    function setCamera(c) { camera = c; }

    /* A ribbon handle is (slot + 1) * 1024 + generation, so a stale handle from
       a ribbon that has since been recycled is recognised and ignored. */
    function handle(r) { return (r + 1) * 1024 + (gen[r] & 1023); }
    function slotOf(h) {
      if (!(h > 0)) return -1;
      const r = Math.floor(h / 1024) - 1;
      if (r < 0 || r >= R || !live[r] || (gen[r] & 1023) !== h % 1024) return -1;
      return r;
    }

    function acquire(isLine, life, core, edge, hot, alpha) {
      let r = -1;
      for (let i = 0; i < R; i++) if (!live[i]) { r = i; break; }
      if (r < 0) {
        // Full: recycle the released ribbon with the fewest samples left.
        let best = 1e9;
        for (let i = 0; i < R; i++) if (released[i] && count[i] < best) { best = count[i]; r = i; }
        if (r < 0) return -1;
      }
      live[r] = 1; fed[r] = 1; released[r] = 0; count[r] = 0; gen[r]++;
      mode[r] = isLine ? 1 : 0;
      lifeOf[r] = life;
      colA[r * 3] = (core >> 16 & 255) / 255; colA[r * 3 + 1] = (core >> 8 & 255) / 255; colA[r * 3 + 2] = (core & 255) / 255;
      colB[r * 3] = (edge >> 16 & 255) / 255; colB[r * 3 + 1] = (edge >> 8 & 255) / 255; colB[r * 3 + 2] = (edge & 255) / 255;
      hotOf[r] = hot == null ? 1.4 : hot;
      alphaOf[r] = alpha == null ? 1 : alpha;
      seedOf[r] = Math.random();
      dirty[r] = 1;
      return handle(r);
    }

    function shift(r) {
      // Newest sample lives at index 0: make room by sliding the rest down.
      const o = r * NS * 7;
      const n = Math.min(count[r], NS - 1);
      for (let i = n; i > 0; i--) {
        const d = o + i * 7, s = o + (i - 1) * 7;
        S[d] = S[s]; S[d + 1] = S[s + 1]; S[d + 2] = S[s + 2];
        S[d + 3] = S[s + 3]; S[d + 4] = S[s + 4]; S[d + 5] = S[s + 5]; S[d + 6] = S[s + 6];
      }
      count[r] = n + 1;
      return o;
    }

    function pushBlade(h, ax, ay, az, bx, by, bz) {
      const r = slotOf(h);
      if (r < 0 || released[r]) return false;
      const o = shift(r);
      S[o] = ax; S[o + 1] = ay; S[o + 2] = az; S[o + 3] = bx; S[o + 4] = by; S[o + 5] = bz; S[o + 6] = 0;
      fed[r] = 1; dirty[r] = 1;
      return true;
    }

    function pushLine(h, x, y, z, width) {
      const r = slotOf(h);
      if (r < 0 || released[r]) return false;
      const o = shift(r);
      S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = width; S[o + 4] = 0; S[o + 5] = 0; S[o + 6] = 0;
      fed[r] = 1; dirty[r] = 1;
      return true;
    }

    function release(h) {
      const r = slotOf(h);
      if (r >= 0) released[r] = 1;
    }

    function isLive(h) {
      const r = slotOf(h);
      return r >= 0 && !released[r];
    }

    // --- geometry -------------------------------------------------------------

    function cr(p0, p1, p2, p3, t) {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                    (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }

    const tmp = new Float32Array(PTS * 7);   // subdivided points: 6 coords + age

    function collapse(r) {
      const P = aPos.array, M = aMisc.array;
      const v0 = r * VPR;
      for (let v = 0; v < VPR; v++) {
        P[(v0 + v) * 3] = 0; P[(v0 + v) * 3 + 1] = -9999; P[(v0 + v) * 3 + 2] = 0;
        M[(v0 + v) * 4] = 0;
      }
    }

    function build(r) {
      const n = count[r];
      const o = r * NS * 7;
      if (n < 2) { collapse(r); return; }
      // Subdivide every coordinate channel with Catmull-Rom.
      let m = 0;
      for (let i = 0; i < n - 1; i++) {
        const i0 = Math.max(0, i - 1), i2 = i + 1, i3 = Math.min(n - 1, i + 2);
        for (let s = 0; s < SUB; s++) {
          const t = s / SUB;
          const d = m * 7;
          for (let c = 0; c < 6; c++) {
            tmp[d + c] = cr(S[o + i0 * 7 + c], S[o + i * 7 + c], S[o + i2 * 7 + c], S[o + i3 * 7 + c], t);
          }
          tmp[d + 6] = S[o + i * 7 + 6] + (S[o + i2 * 7 + 6] - S[o + i * 7 + 6]) * t;
          m++;
        }
      }
      const last = (n - 1) * 7, dl = m * 7;
      for (let c = 0; c < 7; c++) tmp[dl + c] = S[o + last + c];
      m++;

      const P = aPos.array, U = aUv.array, CA = aCol.array, CB = aCol2.array, MI = aMisc.array;
      const v0 = r * VPR;
      const life = lifeOf[r];
      const isLine = mode[r] === 1;
      const cx = camera ? camera.position.x : 0, cy = camera ? camera.position.y : 0,
            cz = camera ? camera.position.z : 30;
      for (let j = 0; j < PTS; j++) {
        const jj = j < m ? j : m - 1;
        const d = jj * 7;
        const u = Math.min(1, tmp[d + 6] / life);
        let ax, ay, az, bx, by, bz;
        if (isLine) {
          // Tangent from the neighbours, side vector = tangent x view.
          const pa = Math.max(0, jj - 1) * 7, pb = Math.min(m - 1, jj + 1) * 7;
          let tx = tmp[pb] - tmp[pa], ty = tmp[pb + 1] - tmp[pa + 1], tz = tmp[pb + 2] - tmp[pa + 2];
          const vx = cx - tmp[d], vy = cy - tmp[d + 1], vz = cz - tmp[d + 2];
          let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
          const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
          if (sl < 1e-6) { sx = 0; sy = 1; sz = 0; } else { sx /= sl; sy /= sl; sz /= sl; }
          const w = tmp[d + 3] * 0.5 * Math.pow(1 - u, 0.6);
          ax = tmp[d] - sx * w; ay = tmp[d + 1] - sy * w; az = tmp[d + 2] - sz * w;
          bx = tmp[d] + sx * w; by = tmp[d + 1] + sy * w; bz = tmp[d + 2] + sz * w;
        } else {
          // The old end narrows toward the cutting edge.
          const k = u * 0.55;
          bx = tmp[d + 3]; by = tmp[d + 4]; bz = tmp[d + 5];
          ax = tmp[d] + (bx - tmp[d]) * k; ay = tmp[d + 1] + (by - tmp[d + 1]) * k; az = tmp[d + 2] + (bz - tmp[d + 2]) * k;
        }
        const va = v0 + j * 2, vb = va + 1;
        P[va * 3] = ax; P[va * 3 + 1] = ay; P[va * 3 + 2] = az;
        P[vb * 3] = bx; P[vb * 3 + 1] = by; P[vb * 3 + 2] = bz;
        U[va * 2] = u; U[va * 2 + 1] = 0;
        U[vb * 2] = u; U[vb * 2 + 1] = 1;
        for (let c = 0; c < 3; c++) {
          CA[va * 3 + c] = CA[vb * 3 + c] = colA[r * 3 + c];
          CB[va * 3 + c] = CB[vb * 3 + c] = colB[r * 3 + c];
        }
        const alpha = j < m ? alphaOf[r] : 0;
        MI[va * 4] = MI[vb * 4] = alpha;
        MI[va * 4 + 1] = MI[vb * 4 + 1] = seedOf[r];
        MI[va * 4 + 2] = MI[vb * 4 + 2] = mode[r];
        MI[va * 4 + 3] = MI[vb * 4 + 3] = hotOf[r];
      }
    }

    let anyVisible = false;

    function update(dt, time) {
      mat.uniforms.uTime.value = time;
      let touched = false;
      anyVisible = false;
      for (let r = 0; r < R; r++) {
        if (!live[r]) continue;
        const o = r * NS * 7;
        // Age every sample, drop the dead tail.
        let n = count[r];
        for (let i = 0; i < n; i++) S[o + i * 7 + 6] += dt;
        while (n > 0 && S[o + (n - 1) * 7 + 6] > lifeOf[r]) n--;
        if (n !== count[r]) dirty[r] = 1;
        count[r] = n;
        // An owner that stops feeding its ribbon has let go of it. Only judged
        // on frames where the game advanced: a render with no tick feeds nothing.
        if (dt > 0) {
          if (!fed[r]) released[r] = 1;
          fed[r] = 0;
        }
        if (released[r] && n === 0) {
          live[r] = 0;
          collapse(r);
          touched = true;
          continue;
        }
        if (dt > 0) dirty[r] = 1;
        if (dirty[r]) { build(r); dirty[r] = 0; touched = true; }
        if (n >= 2) anyVisible = true;
      }
      if (touched) {
        aPos.needsUpdate = true; aUv.needsUpdate = true; aCol.needsUpdate = true;
        aCol2.needsUpdate = true; aMisc.needsUpdate = true;
      }
      mesh.visible = anyVisible;
    }

    function clear() {
      for (let r = 0; r < R; r++) { live[r] = 0; count[r] = 0; collapse(r); }
      aPos.needsUpdate = true; aMisc.needsUpdate = true;
      mesh.visible = false;
    }

    // Everything starts collapsed out of sight.
    for (let r = 0; r < R; r++) collapse(r);

    return {
      mesh: mesh, setCamera: setCamera, acquire: acquire, pushBlade: pushBlade,
      pushLine: pushLine, release: release, isLive: isLive, update: update, clear: clear,
      get live() { let n = 0; for (let r = 0; r < R; r++) n += live[r]; return n; }
    };
  }

  DS.FX3DRibbons = { create: create };
})(window.DS);
