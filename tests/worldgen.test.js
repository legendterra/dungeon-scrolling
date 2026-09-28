/* World generation: the floors must be finishable AND look built.

   Every floor is built through the real generator (tests/_load.js loads the
   same modules, in the same order, as tools/solve-levels.js) and judged by the
   independent checker in tools/lib/levelcheck.js - its own move model, its own
   definitions of a floating rung, an orphan rope, a half ladder and a pillar. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');
const levelcheck = require('../tools/lib/levelcheck');

const DS = load(levelcheck.FILES, levelcheck.GAME_STUBS);
const lc = levelcheck.create(DS);
const TILE = DS.TILE;

const SEEDS = 20;
const DEPTHS = 10;

function seedFor(s, depth) { return 1000 + s * 7 + depth * 131; }

/* Build once, judge many times: the sweep is the expensive part. */
const sweep = [];
for (let depth = 1; depth <= DEPTHS; depth++) {
  for (let s = 0; s < SEEDS; s++) {
    const seed = seedFor(s, depth);
    const level = lc.buildLevel(seed, depth);
    sweep.push({ seed: seed, depth: depth, level: level, check: lc.check(level) });
  }
}

function where(f) { return 'depth ' + f.depth + ' seed ' + f.seed + ' (' + (f.level.flavor || f.level.kind) + ')'; }

test('every floor of depths 1-10 has a reachable exit', () => {
  for (const f of sweep) {
    assert.ok(f.check.ok, 'unreachable exit on ' + where(f));
  }
});

test('no repair floats: every undesigned platform is held by rock or rests on something', () => {
  for (const f of sweep) {
    assert.deepEqual(f.check.audit.floatingRungs, [], 'floating platform on ' + where(f));
  }
});

test('every rope is tied to rock at the top and reaches a floor at the bottom', () => {
  for (const f of sweep) {
    assert.deepEqual(f.check.audit.orphanRopes, [], 'orphan rope on ' + where(f));
  }
});

test('no half ladders: every ladder starts a hop above a floor and ends at a lip', () => {
  for (const f of sweep) {
    assert.deepEqual(f.check.audit.halfLadders, [], 'half ladder on ' + where(f));
  }
});

test('no one-tile pillars stand in a corridor', () => {
  for (const f of sweep) {
    assert.deepEqual(f.check.audit.pillarsInCorridor, [], 'pillar on ' + where(f));
  }
});

test('the special rooms are finishable and clean too', () => {
  const kinds = ['safe', 'boss', 'trial'];
  for (const kind of kinds) {
    for (let s = 0; s < 6; s++) {
      const seed = seedFor(s, 3);
      const level = lc.buildLevel(seed, 3 + s, kind);
      const c = lc.check(level);
      const at = kind + ' seed ' + seed;
      assert.ok(c.ok, 'unreachable exit in ' + at);
      for (const m of ['floatingRungs', 'orphanRopes', 'halfLadders', 'pillarsInCorridor']) {
        assert.deepEqual(c.audit[m], [], m + ' in ' + at);
      }
    }
  }
});

test('designed crossings survive: pit stepping stones are kept, not deleted', () => {
  let stones = 0;
  for (const f of sweep) {
    const map = f.level.map;
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        if (map.isPlatform(tx, ty) && map.isDesigned(tx, ty)) stones++;
      }
    }
  }
  assert.ok(stones > 0, 'no designed platform survived generation anywhere');
});

test('a climb is all or nothing: one rung that cannot fit leaves no ladder', () => {
  const map = DS.Map.create(20, 22);
  // Floor at row 20; a cliff of rock rising to row 13 from column 10 on.
  for (let x = 0; x < 20; x++) for (let y = 20; y < 22; y++) map.set(x, y, TILE.WALL);
  for (let x = 10; x < 20; x++) for (let y = 13; y < 20; y++) map.set(x, y, TILE.WALL);
  // Something already in the way of the third rung, and of the rope column.
  map.set(9, 17, TILE.SPIKE);
  map.set(8, 17, TILE.SPIKE);
  const before = Array.from(map.data);
  const made = DS.Reach.buildClimb(map, 10, -1, 13, 20);
  assert.equal(made, null);
  assert.deepEqual(Array.from(map.data), before, 'a refused climb must write nothing');

  map.set(9, 17, TILE.EMPTY);
  map.set(8, 17, TILE.EMPTY);
  const rope = DS.Reach.buildClimb(map, 10, -1, 13, 20);
  assert.equal(rope.kind, 'rope');
  assert.equal(map.get(9, 13), TILE.ROPE, 'the rope is tied level with the lip');
  assert.equal(map.get(9, 19), TILE.ROPE, 'the rope reaches the floor');
});

test('the cliff height ignores one-way ledges', () => {
  const map = DS.Map.create(10, 22);
  for (let x = 0; x < 10; x++) for (let y = 20; y < 22; y++) map.set(x, y, TILE.WALL);
  map.set(4, 14, TILE.PLATFORM);
  assert.equal(DS.Reach.surfaceRow(map, 4), 20);
  assert.equal(Math.floor(map.groundBelow(4) / DS.C.TILE), 14, 'props still stand on ledges');
});

test('barriers wall the corridor to the top of the map and roll every variant', () => {
  const kinds = {};
  let halls = 0;
  for (const f of sweep) {
    const plan = f.level.barrier;
    if (f.depth === 4) {
      assert.ok(plan, 'the Torch Hall must hold its barrier: ' + where(f));
      assert.equal(plan.kind, 'beacons');
      assert.ok(plan.beacons.length > 0);
      halls++;
    }
    if (!plan) continue;
    kinds[plan.kind] = (kinds[plan.kind] || 0) + 1;
    for (let ty = 0; ty < plan.floorRow - 4; ty++) {
      assert.ok(f.level.map.isSolid(plan.gateTx, ty), 'barrier wall open at row ' + ty + ' on ' + where(f));
    }
  }
  assert.equal(halls, SEEDS);
  for (const k of ['keygate', 'plates', 'braziers']) {
    assert.ok(kinds[k] > 0, 'barrier variant never rolled: ' + k);
  }
});

test('mountain ropes hang from the lip of the plateau they serve', () => {
  let ropes = 0;
  for (let s = 0; s < 10; s++) {
    const level = lc.buildLevel(seedFor(s, 7), 7);
    if (level.flavor !== 'mountain') continue;
    for (const seg of lc.ropeSegments(level.map)) {
      ropes++;
      const map = level.map;
      const tied = map.isSolid(seg.tx + 1, seg.top) || map.isSolid(seg.tx - 1, seg.top) ||
                   map.isSolid(seg.tx, seg.top - 1);
      assert.ok(tied, 'rope at column ' + seg.tx + ' is tied to nothing');
    }
  }
  assert.ok(ropes > 0, 'no mountain was built');
});
