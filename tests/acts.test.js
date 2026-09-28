const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const DS = load(['src/core/rng.js', 'src/systems/difficulty.js']);
const A = DS.Acts;
const D = DS.Difficulty;

/* Theme keys the 3D renderer and the backdrop actually know how to light. */
const THEMES = ['shore', 'cave', 'prison', 'vault', 'swamp', 'mountain', 'flooded',
                'volcanic', 'throne', 'forest', 'caves', 'nest', 'trial'];

test('three acts of ten, and FINAL_DEPTH is the last act boss', () => {
  assert.equal(DS.C.ACT_LENGTH, 10);
  assert.equal(DS.C.ACTS, 3);
  assert.equal(DS.C.FINAL_DEPTH, 30);
});

test('actOf / depthInAct split the run into acts, then endless', () => {
  assert.equal(A.actOf(1), 1);
  assert.equal(A.actOf(10), 1);
  assert.equal(A.actOf(11), 2);
  assert.equal(A.actOf(20), 2);
  assert.equal(A.actOf(21), 3);
  assert.equal(A.actOf(30), 3);
  assert.equal(A.actOf(31), 4);
  assert.equal(A.depthInAct(1), 1);
  assert.equal(A.depthInAct(10), 10);
  assert.equal(A.depthInAct(11), 1);
  assert.equal(A.depthInAct(25), 5);
  assert.equal(A.depthInAct(30), 10);
  assert.equal(A.depthInAct(37), 7);
  assert.equal(A.isEndless(30), false);
  assert.equal(A.isEndless(31), true);
  assert.equal(A.isEndless(500), true);
});

