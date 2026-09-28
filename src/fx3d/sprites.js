/* FX3D billboards: camera-facing soft sprites, the bulk of every effect.

   One system is ONE draw call: an InstancedBufferGeometry quad drawn once per
   live particle, with the particle's position, orientation, size, colour and
   atlas cell as per-instance attributes. The simulation runs on the CPU in a
   single Float32Array (STRIDE floats per slot); each frame the live slots are
   written compactly into the instance buffers and instanceCount says how many
   to draw. No allocation after construction.

   Three orientation modes:
     0  billboard  faces the camera, rotated by rot (+spin per frame)
     1  streak     stretched along the particle's own velocity - sparks and
                   speed lines point where they are going
     2  axis       stretched along a fixed world axis - lightning segments,
                   beams, anything drawn between two points

   Colour and alpha run from a start to an end value over life; size eases
   from size0 to size1. Colours may exceed 1: the scene target is half-float,
   so a hot core goes over the bloom threshold and glows. The shader writes raw
   display values (see postfx.js: the target is tagged sRGB and these passes
   never re-encode), so the numbers here are the colours you see. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const STRIDE = 32;
  // Slot layout
  const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, GRAV = 6, DRAG = 7,
        LIFE = 8, MAXLIFE = 9, S0 = 10, S1 = 11, ROT = 12, SPIN = 13,
        R0 = 14, G0 = 15, B0 = 16, R1 = 17, G1 = 18, B1 = 19, A0 = 20, A1 = 21,
        CELL = 22, MODE = 23, STRETCH = 24, AX = 25, AY = 26, AZ = 27,
        WOB = 28, WOBT = 29, ASPECT = 30, FADEIN = 31;

  const VERT = [
    'attribute vec3 iPos;',
    'attribute vec4 iAxis;',
    'attribute vec2 iSize;',
    'attribute vec4 iColor;',
    'attribute float iCell;',
    'varying vec2 vUv;',
    'varying vec4 vColor;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);',
    '  vec2 c = position.xy;',
    '  vec2 off;',
    '  if (dot(iAxis.xyz, iAxis.xyz) > 1e-10) {',
    '    vec2 a = (modelViewMatrix * vec4(iAxis.xyz, 0.0)).xy;',
    '    float l = length(a);',
    '    a = l > 1e-6 ? a / l : vec2(0.0, 1.0);',
    '    vec2 n = vec2(-a.y, a.x);',
    '    off = n * c.x * iSize.x + a * c.y * iSize.y;',
    '  } else {',
    '    float cs = cos(iAxis.w), sn = sin(iAxis.w);',
    '    vec2 q = c * iSize;',
    '    off = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);',
    '  }',
    '  mv.xy += off;',
    '  gl_Position = projectionMatrix * mv;',
    '  float cx = mod(iCell, 4.0);',
    '  float cy = floor(iCell / 4.0 + 0.01);',
    '  vUv = (vec2(cx, 3.0 - cy) + uv) * 0.25;',
    '  vColor = iColor;',
    '}'
  ].join('\n');

  const FRAG = [
    'uniform sampler2D map;',
    'varying vec2 vUv;',
    'varying vec4 vColor;',
    'void main() {',
    '  vec4 t = texture2D(map, vUv);',
    '  float a = t.a * vColor.a;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(vColor.rgb * t.rgb, a);',
    '}'
  ].join('\n');

  function create(capacity, additive, renderOrder) {
    const pool = DS.FX3DPool.create(capacity);
    const D = new Float32Array(capacity * STRIDE);

    const geo = new THREE.InstancedBufferGeometry();
    // A unit quad centred on the origin; uv 0..1 inside its atlas cell.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);

    function inst(name, size) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    }
    const aPos = inst('iPos', 3);
    const aAxis = inst('iAxis', 4);
    const aSize = inst('iSize', 2);
    const aColor = inst('iColor', 4);
    const aCell = inst('iCell', 1);
    geo.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: DS.FX3DAtlas.build() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder || 0;
    mesh.name = additive ? 'fx3d-sprites-add' : 'fx3d-sprites-alpha';

    /* The spawn spec: one reused object, reset by spec(). A preset fills it and
       calls emit(); nothing is allocated per particle. */
    const S = {};
    function spec() {
      S.x = 0; S.y = 0; S.z = 0; S.vx = 0; S.vy = 0; S.vz = 0;
      S.grav = 0; S.drag = 1; S.life = 20; S.size = 0.2; S.size1 = -1;
      S.rot = 0; S.spin = 0;
      S.r = 1; S.g = 1; S.b = 1; S.r1 = -1; S.g1 = -1; S.b1 = -1;
      S.a = 1; S.a1 = 0; S.cell = 0; S.mode = 0; S.stretch = 0;
      S.ax = 0; S.ay = 0; S.az = 0; S.wob = 0; S.aspect = 1; S.fadeIn = 0;
      return S;
    }

    function emit(s) {
      const id = pool.allocOrSteal();
      const o = id * STRIDE;
      D[o + PX] = s.x; D[o + PY] = s.y; D[o + PZ] = s.z;
      D[o + VX] = s.vx; D[o + VY] = s.vy; D[o + VZ] = s.vz;
      D[o + GRAV] = s.grav; D[o + DRAG] = s.drag;
      D[o + LIFE] = s.life; D[o + MAXLIFE] = s.life;
      D[o + S0] = s.size; D[o + S1] = s.size1 < 0 ? s.size : s.size1;
      D[o + ROT] = s.rot; D[o + SPIN] = s.spin;
      D[o + R0] = s.r; D[o + G0] = s.g; D[o + B0] = s.b;
      D[o + R1] = s.r1 < 0 ? s.r : s.r1;
      D[o + G1] = s.g1 < 0 ? s.g : s.g1;
      D[o + B1] = s.b1 < 0 ? s.b : s.b1;
      D[o + A0] = s.a; D[o + A1] = s.a1;
      D[o + CELL] = s.cell; D[o + MODE] = s.mode; D[o + STRETCH] = s.stretch;
      D[o + AX] = s.ax; D[o + AY] = s.ay; D[o + AZ] = s.az;
      D[o + WOB] = s.wob; D[o + WOBT] = Math.random() * 6.28;
      D[o + ASPECT] = s.aspect; D[o + FADEIN] = s.fadeIn;
      return id;
    }

    /* Advance every live particle by dt frames and repack the instance buffers. */
    function update(dt) {
      const P = aPos.array, X = aAxis.array, Z = aSize.array, C = aColor.array, L = aCell.array;
      let k = 0;
      for (let i = pool.count - 1; i >= 0; i--) {
        const id = pool.active[i];
        const o = id * STRIDE;
        let life = D[o + LIFE] - dt;
        if (life <= 0) { pool.release(id); continue; }
        D[o + LIFE] = life;

        D[o + VY] -= D[o + GRAV] * dt;
        const drag = D[o + DRAG] === 1 ? 1 : Math.pow(D[o + DRAG], dt);
        D[o + VX] *= drag; D[o + VY] *= drag; D[o + VZ] *= drag;
        let x = D[o + PX] + D[o + VX] * dt;
        const y = D[o + PY] + D[o + VY] * dt;
        const z = D[o + PZ] + D[o + VZ] * dt;
        D[o + PX] = x; D[o + PY] = y; D[o + PZ] = z;
        D[o + ROT] += D[o + SPIN] * dt;
        if (D[o + WOB] !== 0) {
          D[o + WOBT] += 0.2 * dt;
          x += Math.sin(D[o + WOBT]) * D[o + WOB];
        }

        const t = 1 - life / D[o + MAXLIFE];
        const e = 1 - (1 - t) * (1 - t);
        const size = D[o + S0] + (D[o + S1] - D[o + S0]) * e;
        let alpha = D[o + A0] + (D[o + A1] - D[o + A0]) * t;
        const fi = D[o + FADEIN];
        if (fi > 0 && t < fi) alpha *= t / fi;

        const p3 = k * 3, p4 = k * 4, p2 = k * 2;
        P[p3] = x; P[p3 + 1] = y; P[p3 + 2] = z;
        const mode = D[o + MODE];
        if (mode === 1) {
          const vx = D[o + VX], vy = D[o + VY], vz = D[o + VZ];
          const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
          X[p4] = vx; X[p4 + 1] = vy; X[p4 + 2] = vz; X[p4 + 3] = D[o + ROT];
          Z[p2] = size; Z[p2 + 1] = size * D[o + ASPECT] + sp * D[o + STRETCH];
        } else if (mode === 2) {
          X[p4] = D[o + AX]; X[p4 + 1] = D[o + AY]; X[p4 + 2] = D[o + AZ]; X[p4 + 3] = 0;
          Z[p2] = size; Z[p2 + 1] = D[o + STRETCH];
        } else {
          X[p4] = 0; X[p4 + 1] = 0; X[p4 + 2] = 0; X[p4 + 3] = D[o + ROT];
          Z[p2] = size; Z[p2 + 1] = size * D[o + ASPECT];
        }
        C[p4] = D[o + R0] + (D[o + R1] - D[o + R0]) * t;
        C[p4 + 1] = D[o + G0] + (D[o + G1] - D[o + G0]) * t;
        C[p4 + 2] = D[o + B0] + (D[o + B1] - D[o + B0]) * t;
        C[p4 + 3] = alpha;
        L[k] = D[o + CELL];
        k++;
      }
      geo.instanceCount = k;
      if (k > 0) {
        aPos.updateRange.count = k * 3; aPos.needsUpdate = true;
        aAxis.updateRange.count = k * 4; aAxis.needsUpdate = true;
        aSize.updateRange.count = k * 2; aSize.needsUpdate = true;
        aColor.updateRange.count = k * 4; aColor.needsUpdate = true;
        aCell.updateRange.count = k; aCell.needsUpdate = true;
      }
      mesh.visible = k > 0;
    }

    function clear() {
      pool.clear();
      geo.instanceCount = 0;
      mesh.visible = false;
    }

    return {
      mesh: mesh, pool: pool, spec: spec, emit: emit, update: update, clear: clear,
      get count() { return pool.count; }
    };
  }

  DS.FX3DSprites = { create: create, STRIDE: STRIDE };
})(window.DS);
