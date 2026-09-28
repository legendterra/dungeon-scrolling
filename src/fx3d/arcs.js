/* FX3D arcs: slash crescents and shockwave rings, the two shapes that carry
   a swing and an impact.

   Both are the same thing - a band swept around a centre in some plane - so
   they share one system and one draw call. What makes this cheap is that an
   arc is written to the vertex buffer ONCE, when it spawns: every vertex
   carries its centre, its radial direction in the arc's plane, the arc's
   radius/width envelope and its birth time, and the vertex shader does the
   rest from a single uTime uniform. Nothing is rewritten per frame; a dead arc
   is simply collapsed by the shader until its slot is reused.

   Styles:
     0 ring    an energy ring that expands, thins and fades (impacts, casts)
     1 slash   a crescent that WIPES along its arc - bright head, soft tail,
               white-hot core line near the outer edge, tapered at both ends
     2 shock   a thick ground shockwave broken up by noise (slams, landings)

   The plane is given by two unit vectors U and V: the band runs through
   centre + (cos a * U + sin a * V) * radius for a from a0 to a1. A vertical
   slash in the screen plane is U = forward, V = up; a horizontal slash in 2.5D
   is U = forward, V = toward the camera, tipped up a little so it reads. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const SEG = 32;
  const VPA = (SEG + 1) * 2;     // vertices per arc

  const VERT = [
    'uniform float uTime;',
    'attribute vec3 aCenter;',
    'attribute vec3 aDir;',
    'attribute vec4 aShape;',
    'attribute vec2 aUv;',
    'attribute vec3 aCol;',
    'attribute vec3 aCol2;',
    'attribute vec4 aTime;',
    'varying vec2 vUv;',
    'varying vec3 vCol;',
    'varying vec3 vCol2;',
    'varying float vAge;',
    'varying float vStyle;',
    'varying float vHot;',
    'void main() {',
    '  float age = (uTime - aTime.x) / aTime.y;',
    '  vAge = age; vStyle = aTime.z; vHot = aTime.w;',
    '  vUv = aUv; vCol = aCol; vCol2 = aCol2;',
    '  float a = clamp(age, 0.0, 1.0);',
    '  float e = 1.0 - pow(1.0 - a, 3.0);',
    '  float R = mix(aShape.x, aShape.y, e);',
    '  float taper = aShape.w > 0.5 ? pow(max(sin(3.14159 * aUv.x), 0.0), 0.75) : 1.0;',
    '  float W = aShape.z * taper;',
    '  if (aTime.z < 0.5 || aTime.z > 1.5) W *= (1.0 - 0.55 * e);',
    '  vec3 p = aCenter + aDir * (R + (aUv.y - 0.5) * W);',
    '  if (age < 0.0 || age > 1.0) p = vec3(0.0, -9999.0, 0.0);',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');

  const FRAG = [
    'varying vec2 vUv;',
    'varying vec3 vCol;',
    'varying vec3 vCol2;',
    'varying float vAge;',
    'varying float vStyle;',
    'varying float vHot;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}',
    'void main() {',
    '  float u = vUv.x; float v = vUv.y; float age = vAge;',
    '  float a; vec3 col;',
    '  if (vStyle > 0.5 && vStyle < 1.5) {',
    '    float head = min(age / 0.3, 1.0) * 1.3;',
    '    float seg = head - u;',
    '    float along = seg < 0.0 ? 0.0 : exp(-seg * 1.5);',
    '    float headSoft = smoothstep(0.0, 0.04, seg);',
    '    float fade = 1.0 - smoothstep(0.3, 1.0, age);',
    '    float core = exp(-pow((v - 0.8) * 7.0, 2.0));',
    '    float body = smoothstep(0.15, 0.85, v) * (1.0 - smoothstep(0.95, 1.0, v));',
    '    float n = noise(vec2(u * 22.0 - age * 9.0, v * 6.0));',
    '    a = along * headSoft * fade * (body * body * (0.35 + 0.5 * n) + core * 1.25);',
    '    col = mix(vCol2, vCol, clamp(core * 1.1, 0.0, 1.0)) * vHot * (0.85 + core * 1.3);',
    '  } else if (vStyle < 0.5) {',
    '    float band = sin(3.14159 * v); band *= band;',
    '    float lead = smoothstep(0.35, 0.8, v);',
    '    float fade = pow(max(1.0 - age, 0.0), 1.6);',
    '    a = band * fade * (0.45 + 0.55 * lead);',
    '    col = mix(vCol2, vCol, lead * band) * vHot;',
    '  } else {',
    '    float band = sin(3.14159 * v);',
    '    float n = noise(vec2(u * 46.0, v * 3.0 + age * 3.0));',
    '    float fade = pow(max(1.0 - age, 0.0), 1.2);',
    '    a = band * fade * smoothstep(0.2, 0.75, n + 0.3 * band);',
    '    col = mix(vCol2, vCol, band * band) * vHot;',
    '  }',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  function create(maxArcs, renderOrder) {
    const N = maxArcs;
    const NV = N * VPA;
    const geo = new THREE.BufferGeometry();
    function attr(name, size) {
      const a = new THREE.BufferAttribute(new Float32Array(NV * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    }
    // position is required by three but unused: the shader places everything.
    const aPos = attr('position', 3);
    const aCenter = attr('aCenter', 3);
    const aDir = attr('aDir', 3);
    const aShape = attr('aShape', 4);
    const aUv = attr('aUv', 2);
    const aCol = attr('aCol', 3);
    const aCol2 = attr('aCol2', 3);
    const aTime = attr('aTime', 4);
    const index = new Uint16Array(N * SEG * 6);
    let q = 0;
    for (let s = 0; s < N; s++) {
      for (let j = 0; j < SEG; j++) {
        const v0 = s * VPA + j * 2;
        index[q++] = v0; index[q++] = v0 + 1; index[q++] = v0 + 2;
        index[q++] = v0 + 1; index[q++] = v0 + 3; index[q++] = v0 + 2;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    // Every slot starts long dead.
    for (let v = 0; v < NV; v++) { aTime.array[v * 4] = -1e6; aTime.array[v * 4 + 1] = 1; }

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
    mesh.name = 'fx3d-arcs';

    const birth = new Float32Array(N).fill(-1e6);
    const lifeOf = new Float32Array(N).fill(1);
    let now = 0;

    const S = {};
    function spec() {
      S.x = 0; S.y = 0; S.z = 0;
      S.ux = 1; S.uy = 0; S.uz = 0; S.vx = 0; S.vy = 1; S.vz = 0;
      S.a0 = 0; S.a1 = Math.PI * 2; S.r0 = 0.2; S.r1 = 1; S.width = 0.3;
      S.style = 0; S.life = 20; S.core = 0xffffff; S.edge = 0xffffff; S.hot = 1.5;
      S.delay = 0; S.taper = -1;
      return S;
    }

    function pickSlot() {
      let best = 0, bestEnd = 1e9;
      for (let i = 0; i < N; i++) {
        const end = birth[i] + lifeOf[i];
        if (end < now) return i;
        if (end < bestEnd) { bestEnd = end; best = i; }
      }
      return best;
    }

    function emit(s) {
      const slot = pickSlot();
      const b = now + (s.delay || 0);
      birth[slot] = b; lifeOf[slot] = s.life;
      const cr = (s.core >> 16 & 255) / 255, cg = (s.core >> 8 & 255) / 255, cb = (s.core & 255) / 255;
      const er = (s.edge >> 16 & 255) / 255, eg = (s.edge >> 8 & 255) / 255, eb = (s.edge & 255) / 255;
      const taper = s.taper < 0 ? (s.style === 1 ? 1 : 0) : s.taper;
      const C = aCenter.array, Dr = aDir.array, SH = aShape.array, U = aUv.array,
            CA = aCol.array, CB = aCol2.array, T = aTime.array, P = aPos.array;
      const v0 = slot * VPA;
      for (let j = 0; j <= SEG; j++) {
        const u = j / SEG;
        const ang = s.a0 + (s.a1 - s.a0) * u;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const dx = ca * s.ux + sa * s.vx, dy = ca * s.uy + sa * s.vy, dz = ca * s.uz + sa * s.vz;
        for (let side = 0; side < 2; side++) {
          const v = v0 + j * 2 + side;
          C[v * 3] = s.x; C[v * 3 + 1] = s.y; C[v * 3 + 2] = s.z;
          P[v * 3] = s.x; P[v * 3 + 1] = s.y; P[v * 3 + 2] = s.z;
          Dr[v * 3] = dx; Dr[v * 3 + 1] = dy; Dr[v * 3 + 2] = dz;
          SH[v * 4] = s.r0; SH[v * 4 + 1] = s.r1; SH[v * 4 + 2] = s.width; SH[v * 4 + 3] = taper;
          U[v * 2] = u; U[v * 2 + 1] = side;
          CA[v * 3] = cr; CA[v * 3 + 1] = cg; CA[v * 3 + 2] = cb;
          CB[v * 3] = er; CB[v * 3 + 1] = eg; CB[v * 3 + 2] = eb;
          T[v * 4] = b; T[v * 4 + 1] = s.life; T[v * 4 + 2] = s.style; T[v * 4 + 3] = s.hot;
        }
      }
      if (slot < dirtyLo) dirtyLo = slot;
      if (slot > dirtyHi) dirtyHi = slot;
      return slot;
    }

    /* Several arcs can spawn in one frame, so the upload range is the span of
       every slot touched since the last flush, not just the last one. */
    let dirtyLo = N, dirtyHi = -1;
    const ALL = [aCenter, aPos, aDir, aShape, aUv, aCol, aCol2, aTime];
    function flush() {
      if (dirtyHi < dirtyLo) return;
      for (let i = 0; i < ALL.length; i++) {
        const a = ALL[i];
        a.updateRange.offset = dirtyLo * VPA * a.itemSize;
        a.updateRange.count = (dirtyHi - dirtyLo + 1) * VPA * a.itemSize;
        a.needsUpdate = true;
      }
      dirtyLo = N; dirtyHi = -1;
    }

    let visible = false;
    function update(time) {
      now = time;
      flush();
      mat.uniforms.uTime.value = time;
      visible = false;
      for (let i = 0; i < N; i++) {
        if (birth[i] + lifeOf[i] >= now) { visible = true; break; }
      }
      mesh.visible = visible;
    }

    function clear() {
      birth.fill(-1e6);
      const T = aTime.array;
      for (let v = 0; v < NV; v++) T[v * 4] = -1e6;
      aTime.updateRange.offset = 0; aTime.updateRange.count = -1;
      aTime.needsUpdate = true;
      mesh.visible = false;
    }

    return { mesh: mesh, spec: spec, emit: emit, update: update, clear: clear,
             get live() { let n = 0; for (let i = 0; i < N; i++) if (birth[i] + lifeOf[i] >= now) n++; return n; } };
  }

  DS.FX3DArcs = { create: create };
})(window.DS);
