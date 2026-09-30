/* The hero's draw-call diet (look3d.js mergeStatic), checked against the REAL three.js:
   baking the still parts of each bone into a few vertex-coloured meshes must change
   nothing about what is drawn -- same triangles, same colours in the same amounts,
   same extent in space, the see-through and glowing parts kept apart -- while the
   number of meshes falls from dozens to a handful. The other look tests run on the
   headless mock, which has no matrices and so builds the unmerged model. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./_load');

const THREE_SRC = fs.readFileSync(path.join(__dirname, '..', 'libs', 'three.min.js'), 'utf8');
const STUBS = 'window.self = window; window.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };' +
              THREE_SRC + '\n;window.DS.__win = window;';
const FILES = ['src/core/rng.js', 'src/core/voxel.js', 'src/items/look.js', 'src/items/look3d.js', 'src/items/look3d-wear.js'];

const DS = load(FILES, STUBS);
const THREE = DS.__win.THREE;
const clone = (o) => JSON.parse(JSON.stringify(o));
const wear = (o) => Object.assign(clone(DS.Look.DEFAULT_LOOK), o);

const LOOKS = {
  plain: wear({}),
  dressed: wear({ hat: 'knighthelm', top: 'bronze', pants: 'platelegs', boots: 'winged', gloves: 'gauntlets', cape: 'royal',
                  extra: 'pauldrons', hair: 'long', facial: 'fullbeard', mark: 'warpaint' }),
  glowing: wear({ hat: 'halo', top: 'aegis', cape: 'flamecape', extra: 'aura', hair: 'flame', mark: 'glowrune' }),
  clear: wear({ extra: 'glasses', hat: 'bandana', hair: 'ponytail', boots: 'sandals' }),
  hooded: wear({ hat: 'hood', hair: 'long', top: 'robe', pants: 'kilt', boots: 'winged', cape: 'wings', gloves: 'gloves' })
};

/* What is drawn: triangles, vertex colours by amount, glowing and see-through vertex
   counts, and the box the visible meshes fill. */
function stats(root) {
  const s = { meshes: 0, tris: 0, colors: {}, clearVerts: 0, glowVerts: 0, box: new THREE.Box3() };
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    s.meshes++;
    const g = o.geometry, m = o.material;
    const n = g.attributes.position.count;
    s.tris += g.index.count / 3;
    if (m.transparent) s.clearVerts += n;
    if (m.emissive && m.emissive.getHex() !== 0) s.glowVerts += n;
    if (g.attributes.color) {
      const c = g.attributes.color.array;
      for (let i = 0; i < n; i++) {
        const hex = (Math.round(c[i * 3] * 255) << 16) | (Math.round(c[i * 3 + 1] * 255) << 8) | Math.round(c[i * 3 + 2] * 255);
        s.colors[hex] = (s.colors[hex] || 0) + 1;
      }
    } else {
      const hex = m.color.getHex();
      s.colors[hex] = (s.colors[hex] || 0) + n;
    }
    s.box.expandByObject(o);
  });
  return s;
}

const near = (a, b) => Math.abs(a - b) < 1e-4;

test('merging changes nothing that is drawn: triangles, colours, glow, glass and extent', () => {
  for (const name of Object.keys(LOOKS)) {
    const raw = stats(DS.Look3D.build(LOOKS[name], { merge: false }).root);
    const merged = stats(DS.Look3D.build(LOOKS[name]).root);
    assert.equal(merged.tris, raw.tris, name + ': the same triangles');
    assert.equal(merged.clearVerts, raw.clearVerts, name + ': the same see-through surface');
    assert.equal(merged.glowVerts, raw.glowVerts, name + ': the same glowing surface');
    assert.deepEqual(merged.colors, raw.colors, name + ': the same colours in the same amounts');
    for (const k of ['x', 'y', 'z']) {
      assert.ok(near(merged.box.min[k], raw.box.min[k]) && near(merged.box.max[k], raw.box.max[k]), name + ': the same ' + k + ' extent');
    }
  }
});

