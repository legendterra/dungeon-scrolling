/* Level QA solver.

   Builds floors through the REAL generator (no mocks of the terrain code), then
   asks the one question a level must answer: can the hero walk from the spawn to
   the exit door with nothing but the moves the physics actually gives them?

   The move model below is deliberately written AGAIN, from the constants rather
   than borrowed from systems/reach.js. The generator repairs its terrain with
   that module; if this script called the same code, a bug in the model would
   pass its own test. Two independent readings of C.GRAVITY, BASE.jumpVel, the
   air jump and BASE.moveSpeed agreeing is the actual evidence - and when they
   disagree, the generator is wrong.

   Usage:
     node tools/solve-levels.js [seeds]            summarise every depth
     node tools/solve-levels.js --seed 1262 --depth 2 --dump   one level, drawn
     node tools/solve-levels.js --seed 1262 --depth 2 --why    why it stopped
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
/* Files to evaluate, and the few namespaces the terrain modules touch at load
   time which belong to gameplay code this solver has no opinion about. */
const STEPS = [
  'src/core/rng.js',
  'src/world/tilemap.js',
  'src/systems/difficulty.js',
  'src/systems/reach.js',
  'src/world/parkour.js',
  /* Sprites and enemy stat tables are per-flavor decoration; the solver only
     cares about tiles, so every missing drawing call answers with a dumb shape
     and every missing table is an object that accepts writes. */
  'stub:' +
  'function autoStub() {' +
  '  return new Proxy(function () { return autoStub(); }, {' +
  '    get: function (t, k) {' +
  '      if (k === "uw" || k === "uh") return 16;' +
  '      if (k === "frames") return [1, 2, 3];' +
  '      if (!(k in t)) Object.defineProperty(t, k, { value: autoStub(), writable: true, configurable: true });' +
  '      return t[k];' +
  '    },' +
  '    set: function (t, k, v) { t[k] = v; return true; }' +
  '  });' +
  '}' +
  'window.DS.Enemies = window.DS.Enemies || { TYPES: {} };' +
  'window.DS.SPR = window.DS.SPR || autoStub();' +
  'window.DS.Art = window.DS.Art || autoStub();' +
  'window.DS.Weapons = window.DS.Weapons || { ELEMENTS: {}, RARITY: {} };',
  'src/world/mountain.js',
  'src/world/water.js',
  'src/world/trial.js',
  'src/world/generator.js'
];

function loadGame() {
  const sandbox = {
    console: console, Math: Math, JSON: JSON, Date: Date,
    Uint8Array: Uint8Array, Int8Array: Int8Array, Float32Array: Float32Array,
    Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean,
    Set: Set, Map: Map, Symbol: Symbol, Error: Error,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const step of STEPS) {
    if (step.startsWith('stub:')) {
      vm.runInContext(step.slice(5), sandbox, { filename: 'stub' });
      continue;
    }
    vm.runInContext(fs.readFileSync(path.join(ROOT, step), 'utf8'), sandbox, { filename: step });
  }
  return sandbox.window.DS;
}

const DS = loadGame();
const T = DS.C.TILE;

/* --- the hero's real move set ---------------------------------------------- */

const BOX_W = 8, BOX_H = 14;
const SPEED = 1.45;                 // stats.moveSpeed, unarmoured
const JUMP = 5.3;                   // stats.jumpVel
const AIR = 0.92;                   // the air jump's velocity multiplier
const G = DS.C.GRAVITY;
const MAX_FALL = DS.C.MAX_FALL;
const MAX_AIR = 1;                  // AIR_JUMPS in entities/player.js
const FRAMES = 90;                  // a hop that has not landed by now never will
const TIMINGS = [-1, 15, 30];       // when the air jump is spent

/* The feet of a body standing on the surface tile at `row`. */
function feetY(row) { return (row + 1) * T; }

