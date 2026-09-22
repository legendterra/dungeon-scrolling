/* Can the hero actually get there?

   One owner for one question: standing here, which cells can I reach? Every
   answer below is derived from the same constants the character runs on
   (items/inventory.js BASE for speed and jump velocity, DS.C for gravity,
   entities/player.js for the air jump, the 8x14 body box and the 0.14 air
   friction), so a level that passes this pass is a level the hero can finish.

   Why this exists: the terrain generators each grew their own safety net, and
   the carved-floor one judged the level with a hand-written move model --
   "three tiles across, three rows up, at the same time" -- which is more
   athletic than the character. It also ran BEFORE world/generator.js's support
   pass, so the pillars and shelves that pass builds could wall a corridor off
   afterwards with nobody left to notice. A pillar holding a ledge five rows up
   is honest terrain; a pillar holding a ledge five rows up with no way onto it
   is a dead run.

   Two rules, applied once, after all terrain is final:
     - every step up taller than the free rise gets rungs beside it (a climb the
       player can make, on the approach side);
     - the exit column must be in reach of the spawn; where it is not, a step is
       placed at the frontier, then a passage is cut, and if neither fits, the
       floor the hero is standing on is simply extended.

   The last of those three is what makes this a guarantee rather than a
   heuristic: it can always be done, so the repair loop always makes progress
   and never walks away from a level it could not finish.

   Pure tile queries: this touches no entity, no texture and no Three.js. */

