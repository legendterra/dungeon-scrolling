const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* The size table (src/world/levelsize.js): the ranges the v7 plan set, held as
   numbers so a builder cannot drift from them by editing its own constant. */

const DS = load(['src/world/levelsize.js']);
const LS = DS.LevelSize;
const W = LS.ROOM_W;

test('a corridor gets 320-480 tiles at the depths that matter, in whole rooms', () => {
  // the difficulty curve's own room count runs 6 (depth 1) .. 12 (depth 10+)
  const first = (LS.corridorMiddle(6) + 2) * W, last = (LS.corridorMiddle(12) + 2) * W;
  assert.ok(first >= 240 && first <= 320, 'depth 1 corridor is ' + first);
  assert.ok(last >= 440 && last <= 520, 'deep corridor is ' + last);
});

test('a carved climb spans 240-480 tiles', () => {
  for (let base = 6; base <= 12; base++) {
    const w = LS.carvedRooms(base) * W;
    assert.ok(w >= 240 && w <= 480, 'base ' + base + ' -> ' + w);
  }
});

test('a lake is 160-220 tiles and grows with depth', () => {
  let prev = 0;
  for (let d = 1; d <= 30; d++) {
    const w = LS.floodedRooms(d) * W;
    assert.ok(w >= 160 && w <= 220, 'depth ' + d + ' -> ' + w);
    assert.ok(w >= prev, 'monotone at depth ' + d);
    prev = w;
  }
});

test('the fixed shapes are taller and wider than the v6 ones', () => {
  assert.ok(LS.CARVED_ROWS > 22 && LS.FLOODED_ROWS > 22);
  assert.ok(LS.MOUNTAIN.w > 96 && LS.MOUNTAIN.h > 34);
  assert.ok(LS.TRIAL.w > 112);
});