function blocksWall(map, x, y) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + BOX_W - 0.01) / T);
  const y0 = Math.floor(y / T), y1 = Math.floor((y + BOX_H - 0.01) / T);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (map.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

function standable(map, tx, ty) {
  if (tx < 1 || tx >= map.w - 1 || ty < 1 || ty >= map.h - 1) return false;
  if (map.isBlocked(tx, ty) || map.isSpike(tx, ty)) return false;
  if (blocksWall(map, tx * T, feetY(ty) - BOX_H)) return false;
  return map.isSolid(tx, ty + 1) || map.isPlatform(tx, ty + 1);
}

let profilePoints = 0;

/* One hop: jump, optionally spend the air jump on `airAt`, steer toward the
   aimed-for column and let go of the stick once you are over it (the 0.14 air
   friction makes that a half-tile overshoot at worst). True when the feet come
   back down to the target row, over the target column, without touching rock. */
function fly(map, airAt, fromTx, fromRow, dx, dy) {
  const xGoal = dx * T, yGoal = dy * T;
  const sx = fromTx * T + (T - BOX_W) / 2;
  const sy = feetY(fromRow) - BOX_H;
  const floorRow = fromRow + dy + 1;
  let x = sx, y = sy, vy = -JUMP, airLeft = MAX_AIR;
  let prevFeet = feetY(fromRow);

  for (let f = 0; f < FRAMES; f++) {
    profilePoints++;
    if (airLeft > 0 && f === airAt) { vy = -JUMP * AIR; airLeft--; }
    vy = Math.min(vy + G, MAX_FALL);
    const want = (sx + xGoal) - x;
    if (want > 1) x += Math.min(SPEED, want);
    else if (want < -1) x -= Math.min(SPEED, -want);
    const ny = y + vy;
    const feet = ny + BOX_H;

    if (vy > 0 && feet >= feetY(fromRow + dy)) {
      // Landed: only counts if the body is over the aimed-for column and the
      // descent did not catch a platform on the way.
      if (Math.abs(x - (sx + xGoal)) > T / 2) return false;
      if (crossed(map, x, prevFeet, feet, floorRow)) return false;
      return true;
    }
    if (blocksWall(map, x, ny)) return false;
    if (vy > 0 && crossed(map, x, prevFeet, feet, floorRow)) return false;

    y = ny; prevFeet = feet;
    if (y > sy + yGoal + 4 * T) return false;
  }
  return false;
}

/* Any one-way platform between two foot positions, other than the floor the hop
   was aiming for. */
function crossed(map, x, fromFeet, toFeet, ownRow) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + BOX_W - 0.01) / T);
  const r0 = Math.floor(fromFeet / T) + 1;
  const r1 = Math.floor(toFeet / T);
  for (let r = r0; r <= r1; r++) {
    if (r === ownRow) continue;
    for (let tx = x0; tx <= x1; tx++) if (map.isPlatform(tx, r)) return true;
  }
  return false;
}

function canFly(map, fromTx, fromRow, dx, dy) {
  const toTx = fromTx + dx, toRow = fromRow + dy;
  if (toTx < 1 || toTx >= map.w - 1 || toRow < 1 || toRow >= map.h - 1) return false;
  if (!standable(map, toTx, toRow)) return false;
  for (let t = 0; t < TIMINGS.length; t++) {
    if (fly(map, TIMINGS[t], fromTx, fromRow, dx, dy)) return true;
  }
  return false;
}

/* A rope is a climbing surface: entities/player.js grabs on contact and rides it
   at 1.35 px a frame, so the cells near its foot connect to the cells near its
   head in both directions. This is the ONE rule the solver deliberately reads
   the same way the generator does -- the tile's meaning belongs to the game, and
   a model that skipped it would call a rope shaft unfinishable when the hero can
   climb straight up it. Everything about what a body can DO on the way up, down
   and across is still this file's own. */
let ropeGraph = null;

