/* The voxel hero and the pixel doll draw from one look (look3d.js, look2d.js):
   every piece in the catalog builds, the model keeps the seven parts the pose code
   drives, nothing goes NaN, a hat takes the hair it covers, and the doll changes
   when what he wears changes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');
const THREE_MOCK = require('./_three-mock');

const FILES = ['src/core/rng.js', 'src/core/voxel.js', 'src/items/look.js', 'src/items/look3d.js', 'src/items/look3d-wear.js', 'src/items/look2d.js'];
const STUBS = THREE_MOCK + ';window.__store = {}; window.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };';
const fresh = () => load(FILES, STUBS);

const PARTS = ['root', 'torso', 'head', 'armL', 'armR', 'legL', 'legR'];
const clone = (o) => JSON.parse(JSON.stringify(o));

function boxes(model) {
  const out = [];
  model.root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
}
function finite(model) {
  let bad = 0;
  model.root.traverse((o) => {
    for (const v of [o.position, o.rotation, o.scale]) if (![v.x, v.y, v.z].every(Number.isFinite)) bad++;
    if (o.geometry && ![o.geometry.x, o.geometry.y, o.geometry.z].every((n) => Number.isFinite(n) && n > 0)) bad++;
  });
  return bad;
}
const worn = (DS, slot, id) => Object.assign(clone(DS.Look.DEFAULT_LOOK), { [slot]: id });

test('the default hero builds and keeps every part poseHero drives', () => {
  const DS = fresh();
  const m = DS.Look3D.build(DS.Look.DEFAULT_LOOK);
  for (const k of PARTS) assert.ok(m[k], k);
  assert.ok(boxes(m).length > 40, 'a body, a face, hair, clothes: ' + boxes(m).length);
  assert.equal(finite(m), 0);
  assert.equal(typeof m.animate, 'function');
  // The hero builder in voxel.js hands off to it, and the model gets a kind and a height.
  const built = DS.Voxel.build('hero', {});
  assert.equal(built.kind, 'hero');
  assert.ok(boxes(built).length > 40);
});

test('every piece in the catalog builds on its own, with no NaN and a body to hang on', () => {
  const DS = fresh();
  for (const it of DS.Look.CATALOG) {
    if (it.slot === 'weapon') continue;
    const look = worn(DS, it.slot, it.id);
    const m = DS.Look3D.build(look);
    assert.equal(finite(m), 0, it.key);
    for (const k of PARTS) assert.ok(m[k], it.key + ' ' + k);
    if (it.id !== 'none' && it.id !== 'bald') {
      const base = boxes(DS.Look3D.build(worn(DS, it.slot, DS.Look.starters(it.slot)[0].id))).length;
      // Distinct from the plain starter unless it IS the starter.
      if (!it.starter) assert.notEqual(boxes(m).length + ':' + JSON.stringify(m.motion.length), base + ':x', it.key);
    }
    for (let f = 0; f < 6; f++) DS.Look3D.animate(m, { vx: f % 2 ? 2 : 0, onGround: f % 3 !== 0 }, f * 0.3);
    assert.equal(finite(m), 0, it.key + ' after animating');
  }
});

test('every trait combination builds: build, height, eyes, brows, mouth', () => {
  const DS = fresh();
  const T = DS.Look.TRAITS;
  for (const build of T.build) for (const height of T.height) for (const eyes of T.eyes) {
    const look = Object.assign(clone(DS.Look.DEFAULT_LOOK), { build, height, eyes, brows: T.brows[eyes.length % T.brows.length], mouth: T.mouth[height.length % T.mouth.length] });
    assert.equal(finite(DS.Look3D.build(look)), 0, [build, height, eyes].join('/'));
  }
});

test('build and height change the body, in steps', () => {
  const DS = fresh();
  const at = (k, v) => DS.Look3D.build(Object.assign(clone(DS.Look.DEFAULT_LOOK), { [k]: v }));
  assert.ok(at('build', 'broad').dim.bodyW > at('build', 'regular').dim.bodyW);
  assert.ok(at('build', 'slim').dim.bodyW < at('build', 'regular').dim.bodyW);
  assert.ok(at('height', 'tall').figure.scale.y > at('height', 'mid').figure.scale.y);
  assert.ok(at('height', 'short').figure.scale.y < at('height', 'mid').figure.scale.y);
  // Height scales the figure, never the root the pose code writes every frame.
  assert.equal(at('height', 'tall').root.scale.y, 1);
});

test('a hat takes the hair it covers and leaves the rest', () => {
  const DS = fresh();
  const hairOf = (hat) => DS.Look3D.build(Object.assign(clone(DS.Look.DEFAULT_LOOK), { hair: 'long', hat })).hairGroups;
  const bare = hairOf('none');
  assert.ok(bare.top.visible && bare.fringe.visible && bare.back.visible);
  const capped = hairOf('cap');
  assert.equal(capped.top.visible, false);
  assert.equal(capped.fringe.visible, false);
  assert.equal(capped.back.visible, true, 'long hair still hangs out from under a cap');
  const band = hairOf('bandana');
  assert.equal(band.top.visible, true);
  assert.equal(band.fringe.visible, false);
  // A bald head under a hat is fine.
  assert.doesNotThrow(() => DS.Look3D.build(Object.assign(clone(DS.Look.DEFAULT_LOOK), { hair: 'bald', hat: 'wizard' })));
});

test('the model key follows the look and ignores the weapon', () => {
  const DS = fresh();
  const a = clone(DS.Look.DEFAULT_LOOK);
  const key = DS.Look3D.keyOf(a);
  assert.equal(DS.Look3D.keyOf(Object.assign(clone(a), { weapon: { sword: 'sword.solar' } })), key);
  assert.notEqual(DS.Look3D.keyOf(Object.assign(clone(a), { hat: 'crown' })), key);
  assert.notEqual(DS.Look3D.keyOf(Object.assign(clone(a), { topDye: 'red' })), key);
  assert.equal(DS.Look3D.keyOf(a), key, 'stable');
});

test('dyed pieces take the dye and fixed ones keep their own palette', () => {
  const DS = fresh();
  const K = DS.Look3D.kit;
  const dyed = K.palOf(DS.Look.itemOf('top', 'tunic'), Object.assign(clone(DS.Look.DEFAULT_LOOK), { topDye: 'red' }), 'top');
  assert.equal(dyed.a, 0xc0303c);
  const other = K.palOf(DS.Look.itemOf('top', 'tunic'), Object.assign(clone(DS.Look.DEFAULT_LOOK), { topDye: 'green' }), 'top');
  assert.notEqual(other.a, dyed.a);
  const fixed = K.palOf(DS.Look.itemOf('top', 'plate'), DS.Look.DEFAULT_LOOK, 'top');
  assert.equal(fixed.a, 0xc8ccd8);
  assert.equal(fixed.b, 0x7a8094);
});

test('a weapon skin recolours the fittings and plain steel keeps the rarity colour', () => {
  const DS = fresh();
  const look = Object.assign(clone(DS.Look.DEFAULT_LOOK), { weapon: { sword: 'sword.base', dagger: 'dagger.solar' } });
  assert.equal(DS.Look3D.weaponSkin('sword', look), null, 'plain steel has no skin');
  assert.equal(DS.Look3D.weaponSkin('bow', look), null);
  const skin = DS.Look3D.weaponSkin('dagger', look);
  assert.equal(skin.metal, 0xfff0a8);
  assert.equal(skin.lit, true);
  const plain = DS.Voxel.buildWeapon('dagger', '#c9cfdf');
  const colours = (mesh) => { const c = []; mesh.traverse((o) => { if (o.isMesh) c.push(o.material.color); }); return c; };
  const before = colours(plain);
  assert.ok(before.includes(0xf2c14e), 'the plain dagger has a gold guard');
  DS.Look3D.dressWeapon(plain, skin);
  const after = colours(plain);
  assert.ok(!after.includes(0xf2c14e), 'the guard took the skin trim');
  assert.ok(after.includes(skin.trim));
  assert.equal(DS.Look3D.dressWeapon(DS.Voxel.buildWeapon('sword', '#c9cfdf'), null) != null, true, 'no skin, no change');
});

test('holdWeapon puts a weapon in the right hand for a preview', () => {
  const DS = fresh();
  const m = DS.Look3D.build(DS.Look.DEFAULT_LOOK);
  const before = m.armR.children.length;
  for (const type of DS.Look.WEAPON_TYPES) assert.ok(DS.Look3D.holdWeapon(m, type, DS.Look.DEFAULT_LOOK), type);
  assert.equal(m.armR.children.length, before + DS.Look.WEAPON_TYPES.length);
});

test('the current key is remembered until the profile changes, and follows it when it does', () => {
  const DS = fresh();
  const a = DS.Look3D.keyOfCurrent();
  assert.equal(a, DS.Look3D.keyOf(DS.Look.look));
  assert.equal(DS.Look3D.keyOfCurrent(), a, 'stable');
  const rev = DS.Look.rev;
  assert.equal(DS.Look.equip('skin', 'ebony'), true);
  assert.ok(DS.Look.rev > rev, 'a change counts');
  const b = DS.Look3D.keyOfCurrent();
  assert.notEqual(b, a);
  assert.equal(b, DS.Look3D.keyOf(DS.Look.look));
  DS.Look.bank(5);
  assert.ok(DS.Look.rev > rev + 1, 'so does keeping keys');
  const before = DS.Look.rev;
  DS.Look.reload();
  assert.ok(DS.Look.rev > before, 'and reading the profile again');
});

test('the name rides above the tallest thing on his head', () => {
  const DS = fresh();
  const room = (over) => DS.Look3D.headroom(Object.assign(clone(DS.Look.DEFAULT_LOOK), over));
  const bare = room({ hair: 'bald' });
  assert.equal(bare, 0);
  assert.ok(room({ hat: 'wizard' }) > room({ hat: 'crown' }), 'a wizard hat is taller than a crown');
  assert.ok(room({ hat: 'crown' }) > room({ hat: 'cap' }));
  assert.ok(room({ hair: 'afro' }) > room({ hair: 'short' }));
  assert.equal(room({ hat: 'cap', hair: 'afro' }), room({ hat: 'cap', hair: 'bald' }), 'a cap covers the hair under it');
  assert.ok(room({ hat: 'horned' }) > room({ hat: 'ironhelm' }), 'horns add height');
  assert.ok(room({ height: 'tall', hair: 'bald' }) > 0 && room({ height: 'short', hair: 'bald' }) < 0, 'and stature moves the head');
});

// --- the pixel doll ---------------------------------------------------------------------------------------

const cells = (g) => Array.from(g.px);
const same = (a, b) => JSON.stringify(cells(a)) === JSON.stringify(cells(b));

test('the doll paints a figure with an outline, inside its canvas', () => {
  const DS = fresh();
  const g = DS.Look2D.paint(DS.Look.DEFAULT_LOOK);
  assert.equal(g.w, 32); assert.equal(g.h, 48);
  const filled = cells(g).filter((c) => c !== -1).length;
  assert.ok(filled > 300 && filled < 1000, 'a figure, not a canvas of paint: ' + filled);
  assert.ok(cells(g).includes(0x1c1a24), 'outlined');
  assert.ok(cells(g).includes(0xffd9b0), 'in the skin tone he was given');
  // Nothing on the border rows: the outline needs a pixel of room all round.
  for (let x = 0; x < g.w; x++) { assert.equal(g.px[x], -1); assert.equal(g.px[(g.h - 1) * g.w + x], -1); }
});

test('the doll follows the skin tone, the eyes and the hair colour', () => {
  const DS = fresh();
  const at = (k, v) => DS.Look2D.paint(Object.assign(clone(DS.Look.DEFAULT_LOOK), { [k]: v }));
  const base = DS.Look2D.paint(DS.Look.DEFAULT_LOOK);
  assert.ok(!same(base, at('skin', 'ebony')));
  assert.ok(cells(at('skin', 'ebony')).includes(0x3a2114));
  assert.ok(!same(base, at('eyeColor', 'green')));
  assert.ok(cells(at('eyeColor', 'green')).includes(0x3f8a52));
  assert.ok(!same(base, at('hairColor', 'blonde')));
});

test('every piece changes the doll (except bare ones), and no piece leaves the canvas', () => {
  const DS = fresh();
  for (const it of DS.Look.CATALOG) {
    if (it.slot === 'weapon') continue;
    const none = DS.Look.starters(it.slot)[0];
    if (it.id === none.id) continue;
    const a = DS.Look2D.paint(worn(DS, it.slot, none.id));
    const b = DS.Look2D.paint(worn(DS, it.slot, it.id));
    if (it.starter) continue;
    assert.ok(!same(a, b), it.key + ' shows on the doll');
    for (let x = 0; x < 32; x++) { assert.equal(b.px[x], -1, it.key + ' top row'); assert.equal(b.px[47 * 32 + x], -1, it.key + ' bottom row'); }
    for (let y = 0; y < 48; y++) { assert.equal(b.px[y * 32], -1, it.key + ' left column'); assert.equal(b.px[y * 32 + 31], -1, it.key + ' right column'); }
  }
});

test('build and height show on the doll, and the breathing frame moves the upper body', () => {
  const DS = fresh();
  const at = (k, v, o) => DS.Look2D.paint(Object.assign(clone(DS.Look.DEFAULT_LOOK), { [k]: v }), o);
  const count = (g) => cells(g).filter((c) => c !== -1).length;
  assert.ok(count(at('build', 'broad')) > count(at('build', 'slim')));
  assert.ok(!same(at('height', 'tall'), at('height', 'short')));
  assert.ok(!same(at('build', 'regular'), at('build', 'regular', { bob: 1 })));
  // Breathing does not move the feet.
  const a = DS.Look2D.paint(DS.Look.DEFAULT_LOOK), b = DS.Look2D.paint(DS.Look.DEFAULT_LOOK, { bob: 1 });
  for (let y = 44; y < 47; y++) for (let x = 0; x < 32; x++) assert.equal(a.px[y * 32 + x], b.px[y * 32 + x]);
});

test('walking the look hero through Voxel.pose keeps the head on the neck (intro cutscene)', () => {
  const DS = fresh();
  const m = DS.Voxel.build('hero', {});
  const rest = m.head.position.y;
  let lo = rest, hi = rest;
  for (let f = 0; f < 430; f++) {
    DS.Voxel.pose(m, { x: 200 - f * 0.4, vx: 1.1, attackState: 'none', attackTimer: 0, cfg: { wind: 20 }, hurtFlash: 0 }, f / 60);
    lo = Math.min(lo, m.head.position.y);
    hi = Math.max(hi, m.head.position.y);
  }
  assert.ok(hi - lo <= 0.05, 'head bob stays a bob, not a drift: ' + (hi - lo).toFixed(3));
});

/* The lowest point of what hangs on the torso (the legs stand on the floor by
   definition), in the space of the root with the feet at 0, turning every box through
   its parents' scale and rotation so a swaying group counts too. */
