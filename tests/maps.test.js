const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./_load');

/* The map registry (src/world/maps.js) and the definitions under src/world/maps/:
   every place must be complete enough to build a floor, a theme and a horizon
   from, and must only name things that exist (tile textures in the manifest,
   band kinds the backdrop knows, enemy kinds the bestiary has). */

const ACT_FILES = ['src/world/maps/act1.js'].concat(
  ['act2', 'act3'].map((a) => 'src/world/maps/' + a + '.js').filter((f) => fs.existsSync(path.join(__dirname, '..', f))));
const DS = load(['src/core/rng.js', 'src/systems/difficulty.js', 'src/world/maps.js'].concat(ACT_FILES));
const maps = DS.Maps.list();

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'assets', 'textures.json'), 'utf8'));
const tileIds = new Set(manifest.textures.filter((t) => t.gray).map((t) => t.id));

/* Kinds the backdrop knows: the ones written in backdrop3d.js plus the two kind files. */
function knownKinds() {
  const src = ['src/core/backdrop3d.js', 'src/core/backdrop/kinds-arch.js', 'src/core/backdrop/kinds-nature.js']
    .concat(fs.readdirSync(path.join(__dirname, '..', 'src', 'core', 'backdrop'))
      .filter((f) => /^kinds-.*\.js$/.test(f)).map((f) => 'src/core/backdrop/' + f))
    .filter((f, i, a) => a.indexOf(f) === i)
    .map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  const names = new Set();
  let m;
  const a = /^    ([a-zA-Z]+): function \(o, x, rng, L\)/gm;
  while ((m = a.exec(src))) names.add(m[1]);
  const b = /\bK\.([a-zA-Z]+) = function/g;
  while ((m = b.exec(src))) names.add(m[1]);
  return names;
}
const KINDS = knownKinds();

test('every defined map is complete', () => {
  assert.ok(maps.length >= 10, 'at least Act I is defined');
  for (const m of maps) {
    assert.ok(/^m\d\d_[a-z0-9]+$/.test(m.key), m.key + ' is not m<depth>_<name>');
    assert.equal(+m.key.slice(1, 3), m.depth, m.key + ' does not match its depth');
    assert.ok(m.label && m.label.length > 3, m.key + ' has no label');
    assert.ok(DS.Maps.FLAVORS.includes(m.flavor), m.key + ' flavor');
    assert.ok(m.palette && m.palette.pal && m.palette.pal.D && m.palette.pal.d && m.palette.pal.g && m.palette.pal.G, m.key + ' palette');
    assert.ok(m.palette.sky && m.palette.sky.length === 2 && m.palette.light, m.key + ' palette sky/light');
    for (const f of ['fog', 'ambient', 'hemiSky', 'hemiGround', 'dir', 'dirI']) {
      assert.ok(m.theme && m.theme[f] != null, m.key + ' theme.' + f);
    }
    assert.ok(m.backdrop, m.key + ' has no backdrop');
  }
});

test('depths are unique and the ladder reads them', () => {
  const seen = new Set();
  for (const m of maps) {
    assert.ok(!seen.has(m.depth), 'depth ' + m.depth + ' defined twice');
    seen.add(m.depth);
    const rung = DS.Difficulty.biomeForDepth(m.depth);
    assert.equal(rung.key, m.key);
    assert.equal(rung.label, m.label);
    assert.equal(rung.flavor, m.flavor);
    assert.equal(rung.theme, m.key);
  }
});

test('endless floors walk the defined places again, one lap tougher', () => {
  const first = DS.Difficulty.biomeForDepth(31);
  assert.equal(first.endless, true);
  assert.equal(first.lap, 1);
  assert.equal(DS.Difficulty.biomeForDepth(1).endless, undefined);
});

test('a map only names tile textures that are in the manifest', () => {
  for (const m of maps) {
    for (const part of ['wall', 'top', 'plat']) {
      const t = m.tiles && m.tiles[part];
      if (t && t.tex) assert.ok(tileIds.has(t.tex), m.key + ' ' + part + ' names ' + t.tex + ', which is not a grayscale tile texture');
    }
  }
});

test('a map only names band kinds the backdrop has', () => {
  for (const m of maps) {
    const layers = (m.backdrop.recipe && m.backdrop.recipe.layers) || [];
    for (const L of layers) assert.ok(KINDS.has(L.kind), m.key + ' uses unknown band kind ' + L.kind);
  }
});

test('a new map key cannot repeat, and a bad definition says why', () => {
  assert.throws(() => DS.Maps.define({ key: 'm01_shore', depth: 99, label: 'Copy', flavor: 'plain' }), /already defined/);
  assert.throws(() => DS.Maps.define({ key: 'x', depth: 0, label: 'Bad', flavor: 'plain' }), /depth/);
  assert.throws(() => DS.Maps.define({ key: 'y', depth: 98, label: 'Bad', flavor: 'sky' }), /flavor/);
});