test('the meshes fall from dozens to a handful, and a dressed hero stays under budget', () => {
  const count = (look, merge) => stats(DS.Look3D.build(look, { merge }).root).meshes;
  for (const name of Object.keys(LOOKS)) {
    const raw = count(LOOKS[name], false), merged = count(LOOKS[name], true);
    assert.ok(merged * 2.5 < raw, name + ': ' + raw + ' -> ' + merged);
  }
  // Each mesh is a draw call in the colour pass and another in the shadow pass.
  assert.ok(count(LOOKS.plain, true) <= 14, 'plain: ' + count(LOOKS.plain, true));
  assert.ok(count(LOOKS.dressed, true) <= 34, 'dressed: ' + count(LOOKS.dressed, true));
  assert.ok(count(LOOKS.glowing, true) <= 40, 'glowing: ' + count(LOOKS.glowing, true));
});

test('what moves by itself stays its own object, and the bones still carry the rest', () => {
  const m = DS.Look3D.build(LOOKS.glowing);
  assert.ok(m.motion.length >= 8, 'flames, a halo, a ring and a cape animate: ' + m.motion.length);
  for (const s of m.motion) {
    let up = s.node;
    while (up.parent) up = up.parent;
    assert.equal(up, m.root, 'every animated node is still in the model');
  }
  // The pieces on a bone are children of that bone, so posing the bone moves them.
  for (const bone of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) {
    assert.ok(m[bone].children.some((c) => c.isMesh), bone + ' carries a baked mesh');
  }
  m.armR.rotation.x = 1.2;
  m.root.updateMatrixWorld(true);
  const arm = new THREE.Box3().expandByObject(m.armR);
  const rest = new THREE.Box3().expandByObject(DS.Look3D.build(LOOKS.glowing).armR);
  assert.ok(!near(arm.max.z, rest.max.z), 'raising the arm moved what it wears');
});

test('the merged parts are vertex-coloured, share their materials, and keep glass apart from solid', () => {
  const a = DS.Look3D.build(LOOKS.clear), b = DS.Look3D.build(LOOKS.dressed);
  const mats = new Set();
  [a, b].forEach((m) => m.root.traverse((o) => { if (o.isMesh && o.userData.chunkColors) { mats.add(o.material); assert.equal(o.material.vertexColors, true); } }));
  assert.ok(mats.size >= 2 && mats.size <= 8, 'a few shared materials: ' + mats.size);
  let glass = 0;
  a.root.traverse((o) => { if (o.isMesh && o.material.transparent) glass++; });
  assert.ok(glass >= 1, 'the lenses are still see-through');
  // The death shatter reads the colours a merged mesh was made from.
  let listed = 0;
  b.root.traverse((o) => { if (o.userData && o.userData.chunkColors) { listed++; assert.ok(o.userData.chunkColors.every((c) => Number.isInteger(c))); } });
  assert.ok(listed >= 6, listed + ' meshes list their colours');
});

test('a merged hero still animates, disposes and rebuilds without complaint', () => {
  const m = DS.Look3D.build(LOOKS.dressed);
  for (let f = 0; f < 60; f++) DS.Look3D.animate(m, { vx: f % 7 ? 2 : 0, onGround: f % 5 !== 0 }, f * 0.05);
  m.root.updateMatrixWorld(true);
  let bad = 0;
  m.root.traverse((o) => {
    for (const v of [o.position, o.rotation, o.scale]) if (![v.x, v.y, v.z].every(Number.isFinite)) bad++;
    if (o.geometry && o.geometry.boundingSphere && !Number.isFinite(o.geometry.boundingSphere.radius)) bad++;
  });
  assert.equal(bad, 0);
  assert.doesNotThrow(() => m.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }));
  // Every catalog piece survives the merge too.
  for (const it of DS.Look.CATALOG) {
    if (it.slot === 'weapon') continue;
    const built = DS.Look3D.build(wear({ [it.slot]: it.id }));
    let n = 0;
    built.root.traverse((o) => { if (o.isMesh) n++; });
    assert.ok(n >= 4 && n <= 60, it.key + ' builds ' + n + ' meshes');
  }
});
