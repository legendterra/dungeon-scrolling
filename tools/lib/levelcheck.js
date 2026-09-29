/* Level QA: the solver and the sanity audit, as a library.

   tools/solve-levels.js is the command line over this module and
   tests/worldgen.test.js is the gate over it; both build floors through the
   REAL generator (no mocks of the terrain code) and ask two kinds of question:

     can the hero get there?   spawn to exit door, with nothing but the moves
                               the physics actually gives them;
     does it look built?       every ladder stands on a floor and reaches a lip,
                               every rope hangs from rock, nothing that was
                               added as a repair floats, and no one-tile pillar
                               walls off a corridor.

   The move model below is deliberately written AGAIN, from the constants rather
   than borrowed from systems/reach.js. The generator repairs its terrain with
   that module; if this file called the same code, a bug in the model would pass
   its own test. Two independent readings of C.GRAVITY, BASE.jumpVel, the air
   jump and BASE.moveSpeed agreeing is the actual evidence - and when they
   disagree, the generator is wrong. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

/* The art and audio namespaces that terrain modules touch at load time but
   never need to draw: every missing call answers with a dumb shape and every
   missing table is an object that accepts writes. */
const AUTO_STUB =
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
  '}';

const GAME_STUBS =
  'window.DS = window.DS || {};' +
  'window.DS.Enemies = window.DS.Enemies || { TYPES: {} };' +
  'window.DS.SPR = window.DS.SPR || autoStub();' +
  'window.DS.Art = window.DS.Art || autoStub();' +
  'window.DS.Audio = window.DS.Audio || autoStub();' +
  'window.DS.Weapons = window.DS.Weapons || { ELEMENTS: {}, RARITY: {} };';

/* Every module the generator reaches at build time, in index.html order. The
   puzzle, bonus and hazard modules are here because the terrain they carve
   (vaults, barrier walls, the coin tower) is now planned inside the build, so a
   floor judged here is the floor the game plays. */
const FILES = [
  'src/core/rng.js',
  'src/world/tilemap.js',
  'src/world/levelsize.js',
  'src/systems/difficulty.js',
  'src/systems/reach.js',
  'src/world/parkour.js',
  'src/world/mountain.js',
  'src/world/water.js',
  'src/world/trial.js',
  'src/world/puzzle.js',
  'src/world/bonus.js',
  'src/world/hazards.js',
  'src/world/generator.js',
  'src/world/maps.js',
  'src/world/maps/act1.js'
];

