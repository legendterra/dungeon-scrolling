const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* The baked texture data (src/art/textures/common.gen.js) must agree with the
   manifest it was baked from, and stay small enough to ship inside index.html's
   script list: a data file that lost an entry, or grew past its budget, would
   otherwise show up only as a level that quietly falls back to pixel-art. */

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'assets', 'textures.json'), 'utf8'));
const genPath = path.join(ROOT, 'src', 'art', 'textures', 'common.gen.js');
const genSource = fs.readFileSync(genPath, 'utf8');

const sandbox = { window: {} };
sandbox.window.DS = {};
vm.createContext(sandbox);
vm.runInContext('var DS = window.DS;' + genSource, sandbox);
const DS = sandbox.window.DS;

test('every manifest id is in the baked data, and only those', () => {
  const want = manifest.textures.map((t) => t.id).sort();
  assert.deepEqual(Object.keys(DS.TexData).sort(), want);
  assert.deepEqual(Object.keys(DS.TexMeta).sort(), want);
});

test('every entry is a JPEG data URI of a plausible size', () => {
  for (const id of Object.keys(DS.TexData)) {
    const uri = DS.TexData[id];
    assert.ok(uri.startsWith('data:image/jpeg;base64,'), id + ' is not a jpeg data uri');
    assert.ok(uri.length > 1000, id + ' is suspiciously small (' + uri.length + ')');
    assert.ok(uri.length < 60000, id + ' is over budget (' + uri.length + ')');
  }
});

test('the data file stays under 1.5 MB', () => {
  assert.ok(genSource.length < 1.5 * 1048576, 'common.gen.js is ' + (genSource.length / 1048576).toFixed(2) + ' MB');
});

test('every procedural backdrop family has an HD stand-in that exists', () => {
  const families = ['sand', 'wetrock', 'brick', 'blood', 'marble', 'moss', 'granite', 'ceramic', 'basalt', 'gild', 'bark', 'bone'];
  for (const f of families) {
    const id = DS.TexFamilyMap[f];
    assert.ok(id, 'no HD texture for family ' + f);
    assert.ok(DS.TexData[id], 'family ' + f + ' points at ' + id + ', which is not baked');
  }
});

test('the three tile textures exist, are grayscale, and say how large one copy is', () => {
  for (const id of ['tile_wall', 'tile_floor', 'tile_plat']) {
    assert.ok(DS.TexData[id], id + ' missing');
    assert.equal(DS.TexMeta[id].gray, true, id + ' should be grayscale');
    assert.ok(DS.TexMeta[id].span > 1, id + ' has no world span');
  }
});

test('every source is a CC0 Poly Haven asset and the manifest says so', () => {
  assert.match(manifest.license, /CC0/);
  assert.match(genSource, /Poly Haven/);
  assert.match(genSource, /CC0/);
});
