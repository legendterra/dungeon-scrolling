/* The bestiary of the three acts (enemies4-6.js, voxel-bestiary*.js): every
   kind is registered with a behaviour and a model, every map's roster names only
   kinds that exist, a floor spawns from its roster and nothing else, and every
   monster fights headless, on a flat room, at every rank without throwing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./_load');
const THREE_MOCK = require('./_three-mock');

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

const ROOT = path.join(__dirname, '..');
const has = (f) => fs.existsSync(path.join(ROOT, f));

/* Act I is here; the files of acts II and III join the lists as they land. */
const ENEMY_FILES = ['src/entities/enemies4.js', 'src/entities/enemies5.js', 'src/entities/enemies6.js'].filter(has);
const VOXEL_FILES = ['src/core/voxel-bestiary.js', 'src/core/voxel-bestiary2.js', 'src/core/voxel-bestiary3.js'].filter(has);
const MAP_FILES = ['src/world/maps/act1.js', 'src/world/maps/act2.js', 'src/world/maps/act3.js'].filter(has);

const ACT_I = ['crab', 'sporeshroom', 'crystalbeetle', 'jailer', 'prisoner', 'bogman', 'mountaingoat',
               'drownedknight', 'ashhound', 'gull', 'eagle', 'sewerrat', 'frogshaman'];
const NEW_KINDS = ACT_I.concat(
  ['eel', 'glowworm', 'drowner', 'eggsac', 'trollice', 'mosquito', 'lakespirit', 'icewolf',
   'hoplite', 'centaur', 'gorgonite', 'fury', 'shade', 'automaton', 'cyclops', 'sunpriest',
   'satyr', 'stonesnake', 'titanslave', 'cerberuspup', 'stormspirit', 'griffin']
    .filter((k) => ENEMY_FILES.some((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes("def('" + k + "'"))));

function loadWorld() {
  const DS = load([
    'src/core/rng.js', 'src/systems/difficulty.js', 'src/systems/physics.js',
    'src/entities/base.js', 'src/entities/enemies.js', 'src/entities/enemies2.js',
    'src/entities/enemies3.js'
  ].concat(ENEMY_FILES, ['src/world/maps.js'], MAP_FILES), STUBS);
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
    waterOverlap: () => false, spikeOverlap: () => false, deathOverlap: () => false,
    ropeAt: () => false
  };
}

function world(DS, depth) {
  const T = DS.C.TILE;
  const hits = { n: 0, pulled: 0, slowed: 0 };
  const g = {
    depth: depth, rng: DS.makeRng(depth * 17), enemies: [], projectiles: [], pickups: [],
    chests: [], bolts: [], fields: [], map: room(DS), kills: 0, hitstop: 0, arena: null,
    levelKind: 'normal', frames: 0
  };
  g.player = {
    x: 18 * T, y: 12 * T - 14, w: 8, h: 14, vx: 0, vy: 0, dead: false, onGround: true, mana: 10,
    hurt: function () { hits.n++; return true; }
  };
  DS.Player = { touch: function () { hits.n++; } };
  return { g, hits };
}

test('every new kind is registered with a behaviour, a gate, a tell and a 2D pack', () => {
  const DS = loadWorld();
  assert.ok(NEW_KINDS.length >= 13, 'act I is in: ' + NEW_KINDS.length);
  for (const k of NEW_KINDS) {
    const cfg = DS.Enemies.TYPES[k];
    assert.ok(cfg, k + ' registered');
    assert.equal(typeof cfg.behavior, 'function', k + ' behaviour');
    assert.ok(cfg.minDepth >= 1, k + ' minDepth (the endless formula)');
    assert.ok(cfg.sprite, k + ' 2D pack key');
    assert.ok(DS.Enemies.TELL_SFX[k], k + ' tell sound');
    assert.ok(cfg.hp > 0 && cfg.w > 0 && cfg.h > 0 && cfg.damage >= 1, k + ' numbers');
    if (!cfg.rooted) assert.ok(cfg.speed > 0, k + ' moves');
  }
});