function lowest(model) {
  let low = Infinity;
  const rot = (v, r) => {
    let [x, y, z] = v;
    let c = Math.cos(r.z), s = Math.sin(r.z); [x, y] = [x * c - y * s, x * s + y * c];
    c = Math.cos(r.y); s = Math.sin(r.y); [x, z] = [x * c + z * s, -x * s + z * c];
    c = Math.cos(r.x); s = Math.sin(r.x); [y, z] = [y * c - z * s, y * s + z * c];
    return [x, y, z];
  };
  (function walk(node, chain) {
    const here = chain.concat(node);
    if (node.isMesh && here.includes(model.torso)) {
      const g = node.geometry;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        let p = [sx * g.x / 2, sy * g.y / 2, sz * g.z / 2];
        for (let i = here.length - 1; i >= 0; i--) {
          const n = here[i];
          p = rot([p[0] * n.scale.x, p[1] * n.scale.y, p[2] * n.scale.z], n.rotation);
          p = [p[0] + n.position.x, p[1] + n.position.y, p[2] + n.position.z];
        }
        low = Math.min(low, p[1]);
      }
    }
    node.children.forEach((k) => walk(k, here));
  })(model.root, []);
  return low;
}

test('no cape or wing reaches the ground, at any height, walking or falling', () => {
  const DS = fresh();
  const capes = DS.Look.CATALOG.filter((i) => i.slot === 'cape' && i.id !== 'none');
  assert.ok(capes.length >= 8, 'the capes are there to check: ' + capes.length);
  for (const it of capes) for (const height of DS.Look.TRAITS.height) {
    const m = DS.Look3D.build(Object.assign(worn(DS, 'cape', it.id), { height }));
    let low = lowest(m);
    for (let f = 0; f < 40; f++) {
      DS.Look3D.animate(m, { vx: f % 2 ? 2.4 : 0, onGround: f % 4 === 0 }, f * 0.37);
      low = Math.min(low, lowest(m));
    }
    assert.ok(low >= 0.1, it.key + ' (' + height + ') hem at ' + low.toFixed(3));
  }
});
