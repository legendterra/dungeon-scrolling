const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* The world frame (src/core/worldframe.js): the rectangle of each backdrop
   plane the camera can ever see on a floor. The backdrop is built to FILL these
   rectangles and then stands still, so they must be right -- and must be an
   over-estimate, never an under-estimate. */

const DS = load(['src/core/worldframe.js']);
const WF = DS.WorldFrame;
const RIG = WF.ACTION_RIG;
const P2U = 0.1;

function near(a, b, eps, msg) {
  assert.ok(Math.abs(a - b) <= eps, (msg || '') + ` expected ${b}, got ${a}`);
}

test('the extent on the actor plane matches visibleExtent for the action rig', () => {
  // Hand-evaluated from renderer3d.visibleExtent with fov 35, pitch .19, dist 18.
  const e = WF.extentPx(RIG, 1);
  const f = 35 * Math.PI / 180, p = 0.19, dist = 18;
  const D = dist * Math.cos(p) - 0.3;
  near(e.up, (dist * Math.sin(p) - D * Math.tan(p - f / 2)) / P2U, 1e-9);
  near(e.down, (D * Math.tan(p + f / 2) - dist * Math.sin(p)) / P2U, 1e-9);
  near(e.half, dist * Math.tan(f / 2) * (16 / 9) / P2U, 1e-9);
  near(e.lift, 4.5, 1e-9);
});

test('a map narrower than the view centres the aim; a wide one gives it room', () => {
  const half = WF.extentPx(RIG, WF.ZOOM_IN).half;
  const narrow = WF.cameraRange(half * 1.5, 22 * 16, RIG);
  near(narrow.x0, narrow.x1, 1e-9, 'narrow map: one x');
  const wide = WF.cameraRange(200 * 16, 22 * 16, RIG);
  assert.ok(wide.x1 - wide.x0 > 100, 'a 200-tile map lets the aim travel');
  near(wide.x0, half * P2U, 1e-9);
  near(wide.x1, (200 * 16 - half) * P2U, 1e-9);
});

test('a taller map gives the aim more vertical travel', () => {
  const short = WF.cameraRange(120 * 16, 22 * 16, RIG);
  const tall = WF.cameraRange(120 * 16, 60 * 16, RIG);
  assert.ok(tall.y1 - tall.y0 > short.y1 - short.y0 + 30);
});

test('coverage widens with distance and always contains the actor-plane frame', () => {
  const range = WF.cameraRange(180 * 16, 22 * 16, RIG);
  let prev = 0;
  for (const D of [4.5, 12, 30, 68, 180, 300]) {
    const c = WF.coverageAt(D, range, RIG);
    const w = c.x1 - c.x0;
    assert.ok(w > prev, `width grows at D=${D}`);
    prev = w;
    // The frame on the actor plane is inside the frame at any depth behind it.
    const e = WF.extentPx(RIG, 1);
    assert.ok(c.x0 <= range.x0 - e.half * P2U + 1e-6, 'left edge covers the actor frame');
    assert.ok(c.x1 >= range.x1 + e.half * P2U - 1e-6, 'right edge covers the actor frame');
  }
});

test('no sampled camera ever sees outside the coverage rectangle', () => {
  const range = WF.cameraRange(140 * 16, 40 * 16, RIG);
  for (const D of [4.5, 19, 68, 300]) {
    const cov = WF.coverageAt(D, range, RIG);
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) for (const z of [0.88, 0.94, 1]) {
      const ax = range.x0 + (range.x1 - range.x0) * i / 6;
      const ay = range.y0 + (range.y1 - range.y0) * j / 6;
      const corners = WF.frameCorners(RIG, ax, ay, z, D);
      for (const c of corners) {
        assert.ok(c.x >= cov.x0 && c.x <= cov.x1, `x inside at D=${D}`);
        assert.ok(c.y >= cov.y0 && c.y <= cov.y1, `y inside at D=${D}`);
      }
    }
  }
});

test('the eye sits above the aim and the frame is taller than the eye range', () => {
  const range = WF.cameraRange(96 * 16, 60 * 16, RIG);
  const eye = WF.eyeRange(range, RIG);
  assert.ok(eye.y1 > range.y1, 'eye above the aim');
  const cov = WF.coverageAt(68, range, RIG);
  assert.ok(cov.y1 - cov.y0 > (range.y1 - range.y0), 'coverage spans the whole climb');
  assert.ok(cov.y1 > eye.y1, 'and reaches above the highest eye at a far plane');
});

test('a sky pinned to the eye needs more room below than above (the lens looks down)', () => {
  const s = WF.eyeSpan(150, RIG);
  assert.ok(s.down > s.up, `down ${s.down} > up ${s.up}`);
  assert.ok(s.half > 0);
});

test('forMap bundles a range, the eye range and a rectangle per rung', () => {
  const m = WF.forMap(180 * 16, 22 * 16, RIG, [4.5, 12, 68]);
  assert.deepEqual(Object.keys(m.at).sort(), ['12', '4.5', '68']);
  assert.ok(m.range.x1 > m.range.x0);
});

/* worldframe.js mirrors numbers that live in renderer3d.js. If one of them
   moves there and not here, every backdrop is built for a camera that does not
   exist -- silently. Read the source and hold them to each other. */
test('the constants worldframe mirrors still match renderer3d.js', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src', 'core', 'renderer3d.js'), 'utf8');
  const num = (re, what) => {
    const m = re.exec(src);
    assert.ok(m, 'renderer3d.js no longer has ' + what);
    return parseFloat(m[1]);
  };
  near(num(/const ZOOM_IN = ([\d.]+);/, 'ZOOM_IN'), WF.ZOOM_IN, 1e-9, 'ZOOM_IN');
  near(num(/const ACTOR_Z = ([\d.]+);/, 'ACTOR_Z'), 0.3, 1e-9, 'ACTOR_Z');
  near(num(/const P2U = ([\d.]+);/, 'P2U'), P2U, 1e-9, 'P2U');
  const cine = /key: 'cine',[^}]*yaw: ([\d.]+),\s*pitch: ([\d.]+),\s*dist: ([\d.]+),\s*fov: ([\d.]+),\s*lift: ([\d.]+)/.exec(src);
  assert.ok(cine, 'the action preset moved');
  near(+cine[1], RIG.yaw, 1e-9, 'yaw');
  near(+cine[2], RIG.pitch, 1e-9, 'pitch');
  near(+cine[3], RIG.dist, 1e-9, 'dist');
  near(+cine[4], RIG.fov, 1e-9, 'fov');
  near(+cine[5], RIG.lift, 1e-9, 'lift');
});
