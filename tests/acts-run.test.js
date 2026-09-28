/* The run's route through the acts: which stop follows which, and that nothing
   ends the run just because a depth number got large. Also the two pieces the
   act system leans on elsewhere: flat armour can never make a boss immune, and
   the leaderboard accepts an endless depth. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, ROOT } = require('./_load');

const STUBS = 'window.DS.Audio = autoStub(); window.DS.FX = autoStub(); window.DS.R = autoStub();' +
              'window.DS.Art = autoStub(); window.DS.SPR = autoStub(); window.DS.UI = autoStub();';

function loadRun() {
  return load(['src/core/rng.js', 'src/systems/difficulty.js', 'src/scenes/game.js'], STUBS);
}

/* Follow the stairs from depth 1 the way the door does: every stop's kind is
   whatever planAdvance says it is, the trial and the safe room included. */
function walk(DS, seed, stops) {
  const g = { depth: 1, levelKind: 'normal', rng: DS.makeRng(seed), lastTrial: -9 };
  const route = [{ depth: 1, kind: 'normal' }];
  for (let i = 0; i < stops; i++) {
    const next = DS.Game.planAdvance(g);
    assert.ok(next, 'no stop after depth ' + g.depth);
    g.depth = next.depth;
    g.levelKind = next.kind;
    if (next.kind === 'trial') g.lastTrial = next.depth;
    route.push(next);
  }
  return route;
}

test('boss depths are always preceded by a safe room and are boss rooms', () => {
  const DS = loadRun();
  for (let seed = 1; seed <= 30; seed++) {
    const route = walk(DS, seed, 70);
    for (let i = 0; i < route.length; i++) {
      const stop = route[i];
      if (stop.kind === 'boss') {
        assert.ok(DS.Acts.isBossDepth(stop.depth), 'boss room at ' + stop.depth);
        assert.equal(route[i - 1].kind, 'safe', 'safe before boss at ' + stop.depth);
        assert.equal(route[i - 1].depth, stop.depth);
      }
      if (stop.kind === 'normal' || stop.kind === 'trial') {
        assert.ok(!DS.Acts.isBossDepth(stop.depth), stop.kind + ' on boss depth ' + stop.depth);
      }
    }
  }
});

test('the run does not end at the old final depth: act 3 boss leads into endless', () => {
  const DS = loadRun();
  const route = walk(DS, 7, 80);
  const depths = route.map((s) => s.depth);
  for (const d of [10, 11, 20, 21, 30, 31, 35, 40]) assert.ok(depths.includes(d), 'reached ' + d);
  const bossDepths = route.filter((s) => s.kind === 'boss').map((s) => s.depth);
  assert.deepEqual(bossDepths.slice(0, 8), [5, 10, 15, 20, 25, 30, 35, 40]);
  // Depth only ever moves forward, one at a time.
  for (let i = 1; i < route.length; i++) {
    const step = route[i].depth - route[i - 1].depth;
    assert.ok(step === 0 || step === 1, 'depth jumped at ' + route[i].depth);
  }
});

test('kindForDepth sends every boss depth to a boss room', () => {
  const DS = loadRun();
  assert.equal(DS.Game.kindForDepth(5), 'boss');
  assert.equal(DS.Game.kindForDepth(10), 'boss');
  assert.equal(DS.Game.kindForDepth(11), 'normal');
  assert.equal(DS.Game.kindForDepth(30), 'boss');
  assert.equal(DS.Game.kindForDepth(33), 'normal');
  assert.equal(DS.Game.kindForDepth(35), 'boss');
});

/* --- armour ---------------------------------------------------------------- */

function loadEntities() {
  return load(['src/core/rng.js', 'src/entities/base.js'],
    STUBS + 'window.DS.Elements = { damageScale: function () { return 1; },' +
            ' armorOf: function (e) { return e.armor || 0; }, apply: function () {} };' +
            'window.DS.Boons = { onKill: function () {} };');
}

test('flat armour lets at least a quarter of every hit through', () => {
  const DS = loadEntities();
  assert.equal(DS.Ent.mitigate(4, 4), 1);
  assert.equal(DS.Ent.mitigate(20, 4), 16);
  assert.equal(DS.Ent.mitigate(10, 9), 3);
  assert.equal(DS.Ent.mitigate(40, 50), 10);
  assert.equal(DS.Ent.mitigate(1, 5), 1);
  assert.equal(DS.Ent.mitigate(7, 0), 7);
  for (let dmg = 1; dmg <= 200; dmg++) {
    for (let armor = 0; armor <= 30; armor++) {
      const got = DS.Ent.mitigate(dmg, armor);
      assert.ok(got >= Math.ceil(dmg * 0.25), dmg + ' vs ' + armor);
      assert.ok(got <= dmg);
    }
  }
});

test('damageEnemy applies the armour floor on the real hit path', () => {
  const DS = loadEntities();
  const e = DS.Ent.make(0, 0, 10, 10);
  e.hp = e.maxHp = 1000;
  e.armor = 50;
  e.invuln = 0;
  const dealt = DS.Ent.damageEnemy({ enemies: [], player: null }, e, 40, { dir: 1 });
  assert.equal(dealt, 10);
  assert.equal(e.hp, 990);
});

/* --- leaderboard ----------------------------------------------------------- */

function fakeEnv() {
  const rows = [];
  const stmt = (sql) => ({
    bind: () => stmt(sql),
    run: async () => { if (/INSERT/.test(sql)) rows.push(sql); return {}; },
    first: async () => ({ n: 0 }),
    all: async () => ({ results: [] })
  });
  return { rows, DB: { prepare: stmt }, ASSETS: { fetch: async () => new Response('asset') } };
}

async function post(worker, env, body) {
  const req = new Request('https://x/api/score', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }
  });
  const res = await worker.fetch(req, env);
  return { status: res.status, body: await res.json() };
}

test('the leaderboard accepts endless depths and rejects nonsense ones', async () => {
  const mod = await import('file://' + path.join(ROOT, 'worker', 'index.js').replace(/\\/g, '/'));
  const worker = mod.default;
  const base = { name: 'TESTER', kills: 3, coins: 1, frames: 100 };

  let env = fakeEnv();
  let r = await post(worker, env, Object.assign({ depth: 34 }, base));
  assert.equal(r.status, 200);
  assert.equal(env.rows.length, 1);

  for (const bad of [0, -2, 1000, 3.5, 'deep', null]) {
    env = fakeEnv();
    r = await post(worker, env, Object.assign({ depth: bad }, base));
    assert.equal(r.status, 400, 'depth ' + bad);
    assert.equal(env.rows.length, 0);
  }

  env = fakeEnv();
  r = await post(worker, env, Object.assign({ depth: 999 }, base));
  assert.equal(r.status, 200);
});