function buildRopeGraph(map) {
  const graph = new Map();
  const push = function (key, value) {
    let list = graph.get(key);
    if (!list) { list = []; graph.set(key, list); }
    list.push(value);
  };
  for (let tx = 1; tx < map.w - 1; tx++) {
    let ty = 1;
    while (ty < map.h - 1) {
      if (!map.isRope(tx, ty)) { ty++; continue; }
      const top = ty;
      while (ty < map.h - 1 && map.isRope(tx, ty)) ty++;
      const bottom = ty - 1;
      const feet = [], heads = [];
      for (let d = -1; d <= 1; d++) {
        const x = tx + d;
        if (x < 1 || x >= map.w - 1) continue;
        for (let row = bottom - 2; row <= bottom + 2; row++) if (standable(map, x, row)) feet.push(x + ',' + row);
        for (let row = top - 2; row <= top + 2; row++) if (standable(map, x, row)) heads.push(x + ',' + row);
      }
      for (let i = 0; i < feet.length; i++) {
        for (let j = 0; j < heads.length; j++) {
          if (feet[i] !== heads[j]) { push(feet[i], heads[j]); push(heads[j], feet[i]); }
        }
      }
    }
  }
  return graph;
}

function buildMoveTable(map, fromTx, fromRow) {
  const moves = [];

  if (ropeGraph) {
    const list = ropeGraph.get(fromTx + ',' + fromRow);
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i].split(',');
        moves.push([Number(c[0]), Number(c[1])]);
      }
    }
  }
  for (let dy = -5; dy <= 3; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      if (!dx && !dy) continue;
      const toTx = fromTx + dx, toRow = fromRow + dy;
      if (!standable(map, toTx, toRow)) continue;
      if (Math.abs(dx) <= 1 && dy >= 0) { moves.push([toTx, toRow]); continue; }
      if (canFly(map, fromTx, fromRow, dx, dy)) moves.push([toTx, toRow]);
    }
  }
  for (let dx = -5; dx <= 5; dx++) {
    for (let y = fromRow + 1; y < map.h - 1 && y - fromRow <= 26; y++) {
      if (standable(map, fromTx + dx, y)) { moves.push([fromTx + dx, y]); break; }
      if (map.isSolid(fromTx + dx, y)) break;
    }
  }
  // Swimming: a body in water is not standing on anything and moves in any
  // direction, which is the whole point of a flooded hall.
  if (map.isWater(fromTx, fromRow)) {
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        if (!dx && !dy) continue;
        const nx = fromTx + dx, ny = fromRow + dy;
        if (nx < 1 || nx >= map.w - 1 || ny < 1 || ny >= map.h - 1) continue;
        if (!map.isWater(nx, ny) || map.isSpike(nx, ny)) continue;
        if (blocksWall(map, nx * T, feetY(ny) - BOX_H)) continue;
        moves.push([nx, ny]);
      }
    }
  }
  return moves;
}

function solve(map, spawn) {
  const tx = Math.floor(spawn.x / T);
  let ty = Math.floor(spawn.y / T);
  while (ty < map.h - 1 && !standable(map, tx, ty)) ty++;
  if (!standable(map, tx, ty) && !map.isWater(tx, ty)) return { ok: false, reason: 'no spawn cell' };

  ropeGraph = buildRopeGraph(map);
  const start = [tx, ty];
  const seen = new Set([tx + ',' + ty]);
  const queue = [start];
  const edges = [];
  let maxX = tx, front = start;

  while (queue.length) {
    const cell = queue.pop();
    const moves = buildMoveTable(map, cell[0], cell[1]);
    for (let i = 0; i < moves.length; i++) {
      edges.push(cell[0], cell[1], moves[i][0], moves[i][1]);
      const k = moves[i][0] + ',' + moves[i][1];
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(moves[i]);
    }
    if (cell[0] > maxX || (cell[0] === maxX && cell[1] > front[1])) { maxX = cell[0]; front = cell; }
  }
  return { ok: true, seen: seen, maxX: maxX, front: front, start: start, edges: edges };
}