function loadGame() {
  const sandbox = {
    console: console, Math: Math, JSON: JSON, Date: Date,
    Uint8Array: Uint8Array, Int8Array: Int8Array, Float32Array: Float32Array,
    Uint16Array: Uint16Array, Int16Array: Int16Array, Uint32Array: Uint32Array,
    Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean,
    Set: Set, Map: Map, WeakMap: WeakMap, Symbol: Symbol, Error: Error, Proxy: Proxy,
    isNaN: isNaN, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(AUTO_STUB, sandbox, { filename: 'stubs' });
  for (let i = 0; i < FILES.length; i++) {
    // The gameplay stubs go in once the core exists, before the first module
    // that reads them at load time.
    if (FILES[i] === 'src/world/tilemap.js') {
      vm.runInContext(GAME_STUBS, sandbox, { filename: 'game-stubs' });
    }
    const src = fs.readFileSync(path.join(ROOT, FILES[i]), 'utf8');
    vm.runInContext(src, sandbox, { filename: FILES[i] });
  }
  return sandbox.window.DS;
}

function create(DS) {
  const T = DS.C.TILE;
  const TILE = DS.TILE;

  /* --- the hero's real move set -------------------------------------------- */

  const BOX_W = 8, BOX_H = 14;
  const SPEED = 1.45;                 // stats.moveSpeed, unarmoured
  const JUMP = 5.3;                   // stats.jumpVel
  const AIR = 0.92;                   // the air jump's velocity multiplier
  const G = DS.C.GRAVITY;
  const MAX_FALL = DS.C.MAX_FALL;
  const MAX_AIR = 1;                  // AIR_JUMPS in entities/player.js
  const FRAMES = 90;                  // a hop that has not landed by now never will
  const TIMINGS = [-1, 15, 30];       // when the air jump is spent

  const stats = { profilePoints: 0 };

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

  /* One hop: jump, optionally spend the air jump on `airAt`, steer toward the
     aimed-for column and let go of the stick once you are over it. True when
     the feet come back down to the target row, over the target column,
     without touching rock. */
  function fly(map, airAt, fromTx, fromRow, dx, dy) {
    const xGoal = dx * T;
    const sx = fromTx * T + (T - BOX_W) / 2;
    const sy = feetY(fromRow) - BOX_H;
    const floorRow = fromRow + dy + 1;
    let x = sx, y = sy, vy = -JUMP, airLeft = MAX_AIR;
    let prevFeet = feetY(fromRow);

    for (let f = 0; f < FRAMES; f++) {
      stats.profilePoints++;
      if (airLeft > 0 && f === airAt) { vy = -JUMP * AIR; airLeft--; }
      vy = Math.min(vy + G, MAX_FALL);
      const want = (sx + xGoal) - x;
      if (want > 1) x += Math.min(SPEED, want);
      else if (want < -1) x -= Math.min(SPEED, -want);
      const ny = y + vy;
      const feet = ny + BOX_H;

      if (vy > 0 && feet >= feetY(fromRow + dy)) {
        if (Math.abs(x - (sx + xGoal)) > T / 2) return false;
        if (crossed(map, x, prevFeet, feet, floorRow)) return false;
        return true;
      }
      if (blocksWall(map, x, ny)) return false;
      if (vy > 0 && crossed(map, x, prevFeet, feet, floorRow)) return false;

      y = ny; prevFeet = feet;
      if (y > sy + dy * T + 4 * T) return false;
    }
    return false;
  }

  /* Any one-way platform between two foot positions, other than the floor the
     hop was aiming for. */
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

  /* A rope is a climbing surface: the player grabs on contact and rides it, so
     the cells near its foot connect to the cells near its head in both
     directions. This is the one rule read the same way the generator reads it -
     the tile's meaning belongs to the game. */
  function buildRopeGraph(map) {
    const graph = new Map();
    const push = function (key, value) {
      let list = graph.get(key);
      if (!list) { list = []; graph.set(key, list); }
      list.push(value);
    };
    const segs = ropeSegments(map);
    for (let s = 0; s < segs.length; s++) {
      const tx = segs[s].tx, top = segs[s].top, bottom = segs[s].bottom;
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
    return graph;
  }

  function buildMoveTable(map, ropes, fromTx, fromRow) {
    const moves = [];
    const list = ropes.get(fromTx + ',' + fromRow);
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i].split(',');
        moves.push([Number(c[0]), Number(c[1])]);
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

    const ropes = buildRopeGraph(map);
    const start = [tx, ty];
    const seen = new Set([tx + ',' + ty]);
    const queue = [start];
    const edges = [];
    let maxX = tx, front = start;

    while (queue.length) {
      const cell = queue.pop();
      const moves = buildMoveTable(map, ropes, cell[0], cell[1]);
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

  /* Walk the flood's edges backwards from the door column; whatever the
     forward flood reached but this did not is a pocket. */
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

  /* A killing floor directly under water is a swimmer's death trap. */
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

  /* Columns with nothing to stand on and no water, rope or killing floor. */
  function trapColumns(map) {
    const out = [];
    for (let tx = 1; tx < map.w - 1; tx++) {
      let floor = false, special = false;
      for (let ty = 0; ty < map.h; ty++) {
        const t = map.get(tx, ty);
        if (t === TILE.WALL || t === TILE.PLATFORM) floor = true;
        if (t === TILE.WATER || t === TILE.ROPE || t === TILE.DEATHSPIKE) special = true;
      }
      if (!floor && !special) out.push(tx);
    }
    return out;
  }

  /* --- does it look built? --------------------------------------------------

     Four shapes a generated level must never ship, each counted from the
     finished tile grid alone (plus the designed flag the builders leave on the
     cells they meant). The definitions are this file's own. */

  function ropeSegments(map) {
    const out = [];
    for (let tx = 0; tx < map.w; tx++) {
      let ty = 0;
      while (ty < map.h) {
        if (!map.isRope(tx, ty)) { ty++; continue; }
        const top = ty;
        while (ty < map.h && map.isRope(tx, ty)) ty++;
        out.push({ tx: tx, top: top, bottom: ty - 1 });
      }
    }
    return out;
  }

  function platformRuns(map) {
    const out = [];
    for (let ty = 0; ty < map.h; ty++) {
      let tx = 0;
      while (tx < map.w) {
        if (!map.isPlatform(tx, ty)) { tx++; continue; }
        const x0 = tx;
        while (tx + 1 < map.w && map.isPlatform(tx + 1, ty)) tx++;
        let designed = false;
        for (let x = x0; x <= tx; x++) if (map.isDesigned && map.isDesigned(x, ty)) designed = true;
        out.push({ x0: x0, x1: tx, y: ty, designed: designed });
        tx++;
      }
    }
    return out;
  }

  /* Held by something: rock beside either end (a ledge in a wall), or rock or
     another platform directly under any of it (it sits on something). */
  function anchored(map, run) {
    if (map.isSolid(run.x0 - 1, run.y) || map.isSolid(run.x1 + 1, run.y)) return true;
    for (let x = run.x0; x <= run.x1; x++) {
      if (map.isSolid(x, run.y + 1) || map.isPlatform(x, run.y + 1)) return true;
    }
    return false;
  }

  /* A platform nobody authored and nothing holds up: a repair rung, a step or
     a bridge that was dropped into open air. */
  function floatingRungs(map) {
    const out = [];
    const runs = platformRuns(map);
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].designed) continue;
      if (!anchored(map, runs[i])) out.push(runs[i]);
    }
    return out;
  }

  /* A rope must be tied to rock at the top and hang to somewhere a body can
     stand (or into water) at the bottom. */
  function orphanRopes(map) {
    const out = [];
    const segs = ropeSegments(map);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      let tied = false;
      for (let dx = -1; dx <= 1 && !tied; dx++) {
        if (map.isSolid(s.tx + dx, s.top - 1)) tied = true;
        if (dx && map.isSolid(s.tx + dx, s.top)) tied = true;
      }
      let foot = map.isSolid(s.tx, s.bottom + 1) || map.isWater(s.tx, s.bottom + 1);
      for (let dx = -1; dx <= 1 && !foot; dx++) {
        for (let r = s.bottom - 1; r <= s.bottom + 2 && !foot; r++) {
          if (standable(map, s.tx + dx, r)) foot = true;
        }
      }
      if (!tied || !foot) out.push({ tx: s.tx, top: s.top, bottom: s.bottom, tied: tied, foot: foot });
    }
    return out;
  }

  /* Ladders: stacks of undesigned rungs (runs three tiles wide or less), each
     within three rows of the next and sharing a column with it. A ladder is whole when
     its bottom rung can be hopped onto from a floor (a standable cell no more
     than two rows under its top) and its top rung leads onto something that is
     not the ladder (a standable cell up to two rows above it). */
  function halfLadders(map) {
    const rungs = platformRuns(map).filter(function (r) {
      return !r.designed && r.x1 - r.x0 <= 2;
    });
    const inStack = new Array(rungs.length).fill(-1);
    const stacks = [];
    for (let i = 0; i < rungs.length; i++) {
      if (inStack[i] >= 0) continue;
      const stack = [i];
      inStack[i] = stacks.length;
      for (let s = 0; s < stack.length; s++) {
        const a = rungs[stack[s]];
        for (let j = 0; j < rungs.length; j++) {
          if (inStack[j] >= 0) continue;
          const b = rungs[j];
          const dy = Math.abs(a.y - b.y);
          if (dy < 1 || dy > 3) continue;
          // A ladder's rungs share columns; a ledge beside a step is not one.
          if (b.x1 < a.x0 || b.x0 > a.x1) continue;
          inStack[j] = stacks.length;
          stack.push(j);
        }
      }
      stacks.push(stack.map(function (k) { return rungs[k]; }));
    }

    const own = function (stack, tx, row) {
      for (let i = 0; i < stack.length; i++) {
        const r = stack[i];
        if (row + 1 === r.y && tx >= r.x0 && tx <= r.x1) return true;
      }
      return false;
    };
    const out = [];
    for (let s = 0; s < stacks.length; s++) {
      const stack = stacks[s];
      if (stack.length < 2) continue;
      let bottom = stack[0], top = stack[0];
      for (let i = 1; i < stack.length; i++) {
        if (stack[i].y > bottom.y) bottom = stack[i];
        if (stack[i].y < top.y) top = stack[i];
      }
      let base = false;
      for (let x = bottom.x0 - 2; x <= bottom.x1 + 2 && !base; x++) {
        for (let r = bottom.y; r <= bottom.y + 2 && !base; r++) {
          if (standable(map, x, r) && !own(stack, x, r)) base = true;
        }
      }
      let lip = false;
      for (let x = top.x0 - 3; x <= top.x1 + 3 && !lip; x++) {
        for (let r = top.y - 3; r <= top.y - 1 && !lip; r++) {
          if (standable(map, x, r) && !own(stack, x, r)) lip = true;
        }
      }
      if (!base || !lip) out.push({ x: bottom.x0, bottom: bottom.y, top: top.y, base: base, lip: lip });
    }
    return out;
  }

  /* A free-standing column of rock one tile wide, two or more tall, standing
     on the floor with air on both sides and nothing on top of it: the support
     pass's old answer to a ledge, and a wall in whatever corridor it stands in. */
  function pillarsInCorridor(map) {
    const out = [];
    for (let tx = 1; tx < map.w - 1; tx++) {
      let ty = 0;
      while (ty < map.h) {
        const lone = map.isSolid(tx, ty) && !map.isSolid(tx - 1, ty) && !map.isSolid(tx + 1, ty);
        if (!lone) { ty++; continue; }
        const top = ty;
        while (ty < map.h && map.isSolid(tx, ty) && !map.isSolid(tx - 1, ty) && !map.isSolid(tx + 1, ty)) ty++;
        const bottom = ty - 1;
        if (bottom - top + 1 >= 2 && map.isSolid(tx, bottom + 1) && top > 0 && !map.isSolid(tx, top - 1)) {
          out.push({ tx: tx, top: top, bottom: bottom });
        }
      }
    }
    return out;
  }

  function audit(map) {
    return {
      floatingRungs: floatingRungs(map),
      orphanRopes: orphanRopes(map),
      halfLadders: halfLadders(map),
      pillarsInCorridor: pillarsInCorridor(map)
    };
  }

  /* --- which floors exist --------------------------------------------------- */

  /* The kind of floor the game loads at a depth, asked the way the scene asks
     it: DS.Acts when the act system is present, the old single final boss
     otherwise. */
  function kindForDepth(depth) {
    if (DS.Acts && DS.Acts.isBossDepth) return DS.Acts.isBossDepth(depth) ? 'boss' : 'normal';
    return depth >= (DS.C.FINAL_DEPTH || 10) ? 'boss' : 'normal';
  }

  function finalDepth() { return DS.C.FINAL_DEPTH || 30; }

  function buildLevel(seed, depth, kind) {
    return DS.LevelGen.build(DS.makeRng(seed), depth, kind || kindForDepth(depth));
  }

  /* Everything the gate wants to know about one floor. */
  function check(level) {
    const out = { ok: false, reach: null, doorTx: null, pockets: [], traps: [], audit: null };
    if (!level || !level.spawns || !level.spawns.player) { out.reason = 'no spawn'; return out; }
    const reach = solve(level.map, level.spawns.player);
    const doorTx = doorColumn(level.spawns);
    out.reach = reach;
    out.doorTx = doorTx;
    out.ok = reach.ok && doorTx != null && reach.maxX >= doorTx;
    if (reach.ok && doorTx != null) out.pockets = pocketsOf(level.map, reach, doorTx);
    out.traps = trapColumns(level.map);
    out.audit = audit(level.map);
    return out;
  }

  /* --- drawing --------------------------------------------------------------- */

  function dump(map, reach, spawn, x0, x1) {
    const lines = [];
    const y0 = 0;
    const y1 = map.h - 1;
    const from = Math.max(0, x0 == null ? 0 : x0);
    const to = Math.min(map.w - 1, x1 == null ? map.w - 1 : x1);
    lines.push('    cols ' + from + '-' + to + '   = platform  + designed platform  - unreached  | rope');
    for (let ty = y0; ty <= y1; ty++) {
      let line = String(ty).padStart(2, ' ') + '  ';
      for (let tx = from; tx <= to; tx++) {
        const t = map.get(tx, ty);
        const seen = reach.seen && reach.seen.has(tx + ',' + ty);
        if (t === TILE.WALL) line += '#';
        else if (t === TILE.PLATFORM) {
          const onIt = reach.seen && reach.seen.has(tx + ',' + (ty - 1));
          line += !onIt ? '-' : (map.isDesigned(tx, ty) ? '+' : '=');
        }
        else if (t === TILE.SPIKE) line += '^';
        else if (t === TILE.DOOR) line += 'D';
        else if (t === TILE.DEATHSPIKE) line += 'X';
        else if (t === TILE.WATER) line += '~';
        else if (t === TILE.ROPE) line += '|';
        else line += seen ? '.' : ' ';
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  return {
    DS: DS, T: T, stats: stats,
    standable: standable, solve: solve, escapesOf: escapesOf, pocketsOf: pocketsOf,
    doorColumn: doorColumn, drownedSpikes: drownedSpikes, trapColumns: trapColumns,
    ropeSegments: ropeSegments, platformRuns: platformRuns,
    floatingRungs: floatingRungs, orphanRopes: orphanRopes,
    halfLadders: halfLadders, pillarsInCorridor: pillarsInCorridor, audit: audit,
    kindForDepth: kindForDepth, finalDepth: finalDepth, buildLevel: buildLevel,
    check: check, dump: dump
  };
}

/* A fresh game sandbox and the checker bound to it. */
function open() { return create(loadGame()); }

module.exports = {
  open: open, loadGame: loadGame, create: create,
  FILES: FILES, GAME_STUBS: GAME_STUBS, ROOT: ROOT
};
