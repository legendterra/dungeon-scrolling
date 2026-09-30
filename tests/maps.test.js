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
  ['act2', 'act3', 'special'].map((a) => 'src/world/maps/' + a + '.js').filter((f) => fs.existsSync(path.join(__dirname, '..', f))));
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

test('every map names an ambience the audio layer has', () => {
  const kinds = new Set(load(['src/core/audio.js']).Audio.ambienceKinds());
  const used = new Set();
  for (const m of maps) {
    assert.ok(m.ambience, m.key + ' has no ambience');
    assert.ok(kinds.has(m.ambience), m.key + ' names an unknown ambience: ' + m.ambience);
    assert.equal(m.rung.ambience, m.ambience, m.key + ' rung carries it');
    used.add(m.ambience);
  }
  assert.ok(used.size >= 12, 'the places do not all sound alike (' + used.size + ' kinds)');
});

test('the act of the gods has a safe room and a trial of its own, found by depth, endless included', () => {
  const hestia = DS.Maps.special('safe', 25);
  const arena = DS.Maps.special('trial', 24);
  assert.equal(hestia.key, 's3_hestia');
  assert.equal(hestia.label, 'Temple of Hestia');
  assert.equal(arena.key, 't3_heroes');
  assert.equal(arena.label, 'Arena of Heroes');
  // The first two acts keep wearing the map of the depth in front of them.
  for (const d of [1, 5, 10, 15, 20]) {
    assert.equal(DS.Maps.special('safe', d), null, 'safe ' + d);
    assert.equal(DS.Maps.special('trial', d), null, 'trial ' + d);
  }
  // An endless depth answers as the depth it echoes.
  assert.equal(DS.Maps.special('safe', 55).key, 's3_hestia');
  assert.equal(DS.Maps.special('trial', 84).key, 't3_heroes');
  assert.equal(DS.Maps.special('trial', 35), null);
  assert.equal(DS.Maps.special('boss', 25), null, 'only the safe room and the trial');
});

test('a special room is complete: palette, tiles, light rig, backdrop, an ambience the audio layer has', () => {
  const kinds = new Set(load(['src/core/audio.js']).Audio.ambienceKinds());
  for (const m of DS.Maps.specials()) {
    assert.ok(m.palette && m.palette.pal && m.palette.sky && m.palette.light, m.key + ' palette');
    assert.ok(m.tiles && m.tiles.wall && m.tiles.top && m.tiles.plat, m.key + ' tiles');
    for (const f of ['fog', 'ambient', 'hemiSky', 'hemiGround', 'dir', 'dirI']) assert.ok(m.theme[f] != null, m.key + ' theme.' + f);
    assert.ok(m.backdrop && m.backdrop.hero && m.backdrop.recipe.layers.length >= 5, m.key + ' backdrop');
    assert.ok(kinds.has(m.ambience), m.key + ' ambience ' + m.ambience);
    for (const t of [m.tiles.wall, m.tiles.top, m.tiles.plat]) assert.ok(tileIds.has(t.tex), m.key + ' tile texture ' + t.tex);
    for (const l of m.backdrop.recipe.layers) assert.ok(KINDS.has(l.kind), m.key + ' uses a band kind the backdrop does not know: ' + l.kind);
    assert.equal(DS.Maps.byKey(m.key), m);
  }
  assert.equal(DS.Maps.specials().length, 2);
});

test('a special room may not take a key or a slot twice', () => {
  assert.throws(() => DS.Maps.defineSpecial({ key: 's3_hestia', kind: 'safe', act: 2, label: 'Again' }), /already defined/);
  assert.throws(() => DS.Maps.defineSpecial({ key: 'x_other', kind: 'safe', act: 3, label: 'Again' }), /already/);
  assert.throws(() => DS.Maps.defineSpecial({ key: 'x_bad', kind: 'boss', act: 3, label: 'No' }), /kind must be/);
  assert.throws(() => DS.Maps.defineSpecial({ key: 'x_bad2', kind: 'safe', act: 4, label: 'No' }), /act must be/);
});
