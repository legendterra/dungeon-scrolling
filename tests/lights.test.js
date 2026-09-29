const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

/* Torch light arithmetic (src/core/torchlight.js): the shared flicker, the
   fixed light pool's hysteresis and fades, and the baked per-level light map
   that makes every torch light its own area. */

const DS = load(['src/core/torchlight.js']);
const TL = DS.TorchLight;
const DT = 1 / 60;

function emitters(xs) {
  return xs.map(function (x) { return TL.resetEmitter({ x: x, y: 0, lit: 2 }); });
}
function run(pool, em, cx, frames) {
  for (let f = 0; f < frames; f++) TL.assignPool(pool, em, em.length, cx, 0, DT, 1e9);
}
function lightOf(pool, idx) {
  for (let k = 0; k < pool.n; k++) if (pool.owner[k] === idx) return pool.weight[k];
  return 0;
}

test('flicker stays in a narrow band around 1 and differs by phase', () => {
  let lo = 9, hi = -9;
  for (let t = 0; t < 60; t += 0.01) {
    const v = TL.flicker(t, 0.3);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  assert.ok(lo > 0.8 && hi < 1.2, lo + '..' + hi);
  assert.ok(hi - lo > 0.1, 'it visibly flickers');
  assert.notEqual(TL.flicker(1.234, 0.1), TL.flicker(1.234, 0.6));
});

test('the pool lights the N nearest emitters and fades them in', () => {
  const pool = TL.createPool(2);
  const em = emitters([0, 5, 50, 90]);
  TL.assignPool(pool, em, em.length, 0, 0, DT, 1e9);
  assert.equal(lightOf(pool, 0), 0, 'a new owner starts dark');
  run(pool, em, 0, 60);
  assert.equal(lightOf(pool, 0), 1);
  assert.equal(lightOf(pool, 1), 1);
  assert.equal(em[2].slot, -1);
});

test('hysteresis: a slightly closer rival does not steal the light', () => {
  const pool = TL.createPool(1);
  const em = emitters([0, 20]);
  run(pool, em, 9, 60);             // torch 0 is nearer and owns the slot
  assert.equal(em[0].slot, 0);
  run(pool, em, 10.5, 60);          // now torch 1 is 9.5 away vs 10.5: within hysteresis
  assert.equal(em[0].slot, 0);
  assert.equal(lightOf(pool, 0), 1);
});

test('a clear rival takes over through a fade, never a cut', () => {
  const pool = TL.createPool(1);
  const em = emitters([0, 20]);
  run(pool, em, 0, 60);
  let prev = lightOf(pool, 0), maxJump = 0, handed = false;
  for (let f = 0; f < 90; f++) {
    TL.assignPool(pool, em, em.length, 20, 0, DT, 1e9);
    const now = em[1].slot >= 0 ? lightOf(pool, 1) : lightOf(pool, 0);
    if (em[1].slot >= 0 && !handed) { handed = true; prev = 0; }
    maxJump = Math.max(maxJump, Math.abs(now - prev));
    prev = now;
  }
  assert.equal(em[1].slot, 0);
  assert.equal(lightOf(pool, 1), 1);
  assert.ok(maxJump <= DT / TL.POOL.FADE_S + 1e-6, 'per-frame change is one fade step');
});

test('unlit or far emitters are never candidates', () => {
  const pool = TL.createPool(2);
  const em = emitters([0, 1]);
  em[0].lit = 0;
  for (let f = 0; f < 30; f++) TL.assignPool(pool, em, em.length, 0, 0, DT, 0.5);
  assert.equal(em[0].slot, -1);
  assert.equal(em[1].slot, -1, 'beyond maxD2');
});

test('the light map lights every torch area, with falloff and the torch phase', () => {
  const lm = TL.buildLightMap({
    cols: 40, rows: 10, texel: 8, radius: 40,
    sources: [{ x: 40, y: 40, r: 1, g: 0.6, b: 0.2, phase: 0.25 },
              { x: 260, y: 40, r: 1, g: 0.6, b: 0.2, phase: 0.75 }]
  });
  const at = function (px, py) { const i = (Math.floor(py / 8) * 40 + Math.floor(px / 8)) * 4; return lm.data.subarray(i, i + 4); };
  assert.ok(at(40, 40)[0] > 150, 'bright at the flame');
  assert.ok(at(40, 40)[0] > at(64, 40)[0], 'falls off');
  assert.equal(at(160, 40)[0], 0, 'dark between torches');
  assert.ok(at(260, 40)[0] > 150, 'the second torch lights its own area too');
  assert.ok(Math.abs(at(40, 40)[3] - 64) <= 1);
  assert.ok(Math.abs(at(260, 40)[3] - 191) <= 1);
  assert.ok(at(40, 40)[0] > at(40, 40)[2], 'warm colour');
});