/* "Can you get back out of here?", asked by this file's own move model.

   The generator's reach pass answers the same question while it repairs the
   level, so trusting its count would be asking a test to grade its own work.
   This walks the flood's edges backwards instead, from the door column to
   wherever that leads, and whatever the forward flood reached but this did not
   is a pocket: a spot you can get into and not out of. */
function escapesOf(reach, doorTx) {
  const back = new Map();
  const e = reach.edges || [];
  for (let i = 0; i < e.length; i += 4) {
    const key = e[i + 2] + ',' + e[i + 3];
    let list = back.get(key);
    if (!list) { list = []; back.set(key, list); }
    list.push(e[i], e[i + 1]);
  }
  const out = new Set();
  const queue = [];
  reach.seen.forEach(function (k) {
    if (Number(k.split(',')[0]) < doorTx) return;
    out.add(k);
    const c = k.split(',');
    queue.push(Number(c[0]), Number(c[1]));
  });
  while (queue.length) {
    const ty = queue.pop(), txx = queue.pop();
    const list = back.get(txx + ',' + ty);
    if (!list) continue;
    for (let i = 0; i < list.length; i += 2) {
      const k = list[i] + ',' + list[i + 1];
      if (out.has(k)) continue;
      out.add(k);
      queue.push(list[i], list[i + 1]);
    }
  }
  return out;
}

function pocketsOf(map, reach, doorTx) {
  const back = escapesOf(reach, doorTx);
  const out = [];
  reach.seen.forEach(function (k) {
    if (back.has(k)) return;
    const c = k.split(',');
    const tx = Number(c[0]), ty = Number(c[1]);
    if (map.isWater(tx, ty) || map.isDeath(tx, ty)) return;
    out.push(tx + ',' + ty);
  });
  return out;
}

function doorColumn(spawns) {
  if (!spawns) return null;
  if (spawns.doorTx != null) return spawns.doorTx;
  if (spawns.door) return Math.floor(spawns.door.x / T);
  return null;
}

/* --no-reach builds with the reach pass disabled, so a level's own terrain can
   be judged separately from what the guarantee did to it. */
const NO_REACH = process.argv.includes('--no-reach');
const reachModule = DS.Reach;

function buildLevel(seed, depth, kind) {
  if (NO_REACH) DS.Reach = null;
  const level = DS.LevelGen.build(DS.makeRng(seed), depth, kind || 'normal');
  DS.Reach = reachModule;
  return level;
}

/* A killing floor directly under water is a swimmer's death trap rather than a
   chasm: sealing the bottom of a pool is never what a level meant. */
function drownedSpikes(map) {
  let n = 0;
  for (let tx = 1; tx < map.w - 1; tx++) {
    for (let ty = 1; ty < map.h; ty++) {
      if (!map.isDeath(tx, ty)) continue;
      if (map.isWater(tx, ty - 1) || map.isWater(tx - 1, ty) || map.isWater(tx + 1, ty)) n++;
    }
  }
  return n;
}

/* Columns with nothing to stand on anywhere and no water, rope or killing floor
   in them: a body that falls in never gets out. */
function trapColumns(map) {
  const out = [];
  for (let tx = 1; tx < map.w - 1; tx++) {
    let floor = false, special = false;
    for (let ty = 0; ty < map.h; ty++) {
      const t = map.get(tx, ty);
      if (t === DS.TILE.WALL || t === DS.TILE.PLATFORM) floor = true;
      if (t === DS.TILE.WATER || t === DS.TILE.ROPE || t === DS.TILE.DEATHSPIKE) special = true;
    }
    if (!floor && !special) out.push(tx);
  }
  return out;
}

/* --- reporting -------------------------------------------------------------- */

