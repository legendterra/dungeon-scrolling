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

  /* Ropes, as the move model sees them.

     The hero grabs a rope on contact and rides it up or down at ROPE_CLIMB
     (entities/player.js), which mountain shafts have been built around since the
     day the tile was added -- and this model did not know it, so a shaft whose
     only route was a rope read as a wall and the repair pass paved it with
     platforms. A rope is a two-way edge between the cells at its foot and the
     cells at its head: anything you can stand on within a body's reach of the
     bottom end connects to anything you can stand on within reach of the top.

     Rebuilt once per flood rather than cached per map: the repair passes edit
     tiles, and a rope's ends depend on which cells are standable today. */
  let ropeGraph = null;

  function buildRopes(map) {
    const graph = new Map();
    const link = function (a, b) {
      let list = graph.get(a);
      if (!list) { list = []; graph.set(a, list); }
      if (list.indexOf(b) < 0) list.push(b);
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
          for (let row = bottom - 2; row <= bottom + 2; row++) {
            if (standable(map, x, row)) feet.push(x + ',' + row);
          }
          for (let row = top - 2; row <= top + 2; row++) {
            if (standable(map, x, row)) heads.push(x + ',' + row);
          }
        }
        for (let i = 0; i < feet.length; i++) {
          for (let j = 0; j < heads.length; j++) {
            link(feet[i], heads[j]);
            link(heads[j], feet[i]);
          }
        }
      }
    }
    return graph;
  }

  /* Every cell a step, a hop or a walk-off drop can leave this one for. */
  function movesFrom(map, tx, ty) {
    const out = [];

    if (ropeGraph) {
      const list = ropeGraph.get(tx + ',' + ty);
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const c = list[i].split(',');
          out.push([Number(c[0]), Number(c[1])]);
        }
      }
    }

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
    ropeGraph = buildRopes(map);
    const start = surfaceCell(map, spawn);
    if (!start) return null;

    const seen = new Set([start[0] + ',' + start[1]]);
    const queue = [start];
    /* Every edge the flood walks, as flat [fromTx, fromTy, toTx, toTy] groups.
       The flood has to expand each cell anyway, so recording what it found is
       free -- and the reverse question ("can I get back out of here?") needs
       exactly this edge set, inverted. */
    const edges = [];
    let best = start;

    while (queue.length) {
      const cell = queue.pop();
      const moves = movesFrom(map, cell[0], cell[1]);
      for (let i = 0; i < moves.length; i++) {
        edges.push(cell[0], cell[1], moves[i][0], moves[i][1]);
        const k = moves[i][0] + ',' + moves[i][1];
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(moves[i]);
      }
      /* The frontier is the furthest cell to the right, and among those the
         lowest - the one a player would actually be standing on. */
      if (cell[0] > best[0] || (cell[0] === best[0] && cell[1] > best[1])) best = cell;
    }
    return { seen: seen, maxX: best[0], front: best, start: start, edges: edges };
  }

  /* Where the player can still finish from.

     The move set is not symmetric: a drop is one way, and a climb is limited to
     what the hop model proves. So "the spawn can reach the door" and "the door
     is reachable from where I am standing" are different questions, and a level
     that only answers the first one ships pockets -- a spot you fall into, or
     walk into down a two row step, and never gets out of. No death, no door,
     just a run that quietly ends.

     Inverting the flood's own edges answers it exactly: seed the backwards walk
     with every cell at or past the door column, follow the edges in reverse,
     and what it does not reach is a pocket. */
  function escapes(map, reach, doorTx) {
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
      if (Number(k.slice(0, k.indexOf(','))) < doorTx) return;
      out.add(k);
      const c = k.split(',');
      queue.push(Number(c[0]), Number(c[1]));
    });
    while (queue.length) {
      const ty = queue.pop(), tx = queue.pop();
      const list = back.get(tx + ',' + ty);
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

  /* A face this tall is climbed by a rope, not by a ladder of platforms: the
     rope is one column of art hung against the cliff, where six rungs read as
     scaffolding in mid-air. The move model knows ropes (buildRopes above), so
     the route is real rather than decorative. */
  const ROPE_RISE = 4;     // rows of rise that earn a rope instead of rungs

  /* Hang a rope down a cliff face: the column beside the face, from the lip to
     one tile above the foot, so a body standing at the bottom is already
     overlapping it -- which is exactly how the grab works in player.js. Only
     empty cells are written to, and a column with anything but air in it is
     left alone (the caller falls back to rungs). */
  function ropeDown(map, tx, fromRow, toRow) {
    if (tx < 1 || tx >= map.w - 1 || fromRow <= CEIL_ROW || toRow <= fromRow) return false;
    for (let row = fromRow; row <= toRow; row++) {
      if (map.get(tx, row) !== TILE.EMPTY) return false;
    }
    for (let row = fromRow; row <= toRow; row++) map.set(tx, row, TILE.ROPE);
    return true;
  }

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
    if (rung(map, tx, row)) return tx;
    for (let d = 1; d <= 2; d++) {
      if (rung(map, tx - d, row)) return tx - d;
      if (rung(map, tx + d, row)) return tx + d;
    }
    return null;
  }

  /* Rungs beside every cliff the hero cannot take in one jump.

     The ladder is built from the cliff TOP downward, because that is the end
     that has to line up: the highest rung sits level with the ledge, so walking
     off it is a step, and each rung below is exactly CLIMB_STEP under the last,
     so climbing it is a hop the model above already accepts. */
  /* `placed` collects the rung tiles this pass wrote, as flat [tx, row] pairs,
     so the pass that knows what the hero can actually stand on can prune the
     ones that turn out to be scenery. */
  let ropeCount = 0;      // ropes hung this level; reported, never pruned

  function ensureClimbs(map, placed) {
    let rungs = 0;
    ropeCount = 0;
    for (let tx = 3; tx < map.w - 1; tx++) {
      const here = surfaceRow(map, tx);
      const prev = surfaceRow(map, tx - 1);
      if (here < 0 || prev < 0) continue;
      const rise = prev - here;
      if (rise <= MAX_RISE) continue;
      // A cliff whose foot is under water is climbed by swimming, not by rungs.
      if (map.isWater(tx - 1, prev - 1)) continue;

      if (rise >= ROPE_RISE && ropeDown(map, tx - 1, here, prev - 1)) {
        ropeCount++;
        continue;
      }

      for (let row = here; row <= prev - 2; row += CLIMB_STEP) {
        const at = placeRung(map, tx - 2, row);
        if (at == null) continue;
        rungs++;
        if (placed) placed.push(at, row);
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

  function ensureLedges(map, placed) {
    let rungs = 0;
    for (let tx = 2; tx < map.w - 1; tx++) {
      let below = -1;
      for (let ty = map.h - 2; ty > CEIL_ROW; ty--) {
        if (!standable(map, tx, ty)) continue;
        const gap = below - ty;
        if (below > 0 && gap > MAX_RISE && gap <= STEP_GAP &&
            map.isPlatform(tx, ty + 1) && !map.isWater(tx, ty)) {
          for (let f = below - CLIMB_STEP; f > ty; f -= CLIMB_STEP) {
            const at = placeRung(map, tx, f + 1);
            if (at == null) continue;
            rungs++;
            if (placed) placed.push(at, f + 1);
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
  function cut(map, fx, fy, put) {
    if (!put) put = defaultPut(map);
    let opened = false;
    for (let d = 1; d <= 6; d++) {
      const x = fx + d;
      if (x < 1 || x >= map.w - 1) break;
      let barrier = false;
      for (let y = fy - 2; y <= fy + 1; y++) if (map.isSolid(x, y)) barrier = true;
      if (!barrier) { if (opened) break; else continue; }
      for (let y = fy - 4; y <= fy; y++) {
        if (map.isSolid(x, y)) put(x, y, TILE.EMPTY);
        if (map.isSpike(x, y)) put(x, y, TILE.EMPTY);
      }
      opened = true;
    }
    return opened;
  }

  /* Last resort, and the reason this pass is a guarantee: extend the floor the
     hero is already standing on, two tiles at a time, toward the door. The
     surface is the same rock they are on, one row down from their feet, so the
     extension is a floor rather than a prop and stepping onto it is a step. */
  function bridge(map, fx, fy, put) {
    if (!put) put = defaultPut(map);
    for (let d = 1; d <= 3; d++) {
      const x = fx + d;
      if (x < 1 || x >= map.w - 2) return false;
      if (map.isSolid(x, fy)) put(x, fy, TILE.EMPTY);
      if (map.isSpike(x, fy)) put(x, fy, TILE.EMPTY);
      if (!map.isSolid(x, fy + 1)) put(x, fy + 1, TILE.PLATFORM);
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

  /* `dir` mirrors the candidates, because the exit rule only ever steps toward
     the door while a pocket has to be climbed out of on the side it was entered
     from. One implementation, two directions. */
  function step(map, fx, fy, put, dir) {
    if (!put) put = defaultPut(map);
    for (let i = 0; i < CANDIDATES.length; i++) {
      const dx = CANDIDATES[i][0] * (dir || 1), dy = CANDIDATES[i][1];
      const x = fx + dx, y = fy + dy;
      if (x < 1 || x + 1 >= map.w - 1 || y <= CEIL_ROW || y >= map.h - 1) continue;
      if (!clearCell(map, x, y) || !clearCell(map, x + 1, y)) continue;
      if (map.isSpike(x, y) || map.isSpike(x + 1, y)) continue;
      for (let k = 0; k < RUNG_W; k++) put(x + k, y + 1, TILE.PLATFORM);
      if (hopOk(map, fx, fy, dx, dy)) return true;
      for (let k = 0; k < RUNG_W; k++) put(x + k, y + 1, TILE.EMPTY);
    }
    return false;
  }

  /* --- repairs that can be taken back --------------------------------------- */

  function defaultPut(map) {
    return function (tx, ty, value) { map.set(tx, ty, value); };
  }

  /* Apply a repair, and keep it only if the level is no worse afterwards.

     Rock is load bearing. `cut` clears five rows at a time, so any walkway
     inside that band is deleted -- a repair meant to open a passage can sever
     the floor the hero is walking on, and the level arrives at the door with the
     hero stranded on the wrong side of a hole. That is not theoretical: it is
     what the first version of the pocket repair did to depth 9.

     So every repair writes through a journal, and is rolled back unless the hero
     can still reach at least as far, and stand in at least as many places, as
     before it. A refused repair costs a flood and nothing else. */
  function applyRepair(map, spawns, reach, make, accept) {
    const log = [];
    const put = function (tx, ty, value) {
      log.push(tx, ty, map.get(tx, ty));
      map.set(tx, ty, value);
    };
    if (!make(put)) return { ok: false, reach: reach };

    const next = reachable(map, spawns.player);
    const good = accept ? accept(next, reach) :
      (next && next.maxX >= reach.maxX && next.seen.size >= reach.seen.size);
    if (good) return { ok: true, reach: next };
    for (let i = log.length - 3; i >= 0; i -= 3) map.set(log[i], log[i + 1], log[i + 2]);
    return { ok: false, reach: reach };
  }

  const BASE_REPAIRS = 6;    // repairs allowed before a level is called stuck

  /* Last resort for a pocket nothing can climb out of: raise its floor.

     A platform in the offending cell means the hero standing there is one tile
     higher, which is the difference between a hole the run ends in and a block
     in the floor -- and unlike walling the entrance off, it cannot seal a route
     by accident. Accepted only if the cell really stops being standable and the
     door is no further away than it was. */
  function plug(map, tx, ty, put) {
    put(tx, ty, TILE.PLATFORM);
    return true;
  }

  /* Rungs nothing can stand on, removed.

     A rung is written into empty air, before anyone has asked whether the hero
     can get onto it -- and the greedy ladder above can leave a gap when a rung
     does not fit, which turns the rest of that ladder into decoration that
     reads as a climb. The flood is the whole move set, so a rung the flood never
     reached was never on any route: dropping it cannot make anything else
     unreachable, it only stops the level from promising a step that is not
     there. Both of a rung's two cells count, because the hero may be standing
     on either half of it. */
  function pruneRungs(map, placed, seen) {
    let gone = 0;
    for (let i = 0; i < placed.length; i += 2) {
      const tx = placed[i], row = placed[i + 1];
      if (seen.has(tx + ',' + (row - 1)) || seen.has((tx + 1) + ',' + (row - 1))) continue;
      if (map.get(tx, row) === TILE.PLATFORM) { map.set(tx, row, TILE.EMPTY); gone++; }
      if (map.get(tx + 1, row) === TILE.PLATFORM) { map.set(tx + 1, row, TILE.EMPTY); gone++; }
    }
    return gone;
  }

  const POCKET_BUDGET = 6;   // repairs before a level is called as stuck as it is

  /* Pockets: cells the hero can get INTO and not back OUT of.

     This is the shape that ends a run with no death to explain it -- step down
     into a hollow, and the only way on is a climb two rows taller than the jump.
     Repaired with the same verified step the exit rule uses (a ledge the hop
     model has already agreed to), then with a tunnel, so a repair is always
     something the player can really take. A pocket with no room beside it is
     left alone rather than walled off, and counted, so the number is reported
     instead of assumed. */
  function repairPockets(map, spawns, doorTx, first) {
    const hopeless = new Set();
    let reach = first || reachable(map, spawns.player);
    let fixed = 0, stuck = 0;

    for (let round = 0; round < POCKET_BUDGET && reach; round++) {
      const back = escapes(map, reach, doorTx);
      let pocket = null;
      reach.seen.forEach(function (k) {
        if (pocket || back.has(k) || hopeless.has(k)) return;
        const c = k.split(',');
        const tx = Number(c[0]), ty = Number(c[1]);
        /* Water is a way out on its own (the move model swims) and a killing
           floor is an ending the player chose; neither is a pocket. */
        if (map.isWater(tx, ty) || map.isDeath(tx, ty)) return;
        pocket = [tx, ty];
      });
      if (!pocket) return { fixed: fixed, stuck: stuck, left: 0 };

      /* Four ways out, tried in order: a step to the right, the same step
         mirrored, a tunnel, and finally raising the floor the pocket itself sits
         on. Each is verified and rolled back on its own, so a refusal costs
         nothing but the flood that judged it. */
      const key = pocket[0] + ',' + pocket[1];
      /* A plug raises one cell, so the flood loses that cell and gains the one a
         body now stands in above it. Anything worse than that trade is the plug
         sealing a corridor, and is refused. */
      const noneLeft = function (next) {
        return next && next.maxX >= reach.maxX &&
               !next.seen.has(key) && next.seen.size >= reach.seen.size - 2;
      };
      const ways = [
        { make: function (put) { return step(map, pocket[0], pocket[1], put); } },
        { make: function (put) { return step(map, pocket[0], pocket[1], put, -1); } },
        { make: function (put) { return cut(map, pocket[0], pocket[1], put); } },
        { make: function (put) { return plug(map, pocket[0], pocket[1], put); }, accept: noneLeft }
      ];
      let made = { ok: false, reach: reach };
      for (let w = 0; w < ways.length && !made.ok; w++) {
        made = applyRepair(map, spawns, reach, ways[w].make, ways[w].accept);
      }
      if (made.ok) {
        fixed++;
        reach = made.reach;
      } else {
        hopeless.add(key);
        stuck++;
      }
    }

    let left = 0;
    const back = escapes(map, reach, doorTx);
    reach.seen.forEach(function (k) {
      if (back.has(k)) return;
      const c = k.split(',');
      if (map.isWater(Number(c[0]), Number(c[1])) || map.isDeath(Number(c[0]), Number(c[1]))) return;
      left++;
    });
    return { fixed: fixed, stuck: stuck, left: left };
  }

  /* The guarantee. Called once, after every terrain pass has finished.

     Four questions, asked in rounds until all of them answer yes:
       1. is there a way up every cliff the level built (rungs);
       2. can the hero walk to the door, and if not, is the rock repaired until
          they can -- step, then cut, then bridge;
       3. are the steps that repair added usable, or scenery (prune);
       4. can the hero get back out of everywhere they can get into (pockets).

     Rounds, rather than one pass in a fixed order, because repairs are not
     monotone: a step placed in a one-tile corridor seals it, and a cut that
     opens a passage can delete the walkway inside its own band. Each repair is
     journaled and rolled back unless the flood says the level is no worse, but
     'no worse by the flood that judged it' is still a local judgement -- so the
     round ends by flooding again, and anything a round broke, the next round
     repairs. Three rounds is far past convergence in practice; a level that still
     fails is reported, not papered over. */
  function ensureExit(map, spawns) {
    if (!map || !spawns || !spawns.player) return { ok: false, reason: 'no spawn' };
    const doorTx = doorColumn(spawns);
    if (doorTx == null) return { ok: false, reason: 'no door' };

    const placed = [];
    const climbRungs = ensureClimbs(map, placed);
    const ledgeRungs = ensureLedges(map, placed);
    const rungs = climbRungs + ledgeRungs;
    const maxRepairs = Math.max(BASE_REPAIRS, Math.min(32, Math.floor(map.w / 3)));
    const trace = [];
    let repairs = 0;
    let reach = reachable(map, spawns.player);
    if (!reach) return { ok: false, reason: 'no floor at spawn', rungs: rungs };

    let deadRungs = 0, pocketCount = 0, stuck = 0, left = 0;
    let ok = false;

    for (let round = 0; round < 3 && !ok; round++) {
      /* The door first: step, then cut, then bridge, once per round of the loop
         above -- each repair verified and rolled back unless the flood agrees. */
      let gaveUp = null;
      while (repairs <= maxRepairs && reach.maxX < doorTx) {
        const fx = reach.front[0], fy = reach.front[1];
        const kinds = ['step', 'cut', 'bridge'];
        let used = null;
        for (let k = 0; k < kinds.length && !used; k++) {
          const kind = kinds[k];
          const made = applyRepair(map, spawns, reach, function (put) {
            if (kind === 'step') return step(map, fx, fy, put);
            if (kind === 'cut') return cut(map, fx, fy, put);
            return bridge(map, fx, fy, put);
          });
          if (made.ok) { used = kind; reach = made.reach; }
        }
        if (!used) { gaveUp = 'no way forward'; break; }
        trace.push(fx + ',' + fy + ' -> ' + used);
        repairs++;
      }
      if (gaveUp || reach.maxX < doorTx) break;

      /* Scenery out, then pockets out -- and ask the flood again afterwards, so
         the next round sees what these two did rather than what they meant. */
      deadRungs += pruneRungs(map, placed, reach.seen);
      reach = reachable(map, spawns.player);
      const pockets = repairPockets(map, spawns, doorTx, reach);
      pocketCount += pockets.fixed;
      stuck += pockets.stuck;
      left = pockets.left;
      reach = reachable(map, spawns.player);
      ok = reach.maxX >= doorTx && left === 0;
    }

    return {
      ok: ok, rungs: rungs, ropes: ropeCount,
      climbRungs: climbRungs, ledgeRungs: ledgeRungs,
      deadRungs: deadRungs, repairs: repairs,
      pockets: pocketCount, stuck: stuck, trapped: left,
      maxX: reach.maxX, trace: trace
    };
  }

  DS.Reach = {
    reachable: reachable,
    escapes: escapes,
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
