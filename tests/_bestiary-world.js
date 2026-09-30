/* Shared by the bestiary tests: a headless world (a flat room, a stand-in hero that counts the
   wounds it is given) with the monster files of the three acts loaded. */
const fs = require('node:fs');
const path = require('node:path');
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

const ROOT = path.join(__dirname, '..');
const has = (f) => fs.existsSync(path.join(ROOT, f));

/* The monster, model and map files of the three acts. */
const ENEMY_FILES = ['src/entities/enemies4.js', 'src/entities/enemies5.js', 'src/entities/enemies6.js'].filter(has);
const VOXEL_FILES = ['src/core/voxel-bestiary.js', 'src/core/voxel-bestiary2.js', 'src/core/voxel-bestiary3.js'].filter(has);
const MAP_FILES = ['src/world/maps/act1.js', 'src/world/maps/act2.js', 'src/world/maps/act3.js'].filter(has);

const BOSS_FILES = ['src/entities/boss.js', 'src/entities/bosses.js', 'src/entities/bosses2.js', 'src/entities/bosses3.js'].filter(has);

/* `withBosses`: the boss brain and every boss kind on top of the bestiary. */
function loadWorld(withBosses) {
  const DS = load([
    'src/core/rng.js', 'src/systems/difficulty.js', 'src/systems/physics.js',
    'src/entities/base.js', 'src/entities/enemies.js', 'src/entities/enemies2.js',
    'src/entities/enemies3.js'
  ].concat(ENEMY_FILES, ['src/world/maps.js'], MAP_FILES, withBosses ? BOSS_FILES : []), STUBS);
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


module.exports = { STUBS, ROOT, has, ENEMY_FILES, VOXEL_FILES, MAP_FILES, BOSS_FILES, loadWorld, room, world };