function dump(map, reach, spawn, x0, x1) {
  const lines = [];
  const y0 = Math.max(0, Math.floor(spawn.y / T) - 12);
  const y1 = map.h - 1;
  const from = Math.max(0, x0 == null ? 0 : x0);
  const to = Math.min(map.w - 1, x1 == null ? map.w - 1 : x1);
  lines.push('     ' + ' '.repeat(from) + '|' + ' cols ' + from + '-' + to);
  for (let ty = y0; ty <= y1; ty++) {
    let line = String(ty).padStart(2, ' ') + '  ';
    for (let tx = from; tx <= to; tx++) {
      const t = map.get(tx, ty);
      const seen = reach.seen && reach.seen.has(tx + ',' + ty);
      if (t === DS.TILE.WALL) line += '#';
      else if (t === DS.TILE.PLATFORM) line += seen ? '=' : '-';
      else if (t === DS.TILE.SPIKE) line += '^';
      else if (t === DS.TILE.DOOR) line += 'D';
      else if (t === DS.TILE.DEATHSPIKE) line += 'X';
      else if (t === DS.TILE.WATER) line += '~';
      else if (t === DS.TILE.ROPE) line += '|';
      else line += seen ? '.' : ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function report(level, seed, depth) {
  const reach = solve(level.map, level.spawns.player);
  const doorTx = doorColumn(level.spawns);
  const sp = level.spawns.player;
  console.log('\n--- depth ' + depth + ' seed ' + seed +
              '  flavor ' + (level.flavor || level.kind) +
              '  size ' + level.map.w + 'x' + level.map.h +
              '  spawn tile(' + Math.floor(sp.x / T) + ',' + Math.floor(sp.y / T) + ')' +
              '  door x' + doorTx +
              '  reached x' + (reach.ok ? reach.maxX : 'n/a') + ' ---');
  console.log('    generator says ' + JSON.stringify(level.reach));
  if (reach.ok && doorTx != null && reach.maxX < doorTx) {
    console.log('    STUCK: the frontier is at ' + reach.front.join(',') +
                ', ' + (doorTx - reach.maxX) + ' columns short of the door');
  }
  console.log(dump(level.map, reach.ok ? reach : { seen: new Set() }, sp));
}

function main() {
  const seeds = Number(process.argv[2]) || 40;
  let total = 0, floors = 0, worst = null, genFails = 0, repairs = 0, rungs = 0, genMs = 0;
  let trapFloors = 0, trapCols = 0, drowned = 0;
  let pocketFloors = 0, pocketCells = 0, deadRungs = 0, climbRungs = 0, ledgeRungs = 0, ropes = 0;
  let genPockets = 0, genStuck = 0, genTrapped = 0;
  let pocketExample = null;
  const t0 = Date.now();

  for (let depth = 1; depth <= DS.C.FINAL_DEPTH; depth++) {
    let fails = 0, noSpawn = 0, first = null, pFloors = 0, pCells = 0;
    for (let s = 0; s < seeds; s++) {
      const seed = 1000 + s * 7 + depth * 131;
      const b0 = Date.now();
      const level = buildLevel(seed, depth);
      genMs += Date.now() - b0;
      if (!level || !level.spawns || !level.spawns.player) { noSpawn++; continue; }
      const reach = solve(level.map, level.spawns.player);
      const doorTx = doorColumn(level.spawns);
      const ok = reach.ok && doorTx != null && reach.maxX >= doorTx;
      floors++;
      if (level.reach) {
        if (!level.reach.ok) genFails++;
        repairs += level.reach.repairs || 0;
        rungs += level.reach.rungs || 0;
        deadRungs += level.reach.deadRungs || 0;
        climbRungs += level.reach.climbRungs || 0;
        ledgeRungs += level.reach.ledgeRungs || 0;
        ropes += level.reach.ropes || 0;
        genPockets += level.reach.pockets || 0;
        genStuck += level.reach.stuck || 0;
        genTrapped += level.reach.trapped || 0;
      }
      /* The solver's own pocket count, not the generator's. */
      if (reach.ok && doorTx != null) {
        const pockets = pocketsOf(level.map, reach, doorTx);
        if (pockets.length) {
          pFloors++; pCells += pockets.length;
          pocketFloors++; pocketCells += pockets.length;
          if (!pocketExample) pocketExample = { seed: seed, depth: depth, cells: pockets, level: level, reach: reach };
        }
      }
      const traps = trapColumns(level.map);
      if (traps.length) { trapFloors++; trapCols += traps.length; }
      drowned += drownedSpikes(level.map);
      if (!ok) {
        fails++; total++;
        if (!first) first = { seed: seed, level: level, reach: reach, doorTx: doorTx };
      }
    }
    if (fails && (!worst || fails > worst.fails)) worst = { depth: depth, fails: fails, first: first };
    console.log('depth ' + String(depth).padStart(2) + '  floors ' + seeds +
                '  UNREACHABLE EXIT: ' + fails + (noSpawn ? '  (no spawn: ' + noSpawn + ')' : '') +
                '  pocket floors: ' + pFloors + (pCells ? ' (' + pCells + ' cells)' : ''));
  }

  console.log('\nTOTAL floors with an unreachable exit: ' + total + ' / ' + floors +
              '\nTOTAL pockets (can get in, cannot get out): ' + pocketCells +
              ' cells on ' + pocketFloors + ' floors' +
              '\n  the generator itself gave up on ' + genFails + ' of them,' +
              ' spread ' + (repairs / floors).toFixed(1) + ' repairs and ' +
              (rungs / floors).toFixed(1) + ' rungs per floor' +
              '\n  of which ' + (climbRungs / floors).toFixed(1) + ' are cliff ladders, ' +
              (ledgeRungs / floors).toFixed(1) + ' are ledge steps and ' +
              (ropes / floors).toFixed(1) + ' are ropes hung on tall faces' +
              '\n  it pruned ' + (deadRungs / floors).toFixed(1) + ' rungs per floor nothing could stand on,' +
              ' repaired ' + (genPockets / floors).toFixed(1) + ' pockets per floor,' +
              ' and reported ' + genStuck + ' pockets it could not repair (' + genTrapped + ' cells left)' +
              '\n  ' + trapFloors + ' floors have a column you could fall into and never leave (' +
              trapCols + ' columns; ' + drowned + ' killing floors sit against water)' +
              '\n  (' + ((Date.now() - t0) / floors).toFixed(0) + ' ms per floor, ' +
              (genMs / floors).toFixed(0) + ' of them inside the generator, ' +
              (profilePoints / floors / 1000).toFixed(0) + 'k profile steps per floor)');

  /* The gate: an unreachable exit is a failure. Pockets are reported and gated
     loosely, because a handful of cells in a corner of a boss floor is a known
     residue the repair budget stops at, while a regression would be hundreds. */
  const POCKET_BUDGET = 20;
  if (pocketCells > POCKET_BUDGET && pocketExample) {
    console.log('\nPOCKETS LEFT -- the first one, depth ' + pocketExample.depth +
                ' seed ' + pocketExample.seed + ': ' + pocketExample.cells.slice(0, 8).join(' | '));
    report(pocketExample.level, pocketExample.seed, pocketExample.depth);
    process.exitCode = 1;
  }
  if (total > 0) {
    console.log('\nUNREACHABLE EXITS: ' + total + ' -- that is the failure this gate exists for.');
    process.exitCode = 1;
  }

  const seedArg = Number(process.argv[process.argv.indexOf('--seed') + 1]);
  const depthArg = Number(process.argv[process.argv.indexOf('--depth') + 1]);
  const wanted = process.argv.includes('--seed') && !isNaN(seedArg);
  if (wanted) {
    const depth = depthArg || 1;
    const level = buildLevel(seedArg, depth);
    report(level, seedArg, depth);
  } else if (worst) {
    report(worst.first.level, worst.first.seed, worst.depth);
  } else {
    console.log('\nNo failures to draw.');
  }
}

main();
