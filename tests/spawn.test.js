/* Where monsters stand and which ones turn up: the spawn table per biome, the
   spread of a floor's population along its length, and the one-colossus rule. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const STUBS = 'window.DS.Audio = autoStub(); window.DS.FX = autoStub(); window.DS.R = autoStub();' +
              'window.DS.Art = autoStub(); window.DS.SPR = autoStub(); window.DS.UI = autoStub();' +
              'window.DS.Ent = autoStub(); window.DS.Phys = autoStub();';

function loadSpawns() {
  return load([
    'src/core/rng.js',
    'src/systems/difficulty.js',
    'src/entities/enemies.js',
    'src/entities/enemies2.js',
    'src/entities/enemies3.js',
    'src/scenes/game.js'
  ], STUBS);
}

const NEW_KINDS = ['icewisp', 'harpy', 'cultist', 'magmacrab'];

test('four new act 2-3 monsters are registered with a behaviour', () => {
  const DS = loadSpawns();
  for (const k of NEW_KINDS) {
    const cfg = DS.Enemies.TYPES[k];
    assert.ok(cfg, k + ' registered');
    assert.equal(typeof cfg.behavior, 'function', k + ' behaviour');
    assert.ok(cfg.minDepth > 10, k + ' is gated past act 1');
    assert.ok(cfg.sprite, k + ' has a 2D sprite key');
  }
});

test('spawn tables keep depth gating: act 1 never rolls the new monsters', () => {
  const DS = loadSpawns();
  for (let d = 1; d <= 10; d++) {
    const kinds = DS.Enemies.spawnTable(d).filter((e) => e.weight > 0).map((e) => e.value);
    for (const k of NEW_KINDS) assert.ok(!kinds.includes(k), k + ' at depth ' + d);
  }
  const deep = DS.Enemies.spawnTable(28).map((e) => e.value);
  for (const k of NEW_KINDS) assert.ok(deep.includes(k), k + ' at depth 28');
});

test('spawn tables lean toward the biome', () => {
  const DS = loadSpawns();
  function weight(depth, biome, kind) {
    const row = DS.Enemies.spawnTable(depth, biome).find((e) => e.value === kind);
    return row ? row.weight : 0;
  }
  assert.ok(weight(25, 'volcanic', 'magmacrab') > weight(25, 'swamp', 'magmacrab'));
  assert.ok(weight(18, 'flooded', 'icewisp') > weight(18, 'volcanic', 'icewisp'));
  assert.ok(weight(22, 'mountain', 'harpy') > weight(22, 'prison', 'harpy'));
  for (const row of DS.Enemies.spawnTable(40)) {
    assert.ok(Number.isFinite(row.weight) && row.weight >= 0, row.value);
  }
});

test('spreadSpawns walks the whole floor instead of emptying the far end', () => {
  const DS = loadSpawns();
  // A crowded start: two thirds of the markers sit in the first fifth.
  const spots = [];
  for (let i = 0; i < 20; i++) spots.push({ x: 40 + i * 8, y: 100 });
  for (let i = 0; i < 10; i++) spots.push({ x: 400 + i * 120, y: 100 });
  const order = DS.Enemies.spreadSpawns(spots, 6, DS.makeRng(3));
  assert.equal(order.length, spots.length, 'every marker is kept');
  const first = order.slice(0, 6);
  const maxX = Math.max.apply(null, spots.map((s) => s.x));
  assert.ok(first.some((s) => s.x > maxX * 0.75), 'the far end gets someone');
  assert.ok(first.filter((s) => s.x < 200).length <= 2, 'the start is not the whole budget');
  assert.equal(new Set(order).size, spots.length, 'no marker twice');
});

/* A flat floor wide enough to hold the spread, and a stubbed create() that
   records what populate asked for. */
function fakeRun(DS, seed, depth) {
  const created = [];
  DS.Enemies.create = function (g, x, y, kind, tier) {
    const e = { x: x, y: y, kind: kind, tier: tier === true ? 'elite' : (tier || 'normal') };
    created.push(e);
    g.enemies.push(e);
    return e;
  };
  DS.Modifiers = { mult: () => 1, has: () => false };
  DS.Loot = { rollChestTier: () => 'wood' };
  const T = DS.C.TILE;
  const g = {
    depth: depth, rng: DS.makeRng(seed), enemies: [], chests: [],
    map: {
      w: 200, pixelW: 200 * T, pixelH: 22 * T,
      groundBelow: () => 20 * T
    }
  };
  const spawns = { enemies: [], chests: [] };
  for (let i = 0; i < 18; i++) spawns.enemies.push({ x: (4 + i * 2) * T, y: 19 * T });
  for (let i = 0; i < 10; i++) spawns.enemies.push({ x: (50 + i * 14) * T, y: 19 * T });
  return { g, spawns, created };
}

test('populate never places more than one colossus on a floor', () => {
  const DS = loadSpawns();
  for (let seed = 1; seed <= 60; seed++) {
    for (const depth of [9, 18, 30, 45]) {
      const run = fakeRun(DS, seed, depth);
      DS.Game.populate(run.g, run.spawns);
      const colossi = run.created.filter((e) => e.tier === 'colossal').length;
      assert.ok(colossi <= 1, colossi + ' colossi at depth ' + depth + ' seed ' + seed);
    }
  }
});

test('populate reaches the far end of a front-loaded floor', () => {
  const DS = loadSpawns();
  let reached = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const run = fakeRun(DS, seed, 12);
    DS.Game.populate(run.g, run.spawns);
    const far = run.created.some((e) => e.x > run.g.map.pixelW * 0.5);
    if (far) reached++;
  }
  assert.equal(reached, 20);
});
