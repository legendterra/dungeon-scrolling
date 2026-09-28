/* The act bosses and the act II-III bestiary, run headless on a flat test room:
   every boss can be built, fights through both phases without throwing, hurts
   the player with its own moves, and dies into the right hook - a boss-room
   boss opens the door onward, a vault boss breaks the seals. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./_load');

const STUBS =
  'window.DS.Audio = autoStub(); window.DS.FX = autoStub(); window.DS.Art = autoStub();' +
  'window.DS.SPR = autoStub(); window.DS.UI = autoStub(); window.DS.Map = autoStub();' +
  'window.DS.R = autoStub(); window.DS.R.camOffsetX = function () { return 0; };' +
  'window.DS.R.camOffsetY = function () { return 0; };' +
  'window.DS.Boons = { onKill: function () {} };' +
  'window.DS.Loot = { enemyLoot: function () { return { coins: 0, shards: 0, hearts: 0, key: false, item: null }; } };' +
  'window.DS.Modifiers = { mult: function () { return 1; }, has: function () { return false; } };' +
  'window.DS.Elements = { damageScale: function () { return 1; }, armorOf: function (e) { return e.armor || 0; },' +
  '  apply: function () {}, disabled: function () { return false; }, statusTint: function () { return null; },' +
  '  speedScale: function () { return 1; }, damageTaken: function () { return 1; },' +
  '  spawnField: function () {} };';

function loadBosses() {
  const DS = load([
    'src/core/rng.js',
    'src/systems/difficulty.js',
    'src/systems/physics.js',
    'src/entities/base.js',
    'src/entities/enemies.js',
    'src/entities/enemies2.js',
    'src/entities/enemies3.js',
    'src/entities/boss.js',
    'src/entities/bosses.js',
    'src/entities/bosses2.js'
  ], STUBS);
  // tickStatus reads timers the fake world never sets; keep it inert.
  DS.Ent.tickStatus = function () {};
  return DS;
}

/* A 60 x 14 tile box with a floor on row 12 and walls at both ends. */
function room(DS) {
  const T = DS.C.TILE;
  const solid = (tx, ty) => ty >= 12 || tx <= 0 || tx >= 59 || ty < 0;
  return {
    w: 60, h: 14, pixelW: 60 * T, pixelH: 14 * T,
    isSolid: solid, isBlocked: solid, isPlatform: () => false,
    groundBelow: () => 12 * T, floorBelow: () => 12 * T,
    waterOverlap: () => false, spikeOverlap: () => false, deathOverlap: () => false
  };
}

function world(DS, depth) {
  const T = DS.C.TILE;
  const hits = { n: 0 };
  const g = {
    depth: depth, rng: DS.makeRng(depth * 17), enemies: [], projectiles: [], pickups: [],
    chests: [], bolts: [], fields: [], map: room(DS), kills: 0, hitstop: 0, arena: null,
    levelKind: 'boss'
  };
  g.player = {
    x: 18 * T, y: 12 * T - 14, w: 8, h: 14, vx: 0, vy: 0, dead: false, onGround: true, mana: 10,
    hurt: function () { hits.n++; }
  };
  DS.Player = { touch: function () { hits.n++; } };
  g.onBossDefeated = function (b) { g.won = true; g.defeated = b; };
  g.onFloorBossDown = function (b) { g.bossDown = true; g.defeated = b; };
  return { g, hits };
}

function run(DS, g, boss, frames) {
  for (let f = 0; f < frames; f++) {
    // Keep the hero in front of the boss so every move has a target.
    g.player.x = boss.x + (f % 400 < 200 ? -60 : 60);
    DS.Boss.update(g, boss);
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e !== boss && !e.dead) DS.Enemies.update(g, e);
    }
    g.enemies = g.enemies.filter((e) => !e.dead || e === boss);
    DS.Ent.updateProjectiles(g);
    for (const k of ['x', 'y', 'hp']) assert.ok(Number.isFinite(boss[k]), boss.name + ' ' + k);
  }
}

const KEYS = ['warden', 'arbiter', 'wyrm', 'lich', 'magma'];

test('every act boss kind is registered with a name, moves and a voxel key', () => {
  const DS = loadBosses();
  for (const key of KEYS) {
    const def = DS.Bosses.KINDS[key];
    assert.ok(def, key);
    assert.ok(def.name);
    assert.ok(def.phase1.length >= 3 && def.phase2.length >= 3, key + ' moveset');
  }
  for (const key of ['wyrm', 'lich', 'magma']) {
    const def = DS.Bosses.KINDS[key];
    const own = def.phase1.concat(def.phase2).filter((m) => DS.Bosses.MOVES[m]);
    assert.ok(new Set(own).size >= 3, key + ' brings three moves of its own');
  }
});

