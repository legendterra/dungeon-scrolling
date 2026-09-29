const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* Procedural body animation (src/core/anim.js): squash and stretch on
   take-off and landing, dash lean, hit flinch, death topple. */

const DS = load(['src/core/anim.js']);
const A = DS.Anim;
const C = A.CFG;

function frame(st, over) {
  const i = A.input;
  i.grounded = true; i.vy = 0; i.dashing = false; i.hurt = false; i.dead = false; i.wind = 0; i.strike = false;
  Object.assign(i, over || {});
  return A.step(st, i);
}

function settle(st, n, over) {
  let o;
  for (let k = 0; k < (n || 80); k++) o = frame(st, over);
  return o;
}

test('a body at rest is undistorted', () => {
  const st = A.create();
  const o = settle(st, 60);
  assert.ok(Math.abs(o.sy - 1) < 1e-3);
  assert.ok(Math.abs(o.sxz - 1) < 1e-3);
  assert.equal(o.pitch, 0);
  assert.equal(o.death, 0);
});

test('take-off crouches first, then stretches', () => {
  const st = A.create();
  settle(st, 10);
  let o = frame(st, { grounded: false, vy: -5 });
  assert.ok(o.sy < 1, 'first frame dips');
  let maxSy = o.sy;
  for (let k = 0; k < 12; k++) {
    o = frame(st, { grounded: false, vy: -5 + k * 0.34 });
    maxSy = Math.max(maxSy, o.sy);
  }
  assert.ok(maxSy > 1, 'then stretches past rest');
});

test('landing squashes harder the faster the fall, and volume is preserved', () => {
  const soft = A.create(), hard = A.create();
  frame(soft, { grounded: false, vy: 2 });
  frame(hard, { grounded: false, vy: 7 });
  const os = frame(soft, { grounded: true });
  const oh = frame(hard, { grounded: true });
  assert.ok(os.justLanded && oh.justLanded);
  assert.ok(oh.sy < os.sy, 'hard landing is flatter');
  assert.ok(oh.landPower > os.landPower);
  assert.ok(oh.sxz > 1, 'squash widens the body');
  assert.ok(Math.abs(oh.sy * oh.sxz * oh.sxz - 1) < 1e-9, 'volume preserved');
  const rest = settle(hard, 90);
  assert.ok(Math.abs(rest.sy - 1) < 0.01, 'spring returns to rest');
});

test('a step-down too gentle to be a landing does not squash', () => {
  const st = A.create();
  frame(st, { grounded: false, vy: 0.5 });
  const o = frame(st, { grounded: true });
  assert.equal(o.justLanded, false);
  assert.ok(Math.abs(o.sy - 1) < 0.05);
});

test('the apex tuck rises near the top of the jump and clears on the ground', () => {
  const st = A.create();
  frame(st, { grounded: false, vy: -5 });
  const rising = frame(st, { grounded: false, vy: -5 });
  assert.ok(rising.tuck < 0.3);
  let o;
  for (let k = 0; k < 20; k++) o = frame(st, { grounded: false, vy: 0.2 });
  assert.ok(o.tuck > 0.9);
  o = settle(st, 40);
  assert.ok(o.tuck < 0.05);
});

test('dashing leans forward, a wind-up coils back', () => {
  const st = A.create();
  let o = settle(st, 20, { dashing: true });
  assert.ok(Math.abs(o.pitch - C.DASH_LEAN) < 0.01);
  o = settle(st, 20, { wind: 1 });
  assert.ok(o.pitch < -0.25);
  o = settle(st, 30);
  assert.ok(Math.abs(o.pitch) < 0.01);
});

test('a hit flinch fires once per hit, throws the torso back and recovers', () => {
  const st = A.create();
  let o = frame(st, { hurt: true });
  assert.ok(o.flinch > 0.9 && o.pitch < -0.3);
  // Holding the flag up does not retrigger.
  for (let k = 0; k < C.FLINCH_FRAMES + 4; k++) o = frame(st, { hurt: true });
  assert.equal(o.flinch, 0);
  frame(st, { hurt: false });
  o = frame(st, { hurt: true });
  assert.ok(o.flinch > 0.9, 'a second hit flinches again');
});

test('death topples smoothly to 1 and revives clean', () => {
  const st = A.create();
  let prev = 0, o;
  for (let k = 0; k < C.DEATH_FRAMES + 10; k++) {
    o = frame(st, { dead: true });
    assert.ok(o.death >= prev);
    prev = o.death;
  }
  assert.equal(o.death, 1);
  o = frame(st, { dead: false });
  assert.equal(o.death, 0);
});

test('reset returns a used state to rest', () => {
  const st = A.create();
  frame(st, { grounded: false, vy: 7 });
  frame(st, { grounded: true });
  A.reset(st);
  const o = frame(st);
  assert.ok(Math.abs(o.sy - 1) < 1e-6);
  assert.equal(o.justLanded, false);
});
