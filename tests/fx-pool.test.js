const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* FX3D promises zero allocation after construction: pools refuse or recycle,
   they never grow. The pool is pure logic; the billboard system is exercised
   against a minimal THREE stand-in that records buffer sizes. */

const THREE_STUB = `
  function Attr(array, size) { this.array = array; this.itemSize = size; this.updateRange = { offset: 0, count: -1 }; this.needsUpdate = false; }
  Attr.prototype.setUsage = function () { return this; };
  window.THREE = {
    DynamicDrawUsage: 1, AdditiveBlending: 2, NormalBlending: 1, DoubleSide: 2,
    BufferAttribute: Attr,
    InstancedBufferAttribute: Attr,
    InstancedBufferGeometry: function () { this.attributes = {}; this.instanceCount = 0; },
    ShaderMaterial: function (o) { this.uniforms = o.uniforms; },
    Mesh: function (geo, mat) { this.geometry = geo; this.material = mat; this.visible = true; }
  };
  THREE.InstancedBufferGeometry.prototype.setAttribute = function (n, a) { this.attributes[n] = a; return this; };
  THREE.InstancedBufferGeometry.prototype.setIndex = function () {};
  window.DS.FX3DAtlas = { CELL: {}, build: function () { return {}; } };
`;

const DS = load(['src/fx3d/pool.js', 'src/fx3d/sprites.js'], THREE_STUB);

test('pool hands out every slot once, then refuses', () => {
  const pool = DS.FX3DPool.create(8);
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const id = pool.alloc();
    assert.ok(id >= 0 && id < 8);
    assert.ok(!seen.has(id), 'no slot handed out twice');
    seen.add(id);
  }
  assert.equal(pool.count, 8);
  assert.equal(pool.alloc(), -1, 'a full pool refuses');
  assert.equal(pool.count, 8);
});

test('allocOrSteal never exceeds capacity and always returns a live slot', () => {
  const pool = DS.FX3DPool.create(5);
  for (let i = 0; i < 1000; i++) {
    const id = pool.allocOrSteal();
    assert.ok(id >= 0 && id < 5);
    assert.ok(pool.isLive(id));
    assert.ok(pool.count <= 5);
  }
  assert.equal(pool.count, 5);
});

test('release swap-removes, keeps the live list dense, and slots come back', () => {
  const pool = DS.FX3DPool.create(6);
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(pool.alloc());
  assert.equal(pool.release(ids[2]), true);
  assert.equal(pool.release(ids[2]), false, 'double release is a no-op');
  assert.equal(pool.count, 5);
  const live = Array.from(pool.active.slice(0, pool.count));
  assert.ok(!live.includes(ids[2]));
  assert.equal(new Set(live).size, 5);
  assert.equal(pool.alloc(), ids[2], 'the freed slot is reused');
  pool.clear();
  assert.equal(pool.count, 0);
  for (let i = 0; i < 6; i++) assert.ok(pool.alloc() >= 0);
});

test('reverse iteration with release visits every live slot exactly once', () => {
  const pool = DS.FX3DPool.create(32);
  for (let i = 0; i < 32; i++) pool.alloc();
  const visited = [];
  for (let i = pool.count - 1; i >= 0; i--) {
    const id = pool.active[i];
    visited.push(id);
    if (id % 3 === 0) pool.release(id);
  }
  assert.equal(new Set(visited).size, 32);
  assert.equal(pool.count, 32 - Math.ceil(32 / 3));
});

test('billboard system: spawning far past capacity never grows its buffers', () => {
  const sys = DS.FX3DSprites.create(64, true, 0);
  const geo = sys.mesh.geometry;
  const lengths = Object.keys(geo.attributes).map((k) => geo.attributes[k].array.length);
  for (let frame = 0; frame < 50; frame++) {
    for (let i = 0; i < 40; i++) {
      const s = sys.spec();
      s.x = i; s.life = 30; s.size = 0.1;
      sys.emit(s);
    }
    sys.update(1);
    assert.ok(sys.count <= 64);
    assert.ok(geo.instanceCount <= 64);
  }
  const after = Object.keys(geo.attributes).map((k) => geo.attributes[k].array.length);
  assert.deepEqual(after, lengths, 'instance buffers are never reallocated');
  assert.ok(sys.pool.capacity === 64);
});

test('billboard system: particles die on schedule and the draw count follows', () => {
  const sys = DS.FX3DSprites.create(16, false, 0);
  for (let i = 0; i < 10; i++) {
    const s = sys.spec();
    s.life = 5; s.vx = 0.1;
    sys.emit(s);
  }
  sys.update(1);
  assert.equal(sys.mesh.geometry.instanceCount, 10);
  for (let f = 0; f < 5; f++) sys.update(1);
  assert.equal(sys.count, 0);
  assert.equal(sys.mesh.geometry.instanceCount, 0);
  assert.equal(sys.mesh.visible, false);
});