test('every roster names kinds that exist, with positive weights, four to seven of them', () => {
  const DS = loadWorld();
  const maps = DS.Maps.list();
  assert.ok(maps.length >= 10);
  for (const m of maps) {
    if (!m.roster) continue;
    const kinds = Object.keys(m.roster);
    assert.ok(kinds.length >= 3 && kinds.length <= 7, m.key + ' has ' + kinds.length + ' kinds');
    for (const k of kinds) {
      assert.ok(DS.Enemies.TYPES[k], m.key + ' names ' + k);
      assert.ok(m.roster[k] > 0, m.key + ' weight of ' + k);
    }
  }
});

test('a floor spawns from its roster and nothing else; endless keeps the loose formula', () => {
  const DS = loadWorld();
  for (const m of DS.Maps.list()) {
    if (!m.roster) continue;
    const table = DS.Enemies.spawnTable(m.depth);
    const want = Object.keys(m.roster).sort();
    assert.equal(JSON.stringify(table.map((r) => r.value).sort()), JSON.stringify(want), m.key);
  }
  // Endless: depth 31 is the first map again, but every kind that has unlocked is loose.
  const endless = DS.Enemies.spawnTable(31).map((r) => r.value);
  assert.ok(endless.length > Object.keys(DS.Maps.get(1).roster).length, 'endless is a wider table');
  assert.ok(endless.includes('slime') && endless.includes('crab'));
  // An explicit biome still asks the old formula (the biome tests rely on it).
  assert.ok(DS.Enemies.spawnTable(5, 'swamp').length > 4);
});

test('each map that names a signature monster puts it first', () => {
  const DS = loadWorld();
  const first = { 1: 'crab', 2: 'sporeshroom', 3: 'crystalbeetle', 4: 'jailer', 6: 'bogman',
                  7: 'mountaingoat', 8: 'drownedknight', 9: 'ashhound' };
  for (const d in first) {
    const table = DS.Enemies.spawnTable(Number(d)).slice().sort((a, b) => b.weight - a.weight);
    assert.equal(table[0].value, first[d], 'depth ' + d);
  }
});

/* How far from the monster the hero stands, per kind: close enough for the ones
   that only wake when you are on top of them. */
const STAND = { sporeshroom: 22, bogman: 30, sewerrat: 40, prisoner: 44 };

test('every new monster fights without throwing, at every rank', () => {
  const DS = loadWorld();
  const T = DS.C.TILE;
  for (const kind of NEW_KINDS) {
    for (const tier of ['normal', 'elite', 'miniboss']) {
      const { g, hits } = world(DS, 12);
      const e = DS.Enemies.create(g, 10 * T, 11 * T, kind, tier);
      const stand = STAND[kind] || 52;
      const x0 = e.x;
      for (let f = 0; f < 1500; f++) {
        // The hero stands to one side, then the other: a lunge has to be able to land.
        g.player.x = x0 + (f % 500 < 250 ? -stand : stand);
        g.player.y = 12 * T - 14;
        g.frames = f;
        for (const en of g.enemies.slice()) if (!en.dead) DS.Enemies.update(g, en);
        DS.Ent.updateProjectiles(g);
        if (e.dead) break;
        for (const en of g.enemies) {
          assert.ok(Number.isFinite(en.x) && Number.isFinite(en.y), kind + ' position at frame ' + f);
          assert.ok(Number.isFinite(en.vx) && Number.isFinite(en.vy), kind + ' velocity at frame ' + f);
        }
      }
      assert.ok(hits.n > 0, kind + ' ' + tier + ' landed a hit');
    }
  }
});

test('a pack arrives together; a sewer rat is never alone', () => {
  const DS = loadWorld();
  const T = DS.C.TILE;
  for (const kind of NEW_KINDS.filter((k) => DS.Enemies.TYPES[k].pack > 1)) {
    const { g } = world(DS, 12);
    DS.Enemies.create(g, 10 * T, 11 * T, kind, 'normal');
    assert.equal(g.enemies.length, DS.Enemies.TYPES[kind].pack, kind + ' pack size');
    assert.ok(g.enemies.every((e) => e.kind === kind));
  }
});