test('each boss fights through both phases and hurts the player', () => {
  const DS = loadBosses();
  const T = DS.C.TILE;
  for (const key of KEYS) {
    const { g, hits } = world(DS, 20);
    const boss = DS.Bosses.create(g, 30 * T, 12 * T, key, { actBoss: true });
    assert.ok(boss.maxHp > DS.Bosses.KINDS[key].hp, key + ' is depth scaled');
    run(DS, g, boss, 900);
    boss.hp = Math.floor(boss.maxHp * 0.4);
    run(DS, g, boss, 1500);
    assert.equal(boss.phase, 2, key + ' enraged');
    assert.ok(hits.n > 0, key + ' landed a hit');
  }
});

test('an act boss opens the door; a vault boss breaks the seals', () => {
  const DS = loadBosses();
  const T = DS.C.TILE;
  let w = world(DS, 15);
  let boss = DS.Bosses.create(w.g, 30 * T, 12 * T, 'arbiter', { actBoss: true });
  DS.Ent.killEnemy(w.g, boss);
  assert.equal(w.g.won, true);
  assert.ok(!w.g.bossDown);

  w = world(DS, 7);
  boss = DS.Bosses.create(w.g, 30 * T, 12 * T, 'warden');
  DS.Ent.killEnemy(w.g, boss);
  assert.equal(w.g.bossDown, true);
  assert.ok(!w.g.won);

  w = world(DS, 10);
  boss = DS.Boss.create(w.g, 30 * T, 12 * T);
  DS.Ent.killEnemy(w.g, boss);
  assert.equal(w.g.won, true);
  assert.equal(w.g.defeated, boss);
});

test('boss health follows the difficulty curve', () => {
  const DS = loadBosses();
  const T = DS.C.TILE;
  const a = DS.Bosses.create(world(DS, 25).g, 30 * T, 12 * T, 'lich', { actBoss: true });
  const b = DS.Bosses.create(world(DS, 55).g, 30 * T, 12 * T, 'lich', { actBoss: true });
  assert.equal(a.maxHp, Math.round(DS.Bosses.KINDS.lich.hp * DS.Difficulty.bossHpMult(25)));
  assert.ok(b.maxHp > a.maxHp);
});

test('the act II-III monsters fight without throwing', () => {
  const DS = loadBosses();
  const T = DS.C.TILE;
  for (const kind of ['icewisp', 'harpy', 'cultist', 'magmacrab']) {
    for (const tier of ['normal', 'elite', 'miniboss']) {
      const { g, hits } = world(DS, 25);
      // Inside the 320-wide camera the stubbed renderer reports, so it wakes.
      const e = DS.Enemies.create(g, 10 * T, 11 * T, kind, tier);
      for (let f = 0; f < 1200; f++) {
        // The hero stands still, then moves across: a dive has to be able to land.
        g.player.x = (f % 400 < 200 ? 6 : 14) * T;
        g.player.y = 12 * T - 14;
        DS.Enemies.update(g, e);
        DS.Ent.updateProjectiles(g);
        if (e.dead) break;
        assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), kind + ' position');
      }
      assert.ok(hits.n > 0, kind + ' ' + tier + ' landed a hit');
    }
  }
});

test('every new monster and boss has its own voxel model that builds and poses', () => {
  const DS = load(['src/core/rng.js', 'src/core/voxel.js'],
    'window.THREE = autoStub(); window.DS.Armor = { MATERIALS: {} };');
  const V = DS.Voxel;
  const bosses = { warden: 'warden', arbiter: 'arbiter', wyrm: 'frostwyrm',
                   lich: 'lich', magma: 'magmacolossus' };
  for (const key in bosses) {
    assert.equal(V.keyFor({ isBoss: true, kind: 'boss', bossKey: key }), bosses[key]);
  }
  assert.equal(V.keyFor({ isBoss: true, kind: 'boss' }), 'slimeking');
  const kinds = ['icewisp', 'harpy', 'cultist', 'magmacrab', 'frostwyrm', 'lich', 'magmacolossus'];
  for (const kind of kinds) {
    assert.ok(V.has(kind), kind + ' has a builder');
    const model = V.build(kind, { tier: 'normal' });
    assert.equal(model.kind, kind);
    assert.ok(V.HEIGHT[kind] > 0, kind + ' height');
    for (const state of ['none', 'wind', 'strike']) {
      V.pose(model, { x: 10, vx: 0.5, attackState: state, attackTimer: 5,
                      cfg: { wind: 20 }, hurtFlash: 0, state: 'IDLE' }, 1.5);
    }
  }
});