test('boss depths are 5 and 10 of every act, then every 5 in endless', () => {
  const bosses = [];
  for (let d = 1; d <= 50; d++) if (A.isBossDepth(d)) bosses.push(d);
  assert.deepEqual(bosses, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
});

test('a safe room stands in front of every boss depth', () => {
  for (let d = 1; d <= 60; d++) {
    assert.equal(A.isSafeBefore(d), A.isBossDepth(d), 'depth ' + d);
  }
  for (const d of [5, 10, 15, 20, 25, 30]) assert.ok(DS.C.SAFE_BEFORE.includes(d));
});

test('HUD labels read act and step, or endless depth', () => {
  assert.equal(A.label(1), 'ACT I - 1/10');
  assert.equal(A.label(13), 'ACT II - 3/10');
  assert.equal(A.label(30), 'ACT III - 10/10');
  assert.equal(A.label(34), 'ENDLESS - 34');
  assert.equal(A.shortLabel(13), 'II 3/10');
  assert.equal(A.shortLabel(34), 'END 34');
});

test('boss rotation: six act bosses, then they come round again in endless', () => {
  const keys = [5, 10, 15, 20, 25, 30].map((d) => D.bossForDepth(d).key);
  assert.deepEqual(keys, ['warden', 'king', 'arbiter', 'wyrm', 'lich', 'magma']);
  assert.equal(D.bossForDepth(7), null);
  assert.equal(D.bossForDepth(35).key, 'warden');
  assert.equal(D.bossForDepth(40).key, 'king');
  assert.equal(D.bossForDepth(60).key, 'magma');
  assert.equal(D.bossForDepth(65).key, 'warden');
  assert.equal(D.bossForDepth(30).cycle, 0);
  assert.equal(D.bossForDepth(35).cycle, 1);
  assert.equal(D.bossForDepth(65).cycle, 2);
  // Each lap of the rotation is harder than the last.
  assert.ok(D.bossHpMult(35) > D.bossHpMult(30));
  assert.ok(D.bossHpMult(65) > D.bossHpMult(60));
});

test('difficulty never flattens into a clamp: every depth to 60 is at least as hard', () => {
  let prev = D.forDepth(1);
  for (let d = 2; d <= 60; d++) {
    const cur = D.forDepth(d);
    assert.equal(cur.depth, d);
    for (const k of ['hpMult', 'damageMult', 'speedMult', 'enemyCount', 'hazardChance']) {
      assert.ok(Number.isFinite(cur[k]), k + ' finite at ' + d);
      assert.ok(cur[k] >= prev[k], k + ' dropped at depth ' + d);
    }
    assert.ok(D.bossHpMult(d) >= D.bossHpMult(d - 1));
    prev = cur;
  }
  // HP keeps growing past the old depth-10 ceiling instead of freezing there.
  assert.ok(D.forDepth(20).hpMult > D.forDepth(10).hpMult);
  assert.ok(D.forDepth(40).hpMult > D.forDepth(20).hpMult);
  assert.ok(D.forDepth(20).enemyCount > D.forDepth(10).enemyCount);
  // Damage is paid in hearts: it grows, but gently.
  assert.ok(D.forDepth(60).damageMult < 3);
});

test('elite odds rise smoothly and never go backwards', () => {
  function share(d, rank) {
    const w = D.rankWeights(d);
    const total = w.reduce((s, e) => s + e.weight, 0);
    return w.filter((e) => e.value === rank).reduce((s, e) => s + e.weight, 0) / total;
  }
  let prevElite = 0;
  for (let d = 3; d <= 60; d++) {
    const cur = share(d, 'elite') + share(d, 'miniboss') + share(d, 'colossal');
    assert.ok(cur >= prevElite - 1e-9, 'ranked share dropped at ' + d);
    assert.ok(share(d, 'normal') > 0.2, 'normals still exist at ' + d);
    prevElite = cur;
  }
});

test('the biome ladder: act 1 keeps its journey, acts 2-3 change flavor, endless cycles', () => {
  const act1 = [1, 2, 3, 4, 6, 7, 8, 9].map((d) => D.biomeForDepth(d).key);
  assert.deepEqual(act1, ['shore', 'cave', 'cave', 'puzzle', 'swamp', 'mountain', 'flooded', 'volcanic']);
  assert.equal(D.biomeForDepth(4).puzzle, true);

  const wet = ['swamp', 'flooded', 'caves', 'cave', 'nest'];
  const act2 = [11, 12, 13, 14, 16, 17, 18, 19].map((d) => D.biomeForDepth(d).key);
  assert.ok(act2.filter((k) => wet.includes(k)).length >= 6, 'act 2 is wet: ' + act2);

  const hot = ['volcanic', 'mountain', 'throne', 'prison'];
  const act3 = [21, 22, 23, 24, 26, 27, 28, 29].map((d) => D.biomeForDepth(d).key);
  assert.ok(act3.filter((k) => hot.includes(k)).length >= 6, 'act 3 is hot: ' + act3);

  for (let d = 1; d <= 90; d++) {
    const rung = D.biomeForDepth(d);
    assert.ok(rung, 'rung at ' + d);
    assert.ok(THEMES.includes(rung.theme), 'theme ' + rung.theme + ' at ' + d);
    if (A.isBossDepth(d)) assert.equal(rung.flavor, 'boss', 'boss flavor at ' + d);
    if (d !== 4) assert.ok(!rung.puzzle, 'only the Torch Hall is a puzzle rung, not ' + d);
  }
  // Endless walks back through the three acts' geography.
  assert.equal(D.biomeForDepth(31).theme, D.biomeForDepth(1).theme);
  assert.equal(D.biomeForDepth(42).theme, D.biomeForDepth(12).theme);
  assert.equal(D.biomeForDepth(53).theme, D.biomeForDepth(23).theme);
});

test('terrain knobs stay inside what the move model was tuned for', () => {
  const ten = D.forDepth(10);
  for (const d of [11, 20, 30, 45]) {
    const f = D.forDepth(d);
    assert.ok(f.roomCount <= ten.roomCount);
    assert.ok(f.climbSpan <= ten.climbSpan);
    assert.ok(f.climbSteps <= ten.climbSteps);
    assert.ok(f.spikeRunMax <= ten.spikeRunMax);
    assert.ok(f.pitChance <= ten.pitChance);
  }
});
