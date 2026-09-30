/* Shoving a crate: puzzle.js tells the hero he is pushing (p.pushT) whenever he walks
   into a grounded crate he is facing, moved or not, and player.js runs it down, so the
   hero's pose (renderer3d poseHero) has something to read even though the crate holds
   him still. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const STUBS =
  'window.DS.__win = window; window.__axis = 0; window.__moved = true;' +
  'window.DS.Input = { axisX: function () { return window.__axis; } };' +
  'window.DS.Audio = { play: function () {} };' +
  'window.DS.FX = { dust: function () {}, burst: function () {} };' +
  'window.DS.Phys = { step: function () {}, grounded: function () { return true; },' +
  '  moveX: function (c, m, dx) { if (window.__moved) c.x += dx; } };';

function fresh() {
  const DS = load(['src/core/rng.js', 'src/world/puzzle.js'], STUBS);
  const crate = { x: 100, y: 0, w: 14, h: 14, vx: 0, vy: 0, onGround: true, pushable: true };
  const player = { x: 80, y: 0, w: 12, h: 17, dead: false, blockedBy: crate };
  const g = { crates: [crate], puzzles: [], player, map: { deathOverlap: () => false, pixelH: 9999 }, frames: 1 };
  return { DS, g, crate, player };
}

test('walking into a crate you face marks the hero as pushing, moved or not', () => {
  const { DS, g, player } = fresh();
  DS.__win.__axis = 1;
  DS.Puzzle.update(g);
  assert.ok(player.pushT > 0, 'pushing a crate that moves');
  player.pushT = 0;
  DS.__win.__moved = false;                                   // it will not budge
  DS.Puzzle.update(g);
  assert.ok(player.pushT > 0, 'still straining against one that does not');
});

test('no push without input, facing away, or being blocked by something else', () => {
  let t = fresh();
  t.DS.__win.__axis = 0;
  t.DS.Puzzle.update(t.g);
  assert.ok(!t.player.pushT, 'standing still against it');
  t = fresh();
  t.DS.__win.__axis = -1;
  t.DS.Puzzle.update(t.g);
  assert.ok(!t.player.pushT, 'walking away from it');
  t = fresh();
  t.DS.__win.__axis = 1;
  t.player.blockedBy = null;
  t.DS.Puzzle.update(t.g);
  assert.ok(!t.player.pushT, 'not touching it');
});