window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const T = DS.C.TILE;
  const TILE = DS.TILE;
  const M = DS.M;

  /* --- the hero's move set -------------------------------------------------- */

  const BOX_W = 8;         // Ent.make(x, y - 14, 8, 14)
  const BOX_H = 14;
  const SPEED = 1.45;      // BASE.moveSpeed, unarmoured
  const JUMP = 5.3;        // BASE.jumpVel
  const AIR = 0.92;        // the air jump's velocity multiplier
  const MAX_AIR = 1;       // AIR_JUMPS
  const G = DS.C.GRAVITY;
  const MAX_FALL = DS.C.MAX_FALL;
  const FRAMES = 96;       // a hop still airborne after this never lands

  const MAX_HOP = 5;       // columns a hop is even considered over
  const MAX_DOWN = 3;      // rows a hop is even considered over
  const MAX_DROP = 26;     // rows a walk-off drop is followed
  const MAX_RISE = 2;      // rows one jump clears unaided
  const SWIM = 3;          // cells a body in water moves in one beat

  const CEIL_ROW = 3;      // nothing in this game is walked above this row

  /* The air jump can be spent on any frame, and the three timings below cover
     what it buys: saved for the apex it is the tallest hop the hero owns, spent
     late it is the widest, and not spent at all it is the cheapest. */
  const AIR_TIMINGS = [-1, 15, 30];

  /* The feet of a body standing on the surface tile at `row` rest on that tile's
     top edge, so the empty cell it occupies is row - 1 and its box hangs from
     feetY(row) - BOX_H. Both directions of that convention live here so the
     generator, the hop model below and the QA solver cannot drift apart. */
  function feetY(row) { return (row + 1) * T; }

  /* --- tile queries --------------------------------------------------------- */

  function boxHitsWall(map, x, y) {
    const x0 = Math.floor(x / T), x1 = Math.floor((x + BOX_W - 0.01) / T);
    const y0 = Math.floor(y / T), y1 = Math.floor((y + BOX_H - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (map.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  /* Is the cell the hero's body would occupy empty, with nothing in the way? */
  function clearCell(map, tx, ty) {
    if (map.isBlocked(tx, ty) || map.isSpike(tx, ty)) return false;
    return !boxHitsWall(map, tx * T, feetY(ty) - BOX_H);
  }

  /* Can the hero stand here: an empty body cell with a floor under its feet. */
  function standable(map, tx, ty) {
    if (tx < 1 || tx >= map.w - 1 || ty < 1 || ty >= map.h - 1) return false;
    if (!clearCell(map, tx, ty)) return false;
    return map.isSolid(tx, ty + 1) || map.isPlatform(tx, ty + 1);
  }

  /* --- hops ------------------------------------------------------------------

     A hop is a vertical profile plus a horizontal decision. The profile is the
     jump, optionally cut short and re-armed by the air jump on some frame; the
     decision is that the player steers toward the column they are aiming for and
     lets go of the stick when they are over it, which the 0.14 air friction
     makes honest (a body at full tilt stops inside half a tile of letting go).

     So a hop is possible when the feet, after rising however high the profile
     takes them, come back down to the target row while the body is over the
     target column, without ever touching rock -- nothing more athletic than
     that, and nothing less. */

  const profiles = {};

  function trajectory(dx, dy, airAt) {
    const key = dx + ':' + dy + ':' + airAt;
    if (profiles[key] !== undefined) return profiles[key];

    const xGoal = dx * T, yGoal = dy * T;
    let x = 0, y = 0, vy = -JUMP, airLeft = MAX_AIR;
    const pts = [[0, 0, -JUMP]];

    for (let f = 0; f < FRAMES; f++) {
      if (airLeft > 0 && f === airAt) { vy = -JUMP * AIR; airLeft--; }
      vy = Math.min(vy + G, MAX_FALL);
      y += vy;
      const want = xGoal - x;
      if (want > 1) x += Math.min(SPEED, want);
      else if (want < -1) x -= Math.min(SPEED, -want);
      pts.push([x, y, vy]);
      if (vy > 0 && y >= yGoal) {
        // Only a landing that is really over the aimed-for column counts, and
        // only if the steer finished in time to be there.
        profiles[key] = Math.abs(x - xGoal) < 1.5 ? pts : null;
        return profiles[key];
      }
      if (y > yGoal + 3 * T) break;              // fell well past the target
    }
    profiles[key] = null;
    return null;
  }

  /* The [dx, dy] shapes worth simulating at all, in vacuum. Nothing in a map
     can make an impossible hop possible, so this is the candidate list. */
  const HOPS = (function () {
    const out = [];
    for (let dx = -MAX_HOP; dx <= MAX_HOP; dx++) {
      for (let dy = -MAX_HOP; dy <= MAX_DOWN; dy++) {
        if (!dx && !dy) continue;
        for (let t = 0; t < AIR_TIMINGS.length; t++) {
          if (trajectory(dx, dy, AIR_TIMINGS[t])) { out.push([dx, dy]); break; }
        }
      }
    }
    return out;
  })();

  /* A platform the descent would land on instead of the intended floor. */
  function intercepts(map, px, fromFeet, toFeet, ownRow) {
    const x0 = Math.floor(px / T), x1 = Math.floor((px + BOX_W - 0.01) / T);
    const r0 = Math.floor(fromFeet / T) + 1;
    const r1 = Math.floor(toFeet / T);
    for (let r = r0; r <= r1; r++) {
      if (r === ownRow) continue;
      for (let tx = x0; tx <= x1; tx++) {
        if (map.isPlatform(tx, r)) return true;
      }
    }
    return false;
  }

  function hopOk(map, fromTx, fromRow, dx, dy) {
    const toTx = fromTx + dx, toRow = fromRow + dy;
    if (toTx < 1 || toTx >= map.w - 1 || toRow < 1 || toRow >= map.h - 1) return false;

    const sx = fromTx * T + (T - BOX_W) / 2;
    const sy = feetY(fromRow) - BOX_H;
    const floorRow = toRow + 1;                 // the tile the hop lands on

    for (let t = 0; t < AIR_TIMINGS.length; t++) {
      const pts = trajectory(dx, dy, AIR_TIMINGS[t]);
      if (!pts) continue;

      let prevFeet = feetY(fromRow);
      let clean = true;
      for (let i = 1; i < pts.length; i++) {
        const px = sx + pts[i][0], py = sy + pts[i][1], vy = pts[i][2];
        const feet = py + BOX_H;
        const landed = vy > 0 && feet >= feetY(toRow);
        if (!landed && boxHitsWall(map, px, py)) { clean = false; break; }
        if (vy > 0 && intercepts(map, px, prevFeet, feet, floorRow)) { clean = false; break; }
        prevFeet = feet;
      }
      if (clean) return true;
    }
    return false;
  }

  /* Every cell a step, a hop or a walk-off drop can leave this one for. */
  function movesFrom(map, tx, ty) {
    const out = [];

    for (let i = 0; i < HOPS.length; i++) {
      const dx = HOPS[i][0], dy = HOPS[i][1];
      const nx = tx + dx, ny = ty + dy;
      if (!standable(map, nx, ny)) continue;
      // A single row down or level is a step, not a jump.
      if (Math.abs(dx) <= 1 && dy >= 0) { out.push([nx, ny]); continue; }
      if (hopOk(map, tx, ty, dx, dy)) out.push([nx, ny]);
    }

    // Walking off an edge and dropping to whatever the column offers below.
    for (let dx = -MAX_HOP; dx <= MAX_HOP; dx++) {
      const nx = tx + dx;
      if (nx < 1 || nx >= map.w - 1) continue;
      for (let y = ty + 1; y < map.h - 1 && y - ty <= MAX_DROP; y++) {
        if (standable(map, nx, y)) { out.push([nx, y]); break; }
        if (map.isSolid(nx, y)) break;
      }
    }

    /* Swimming. A body in water is not standing on anything: it turns, rises
       and sinks at will, which is what makes a flooded hall a route instead of
       a wall. Without this the only honest reading of the level was "the hero
       cannot get past the pillar", and the repair pass dutifully cut one. */
    if (map.isWater(tx, ty)) {
      for (let dx = -SWIM; dx <= SWIM; dx++) {
        for (let dy = -SWIM; dy <= SWIM; dy++) {
          if (!dx && !dy) continue;
          const nx = tx + dx, ny = ty + dy;
          if (nx < 1 || nx >= map.w - 1 || ny < 1 || ny >= map.h - 1) continue;
          if (!map.isWater(nx, ny) || !clearCell(map, nx, ny)) continue;
          out.push([nx, ny]);
        }
      }
    }
    return out;
  }

  function surfaceCell(map, spawn) {
    const tx = M.clamp(Math.floor(spawn.x / T), 1, map.w - 2);
    let ty = M.clamp(Math.floor(spawn.y / T), 1, map.h - 2);
    while (ty < map.h - 1 && !standable(map, tx, ty)) ty++;
    if (standable(map, tx, ty)) return [tx, ty];
    // A spawn dropped into water is a body in water, which is a fine place to
    // start from: the flood just has to know it can swim.
    if (map.isWater(tx, ty) && clearCell(map, tx, ty)) return [tx, ty];
    return null;
  }

  /* Flood the floor from a spawn cell. Returns null when there is nowhere to
     stand, which callers treat as "not my problem" rather than "unreachable". */
  function reachable(map, spawn) {
    const start = surfaceCell(map, spawn);
    if (!start) return null;

    const seen = new Set([start[0] + ',' + start[1]]);
    const queue = [start];
    let best = start;

    while (queue.length) {
      const cell = queue.pop();
      const moves = movesFrom(map, cell[0], cell[1]);
      for (let i = 0; i < moves.length; i++) {
        const k = moves[i][0] + ',' + moves[i][1];
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(moves[i]);
      }
      /* The frontier is the furthest cell to the right, and among those the
         lowest - the one a player would actually be standing on. */
      if (cell[0] > best[0] || (cell[0] === best[0] && cell[1] > best[1])) best = cell;
    }
    return { seen: seen, maxX: best[0], front: best, start: start };
  }

  function doorColumn(spawns) {
    if (!spawns) return null;
    if (spawns.doorTx != null) return spawns.doorTx;
    if (spawns.door) return Math.floor(spawns.door.x / T);
    return null;
  }

  /* The surface tile row of a column - the rock the player walks on - or -1 for
     a column with no floor at all. groundBelow skips a roof first, which is what
     makes this right in a cave (from row 0 the first solid is the ceiling). */
  function surfaceRow(map, tx) {
    if (tx < 0 || tx >= map.w) return -1;
    const y = map.groundBelow(tx);
    if (y >= map.pixelH) return -1;
    const row = Math.floor(y / T);
    return map.isBlocked(tx, row) ? row : -1;
  }

  /* --- the climb rule ------------------------------------------------------- */

  const CLIMB_STEP = 2;    // rows between rungs
  const RUNG_W = 2;        // tiles of landing room each rung offers

  /* A rung is a platform tile, and only ever in empty air: nothing authored is
     overwritten to make a climb work. Both the tile and the cell the body would
     stand in above it have to be clear - a rung tucked under an existing ledge
     is scenery, not a step, and that is the one way this rule silently did
     nothing. Two tiles of landing room is what a hop wants; one is enough when
     the level left no room for more. */
  function rungIn(map, tx, row, w) {
    if (row <= CEIL_ROW || tx < 1) return false;
    for (let width = w; width >= 1; width--) {
      let fits = true;
      for (let i = 0; i < width && fits; i++) {
        const x = tx + i;
        if (x < 1 || x >= map.w - 1) fits = false;
        else if (map.get(x, row) !== TILE.EMPTY || map.isSpike(x, row)) fits = false;
        else if (!clearCell(map, x, row - 1)) fits = false;
      }
      if (!fits) continue;
      for (let i = 0; i < width; i++) map.set(tx + i, row, TILE.PLATFORM);
      return true;
    }
    return false;
  }

  function rung(map, tx, row) { return rungIn(map, tx, row, RUNG_W); }

  /* The column asked for first, then the ones beside it: a level that already
     built its own steps two tiles wide leaves no room directly under them. */
  function placeRung(map, tx, row) {
    if (rung(map, tx, row)) return true;
    for (let d = 1; d <= 2; d++) {
      if (rung(map, tx - d, row)) return true;
      if (rung(map, tx + d, row)) return true;
    }
    return false;
  }

  /* Rungs beside every cliff the hero cannot take in one jump.

     The ladder is built from the cliff TOP downward, because that is the end
     that has to line up: the highest rung sits level with the ledge, so walking
     off it is a step, and each rung below is exactly CLIMB_STEP under the last,
     so climbing it is a hop the model above already accepts. */
  function ensureClimbs(map) {
    let rungs = 0;
    for (let tx = 3; tx < map.w - 1; tx++) {
      const here = surfaceRow(map, tx);
      const prev = surfaceRow(map, tx - 1);
      if (here < 0 || prev < 0) continue;
      const rise = prev - here;
      if (rise <= MAX_RISE) continue;
      // A cliff whose foot is under water is climbed by swimming, not by rungs.
      if (map.isWater(tx - 1, prev - 1)) continue;

      for (let row = here; row <= prev - 2; row += CLIMB_STEP) {
        if (placeRung(map, tx - 2, row)) rungs++;
      }
    }
    return rungs;
  }

  /* Every ledge the hero would have to stand on if the air jump did not exist.

     A cliff of solid rock is a wall and gets the ladder above; a LEDGE is a
     platform tile, and a platform three rows above its own floor is the shape
     that reads as "I cannot get up there" - the hero has to spend the air jump
     to reach it, and a level should not open with a demand like that. So each
     ledge is walked down to the surface under it and, if the gap is taller than
     one jump, a rung is placed between them: two rows, then two more, until the
     ledge is ordinary. Only empty air is written to, and only a small gap is
     stepped in: a ledge a long way up is a climb the level built on purpose,
     with its own platforms leading to it, and the rung rule has no business
     paving over that. */
  const STEP_GAP = MAX_RISE + 2;   // the tallest gap this rule will step in

  function ensureLedges(map) {
    let rungs = 0;
    for (let tx = 2; tx < map.w - 1; tx++) {
      let below = -1;
      for (let ty = map.h - 2; ty > CEIL_ROW; ty--) {
        if (!standable(map, tx, ty)) continue;
        const gap = below - ty;
        if (below > 0 && gap > MAX_RISE && gap <= STEP_GAP &&
            map.isPlatform(tx, ty + 1) && !map.isWater(tx, ty)) {
          for (let f = below - CLIMB_STEP; f > ty; f -= CLIMB_STEP) {
            if (placeRung(map, tx, f + 1)) rungs++;
          }
        }
        below = ty;
      }
    }
    return rungs;
  }

  /* --- the exit rule -------------------------------------------------------- */

  /* Open a walking passage instead of giving up: clear the rock the hero would
     walk through, for a few columns toward the door, leaving the floor under it
     alone. What is left reads as a tunnel, which is what a dungeon answers a
     sealed corridor with. */
  function cut(map, fx, fy) {
    let opened = false;
    for (let d = 1; d <= 6; d++) {
      const x = fx + d;
      if (x < 1 || x >= map.w - 1) break;
      let barrier = false;
      for (let y = fy - 2; y <= fy + 1; y++) if (map.isSolid(x, y)) barrier = true;
      if (!barrier) { if (opened) break; else continue; }
      for (let y = fy - 4; y <= fy; y++) {
        if (map.isSolid(x, y)) map.set(x, y, TILE.EMPTY);
        if (map.isSpike(x, y)) map.set(x, y, TILE.EMPTY);
      }
      opened = true;
    }
    return opened;
  }

  /* Last resort, and the reason this pass is a guarantee: extend the floor the
     hero is already standing on, two tiles at a time, toward the door. The
     surface is the same rock they are on, one row down from their feet, so the
     extension is a floor rather than a prop and stepping onto it is a step. */
  function bridge(map, fx, fy) {
    for (let d = 1; d <= 3; d++) {
      const x = fx + d;
      if (x < 1 || x >= map.w - 2) return false;
      if (map.isSolid(x, fy)) map.set(x, fy, TILE.EMPTY);
      if (map.isSpike(x, fy)) map.set(x, fy, TILE.EMPTY);
      if (!map.isSolid(x, fy + 1)) map.set(x, fy + 1, TILE.PLATFORM);
    }
    return true;
  }

  /* A step the hero can actually take: a two tile ledge placed ahead, level or
     a row or two up, accepted only once the hop model agrees it can be reached.
     A ledge the hero cannot get onto is put back rather than left in the level. */
  const CANDIDATES = [
    [2, -2], [3, -2], [2, -1], [3, -1], [2, 0], [3, 0],
    [1, -1], [1, -2], [2, 1], [3, 1], [4, -2], [4, 0]
  ];

  function step(map, fx, fy) {
    for (let i = 0; i < CANDIDATES.length; i++) {
      const dx = CANDIDATES[i][0], dy = CANDIDATES[i][1];
      const x = fx + dx, y = fy + dy;
      if (x < 1 || x + 1 >= map.w - 1 || y <= CEIL_ROW || y >= map.h - 1) continue;
      if (!clearCell(map, x, y) || !clearCell(map, x + 1, y)) continue;
      if (map.isSpike(x, y) || map.isSpike(x + 1, y)) continue;
      for (let k = 0; k < RUNG_W; k++) map.set(x + k, y + 1, TILE.PLATFORM);
      if (hopOk(map, fx, fy, dx, dy)) return true;
      for (let k = 0; k < RUNG_W; k++) map.set(x + k, y + 1, TILE.EMPTY);
    }
    return false;
  }

  const BASE_REPAIRS = 6;    // repairs allowed before a level is called stuck

  /* The guarantee. Called once, after every terrain pass has finished.

     Each pass through the loop either finds the exit or makes the map one step
     friendlier, so it cannot spin: step, then cut, then bridge. Only when all
     three are impossible (there is no room left to build in, which means the
     frontier is against the sealed edge of the map) does the level give up. */
  function ensureExit(map, spawns) {
    if (!map || !spawns || !spawns.player) return { ok: false, reason: 'no spawn' };
    const doorTx = doorColumn(spawns);
    if (doorTx == null) return { ok: false, reason: 'no door' };

    let rungs = ensureClimbs(map);
    rungs += ensureLedges(map);
    const maxRepairs = Math.max(BASE_REPAIRS, Math.min(32, Math.floor(map.w / 3)));
    const trace = [];
    let repairs = 0;

    for (; repairs <= maxRepairs; repairs++) {
      const reach = reachable(map, spawns.player);
      if (!reach) return { ok: false, reason: 'no floor at spawn', rungs: rungs };
      if (reach.maxX >= doorTx) {
        return { ok: true, rungs: rungs, repairs: repairs, maxX: reach.maxX, trace: trace };
      }

      const at = reach.front[0] + ',' + reach.front[1];
      const did = step(map, reach.front[0], reach.front[1]) ? 'step'
                : (cut(map, reach.front[0], reach.front[1]) ? 'cut'
                : (bridge(map, reach.front[0], reach.front[1]) ? 'bridge' : null));
      if (!did) {
        return { ok: false, reason: 'no way forward', rungs: rungs, repairs: repairs, trace: trace };
      }
      trace.push(at + ' -> ' + did);
    }
    return { ok: false, reason: 'gave up', rungs: rungs, repairs: repairs, trace: trace };
  }

  DS.Reach = {
    reachable: reachable,
    ensureExit: ensureExit,
    ensureClimbs: ensureClimbs,
    standable: standable,
    surfaceRow: surfaceRow,
    doorColumn: doorColumn,
    feetY: feetY,
    MAX_RISE: MAX_RISE,
    BOX_W: BOX_W,
    BOX_H: BOX_H
  };
})(window.DS);
