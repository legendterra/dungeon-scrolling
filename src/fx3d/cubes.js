/* FX3D voxel cubes: debris, shards, pebbles and glowing chips, as instanced
   boxes - the same blocky language as the world and the actors, so a hit that
   knocks chunks off a golem throws real little blocks rather than dots.

   Two flavours share this code, one draw call each:
     lit   opaque, shaded by a fixed key direction (rock, wood, gore, pebbles);
           they fade by SHRINKING, never by alpha, so they can write depth and
           sort correctly against the actors they bounce around
     glow  additive and unlit (ice chips, embers, crystal shards); they fade
           by dimming, and their colour may run hot for the bloom

   Cubes can bounce: give one a floor height and it lands, skids and settles
   instead of falling through the level. A KINEMATIC cube skips the simulation
   entirely and is placed by its owner every frame (the pebbles orbiting an
   earth weapon), which is how an aura rides a moving blade without a second
   system. Same pool rules as the sprites: no allocation after construction. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const STRIDE = 32;
  const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, GRAV = 6, DRAG = 7,
        LIFE = 8, MAXLIFE = 9, S0 = 10, S1 = 11, RX = 12, RY = 13, RZ = 14,
        WX = 15, WY = 16, WZ = 17, R0 = 18, G0 = 19, B0 = 20, R1 = 21, G1 = 22, B1 = 23,
        A0 = 24, A1 = 25, FLOOR = 26, BOUNCE = 27, KX = 28, KY = 29, KZ = 30, FLAGS = 31;

  const KINEMATIC = 1;

  const VERT = [
    'attribute vec4 iColor;',
    'varying vec4 vColor;',
    'varying vec3 vN;',
    'void main() {',
    '  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);',
    '  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);',
    '  vColor = iColor;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  const FRAG = [
    'uniform float uLit;',
    'uniform vec3 uLight;',
    'uniform float uAmb;',
    'varying vec4 vColor;',
    'varying vec3 vN;',
    'void main() {',
    '  float l = 1.0;',
    '  if (uLit > 0.5) {',
    '    float nd = max(dot(normalize(vN), uLight), 0.0);',
    '    l = uAmb + (1.0 - uAmb) * nd;',
    '  }',
    '  gl_FragColor = vec4(vColor.rgb * l, vColor.a);',
    '}'
  ].join('\n');

  function create(capacity, lit, renderOrder) {
    const pool = DS.FX3DPool.create(capacity);
    const D = new Float32Array(capacity * STRIDE);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const aColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    aColor.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iColor', aColor);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uLit: { value: lit ? 1 : 0 },
        uLight: { value: new THREE.Vector3(-0.35, 0.82, 0.46).normalize() },
        uAmb: { value: 0.42 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: !lit,
      depthWrite: !!lit,
      blending: lit ? THREE.NormalBlending : THREE.AdditiveBlending
    });
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = renderOrder || 0;
    mesh.name = lit ? 'fx3d-cubes-lit' : 'fx3d-cubes-glow';

    const S = {};
    function spec() {
      S.x = 0; S.y = 0; S.z = 0; S.vx = 0; S.vy = 0; S.vz = 0;
      S.grav = 0; S.drag = 1; S.life = 30; S.size = 0.08; S.size1 = -1;
      S.rx = 0; S.ry = 0; S.rz = 0; S.wx = 0; S.wy = 0; S.wz = 0;
      S.r = 1; S.g = 1; S.b = 1; S.r1 = -1; S.g1 = -1; S.b1 = -1;
      S.a = 1; S.a1 = 0; S.floor = -1e9; S.bounce = 0.35;
      S.kx = 1; S.ky = 1; S.kz = 1; S.kinematic = false;
      return S;
    }

    function emit(s) {
      const id = pool.allocOrSteal();
      const o = id * STRIDE;
      D[o + PX] = s.x; D[o + PY] = s.y; D[o + PZ] = s.z;
      D[o + VX] = s.vx; D[o + VY] = s.vy; D[o + VZ] = s.vz;
      D[o + GRAV] = s.grav; D[o + DRAG] = s.drag;
      D[o + LIFE] = s.life; D[o + MAXLIFE] = s.life;
      D[o + S0] = s.size; D[o + S1] = s.size1 < 0 ? (lit ? 0 : s.size) : s.size1;
      D[o + RX] = s.rx; D[o + RY] = s.ry; D[o + RZ] = s.rz;
      D[o + WX] = s.wx; D[o + WY] = s.wy; D[o + WZ] = s.wz;
      D[o + R0] = s.r; D[o + G0] = s.g; D[o + B0] = s.b;
      D[o + R1] = s.r1 < 0 ? s.r : s.r1;
      D[o + G1] = s.g1 < 0 ? s.g : s.g1;
      D[o + B1] = s.b1 < 0 ? s.b : s.b1;
      D[o + A0] = s.a; D[o + A1] = s.a1;
      D[o + FLOOR] = s.floor; D[o + BOUNCE] = s.bounce;
      D[o + KX] = s.kx; D[o + KY] = s.ky; D[o + KZ] = s.kz;
      D[o + FLAGS] = s.kinematic ? KINEMATIC : 0;
      return id;
    }

    /* Owner-driven placement for a kinematic cube. */
    function place(id, x, y, z, rx, ry, rz, size, alpha) {
      if (!pool.isLive(id)) return;
      const o = id * STRIDE;
      D[o + PX] = x; D[o + PY] = y; D[o + PZ] = z;
      D[o + RX] = rx; D[o + RY] = ry; D[o + RZ] = rz;
      D[o + S0] = size; D[o + A0] = alpha;
    }

    function release(id) { if (pool.isLive(id)) pool.release(id); }

    function update(dt) {
      const M = mesh.instanceMatrix.array, C = aColor.array;
      let k = 0;
      for (let i = pool.count - 1; i >= 0; i--) {
        const id = pool.active[i];
        const o = id * STRIDE;
        const kin = D[o + FLAGS] === KINEMATIC;
        let size, alpha, t;
        if (kin) {
          size = D[o + S0]; alpha = D[o + A0]; t = 0;
        } else {
          const life = D[o + LIFE] - dt;
          if (life <= 0) { pool.release(id); continue; }
          D[o + LIFE] = life;
          D[o + VY] -= D[o + GRAV] * dt;
          const drag = D[o + DRAG] === 1 ? 1 : Math.pow(D[o + DRAG], dt);
          D[o + VX] *= drag; D[o + VY] *= drag; D[o + VZ] *= drag;
          D[o + PX] += D[o + VX] * dt;
          D[o + PY] += D[o + VY] * dt;
          D[o + PZ] += D[o + VZ] * dt;
          D[o + RX] += D[o + WX] * dt; D[o + RY] += D[o + WY] * dt; D[o + RZ] += D[o + WZ] * dt;
          // Land on the floor: bounce, skid, and stop tumbling once settled.
          const half = D[o + S0] * 0.5 * D[o + KY];
          if (D[o + PY] - half < D[o + FLOOR]) {
            D[o + PY] = D[o + FLOOR] + half;
            if (D[o + VY] < 0) D[o + VY] = -D[o + VY] * D[o + BOUNCE];
            if (D[o + VY] < 0.01) D[o + VY] = 0;
            D[o + VX] *= 0.7; D[o + VZ] *= 0.7;
            D[o + WX] *= 0.6; D[o + WY] *= 0.6; D[o + WZ] *= 0.6;
          }
          t = 1 - life / D[o + MAXLIFE];
          // Hold full size most of the life, then shrink away (lit) / dim (glow).
          const late = t < 0.6 ? 0 : (t - 0.6) / 0.4;
          size = D[o + S0] + (D[o + S1] - D[o + S0]) * late;
          alpha = D[o + A0] + (D[o + A1] - D[o + A0]) * t;
        }

        // Compose T * R(xyz) * S straight into the instance matrix.
        const a = Math.cos(D[o + RX]), b = Math.sin(D[o + RX]);
        const c = Math.cos(D[o + RY]), d = Math.sin(D[o + RY]);
        const e = Math.cos(D[o + RZ]), f = Math.sin(D[o + RZ]);
        const ae = a * e, af = a * f, be = b * e, bf = b * f;
        const sx = size * D[o + KX], sy = size * D[o + KY], sz = size * D[o + KZ];
        const m = k * 16;
        M[m] = c * e * sx;            M[m + 1] = (af + be * d) * sx; M[m + 2] = (bf - ae * d) * sx; M[m + 3] = 0;
        M[m + 4] = -c * f * sy;       M[m + 5] = (ae - bf * d) * sy; M[m + 6] = (be + af * d) * sy; M[m + 7] = 0;
        M[m + 8] = d * sz;            M[m + 9] = -b * c * sz;        M[m + 10] = a * c * sz;        M[m + 11] = 0;
        M[m + 12] = D[o + PX];        M[m + 13] = D[o + PY];         M[m + 14] = D[o + PZ];         M[m + 15] = 1;

        const r = D[o + R0] + (D[o + R1] - D[o + R0]) * t;
        const g = D[o + G0] + (D[o + G1] - D[o + G0]) * t;
        const bl = D[o + B0] + (D[o + B1] - D[o + B0]) * t;
        const c4 = k * 4;
        if (lit) { C[c4] = r; C[c4 + 1] = g; C[c4 + 2] = bl; C[c4 + 3] = 1; }
        else { C[c4] = r * alpha; C[c4 + 1] = g * alpha; C[c4 + 2] = bl * alpha; C[c4 + 3] = 1; }
        k++;
      }
      mesh.count = k;
      if (k > 0) {
        mesh.instanceMatrix.updateRange.count = k * 16;
        mesh.instanceMatrix.needsUpdate = true;
        aColor.updateRange.count = k * 4;
        aColor.needsUpdate = true;
      }
      mesh.visible = k > 0;
    }

    function clear() {
      pool.clear();
      mesh.count = 0;
      mesh.visible = false;
    }

    return {
      mesh: mesh, pool: pool, spec: spec, emit: emit, place: place, release: release,
      update: update, clear: clear,
      get count() { return pool.count; }
    };
  }

  DS.FX3DCubes = { create: create, STRIDE: STRIDE };
})(window.DS);
