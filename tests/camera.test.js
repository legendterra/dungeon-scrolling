const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* The camera's grounded-Y follow (src/core/camfollow.js): a jump must not
   move the frame, landing somewhere new must re-centre it smoothly, and a
   fall must be chased so the hero is never lost. */

const DS = load(['src/core/camfollow.js']);
const CF = DS.CamFollow;
const C = CF.CFG;

const GRAVITY = 0.34;     // DS.C.GRAVITY
const JUMP_VEL = 5.3;     // base jumpVel

function hero(px, py, extra) {
  return Object.assign({ px: px, py: py, facing: 1, vy: 0, grounded: true, tracking: false }, extra || {});
}

/* Settle a camera on a hero standing at (px, py). */
function settled(px, py) {
  const cam = { x: px, y: py };
  const st = CF.create();
  CF.reset(st, px, py);
  for (let i = 0; i < 400; i++) CF.step(cam, st, hero(px, py));
  return { cam, st };
}

test('standing still, the aim settles AIM_ABOVE over the hero and LOOK_AHEAD in front', () => {
  const { cam } = settled(200, 300);
  assert.ok(Math.abs(cam.y - (300 - C.AIM_ABOVE)) < 1e-3);
  assert.ok(Math.abs(cam.x - (200 + C.LOOK_AHEAD)) < 1e-3);
});

test('a full single jump does not move the camera vertically at all', () => {
  const { cam, st } = settled(200, 300);
  const y0 = cam.y;
  let py = 300, vy = -JUMP_VEL, maxDy = 0, apex = 0;
  for (let f = 0; f < 200; f++) {
    vy += GRAVITY; py += vy;
    const grounded = py >= 300;
    if (grounded) { py = 300; vy = 0; }
    apex = Math.max(apex, 300 - py);
    CF.step(cam, st, hero(200, py, { vy: vy, grounded: grounded }));
    maxDy = Math.max(maxDy, Math.abs(cam.y - y0));
    if (grounded && f > 5) break;
  }
  assert.ok(apex > 35, 'the simulated jump really left the ground (' + apex + 'px)');
  assert.ok(maxDy < 1e-6, "camera moved " + maxDy + "px during a jump");
});

test('rising beyond the band pushes the anchor, and the hero stays framed', () => {
  const { cam, st } = settled(200, 300);
  let worst = 0;
  for (let py = 300; py > 180; py -= 3) {
    CF.step(cam, st, hero(200, py, { vy: -3, grounded: false }));
    worst = Math.max(worst, Math.abs(py - cam.y));
  }
  assert.ok(st.anchorY <= 180 + C.BAND_UP + 3);
  assert.ok(worst <= C.MAX_DEV + 1e-9);
});

test('landing on a higher ledge re-centres smoothly, never snapping', () => {
  const { cam, st } = settled(200, 300);
  let prev = cam.y, maxStep = 0;
  for (let i = 0; i < 300; i++) {
    CF.step(cam, st, hero(200, 260));
    maxStep = Math.max(maxStep, Math.abs(cam.y - prev));
    prev = cam.y;
  }
  assert.ok(Math.abs(cam.y - (260 - C.AIM_ABOVE)) < 0.05, 'converged on the new ground');
  assert.ok(maxStep < 40 * C.Y_RATE + 1e-9, 'first step is the ease, not a jump cut');
});

test('a fall off a ledge is chased and the hero stays framed', () => {
  const { cam, st } = settled(200, 300);
  let py = 300, vy = 0;
  for (let f = 0; f < 40; f++) {
    vy = Math.min(vy + GRAVITY, 6.4); py += vy;
    CF.step(cam, st, hero(200, py, { vy: vy, grounded: false }));
    assert.ok(Math.abs(py - cam.y) <= C.MAX_DEV + 1e-9, 'hero framed at frame ' + f);
  }
  assert.equal(st.chasing, true);
});

test('ropes and water follow continuously, without a band', () => {
  const { cam, st } = settled(200, 300);
  CF.step(cam, st, hero(200, 290, { grounded: false, tracking: true }));
  assert.equal(st.anchorY, 290);
});

test('turning round eases the look-ahead across, it does not cut', () => {
  const { cam, st } = settled(200, 300);
  const x0 = cam.x;
  CF.step(cam, st, hero(200, 300, { facing: -1 }));
  assert.ok(Math.abs(cam.x - x0) <= 2 * C.LOOK_AHEAD * C.X_RATE + 1e-9);
});

test('an unready state seats itself on the first step', () => {
  const cam = { x: 0, y: 0 };
  const st = CF.create();
  CF.step(cam, st, hero(50, 80, { grounded: false }));
  assert.equal(st.ready, true);
  assert.equal(st.anchorY, 80);
});
