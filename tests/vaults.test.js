/* Boss floors: the vaults of the floor bosses (the Climb's warden, the minotaur in the
   labyrinth, Medusa in her garden, Talos in the forge), the mountains that have no boss,
   and the ledges every boss room is dressed with (world/arena.js). Built through the real
   generator and judged by the independent checker in tools/lib/levelcheck.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');
const levelcheck = require('../tools/lib/levelcheck');

const DS = load(levelcheck.FILES, levelcheck.GAME_STUBS);
const lc = levelcheck.create(DS);
const TILE = DS.TILE;
const T = DS.C.TILE;

const SEEDS = 6;
const seedFor = (s, depth) => 4000 + s * 11 + depth * 97;

function judge(level, at) {
  const c = lc.check(level);
  assert.ok(c.ok, 'unreachable exit on ' + at);
  for (const m of ['floatingRungs', 'orphanRopes', 'halfLadders', 'pillarsInCorridor']) {
    assert.deepEqual(c.audit[m], [], m + ' on ' + at);
  }
  return c;
}

test('a floor whose map names a floor boss ends in that boss\'s vault, and can be finished', () => {
  for (const depth of [7, 21, 23, 27]) {
    const want = DS.Maps.get(depth).floorBoss;
    assert.ok(want, 'depth ' + depth + ' names a floor boss');
    for (let s = 0; s < SEEDS; s++) {
      const level = lc.buildLevel(seedFor(s, depth), depth);
      const at = 'depth ' + depth + ' seed ' + s;
      judge(level, at);
      const boss = level.spawns.boss;
      assert.ok(boss, 'no boss on ' + at);
      assert.equal(boss.key, want, at);
      assert.equal(level.bossKey, want);
      const gate = level.bossGate;
      assert.ok(gate && level.map.solids.indexOf(gate) >= 0, 'no gate on ' + at);
      const gx = Math.floor(gate.x / T);
      // A lintel of rock from the top of the map to the bars: nobody jumps the gate.
      for (let ty = 0; ty < Math.floor(gate.y / T); ty++) assert.ok(level.map.isSolid(gx, ty), 'lintel open at row ' + ty + ' on ' + at);
      // Two chests, both welded shut.
      const vault = level.spawns.chests.filter((c) => c.x > gate.x);
      assert.ok(vault.length >= 2 && vault.every((c) => c.sealed), 'sealed vault chests on ' + at);
      // The boss stands in the arena, on the floor, on the near side of the bars.
      const arena = level.spawns.arena;
      assert.ok(arena.x0 < boss.x && boss.x < arena.x1 && arena.x1 <= gate.x, 'boss inside the arena on ' + at);
      assert.ok(level.map.groundBelow(Math.floor(boss.x / T)) <= boss.y + T, 'boss stands on the floor on ' + at);   // the mountain drops him a tile
      // The exit is behind the bars: past the gate.
      assert.ok(level.spawns.door.x > gate.x, 'the way onward is in the vault on ' + at);
    }
  }
});

test('the labyrinth and the forge and the garden are corridors that end in a vault, never a climb', () => {
  for (const depth of [21, 23, 27]) {
    for (let s = 0; s < SEEDS; s++) {
      const level = lc.buildLevel(seedFor(s, depth) + 1, depth);
      assert.equal(level.flavor, 'corridor', 'depth ' + depth);
      assert.ok(level.map.w >= DS.LevelGen.ROOM_W * 4);
    }
  }
});

test('a mountain with no floor boss has the shaft and the vault with nobody in it', () => {
  for (const depth of [22, 26]) {
    assert.equal(DS.Maps.get(depth).floorBoss || null, null);
    for (let s = 0; s < SEEDS; s++) {
      const level = lc.buildLevel(seedFor(s, depth), depth);
      const at = 'depth ' + depth + ' seed ' + s;
      assert.equal(level.flavor, 'mountain');
      judge(level, at);
      assert.equal(level.spawns.boss, undefined, 'no boss on ' + at);
      assert.equal(level.bossKey, null);
      assert.equal(level.bossGate, null, 'no bars on ' + at);
      assert.ok(level.spawns.chests.some((c) => c.tier === 'vault'), 'the treasure is there');
      assert.ok(level.spawns.chests.every((c) => !c.sealed), 'and it is not sealed on ' + at);
    }
  }
});

test('the Climb still holds the warden behind its bars', () => {
  const level = lc.buildLevel(seedFor(0, 7), 7);
  assert.equal(level.spawns.boss.key, 'warden');
  assert.ok(level.bossGate);
  assert.ok(level.spawns.chests.filter((c) => c.tier === 'vault').every((c) => c.sealed));
});

test('an endless lap keeps its map\'s floor boss: depth 51 is the labyrinth again', () => {
  const level = lc.buildLevel(seedFor(0, 51), 51);
  assert.equal(level.spawns.boss.key, 'minotaur');
});

test('each boss room is dressed with ledges the hero can stand on, and is still finished by walking', () => {
  // 5 10 15 20 25 30 are the act bosses; 35 and 40 are the Lich and the Magma Colossus in endless.
  const byKey = {};
  for (const depth of [5, 10, 15, 20, 25, 30, 35, 40]) {
    const key = DS.Difficulty.bossForDepth(depth).key;
    byKey[key] = depth;
    const level = lc.buildLevel(seedFor(0, depth), depth);
    const c = judge(level, 'boss room ' + key);
    const want = DS.Arena.ROOMS[key];
    assert.ok(want && want.length > 0, key + ' has ledges');
    const floorRow = DS.LevelGen.ROOM_H - 2;
    for (const [x0, x1, h] of want) {
      for (let x = x0; x <= x1; x++) {
        assert.equal(level.map.get(x, floorRow - h), TILE.PLATFORM, key + ' ledge at ' + x);
        assert.ok(level.map.isDesigned(x, floorRow - h), key + ' ledge is designed');
        assert.ok(c.reach.seen.has(x + ',' + (floorRow - h - 1)), key + ' ledge at ' + x + ' can be reached from the floor');
      }
    }
  }
  assert.deepEqual(Object.keys(byKey).sort(), ['arbiter', 'hades', 'king', 'lich', 'magma', 'warden', 'wyrm', 'zeus']);
});

test('Medusa\'s pillars are two tiles tall, two wide and stand on the floor: high enough to stop a gaze, low enough to jump', () => {
  const level = lc.buildLevel(seedFor(0, 23), 23);
  const F = DS.LevelGen.ROOM_H - 2;
  const x0 = level.map.w - DS.Arena.VAULT_W;
  for (const [a, b, h] of DS.Arena.VAULTS.medusa.blocks) {
    assert.equal(b - a + 1, 2);
    assert.equal(h, 2);
    for (let x = x0 + a; x <= x0 + b; x++) {
      for (let k = 1; k <= h; k++) assert.ok(level.map.isSolid(x, F - k), 'pillar tile ' + x + ',' + (F - k));
      assert.ok(!level.map.isSolid(x, F - h - 1), 'and no taller');
    }
  }
});
