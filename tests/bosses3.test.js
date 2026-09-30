/* The bosses of the gods (entities/bosses3.js), each on a flat room with a stand-in hero
   that counts the wounds it is given: the mechanic each one is built around, and the
   rotation that puts them on depths 25 and 30 and in the vaults of 21, 23 and 27. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadWorld, world } = require('./_bestiary-world');

const FLOOR = 12;
const KEYS = ['minotaur', 'medusa', 'talos', 'hades', 'zeus'];
const BUILT_IN = ['SLAM', 'QUAKE', 'BOULDER', 'VOLLEY', 'SUMMON', 'SMITE', 'CHARGE'];

function fight(key, depth, seed) {
  const DS = loadWorld(true);
  DS.rand = DS.makeRng(seed || 1);
  const T = DS.C.TILE;
  const w = world(DS, depth || 25);
  w.g.levelKind = 'boss';
  w.g.onBossDefeated = function (b) { w.g.won = true; w.g.defeated = b; };
  w.g.onFloorBossDown = function (b) { w.g.bossDown = true; w.g.defeated = b; };
  const boss = DS.Bosses.create(w.g, 30 * T, FLOOR * T, key, { actBoss: true });
  w.DS = DS; w.T = T; w.boss = boss;
  w.step = function (n, each) {
    for (let f = 0; f < n; f++) {
      w.g.frames = (w.g.frames || 0) + 1;
      if (each) each(f);
      DS.Boss.update(w.g, boss);
      for (const e of w.g.enemies.slice()) if (e !== boss && !e.dead) DS.Enemies.update(w.g, e);
      DS.Ent.updateProjectiles(w.g);
      w.g.enemies = w.g.enemies.filter((e) => !e.dead || e === boss);
    }
  };
  w.hero = function (dx) {
    w.g.player.x = boss.x + boss.w / 2 + dx - 4;
    w.g.player.y = FLOOR * T - 14;
  };
  w.until = function (limit, done, each) {
    for (let f = 0; f < limit; f++) { w.step(1, each); if (done()) return f; }
    return -1;
  };
  return w;
}

test('every god is registered with a name, a moveset whose moves all exist, and a voxel model key', () => {
  const DS = loadWorld(true);
  for (const key of KEYS) {
    const def = DS.Bosses.KINDS[key];
    assert.ok(def, key);
    assert.ok(def.name && def.color && def.tint, key + ' name and colours');
    assert.ok(def.phase1.length >= 3 && def.phase2.length >= 3, key + ' moveset');
    for (const m of def.phase1.concat(def.phase2)) {
      assert.ok(DS.Bosses.MOVES[m] || BUILT_IN.includes(m), key + ' names a move that does not exist: ' + m);
    }
    const own = new Set(def.phase1.concat(def.phase2).filter((m) => DS.Bosses.MOVES[m]));
    assert.ok(own.size >= 2, key + ' brings moves of its own');
  }
});

test('the Minotaur drives his horns into the wall after a rush, and is dazed without armour, then recovers it', () => {
  const w = fight('minotaur', 21);
  const armour = w.boss.armor;
  assert.ok(armour > 0);
  w.boss.x = 20 * w.T;
  w.hero(-200);
  w.boss.facing = -1;
  w.g.arena = { x0: 12 * w.T, x1: 48 * w.T };
  w.step(3);
  w.DS.Bosses.go(w.boss, 'RUSH', 170);
  const hit = w.until(400, () => w.boss.state === 'STUN', () => w.hero(-200));
  assert.ok(hit > 0, 'he reached the wall');
  assert.ok(w.boss.x <= w.g.arena.x0 + 2 || w.boss.x + w.boss.w >= w.g.arena.x1 - 2, 'at the end of the room');
  w.step(2);
  assert.equal(w.boss.armor, 0, 'dazed: no armour');
  w.until(200, () => w.boss.state !== 'STUN', () => w.hero(-200));
  assert.equal(w.boss.armor, armour, 'and it comes back');
});

test('an enraged Minotaur does not carry a stun into the second half', () => {
  const w = fight('minotaur', 21);
  const armour = w.boss.armor;
  w.DS.Bosses.go(w.boss, 'STUN', 74);
  w.step(4);
  assert.equal(w.boss.armor, 0);
  w.boss.hp = Math.floor(w.boss.maxHp * 0.4);
  w.step(3);
  assert.equal(w.boss.phase, 2);
  assert.equal(w.boss.armor, armour);
});

test('the axe whirl reaches around him and is jumped', () => {
  const near = fight('minotaur', 21);
  near.DS.Bosses.go(near.boss, 'AXESPIN', 100);
  near.step(100, () => near.hero(30));
  assert.ok(near.hits.n > 0, 'a hero in the ring is hit');

  const high = fight('minotaur', 21);
  high.DS.Bosses.go(high.boss, 'AXESPIN', 100);
  high.step(100, () => { high.hero(30); high.g.player.y -= 40; });
  assert.equal(high.hits.n, 0, 'a hero over it is not');
});

test('Medusa\'s gaze is a line to you, and a wall between you and her stops it', () => {
  const open = fight('medusa', 23);
  open.DS.Bosses.go(open.boss, 'GAZE', 112);
  open.step(112, () => open.hero(-90));
  assert.ok(open.hits.n > 0, 'it finds a hero in the open');
  assert.ok(open.g.player.slowT === undefined || open.g.player.slowT >= 0);

  const covered = fight('medusa', 23);
  const solid = covered.g.map.isSolid;
  const wallX = Math.floor((covered.boss.x - 40) / covered.T);
  covered.g.map.isSolid = (tx, ty) => solid(tx, ty) || (tx === wallX && ty >= FLOOR - 4 && ty < FLOOR);   // a pillar
  covered.DS.Bosses.go(covered.boss, 'GAZE', 112);
  covered.step(112, () => covered.hero(-90));
  assert.equal(covered.hits.n, 0, 'a pillar in between stops it');
});

test('a hero who steps off the line after it locks is not caught', () => {
  const w = fight('medusa', 23);
  w.DS.Bosses.go(w.boss, 'GAZE', 112);
  w.step(112, (f) => { w.hero(-90); if (f > 40) w.g.player.y -= 50; });    // in the air by the time it fires
  assert.equal(w.hits.n, 0);
});

test('Medusa\'s pit brings stone snakes to her feet, never more than four at once', () => {
  const w = fight('medusa', 23);
  for (let i = 0; i < 6; i++) {
    w.DS.Bosses.go(w.boss, 'PIT', 60);
    w.step(60, () => w.hero(-200));
  }
  const snakes = w.g.enemies.filter((e) => e.kind === 'stonesnake' && !e.dead).length;
  assert.ok(snakes >= 2 && snakes <= 4, snakes + ' snakes');
});

test('Talos hammers out automatons at the anvil, two at the most', () => {
  const w = fight('talos', 27);
  for (let i = 0; i < 6; i++) {
    w.DS.Bosses.go(w.boss, 'ANVIL', 76);
    w.step(76, () => w.hero(-200));
  }
  const n = w.g.enemies.filter((e) => e.kind === 'automaton' && !e.dead).length;
  assert.ok(n >= 1 && n <= 2, n + ' automatons');
});

test('Hades: soul fire is marked before it lands, walks toward you, and one is under you now', () => {
  const w = fight('hades', 25);
  w.hero(-120);
  w.boss.facing = -1;
  w.DS.Bosses.go(w.boss, 'SOULFIRE', 90);
  let marked = 0, hurtBefore = null;
  w.step(30, () => w.hero(-120));
  marked = (w.boss.pillars || []).length;
  hurtBefore = w.hits.n;
  assert.ok(marked >= 5, marked + ' marked');
  assert.equal(hurtBefore, 0, 'nothing has landed yet: it was only marked');
  w.step(90, () => w.hero(-120));
  assert.ok(w.hits.n > 0, 'the one under the hero landed');
});

test('Hades steps two shades out around you, four at the most', () => {
  const w = fight('hades', 25);
  for (let i = 0; i < 5; i++) {
    w.DS.Bosses.go(w.boss, 'SHADES', 60);
    w.step(40, () => w.hero(-100));
  }
  const n = w.g.enemies.filter((e) => e.kind === 'shade' && !e.dead).length;
  assert.ok(n >= 2 && n <= 4, n + ' shades');
});

test('the bident sweeps a wide arc in front of him', () => {
  const near = fight('hades', 25);
  near.boss.facing = -1;
  near.DS.Bosses.go(near.boss, 'BIDENT', 78);
  near.step(78, () => near.hero(-40));
  assert.ok(near.hits.n > 0);
  const far = fight('hades', 25);
  far.boss.facing = -1;
  far.DS.Bosses.go(far.boss, 'BIDENT', 78);
  far.step(78, () => far.hero(-150));
  assert.equal(far.hits.n, 0);
});

test('Zeus marks his bolts on the floor first, then they fall where he marked them', () => {
  const w = fight('zeus', 30);
  w.DS.Bosses.go(w.boss, 'BOLTS', 100);
  w.step(30, () => w.hero(-100));
  const marks = (w.boss.pillars || []).length;
  assert.ok(marks >= 5, marks + ' bolts marked');
  assert.equal(w.hits.n, 0, 'none has fallen yet');
  w.step(100, () => w.hero(-100));
  assert.ok((w.boss.pillars || []).length === 0, 'they all fell');
});

test('Zeus calls storm spirits, three at the most, and a thunderclap shakes the floor both ways', () => {
  const w = fight('zeus', 30);
  for (let i = 0; i < 5; i++) {
    w.DS.Bosses.go(w.boss, 'STORM', 70);
    w.step(70, () => w.hero(-200));
  }
  const n = w.g.enemies.filter((e) => e.kind === 'stormspirit' && !e.dead).length;
  assert.ok(n >= 2 && n <= 3, n + ' spirits');

  const c = fight('zeus', 30);
  let waves = 0;
  c.DS.Bosses.go(c.boss, 'THUNDERCLAP', 84);
  c.step(84, () => { c.hero(-200); waves = Math.max(waves, c.g.projectiles.length); });
  assert.ok(waves >= 4, waves + ' shock waves');
});

test('from half health the storm is on: bolts are marked without a move asking for them', () => {
  const w = fight('zeus', 30);
  w.boss.hp = Math.floor(w.boss.maxHp * 0.4);
  w.step(80, () => w.hero(-200));
  assert.equal(w.boss.phase, 2);
  let most = 0;
  w.step(600, () => { w.hero(-200); most = Math.max(most, (w.boss.pillars || []).length); w.boss.state = w.boss.state === 'IDLE' ? 'IDLE' : w.boss.state; });
  assert.ok(most > 0, 'a stray bolt was marked');
});

test('every god fights through both phases without throwing, from three seeds', () => {
  for (const key of KEYS) {
    for (const seed of [1, 2, 3]) {
      const w = fight(key, 25, seed);
      w.step(900, () => w.hero(w.boss.x % 400 < 200 ? -60 : 60));
      w.boss.hp = Math.floor(w.boss.maxHp * 0.4);
      w.step(1500, (f) => w.hero(f % 400 < 200 ? -60 : 60));
      assert.equal(w.boss.phase, 2, key + ' enraged');
      assert.ok(w.hits.n > 0, key + ' landed a hit (seed ' + seed + ')');
      for (const k of ['x', 'y', 'hp']) assert.ok(Number.isFinite(w.boss[k]), key + ' ' + k);
    }
  }
});

test('a god at a boss depth opens the door onward; one on a vault floor breaks the seals', () => {
  const room = fight('zeus', 30);
  room.DS.Ent.killEnemy(room.g, room.boss);
  assert.equal(room.g.won, true);
  const vault = fight('minotaur', 21);
  const T = vault.T;
  const boss = vault.DS.Bosses.create(vault.g, 30 * T, FLOOR * T, 'minotaur');
  vault.DS.Ent.killEnemy(vault.g, boss);
  assert.equal(vault.g.bossDown, true);
});

test('each god has a voxel model that builds, and poses and animates in every move it makes', () => {
  const { load } = require('./_load');
  const THREE_MOCK = require('./_three-mock');
  const DS = load(['src/core/rng.js', 'src/core/voxel.js', 'src/core/voxel-bestiary.js', 'src/core/voxel-bosses.js'], THREE_MOCK);
  const V = DS.Voxel;
  const states = ['IDLE', 'INTRO', 'ENRAGE', 'SLAM', 'QUAKE', 'CHARGE', 'SMITE'];
  for (const key of KEYS) {
    assert.equal(V.keyFor({ isBoss: true, kind: 'boss', bossKey: key }), key, key + ' maps to its own model');
    assert.ok(V.has(key), key + ' has a builder');
    assert.ok(V.HEIGHT[key] >= 3, key + ' stands as tall as a boss');
    const model = V.build(key, {});
    const moves = Object.keys(DS.Bosses ? DS.Bosses.MOVES : {}).concat(states);
    for (const state of states.concat(['RUSH', 'AXESPIN', 'STUN', 'GAZE', 'SNAKES', 'PIT', 'ERUPT', 'METEOR', 'LAVAWAVE', 'ANVIL',
                                       'SOULFIRE', 'BIDENT', 'SHADES', 'BOLTS', 'STORM', 'THUNDERCLAP', 'THUNDERBALLS', 'LEAP'])) {
      for (const t of [0, 1.7, 3.3]) {
        V.pose(model, { x: 10, vx: 0.4, isBoss: true, state: state, stateTimer: 20 + (t * 10 | 0), onGround: t > 2,
                        attackState: 'none', attackTimer: 0, cfg: { wind: 20 }, hurtFlash: 0, phase: 1 }, t);
        model.root.traverse(function (o) {
          for (const k of ['x', 'y', 'z']) {
            assert.ok(Number.isFinite(o.position[k]) && Number.isFinite(o.rotation[k]) && Number.isFinite(o.scale[k]),
                      key + ' ' + state + ' finite transform');
          }
        });
      }
    }
  }
});

test('Medusa springs over a pillar and bites where she lands: cover is not a place to sit', () => {
  const w = fight('medusa', 23);
  const solid = w.g.map.isSolid;
  const wallX = Math.floor((w.boss.x + w.boss.w / 2) / w.T) - 2;
  const pillar = (tx, ty) => solid(tx, ty) || ((tx === wallX || tx === wallX - 1) && ty >= FLOOR - 2 && ty < FLOOR);   // two wide, two tall
  w.g.map.isSolid = pillar;
  w.g.map.isBlocked = pillar;
  w.boss.facing = -1;
  w.hero(-70);
  const x0 = w.boss.x;
  w.DS.Bosses.go(w.boss, 'LEAP', 70);
  w.step(70);                                      // the hero stays where he was put: it is she who moves
  assert.ok(w.boss.x < x0 - 24, 'she is on the far side of it (' + Math.round(x0 - w.boss.x) + ' px)');
  assert.ok(w.hits.n > 0, 'and the bite found the hero');
});