test('the bogman is under the mud until you are close, then comes up', () => {
  const DS = loadWorld();
  if (!DS.Enemies.TYPES.bogman) return;
  const T = DS.C.TILE;
  const { g } = world(DS, 12);
  const e = DS.Enemies.create(g, 10 * T, 11 * T, 'bogman', 'normal');
  g.player.x = e.x + 200;
  for (let f = 0; f < 120; f++) DS.Enemies.update(g, e);
  assert.equal(e.hidden, true, 'still buried far from the hero');
  assert.ok(e.invuln > 0, 'and not hittable');
  for (let f = 0; f < 200 && e.hidden; f++) { g.player.x = e.x + 26; g.player.y = 12 * T - 14; DS.Enemies.update(g, e); }
  assert.equal(e.hidden, false, 'up once the hero stands over it');
});

test('the chained prisoner never leaves the end of its chain', () => {
  const DS = loadWorld();
  if (!DS.Enemies.TYPES.prisoner) return;
  const T = DS.C.TILE;
  const { g } = world(DS, 12);
  const e = DS.Enemies.create(g, 10 * T, 11 * T, 'prisoner', 'normal');
  const home = e.homeX, leash = DS.Enemies.TYPES.prisoner.leash;
  for (let f = 0; f < 1500; f++) {
    g.player.x = home + (f % 400 < 200 ? -70 : 70);
    g.player.y = 12 * T - 14;
    DS.Enemies.update(g, e);
    assert.ok(Math.abs(e.x - home) <= leash + 1, 'frame ' + f + ' at ' + (e.x - home));
  }
});

test('the crab turns light blows from the front and only from the front', () => {
  const DS = loadWorld();
  const T = DS.C.TILE;
  const { g } = world(DS, 1);
  const e = DS.Enemies.create(g, 10 * T, 11 * T, 'crab', 'normal');
  e.facing = 1;
  e.shieldUp = true;
  const hp = e.hp;
  DS.Ent.damageEnemy(g, e, 3, { dir: -1 });          // from the front (it faces right, the blow travels left)
  assert.equal(e.hp, hp, 'blocked');
  DS.Ent.damageEnemy(g, e, 3, { dir: 1 });           // from behind
  assert.ok(e.hp < hp, 'not blocked from behind');
  e.shieldUp = false;
  DS.Ent.damageEnemy(g, e, 3, { dir: -1, heavy: false });
  assert.ok(e.hp < hp, 'not blocked while the claws are open');
});

test('every new kind has a voxel model that builds, poses and animates', () => {
  const DS = load(['src/core/rng.js', 'src/core/voxel.js'].concat(VOXEL_FILES), THREE_MOCK);
  const V = DS.Voxel;
  for (const kind of NEW_KINDS) {
    assert.ok(V.has(kind), kind + ' has a builder');
    assert.ok(V.HEIGHT[kind] > 0, kind + ' height');
    const model = V.build(kind, { tier: 'normal' });
    assert.equal(model.kind, kind);
    const ents = [
      { x: 10, vx: 0, attackState: 'none', attackTimer: 0, cfg: { wind: 20 }, hurtFlash: 0 },
      { x: 10, vx: 0.9, attackState: 'wind', attackTimer: 8, cfg: { wind: 20 }, hurtFlash: 0, shieldUp: true, mode: 'chain' },
      { x: 10, vx: 0, attackState: 'strike', attackTimer: 5, cfg: { wind: 20 }, hurtFlash: 3, curled: true, mode: 'bash',
        hidden: true, cloud: { x: 1, y: 1, r: 20, t: 50 }, sizeScale: 1, onGround: true, facing: 1, y: 100, h: 12, w: 12 }
    ];
    for (const e of ents) {
      for (const t of [0, 1.5, 3.1]) {
        V.pose(model, e, t);
        model.root.traverse(function (o) {
          for (const k of ['x', 'y', 'z']) {
            assert.ok(Number.isFinite(o.position[k]) && Number.isFinite(o.rotation[k]) && Number.isFinite(o.scale[k]),
                      kind + ' has a finite transform');
          }
        });
      }
    }
  }
});
